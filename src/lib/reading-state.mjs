// Pure helpers for browser-local reading state (last page, bookmarks, recents).
export const READING_STATE_KEY = 'wla:reading:v1';
export const MAX_TRACKED_BOOKS = 200;
export const MAX_BOOKMARKS_PER_BOOK = 100;
export const ZOOM_PRESETS = ['auto', 'page-fit', 'page-width', 'page-actual'];

export function emptyReadingState() {
  return { v: 1, books: {}, prefs: {} };
}

function positiveInt(value) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 ? value : null;
}

export function isValidZoom(zoom) {
  if (typeof zoom !== 'string') return false;
  if (ZOOM_PRESETS.includes(zoom)) return true;
  const numeric = Number(zoom);
  return Number.isFinite(numeric) && numeric >= 0.1 && numeric <= 10;
}

export function parseReadingState(raw) {
  const state = emptyReadingState();
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2_000_000) return state;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return state;
  }
  if (!data || typeof data !== 'object' || data.v !== 1) return state;
  if (data.prefs && isValidZoom(data.prefs.zoom)) state.prefs.zoom = data.prefs.zoom;
  if (data.books && typeof data.books === 'object') {
    for (const [id, entry] of Object.entries(data.books)) {
      if (id.length === 0 || id.length > 100 || !entry || typeof entry !== 'object') continue;
      const page = positiveInt(entry.page);
      if (page === null) continue;
      const bookmarks = Array.isArray(entry.bookmarks)
        ? [...new Set(entry.bookmarks.map(positiveInt).filter((n) => n !== null))].sort((a, b) => a - b).slice(0, MAX_BOOKMARKS_PER_BOOK)
        : [];
      state.books[id] = {
        page,
        numPages: positiveInt(entry.numPages) ?? 0,
        updatedAt: typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0,
        bookmarks,
      };
    }
  }
  return state;
}

function prune(state) {
  const ids = Object.keys(state.books);
  if (ids.length <= MAX_TRACKED_BOOKS) return state;
  const keep = ids.sort((a, b) => state.books[b].updatedAt - state.books[a].updatedAt).slice(0, MAX_TRACKED_BOOKS);
  const books = {};
  for (const id of keep) books[id] = state.books[id];
  return { ...state, books };
}

export function clampPage(page, numPages) {
  const n = positiveInt(Math.trunc(Number(page)));
  if (n === null) return 1;
  return numPages > 0 ? Math.min(n, numPages) : n;
}

export function recordProgress(state, bookId, page, numPages, now = Date.now()) {
  const previous = state.books[bookId];
  const total = positiveInt(numPages) ?? previous?.numPages ?? 0;
  const next = {
    ...state,
    books: {
      ...state.books,
      [bookId]: { page: clampPage(page, total), numPages: total, updatedAt: now, bookmarks: previous?.bookmarks ?? [] },
    },
  };
  return prune(next);
}

export function toggleBookmark(state, bookId, page, numPages = 0, now = Date.now()) {
  const previous = state.books[bookId] ?? { page: clampPage(page, numPages), numPages: positiveInt(numPages) ?? 0, updatedAt: now, bookmarks: [] };
  const target = clampPage(page, previous.numPages || numPages);
  const has = previous.bookmarks.includes(target);
  let bookmarks = has ? previous.bookmarks.filter((p) => p !== target) : [...previous.bookmarks, target].sort((a, b) => a - b);
  if (bookmarks.length > MAX_BOOKMARKS_PER_BOOK) bookmarks = bookmarks.slice(0, MAX_BOOKMARKS_PER_BOOK);
  return {
    added: !has,
    state: prune({ ...state, books: { ...state.books, [bookId]: { ...previous, bookmarks } } }),
  };
}

export function setZoomPreference(state, zoom) {
  if (!isValidZoom(zoom)) return state;
  return { ...state, prefs: { ...state.prefs, zoom } };
}

export function recentBookIds(state, limit = 12) {
  return Object.entries(state.books)
    .filter(([, entry]) => entry.updatedAt > 0)
    .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
    .slice(0, limit)
    .map(([id]) => id);
}

export function progressPercent(entry) {
  if (!entry || !entry.numPages || entry.numPages < 1) return 0;
  return Math.max(0, Math.min(100, Math.round((entry.page / entry.numPages) * 100)));
}

/** Hash understood by the official PDF.js viewer. */
export function viewerHash({ page, zoom }) {
  const parts = [];
  if (positiveInt(page) !== null) parts.push(`page=${page}`);
  parts.push(`zoom=${isValidZoom(zoom) ? zoom : 'page-width'}`);
  // Don't download the whole book in the background; fetch byte ranges on demand.
  parts.push('disableautofetch=true');
  return parts.join('&');
}