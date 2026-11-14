import { NextResponse } from 'next/server';
import * as z from 'zod';
import { endReaderSession, forgetProfile, getReader, readJsonBody, rememberedProfiles } from '@/lib/reader-auth';

const Body = z.object({ profileId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) });

// Removes a remembered student from this device.
export async function POST(request: Request) {
  const parsed = Body.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const [profile, reader] = await Promise.all([(await rememberedProfiles()).find((p) => p.id === parsed.data.profileId), getReader()]);
  if (profile && reader?.id === profile.userId) await endReaderSession();
  await forgetProfile(parsed.data.profileId);
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
