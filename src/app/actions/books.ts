'use server';

import * as z from 'zod';
import { parsePublicationRequest, storageKeysToRemove } from '@/lib/admin-books.mjs';
import { requireRole } from '@/lib/auth';
import { removeObject } from '@/lib/storage';
import { localizeResult } from '@/i18n/server';
import { prisma } from '@/lib/prisma';
import { revalidatePublicPages } from '@/lib/revalidate-public';

export type BookActionState = { error?: string; success?: string };
export type PublicationResult = { error?: string; success?: string; updated?: number };
const IdSchema = z.string().trim().min(1).max(100);
const GradeNameSchema = z.string().trim().min(1).max(80);
const SubjectNameSchema = z.string().trim().min(1).max(100);

async function createGradeImpl(_state: BookActionState, formData: FormData): Promise<BookActionState> {
  await requireRole('ADMIN');
  const parsed = GradeNameSchema.safeParse(formData.get('name'));
  if (!parsed.success) return { error: 'Enter a grade name (up to 80 characters).' };

  try {
    await prisma.grade.create({ data: { name: parsed.data } });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return { error: 'That grade already exists.' };
    }
    throw error;
  }
  revalidatePublicPages(); // /academics lists grades
  return { success: 'Grade added. You can now add subjects for it.' };
}

async function createSubjectImpl(_state: BookActionState, formData: FormData): Promise<BookActionState> {
  await requireRole('ADMIN');
  const gradeId = IdSchema.safeParse(formData.get('gradeId'));
  const name = SubjectNameSchema.safeParse(formData.get('name'));
  if (!gradeId.success || !name.success) return { error: 'Choose a grade and enter a subject name (up to 100 characters).' };

  const grade = await prisma.grade.findUnique({ where: { id: gradeId.data }, select: { id: true } });
  if (!grade) return { error: 'That grade no longer exists. Refresh the page and try again.' };
  try {
    await prisma.subject.create({ data: { gradeId: grade.id, name: name.data } });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return { error: 'That subject already exists for this grade.' };
    }
    throw error;
  }
  revalidatePublicPages();
  return { success: 'Subject added to the selected grade.' };
}

async function storageReferenceCount(key: string) {
  const [books, content, settings] = await Promise.all([
    prisma.book.count({ where: { OR: [{ filePath: key }, { coverImagePath: key }] } }),
    prisma.schoolContent.count({ where: { imagePath: key } }),
    prisma.schoolSettings.count({ where: { OR: [{ logoImagePath: key }, { heroImagePath: key }] } }),
  ]);
  return books + content + settings;
}

/**
 * Deletes one book: the database row first (permissions and grade access cascade),
 * then its PDF and cover from storage — only files no other record still uses.
 * Books with student reading progress are never deleted.
 *
 * The row is locked (FOR UPDATE) and re-checked inside the transaction, so a
 * concurrent edit (which also locks the row) or new reading progress (whose foreign
 * key needs the row) cannot slip in between the check and the delete, and storage
 * cleanup uses exactly the files the deleted row pointed to.
 */
async function deleteBookByIdImpl(bookId: unknown): Promise<BookActionState> {
  await requireRole('ADMIN');
  const parsedId = IdSchema.safeParse(bookId);
  if (!parsedId.success) return { error: 'Invalid book.' };

  type Locked = { id: string; title: string; filePath: string; coverImagePath: string | null };
  let outcome: { kind: 'missing' } | { kind: 'has-progress'; title: string } | { kind: 'deleted'; book: Locked };
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const [row] = await tx.$queryRaw<Locked[]>`
        SELECT "id", "title", "filePath", "coverImagePath" FROM "Book" WHERE "id" = ${parsedId.data} FOR UPDATE`;
      if (!row) return { kind: 'missing' as const };
      if (await tx.readingProgress.count({ where: { bookId: row.id } }) > 0) return { kind: 'has-progress' as const, title: row.title };
      await tx.book.delete({ where: { id: row.id } });
      return { kind: 'deleted' as const, book: row };
    });
  } catch (error) {
    console.error(`[books] Could not delete book ${parsedId.data}`, error);
    return { error: 'The book could not be deleted. Nothing was changed; please try again.' };
  }
  if (outcome.kind === 'missing') return { error: 'This book no longer exists. The list has been refreshed.' };
  if (outcome.kind === 'has-progress') return { error: `“${outcome.title}” has student reading progress, so it cannot be deleted. Unpublish it instead.` };
  const { book } = outcome;
  revalidatePublicPages();

  const counts = new Map<string, number>();
  for (const key of [book.filePath, book.coverImagePath]) if (key) counts.set(key, await storageReferenceCount(key));
  const failed: string[] = [];
  for (const key of storageKeysToRemove(book, (key) => counts.get(key) ?? 1)) {
    try {
      await removeObject(key);
    } catch (error) {
      failed.push(key);
      console.error(`[storage] Could not remove ${key} (book ${book.id} deleted)`, error);
    }
  }
  if (failed.length) return { success: `“${book.title}” was deleted. Its stored file could not be removed and has been logged for cleanup.` };
  return { success: `“${book.title}” was deleted.` };
}

