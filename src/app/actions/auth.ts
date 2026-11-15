'use server';

import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import * as z from 'zod';
import { createSession, destroySession, loginAttemptKey, loginLimits } from '@/lib/auth';
import { localePath } from '@/i18n/locales.mjs';
import { localizeResult, requestLocale } from '@/i18n/server';
import { prisma } from '@/lib/prisma';

const LoginSchema = z.object({
  loginMode: z.literal('ADMIN'),
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256),
});

type LoginState = { error?: string };
let fallbackHash: Promise<string> | undefined;

export async function login(state: LoginState, formData: FormData): Promise<LoginState> {
  // Errors are returned in the visitor's language; success redirects to the admin area.
  return localizeResult(await attemptLogin(state, formData));
}

async function attemptLogin(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({ loginMode: formData.get('loginMode'), username: formData.get('username'), password: formData.get('password') });
  if (!parsed.success) return { error: 'Choose an account type and enter your username and password.' };

  const { username, password } = parsed.data;
  const requestHeaders = await headers();
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || 'unknown';
  const keyHash = loginAttemptKey(username, ip);
  const now = new Date();
  const windowStartedBefore = new Date(now.getTime() - loginLimits.windowMs);
  const [attempt] = await prisma.$queryRaw<{ attempts: number }[]>`
    INSERT INTO "LoginAttempt" ("keyHash", "attempts", "windowStart", "updatedAt")
    VALUES (${keyHash}, 1, ${now}, ${now})
    ON CONFLICT ("keyHash") DO UPDATE SET
      "attempts" = CASE WHEN "LoginAttempt"."windowStart" <= ${windowStartedBefore} THEN 1 ELSE "LoginAttempt"."attempts" + 1 END,
      "windowStart" = CASE WHEN "LoginAttempt"."windowStart" <= ${windowStartedBefore} THEN ${now} ELSE "LoginAttempt"."windowStart" END,
      "updatedAt" = ${now}
    RETURNING "attempts"
  `;
  if (attempt.attempts > loginLimits.maxAttempts) {
    return { error: 'Too many attempts. Please wait 15 minutes and try again.' };
  }

  const user = await prisma.user.findUnique({ where: { username }, select: { id: true, passwordHash: true, role: true } });
  fallbackHash ??= argon2.hash(randomBytes(32));
  const validPassword = await argon2.verify(user?.passwordHash ?? await fallbackHash, password).catch(() => false);
  if (!user || !validPassword || user.role !== 'ADMIN') {
    return { error: 'The username or password is incorrect.' };
  }

  await prisma.loginAttempt.deleteMany({ where: { keyHash } });
  await createSession(user.id);
  redirect(localePath(await requestLocale(), '/admin'));
}

export async function logout() {
  await destroySession();
  redirect(localePath(await requestLocale(), '/'));
}
