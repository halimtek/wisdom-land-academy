import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
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
  const book = await prisma.book.findUnique({
    where: { id },
    select: {
      id: true, title: true, author: true, description: true, bookType: true, coverImagePath: true, isPublished: true, createdAt: true,
      subject: { select: { name: true, grade: { select: { name: true } } } },
    },
  });
  if (!book || !book.isPublished) notFound();

  const category = book.bookType === 'GENERAL' || !book.subject ? 'General Library' : `${book.subject.grade.name} · ${book.subject.name}`;

  return (
    <main className="wla-lib wla-details">
      <Link href="/library" className="wla-back-link"><ArrowLeft size={20} aria-hidden="true" /> Back to library</Link>
      <article className="wla-details-card">
        <div className="wla-details-cover">
          <BookCover id={book.id} title={book.title} hasCover={Boolean(book.coverImagePath)} priority sizes="(max-width: 700px) 60vw, 280px" />
        </div>
        <div className="wla-details-body">
          <p className="wla-eyebrow">{category}</p>
          <h1>{book.title}</h1>
          <p className="wla-author">{book.author ? `By ${book.author}` : 'Wisdom Land Academy'}</p>
          {book.description && <p className="wla-description">{book.description}</p>}
          <p className="wla-hint">Added {book.createdAt.toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <ReadButton bookId={book.id} />
        </div>
      </article>
    </main>
  );
}