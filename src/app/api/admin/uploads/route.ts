import * as z from 'zod';
import { NextResponse } from 'next/server';
import { localizedJson } from '@/i18n/server';
import { getCurrentUser } from '@/lib/auth';
import { roleIsAllowed } from '@/lib/auth-policy.mjs';
import { createSignedUpload, storageDriver, StorageTimeoutError } from '@/lib/storage';
import { planDirectUpload, UploadRejectedError } from '@/lib/uploads';

const RequestSchema = z.object({
  kind: z.enum(['pdf', 'image']),
  filename: z.string().min(1).max(255),
  contentType: z.string().max(100),
  size: z.number().int().nonnegative(),
});

/**
 * Admin only. Prepares a direct browser upload so large files never pass through
 * this server (Vercel limits request bodies to 4.5 MB):
 * - Supabase storage: validates name/type/size and returns a signed upload URL for
 *   a new, random object key. The URL only allows creating that one object.
 * - Local storage: returns { direct: false }; the form sends the file as before.
 * The uploaded bytes are verified again when the form that uses the key is saved.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return localizedJson({ error: 'Authentication required.' }, { status: 401 });
  if (!roleIsAllowed(user.role, ['ADMIN'])) return localizedJson({ error: 'Administrator access required.' }, { status: 403 });

  const parsed = RequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return localizedJson({ error: 'Invalid upload request.' }, { status: 400 });

  if (storageDriver() !== 'supabase') return NextResponse.json({ direct: false }, { headers: { 'Cache-Control': 'no-store' } });

  try {
    const key = planDirectUpload(parsed.data.kind, parsed.data);
    const uploadUrl = await createSignedUpload(key);
    return NextResponse.json(
      { direct: true, key, uploadUrl, headers: { 'Content-Type': parsed.data.contentType, 'x-upsert': 'false' } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof UploadRejectedError) return localizedJson({ error: error.message }, { status: 400 });
    console.error('[uploads] Could not prepare a direct upload', error);
    if (error instanceof StorageTimeoutError) return localizedJson({ error: 'File storage did not respond in time. Try again.' }, { status: 504 });
    return localizedJson({ error: 'File storage is unavailable. Try again later.' }, { status: 503 });
  }
}
