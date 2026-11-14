'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

// Error boundary for the books page (for example when the database is unreachable).
export default function BooksError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="al-page">
      <div className="al-error" role="alert">
        <AlertTriangle size={28} aria-hidden="true" />
        <h2>The book list could not be loaded</h2>
        <p>The library server may be temporarily unavailable. No changes were made.</p>
        <button type="button" className="al-button al-button-primary" onClick={() => reset()}><RefreshCw size={16} aria-hidden="true" />Try again</button>
      </div>
    </div>
  );
}
