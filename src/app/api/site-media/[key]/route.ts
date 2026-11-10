import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { roleIsAllowed } from '@/lib/auth-policy.mjs';
import { prisma } from '@/lib/prisma';
import { resolveSchoolImage } from '@/lib/school-media';

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  let imagePath: string | null = null;
    let publicCover = false;
  if (key === 'logo' || key === 'hero') {
    const settings = await prisma.schoolSettings.findUnique({ where: { id: 'main' }, select: { logoImagePath: true, heroImagePath: true } });
    imagePath = key === 'logo' ? settings?.logoImagePath ?? null : settings?.heroImagePath ?? null;
  } else if (key.startsWith('content-')) {
    const id = key.slice('content-'.length);
    const content = await prisma.schoolContent.findFirst({ where: { id, isPublished: true }, select: { imagePath: true } });
    imagePath = content?.imagePath ?? null;
  } else if (key.startsWith('book-cover-')) {
    const id = key.slice('book-cover-'.length);
    const book = await prisma.book.findUnique({ where: { id }, select: { coverImagePath: true, isPublished: true } });
    if (!book) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
    if (!book.isPublished) {
      const user = await getCurrentUser();
      if (!user || !roleIsAllowed(user.role, ['ADMIN'])) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
    }
    imagePath = book.coverImagePath;
        publicCover = book.isPublished;
  } else {
    return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  }
  if (!imagePath) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });

  try {
    const absolutePath = await resolveSchoolImage(imagePath);
    const info = await stat(absolutePath);
    if (!info.isFile()) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
    const contentType = imagePath.endsWith('.png') ? 'image/png' : imagePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return new Response(Readable.toWeb(createReadStream(absolutePath)) as ReadableStream<Uint8Array>, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(info.size),
        'Cache-Control': publicCover ? 'public, max-age=3600, stale-while-revalidate=86400' : 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch {
    return NextResponse.json({ error: 'Image is unavailable.' }, { status: 404 });
  }
}
