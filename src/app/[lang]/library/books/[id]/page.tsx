import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { fmt } from '@/i18n/locales.mjs';
import { getI18n } from '@/i18n/page';
import { prisma } from '@/lib/prisma';
import { BookCover } from '../../book-cover';
import ReadButton from './read-button';
import '../../library-v2.css';

export default function LibraryBookPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<main className="wla-lib wla-details"><div className="wla-details-loading" aria-busy="true"><div className="wla-skeleton wla-skeleton-cover" /><div className="wla-skeleton wla-skeleton-line" /></div></main>}>
      <BookDetails params={params} />
    </Suspense>
  );
}

async function BookDetails({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { m, path, intl } = await getI18n();
  const t = m.library;
  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      id: true, title: true, author: true, description: true, bookType: true, coverImagePath: true, isPublished: true, createdAt: true,
      subject: { select: { name: true, grade: { select: { name: true } } } },
    },
  });
  if (!book || !book.isPublished) notFound();

  const category = book.bookType === 'GENERAL' || !book.subject ? t.generalTitle : `${book.subject.grade.name} · ${book.subject.name}`;

  return (
    <main className="wla-lib wla-details">
      <Link href={path('/library')} className="wla-back-link"><ArrowLeft size={20} aria-hidden="true" className="flip-rtl" /> {t.back}</Link>
      <article className="wla-details-card">
        <div className="wla-details-cover">
          <BookCover id={book.id} title={book.title} hasCover={Boolean(book.coverImagePath)} priority sizes="(max-width: 700px) 60vw, 280px" noCoverLabel={fmt(t.noCover, { title: book.title })} coverAlt={fmt(t.coverOf, { title: book.title })} />
        </div>
        <div className="wla-details-body">
          <p className="wla-eyebrow" dir="auto">{category}</p>
          <h1 dir="auto">{book.title}</h1>
          <p className="wla-author" dir="auto">{book.author ? fmt(t.by, { author: book.author }) : m.common.schoolName}</p>
          {book.description && <p className="wla-description" dir="auto">{book.description}</p>}
          <p className="wla-hint">{fmt(t.added, { date: book.createdAt.toLocaleDateString(intl, { year: 'numeric', month: 'long', day: 'numeric' }) })}</p>
          <ReadButton bookId={book.id} />
        </div>
      </article>
    </main>
  );
}