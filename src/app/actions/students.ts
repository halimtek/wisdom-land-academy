'use server';

import argon2 from 'argon2';
import * as z from 'zod';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export type StudentActionState = { error?: string; success?: string };

const CreateStudentSchema = z.object({
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  fullName: z.string().trim().min(2).max(120),
  gradeId: z.string().trim().min(1).max(100),
  password: z.string().min(12).max(256),
  confirmPassword: z.string().min(12).max(256),
}).refine((value) => value.password === value.confirmPassword, {
  path: ['confirmPassword'],
  message: 'Passwords do not match.',
});

export async function createStudent(_state: StudentActionState, formData: FormData): Promise<StudentActionState> {
  await requireRole('ADMIN');

  const parsed = CreateStudentSchema.safeParse({
    username: formData.get('username'),
    fullName: formData.get('fullName'),
    gradeId: formData.get('gradeId'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
  });
  if (!parsed.success) {
    const passwordMismatch = parsed.error.issues.some((issue) => issue.path.includes('confirmPassword'));
    return { error: passwordMismatch ? 'Passwords do not match.' : 'Check the username, name, grade, and password. Passwords must be at least 12 characters.' };
  }

  const username = parsed.data.username.toLowerCase();
  const [grade, existingUser] = await Promise.all([
    prisma.grade.findUnique({ where: { id: parsed.data.gradeId }, select: { id: true } }),
    prisma.user.findFirst({ where: { username: { equals: username, mode: 'insensitive' } }, select: { id: true } }),
  ]);
  if (!grade) return { error: 'Choose an existing grade.' };
  if (existingUser) return { error: 'That username is already in use.' };

  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  try {
    await prisma.user.create({
      data: {
        username,
        fullName: parsed.data.fullName,
        gradeId: grade.id,
        passwordHash,
        role: 'STUDENT',
      },
      select: { id: true },
    });
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return { error: 'That username is already in use.' };
    }
    throw error;
  }

  return { success: `Student account @${username} created. The temporary password is not stored in plain text; share it with the student through your school-approved channel.` };
}
