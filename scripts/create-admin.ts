import 'dotenv/config';
import { createInterface } from 'node:readline';
import { emitKeypressEvents } from 'node:readline';
import argon2 from 'argon2';
import * as z from 'zod';
import { PrismaClient } from '../src/generated/prisma/client';
const prisma = new PrismaClient();

const AccountSchema = z.object({
  username: z.string().trim().min(3).max(80).regex(/^[a-zA-Z0-9._-]+$/),
  fullName: z.string().trim().min(2).max(120),
  password: z.string().min(12).max(256),
});

function ask(question: string) {
  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise<string>((resolve) => terminal.question(question, (answer) => { terminal.close(); resolve(answer.trim()); }));
}

async function askHidden(question: string) {
  if (!process.stdin.isTTY || !process.stdin.setRawMode) throw new Error('Run this command in an interactive terminal so the password can be entered safely.');
  process.stdout.write(question);
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise<string>((resolve, reject) => {
    let value = '';
    const done = (error?: Error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.off('keypress', onKey);
      process.stdout.write('\n');
      if (error) reject(error); else resolve(value);
    };
    const onKey = (character: string, key: { name?: string; ctrl?: boolean }) => {
      if (key.ctrl && key.name === 'c') return done(new Error('Cancelled.'));
      if (key.name === 'return' || key.name === 'enter') return done();
      if (key.name === 'backspace') { value = value.slice(0, -1); return; }
      if (character && !key.ctrl) value += character;
    };
    process.stdin.on('keypress', onKey);
  });
}

async function main() {
  const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  if (existingAdmin) throw new Error('An administrator already exists. This setup command is only for the initial account.');

  const username = await ask('Administrator username: ');
  const fullName = await ask('Administrator full name: ');
  const password = await askHidden('Password (12+ characters, input hidden): ');
  const confirmation = await askHidden('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');
  const validated = AccountSchema.safeParse({ username, fullName, password });
  if (!validated.success) throw new Error(validated.error.issues.map((issue) => issue.message).join(' '));

  const passwordHash = await argon2.hash(validated.data.password, { type: argon2.argon2id });
  await prisma.user.create({ data: { username: validated.data.username, fullName: validated.data.fullName, passwordHash, role: 'ADMIN' } });
  process.stdout.write(`Administrator account "${validated.data.username}" created.\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Unable to create administrator.'}\n`);
  process.exitCode = 1;
}).finally(async () => prisma.$disconnect());
