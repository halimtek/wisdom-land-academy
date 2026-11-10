import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import BookReader from './book-reader';

export default function ReadBookPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="wla-reader wla-reader-center" aria-busy="true"><p>Opening book…</p></div>}>
      <ReaderContent params={params} />
    </Suspense>
  );
}

async function ReaderContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await prisma.book.findUnique({ where: { id }, select: { id: true, title: true, author: true, isPublished: true } });
  if (!book || !book.isPublished) notFound();
  return <BookReader bookId={book.id} title={book.title} author={book.author} backHref={`/library/books/${book.id}`} />;
}