import { Suspense } from 'react';
import { getI18n } from '@/i18n/page';
import { prisma } from '@/lib/prisma';
import LibraryCatalog, { type CatalogBook } from './library-catalog';
import './library-v2.css';

export default async function LibraryPageContent() {
  const { m } = await getI18n();
  return (
    <Suspense fallback={<LibraryLoading label={m.library.loading} />}>
      <PublishedLibrary />
    </Suspense>
  );
}

// Public library: only published books are ever queried. No login is required to read them.
async function PublishedLibrary() {
  const books = await prisma.book.findMany({
    where: { isPublished: true },
    orderBy: [{ title: 'asc' }],
    select: {
      id: true, title: true, author: true, description: true, bookType: true, coverImagePath: true, createdAt: true,
      subject: { select: { id: true, name: true, grade: { select: { id: true, name: true } } } },
    },
  });

  const catalogBooks: CatalogBook[] = [];
  for (const book of books) {
    const common = { id: book.id, title: book.title, author: book.author, description: book.description, coverImagePath: book.coverImagePath, createdAt: book.createdAt.toISOString() };
    if (book.bookType === 'GENERAL') catalogBooks.push({ ...common, bookType: 'GENERAL', grade: null, subject: null });
    else if (book.subject) catalogBooks.push({ ...common, bookType: 'GRADE_BASED', grade: book.subject.grade, subject: { id: book.subject.id, name: book.subject.name } });
  }
  return <LibraryCatalog books={catalogBooks} />;
}

function LibraryLoading({ label }: { label: string }) {
  return (
    <main className="wla-lib" aria-busy="true" aria-label={label}>
      <div className="wla-lib-hero"><div className="wla-skeleton wla-skeleton-line" /></div>
      <div className="wla-grid">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="wla-card"><div className="wla-skeleton wla-skeleton-cover" /><div className="wla-skeleton wla-skeleton-line" /><div className="wla-skeleton wla-skeleton-line short" /></div>
        ))}
      </div>
    </main>
  );
}