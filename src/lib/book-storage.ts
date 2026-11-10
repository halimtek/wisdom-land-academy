import 'server-only';

import { mkdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { isSafeBookPath } from '@/lib/book-security.mjs';

export async function getBookStorageRoot() {
  const configured = process.env.BOOK_STORAGE_DIR;
  if (!configured || !path.isAbsolute(configured)) throw new Error('BOOK_STORAGE_DIR must be set to an absolute path.');
  await mkdir(configured, { recursive: true, mode: 0o750 });
  const root = await realpath(configured);
  const publicRoot = await realpath(path.resolve(process.cwd(), 'public'));
  if (root === publicRoot || root.startsWith(`${publicRoot}${path.sep}`)) {
    throw new Error('Book storage must be outside the public directory.');
  }
  return root;
}

export async function resolveBookPath(relativePath: string) {
  if (!isSafeBookPath(relativePath)) throw new Error('Unsafe stored book path.');
  const root = await getBookStorageRoot();
  const resolved = await realpath(path.resolve(root, relativePath));
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('Book path escapes the storage directory.');
  return { root, absolutePath: resolved };
}

export async function removeStoredBook(relativePath: string) {
  try {
    const { absolutePath } = await resolveBookPath(relativePath);
    await unlink(absolutePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
