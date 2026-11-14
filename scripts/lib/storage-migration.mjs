// Core of the local-disk -> Supabase Storage migration (scripts/migrate-storage-to-supabase.ts).
// Plain JavaScript with injected I/O so tests/storage-migration.test.mjs can drive it.
//
// Safety rules enforced here:
// - Only files referenced by database records are copied, under their exact keys.
// - Existing bucket objects are never overwritten (x-upsert: false). An existing
//   object is accepted only if its size and SHA-256 match the local file.
// - Every upload is verified by downloading it back (size + SHA-256).
// - Local files are only read, never modified or deleted.
// - Re-running is safe: already-verified objects are skipped (resume).

import { createHash } from 'node:crypto';
import { createReadStream, openAsBlob } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { isSafeBookPath } from '../../src/lib/book-security.mjs';
import { isSafeSchoolImagePath } from '../../src/lib/school-content-security.mjs';

/**
 * @typedef {{ table: string, field: string, id: string }} Ref
 * @typedef {{ key: string, kind: string, refs: Ref[] }} Reference
 * @typedef {Reference & { absolutePath: string, size: number, sha256: string, contentType: string }} ReadyFile
 * @typedef {Reference & { reason: string, size?: number }} LocalProblem
 * @typedef {{ key: string, size: number, modified: string }} UnreferencedFile
 * @typedef {{ key: string, reason: string, refs: Ref[] }} InvalidKey
 * @typedef {{ key: string, status: 'would-upload' | 'uploaded' | 'already-present' | 'conflict' | 'failed', detail?: string, size?: number }} FileResult
 */

/** Database columns that reference stored files, and the kind of file each holds. */
export const REFERENCE_FIELDS = [
  { table: 'Book', field: 'filePath', kind: 'pdf' },
  { table: 'Book', field: 'coverImagePath', kind: 'image' },
  { table: 'SchoolContent', field: 'imagePath', kind: 'image' },
  { table: 'SchoolSettings', field: 'logoImagePath', kind: 'image' },
  { table: 'SchoolSettings', field: 'heroImagePath', kind: 'image' },
];

const CONTENT_TYPES = { pdf: 'application/pdf', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const SIGNATURES = {
  pdf: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  webp: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
};

const extensionOf = (key) => key.slice(key.lastIndexOf('.') + 1).toLowerCase();
export const contentTypeFor = (key) => CONTENT_TYPES[extensionOf(key)] ?? null;

/** Why a stored key cannot be migrated as-is, or null if it is acceptable. */
export function invalidKeyReason(key, kind) {
  if (typeof key !== 'string' || !isSafeBookPath(key)) return 'unsafe or malformed storage path';
  if (kind === 'pdf' && !/\.pdf$/.test(key)) return 'book file does not end in .pdf';
  if (kind === 'image' && !isSafeSchoolImagePath(key)) return 'image path is not school-content/<uuid>.(jpg|png|webp)';
  return null;
}

/**
 * Groups referencing rows by key.
 * @param {{ table: string, field: string, kind: 'pdf'|'image', id: string, key: string | null }[]} rows
 */
export function collectReferences(rows) {
  /** @type {Map<string, Reference>} */
  const byKey = new Map();
  /** @type {InvalidKey[]} */
  const invalid = [];
  for (const row of rows) {
    if (row.key === null || row.key === undefined || row.key === '') continue;
    const reason = invalidKeyReason(row.key, row.kind);
    const ref = { table: row.table, field: row.field, id: row.id };
    if (reason) { invalid.push({ key: String(row.key), reason, refs: [ref] }); continue; }
    const entry = byKey.get(row.key) ?? { key: row.key, kind: row.kind, refs: [] };
    if (entry.kind !== row.kind) invalid.push({ key: row.key, reason: `referenced both as ${entry.kind} and ${row.kind}`, refs: [ref] });
    entry.refs.push(ref);
    byKey.set(row.key, entry);
  }
  const references = [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
  const duplicates = references.filter((r) => r.refs.length > 1);
  return { references, duplicates, invalid, totalRows: rows.filter((r) => r.key).length };
}

/** SHA-256 (hex) and byte count of a local file, streamed. */
export async function hashFile(absolutePath) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(absolutePath)) { hash.update(chunk); size += chunk.length; }
  return { sha256: hash.digest('hex'), size };
}

async function readHead(absolutePath, bytes = 12) {
  const handle = await open(absolutePath, 'r');
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally { await handle.close(); }
}

/** Lists every regular file under root as storage-style keys ("a/b.png"). */
export async function listLocalFiles(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => path.relative(root, path.join(e.parentPath ?? e.path, e.name)).split(path.sep).join('/'))
    .sort();
}

/**
 * Checks each referenced key against the local storage directory (read-only).
 * @param {string} root
 * @param {Reference[]} references
 * @returns {Promise<{ ready: ReadyFile[], missing: LocalProblem[], invalidContent: LocalProblem[], unreferenced: UnreferencedFile[] }>}
 */
