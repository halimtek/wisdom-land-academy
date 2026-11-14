import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_GOAL_SECONDS, MAX_HEARTBEAT_SECONDS, STREAK_DAY_SECONDS, addDays, countPages, creditSeconds, isFinished, isValidPin,
  lastDays, mergePages, parseHeartbeat, readingStreak, schoolDay,
} from '../src/lib/reading-tracker.mjs';

test('schoolDay uses Ethiopian time (UTC+3), so late evening UTC is already tomorrow', () => {
  assert.equal(schoolDay(new Date('2026-11-14T20:59:00Z')), '2026-11-14');
  assert.equal(schoolDay(new Date('2026-11-14T21:01:00Z')), '2026-11-15');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('default goal is 20 minutes; a streak day needs 5 minutes', () => {
  assert.equal(DAILY_GOAL_SECONDS, 1200);
  assert.equal(STREAK_DAY_SECONDS, 300);
});

test('parseHeartbeat accepts a valid update and normalises it', () => {
  const r = parseHeartbeat({ bookId: 'cmbook1', page: 3, totalPages: 40, pages: [2, 3, 3], seconds: 61.9 });
  assert.deepEqual(r, { ok: true, value: { bookId: 'cmbook1', page: 3, totalPages: 40, pages: [2, 3], seconds: 61 } });
  assert.equal(parseHeartbeat({ bookId: 'b', page: 1, totalPages: 1, seconds: 9999 }).value.seconds, MAX_HEARTBEAT_SECONDS, 'seconds capped');
});

test('parseHeartbeat rejects malformed or out-of-range input', () => {
  const ok = { bookId: 'b1', page: 1, totalPages: 10, pages: [], seconds: 0 };
  for (const bad of [null, 'x', { ...ok, bookId: '../x' }, { ...ok, bookId: 'a b' }, { ...ok, page: 0 }, { ...ok, page: 11 }, { ...ok, page: 1.5 },
    { ...ok, totalPages: 0 }, { ...ok, totalPages: 5001 }, { ...ok, pages: [11] }, { ...ok, pages: [0] }, { ...ok, pages: 'x' },
    { ...ok, pages: Array.from({ length: 201 }, (_, i) => 1 + (i % 10)) }, { ...ok, seconds: -1 }, { ...ok, seconds: Number.NaN }]) {
    assert.equal(parseHeartbeat(bad).ok, false, JSON.stringify(bad));
  }
});

test('creditSeconds: capped by the report, the maximum, and the real time since the last update', () => {
  const now = new Date('2026-11-14T08:00:00Z');
  assert.equal(creditSeconds(60, null, now), 60, 'first update of the day');
  assert.equal(creditSeconds(500, null, now), MAX_HEARTBEAT_SECONDS);
  assert.equal(creditSeconds(60, new Date(now.getTime() - 60_000), now), 60, 'normal minute');
  assert.equal(creditSeconds(60, new Date(now.getTime() - 10_000), now), 15, 'second tab/device a few seconds later gets only the elapsed time');
  assert.equal(creditSeconds(60, now, now), 5, 'replayed request gets only the slack');
  assert.equal(creditSeconds(-20, null, now), 0);
  // Two devices sending a full minute each over one real minute cannot double the time.
  const first = creditSeconds(60, new Date(now.getTime() - 60_000), now);
  const second = creditSeconds(60, now, new Date(now.getTime() + 2000));
  assert.ok(first + second <= 60 + 7);
});

test('page bitset: counts distinct pages, ignores out-of-range, merges with saved pages', () => {
  const a = mergePages(null, [1, 2, 2, 9, 0, 11], 10);
  assert.equal(a.added, 3);
  assert.equal(countPages(a.bitset), 3);
  const b = mergePages(a.bitset, [2, 3, 10], 10);
  assert.equal(b.added, 2);
  assert.equal(countPages(b.bitset), 5);
  const grown = mergePages(b.bitset, [12], 16); // book replaced with more pages
  assert.equal(countPages(grown.bitset), 6);
});

test('a book is finished once 90% of its pages were viewed (jumping to the end is not enough)', () => {
  assert.equal(isFinished(89, 100), false);
  assert.equal(isFinished(90, 100), true);
  assert.equal(isFinished(1, 1), true);
  assert.equal(isFinished(0, 0), false);
  const jumped = mergePages(null, [1, 100], 100);
  assert.equal(isFinished(countPages(jumped.bitset), 100), false);
});

test('readingStreak counts consecutive days with at least 5 minutes', () => {
  const today = '2026-11-14';
  const days = [{ day: '2026-11-14', seconds: 400 }, { day: '2026-11-13', seconds: 300 }, { day: '2026-11-12', seconds: 1200 }, { day: '2026-11-10', seconds: 900 }];
  assert.equal(readingStreak(days, today), 3);
  assert.equal(readingStreak([{ day: '2026-11-13', seconds: 600 }, { day: '2026-11-12', seconds: 600 }], today), 2, 'not read yet today: streak from yesterday is kept');
  assert.equal(readingStreak([{ day: '2026-11-14', seconds: 299 }, { day: '2026-11-13', seconds: 600 }], today), 1, 'under 5 minutes today does not count yet');
  assert.equal(readingStreak([{ day: '2026-11-11', seconds: 600 }], today), 0, 'gap breaks the streak');
  assert.equal(readingStreak([], today), 0);
});

test('lastDays returns the 7 days oldest first, filling gaps with 0', () => {
  const week = lastDays([{ day: '2026-11-14', seconds: 60 }, { day: '2026-11-10', seconds: 120 }], 7, '2026-11-14');
  assert.deepEqual(week.map((d) => d.day), ['2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14']);
  assert.deepEqual(week.map((d) => d.seconds), [0, 0, 120, 0, 0, 0, 60]);
});

test('reading PIN must be exactly 4 digits', () => {
  assert.equal(isValidPin('0420'), true);
  for (const bad of ['042', '04201', 'abcd', '12 4', 1234, null]) assert.equal(isValidPin(bad), false, String(bad));
});
