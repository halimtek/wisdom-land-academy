/*
 * Copies the files referenced by the database from local storage (BOOK_STORAGE_DIR)
 * to a PRIVATE Supabase Storage bucket, under their exact existing keys.
 *
 *   Review first:  npm run storage:migrate -- --dry-run --bucket file_uploads
 *   Then copy:     npm run storage:migrate -- --execute --bucket file_uploads
 *   Optional:      --report <path.json>   write a machine-readable report
 *
 * Guarantees (see scripts/lib/storage-migration.mjs):
 * - Database: read inside a READ ONLY transaction; no record is changed.
 * - Local files: only read; never modified or deleted. Unreferenced files are
 *   listed but not copied.
 * - Bucket: must exist and be private; existing objects are never overwritten
 *   (an existing object is accepted only if size and SHA-256 match).
 * - Every upload is downloaded back and verified (size + SHA-256).
 * - Safe to re-run after an interruption: verified objects are skipped.
 *
 * Exit code: 0 = everything referenced is (or would be) in the bucket and verified;
 * 1 = something needs attention (missing, invalid, conflict, failed); 2 = not run.
 */
import 'dotenv/config';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  REFERENCE_FIELDS, checkBucket, collectReferences, createStorageClient, inventoryLocal, migrateFiles, summarize,
} from './lib/storage-migration.mjs';

type Row = { table: string; field: string; kind: 'pdf' | 'image'; id: string; key: string | null };

function parseArgs(argv: string[]) {
  const args = { dryRun: false, execute: false, bucket: process.env.SUPABASE_STORAGE_BUCKET ?? '', report: '' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--execute') args.execute = true;
    else if (a === '--bucket') args.bucket = argv[++i] ?? '';
    else if (a === '--report') args.report = argv[++i] ?? '';
    else throw new Error(`Unknown option: ${a}`);
  }
  if (args.dryRun === args.execute) throw new Error('Choose exactly one of --dry-run or --execute.');
  if (!args.bucket) throw new Error('Set --bucket <name> (or SUPABASE_STORAGE_BUCKET).');
  return args;
}

