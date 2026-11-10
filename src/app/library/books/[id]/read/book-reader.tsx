'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Maximize, Minimize, RefreshCw, X } from 'lucide-react';
import { progressPercent, viewerHash } from '@/lib/reading-state.mjs';
import { getReadingState, saveProgress, saveZoomPreference, toggleBookmarkFor, useReadingState } from '@/lib/reading-storage';
import '../../../library-v2.css';

type ViewerEvent = { pageNumber?: number; presetValue?: string; scale?: number; key?: string };
type ViewerApp = {
  initializedPromise: Promise<void>;
  eventBus?: { on(name: string, cb: (event: ViewerEvent) => void): void; off(name: string, cb: (event: ViewerEvent) => void): void };
  pagesCount: number;
  page: number;
  pdfViewer?: { currentScaleValue: string | number };
  zoomIn(): void;
  zoomOut(): void;
};
type ViewerWindow = Window & { PDFViewerApplication?: ViewerApp };
type Phase = 'loading' | 'slow' | 'ready' | 'error';

const VIEWER_BASE = '/pdfjs-viewer/web/viewer.html';
const ATTACH_TIMEOUT_MS = 25_000;
const noopSubscribe = () => () => {};

export default function BookReader(props: { bookId: string; title: string; author: string | null; backHref: string }) {
  // Browser-only state (resume page, preferences) is read after hydration, never during SSR.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  if (!mounted) return <ReaderSplash title={props.title} />;
  return <ReaderInner {...props} />;
}

function ReaderSplash({ title }: { title: string }) {
  return (
    <div className="wla-reader wla-reader-center" aria-busy="true">
      <div className="wla-spinner" />
      <p>Opening {title}…</p>
    </div>
  );
}

