// Build-time guard for the Prisma Query Engine required by Vercel (rhel-openssl-3.0.x).
//
//   node scripts/verify-prisma-engine.mjs generated   (after `prisma generate`)
//   node scripts/verify-prisma-engine.mjs traced      (after `next build`)
//
// Fails the build with a clear message instead of deploying functions that crash
// with "Prisma Client could not locate the Query Engine for runtime ...".
import { existsSync, openSync, readSync, closeSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { GENERATED_CLIENT_DIR, engineFileName } from '../src/lib/prisma-engine.mjs';

const REQUIRED_TARGET = 'rhel-openssl-3.0.x';
const ENGINE = engineFileName(REQUIRED_TARGET);
const ENGINE_REL = `${GENERATED_CLIENT_DIR}/${ENGINE}`;
// Routes that must reach the database in production (book pages, PDFs, covers/images).
const CRITICAL_TRACES = ['library/books/[id]/page.js.nft.json', 'api/books/[id]/file/route.js.nft.json', 'api/site-media/[key]/route.js.nft.json'];

const root = process.cwd();
const fail = (message) => { console.error(`\n[verify-prisma-engine] FAILED: ${message}\n`); process.exit(1); };
const ok = (message) => console.log(`[verify-prisma-engine] OK: ${message}`);

function checkGenerated() {
  const file = path.join(root, ENGINE_REL);
  if (!existsSync(file)) {
    fail(`${ENGINE_REL} was not generated. Keep "${REQUIRED_TARGET}" in binaryTargets (prisma/schema.prisma) and run \`prisma generate\` before \`next build\`.`);
  }
  const { size } = statSync(file);
  const fd = openSync(file, 'r');
  const magic = Buffer.alloc(4);
  readSync(fd, magic, 0, 4, 0);
  closeSync(fd);
  if (!magic.equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])) || size < 1_000_000) fail(`${ENGINE_REL} is not a valid Linux engine (size ${size} bytes).`);
  const client = readFileSync(path.join(root, GENERATED_CLIENT_DIR, 'client.ts'), 'utf8');
  if (!client.includes(ENGINE)) fail(`${GENERATED_CLIENT_DIR}/client.ts does not reference ${ENGINE}, so output tracing would not ship it. Regenerate the client.`);
  ok(`${ENGINE_REL} present (${(size / 1048576).toFixed(1)} MB, ELF) and referenced for output tracing`);
}

function listTraces(dir) {
  return readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('.nft.json'));
}

function checkTraced() {
  const appDir = path.join(root, '.next/server/app');
  if (!existsSync(appDir)) fail('.next/server/app not found. Run this after `next build`.');
  const usesPrisma = [];
  const missing = [];
  for (const rel of listTraces(appDir)) {
    const traceFile = path.join(appDir, rel);
    const files = JSON.parse(readFileSync(traceFile, 'utf8')).files.map((f) => path.resolve(path.dirname(traceFile), f));
    if (!files.some((f) => f.includes(`${path.sep}${GENERATED_CLIENT_DIR.split('/').join(path.sep)}${path.sep}`))) continue;
    usesPrisma.push(rel);
    const engine = files.find((f) => f.endsWith(`${path.sep}${ENGINE}`));
    if (!engine || !existsSync(engine)) missing.push(rel);
  }
  for (const critical of CRITICAL_TRACES) {
    if (!usesPrisma.includes(critical)) fail(`${critical} does not include the generated Prisma client; the route layout changed or tracing broke.`);
  }
  if (missing.length) fail(`${missing.length} route(s) use Prisma but do not ship ${ENGINE}:\n  ${missing.join('\n  ')}`);
  ok(`${ENGINE} is in the output trace of all ${usesPrisma.length} routes that use Prisma (including ${CRITICAL_TRACES.length} critical routes)`);
}

const mode = process.argv[2];
if (mode === 'generated') checkGenerated();
else if (mode === 'traced') checkTraced();
else fail('usage: node scripts/verify-prisma-engine.mjs generated|traced');
