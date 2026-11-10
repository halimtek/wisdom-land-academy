import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { roleIsAllowed } from '@/lib/auth-policy.mjs';
import type { UserRole } from '@/generated/prisma/enums';
import { prisma } from '@/lib/prisma';

export const SESSION_COOKIE = 'wla_session';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;

export type AuthUser = { id: string; username: string; fullName: string; role: UserRole; gradeId: string | null };
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  await prisma.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: sha256(token) },
    select: { expiresAt: true, user: { select: { id: true, username: true, fullName: true, role: true, gradeId: true } } },
  });
  if (!session || session.expiresAt <= new Date()) return null;
  return session.user;
}

export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/');
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roleIsAllowed(user.role, roles)) redirect('/library');
  return user;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token && token.length <= 100) {
    await prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }
  jar.delete(SESSION_COOKIE);
}

export function loginAttemptKey(username: string, ip: string) {
  return sha256(`${username.toLowerCase()}:${ip}`);
}

export const loginLimits = { maxAttempts: 8, windowMs: 15 * 60 * 1000 };
