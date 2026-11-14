import 'server-only';

import { isSafeSchoolImagePath } from '@/lib/school-content-security.mjs';
import { removeObject } from '@/lib/storage';
import { storeUploadedFile } from '@/lib/uploads';

/** Validates and stores a school image (logo, hero, content photo, book cover); returns its key. */
export async function storeSchoolImage(file: File) {
  return storeUploadedFile('image', file);
}

export async function removeSchoolImage(relativePath: string | null | undefined) {
  if (!relativePath) return;
  if (!isSafeSchoolImagePath(relativePath)) throw new Error('Unsafe school image path.');
  await removeObject(relativePath);
}
