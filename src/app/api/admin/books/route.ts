import { createWriteStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import * as z from 'zod';
import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';
import { MAX_PDF_BYTES, validatePdfUpload } from '@/lib/book-security.mjs';
import { getBookStorageRoot, removeStoredBook } from '@/lib/book-storage';
import { storeSchoolImage, removeSchoolImage } from '@/lib/school-media';
import { getCurrentUser } from '@/lib/auth';
import { roleIsAllowed } from '@/lib/auth-policy.mjs';
import { prisma } from '@/lib/prisma';

const MAX_MULTIPART_BYTES = MAX_PDF_BYTES + 1024 * 1024;
const MetadataSchema = z.object({
  title: z.string().trim().min(2).max(180),
  author: z.string().trim().max(120),
  description: z.string().trim().max(3000),
  bookType: z.enum(['GRADE_BASED', 'GENERAL']),
  gradeId: z.string().trim().max(100).optional(),
  subjectId: z.string().trim().max(100).optional(),
  accessAllStudents: z.boolean(),
  allowedGradeIds: z.array(z.string().trim().min(1).max(100)).optional(),
  isPublished: z.boolean(),
  bookId: z.string().trim().min(1).max(100).optional(),
});

async function readBoundedBody(request: Request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_MULTIPART_BYTES) throw new RangeError('Upload is too large.');
  if (!request.body) throw new TypeError('Upload body is missing.');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_MULTIPART_BYTES) {
        await reader.cancel();
        throw new RangeError('Upload is too large.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), total);
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!roleIsAllowed(user.role, ['ADMIN'])) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  let body: Buffer;
  let form: FormData;
  try {
    body = await readBoundedBody(request);
    const boundedBody = new Uint8Array(body.byteLength);
    boundedBody.set(body);
    const parserRequest = new Request(request.url, {
      method: 'POST',
      headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
      body: boundedBody,
    });
    form = await parserRequest.formData();
  } catch (error) {
    const status = error instanceof RangeError ? 413 : 400;
    return NextResponse.json({ error: status === 413 ? 'PDF uploads are limited to 25 MB.' : 'Invalid multipart upload.' }, { status });
  }

  if (form.getAll('title').length !== 1 || form.getAll('author').length !== 1 || form.getAll('description').length !== 1 || form.getAll('bookType').length !== 1 || form.getAll('gradeId').length !== 1 || form.getAll('subjectId').length !== 1 || form.getAll('isPublished').length > 1 || form.getAll('file').length > 1 || form.getAll('cover').length > 1 || form.getAll('bookId').length > 1) {
    return NextResponse.json({ error: 'Upload fields must each be provided once.' }, { status: 400 });
  }
  const publishValue = form.get('isPublished');
  if (publishValue !== null && publishValue !== 'on') {
    return NextResponse.json({ error: 'Invalid publication setting.' }, { status: 400 });
  }
  const accessAllValue = form.get('accessAllStudents');
  if (accessAllValue !== null && accessAllValue !== 'on') {
    return NextResponse.json({ error: 'Invalid access setting.' }, { status: 400 });
  }
  const allowedGradeIds = form.getAll('allowedGradeIds').filter((value): value is string => typeof value === 'string');
  const parsed = MetadataSchema.safeParse({
    title: form.get('title'),
    author: form.get('author'),
    description: form.get('description'),
    bookType: form.get('bookType'),
    gradeId: form.get('gradeId') || undefined,
    subjectId: form.get('subjectId') || undefined,
    accessAllStudents: accessAllValue === 'on',
    allowedGradeIds,
    isPublished: publishValue === 'on',
    bookId: form.get('bookId') || undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'Check the book details, grade, and subject.' }, { status: 400 });

  const fileValue = form.get('file');
  const file = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  const coverValue = form.get('cover');
  const coverFile = coverValue instanceof File && coverValue.size > 0 ? coverValue : null;
  if (!parsed.data.bookId && !file) return NextResponse.json({ error: 'Choose a PDF file.' }, { status: 400 });
  if (file) {
    const signature = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    const fileError = validatePdfUpload({ filename: file.name, mimeType: file.type, size: file.size, signature });
    if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });
  }

  const [subject, existingBook] = await Promise.all([
    parsed.data.bookType === 'GRADE_BASED' && parsed.data.subjectId
      ? prisma.subject.findUnique({ where: { id: parsed.data.subjectId }, select: { id: true, gradeId: true } })
      : Promise.resolve(null),
    parsed.data.bookId ? prisma.book.findUnique({ where: { id: parsed.data.bookId }, select: { id: true, filePath: true, coverImagePath: true } }) : Promise.resolve(null),
  ]);
  if (parsed.data.bookType === 'GRADE_BASED') {
    if (!parsed.data.gradeId || !parsed.data.subjectId) return NextResponse.json({ error: 'Choose a grade and subject.' }, { status: 400 });
    if (!subject || subject.gradeId !== parsed.data.gradeId) return NextResponse.json({ error: 'Choose a subject that belongs to the selected grade.' }, { status: 400 });
  }
  if (parsed.data.bookId && !existingBook) return NextResponse.json({ error: 'Book not found.' }, { status: 404 });

  let generatedPath: string | undefined;
  let generatedCoverPath: string | undefined;
  try {
    if (file) {
      const storageRoot = await getBookStorageRoot();
      generatedPath = `${randomUUID()}.pdf`;
      await pipeline(
        Readable.fromWeb(file.stream() as import('node:stream/web').ReadableStream),
        createWriteStream(path.join(storageRoot, generatedPath), { flags: 'wx', mode: 0o640 }),
      );
    }
    if (coverFile) {
      try {
        generatedCoverPath = await storeSchoolImage(coverFile);
      } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid cover image.' }, { status: 400 });
      }
    }

    if (existingBook) {
      if (generatedCoverPath && existingBook.coverImagePath) await removeSchoolImage(existingBook.coverImagePath).catch(() => undefined);
      const updated = await prisma.book.update({
        where: { id: existingBook.id },
        data: {
          title: parsed.data.title,
          author: parsed.data.author || null,
          description: parsed.data.description || null,
          bookType: parsed.data.bookType,
          subjectId: parsed.data.bookType === 'GRADE_BASED' ? parsed.data.subjectId ?? null : null,
          coverImagePath: generatedCoverPath ?? existingBook.coverImagePath ?? null,
          accessAllStudents: parsed.data.bookType === 'GENERAL' ? parsed.data.accessAllStudents : false,
          isPublished: parsed.data.isPublished,
          ...(generatedPath ? { filePath: generatedPath } : {}),
        },
        select: { id: true },
      });
      await prisma.bookGradeAccess.deleteMany({ where: { bookId: existingBook.id } });
      if (parsed.data.bookType === 'GENERAL' && !parsed.data.accessAllStudents && parsed.data.allowedGradeIds?.length) {
        await prisma.bookGradeAccess.createMany({
          data: parsed.data.allowedGradeIds.map((gradeId) => ({ bookId: existingBook.id, gradeId })),
          skipDuplicates: true,
        });
      }
      if (generatedPath) await removeStoredBook(existingBook.filePath).catch(() => undefined);
      revalidatePath('/');
      revalidatePath('/library');
      return NextResponse.json({ id: updated.id, message: 'Book updated.' });
    }

    const created = await prisma.book.create({
      data: {
        title: parsed.data.title,
        author: parsed.data.author || null,
        description: parsed.data.description || null,
        bookType: parsed.data.bookType,
        subjectId: parsed.data.bookType === 'GRADE_BASED' ? parsed.data.subjectId ?? null : null,
        filePath: generatedPath!,
        coverImagePath: generatedCoverPath ?? null,
        accessAllStudents: parsed.data.bookType === 'GENERAL' ? parsed.data.accessAllStudents : false,
        isPublished: parsed.data.isPublished,
      },
      select: { id: true },
    });
    if (parsed.data.bookType === 'GENERAL' && !parsed.data.accessAllStudents && parsed.data.allowedGradeIds?.length) {
      await prisma.bookGradeAccess.createMany({
        data: parsed.data.allowedGradeIds.map((gradeId) => ({ bookId: created.id, gradeId })),
        skipDuplicates: true,
      });
    }
    revalidatePath('/');
    revalidatePath('/library');
    return NextResponse.json({ id: created.id, message: 'Book added.' }, { status: 201 });
  } catch {
    if (generatedPath) await removeStoredBook(generatedPath).catch(() => undefined);
    if (generatedCoverPath) await removeSchoolImage(generatedCoverPath).catch(() => undefined);
    return NextResponse.json({ error: 'Book could not be saved. Check storage configuration and try again.' }, { status: 500 });
  }
}