function ReaderInner({ bookId, title, author, backHref }: { bookId: string; title: string; author: string | null; backHref: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const appRef = useRef<ViewerApp | null>(null);
  const pageRef = useRef(1);
  const totalRef = useRef(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Frozen once per mount so saving progress never reloads the iframe.
  const [initial] = useState(() => {
    const state = getReadingState();
    return { page: state.books[bookId]?.page ?? 1, zoom: state.prefs.zoom ?? 'page-width' };
  });
  const fileUrl = `/api/books/${encodeURIComponent(bookId)}/file`;
  const [attempt, setAttempt] = useState(0);
  const frameSrc = `${VIEWER_BASE}?file=${encodeURIComponent(fileUrl)}&disableStream=true&disableAutoFetch=true#${viewerHash({ page: initial.page, zoom: initial.zoom })}`;
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorText, setErrorText] = useState('');
  const [page, setPage] = useState(initial.page);
  const [numPages, setNumPages] = useState(0);
  const [zoomMode, setZoomMode] = useState(initial.zoom);
  const [focus, setFocus] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [resumeNotice, setResumeNotice] = useState(initial.page > 1 ? initial.page : 0);

  const readingState = useReadingState();
  const bookmarks = readingState.books[bookId]?.bookmarks ?? [];
  const isBookmarked = bookmarks.includes(page);
  const canFullscreen = useSyncExternalStore(noopSubscribe, () => Boolean(document.fullscreenEnabled), () => false);
  const isFullscreen = useSyncExternalStore(
    (cb) => { document.addEventListener('fullscreenchange', cb); return () => document.removeEventListener('fullscreenchange', cb); },
    () => Boolean(document.fullscreenElement),
    () => false,
  );

  const flushProgress = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    if (totalRef.current > 0) saveProgress(bookId, pageRef.current, totalRef.current);
  }, [bookId]);

  // Friendly early failure (unpublished, deleted, offline) before the viewer shows a raw error.
  useEffect(() => {
    const controller = new AbortController();
    fetch(fileUrl, { method: 'HEAD', cache: 'no-store', signal: controller.signal })
      .then((response) => {
        if (response.ok) return;
        setErrorText(response.status === 404 ? 'This book is not available right now. It may have been unpublished or removed.' : 'The library could not load this book. Please try again in a moment.');
        setPhase('error');
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setErrorText('You seem to be offline or the school network is not reachable. Check your connection and try again.');
        setPhase('error');
      });
    return () => controller.abort();
  }, [fileUrl, attempt]);

  // Connect to the same-origin official PDF.js viewer to track page, zoom and load state.
  useEffect(() => {
    let stopped = false;
    let poll: ReturnType<typeof setTimeout> | null = null;
    let slowTimer: ReturnType<typeof setTimeout> | null = null;
    const started = Date.now();
    const detach: Array<() => void> = [];
    const resumeNoticeShown = { current: initial.page > 1 };

    function applyChrome(win: ViewerWindow) {
      const doc = win.document;
      doc.documentElement.dataset.toolbarDensity = 'touch'; // 44px toolbar and larger targets (supported by PDF.js)
      if (!doc.getElementById('wla-viewer-overrides')) {
        const style = doc.createElement('style');
        style.id = 'wla-viewer-overrides';
        style.textContent = [
          'html.wla-focus, html.wla-focus[data-toolbar-density] { --toolbar-height: 0px !important; }',
          'html.wla-focus #toolbarContainer { display: none !important; }',
          'body { overscroll-behavior: none; }',
        ].join('\n');
        doc.head.appendChild(style);
      }
    }

    async function attach() {
      if (stopped) return;
      const win = frameRef.current?.contentWindow as ViewerWindow | null | undefined;
      const app = win?.PDFViewerApplication;
      if (!win || !app) {
        if (Date.now() - started > ATTACH_TIMEOUT_MS) {
          setErrorText('The reader could not start. Reload the page and try again.');
          setPhase('error');
          return;
        }
        poll = setTimeout(attach, 200);
        return;
      }
      try { await app.initializedPromise; } catch { /* the viewer reports its own failure via documenterror */ }
      if (stopped || !app.eventBus) return;
      appRef.current = app;
      const bus = app.eventBus;

      const onReady = () => {
        totalRef.current = app.pagesCount;
        setNumPages(app.pagesCount);
        setPhase('ready');
        applyChrome(win);
      };
      const onPage = (event: ViewerEvent) => {
        if (typeof event.pageNumber !== 'number') return;
        pageRef.current = event.pageNumber;
        setPage(event.pageNumber);
        if (resumeNoticeShown.current && event.pageNumber !== initial.page) setResumeNotice(0);
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(flushProgress, 700);
      };
      const onScale = (event: ViewerEvent) => {
        const value = event.presetValue && event.presetValue !== 'custom' ? event.presetValue : typeof event.scale === 'number' ? event.scale.toFixed(2) : null;
        if (!value) return;
        setZoomMode(value);
        if (zoomTimer.current) clearTimeout(zoomTimer.current);
        zoomTimer.current = setTimeout(() => saveZoomPreference(value), 600);
      };
      const onError = () => {
        setErrorText('This PDF could not be opened. The file may be damaged. Please tell your teacher or librarian.');
        setPhase('error');
      };
      bus.on('pagesinit', onReady);
      bus.on('pagechanging', onPage);
      bus.on('scalechanging', onScale);
      bus.on('documenterror', onError);
      detach.push(() => { bus.off('pagesinit', onReady); bus.off('pagechanging', onPage); bus.off('scalechanging', onScale); bus.off('documenterror', onError); });
      if (app.pagesCount > 0) onReady();
    }

    slowTimer = setTimeout(() => setPhase((current) => (current === 'loading' ? 'slow' : current)), 12_000);
    attach();

    return () => {
      stopped = true;
      if (poll) clearTimeout(poll);
      if (slowTimer) clearTimeout(slowTimer);
      detach.forEach((fn) => fn());
      appRef.current = null;
    };
  }, [attempt, flushProgress, initial.page]);

  // Flush position when the tab is hidden or closed (Safari may not run unmount cleanup).
  useEffect(() => {
    const onHide = () => flushProgress();
    const onVisibility = () => { if (document.visibilityState === 'hidden') flushProgress(); };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibility);
      flushProgress();
      if (zoomTimer.current) clearTimeout(zoomTimer.current);
    };
  }, [flushProgress]);

  // Distraction-free mode hides the viewer toolbar as well as WLA's own bars.
  useEffect(() => {
    const root = (frameRef.current?.contentWindow as ViewerWindow | null | undefined)?.document?.documentElement;
    root?.classList.toggle('wla-focus', focus);
  }, [focus, phase]);

  const goTo = (target: number) => {
    const app = appRef.current;
    if (!app || numPages < 1) return;
    app.page = Math.max(1, Math.min(numPages, target));
  };
  const setFit = (mode: 'page-width' | 'page-fit') => {
    const viewer = appRef.current?.pdfViewer;
    if (viewer) viewer.currentScaleValue = mode;
  };
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void rootRef.current?.requestFullscreen?.().catch(() => undefined);
  };
  const retry = () => {
    setPhase('loading');
    setErrorText('');
    setAttempt((n) => n + 1);
  };

  const percent = progressPercent({ page, numPages });
  const ready = phase === 'ready';

  return (
    <div ref={rootRef} className={`wla-reader${focus ? ' wla-reader-focus' : ''}`}>
      <header className="wla-reader-bar wla-reader-top">
        <Link href={backHref} className="wla-reader-back" aria-label="Back to book details" onClick={flushProgress}>
          <ArrowLeft size={22} aria-hidden="true" />
          <span>Back</span>
        </Link>
        <div className="wla-reader-title">
          <strong>{title}</strong>
          <span>{author || 'Wisdom Land Academy'}</span>
        </div>
        {canFullscreen && (
          <button type="button" className="wla-icon-button" onClick={toggleFullscreen} aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}>
            {isFullscreen ? <Minimize size={22} aria-hidden="true" /> : <Maximize size={22} aria-hidden="true" />}
          </button>
        )}
        <div className="wla-reader-progress" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{ width: `${percent}%` }} />
        </div>
      </header>

      <div className="wla-reader-stage">
        <iframe
          key={attempt}
          ref={frameRef}
          className="wla-reader-frame"
          src={frameSrc}
          title={`${title} — book reader`}
          allow="fullscreen"
          referrerPolicy="same-origin"
        />

        {!ready && phase !== 'error' && (
          <div className="wla-reader-overlay" role="status">
            <div className="wla-spinner" />
            <p>Opening your book…</p>
            {phase === 'slow' && (
              <>
                <small>This is taking longer than usual. Big books and busy Wi-Fi can be slow.</small>
                <button type="button" className="wla-button wla-button-light" onClick={retry}><RefreshCw size={18} aria-hidden="true" /> Try again</button>
              </>
            )}
          </div>
        )}

        {phase === 'error' && (
          <div className="wla-reader-overlay wla-reader-error" role="alert">
            <AlertTriangle size={40} aria-hidden="true" />
            <h2>We couldn’t open this book</h2>
            <p>{errorText}</p>
            <div className="wla-reader-error-actions">
              <button type="button" className="wla-button wla-button-gold" onClick={retry}><RefreshCw size={18} aria-hidden="true" /> Try again</button>
              <Link href={backHref} className="wla-button wla-button-light">Back to book</Link>
            </div>
          </div>
        )}

        {ready && resumeNotice > 1 && (
          <div className="wla-toast" role="status">
            <span>Continuing from page {resumeNotice}.</span>
            <button type="button" onClick={() => { goTo(1); setResumeNotice(0); }}>Start from page 1</button>
            <button type="button" aria-label="Dismiss" onClick={() => setResumeNotice(0)}><X size={18} aria-hidden="true" /></button>
          </div>
        )}

        {focus && (
          <button type="button" className="wla-focus-exit" onClick={() => setFocus(false)}>
            <Minimize size={18} aria-hidden="true" /> Show controls
          </button>
        )}

        {bookmarksOpen && (
          <div className="wla-sheet-backdrop" onClick={() => setBookmarksOpen(false)}>
            <section className="wla-sheet" role="dialog" aria-modal="true" aria-label="Bookmarks" onClick={(event) => event.stopPropagation()}>
              <header>
                <h2>Bookmarks</h2>
                <button type="button" className="wla-icon-button wla-icon-dark" aria-label="Close bookmarks" onClick={() => setBookmarksOpen(false)}><X size={22} aria-hidden="true" /></button>
              </header>
              {bookmarks.length === 0 ? (
                <p className="wla-sheet-empty">No bookmarks yet. Tap the bookmark button to save a page.</p>
              ) : (
                <ul>
                  {bookmarks.map((mark) => (
                    <li key={mark}>
                      <button type="button" onClick={() => { goTo(mark); setBookmarksOpen(false); }}>
                        <Bookmark size={18} aria-hidden="true" /> Page {mark}
                      </button>
                      <button type="button" className="wla-sheet-remove" aria-label={`Remove bookmark for page ${mark}`} onClick={() => toggleBookmarkFor(bookId, mark, numPages)}>
                        <X size={18} aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      <footer className="wla-reader-bar wla-reader-bottom" aria-label="Reading controls">
        <button type="button" className="wla-nav-button" onClick={() => goTo(page - 1)} disabled={!ready || page <= 1} aria-label="Previous page">
          <ChevronLeft size={26} aria-hidden="true" /><span>Previous</span>
        </button>
        <div className="wla-page-indicator" aria-live="polite">Page {page}{numPages ? ` of ${numPages}` : ''}</div>
        <button type="button" className="wla-nav-button" onClick={() => goTo(page + 1)} disabled={!ready || (numPages > 0 && page >= numPages)} aria-label="Next page">
          <span>Next</span><ChevronRight size={26} aria-hidden="true" />
        </button>
        <div className="wla-reader-tools">
          <button type="button" className={`wla-chip${zoomMode === 'page-width' ? ' is-active' : ''}`} onClick={() => setFit('page-width')} disabled={!ready} aria-pressed={zoomMode === 'page-width'}>Fit width</button>
          <button type="button" className={`wla-chip${zoomMode === 'page-fit' ? ' is-active' : ''}`} onClick={() => setFit('page-fit')} disabled={!ready} aria-pressed={zoomMode === 'page-fit'}>Fit page</button>
          <button type="button" className="wla-chip" onClick={() => toggleBookmarkFor(bookId, page, numPages)} disabled={!ready} aria-pressed={isBookmarked}>
            {isBookmarked ? <BookmarkCheck size={18} aria-hidden="true" /> : <Bookmark size={18} aria-hidden="true" />}
            {isBookmarked ? 'Bookmarked' : 'Bookmark'}
          </button>
          <button type="button" className="wla-chip" onClick={() => setBookmarksOpen(true)}>Saved pages{bookmarks.length ? ` (${bookmarks.length})` : ''}</button>
          <button type="button" className="wla-chip" onClick={() => setFocus(true)} disabled={!ready}>Focus</button>
        </div>
      </footer>
    </div>
  );
}