import test from 'node:test';
import assert from 'node:assert/strict';
import { canReadPublishedBook, isSafeBookPath, parsePdfRange, validatePdfUpload, MAX_PDF_BYTES } from '../src/lib/book-security.mjs';

test('only existing published books are available to the public reader', () => {
  assert.equal(canReadPublishedBook({ isPublished: true }), true);
  assert.equal(canReadPublishedBook({ isPublished: false }), false);
  assert.equal(canReadPublishedBook({}), false);
  assert.equal(canReadPublishedBook(null), false);
  assert.equal(canReadPublishedBook(undefined), false);
});

test('stored book paths are relative and traversal-safe', () => {
  assert.equal(isSafeBookPath('8ecb933c-2618-41c8-b458-a41e8a31d596.pdf'), true);
  assert.equal(isSafeBookPath('grade-1/english/book.pdf'), true);
  for (const unsafe of ['', '../private.pdf', 'grade/../../private.pdf', '/etc/passwd', 'C:/private.pdf', 'grade\\book.pdf', 'grade/./book.pdf']) {
    assert.equal(isSafeBookPath(unsafe), false, unsafe);
  }
});

test('PDF upload checks extension, MIME type, size, and file signature', () => {
  const valid = { filename: 'textbook.PDF', mimeType: 'application/pdf', size: 100, signature: new TextEncoder().encode('%PDF-1.7') };
  assert.equal(validatePdfUpload(valid), null);
  assert.match(validatePdfUpload({ ...valid, filename: 'textbook.exe' }), /PDF file/);
  assert.match(validatePdfUpload({ ...valid, mimeType: 'application/octet-stream' }), /content type/);
  assert.equal(MAX_PDF_BYTES, 50 * 1024 * 1024);
  assert.equal(validatePdfUpload({ ...valid, size: 50 * 1024 * 1024 }), null, 'exactly 50 MB is accepted');
  assert.match(validatePdfUpload({ ...valid, size: 50 * 1024 * 1024 + 1 }), /between 8 bytes and 50 MB/, '50 MB + 1 byte is rejected');
  for (const size of [25 * 1024 * 1024 + 1, 37 * 1024 * 1024, 50 * 1024 * 1024 - 1]) {
    assert.equal(validatePdfUpload({ ...valid, size }), null, `${size} bytes (between 25 and 50 MB) is accepted`);
  }
  assert.match(validatePdfUpload({ ...valid, size: 100 * 1024 * 1024 }), /50 MB/, 'the former 100 MB limit no longer applies');
  assert.match(validatePdfUpload({ ...valid, signature: new TextEncoder().encode('not pdf') }), /signature/);
});

test('PDF range parser handles full, bounded, open-ended, and suffix ranges', () => {
  assert.deepEqual(parsePdfRange(null, 100), { kind: 'full' });
  assert.deepEqual(parsePdfRange('bytes=10-19', 100), { kind: 'range', start: 10, end: 19 });
  assert.deepEqual(parsePdfRange('bytes=90-', 100), { kind: 'range', start: 90, end: 99 });
  assert.deepEqual(parsePdfRange('bytes=-10', 100), { kind: 'range', start: 90, end: 99 });
  assert.deepEqual(parsePdfRange('bytes=100-', 100), { kind: 'invalid' });
  assert.deepEqual(parsePdfRange('bytes=0-1,4-5', 100), { kind: 'invalid' });
});
