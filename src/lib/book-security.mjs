export const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** @param {{isPublished?: unknown} | null | undefined} book */
export function canReadPublishedBook(book) {
  return book !== null && typeof book === 'object' && book.isPublished === true;
}

/** @param {unknown} candidate */
export function isSafeBookPath(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > 512) return false;
  if (candidate.startsWith('/') || /^[a-zA-Z]:/.test(candidate) || candidate.includes('\\') || candidate.includes('\0')) return false;
  const segments = candidate.split('/');
  return segments.every((part) => part !== '' && part !== '.' && part !== '..');
}

/** @param {{mimeType: unknown, size: unknown, filename: unknown, signature: Uint8Array}} file */
export function validatePdfUpload(file) {
  if (typeof file.filename !== 'string' || !file.filename.toLowerCase().endsWith('.pdf')) return 'Choose a PDF file.';
  if (file.mimeType !== 'application/pdf') return 'The uploaded file must have PDF content type.';
  if (typeof file.size !== 'number' || !Number.isSafeInteger(file.size) || file.size < 8 || file.size > MAX_PDF_BYTES) {
    return `PDF files must be between 8 bytes and ${Math.floor(MAX_PDF_BYTES / (1024 * 1024))} MB.`;
  }
  if (new TextDecoder().decode(file.signature.subarray(0, 5)) !== '%PDF-') return 'The file does not have a valid PDF signature.';
  return null;
}

/** @param {string | null} rangeHeader @param {number} size */
/** @returns {{kind: 'full'} | {kind: 'invalid'} | {kind: 'range', start: number, end: number}} */
export function parsePdfRange(rangeHeader, size) {
  if (rangeHeader === null) return { kind: 'full' };
  if (!Number.isSafeInteger(size) || size <= 0 || rangeHeader.includes(',')) return { kind: 'invalid' };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match || (!match[1] && !match[2])) return { kind: 'invalid' };
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return { kind: 'invalid' };
    return { kind: 'range', start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) {
    return { kind: 'invalid' };
  }
  return { kind: 'range', start, end: Math.min(requestedEnd, size - 1) };
}
/**
 * ETag for a stored book file. Files are written once under a random name,
 * so size + mtime identifies a version.
 * @param {{size: number, mtimeMs: number}} info
 */
export function makePdfEtag(info) {
  return `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
}

/** @param {string | null} ifNoneMatch */
export function etagMatches(ifNoneMatch, etag) {
  if (!ifNoneMatch) return false;
  if (ifNoneMatch.trim() === '*') return true;
  return ifNoneMatch.split(',').some((candidate) => candidate.trim().replace(/^W\//, '') === etag);
}

/** @param {string | null} ifRange */
export function ifRangeAllowsRange(ifRange, etag, lastModified) {
  if (!ifRange) return true;
  const value = ifRange.trim();
  return value === etag || value === lastModified;
}