import 'server-only';

import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import {
  DAILY_GOAL_SECONDS, addDays, countPages, creditSeconds, isFinished, lastDays, mergePages, readingStreak, schoolDay,
} from '@/lib/reading-tracker.mjs';

const dayString = (date: Date) => date.toISOString().slice(0, 10);
const NO_PREVIOUS = new Date(0);

/** Today's total, goal and streak for a student. */
export async function readingSummary(userId: string) {
  const today = schoolDay();
  const rows = await prisma.readingDay.findMany({
    where: { userId, day: { gte: new Date(`${addDays(today, -400)}T00:00:00Z`) } },
    orderBy: { day: 'desc' },
    select: { day: true, seconds: true, pages: true },
  });
  const days = rows.map((r) => ({ day: dayString(r.day), seconds: r.seconds, pages: r.pages }));
  const todayRow = days.find((d) => d.day === today);
  return {
    today: { seconds: todayRow?.seconds ?? 0, pages: todayRow?.pages ?? 0, goalSeconds: DAILY_GOAL_SECONDS },
    streak: readingStreak(days, today),
    week: lastDays(days, 7, today),
    days,
  };
}

type Heartbeat = { bookId: string; page: number; totalPages: number; pages: number[]; seconds: number };

/**
 * Applies one tracking update atomically. The student's day row and book row are
 * locked, so concurrent updates (two tabs, two devices) are serialised and the time
 * cap in creditSeconds() holds.
 */
export async function recordHeartbeat(userId: string, beat: Heartbeat, now = new Date()) {
  const day = schoolDay(now);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO "ReadingDay" ("id", "userId", "day", "seconds", "pages", "updatedAt")
      VALUES (${randomUUID()}, ${userId}, ${day}::date, 0, 0, ${NO_PREVIOUS})
      ON CONFLICT ("userId", "day") DO NOTHING`;
    const [dayRow] = await tx.$queryRaw<{ id: string; seconds: number; pages: number; updatedAt: Date }[]>`
      SELECT "id", "seconds", "pages", "updatedAt" FROM "ReadingDay" WHERE "userId" = ${userId} AND "day" = ${day}::date FOR UPDATE`;

    await tx.$executeRaw`
      INSERT INTO "ReadingProgress" ("id", "userId", "bookId", "page", "updatedAt")
      VALUES (${randomUUID()}, ${userId}, ${beat.bookId}, ${beat.page}, ${now})
      ON CONFLICT ("userId", "bookId") DO NOTHING`;
    const [progress] = await tx.$queryRaw<{ id: string; maxPage: number; pagesSeen: Uint8Array | null; totalPages: number; secondsRead: number; finishedAt: Date | null }[]>`
      SELECT "id", "maxPage", "pagesSeen", "totalPages", "secondsRead", "finishedAt" FROM "ReadingProgress"
      WHERE "userId" = ${userId} AND "bookId" = ${beat.bookId} FOR UPDATE`;

    const lastUpdate = dayRow.updatedAt.getTime() === NO_PREVIOUS.getTime() ? null : dayRow.updatedAt;
    const credited = creditSeconds(beat.seconds, lastUpdate, now);
    const totalPages = Math.max(progress.totalPages, beat.totalPages);
    const { bitset, added } = mergePages(progress.pagesSeen, beat.pages, totalPages);
    const pagesViewed = countPages(bitset);
    const finishedNow = !progress.finishedAt && isFinished(pagesViewed, totalPages);

    await tx.readingProgress.update({
      where: { id: progress.id },
      data: {
        page: beat.page,
        maxPage: Math.max(progress.maxPage, beat.page, ...beat.pages),
        totalPages,
        pagesSeen: Uint8Array.from(bitset),
        pagesViewed,
        secondsRead: progress.secondsRead + credited,
        ...(finishedNow ? { finishedAt: now } : {}),
      },
    });
    // Only move the day's clock forward when time was actually credited: a page-only
    // update must not reset the window that limits the next time credit.
    await tx.readingDay.update({
      where: { id: dayRow.id },
      data: { seconds: dayRow.seconds + credited, pages: dayRow.pages + added, ...(credited > 0 || lastUpdate === null ? { updatedAt: now } : { updatedAt: dayRow.updatedAt }) },
    });
    return { credited, todaySeconds: dayRow.seconds + credited, pagesViewed, totalPages, finished: Boolean(progress.finishedAt) || finishedNow, finishedNow };
  });
}

/** A student's reading progress for published books (most recent first). */
export async function readerProgress(userId: string, limit = 200) {
  const rows = await prisma.readingProgress.findMany({
    where: { userId, book: { isPublished: true } },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { bookId: true, page: true, maxPage: true, pagesViewed: true, totalPages: true, secondsRead: true, finishedAt: true, updatedAt: true },
  });
  return rows.map((r) => ({ ...r, finished: Boolean(r.finishedAt), finishedAt: r.finishedAt?.toISOString() ?? null, updatedAt: r.updatedAt.toISOString() }));
}