export async function inventoryLocal(root, references) {
  /** @type {ReadyFile[]} */ const ready = [];
  /** @type {LocalProblem[]} */ const missing = [];
  /** @type {LocalProblem[]} */ const invalidContent = [];
  for (const ref of references) {
    const absolutePath = path.join(root, ...ref.key.split('/'));
    let info;
    try { info = await stat(absolutePath); } catch (error) {
      if (error.code === 'ENOENT') { missing.push({ ...ref, reason: 'file not found on disk' }); continue; }
      throw error;
    }
    if (!info.isFile()) { missing.push({ ...ref, reason: 'path is not a regular file' }); continue; }
    const head = await readHead(absolutePath);
    const check = SIGNATURES[extensionOf(ref.key)];
    if (info.size === 0 || !check || !check(head)) {
      invalidContent.push({ ...ref, size: info.size, reason: info.size === 0 ? 'empty file' : 'content does not match its file type' });
      continue;
    }
    const { sha256, size } = await hashFile(absolutePath);
    ready.push({ ...ref, absolutePath, size, sha256, contentType: /** @type {string} */ (contentTypeFor(ref.key)) });
  }
  const referenced = new Set(references.map((r) => r.key));
  /** @type {UnreferencedFile[]} */
  const unreferenced = [];
  for (const key of await listLocalFiles(root)) {
    if (referenced.has(key)) continue;
    const info = await stat(path.join(root, ...key.split('/')));
    unreferenced.push({ key, size: info.size, modified: info.mtime.toISOString() });
  }
  return { ready, missing, invalidContent, unreferenced };
}

/**
 * Minimal Supabase Storage client (secret key stays in this process).
 * `timeoutMs` limits metadata calls; `transferTimeoutMs` limits uploading or
 * downloading one file (generous, so 50 MB PDFs on a slow connection still fit).
 * @param {{ url: string, secretKey: string, bucket: string, fetchImpl?: typeof fetch, timeoutMs?: number, transferTimeoutMs?: number }} options
 */