async function readReferences(prisma: PrismaClient): Promise<Row[]> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    const [books, content, settings] = await Promise.all([
      tx.book.findMany({ select: { id: true, filePath: true, coverImagePath: true } }),
      tx.schoolContent.findMany({ select: { id: true, imagePath: true } }),
      tx.schoolSettings.findMany({ select: { id: true, logoImagePath: true, heroImagePath: true } }),
    ]);
    const records: Record<string, { id: string; [field: string]: string | null }[]> = { Book: books, SchoolContent: content, SchoolSettings: settings };
    return REFERENCE_FIELDS.flatMap(({ table, field, kind }) =>
      records[table].map((record) => ({ table, field, kind: kind as Row['kind'], id: record.id, key: record[field] ?? null })));
  });
}

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    console.error('Usage: npm run storage:migrate -- (--dry-run | --execute) --bucket <name> [--report <file.json>]');
    process.exit(2);
  }
  const root = process.env.BOOK_STORAGE_DIR;
  const { SUPABASE_URL, SUPABASE_SECRET_KEY } = process.env;
  if (!root || !path.isAbsolute(root)) { console.error('BOOK_STORAGE_DIR must be an absolute path.'); process.exit(2); }
  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) { console.error('SUPABASE_URL and SUPABASE_SECRET_KEY are required.'); process.exit(2); }

  console.log(`Mode: ${args.dryRun ? 'DRY RUN (nothing is uploaded)' : 'EXECUTE'} · bucket "${args.bucket}" · source ${root}\n`);

  const prisma = new PrismaClient();
  let rows: Row[];
  try { rows = await readReferences(prisma); } finally { await prisma.$disconnect(); }

  const { references, duplicates, invalid, totalRows } = collectReferences(rows);
  const local = await inventoryLocal(root, references);
  const counts = (field: string) => rows.filter((r) => `${r.table}.${r.field}` === field && r.key).length;

  console.log('Database references (read-only):');
  for (const { table, field } of REFERENCE_FIELDS) console.log(`  ${`${table}.${field}`.padEnd(30)} ${counts(`${table}.${field}`)}`);
  console.log(`  ${'total'.padEnd(30)} ${totalRows} references, ${references.length} distinct valid keys\n`);

  const totalBytes = local.ready.reduce((sum, f) => sum + f.size, 0);
  console.log('Local storage:');
  console.log(`  ready to copy (exists, type checked, SHA-256 computed): ${local.ready.length} files, ${mb(totalBytes)}`);
  console.log(`  missing on disk:            ${local.missing.length}`);
  console.log(`  invalid content:            ${local.invalidContent.length}`);
  console.log(`  invalid stored keys:        ${invalid.length}`);
  console.log(`  keys used by >1 record:     ${duplicates.length}`);
  console.log(`  unreferenced (NOT copied):  ${local.unreferenced.length}`);
  for (const m of local.missing) console.log(`    MISSING  ${m.key} (${m.refs.map((r) => `${r.table}.${r.field} ${r.id}`).join(', ')}): ${m.reason}`);
  for (const m of local.invalidContent) console.log(`    INVALID  ${m.key}: ${m.reason}`);
  for (const m of invalid) console.log(`    BAD KEY  ${m.key} (${m.refs.map((r) => `${r.table}.${r.field} ${r.id}`).join(', ')}): ${m.reason}`);
  for (const d of duplicates) console.log(`    SHARED   ${d.key} used by ${d.refs.map((r) => `${r.table}.${r.field} ${r.id}`).join(', ')} (copied once)`);
  for (const u of local.unreferenced) console.log(`    UNUSED   ${u.key} (${u.size} bytes, modified ${u.modified})`);
  console.log('');

  const client = createStorageClient({ url: SUPABASE_URL, secretKey: SUPABASE_SECRET_KEY, bucket: args.bucket });
  const bucket = await checkBucket(client, local.ready);
  console.log(`Bucket check: ${bucket.info.exists ? (bucket.info.public ? 'PUBLIC' : 'private') : 'missing'}`);
  for (const w of bucket.warnings) console.log(`  warning: ${w}`);
  for (const p of bucket.problems) console.log(`  STOP: ${p}`);
  if (bucket.problems.length) { console.log('\nNothing was uploaded.'); process.exit(2); }
  console.log('');

  const results = await migrateFiles(local.ready, client, { dryRun: args.dryRun, log: (line: string) => console.log(`  ${line}`) });
  const summary = summarize(results);
  console.log(`\nResult: ${Object.entries(summary).map(([k, v]) => `${k} ${v}`).join(' · ') || 'no files'}`);

  const attention = local.missing.length + local.invalidContent.length + invalid.length
    + (summary.conflict ?? 0) + (summary.failed ?? 0);
  if (args.report) {
    await writeFile(args.report, JSON.stringify({
      mode: args.dryRun ? 'dry-run' : 'execute', bucket: args.bucket, finishedAt: new Date().toISOString(),
      totals: { references: totalRows, distinctKeys: references.length, ready: local.ready.length, bytes: totalBytes },
      missing: local.missing, invalidContent: local.invalidContent, invalidKeys: invalid, duplicates, unreferenced: local.unreferenced,
      bucketInfo: bucket.info, warnings: bucket.warnings,
      results: results.map(({ key, status, detail, size }) => ({ key, status, detail, size })),
    }, null, 2));
    console.log(`Report written to ${args.report}`);
  }
  if (args.dryRun) console.log('Dry run: nothing was uploaded, no record or local file was changed.');
  console.log(attention ? `${attention} item(s) need attention.` : 'All referenced files are accounted for.');
  process.exit(attention ? 1 : 0);
}

main().catch((error) => {
  console.error('Migration stopped:', error instanceof Error ? error.message : error);
  process.exit(1);
});
