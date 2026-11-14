import 'server-only';

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@/generated/prisma/client';
import { resolveQueryEngineLibrary } from '@/lib/prisma-engine.mjs';

// Point Prisma at the Query Engine shipped in <cwd>/src/generated/prisma (see
// src/lib/prisma-engine.mjs). Required on Vercel; a no-op when the variable is
// already set or the engine is found elsewhere. Must run before the first query.
const engineLibrary = resolveQueryEngineLibrary({
  env: process.env,
  platform: process.platform,
  cwd: process.cwd(),
  readOsRelease: () => { try { return readFileSync('/etc/os-release', 'utf8'); } catch { return null; } },
  exists: existsSync,
  list: (dir) => { try { return readdirSync(dir); } catch { return []; } },
  join: path.join,
});
if (engineLibrary) process.env.PRISMA_QUERY_ENGINE_LIBRARY = engineLibrary;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
