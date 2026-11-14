import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { StorageTimeoutError, timedDownload, timedRequest, withIdleTimeout, writeNewFile } from '../src/lib/storage-io.mjs';

/** Local HTTP server whose behaviour each test controls; records closed connections. */
async function server(handler) {
  const closed = [];
  const srv = http.createServer((req, res) => {
    req.on('close', () => closed.push(req.url));
    handler(req, res);
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${srv.address().port}`;
  return { url, closed, close: () => new Promise((resolve) => { srv.closeAllConnections(); srv.close(resolve); }) };
}
const waitFor = async (fn, ms = 2000) => { const end = Date.now() + ms; while (!fn()) { if (Date.now() > end) throw new Error('condition not met'); await new Promise((r) => setTimeout(r, 10)); } };
const SECRET = 'sb_secret_DO_NOT_LEAK';

test('timedRequest: hanging server -> StorageTimeoutError, upstream connection closed, no secret in message', async () => {
  const s = await server(() => { /* never responds */ });
  try {
    const started = Date.now();
    await assert.rejects(
      timedRequest(`${s.url}/hang`, { headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` } }, { action: 'stat', timeoutMs: 150 }, async (r) => r.status),
      (error) => error instanceof StorageTimeoutError && /stat timed out/.test(error.message) && !error.message.includes(SECRET),
    );
    assert.ok(Date.now() - started < 1500);
    await waitFor(() => s.closed.includes('/hang'));
  } finally { await s.close(); }
});

test('timedRequest: deadline also covers reading the body', async () => {
  const s = await server((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.write('{"partial":'); /* stalls */ });
  try {
    await assert.rejects(
      timedRequest(`${s.url}/slow-body`, {}, { action: 'signed upload', timeoutMs: 150 }, async (r) => r.json()),
      StorageTimeoutError,
    );
  } finally { await s.close(); }
});

test('timedRequest: fast response passes through; other errors are not reported as timeouts', async () => {
  const s = await server((req, res) => { res.writeHead(200); res.end('ok'); });
  try {
    assert.equal(await timedRequest(`${s.url}/ok`, {}, { action: 'stat', timeoutMs: 1000 }, async (r) => r.text()), 'ok');
    await assert.rejects(
      timedRequest(`${s.url}/ok`, {}, { action: 'stat', timeoutMs: 1000 }, async () => { throw new Error('HTTP 400 from storage'); }),
      (error) => !(error instanceof StorageTimeoutError) && /HTTP 400/.test(error.message),
    );
    await assert.rejects(timedRequest('http://127.0.0.1:1/', {}, { action: 'stat', timeoutMs: 1000 }, async (r) => r.status), (error) => !(error instanceof StorageTimeoutError));
  } finally { await s.close(); }
});

test('timedDownload: no headers in time -> StorageTimeoutError and upstream closed', async () => {
  const s = await server(() => {});
  try {
    await assert.rejects(timedDownload(`${s.url}/no-headers`, {}, { action: 'read', headersTimeoutMs: 150, idleTimeoutMs: 1000 }, () => {}), StorageTimeoutError);
    await waitFor(() => s.closed.includes('/no-headers'));
  } finally { await s.close(); }
});

test('timedDownload: full body is delivered unchanged', async () => {
  const payload = Buffer.alloc(300_000, 7);
  const s = await server((req, res) => { res.writeHead(206, { 'Content-Length': payload.length }); res.end(payload); });
  try {
    const body = await timedDownload(`${s.url}/ok`, {}, { action: 'read', headersTimeoutMs: 1000, idleTimeoutMs: 1000 }, (r) => assert.equal(r.status, 206));
    assert.deepEqual(Buffer.from(await new Response(body).arrayBuffer()), payload);
  } finally { await s.close(); }
});

test('timedDownload: upstream stalls mid-body -> stream errors with StorageTimeoutError and upstream is aborted', async () => {
  const s = await server((req, res) => { res.writeHead(200, { 'Content-Length': 100_000 }); res.write(Buffer.alloc(1000)); /* stalls */ });
  try {
    const body = await timedDownload(`${s.url}/stall`, {}, { action: 'read', headersTimeoutMs: 1000, idleTimeoutMs: 150 }, () => {});
    const reader = body.getReader();
    let received = 0;
    await assert.rejects((async () => { for (;;) { const { done, value } = await reader.read(); if (done) return; received += value.length; } })(), StorageTimeoutError);
    assert.equal(received, 1000);
    await waitFor(() => s.closed.includes('/stall'));
  } finally { await s.close(); }
});

test('timedDownload: rejected response (check throws) aborts the upstream request', async () => {
  const s = await server((req, res) => { res.writeHead(200, { 'Content-Length': 1_000_000 }); res.write(Buffer.alloc(10)); });
  try {
    await assert.rejects(timedDownload(`${s.url}/wrong`, {}, { action: 'read', headersTimeoutMs: 1000, idleTimeoutMs: 1000 }, () => { throw new Error('expected 206'); }), /expected 206/);
    await waitFor(() => s.closed.includes('/wrong'));
  } finally { await s.close(); }
});

test('timedDownload: consumer cancel (client disconnect) aborts upstream without errors', async () => {
  const s = await server((req, res) => { res.writeHead(200, { 'Content-Length': 10_000_000 }); res.write(Buffer.alloc(1000)); });
  try {
    const body = await timedDownload(`${s.url}/cancel`, {}, { action: 'read', headersTimeoutMs: 1000, idleTimeoutMs: 5000 }, () => {});
    const reader = body.getReader();
    await reader.read();
    await reader.cancel();
    await waitFor(() => s.closed.includes('/cancel'));
  } finally { await s.close(); }
});

test('withIdleTimeout: a slow consumer is not treated as a stalled upstream', async () => {
  const source = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array([1])); c.close(); } });
  const body = withIdleTimeout(source, { action: 'read', idleTimeoutMs: 50, abort: () => assert.fail('must not abort') });
  await new Promise((r) => setTimeout(r, 150)); // consumer waits longer than the idle timeout
  assert.deepEqual([...new Uint8Array(await new Response(body).arrayBuffer())], [1]);
});

async function tempDir() { return mkdtemp(path.join(tmpdir(), 'wla-storage-test-')); }

test('writeNewFile: writes the exact bytes', async () => {
  const dir = await tempDir();
  try {
    const bytes = Buffer.alloc(200_000, 3);
    await writeNewFile(path.join(dir, 'a.pdf'), new Blob([bytes]).stream());
    assert.deepEqual(await readFile(path.join(dir, 'a.pdf')), bytes);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('writeNewFile: failure part-way removes the incomplete file', async () => {
  const dir = await tempDir();
  try {
    let sent = 0;
    const failing = new ReadableStream({
      pull(c) {
        if (sent >= 3) { c.error(new Error('client went away')); return; }
        sent++; c.enqueue(new Uint8Array(64 * 1024));
      },
    });
    await assert.rejects(writeNewFile(path.join(dir, 'partial.pdf'), failing), /client went away/);
    assert.deepEqual(await readdir(dir), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('writeNewFile: never overwrites or removes an existing file', async () => {
  const dir = await tempDir();
  try {
    const target = path.join(dir, 'existing.pdf');
    await writeFile(target, 'original');
    await assert.rejects(writeNewFile(target, new Blob(['replacement']).stream()), (error) => error.code === 'EEXIST');
    assert.equal(await readFile(target, 'utf8'), 'original');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
