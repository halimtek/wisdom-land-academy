'use server';

import * as z from 'zod';
import { requireRole } from '@/lib/auth';
import { removeStoredBook } from '@/lib/book-storage';
import { prisma } from '@/lib/prisma';
import { revalidatePublicPages } from '@/lib/revalidate-public';

export type BookActionState = { error?: string; success?: string };
const IdSchema = z.string().trim().min(1).max(100);
const GradeNameSchema = z.string().trim().min(1).max(80);
const SubjectNameSchema = z.string().trim().min(1).max(100);

export async function createGrade(_state: BookActionState, formData: FormData): Promise<BookActionState> {
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

export async function createSubject(_state: BookActionState, formData: FormData): Promise<BookActionState> {
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

export async function deleteBook(_state: BookActionState, formData: FormData): Promise<BookActionState> {
  await requireRole('ADMIN');
  const parsedId = IdSchema.safeParse(formData.get('bookId'));
  if (!parsedId.success) return { error: 'Invalid book.' };

  const book = await prisma.book.findUnique({
    where: { id: parsedId.data },
    select: { id: true, filePath: true, _count: { select: { progress: true } } },
  });
  if (!book) return { error: 'Book not found.' };
  if (book._count.progress > 0) return { error: 'This book has student reading progress, so it cannot be deleted.' };

  await prisma.book.delete({ where: { id: book.id } });
  await removeStoredBook(book.filePath).catch(() => undefined);
  revalidatePublicPages();
  return { success: 'Book deleted.' };
}

export async function grantBookPermission(_state: BookActionState, formData: FormData): Promise<BookActionState> {
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

export async function revokeBookPermission(_state: BookActionState, formData: FormData): Promise<BookActionState> {
  await requireRole('ADMIN');
  const bookId = IdSchema.safeParse(formData.get('bookId'));
  const userId = IdSchema.safeParse(formData.get('userId'));
  if (!bookId.success || !userId.success) return { error: 'Invalid permission.' };
  await prisma.bookPermission.deleteMany({ where: { bookId: bookId.data, userId: userId.data } });
  return { success: 'Student access removed.' };
}
