import test from 'node:test';
import assert from 'node:assert/strict';
import { UploadTransportError, uploadPercent, xhrUpload } from '../src/lib/upload-progress.mjs';

/** Minimal XMLHttpRequest stand-in: records the request, lets the test drive events. */
function fakeXhrClass() {
  const instances = [];
  class FakeXHR {
    constructor() { this.headers = {}; this.upload = {}; this.status = 0; instances.push(this); }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(name, value) { this.headers[name] = value; }
    send(body) { this.body = body; }
    progress(loaded, total, lengthComputable = true) { this.upload.onprogress?.({ loaded, total, lengthComputable }); }
    respond(status) { this.status = status; this.onload?.(); }
  }
  return { FakeXHR, instances };
}

test('uploadPercent: 0..99 while uploading, 100 only when completed', () => {
  assert.equal(uploadPercent(0, 2_200_000), 0);
  assert.equal(uploadPercent(770_000, 2_200_000), 35);
  assert.equal(uploadPercent(1_319_999, 2_200_000), 59, 'rounds down, never overstates');
  assert.equal(uploadPercent(2_200_000, 2_200_000), 99, 'all bytes sent is not yet "stored"');
  assert.equal(uploadPercent(3_000_000, 2_200_000), 99, 'clamped');
  assert.equal(uploadPercent(2_200_000, 2_200_000, true), 100);
  assert.equal(uploadPercent(500, 0), 0, 'unknown total');
  assert.equal(uploadPercent(Number.NaN, 100), 0);
  assert.equal(uploadPercent(-5, 100), 0);
});

test('xhrUpload: sends the same method, signed URL, headers and body', async () => {
  const { FakeXHR, instances } = fakeXhrClass();
  const body = new Blob(['%PDF-1.7 test']);
  const done = xhrUpload({ url: 'https://example.supabase.co/storage/v1/object/upload/sign/file_uploads/k.pdf?token=t', headers: { 'Content-Type': 'application/pdf', 'x-upsert': 'false' }, body, XHR: FakeXHR });
  const xhr = instances[0];
  assert.equal(xhr.method, 'PUT');
  assert.match(xhr.url, /upload\/sign\/file_uploads\/k\.pdf\?token=t$/);
  assert.deepEqual(xhr.headers, { 'Content-Type': 'application/pdf', 'x-upsert': 'false' });
  assert.equal(xhr.body, body);
  xhr.respond(200);
  assert.deepEqual(await done, { ok: true, status: 200 });
});

test('xhrUpload: progress is monotonic, deduplicated, and reaches 100 only after a 2xx response', async () => {
  const { FakeXHR, instances } = fakeXhrClass();
  const seen = [];
  const done = xhrUpload({ url: 'u', body: new Blob(['x']), XHR: FakeXHR, onProgress: (p) => seen.push(p) });
  const xhr = instances[0];
  xhr.progress(220_000, 2_200_000);
  xhr.progress(220_001, 2_200_000); // same integer percent -> not reported again
  xhr.progress(1_100_000, 2_200_000);
  xhr.progress(2_200_000, 2_200_000);
  assert.deepEqual(seen, [0, 10, 50, 99], 'no 100 before the response');
  xhr.respond(201);
  await done;
  assert.deepEqual(seen, [0, 10, 50, 99, 100]);
});

test('xhrUpload: unknown length reports null (indeterminate), not a fake percentage', async () => {
  const { FakeXHR, instances } = fakeXhrClass();
  const seen = [];
  const done = xhrUpload({ url: 'u', body: new Blob(['x']), XHR: FakeXHR, onProgress: (p) => seen.push(p) });
  instances[0].progress(500, 0, false);
  instances[0].respond(200);
  await done;
  assert.deepEqual(seen, [0, null, 100]);
});

test('xhrUpload: HTTP error resolves not-ok with the status and never shows 100%', async () => {
  const { FakeXHR, instances } = fakeXhrClass();
  const seen = [];
  const done = xhrUpload({ url: 'u', body: new Blob(['x']), XHR: FakeXHR, onProgress: (p) => seen.push(p) });
  instances[0].progress(10, 10);
  instances[0].respond(400); // e.g. Supabase "KeyAlreadyExists" or an expired signed URL
  assert.deepEqual(await done, { ok: false, status: 400 });
  assert.ok(!seen.includes(100), `progress was ${seen.join(',')}`);
});

test('xhrUpload: network error, abort and timeout reject with UploadTransportError', async () => {
  for (const [event, kind] of [['onerror', 'network'], ['onabort', 'aborted'], ['ontimeout', 'timeout']]) {
    const { FakeXHR, instances } = fakeXhrClass();
    const seen = [];
    const done = xhrUpload({ url: 'u', body: new Blob(['x']), XHR: FakeXHR, onProgress: (p) => seen.push(p) });
    instances[0].progress(5, 10);
    instances[0][event]();
    await assert.rejects(done, (error) => error instanceof UploadTransportError && error.kind === kind);
    assert.ok(!seen.includes(100), `${kind}: progress was ${seen.join(',')}`);
  }
});

test('xhrUpload: works without a progress callback', async () => {
  const { FakeXHR, instances } = fakeXhrClass();
  const done = xhrUpload({ url: 'u', body: new Blob(['x']), XHR: FakeXHR });
  instances[0].progress(1, 2);
  instances[0].respond(204);
  assert.deepEqual(await done, { ok: true, status: 204 });
});
