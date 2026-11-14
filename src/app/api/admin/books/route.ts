import * as z from 'zod';
import { NextResponse } from 'next/server';
import { MAX_PDF_BYTES } from '@/lib/book-security.mjs';
import { getCurrentUser } from '@/lib/auth';
import { roleIsAllowed } from '@/lib/auth-policy.mjs';
import { planBookFileUpdate } from '@/lib/book-update.mjs';
import { prisma } from '@/lib/prisma';
import { revalidatePublicPages } from '@/lib/revalidate-public';
import { removeObjectQuietly, StorageTimeoutError } from '@/lib/storage';
import { acceptUpload, hasUpload, UploadRejectedError } from '@/lib/uploads';

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
    return NextResponse.json({ error: status === 413 ? `PDF uploads are limited to ${MAX_PDF_BYTES / (1024 * 1024)} MB.` : 'Invalid multipart upload.' }, { status });
  }

  if (form.getAll('title').length !== 1 || form.getAll('author').length !== 1 || form.getAll('description').length !== 1 || form.getAll('bookType').length !== 1 || form.getAll('gradeId').length !== 1 || form.getAll('subjectId').length !== 1 || form.getAll('isPublished').length > 1 || form.getAll('file').length > 1 || form.getAll('cover').length > 1 || form.getAll('fileKey').length > 1 || form.getAll('coverKey').length > 1 || form.getAll('bookId').length > 1) {
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

  // The PDF and cover arrive either as files (local storage) or as keys of objects
  // the browser uploaded directly to Supabase Storage. Both are validated in acceptUpload().
  if (!parsed.data.bookId && !hasUpload(form, 'file')) return NextResponse.json({ error: 'Choose a PDF file.' }, { status: 400 });

  const [subject, existingBook] = await Promise.all([
    parsed.data.bookType === 'GRADE_BASED' && parsed.data.subjectId
      ? prisma.subject.findUnique({ where: { id: parsed.data.subjectId }, select: { id: true, gradeId: true } })
      : Promise.resolve(null),
    parsed.data.bookId ? prisma.book.findUnique({ where: { id: parsed.data.bookId }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (parsed.data.bookType === 'GRADE_BASED') {
    if (!parsed.data.gradeId || !parsed.data.subjectId) return NextResponse.json({ error: 'Choose a grade and subject.' }, { status: 400 });
    if (!subject || subject.gradeId !== parsed.data.gradeId) return NextResponse.json({ error: 'Choose a subject that belongs to the selected grade.' }, { status: 400 });
  }
  if (parsed.data.bookId && !existingBook) return NextResponse.json({ error: 'Book not found.' }, { status: 404 });

  let generatedPath: string | null = null;
  let generatedCoverPath: string | null = null;
  let committed = false;
  try {
    generatedPath = await acceptUpload('pdf', form, 'file');
    generatedCoverPath = await acceptUpload('image', form, 'cover');

    const grantAccess = parsed.data.bookType === 'GENERAL' && !parsed.data.accessAllStudents && parsed.data.allowedGradeIds?.length
      ? parsed.data.allowedGradeIds
      : null;

    if (existingBook) {
      // Book row and grade access change together or not at all. The row is locked
      // first, and file changes are decided from that locked row (not the earlier
      // read): concurrent edits cannot write back a cover/PDF path that another
      // edit already replaced and deleted, and only files this row really pointed
      // to are removed. Without a new upload, filePath/coverImagePath are not written.
      const outcome = await prisma.$transaction(async (tx) => {
        const [current] = await tx.$queryRaw<{ filePath: string; coverImagePath: string | null }[]>`
          SELECT "filePath", "coverImagePath" FROM "Book" WHERE "id" = ${existingBook.id} FOR UPDATE`;
        if (!current) return null; // deleted meanwhile
        const files = planBookFileUpdate(current, { newFilePath: generatedPath, newCoverPath: generatedCoverPath });
        const row = await tx.book.update({
          where: { id: existingBook.id },
          data: {
            title: parsed.data.title,
            author: parsed.data.author || null,
            description: parsed.data.description || null,
            bookType: parsed.data.bookType,
            subjectId: parsed.data.bookType === 'GRADE_BASED' ? parsed.data.subjectId ?? null : null,
            accessAllStudents: parsed.data.bookType === 'GENERAL' ? parsed.data.accessAllStudents : false,
            isPublished: parsed.data.isPublished,
            ...files.data,
          },
          select: { id: true },
        });
        await tx.bookGradeAccess.deleteMany({ where: { bookId: existingBook.id } });
        if (grantAccess) {
          await tx.bookGradeAccess.createMany({ data: grantAccess.map((gradeId) => ({ bookId: existingBook.id, gradeId })), skipDuplicates: true });
        }
        return { row, removeAfterCommit: files.removeAfterCommit };
      });
      if (!outcome) {
        await removeObjectQuietly(generatedPath, 'book deleted during update');
        await removeObjectQuietly(generatedCoverPath, 'book deleted during update');
        committed = true; // nothing left to clean up in the catch block
        return NextResponse.json({ error: 'Book not found.' }, { status: 404 });
      }
      committed = true;
      // Replaced files are removed only after the database points at the new ones.
      for (const oldKey of outcome.removeAfterCommit) await removeObjectQuietly(oldKey, `book ${existingBook.id} file replaced`);
      revalidatePublicPages();
      return NextResponse.json({ id: outcome.row.id, message: 'Book updated.' });
    }

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.book.create({
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
      if (grantAccess) {
        await tx.bookGradeAccess.createMany({ data: grantAccess.map((gradeId) => ({ bookId: row.id, gradeId })), skipDuplicates: true });
      }
      return row;
    });
    committed = true;
    revalidatePublicPages();
    return NextResponse.json({ id: created.id, message: 'Book added.' }, { status: 201 });
  } catch (error) {
    // Only files that no record points to are cleaned up; existing files are never touched here.
    if (!committed) {
      await removeObjectQuietly(generatedPath, 'book save failed');
      await removeObjectQuietly(generatedCoverPath, 'book save failed');
    }
    if (error instanceof UploadRejectedError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error('[admin/books] Book could not be saved', error);
    if (error instanceof StorageTimeoutError) return NextResponse.json({ error: 'File storage did not respond in time. Nothing was changed; please try again.' }, { status: 504 });
    return NextResponse.json({ error: 'Book could not be saved. Check storage configuration and try again.' }, { status: 500 });
  }
}
