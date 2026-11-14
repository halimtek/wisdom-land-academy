import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

/*
 * "Who's reading?" sign-in for students on shared family iPads.
 *
 * - The active reader uses its own cookie (wla_reader), separate from the admin
 *   session cookie (wla_session) that the admin pages check. It is backed by a
 *   normal Session row with a short lifetime, and only STUDENT accounts are accepted.
 * - Students who signed in on a device once are remembered there (wla_readers cookie:
 *   up to 6 "profileId.token" pairs; only token hashes are stored in ReaderProfile).
 *   Switching to a remembered student needs that device token AND the student's
 *   4-digit PIN (or password if no PIN is set). PIN attempts are rate limited.
 */

export const READER_COOKIE = 'wla_reader';
export const PROFILES_COOKIE = 'wla_readers';
const READER_SESSION_MS = 12 * 60 * 60 * 1000;
const PROFILE_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_PROFILES = 6;
export const pinLimits = { maxAttempts: 5, windowMs: 15 * 60 * 1000 };

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieOptions = (expires: Date) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', expires });

export type Reader = { id: string; fullName: string; firstName: string; gradeName: string | null };
export type RememberedProfile = { id: string; userId: string; fullName: string; firstName: string; gradeName: string | null; hasPin: boolean };

const firstName = (fullName: string) => fullName.trim().split(/\s+/)[0] ?? fullName;

/** The signed-in reader (students only), or null. */
export async function getReader(): Promise<Reader | null> {
  const token = (await cookies()).get(READER_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { expiresAt: true, user: { select: { id: true, fullName: true, role: true, grade: { select: { name: true } } } } },
  });
  if (!session || session.expiresAt <= new Date() || session.user.role !== 'STUDENT') return null;
  return { id: session.user.id, fullName: session.user.fullName, firstName: firstName(session.user.fullName), gradeName: session.user.grade?.name ?? null };
}

export async function startReaderSession(userId: string) {
  await endReaderSession();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + READER_SESSION_MS);
  await prisma.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  (await cookies()).set(READER_COOKIE, token, cookieOptions(expiresAt));
}

export async function endReaderSession() {
  const jar = await cookies();
  const token = jar.get(READER_COOKIE)?.value;
  if (token && token.length <= 100) await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(READER_COOKIE);
}

function parseProfileCookie(value: string | undefined) {
  if (!value || value.length > 2000) return [];
  return value.split('|').map((part) => part.split('.')).filter((p) => p.length === 2 && /^[A-Za-z0-9_-]{1,64}$/.test(p[0]) && /^[A-Za-z0-9_-]{20,64}$/.test(p[1]))
    .slice(0, MAX_PROFILES).map(([id, token]) => ({ id, token }));
}

async function writeProfileCookie(entries: { id: string; token: string }[]) {
  const jar = await cookies();
  if (!entries.length) { jar.delete(PROFILES_COOKIE); return; }
  jar.set(PROFILES_COOKIE, entries.map((e) => `${e.id}.${e.token}`).join('|'), cookieOptions(new Date(Date.now() + PROFILE_MS)));
}

/** Students remembered on this device (verified against the database). */
export async function rememberedProfiles({ prune = false } = {}): Promise<RememberedProfile[]> {
  const entries = parseProfileCookie((await cookies()).get(PROFILES_COOKIE)?.value);
  if (!entries.length) return [];
  const rows = await prisma.readerProfile.findMany({
    where: { id: { in: entries.map((e) => e.id) }, expiresAt: { gt: new Date() } },
    select: { id: true, tokenHash: true, user: { select: { id: true, fullName: true, role: true, readingPinHash: true, grade: { select: { name: true } } } } },
  });
  const valid: RememberedProfile[] = [];
  const keep: { id: string; token: string }[] = [];
  for (const entry of entries) {
    const row = rows.find((r) => r.id === entry.id);
    if (!row || row.tokenHash !== sha256(entry.token) || row.user.role !== 'STUDENT') continue;
    keep.push(entry);
    valid.push({ id: row.id, userId: row.user.id, fullName: row.user.fullName, firstName: firstName(row.user.fullName), gradeName: row.user.grade?.name ?? null, hasPin: Boolean(row.user.readingPinHash) });
  }
  if (prune && keep.length !== entries.length) await writeProfileCookie(keep);
  return valid;
}

/** Remembers a student on this device (after a password sign-in). */
export async function rememberProfile(userId: string) {
  const entries = parseProfileCookie((await cookies()).get(PROFILES_COOKIE)?.value);
  const existing = (await rememberedProfiles()).find((p) => p.userId === userId);
  if (existing) {
    await prisma.readerProfile.update({ where: { id: existing.id }, data: { lastUsedAt: new Date(), expiresAt: new Date(Date.now() + PROFILE_MS) } });
    await writeProfileCookie([entries.find((e) => e.id === existing.id)!, ...entries.filter((e) => e.id !== existing.id)]);
    return;
  }
  const token = randomBytes(24).toString('base64url');
  const profile = await prisma.readerProfile.create({ data: { userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + PROFILE_MS) }, select: { id: true } });
  const next = [{ id: profile.id, token }, ...entries];
  const dropped = next.slice(MAX_PROFILES);
  if (dropped.length) await prisma.readerProfile.deleteMany({ where: { id: { in: dropped.map((d) => d.id) } } });
  await writeProfileCookie(next.slice(0, MAX_PROFILES));
}

export async function forgetProfile(profileId: string) {
  const entries = parseProfileCookie((await cookies()).get(PROFILES_COOKIE)?.value);
  const entry = entries.find((e) => e.id === profileId);
  if (!entry) return false;
  await prisma.readerProfile.deleteMany({ where: { id: profileId, tokenHash: sha256(entry.token) } });
  await writeProfileCookie(entries.filter((e) => e.id !== profileId));
  return true;
}

export async function touchProfile(profileId: string) {
  await prisma.readerProfile.update({ where: { id: profileId }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
}

/**
 * Counts one attempt for `key` within the window; returns false once the limit is
 * exceeded. Uses the existing LoginAttempt table (only a hash of the key is stored).
 */
export async function recordAttempt(key: string, limits: { maxAttempts: number; windowMs: number }) {
  const keyHash = sha256(key);
  const now = new Date();
  const windowStartedBefore = new Date(now.getTime() - limits.windowMs);
  const [attempt] = await prisma.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "LoginAttempt" ("keyHash", "attempts", "windowStart", "updatedAt")
    VALUES (${keyHash}, 1, ${now}, ${now})
    ON CONFLICT ("keyHash") DO UPDATE SET
      "attempts" = CASE WHEN "LoginAttempt"."windowStart" <= ${windowStartedBefore} THEN 1 ELSE "LoginAttempt"."attempts" + 1 END,
      "windowStart" = CASE WHEN "LoginAttempt"."windowStart" <= ${windowStartedBefore} THEN ${now} ELSE "LoginAttempt"."windowStart" END,
      "updatedAt" = ${now}
    RETURNING "attempts"`;
  return { allowed: attempt.attempts <= limits.maxAttempts, clear: () => prisma.loginAttempt.deleteMany({ where: { keyHash } }) };
}

/** JSON body for the reader endpoints: same-origin JSON only, small. */
export async function readJsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  const text = await request.text().catch(() => '');
  if (!text || text.length > 20_000) return null;
  try { return JSON.parse(text); } catch { return null; }
}
