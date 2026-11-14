// Admin → Books: query parsing, Prisma filters, sorting, pagination and action
// validation. Plain JavaScript so tests/admin-books.test.mjs can exercise it.
// Everything here is applied on the server; nothing from the URL is trusted as-is.

export const PAGE_SIZES = [10, 20, 50];
export const DEFAULT_PAGE_SIZE = 20;
export const SORTS = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  'title-asc': 'Title A–Z',
  'title-desc': 'Title Z–A',
  updated: 'Recently updated',
};
export const STATUSES = ['all', 'published', 'unpublished'];
export const BOOK_TYPES = ['GRADE_BASED', 'GENERAL'];
export const MAX_SEARCH_LENGTH = 100;
export const MAX_BULK_IDS = 100;

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const first = (value) => (Array.isArray(value) ? value[0] : value);

/**
 * Normalises URL search params into a safe query. Unknown or malformed values fall
 * back to defaults instead of erroring.
 * @param {Record<string, string | string[] | undefined>} params
 */
export function parseBookQuery(params = {}) {
  const q = String(first(params.q) ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_LENGTH);
  const status = STATUSES.includes(first(params.status)) ? first(params.status) : 'all';
  const type = BOOK_TYPES.includes(first(params.type)) ? first(params.type) : '';
  const grade = ID.test(first(params.grade) ?? '') ? first(params.grade) : '';
  const subject = ID.test(first(params.subject) ?? '') ? first(params.subject) : '';
  const sort = Object.hasOwn(SORTS, first(params.sort) ?? '') ? first(params.sort) : 'newest';
  const sizeValue = Number(first(params.size));
  const pageSize = PAGE_SIZES.includes(sizeValue) ? sizeValue : DEFAULT_PAGE_SIZE;
  const pageValue = Number.parseInt(String(first(params.page) ?? '1'), 10);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 ? Math.min(pageValue, 100_000) : 1;
  return { q, status, type, grade, subject, sort, page, pageSize };
}

/**
 * Prisma `where` for the query. With `{ ignoreStatus: true }` the status filter is
 * left out (used for the per-status tab counts).
 * Grade filter: grade-based books whose subject belongs to the grade, plus general
 * books explicitly assigned to that grade.
 */
export function buildBookWhere(query, { ignoreStatus = false } = {}) {
  const and = [];
  if (query.q) {
    const contains = { contains: query.q, mode: 'insensitive' };
    and.push({ OR: [
      { title: contains },
      { author: contains },
      { description: contains },
      { subject: { name: contains } },
      { subject: { grade: { name: contains } } },
    ] });
  }
  if (!ignoreStatus && query.status === 'published') and.push({ isPublished: true });
  if (!ignoreStatus && query.status === 'unpublished') and.push({ isPublished: false });
  if (query.type) and.push({ bookType: query.type });
  if (query.subject) and.push({ subjectId: query.subject });
  if (query.grade) {
    and.push({ OR: [
      { subject: { gradeId: query.grade } },
      { bookType: 'GENERAL', allowedGrades: { some: { gradeId: query.grade } } },
    ] });
  }
  return and.length ? { AND: and } : {};
}

/** Stable ordering (id as tie-breaker so pages never overlap or skip). */
export function buildBookOrderBy(sort) {
  switch (sort) {
    case 'oldest': return [{ createdAt: 'asc' }, { id: 'asc' }];
    case 'title-asc': return [{ title: 'asc' }, { id: 'asc' }];
    case 'title-desc': return [{ title: 'desc' }, { id: 'desc' }];
    case 'updated': return [{ updatedAt: 'desc' }, { id: 'desc' }];
    default: return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

/** Clamps the requested page to the available range. */
export function paginate(total, page, pageSize) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, page), totalPages);
  const from = total === 0 ? 0 : (current - 1) * pageSize + 1;
  const to = Math.min(total, current * pageSize);
  return { page: current, pageSize, totalPages, total, skip: (current - 1) * pageSize, take: pageSize, from, to };
}

/**
 * URL search string for a query, omitting defaults. `changes` override fields;
 * any filter change resets to page 1 unless a page is given explicitly.
 */
export function bookQueryString(query, changes = {}) {
  const next = { ...query, ...changes };
  if (!('page' in changes) && Object.keys(changes).some((key) => key !== 'page')) next.page = 1;
  const params = new URLSearchParams();
  if (next.q) params.set('q', next.q);
  if (next.status && next.status !== 'all') params.set('status', next.status);
  if (next.type) params.set('type', next.type);
  if (next.grade) params.set('grade', next.grade);
  if (next.subject) params.set('subject', next.subject);
  if (next.sort && next.sort !== 'newest') params.set('sort', next.sort);
  if (next.pageSize && next.pageSize !== DEFAULT_PAGE_SIZE) params.set('size', String(next.pageSize));
  if (next.page && next.page > 1) params.set('page', String(next.page));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Page numbers to show (with null for gaps), e.g. [1, null, 4, 5, 6, null, 12]. */
export function pageWindow(page, totalPages, radius = 1) {
  const pages = new Set([1, totalPages]);
  for (let p = page - radius; p <= page + radius; p++) if (p >= 1 && p <= totalPages) pages.add(p);
  const sorted = [...pages].sort((a, b) => a - b);
  const out = [];
  for (const [i, p] of sorted.entries()) {
    if (i > 0 && p - sorted[i - 1] > 1) out.push(null);
    out.push(p);
  }
  return out;
}

/**
 * Validates a publish/unpublish request coming from the browser.
 * @returns {{ ok: true, ids: string[], publish: boolean } | { ok: false, error: string }}
 */
export function parsePublicationRequest(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid request.' };
  const { ids, publish } = input;
  if (typeof publish !== 'boolean') return { ok: false, error: 'Invalid publication setting.' };
  if (!Array.isArray(ids) || ids.length === 0) return { ok: false, error: 'Select at least one book.' };
  if (ids.length > MAX_BULK_IDS) return { ok: false, error: `Select at most ${MAX_BULK_IDS} books at a time.` };
  if (!ids.every((id) => typeof id === 'string' && ID.test(id))) return { ok: false, error: 'Invalid book selection.' };
  return { ok: true, ids: [...new Set(ids)], publish };
}

/**
 * Storage keys that may be removed after a book row is deleted: the book's own PDF
 * and cover, but only if no remaining record still references them.
 * @param {{ filePath: string, coverImagePath: string | null }} book
 * @param {(key: string) => number} remainingReferences references left after deletion
 * @returns {string[]}
 */
export function storageKeysToRemove(book, remainingReferences) {
  /** @type {string[]} */
  const keys = [];
  for (const key of [book.filePath, book.coverImagePath]) {
    if (typeof key === 'string' && key.length > 0 && remainingReferences(key) === 0) keys.push(key);
  }
  return keys;
}
