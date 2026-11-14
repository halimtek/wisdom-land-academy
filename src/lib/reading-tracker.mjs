// Reading tracking rules (Phase 1). Plain JavaScript so tests/reading-tracker.test.mjs
// can check them directly. Everything here runs on the server; nothing the browser
// sends is trusted without these checks.

export const DAILY_GOAL_SECONDS = 20 * 60; // default goal: 20 minutes a day
export const STREAK_DAY_SECONDS = 5 * 60; // a day counts towards a streak after 5 minutes
export const FINISHED_RATIO = 0.9; // a book is finished when 90% of its pages were viewed
export const MAX_PAGES = 5000;
export const MAX_HEARTBEAT_SECONDS = 75; // client sends about every 60 s
export const MAX_PAGES_PER_HEARTBEAT = 200;
export const SCHOOL_TIME_ZONE = 'Africa/Addis_Ababa';

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: SCHOOL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Calendar day (YYYY-MM-DD) in the school's time zone. */
export function schoolDay(date = new Date()) {
  return dayFormat.format(date);
}

/** Adds `days` to a YYYY-MM-DD string (calendar arithmetic, no time zone involved). */
export function addDays(day, days) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Validates one tracking update from the reader.
 * @returns {{ ok: true, value: { bookId: string, page: number, totalPages: number, pages: number[], seconds: number } } | { ok: false, error: string }}
 */
export function parseHeartbeat(input) {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid request.' };
  const { bookId, page, totalPages, pages = [], seconds = 0 } = input;
  if (typeof bookId !== 'string' || !ID.test(bookId)) return { ok: false, error: 'Invalid book.' };
  if (!Number.isInteger(totalPages) || totalPages < 1 || totalPages > MAX_PAGES) return { ok: false, error: 'Invalid page count.' };
  if (!Number.isInteger(page) || page < 1 || page > totalPages) return { ok: false, error: 'Invalid page.' };
  if (!Array.isArray(pages) || pages.length > MAX_PAGES_PER_HEARTBEAT) return { ok: false, error: 'Invalid pages.' };
  if (!pages.every((p) => Number.isInteger(p) && p >= 1 && p <= totalPages)) return { ok: false, error: 'Invalid pages.' };
  if (!Number.isFinite(seconds) || seconds < 0) return { ok: false, error: 'Invalid time.' };
  return { ok: true, value: { bookId, page, totalPages, pages: [...new Set(pages)], seconds: Math.min(Math.floor(seconds), MAX_HEARTBEAT_SECONDS) } };
}

/**
 * Seconds that may be credited for this update. Never more than the client reports,
 * never more than MAX_HEARTBEAT_SECONDS, and never more than the real time since
 * this student's previous update (+5 s slack) — so several tabs or devices, or a
 * replayed request, cannot multiply reading time.
 * @param {number} reported seconds reported by the reader
 * @param {Date | null} lastUpdate time of the student's previous credited update today
 */
export function creditSeconds(reported, lastUpdate, now = new Date()) {
  const capped = Math.max(0, Math.min(Math.floor(reported), MAX_HEARTBEAT_SECONDS));
  if (!lastUpdate) return capped;
  const elapsed = Math.floor((now.getTime() - lastUpdate.getTime()) / 1000) + 5;
  return Math.max(0, Math.min(capped, elapsed));
}

/** Bitset helpers: bit (page-1) marks a viewed page. */
export function mergePages(bitset, pages, totalPages) {
  const bytes = new Uint8Array(Math.ceil(totalPages / 8));
  if (bitset) bytes.set(bitset.subarray(0, bytes.length));
  let added = 0;
  for (const page of pages) {
    if (page < 1 || page > totalPages) continue;
    const i = (page - 1) >> 3; const bit = 1 << ((page - 1) & 7);
    if (!(bytes[i] & bit)) { bytes[i] |= bit; added++; }
  }
  return { bitset: bytes, added };
}

export function countPages(bitset) {
  let count = 0;
  for (const byte of bitset ?? []) { let b = byte; while (b) { b &= b - 1; count++; } }
  return count;
}

export function isFinished(pagesViewed, totalPages) {
  return totalPages > 0 && pagesViewed >= Math.max(1, Math.ceil(totalPages * FINISHED_RATIO));
}

/**
 * Consecutive reading days (each with at least STREAK_DAY_SECONDS) ending today, or
 * ending yesterday if the student has not read enough yet today.
 * @param {{ day: string, seconds: number }[]} days
 */
export function readingStreak(days, today = schoolDay()) {
  const qualifying = new Set(days.filter((d) => d.seconds >= STREAK_DAY_SECONDS).map((d) => d.day));
  let cursor = qualifying.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (qualifying.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}

/** Last `count` days (oldest first) with seconds, for the weekly chart. */
export function lastDays(days, count = 7, today = schoolDay()) {
  const byDay = new Map(days.map((d) => [d.day, d.seconds]));
  return Array.from({ length: count }, (_, i) => {
    const day = addDays(today, i - (count - 1));
    return { day, seconds: byDay.get(day) ?? 0 };
  });
}

/** Valid 4-digit reading PIN. */
export const isValidPin = (pin) => typeof pin === 'string' && /^\d{4}$/.test(pin);
