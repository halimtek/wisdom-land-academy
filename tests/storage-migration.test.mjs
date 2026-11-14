import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MAX_PDF_BYTES } from '../src/lib/book-security.mjs';
import {
  checkBucket, collectReferences, createStorageClient, invalidKeyReason, inventoryLocal, migrateFiles, summarize,
} from '../scripts/lib/storage-migration.mjs';

const SECRET = 'sb_secret_TEST';
const PDF1 = '11111111-1111-4111-8111-111111111111.pdf';
const PDF2 = '22222222-2222-4222-8222-222222222222.pdf';
const IMG1 = 'school-content/33333333-3333-4333-8333-333333333333.png';
const IMG2 = 'school-content/44444444-4444-4444-8444-444444444444.jpg';
const pdfBytes = (n) => Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(n, n % 251)]);
const pngBytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(500, 9)]);
const jpgBytes = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(700, 4)]);
const sha = (b) => createHash('sha256').update(b).digest('hex');

/** Fake Supabase Storage mirroring the real behaviour (missing object: HEAD 400, info NoSuchKey; no overwrite). */
async function fakeSupabase({ isPublic = false, exists = true, corruptUploads = false, raceKey = null, fileSizeLimit = null } = {}) {
  const objects = new Map(); // key -> { body, type }
  const calls = [];
  const srv = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    calls.push(`${req.method} ${p}`);
    const authed = req.headers.apikey === SECRET && req.headers.authorization === `Bearer ${SECRET}`;
    const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    if (!authed) return json(401, { message: 'Invalid key' });
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    if (p === '/storage/v1/bucket/file_uploads') return exists ? json(200, { id: 'file_uploads', public: isPublic, file_size_limit: fileSizeLimit, allowed_mime_types: null }) : json(400, { statusCode: '404', error: 'Bucket not found' });
    const auth = p.match(/^\/storage\/v1\/object\/authenticated\/file_uploads\/(.+)$/);
    if (auth) {
      const o = objects.get(auth[1]);
      if (!o) { if (req.method === 'HEAD') { res.writeHead(400); return res.end(); } return json(400, { statusCode: '404', code: 'NoSuchKey' }); }
      res.writeHead(200, { 'Content-Length': o.body.length, 'Content-Type': o.type });
      return res.end(req.method === 'HEAD' ? undefined : o.body);
    }
    const info = p.match(/^\/storage\/v1\/object\/info\/authenticated\/file_uploads\/(.+)$/);
    if (info) return objects.has(info[1]) ? json(200, { size: objects.get(info[1]).body.length }) : json(400, { statusCode: '404', error: 'not_found', code: 'NoSuchKey' });
    const put = p.match(/^\/storage\/v1\/object\/file_uploads\/(.+)$/);
    if (put && req.method === 'POST') {
      const key = put[1];
      if (key === raceKey && !objects.has(key)) objects.set(key, { body, type: req.headers['content-type'] }); // created by "someone else" first
      if (objects.has(key)) return json(400, { statusCode: '409', error: 'Duplicate', code: 'KeyAlreadyExists' });
      if (req.headers['x-upsert'] !== 'false') return json(400, { error: 'test expects x-upsert: false' });
      objects.set(key, { body: corruptUploads ? body.subarray(0, body.length - 1) : body, type: req.headers['content-type'] });
      return json(200, { Key: `file_uploads/${key}` });
    }
    if (p === '/storage/v1/object/file_uploads' && req.method === 'DELETE') {
      const { prefixes } = JSON.parse(body.toString());
      const removed = prefixes.filter((k) => objects.delete(k)).map((name) => ({ name }));
      return json(200, removed);
    }
    json(404, { error: 'unsupported' });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/rest/v1/`;
  return {
    objects, calls, url,
    client: createStorageClient({ url, secretKey: SECRET, bucket: 'file_uploads' }),
    uploads: () => calls.filter((c) => c.startsWith('POST /storage/v1/object/file_uploads/')).length,
    close: () => new Promise((r) => { srv.closeAllConnections(); srv.close(r); }),
  };
}

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'wla-migrate-'));
  await mkdir(path.join(root, 'school-content'));
  const files = {
    [PDF1]: pdfBytes(3000), [PDF2]: pdfBytes(900_000), [IMG1]: pngBytes, [IMG2]: jpgBytes,
    '99999999-9999-4999-8999-999999999999.pdf': pdfBytes(10), // unreferenced leftover
  };
  for (const [k, v] of Object.entries(files)) await writeFile(path.join(root, k), v);
  const rows = [
    { table: 'Book', field: 'filePath', kind: 'pdf', id: 'b1', key: PDF1 },
    { table: 'Book', field: 'filePath', kind: 'pdf', id: 'b2', key: PDF2 },
    { table: 'Book', field: 'coverImagePath', kind: 'image', id: 'b1', key: IMG1 },
    { table: 'Book', field: 'coverImagePath', kind: 'image', id: 'b2', key: null },
    { table: 'SchoolSettings', field: 'logoImagePath', kind: 'image', id: 'main', key: IMG2 },
  ];
  const snapshot = async () => Object.fromEntries(await Promise.all((await readdir(root, { recursive: true })).map(String).filter((f) => f.includes('.')).map(async (f) => [f, sha(await readFile(path.join(root, f)))])));
  return { root, files, rows, snapshot, cleanup: () => rm(root, { recursive: true, force: true }) };
}

test('invalidKeyReason: rejects unsafe and mismatched keys, accepts the real formats', () => {
  assert.equal(invalidKeyReason(PDF1, 'pdf'), null);
  assert.equal(invalidKeyReason(IMG1, 'image'), null);
  for (const bad of ['../etc/passwd', '/abs/x.pdf', 'a//b.pdf', 'x\\y.pdf', '']) assert.ok(invalidKeyReason(bad, 'pdf'), bad);
  assert.ok(invalidKeyReason('book.png', 'pdf'));
  assert.ok(invalidKeyReason('school-content/not-a-uuid.png', 'image'));
  assert.ok(invalidKeyReason(PDF1, 'image'));
});

test('collectReferences: skips nulls, groups duplicates, reports invalid keys', () => {
  const { references, duplicates, invalid, totalRows } = collectReferences([
    { table: 'Book', field: 'filePath', kind: 'pdf', id: 'a', key: PDF1 },
    { table: 'Book', field: 'filePath', kind: 'pdf', id: 'b', key: PDF1 },
    { table: 'Book', field: 'coverImagePath', kind: 'image', id: 'a', key: null },
    { table: 'SchoolContent', field: 'imagePath', kind: 'image', id: 'c', key: '../x.png' },
  ]);
  assert.equal(totalRows, 3);
  assert.deepEqual(references.map((r) => r.key), [PDF1]);
  assert.equal(duplicates.length, 1); assert.equal(duplicates[0].refs.length, 2);
  assert.equal(invalid.length, 1); assert.equal(invalid[0].key, '../x.png');
});

test('inventoryLocal: computes SHA-256, finds missing, invalid content and unreferenced files', async () => {
  const fx = await fixture();
  try {
    await writeFile(path.join(fx.root, 'school-content', '55555555-5555-4555-8555-555555555555.png'), 'not really a png');
    const rows = [...fx.rows,
      { table: 'SchoolContent', field: 'imagePath', kind: 'image', id: 'c1', key: 'school-content/55555555-5555-4555-8555-555555555555.png' },
      { table: 'SchoolContent', field: 'imagePath', kind: 'image', id: 'c2', key: 'school-content/66666666-6666-4666-8666-666666666666.webp' }];
    const local = await inventoryLocal(fx.root, collectReferences(rows).references);
    assert.equal(local.ready.length, 4);
    assert.equal(local.ready.find((f) => f.key === PDF2).sha256, sha(fx.files[PDF2]));
    assert.deepEqual(local.missing.map((m) => m.key), ['school-content/66666666-6666-4666-8666-666666666666.webp']);
    assert.deepEqual(local.invalidContent.map((m) => m.key), ['school-content/55555555-5555-4555-8555-555555555555.png']);
    assert.deepEqual(local.unreferenced.map((u) => u.key), ['99999999-9999-4999-8999-999999999999.pdf']);
  } finally { await fx.cleanup(); }
});

test('checkBucket: private bucket passes; public or missing bucket stops the migration', async () => {
  for (const [options, expectProblem] of [[{}, false], [{ isPublic: true }, true], [{ exists: false }, true]]) {
    const sb = await fakeSupabase(options);
    try {
      const { problems } = await checkBucket(sb.client, [{ size: 10, contentType: 'application/pdf' }]);
      assert.equal(problems.length > 0, expectProblem, JSON.stringify(options));
    } finally { await sb.close(); }
  }
});

test('dry run: plans every upload, uploads nothing, local files unchanged', async () => {
  const fx = await fixture(); const sb = await fakeSupabase();
  try {
    const before = await fx.snapshot();
    const { ready } = await inventoryLocal(fx.root, collectReferences(fx.rows).references);
    const results = await migrateFiles(ready, sb.client, { dryRun: true });
    assert.deepEqual(summarize(results), { 'would-upload': 4 });
    assert.equal(sb.uploads(), 0); assert.equal(sb.objects.size, 0);
    assert.deepEqual(await fx.snapshot(), before);
  } finally { await sb.close(); await fx.cleanup(); }
});

test('execute: copies referenced files under exact keys, verifies SHA-256, leaves unreferenced and local files alone', async () => {
  const fx = await fixture(); const sb = await fakeSupabase();
  try {
    const before = await fx.snapshot();
    const { ready } = await inventoryLocal(fx.root, collectReferences(fx.rows).references);
    const results = await migrateFiles(ready, sb.client, { dryRun: false });
    assert.deepEqual(summarize(results), { uploaded: 4 });
    assert.deepEqual([...sb.objects.keys()].sort(), [PDF1, PDF2, IMG1, IMG2].sort());
    for (const key of [PDF1, PDF2, IMG1, IMG2]) assert.equal(sha(sb.objects.get(key).body), sha(fx.files[key]), key);
    assert.equal(sb.objects.get(IMG2).type, 'image/jpeg'); assert.equal(sb.objects.get(PDF1).type, 'application/pdf');
    assert.ok(!sb.objects.has('99999999-9999-4999-8999-999999999999.pdf'));
    assert.deepEqual(await fx.snapshot(), before, 'local files must be untouched');
  } finally { await sb.close(); await fx.cleanup(); }
});

test('resume: after an interruption only the remaining files are uploaded; a re-run uploads nothing', async () => {
  const fx = await fixture(); const sb = await fakeSupabase();
  try {
    const { ready } = await inventoryLocal(fx.root, collectReferences(fx.rows).references);
    await migrateFiles(ready.slice(0, 2), sb.client, { dryRun: false }); // "interrupted" after 2 files
    const resumed = await migrateFiles(ready, sb.client, { dryRun: false });
    assert.deepEqual(summarize(resumed), { 'already-present': 2, uploaded: 2 });
    const uploadsSoFar = sb.uploads();
    const again = await migrateFiles(ready, sb.client, { dryRun: false });
    assert.deepEqual(summarize(again), { 'already-present': 4 });
    assert.equal(sb.uploads(), uploadsSoFar, 'no uploads on a complete re-run');
  } finally { await sb.close(); await fx.cleanup(); }
});

test('conflict: a different existing object is reported and never overwritten', async () => {
  const fx = await fixture(); const sb = await fakeSupabase();
  try {
    sb.objects.set(PDF1, { body: pdfBytes(3000).fill(7, 20), type: 'application/pdf' }); // same size, different bytes
    sb.objects.set(IMG1, { body: Buffer.from('other'), type: 'image/png' });             // different size
    const { ready } = await inventoryLocal(fx.root, collectReferences(fx.rows).references);
    const results = await migrateFiles(ready, sb.client, { dryRun: false });
    const byKey = Object.fromEntries(results.map((r) => [r.key, r]));
    assert.equal(byKey[PDF1].status, 'conflict'); assert.match(byKey[PDF1].detail, /SHA-256/);
    assert.equal(byKey[IMG1].status, 'conflict'); assert.match(byKey[IMG1].detail, /bytes/);
    assert.equal(sb.objects.get(IMG1).body.toString(), 'other', 'existing object left unchanged');
    assert.equal(byKey[PDF2].status, 'uploaded');
    const dry = await migrateFiles(ready, sb.client, { dryRun: true });
    assert.equal(dry.find((r) => r.key === PDF1).status, 'conflict', 'dry run reports conflicts too');
  } finally { await sb.close(); await fx.cleanup(); }
});

test('verification failure: the unverified copy this run created is removed and reported as failed', async () => {
  const fx = await fixture(); const sb = await fakeSupabase({ corruptUploads: true });
  try {
    const before = await fx.snapshot();
    const { ready } = await inventoryLocal(fx.root, collectReferences(fx.rows).references);
    const results = await migrateFiles(ready, sb.client, { dryRun: false });
    assert.deepEqual(summarize(results), { failed: 4 });
    assert.equal(sb.objects.size, 0, 'corrupt copies removed so a later run can retry');
    assert.deepEqual(await fx.snapshot(), before);
  } finally { await sb.close(); await fx.cleanup(); }
});

test('race: an object created concurrently with identical content counts as present', async () => {
  const fx = await fixture(); const sb = await fakeSupabase({ raceKey: PDF2 });
  try {
    const { ready } = await inventoryLocal(fx.root, collectReferences(fx.rows).references);
    const results = await migrateFiles(ready, sb.client, { dryRun: false });
    assert.equal(results.find((r) => r.key === PDF2).status, 'already-present');
    assert.equal(summarize(results).failed, undefined);
  } finally { await sb.close(); await fx.cleanup(); }
});

test('failures (e.g. storage unreachable) are reported per file, never thrown away', async () => {
  const fx = await fixture();
  try {
    const client = createStorageClient({ url: 'http://127.0.0.1:1/', secretKey: SECRET, bucket: 'file_uploads', timeoutMs: 2000 });
    const { ready } = await inventoryLocal(fx.root, collectReferences(fx.rows).references);
    const results = await migrateFiles(ready, client, { dryRun: false });
    assert.deepEqual(summarize(results), { failed: 4 });
    assert.ok(results.every((r) => !r.detail.includes(SECRET)));
  } finally { await fx.cleanup(); }
});

test('50 MB PDF (the upload limit) is inventoried, copied and verified', async () => {
  const fx = await fixture(); const sb = await fakeSupabase();
  try {
    const big = Buffer.alloc(MAX_PDF_BYTES, 0x20); Buffer.from('%PDF-1.7\n').copy(big);
    await writeFile(path.join(fx.root, PDF2), big);
    const { ready, invalidContent } = await inventoryLocal(fx.root, collectReferences(fx.rows).references);
    assert.equal(invalidContent.length, 0);
    assert.equal(ready.find((f) => f.key === PDF2).size, 50 * 1024 * 1024);
    const results = await migrateFiles(ready.filter((f) => f.key === PDF2), sb.client, { dryRun: false });
    assert.deepEqual(summarize(results), { uploaded: 1 });
    assert.equal(sha(sb.objects.get(PDF2).body), sha(big));
  } finally { await sb.close(); await fx.cleanup(); }
});

test('bucket file size limit below the largest PDF stops the migration (e.g. still set to 25 MB)', async () => {
  const sb = await fakeSupabase({ fileSizeLimit: 25 * 1024 * 1024 });
  try {
    const { problems } = await checkBucket(sb.client, [{ size: 60 * 1024 * 1024, contentType: 'application/pdf' }]);
    assert.equal(problems.length, 1); assert.match(problems[0], /file size limit/);
    const ok = await checkBucket(sb.client, [{ size: 20 * 1024 * 1024, contentType: 'application/pdf' }]);
    assert.deepEqual(ok.problems, []);
  } finally { await sb.close(); }
});

test('migration respects a 50 MB bucket limit: exactly 50 MB passes, anything larger stops before uploading', async () => {
  const sb = await fakeSupabase({ fileSizeLimit: MAX_PDF_BYTES });
  try {
    assert.equal(MAX_PDF_BYTES, 50 * 1024 * 1024);
    const atLimit = await checkBucket(sb.client, [{ size: 50 * 1024 * 1024, contentType: 'application/pdf' }, { size: 30 * 1024 * 1024, contentType: 'application/pdf' }]);
    assert.deepEqual(atLimit.problems, []);
    assert.deepEqual(atLimit.warnings.filter((w) => /size limit/.test(w)), [], 'no size-limit warning when the bucket limit is set');
    const over = await checkBucket(sb.client, [{ size: 50 * 1024 * 1024 + 1, contentType: 'application/pdf' }]);
    assert.equal(over.problems.length, 1); assert.match(over.problems[0], /52428800 bytes.*52428801 bytes/);
  } finally { await sb.close(); }
});

test('no bucket size limit: migration warns and recommends 50 MB', async () => {
  const sb = await fakeSupabase();
  try {
    const { warnings } = await checkBucket(sb.client, [{ size: 10, contentType: 'application/pdf' }]);
    assert.ok(warnings.some((w) => /recommended: 50 MB/.test(w)), warnings.join(' | '));
  } finally { await sb.close(); }
});
