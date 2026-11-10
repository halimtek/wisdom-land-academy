import 'server-only';

import { randomUUID } from 'node:crypto';
import { mkdir, realpath, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isSafeSchoolImagePath, validateSchoolImageUpload } from '@/lib/school-content-security.mjs';
import { getBookStorageRoot } from '@/lib/book-storage';

export async function storeSchoolImage(file: File) {
  const signature = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const validationError = validateSchoolImageUpload({ filename: file.name, mimeType: file.type, size: file.size, signature });
  if (validationError) throw new TypeError(validationError);

  const firstImageType = file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
  const relativePath = `school-content/${randomUUID()}.${firstImageType}`;
  const root = await getBookStorageRoot();
  const directory = path.join(root, 'school-content');
  await mkdir(directory, { recursive: true, mode: 0o750 });
  await writeFile(path.join(root, relativePath), new Uint8Array(await file.arrayBuffer()), { flag: 'wx', mode: 0o640 });
  return relativePath;
}

export async function resolveSchoolImage(relativePath: string) {
  if (!isSafeSchoolImagePath(relativePath)) throw new Error('Unsafe school image path.');
  const root = await getBookStorageRoot();
  const resolved = await realpath(path.resolve(root, relativePath));
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('School image path escapes storage.');
  return resolved;
}

export async function removeSchoolImage(relativePath: string | null | undefined) {
  if (!relativePath) return;
  try {
    await unlink(await resolveSchoolImage(relativePath));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
