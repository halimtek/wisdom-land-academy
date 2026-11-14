import type { Prisma } from '@/generated/prisma/client';
import { buildBookOrderBy, buildBookWhere, paginate, parseBookQuery } from '@/lib/admin-books.mjs';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import BookLibrary, { type LibraryBook } from './book-library';

const dateLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

export default async function AdminBooksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireRole('ADMIN');
  const query = parseBookQuery(await searchParams);
  // The builders live in a plain-JS module (unit tested); type their output for Prisma here.
  const where = buildBookWhere(query) as Prisma.BookWhereInput;
  const whereIgnoringStatus = buildBookWhere(query, { ignoreStatus: true }) as Prisma.BookWhereInput;
  const orderBy = buildBookOrderBy(query.sort) as Prisma.BookOrderByWithRelationInput[];

  // Status counts follow the current search and filters (tabs); totals are for the whole library.
  const [grades, statusCounts, libraryCounts, total] = await Promise.all([
    prisma.grade.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, subjects: { orderBy: { name: 'asc' }, select: { id: true, name: true } } },
    }),
    prisma.book.groupBy({ by: ['isPublished'], where: whereIgnoringStatus, _count: { _all: true } }),
    prisma.book.groupBy({ by: ['isPublished'], _count: { _all: true } }),
    prisma.book.count({ where }),
  ]);
  const pagination = paginate(total, query.page, query.pageSize);
  const rows = await prisma.book.findMany({
    where,
    orderBy,
    skip: pagination.skip,
    take: pagination.take,
    select: {
      id: true, title: true, author: true, description: true, subjectId: true, bookType: true, coverImagePath: true,
      accessAllStudents: true, isPublished: true, createdAt: true, updatedAt: true,
      subject: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
      allowedGrades: { select: { grade: { select: { id: true, name: true } } } },
      permissions: { select: { id: true } },
      _count: { select: { progress: true } },
    },
  });

  const count = (groups: { isPublished: boolean; _count: { _all: number } }[], published: boolean) =>
    groups.find((group) => group.isPublished === published)?._count._all ?? 0;
  const tabs = { published: count(statusCounts, true), unpublished: count(statusCounts, false) };
  const library = { published: count(libraryCounts, true), unpublished: count(libraryCounts, false) };
  const books: LibraryBook[] = rows.map(({ createdAt, updatedAt, ...book }) => ({
    ...book,
    createdAtLabel: dateLabel.format(createdAt),
    updatedAtLabel: dateLabel.format(updatedAt),
  }));

  return (
    <BookLibrary
      books={books}
      grades={grades}
      query={query}
      pagination={pagination}
      tabCounts={{ all: tabs.published + tabs.unpublished, ...tabs }}
      libraryCounts={{ all: library.published + library.unpublished, ...library }}
    />
  );
}
