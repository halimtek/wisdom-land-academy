import type { NextConfig } from "next";

// Next.js 16 (Turbopack) build.
//
// NOTE: `cacheComponents` and `partialPrefetching` are intentionally disabled
// (`partialPrefetching` requires `cacheComponents`). Caching uses route segment
// config instead: the homepage and other public pages export
// `revalidate = 300`, so they are cached and refreshed at most every five
// minutes, and admin changes refresh them immediately via
// `revalidatePublicPages()` (src/lib/revalidate-public.ts). Admin, login and
// reader pages still render per request.
const nextConfig: NextConfig = {
  turbopack: {},
};

export default nextConfig;
