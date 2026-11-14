import 'server-only';

import { randomUUID } from 'node:crypto';
import { validatePdfUpload } from '@/lib/book-security.mjs';
import { prisma } from '@/lib/prisma';
import { isSafeSchoolImagePath, validateSchoolImageUpload } from '@/lib/school-content-security.mjs';
import { putObject, readObjectPrefix, removeObjectQuietly, statObject, storageDriver } from '@/lib/storage';

export type UploadKind = 'pdf' | 'image';

/** A user-facing validation problem with the uploaded file (HTTP 400). */
export class UploadRejectedError extends Error {
  name = 'UploadRejectedError';
}

const IMAGE_EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const PDF_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.pdf$/;
// Signature bytes each type must start with; used only for the metadata pre-check
// before a direct upload. The real bytes are verified again once uploaded.
const EXPECTED_SIGNATURE: Record<string, number[]> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/webp': [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
};

function validate(kind: UploadKind, file: { filename: string; mimeType: string | null; size: number; signature: Uint8Array }) {
  return kind === 'pdf' ? validatePdfUpload(file) : validateSchoolImageUpload(file);
}

function newKey(kind: UploadKind, mimeType: string) {
  return kind === 'pdf' ? `${randomUUID()}.pdf` : `school-content/${randomUUID()}.${IMAGE_EXTENSIONS[mimeType]}`;
}

function keyMatchesKind(kind: UploadKind, key: string) {
  return kind === 'pdf' ? PDF_KEY.test(key) : isSafeSchoolImagePath(key);
}

/**
 * Validates file metadata (name, type, size) before a direct browser upload and
 * returns the new object key. Throws UploadRejectedError with the usual message.
 */
export function planDirectUpload(kind: UploadKind, meta: { filename: string; contentType: string; size: number }) {
  const signature = new Uint8Array(EXPECTED_SIGNATURE[meta.contentType] ?? []);
  const error = validate(kind, { filename: meta.filename, mimeType: meta.contentType, size: meta.size, signature });
  if (error) throw new UploadRejectedError(error);
  return newKey(kind, meta.contentType);
}

/** Server-side upload (form field `File`): validates, then stores under a new key. */
export async function storeUploadedFile(kind: UploadKind, file: File) {
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const error = validate(kind, { filename: file.name, mimeType: file.type, size: file.size, signature });
  if (error) throw new UploadRejectedError(error);
  const key = newKey(kind, file.type);
  await putObject(key, file, file.type);
  return key;
}

async function isReferenced(key: string) {
  const [books, content, settings] = await Promise.all([
    prisma.book.count({ where: { OR: [{ filePath: key }, { coverImagePath: key }] } }),
    prisma.schoolContent.count({ where: { imagePath: key } }),
    prisma.schoolSettings.count({ where: { OR: [{ logoImagePath: key }, { heroImagePath: key }] } }),
  ]);
  return books + content + settings > 0;
}

/**
 * Verifies an object the browser uploaded directly (signed upload URL) before its
 * key may be saved in the database: the key must be a fresh key of the right kind,
 * unused by any record, and the stored bytes must pass the same validation as a
 * server upload (type, size, signature). A rejected, unreferenced object is removed.
 */
export async function claimDirectUpload(kind: UploadKind, key: string) {
  // Direct uploads exist only with Supabase storage; local mode receives files in the form.
  if (storageDriver() !== 'supabase') throw new UploadRejectedError('Direct uploads are not enabled. Choose the file again.');
  if (!keyMatchesKind(kind, key)) throw new UploadRejectedError('The uploaded file reference is invalid. Choose the file again.');
  if (await isReferenced(key)) throw new UploadRejectedError('This upload has already been used. Choose the file again.');

  const info = await statObject(key);
  if (!info) throw new UploadRejectedError('The uploaded file was not found. Upload it again.');
  const signature = await readObjectPrefix(key, 12);
  const error = validate(kind, { filename: key, mimeType: info.contentType, size: info.size, signature });
  if (error) {
    await removeObjectQuietly(key, 'rejected direct upload');
    throw new UploadRejectedError(error);
  }
  return key;
}

/**
 * Reads an optional upload sent either as a `File` (field `name`) or as the key
 * of a direct upload (field `${name}Key`). Returns the stored key or null.
 */
export async function acceptUpload(kind: UploadKind, form: FormData, name: string) {
  const files = form.getAll(name);
  const keys = form.getAll(`${name}Key`);
  if (files.length > 1 || keys.length > 1) throw new UploadRejectedError('Upload fields must each be provided once.');
  const file = files[0] instanceof File && files[0].size > 0 ? files[0] : null;
  const key = typeof keys[0] === 'string' && keys[0] ? keys[0] : null;
  if (files[0] !== undefined && !(files[0] instanceof File)) throw new UploadRejectedError('Choose a valid file.');
  if (file && key) throw new UploadRejectedError('Choose one file for each upload.');
  if (file) return storeUploadedFile(kind, file);
  if (key) return claimDirectUpload(kind, key);
  return null;
}

/** True if the form carries an upload (file or direct-upload key) for `name`. */
export function hasUpload(form: FormData, name: string) {
  const file = form.get(name);
  const key = form.get(`${name}Key`);
  return (file instanceof File && file.size > 0) || (typeof key === 'string' && key.length > 0);
}
