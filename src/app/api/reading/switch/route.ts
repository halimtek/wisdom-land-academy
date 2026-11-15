import { localizedJson } from '@/i18n/server';
import argon2 from 'argon2';
import * as z from 'zod';
import { prisma } from '@/lib/prisma';
import { pinLimits, readJsonBody, recordAttempt, rememberedProfiles, startReaderSession, touchProfile } from '@/lib/reader-auth';

const Body = z.object({
  profileId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  pin: z.string().regex(/^\d{4}$/).optional(),
  password: z.string().min(1).max(256).optional(),
}).refine((b) => Boolean(b.pin) !== Boolean(b.password), 'Enter a PIN or a password.');
// Error messages are returned in the visitor's language.
const json = (body: object, status = 200) => localizedJson(body, { status, headers: { 'Cache-Control': 'no-store' } });

// Switch to a student remembered on THIS device: needs the device token (cookie) and
// the student's PIN (or password when no PIN is set). Rate limited per profile.
export async function POST(request: Request) {
  const parsed = Body.safeParse(await readJsonBody(request));
  if (!parsed.success) return json({ error: 'Enter your 4-digit PIN.' }, 400);
  const profile = (await rememberedProfiles()).find((p) => p.id === parsed.data.profileId);
  if (!profile) return json({ error: 'This reader is no longer remembered on this iPad. Please sign in again.' }, 404);

  const attempt = await recordAttempt(`reader-pin:${profile.id}`, pinLimits);
  if (!attempt.allowed) return json({ error: 'Too many wrong tries. Wait 15 minutes, or sign in with your username and password.' }, 429);
  const user = await prisma.user.findUnique({ where: { id: profile.userId }, select: { passwordHash: true, readingPinHash: true } });
  if (!user) return json({ error: 'This reader no longer exists.' }, 404);
  let valid = false;
  if (parsed.data.pin) valid = Boolean(user.readingPinHash) && await argon2.verify(user.readingPinHash!, parsed.data.pin).catch(() => false);
  else if (parsed.data.password) valid = await argon2.verify(user.passwordHash, parsed.data.password).catch(() => false);
  if (!valid) return json({ error: parsed.data.pin ? 'That PIN is not right. Try again.' : 'That password is not right. Try again.' }, 401);

  await attempt.clear();
  await startReaderSession(profile.userId);
  await touchProfile(profile.id);
  return json({ ok: true, firstName: profile.firstName });
}
