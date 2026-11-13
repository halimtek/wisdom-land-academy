import 'server-only';

import { revalidatePath } from 'next/cache';

/**
 * Public school pages (home, about, academics, activities, students, staff, news,
 * contact, library) are statically rendered and cached (ISR, see `revalidate` in
 * each page). Call this after any admin change to books, school content, settings,
 * grades or subjects so the next visitor gets fresh HTML without a redeploy.
 *
 * Invalidating the root layout covers every public page at once: settings (logo,
 * contact details) appear on all of them, and edits are rare, so a broad
 * invalidation is simpler and safer than tracking which page shows what.
 * Pages are regenerated lazily on their next visit, not all at once.
 */
export function revalidatePublicPages() {
  revalidatePath('/', 'layout');
}
