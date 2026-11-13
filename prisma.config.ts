// prisma.config.ts
//
// Prisma does not load .env automatically when a config file is present, so
// dotenv provides DATABASE_URL for local CLI commands. On Vercel the variable
// comes from the project's Environment Variables instead.
//
// The generated client (src/generated/prisma, git-ignored) and its Query Engine
// binaries are produced by `prisma generate`, which runs as part of
// `npm run build`. Engine targets are declared in prisma/schema.prisma
// (`binaryTargets`); nothing needs to be copied by hand.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Required in Prisma 6.19: without `engine: "classic"`, the `datasource`
  // block below is ignored.
  engine: "classic",
  datasource: {
    url: env("DATABASE_URL"),
  },
});
