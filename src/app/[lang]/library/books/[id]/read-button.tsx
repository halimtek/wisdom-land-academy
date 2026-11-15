'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { progressPercent } from '@/lib/reading-state.mjs';
import { useReadingState } from '@/lib/reading-storage';
import { useReading } from '@/lib/reading-client';
import { ReaderChip } from '@/components/reading/whos-reading';
import { useI18n } from '@/i18n/client';
import { fmt } from '@/i18n/locales.mjs';

export default function ReadButton({ bookId }: { bookId: string }) {
  const { m, path } = useI18n();
  const t = m.library;
  const local = useReadingState().books[bookId];
  const { status, progress } = useReading();
  // A signed-in student sees their own progress; otherwise this device's local progress.
  const saved = status?.reader ? progress?.get(bookId) : undefined;
  const page = status?.reader ? saved?.page ?? 0 : local?.page ?? 0;
  const percent = status?.reader
    ? saved?.totalPages ? Math.round((saved.pagesViewed / saved.totalPages) * 100) : 0
    : local ? progressPercent(local) : 0;
  const resumed = page > 1;
  return (
    <div className="wla-read-action">
      <Link href={path(`/library/books/${bookId}/read`)} className="wla-button wla-button-gold wla-button-large">
        <BookOpen size={22} aria-hidden="true" />
        {saved?.finished ? t.readAgain : resumed ? fmt(t.continueReading, { n: page }) : t.readBook}
      </Link>
      {(resumed || saved?.finished) && (
        <div className="wla-progress-line" aria-label={fmt(t.percentRead, { n: percent })}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
      {saved?.finished && <p className="wr-finished-badge">{t.youFinished}</p>}
      <div className="wr-detail-reader"><ReaderChip /></div>
    </div>
  );
}