export function createStorageClient({ url, secretKey, bucket, fetchImpl = fetch, timeoutMs = 120_000, transferTimeoutMs = 30 * 60_000 }) {
  const base = `${new URL(url).origin}/storage/v1`;
  const headers = (extra = {}) => ({ apikey: secretKey, Authorization: `Bearer ${secretKey}`, ...extra });
  const objectPath = (key) => `${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const call = (target, init = {}, limit = timeoutMs) => fetchImpl(target, { ...init, signal: AbortSignal.timeout(limit) });
  const describe = async (response) => `HTTP ${response.status} ${(await response.text().catch(() => '')).slice(0, 160)}`.trim();

  return {
    bucket,
    /** @returns {Promise<{ exists: boolean, public?: boolean, fileSizeLimit?: number|null, allowedMimeTypes?: string[]|null }>} */
    async bucketInfo() {
      const response = await call(`${base}/bucket/${encodeURIComponent(bucket)}`, { headers: headers() });
      if (response.ok) {
        const body = await response.json();
        return { exists: true, public: body.public === true, fileSizeLimit: body.file_size_limit ?? null, allowedMimeTypes: body.allowed_mime_types ?? null };
      }
      const text = await response.text().catch(() => '');
      if (response.status === 404 || /not.?found/i.test(text)) return { exists: false };
      throw new Error(`Could not read bucket "${bucket}": HTTP ${response.status} ${text.slice(0, 160)}`);
    },
    /** @returns {Promise<{ size: number, contentType: string | null } | null>} */
    async stat(key) {
      const head = await call(`${base}/object/authenticated/${objectPath(key)}`, { method: 'HEAD', headers: headers() });
      if (head.ok) return { size: Number(head.headers.get('content-length')), contentType: head.headers.get('content-type') };
      const info = await call(`${base}/object/info/authenticated/${objectPath(key)}`, { headers: headers() });
      if (info.ok) throw new Error(`HEAD failed (HTTP ${head.status}) for existing object ${key}`);
      const detail = await info.json().catch(() => null);
      if (info.status === 404 || detail?.statusCode === '404' || detail?.code === 'NoSuchKey') return null;
      throw new Error(`Could not check ${key}: HTTP ${info.status} ${JSON.stringify(detail ?? {}).slice(0, 160)}`);
    },
    /** SHA-256 and size of the stored object, streamed. */
    async hash(key) {
      const response = await call(`${base}/object/authenticated/${objectPath(key)}`, { headers: headers({ 'Accept-Encoding': 'identity' }) }, transferTimeoutMs);
      if (!response.ok || !response.body) throw new Error(`Could not download ${key} for verification: ${await describe(response)}`);
      const hash = createHash('sha256');
      let size = 0;
      for await (const chunk of response.body) { hash.update(chunk); size += chunk.length; }
      return { sha256: hash.digest('hex'), size };
    },
    /** Creates the object; resolves 'created' or 'exists' (never overwrites). */
    async upload(key, absolutePath, contentType) {
      const body = await openAsBlob(absolutePath, { type: contentType });
      const response = await call(`${base}/object/${objectPath(key)}`, {
        method: 'POST',
        headers: headers({ 'Content-Type': contentType, 'x-upsert': 'false', 'Cache-Control': 'no-cache' }),
        body,
      }, transferTimeoutMs);
      if (response.ok) return 'created';
      const text = await response.text().catch(() => '');
      if (response.status === 409 || /KeyAlreadyExists|Duplicate|"409"/.test(text)) return 'exists';
      throw new Error(`Upload of ${key} failed: HTTP ${response.status} ${text.slice(0, 160)}`);
    },
    /** Removes an object this run created and failed to verify. */
    async remove(key) {
      const response = await call(`${base}/object/${encodeURIComponent(bucket)}`, {
        method: 'DELETE', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [key] }),
      });
      if (!response.ok) throw new Error(`Could not remove unverified upload ${key}: ${await describe(response)}`);
    },
  };
}

/** Refuses to continue unless the destination bucket exists and is private. */
export async function checkBucket(client, files) {
  const info = await client.bucketInfo();
  const problems = [];
  const warnings = [];
  if (!info.exists) problems.push(`Bucket "${client.bucket}" does not exist.`);
  else {
    if (info.public !== false) problems.push(`Bucket "${client.bucket}" is PUBLIC. It must be private before migrating.`);
    const largest = Math.max(0, ...files.map((f) => f.size));
    if (info.fileSizeLimit && largest > info.fileSizeLimit) problems.push(`Bucket file size limit (${info.fileSizeLimit} bytes) is below the largest file (${largest} bytes).`);
    if (info.allowedMimeTypes?.length) {
      const blocked = [...new Set(files.map((f) => f.contentType))].filter((t) => !info.allowedMimeTypes.includes(t));
      if (blocked.length) problems.push(`Bucket does not allow: ${blocked.join(', ')}`);
    }
    if (!info.fileSizeLimit) warnings.push('Bucket has no file size limit (recommended: 50 MB, the PDF upload limit).');
    if (!info.allowedMimeTypes?.length) warnings.push('Bucket has no allowed MIME types (recommended: application/pdf, image/jpeg, image/png, image/webp).');
  }
  return { info, problems, warnings };
}

/**
 * Copies (or, with dryRun, plans) every ready file. Sequential and resumable.
 * Statuses: would-upload | uploaded | already-present | conflict | failed.
 * @param {ReadyFile[]} files
 * @param {ReturnType<typeof createStorageClient>} client
 * @param {{ dryRun: boolean, log?: (line: string) => void }} options
 * @returns {Promise<FileResult[]>}
 */
export async function migrateFiles(files, client, { dryRun, log = () => {} }) {
  /** @type {FileResult[]} */
  const results = [];
  for (const [index, file] of files.entries()) {
    const label = `[${index + 1}/${files.length}] ${file.key}`;
    try {
      const remote = await client.stat(file.key);
      if (remote) {
        const status = await verify(client, file, remote);
        results.push({ key: file.key, ...status });
        log(`${label} ${status.status}${status.detail ? ` (${status.detail})` : ''}`);
        continue;
      }
      if (dryRun) { results.push({ key: file.key, status: 'would-upload', size: file.size }); log(`${label} would upload ${file.size} bytes`); continue; }

      const outcome = await client.upload(file.key, file.absolutePath, file.contentType);
      const after = await client.stat(file.key);
      if (!after) throw new Error('object not found right after upload');
      const status = await verify(client, file, after);
      if (status.status === 'already-present') {
        results.push({ key: file.key, status: outcome === 'created' ? 'uploaded' : 'already-present', size: file.size });
        log(`${label} ${outcome === 'created' ? 'uploaded and verified' : 'already present (created concurrently), verified'}`);
        continue;
      }
      // Verification failed. Remove the object only if THIS run created it.
      if (outcome === 'created') {
        await client.remove(file.key);
        results.push({ key: file.key, status: 'failed', detail: `uploaded copy did not verify (${status.detail}); removed it, local file untouched` });
      } else {
        results.push({ key: file.key, ...status });
      }
      log(`${label} ${results.at(-1).status}: ${results.at(-1).detail}`);
    } catch (error) {
      results.push({ key: file.key, status: 'failed', detail: error instanceof Error ? error.message : String(error) });
      log(`${label} failed: ${results.at(-1).detail}`);
    }
  }
  return results;
}

async function verify(client, file, remote) {
  if (remote.size !== file.size) return { status: 'conflict', detail: `bucket object is ${remote.size} bytes, local file is ${file.size} bytes; left unchanged` };
  const { sha256, size } = await client.hash(file.key);
  if (size !== file.size || sha256 !== file.sha256) return { status: 'conflict', detail: 'bucket object content differs from the local file (SHA-256 mismatch); left unchanged' };
  return { status: 'already-present', size: file.size };
}

/** @param {FileResult[]} results @returns {Record<string, number>} */
export function summarize(results) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}
