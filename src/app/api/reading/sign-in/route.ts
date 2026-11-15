import { localizedJson } from '@/i18n/server';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import * as z from 'zod';
import { loginLimits } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readJsonBody, recordAttempt, rememberProfile, startReaderSession } from '@/lib/reader-auth';

const Body = z.object({ username: z.string().trim().min(1).max(80), password: z.string().min(1).max(256) });
let fallbackHash: Promise<string> | undefined;
// Error messages are returned in the visitor's language.
const json = (body: object, status = 200) => localizedJson(body, { status, headers: { 'Cache-Control': 'no-store' } });

// First sign-in of a student on this device (username + password). Students only.
export async function POST(request: Request) {
  const parsed = Body.safeParse(await readJsonBody(request));
  if (!parsed.success) return json({ error: 'Enter your username and password.' }, 400);
  const username = parsed.data.username.toLowerCase();
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const attempt = await recordAttempt(`reader:${username}:${ip}`, loginLimits);
  if (!attempt.allowed) return json({ error: 'Too many attempts. Please wait 15 minutes and try again.' }, 429);

  const user = await prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } }, select: { id: true, passwordHash: true, role: true, fullName: true } });
  fallbackHash ??= argon2.hash(randomBytes(32));
  const valid = await argon2.verify(user?.passwordHash ?? await fallbackHash, parsed.data.password).catch(() => false);
  if (!user || !valid || user.role !== 'STUDENT') return json({ error: 'The username or password is incorrect.' }, 401);

  await attempt.clear();
  await startReaderSession(user.id);
  await rememberProfile(user.id);
  return json({ ok: true, firstName: user.fullName.trim().split(/\s+/)[0] });
}
