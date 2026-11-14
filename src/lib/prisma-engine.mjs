// Locates the Prisma Query Engine inside the deployed generated client.
//
// Why: Turbopack replaces `__dirname` in the generated client (src/generated/prisma)
// with the placeholder "/ROOT/src/generated/prisma", and the generator's absolute
// output path points at the BUILD directory (e.g. /vercel/path0/...), which does not
// exist where Vercel Functions run (/var/task). Prisma therefore never searches
// <cwd>/src/generated/prisma, although output tracing ships the engine exactly there.
// Prisma's documented PRISMA_QUERY_ENGINE_LIBRARY variable is checked before any
// search, so pointing it at that file fixes engine resolution.

export const GENERATED_CLIENT_DIR = 'src/generated/prisma';

/**
 * Prisma binary target for this Linux machine from /etc/os-release contents
 * (only the OpenSSL 3 targets this project generates: debian + rhel).
 * @param {string} osRelease
 * @returns {'debian-openssl-3.0.x' | 'rhel-openssl-3.0.x' | null}
 */
export function binaryTargetFromOsRelease(osRelease) {
  const field = (name) => (new RegExp(`^${name}=(.*)$`, 'm').exec(osRelease)?.[1] ?? '').replace(/^["']|["']$/g, '').toLowerCase();
  const ids = `${field('ID')} ${field('ID_LIKE')}`.split(/\s+/).filter(Boolean);
  if (ids.some((id) => ['rhel', 'fedora', 'centos', 'amzn'].includes(id))) return 'rhel-openssl-3.0.x';
  if (ids.some((id) => ['debian', 'ubuntu'].includes(id))) return 'debian-openssl-3.0.x';
  return null;
}

/** File name of the Node-API Query Engine library for a binary target. */
export const engineFileName = (target) => `libquery_engine-${target}.so.node`;

/**
 * Decides the value for PRISMA_QUERY_ENGINE_LIBRARY, or null to leave Prisma's
 * own resolution untouched (variable already set, not Linux, or no suitable engine).
 * Prefers the engine matching this distro; if the distro cannot be determined and
 * exactly one engine is present (e.g. a Vercel build only generates rhel), uses it.
 * @param {{ env: Record<string, string | undefined>, platform: string, cwd: string,
 *           readOsRelease: () => string | null, exists: (path: string) => boolean,
 *           list: (dir: string) => string[], join: (...parts: string[]) => string }} io
 * @returns {string | null}
 */
export function resolveQueryEngineLibrary({ env, platform, cwd, readOsRelease, exists, list, join }) {
  if (env.PRISMA_QUERY_ENGINE_LIBRARY) return null;
  if (platform !== 'linux') return null;
  const dir = join(cwd, GENERATED_CLIENT_DIR);
  const osRelease = readOsRelease();
  const target = osRelease ? binaryTargetFromOsRelease(osRelease) : null;
  if (target) {
    const candidate = join(dir, engineFileName(target));
    return exists(candidate) ? candidate : null;
  }
  if (osRelease) return null; // known file, unsupported distro: let Prisma decide
  const engines = list(dir).filter((name) => /^libquery_engine-.+\.so\.node$/.test(name));
  return engines.length === 1 ? join(dir, engines[0]) : null;
}
