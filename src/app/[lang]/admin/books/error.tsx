'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useI18n } from '@/i18n/client';

// Error boundary for the books page (for example when the database is unreachable).
export default function BooksError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { m } = useI18n();
  return (
    <div className="al-page">
      <div className="al-error" role="alert">
        <AlertTriangle size={28} aria-hidden="true" />
        <h2>{m.admin.books.loadErrorTitle}</h2>
        <p>{m.admin.books.loadErrorText}</p>
        <button type="button" className="al-button al-button-primary" onClick={() => reset()}><RefreshCw size={16} aria-hidden="true" />{m.common.tryAgain}</button>
      </div>
    </div>
  );
}
