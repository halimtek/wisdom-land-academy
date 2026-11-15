import 'server-only';

import { excerpt, newsDate, readingMinutes, sortNews } from '@/lib/news-format.mjs';
import { prisma } from '@/lib/prisma';

export type NewsStory = {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  excerpt: string;
  imageUrl: string | null;
  imageAlt: string;
  date: Date;
  updatedAt: Date;
  minutes: number;
};

const select = { id: true, title: true, summary: true, body: true, imagePath: true, imageAlt: true, eventDate: true, createdAt: true, updatedAt: true } as const;
type Row = { id: string; title: string; summary: string | null; body: string | null; imagePath: string | null; imageAlt: string | null; eventDate: Date | null; createdAt: Date; updatedAt: Date };

function toStory(row: Row): NewsStory {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    body: row.body,
    excerpt: excerpt(row.summary, row.body),
    // Served only while the story is published (see /api/site-media).
    imageUrl: row.imagePath ? `/api/site-media/content-${encodeURIComponent(row.id)}` : null,
    imageAlt: row.imageAlt || row.title,
    date: newsDate(row),
    updatedAt: row.updatedAt,
    minutes: readingMinutes(row.summary, row.body),
  };
}

/** Published news, newest first. Only ANNOUNCEMENT items that are published are ever read. */
export async function publishedNews(limit = 60): Promise<NewsStory[]> {
  const rows = await prisma.schoolContent.findMany({
    where: { kind: 'ANNOUNCEMENT', isPublished: true },
    orderBy: { updatedAt: 'desc' },
    take: 200, // sorted by story date below (publication date or creation day)
    select,
  });
  return sortNews(rows).slice(0, limit).map(toStory);
}

/** One published story, or null if it does not exist or is not published. */
export async function publishedStory(id: string): Promise<NewsStory | null> {
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id)) return null;
  const row = await prisma.schoolContent.findFirst({ where: { id, kind: 'ANNOUNCEMENT', isPublished: true }, select });
  return row ? toStory(row) : null;
}
