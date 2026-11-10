import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { canReadPublishedBook, etagMatches, ifRangeAllowsRange, makePdfEtag, parsePdfRange } from '@/lib/book-security.mjs';
import { resolveBookPath } from '@/lib/book-storage';
import { prisma } from '@/lib/prisma';

/**
 * Public delivery of PUBLISHED books only. Unpublished and unknown ids both return 404.
 * Responses are revalidated every time (ETag + must-revalidate) so unpublishing or replacing
 * a book takes effect immediately, while browsers can still reuse bytes and get cheap 304s.
 */
async function serve(request: Request, context: { params: Promise<{ id: string }> }, headOnly: boolean) {
  const { id } = await context.params;
  const book = await prisma.book.findUnique({ where: { id }, select: { id: true, filePath: true, isPublished: true } });
  if (!book || !canReadPublishedBook(book)) return NextResponse.json({ error: 'Book not found.' }, { status: 404 });

  try {
    const { absolutePath } = await resolveBookPath(book.filePath);
    const fileInfo = await stat(absolutePath);
    if (!fileInfo.isFile()) return NextResponse.json({ error: 'Book file is unavailable.' }, { status: 404 });

    const etag = makePdfEtag(fileInfo);
    const lastModified = fileInfo.mtime.toUTCString();
    const baseHeaders = {
      ETag: etag,
      'Last-Modified': lastModified,
      'Cache-Control': 'public, max-age=0, must-revalidate',
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Range',
    };

    if (etagMatches(request.headers.get('if-none-match'), etag)) {
      return new Response(null, { status: 304, headers: baseHeaders });
    }

    const rangeHeader = ifRangeAllowsRange(request.headers.get('if-range'), etag, lastModified) ? request.headers.get('range') : null;
    const range = parsePdfRange(rangeHeader, fileInfo.size);
    if (range.kind === 'invalid') {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${fileInfo.size}`, 'Cache-Control': 'no-store' } });
    }

    const partial = range.kind === 'range';
    const start = range.kind === 'range' ? range.start : 0;
    const end = range.kind === 'range' ? range.end : fileInfo.size - 1;
    const length = fileInfo.size === 0 ? 0 : end - start + 1;
    const headers = new Headers({
      ...baseHeaders,
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="book-${id.replace(/[^a-zA-Z0-9_-]/g, '')}.pdf"`,
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'self'",
      'Content-Length': String(length),
    });
    if (partial) headers.set('Content-Range', `bytes ${start}-${end}/${fileInfo.size}`);
    if (headOnly || length === 0) return new Response(null, { status: partial ? 206 : 200, headers });

    const stream = Readable.toWeb(createReadStream(absolutePath, { start, end }));
    return new Response(stream as ReadableStream<Uint8Array>, { status: partial ? 206 : 200, headers });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return NextResponse.json({ error: 'Book file is unavailable.' }, { status: 404 });
    }
    if (error instanceof Error && /storage|path/i.test(error.message)) {
      return NextResponse.json({ error: 'Book storage is unavailable.' }, { status: 503 });
    }
    return NextResponse.json({ error: 'Book file is unavailable.' }, { status: 404 });
  }
}

export function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  return serve(request, context, false);
}

export function HEAD(request: Request, context: { params: Promise<{ id: string }> }) {
  return serve(request, context, true);
}