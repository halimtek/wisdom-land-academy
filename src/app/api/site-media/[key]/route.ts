import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { roleIsAllowed } from '@/lib/auth-policy.mjs';
import { prisma } from '@/lib/prisma';
import { isSafeSchoolImagePath } from '@/lib/school-content-security.mjs';
import { readObject, statObject } from '@/lib/storage';

type MediaFile = { imagePath: string; size: number; headers: Record<string, string> };

const notFound = (message = 'Image not found.') => NextResponse.json({ error: message }, { status: 404 });

/** Looks up the image for `key`, applies access rules, and checks the stored file. */
async function findMedia(key: string): Promise<MediaFile | Response> {
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
    if (!book) return notFound();
    if (!book.isPublished) {
      const user = await getCurrentUser();
      if (!user || !roleIsAllowed(user.role, ['ADMIN'])) return notFound();
    }
    imagePath = book.coverImagePath;
    publicCover = book.isPublished;
  } else {
    return notFound();
  }
  if (!imagePath) return notFound();

  try {
    if (!isSafeSchoolImagePath(imagePath)) throw new Error('Unsafe school image path.');
    // Local disk or private Supabase bucket (STORAGE_DRIVER); see src/lib/storage.ts.
    const info = await statObject(imagePath);
    if (!info) {
      console.warn(`[site-media] ${key}: stored image file is missing (${imagePath})`);
      return notFound('Image is unavailable.');
    }
    const contentType = imagePath.endsWith('.png') ? 'image/png' : imagePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    return {
      imagePath,
      size: info.size,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(info.size),
        'Cache-Control': publicCover ? 'public, max-age=3600, stale-while-revalidate=86400' : 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    };
  } catch (error) {
    // The response stays a plain 404, but the cause is recorded for the administrator.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn(`[site-media] ${key}: stored image file is missing (${imagePath})`);
    } else {
      console.error(`[site-media] ${key}: image could not be read`, error);
    }
    return notFound('Image is unavailable.');
  }
}

export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  const media = await findMedia(key);
  if (media instanceof Response) return media;
  try {
    const body = await readObject(media.imagePath, { start: 0, end: media.size - 1, size: media.size, label: `site-media ${key}` });
    return new Response(body, { headers: media.headers });
  } catch (error) {
    console.error(`[site-media] ${key}: image could not be read`, error);
    return notFound('Image is unavailable.');
  }
}

// Explicit HEAD: same headers and status as GET, without opening the file. (Without it,
// Next.js runs GET and discards the body, which leaked a file descriptor per request.)
export async function HEAD(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  const media = await findMedia(key);
  if (media instanceof Response) return new Response(null, { status: media.status, headers: media.headers });
  return new Response(null, { headers: media.headers });
}
