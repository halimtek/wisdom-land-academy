import 'server-only';

import { mkdir, open, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isSafeBookPath } from '@/lib/book-security.mjs';
import { getBookStorageRoot, resolveBookPath } from '@/lib/book-storage';
import { createFileStream } from '@/lib/file-stream';
import { StorageTimeoutError, timedDownload, timedRequest, writeNewFile } from '@/lib/storage-io.mjs';

export { StorageTimeoutError };

// Supabase request deadlines. Metadata calls are small. Large files normally go
// browser -> Supabase directly; a server-side upload (form fallback) can be a PDF
// of up to 50 MB, so it gets a generous deadline. Downloads
// are limited by time-to-headers and by upstream stalls, never by total length.
const METADATA_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 10 * 60_000;
const DOWNLOAD_HEADERS_TIMEOUT_MS = 20_000;
const DOWNLOAD_IDLE_TIMEOUT_MS = 30_000;

/*
 * Private file storage for book PDFs, book covers and school images.
 *
 * Object keys are exactly the paths already stored in the database
 * (`<uuid>.pdf`, `school-content/<uuid>.<ext>`), so the same records work with
 * either driver:
 *
 * - `local` (default): files under BOOK_STORAGE_DIR, as before.
 * - `supabase`: a PRIVATE Supabase Storage bucket, reached only from the server
 *   with the secret key (never sent to the browser). Browsers upload through
 *   short-lived signed upload URLs that cannot overwrite existing objects.
 *
 * Select with STORAGE_DRIVER=local|supabase. Nothing is migrated automatically.
 */

export type StorageDriver = 'local' | 'supabase';
export type StoredObject = { size: number; mtimeMs: number; contentType: string | null };

export function storageDriver(): StorageDriver {
  const value = (process.env.STORAGE_DRIVER ?? 'local').trim().toLowerCase();
  if (value === 'local' || value === 'supabase') return value;
  throw new Error('STORAGE_DRIVER must be "local" or "supabase".');
}

function assertKey(key: string) {
  if (!isSafeBookPath(key)) throw new Error('Unsafe storage path.');
}

/* ----------------------------- Supabase ----------------------------- */

