'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { progressPercent } from '@/lib/reading-state.mjs';
import { useReadingState } from '@/lib/reading-storage';

export default function ReadButton({ bookId }: { bookId: string }) {
  const entry = useReadingState().books[bookId];
  const resumed = entry && entry.page > 1;
  return (
    <div className="wla-read-action">
      <Link href={`/library/books/${bookId}/read`} className="wla-button wla-button-gold wla-button-large">
        <BookOpen size={22} aria-hidden="true" />
        {resumed ? `Continue reading (page ${entry.page})` : 'Read Book'}
      </Link>
      {resumed && (
        <div className="wla-progress-line" aria-label={`${progressPercent(entry)} percent read`}>
          <span style={{ width: `${progressPercent(entry)}%` }} />
        </div>
      )}
    </div>
  );
}