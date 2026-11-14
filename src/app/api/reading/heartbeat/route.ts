import { NextResponse } from 'next/server';
import { getReader, readJsonBody } from '@/lib/reader-auth';
import { recordHeartbeat } from '@/lib/reading-service';
import { parseHeartbeat } from '@/lib/reading-tracker.mjs';
import { prisma } from '@/lib/prisma';

const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Reading update from the reader (about once a minute while a signed-in student reads).
export async function POST(request: Request) {
  const reader = await getReader();
  if (!reader) return json({ tracked: false }); // anonymous reading is allowed, just not tracked
  const parsed = parseHeartbeat(await readJsonBody(request));
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const book = await prisma.book.findUnique({ where: { id: parsed.value.bookId }, select: { isPublished: true } });
  if (!book?.isPublished) return json({ error: 'Book not found.' }, 404);
  try {
    const result = await recordHeartbeat(reader.id, parsed.value);
    return json({ tracked: true, ...result });
  } catch (error) {
    console.error('[reading] Could not record reading update', error);
    return json({ error: 'Reading progress could not be saved right now.' }, 503);
  }
}