function supabase() {
  const url = process.env.SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  if (!url || !secret || !bucket) {
    throw new Error('Supabase storage requires SUPABASE_URL, SUPABASE_SECRET_KEY and SUPABASE_STORAGE_BUCKET.');
  }
  // Accept the project URL with or without an API path such as /rest/v1/.
  const base = `${new URL(url).origin}/storage/v1`;
  const objectPath = (key: string) => `${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const headers = (extra?: Record<string, string>) => ({ apikey: secret, Authorization: `Bearer ${secret}`, ...extra });
  return { base, bucket, objectPath, headers };
}

async function storageError(action: string, response: Response) {
  const text = await response.text().catch(() => '');
  return new Error(`Supabase storage ${action} failed (HTTP ${response.status}) ${text.slice(0, 200)}`.trim());
}

async function supabaseStat(key: string): Promise<StoredObject | null> {
  const s = supabase();
  const head = await timedRequest(
    `${s.base}/object/authenticated/${s.objectPath(key)}`,
    { method: 'HEAD', headers: s.headers(), cache: 'no-store' },
    { action: 'stat', timeoutMs: METADATA_TIMEOUT_MS },
    async (response) => ({ ok: response.ok, status: response.status, headers: response.headers }),
  );
  if (head.ok) {
    const size = Number(head.headers.get('content-length'));
    if (!Number.isSafeInteger(size) || size < 0) throw new Error('Supabase storage returned no object size.');
    const modified = Date.parse(head.headers.get('last-modified') ?? '');
    return { size, mtimeMs: Number.isFinite(modified) ? modified : 0, contentType: head.headers.get('content-type') };
  }
  // HEAD has no body, and Supabase answers a missing object with 400; the info
  // endpoint tells "not found" apart from real errors.
  const info = await timedRequest(
    `${s.base}/object/info/authenticated/${s.objectPath(key)}`,
    { headers: s.headers(), cache: 'no-store' },
    { action: 'stat', timeoutMs: METADATA_TIMEOUT_MS },
    async (response) => ({ ok: response.ok, status: response.status, detail: await response.json().catch(() => null) as { statusCode?: string; code?: string } | null }),
  );
  if (info.ok) throw new Error(`Supabase storage HEAD failed (HTTP ${head.status}) for an existing object.`);
  if (info.detail?.statusCode === '404' || info.detail?.code === 'NoSuchKey' || info.status === 404) return null;
  throw new Error(`Supabase storage stat failed (HTTP ${info.status}) ${JSON.stringify(info.detail ?? {}).slice(0, 200)}`);
}

async function supabaseRead(key: string, start: number, end: number, size: number): Promise<ReadableStream<Uint8Array>> {
  const s = supabase();
  const partial = start > 0 || end < size - 1;
  const expected = end - start + 1;
  // Cancelling the returned stream (client disconnect) or an upstream stall aborts
  // the upstream request; see timedDownload().
  return timedDownload(
    `${s.base}/object/authenticated/${s.objectPath(key)}`,
    {
      headers: s.headers({
        // identity: the body must be the exact bytes promised by Content-Length.
        'Accept-Encoding': 'identity',
        ...(partial ? { Range: `bytes=${start}-${end}` } : {}),
      }),
      cache: 'no-store',
    },
    { action: 'read', headersTimeoutMs: DOWNLOAD_HEADERS_TIMEOUT_MS, idleTimeoutMs: DOWNLOAD_IDLE_TIMEOUT_MS },
    (response) => {
      const length = Number(response.headers.get('content-length'));
      if (response.status !== (partial ? 206 : 200) || (response.headers.has('content-length') && length !== expected)) {
        throw new Error(`Supabase storage read failed (HTTP ${response.status}, expected ${partial ? 206 : 200} with ${expected} bytes).`);
      }
    },
  );
}

async function supabasePut(key: string, body: File, contentType: string) {
  const s = supabase();
  try {
    await timedRequest(
      `${s.base}/object/${s.objectPath(key)}`,
      { method: 'POST', headers: s.headers({ 'Content-Type': contentType, 'x-upsert': 'false', 'Cache-Control': 'no-cache' }), body },
      { action: 'upload', timeoutMs: UPLOAD_TIMEOUT_MS },
      async (response) => { if (!response.ok) throw await storageError('upload', response); },
    );
  } catch (error) {
    // A timed-out or failed upload may still have been stored upstream. The key is a
    // fresh random key nothing refers to, so removing it is safe; an "already exists"
    // conflict is left alone because that object is not ours.
    if (!(error instanceof Error && /KeyAlreadyExists|Duplicate|HTTP 409/.test(error.message))) {
      await supabaseRemove(key).catch((cleanupError) => console.error(`[storage] Could not remove incomplete upload ${key}`, cleanupError));
    }
    throw error;
  }
}

async function supabaseRemove(key: string) {
  const s = supabase();
  await timedRequest(
    `${s.base}/object/${encodeURIComponent(s.bucket)}`,
    { method: 'DELETE', headers: s.headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({ prefixes: [key] }) },
    { action: 'delete', timeoutMs: METADATA_TIMEOUT_MS },
    async (response) => { if (!response.ok) throw await storageError('delete', response); },
  );
}

/* ------------------------------ Local ------------------------------- */

async function localStat(key: string): Promise<StoredObject | null> {
  try {
    const { absolutePath } = await resolveBookPath(key);
    const info = await stat(absolutePath);
    return info.isFile() ? { size: info.size, mtimeMs: info.mtimeMs, contentType: null } : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

async function localPut(key: string, body: File) {
  const root = await getBookStorageRoot();
  const target = path.join(root, key);
  await mkdir(path.dirname(target), { recursive: true, mode: 0o750 });
  // Never overwrites an existing file; removes its own incomplete file if writing fails.
  await writeNewFile(target, body.stream(), { mode: 0o640 });
}

/* ------------------------------ API --------------------------------- */

/** Size, modification time and stored content type, or null if the object does not exist. */
export async function statObject(key: string): Promise<StoredObject | null> {
  assertKey(key);
  return storageDriver() === 'supabase' ? supabaseStat(key) : localStat(key);
}

/** Streams bytes start..end (inclusive). `size` is the object's size from statObject. */
export async function readObject(key: string, { start, end, size, label }: { start: number; end: number; size: number; label: string }) {
  assertKey(key);
  if (storageDriver() === 'supabase') return supabaseRead(key, start, end, size);
  const { absolutePath } = await resolveBookPath(key);
  return createFileStream(absolutePath, { start, end, label });
}

/** Reads the first `bytes` bytes (for file signature checks). */
export async function readObjectPrefix(key: string, bytes: number): Promise<Uint8Array> {
  assertKey(key);
  if (storageDriver() === 'supabase') {
    const s = supabase();
    return timedRequest(
      `${s.base}/object/authenticated/${s.objectPath(key)}`,
      { headers: s.headers({ Range: `bytes=0-${bytes - 1}`, 'Accept-Encoding': 'identity' }), cache: 'no-store' },
      { action: 'read', timeoutMs: METADATA_TIMEOUT_MS },
      async (response) => {
        if (response.status !== 206 && response.status !== 200) throw await storageError('read', response);
        return new Uint8Array(await response.arrayBuffer()).subarray(0, bytes);
      },
    );
  }
  const { absolutePath } = await resolveBookPath(key);
  const handle = await open(absolutePath, 'r');
  try {
    const buffer = new Uint8Array(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

/** Stores a new object. Never overwrites: fails if the key already exists. */
export async function putObject(key: string, body: File, contentType: string) {
  assertKey(key);
  if (storageDriver() === 'supabase') return supabasePut(key, body, contentType);
  return localPut(key, body);
}

/** Deletes an object; deleting a missing object is not an error. */
export async function removeObject(key: string) {
  assertKey(key);
  if (storageDriver() === 'supabase') return supabaseRemove(key);
  try {
    const { absolutePath } = await resolveBookPath(key);
    await unlink(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

/**
 * Supabase only: a signed URL the browser can PUT one new object to (valid for
 * 2 hours, set by Supabase). Uploads to it cannot overwrite an existing object.
 */
export async function createSignedUpload(key: string): Promise<string> {
  assertKey(key);
  const s = supabase();
  const { url } = await timedRequest(
    `${s.base}/object/upload/sign/${s.objectPath(key)}`,
    { method: 'POST', headers: s.headers() },
    { action: 'signed upload', timeoutMs: METADATA_TIMEOUT_MS },
    async (response) => {
      if (!response.ok) throw await storageError('signed upload', response);
      return await response.json() as { url?: string };
    },
  );
  if (!url || !url.startsWith('/object/upload/sign/')) throw new Error('Supabase storage returned an invalid signed upload URL.');
  return `${s.base}${url}`;
}

/** For cleanup after the database is already consistent: log, never throw. */
export function removeObjectQuietly(key: string | null | undefined, reason: string) {
  if (!key) return Promise.resolve();
  return removeObject(key).catch((error) => console.error(`[storage] Could not remove ${key} (${reason})`, error));
}