/**
 * Publishes or unpublishes one or more books. Validated and authorized on the
 * server; only books whose state actually changes are updated.
 */
async function setBooksPublicationImpl(input: unknown): Promise<PublicationResult> {
  await requireRole('ADMIN');
  const request = parsePublicationRequest(input);
  if (!request.ok) return { error: request.error };

  const { count } = await prisma.book.updateMany({
    where: { id: { in: request.ids }, isPublished: !request.publish },
    data: { isPublished: request.publish },
  });
  if (count > 0) revalidatePublicPages();
  const verb = request.publish ? 'published' : 'unpublished';
  if (count === 0) return { success: request.ids.length === 1 ? `The book is already ${verb}.` : `The selected books are already ${verb}.`, updated: 0 };
  return { success: `${count} ${count === 1 ? 'book' : 'books'} ${verb}.`, updated: count };
}

async function grantBookPermissionImpl(_state: BookActionState, formData: FormData): Promise<BookActionState> {
  await requireRole('ADMIN');
  const bookId = IdSchema.safeParse(formData.get('bookId'));
  const userId = IdSchema.safeParse(formData.get('userId'));
  if (!bookId.success || !userId.success) return { error: 'Choose a book and student.' };

  const student = await prisma.user.findUnique({ where: { id: userId.data }, select: { id: true, role: true } });
  if (!student || student.role !== 'STUDENT') return { error: 'Permissions can only be granted to student accounts.' };
  const book = await prisma.book.findUnique({ where: { id: bookId.data }, select: { id: true } });
  if (!book) return { error: 'Book not found.' };
  await prisma.bookPermission.upsert({
    where: { userId_bookId: { userId: student.id, bookId: book.id } },
    create: { userId: student.id, bookId: book.id },
    update: {},
  });
  return { success: 'Student access granted.' };
}

async function revokeBookPermissionImpl(_state: BookActionState, formData: FormData): Promise<BookActionState> {
  await requireRole('ADMIN');
  const bookId = IdSchema.safeParse(formData.get('bookId'));
  const userId = IdSchema.safeParse(formData.get('userId'));
  if (!bookId.success || !userId.success) return { error: 'Invalid permission.' };
  await prisma.bookPermission.deleteMany({ where: { bookId: bookId.data, userId: userId.data } });
  return { success: 'Student access removed.' };
}

// Exported actions return their messages in the visitor's language.
export async function createGrade(...args: Parameters<typeof createGradeImpl>) { return localizeResult(await createGradeImpl(...args)); }
export async function createSubject(...args: Parameters<typeof createSubjectImpl>) { return localizeResult(await createSubjectImpl(...args)); }
export async function deleteBookById(...args: Parameters<typeof deleteBookByIdImpl>) { return localizeResult(await deleteBookByIdImpl(...args)); }
export async function setBooksPublication(...args: Parameters<typeof setBooksPublicationImpl>) { return localizeResult(await setBooksPublicationImpl(...args)); }
export async function grantBookPermission(...args: Parameters<typeof grantBookPermissionImpl>) { return localizeResult(await grantBookPermissionImpl(...args)); }
export async function revokeBookPermission(...args: Parameters<typeof revokeBookPermissionImpl>) { return localizeResult(await revokeBookPermissionImpl(...args)); }
