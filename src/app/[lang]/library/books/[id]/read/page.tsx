import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { getI18n } from '@/i18n/page';
import { prisma } from '@/lib/prisma';
import BookReader from './book-reader';

export default async function ReadBookPage({ params }: { params: Promise<{ id: string }> }) {
  const { m } = await getI18n();
  return (
    <Suspense fallback={<div className="wla-reader wla-reader-center" aria-busy="true"><p>{m.reader.opening}</p></div>}>
      <ReaderContent params={params} />
    </Suspense>
  );
}

async function ReaderContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { path } = await getI18n();
  const book = await prisma.book.findUnique({ where: { id }, select: { id: true, title: true, author: true, isPublished: true } });
  if (!book || !book.isPublished) notFound();
  return <BookReader bookId={book.id} title={book.title} author={book.author} backHref={path(`/library/books/${book.id}`)} />;
}