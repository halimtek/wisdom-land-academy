'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import {
  AlertTriangle, ArrowLeft, Bookmark, BookmarkCheck, ChevronLeft, ChevronRight, Library,
  Maximize, Minimize, RefreshCw, X, ZoomIn, ZoomOut,
} from 'lucide-react';
import { clampPage, progressPercent } from '@/lib/reading-state.mjs';
import { getReadingState, saveProgress, saveZoomPreference, toggleBookmarkFor, useReadingState } from '@/lib/reading-storage';
import { useReadingTracker } from '@/components/reading/use-reading-tracker';
import { ReaderChip, useIdleSignOut } from '@/components/reading/whos-reading';
import '../../../library-v2.css';

/*
 * Single-page PDF reader built directly on PDF.js (no iframe).
 *
 * - Uses the *legacy* PDF.js build: the modern build relies on very recent
 *   JavaScript APIs (Map#getOrInsertComputed, Uint8Array.fromBase64, Promise.try…)
 *   that older iPadOS/iOS Safari lacks, which left the old viewer stuck loading.
 * - Byte-range loading: only the parts of the file needed for the visible page
 *   are downloaded (disableAutoFetch + disableStream). The API route answers
 *   Range requests with 206 Partial Content.
 * - Only the current page is painted; the next page is pre-rendered once so
 *   page turns are instant. Obsolete renders are cancelled, far pages are released,
 *   and canvas sizes are capped for iOS memory limits.
 */

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type Viewport = ReturnType<PDFPageProxy['getViewport']>;
type Zoom = 'page-width' | 'page-fit' | number;
type Phase = 'loading' | 'slow' | 'ready' | 'error';
type Layout = { viewport: Viewport; output: number; scale: number; key: string };
type Prerender = { key: string; canvas: HTMLCanvasElement; task: RenderTask; done: boolean };
type FullscreenDoc = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
type FullscreenEl = HTMLElement & { webkitRequestFullscreen?: () => void };

// Static PDF.js data files (same 6.5.x release) already shipped in /public.
const PDFJS_ASSETS = '/pdfjs-viewer/web';
const SLOW_MS = 12_000;
const TIMEOUT_MS = 60_000;
const MIN_SCALE = 0.3;
const MAX_SCALE = 5;
const MAX_OUTPUT_SCALE = 2; // 3x phone screens gain little visually but cost 2.25x memory.
const PREFETCH_DELAY_MS = 350;
const noopSubscribe = () => () => {};

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Loads PDF.js once per page session and starts one shared, version-matched worker. */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        const worker = new Worker(new URL('./pdf-worker.ts', import.meta.url), { type: 'module', name: 'wla-pdfjs' });
        worker.addEventListener('error', (event) => {
          console.error('[WLA reader] PDF.js worker failed to start', event.message || event);
          // Allow "Try again" to start a fresh worker.
          worker.terminate();
          if (pdfjs.GlobalWorkerOptions.workerPort === worker) pdfjs.GlobalWorkerOptions.workerPort = null;
          pdfjsPromise = null;
        });
        pdfjs.GlobalWorkerOptions.workerPort = worker;
      }
      return pdfjs;
    });
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
  }
  return pdfjsPromise;
}

function maxCanvasPixels() {
  // iOS Safari limits canvas memory aggressively; touch devices get a lower cap.
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1 ? 6_000_000 : 12_000_000;
}

function layoutFor(pdfPage: PDFPageProxy, zoom: Zoom, stage: { w: number; h: number }): Layout {
  const base = pdfPage.getViewport({ scale: 1 });
  const pad = stage.w < 600 ? 8 : 24;
  const fitWidth = Math.max(MIN_SCALE / 3, (stage.w - pad * 2) / base.width);
  const fitPage = Math.max(MIN_SCALE / 3, Math.min(fitWidth, (stage.h - pad * 2) / base.height));
  const scale = zoom === 'page-width' ? fitWidth : zoom === 'page-fit' ? fitPage : zoom;
  const viewport = pdfPage.getViewport({ scale });
  const area = viewport.width * viewport.height;
  let output = Math.min(window.devicePixelRatio || 1, MAX_OUTPUT_SCALE);
  const limit = maxCanvasPixels();
  if (area * output * output > limit) output = Math.sqrt(limit / area);
  return { viewport, output, scale, key: `${scale.toFixed(4)}:${output.toFixed(3)}` };
}

function paint(pdfPage: PDFPageProxy, layout: Layout): { canvas: HTMLCanvasElement; task: RenderTask } {
  const { viewport, output } = layout;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width * output));
  canvas.height = Math.max(1, Math.floor(viewport.height * output));
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;
  canvas.className = 'wla-page-canvas';
  const task = pdfPage.render({
    canvas,
    viewport,
    transform: output === 1 ? undefined : [output, 0, 0, output, 0, 0],
  });
  return { canvas, task };
}

/** Releases a canvas' backing store immediately (iOS otherwise holds it until GC). */
function freeCanvas(canvas: HTMLCanvasElement | null | undefined) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function isCancelled(error: unknown) {
  return error instanceof Error && error.name === 'RenderingCancelledException';
}

function describeLoadError(error: unknown): { message: string; detail: string } {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  if (name === 'ReaderTimeout') return { detail, message: 'The book took too long to open. The school Wi-Fi may be busy. Please try again.' };
  if (name === 'ResponseException' && status === 404) return { detail, message: 'This book is not available right now. It may have been unpublished or removed.' };
  if (name === 'ResponseException' && status >= 500) return { detail, message: 'The library server is having a problem. Please try again in a moment.' };
  if (name === 'ResponseException' || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return { detail, message: 'You seem to be offline or the school network is not reachable. Check your connection and try again.' };
  }
  if (name === 'InvalidPDFException') return { detail, message: 'This PDF could not be opened. The file may be damaged. Please tell your teacher or librarian.' };
  if (name === 'PasswordException') return { detail, message: 'This PDF is password-protected and cannot be opened in the library. Please tell your librarian.' };
  return { detail, message: 'The reader could not open this book on this device. Please try again. If it keeps happening, update the device software or tell your librarian.' };
}

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

function subscribeFullscreen(cb: () => void) {
  document.addEventListener('fullscreenchange', cb);
  document.addEventListener('webkitfullscreenchange', cb);
  return () => {
    document.removeEventListener('fullscreenchange', cb);
    document.removeEventListener('webkitfullscreenchange', cb);
  };
}

function ReaderInner({ bookId, title, author, backHref }: { bookId: string; title: string; author: string | null; backHref: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef(1);
  const totalRef = useRef(0);
  const scaleRef = useRef(1);
  const prerenderRef = useRef<Prerender | null>(null);
  const touchedRef = useRef(new Set<number>());
  const touchRef = useRef<{ x: number; y: number; t: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef('');

  // Frozen once per mount so saving progress never restarts loading.
  const [initial] = useState(() => {
    const state = getReadingState();
    return { page: state.books[bookId]?.page ?? 1, zoom: (state.prefs.zoom === 'page-fit' ? 'page-fit' : 'page-width') as Zoom };
  });
  const fileUrl = `/api/books/${encodeURIComponent(bookId)}/file`;

  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState<{ message: string; detail: string } | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [page, setPage] = useState(initial.page);
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState<Zoom>(initial.zoom);
  const [shownScale, setShownScale] = useState(0);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [renderNonce, setRenderNonce] = useState(0);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const [focus, setFocus] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [resumeNotice, setResumeNotice] = useState(initial.page > 1 ? initial.page : 0);

  const [signedOutNotice, setSignedOutNotice] = useState(false);
  const readingState = useReadingState();
  const bookmarks = readingState.books[bookId]?.bookmarks ?? [];
  const isBookmarked = bookmarks.includes(page);
  const canFullscreen = useSyncExternalStore(
    noopSubscribe,
    () => Boolean(document.fullscreenEnabled || (document as FullscreenDoc).webkitFullscreenEnabled),
    () => false,
  );
  const isFullscreen = useSyncExternalStore(
    subscribeFullscreen,
    () => Boolean(document.fullscreenElement || (document as FullscreenDoc).webkitFullscreenElement),
    () => false,
  );

  // Progress is browser-local (localStorage) and only written when it actually changes.
  const flushProgress = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; }
    const total = totalRef.current;
    if (total < 1) return;
    const key = `${pageRef.current}/${total}`;
    if (key === lastSaved.current) return;
    lastSaved.current = key;
    saveProgress(bookId, pageRef.current, total);
  }, [bookId]);

  // 1. Open the document once per attempt. Pages are fetched lazily by byte range.
  useEffect(() => {
    let settled = false;
    let task: PDFDocumentLoadingTask | null = null;
    const touched = touchedRef.current;

    const slowTimer = setTimeout(() => {
      if (!settled) setPhase((current) => (current === 'loading' ? 'slow' : current));
    }, SLOW_MS);
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      const err = new Error(`No response after ${TIMEOUT_MS / 1000}s`);
      err.name = 'ReaderTimeout';
      setError(describeLoadError(err));
      setPhase('error');
      void task?.destroy();
    }, TIMEOUT_MS);

    loadPdfJs()
      .then((pdfjs) => {
        if (settled) return null;
        task = pdfjs.getDocument({
          url: fileUrl,
          disableAutoFetch: true,
          disableStream: true,
          rangeChunkSize: 256 * 1024,
          cMapUrl: `${PDFJS_ASSETS}/cmaps/`,
          cMapPacked: true,
          standardFontDataUrl: `${PDFJS_ASSETS}/standard_fonts/`,
          wasmUrl: `${PDFJS_ASSETS}/wasm/`,
          iccUrl: `${PDFJS_ASSETS}/iccs/`,
          enableXfa: false,
          disableWorkerRendering: true,
        });
        return task.promise;
      })
      .then((pdf) => {
        if (!pdf || settled) return; // superseded; the cleanup/timeout destroys the task
        settled = true;
        clearTimeout(timeout);
        totalRef.current = pdf.numPages;
        const startPage = clampPage(initial.page, pdf.numPages);
        pageRef.current = startPage;
        setPage(startPage);
        setNumPages(pdf.numPages);
        setDoc(pdf);
        setPhase('ready');
      })
      .catch((err: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        console.error('[WLA reader] Could not open book', err);
        setError(describeLoadError(err));
        setPhase('error');
      });

    return () => {
      settled = true;
      clearTimeout(slowTimer);
      clearTimeout(timeout);
      const pending = prerenderRef.current;
      if (pending) { pending.task.cancel(); freeCanvas(pending.canvas); prerenderRef.current = null; }
      touched.clear();
      // Destroys the document and aborts its network requests; the shared worker stays up.
      if (task) void task.destroy();
    };
  }, [fileUrl, attempt, initial.page]);

  // 2. Track the reading area size (rotation, focus mode, fullscreen, window resize).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let first = true;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setStage((prev) => (Math.abs(prev.w - w) < 2 && Math.abs(prev.h - h) < 2 ? prev : { w, h }));
    };
    const observer = new ResizeObserver(() => {
      if (first) { first = false; measure(); return; }
      if (timer) clearTimeout(timer);
      timer = setTimeout(measure, 150);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, []);

  // 3. Render only the current page; reuse the pre-rendered next page when it matches.
  useEffect(() => {
    if (!doc || stage.w === 0 || stage.h === 0) return;
    let cancelled = false;
    let task: RenderTask | null = null;
    let pending: HTMLCanvasElement | null = null;
    let prefetchTimer: ReturnType<typeof setTimeout> | null = null;
    const holder = holderRef.current;
    const touched = touchedRef.current;
    const busyTimer = setTimeout(() => { if (!cancelled) setPageBusy(true); }, 200);

    const run = async () => {
      const pdfPage = await doc.getPage(page);
      if (cancelled) return;
      const layout = layoutFor(pdfPage, zoom, stage);
      const wantedKey = `${page}:${layout.key}`;
      let canvas: HTMLCanvasElement | null = null;

      const ready = prerenderRef.current;
      if (ready && ready.key === wantedKey) {
        prerenderRef.current = null;
        try {
          if (!ready.done) await ready.task.promise;
          canvas = ready.canvas;
        } catch {
          freeCanvas(ready.canvas); // fall through and paint it now
        }
        if (cancelled) { freeCanvas(canvas); return; }
      } else if (ready) {
        ready.task.cancel();
        freeCanvas(ready.canvas);
        prerenderRef.current = null;
      }

      if (!canvas) {
        const painted = paint(pdfPage, layout);
        pending = painted.canvas;
        task = painted.task;
        await task.promise;
        if (cancelled) return;
        canvas = painted.canvas;
        pending = null;
      }

      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Page ${page} of ${doc.numPages}`);
      if (holder) {
        holder.querySelectorAll('canvas').forEach((old) => freeCanvas(old));
        holder.replaceChildren(canvas);
      }
      scaleRef.current = layout.scale;
      setShownScale(layout.scale);
      setPageError(false);

      // Release decoded fonts/images of pages the student has moved away from.
      touched.add(page);
      for (const n of Array.from(touched)) {
        if (Math.abs(n - page) <= 2) continue;
        touched.delete(n);
        void doc.getPage(n).then((p) => p.cleanup()).catch(() => undefined);
      }

      // Warm up the next page so "Next" is instant.
      const next = page + 1;
      if (next <= doc.numPages) {
        prefetchTimer = setTimeout(() => {
          if (cancelled) return;
          void doc.getPage(next).then((nextPage) => {
            if (cancelled) return;
            const nextLayout = layoutFor(nextPage, zoom, stage);
            const key = `${next}:${nextLayout.key}`;
            if (prerenderRef.current?.key === key) return;
            const painted = paint(nextPage, nextLayout);
            const entry: Prerender = { key, canvas: painted.canvas, task: painted.task, done: false };
            prerenderRef.current = entry;
            touched.add(next);
            painted.task.promise
              .then(() => { entry.done = true; })
              .catch(() => {
                if (prerenderRef.current === entry) prerenderRef.current = null;
                freeCanvas(entry.canvas);
              });
          }).catch(() => undefined);
        }, PREFETCH_DELAY_MS);
      }
    };

    run()
      .catch((err: unknown) => {
        if (cancelled || isCancelled(err)) return;
        console.error('[WLA reader] Could not render page', page, err);
        setPageError(true);
      })
      .finally(() => {
        clearTimeout(busyTimer);
        if (!cancelled) setPageBusy(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(busyTimer);
      if (prefetchTimer) clearTimeout(prefetchTimer);
      task?.cancel();
      freeCanvas(pending);
    };
  }, [doc, page, zoom, stage, renderNonce]);

  // Free the displayed canvas when leaving the reader.
  useEffect(() => {
    const holder = holderRef.current;
    return () => { holder?.querySelectorAll('canvas').forEach((c) => freeCanvas(c)); };
  }, []);

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
    };
  }, [flushProgress]);

  const goTo = useCallback((target: number) => {
    const total = totalRef.current;
    if (total < 1) return;
    const next = clampPage(target, total);
    if (next === pageRef.current) return;
    pageRef.current = next;
    setPage(next);
    setResumeNotice(0);
    scrollerRef.current?.scrollTo({ top: 0, left: 0 });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushProgress, 800);
  }, [flushProgress]);

  const zoomBy = useCallback((factor: number) => {
    setZoom((current) => {
      const from = typeof current === 'number' ? current : scaleRef.current;
      return Math.round(Math.max(MIN_SCALE, Math.min(MAX_SCALE, from * factor)) * 100) / 100;
    });
  }, []);

  const setFit = (mode: 'page-width' | 'page-fit') => {
    setZoom(mode);
    saveZoomPreference(mode);
  };

  // Keyboard: arrows / Page Up / Page Down turn pages, + and - zoom.
  useEffect(() => {
    if (phase !== 'ready') return;
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key;
      if (key === 'ArrowRight' || key === 'PageDown') { event.preventDefault(); goTo(pageRef.current + 1); }
      else if (key === 'ArrowLeft' || key === 'PageUp') { event.preventDefault(); goTo(pageRef.current - 1); }
      else if (key === 'Home') { event.preventDefault(); goTo(1); }
      else if (key === 'End') { event.preventDefault(); goTo(totalRef.current); }
      else if (key === '+' || key === '=') { event.preventDefault(); zoomBy(1.2); }
      else if (key === '-') { event.preventDefault(); zoomBy(1 / 1.2); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, goTo, zoomBy]);

  // Horizontal swipe turns the page (only when the page isn't scrolled sideways).
  const onTouchStart = (event: React.TouchEvent) => {
    touchRef.current = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY, t: Date.now() } : null;
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touchRef.current;
    touchRef.current = null;
    const el = scrollerRef.current;
    if (!start || !el || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Date.now() - start.t > 700 || Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 2;
    const atLeft = el.scrollLeft <= 2;
    if (dx < 0 && atRight) goTo(pageRef.current + 1);
    else if (dx > 0 && atLeft) goTo(pageRef.current - 1);
  };

  const toggleFullscreen = () => {
    const fsDoc = document as FullscreenDoc;
    if (document.fullscreenElement || fsDoc.webkitFullscreenElement) {
      if (document.exitFullscreen) void document.exitFullscreen().catch(() => undefined);
      else fsDoc.webkitExitFullscreen?.();
      return;
    }
    const el = rootRef.current as FullscreenEl | null;
    if (!el) return;
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => undefined);
    else el.webkitRequestFullscreen?.();
  };

  const retry = () => {
    setDoc(null);
    setError(null);
    setPageError(false);
    setPageBusy(false);
    setPhase('loading');
    setAttempt((n) => n + 1);
  };

  const submitPage = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(pageDraft);
    if (Number.isFinite(value) && value >= 1) goTo(Math.trunc(value));
    setPageDraft(null);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  // Reading tracking for signed-in students ("Who's reading?"); anonymous reading is not tracked.
  const tracking = useReadingTracker({ bookId, page, numPages, ready: phase === 'ready' });
  useIdleSignOut(tracking.signedIn, () => setSignedOutNotice(true));
  // A signed-in student resumes from their own saved page (siblings may share this iPad).
  const resumedFromServer = useRef(false);
  useEffect(() => {
    if (phase !== 'ready' || resumedFromServer.current || !tracking.serverPage) return;
    resumedFromServer.current = true;
    if (tracking.serverPage !== pageRef.current) { goTo(tracking.serverPage); setResumeNotice(tracking.serverPage); }
  }, [phase, tracking.serverPage, goTo]);

  const percent = progressPercent({ page, numPages });
  const ready = phase === 'ready';
  const zoomLabel = shownScale > 0 ? `${Math.round(shownScale * 100)}%` : '–';

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
        <ReaderChip />
        <Link href="/library" className="wla-icon-button" aria-label="Return to the library" title="Library" onClick={flushProgress}>
          <Library size={22} aria-hidden="true" />
        </Link>
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
        <div
          ref={scrollerRef}
          className="wla-reader-scroller"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div className="wla-page-wrap">
            <div ref={holderRef} className="wla-page-holder" />
          </div>
        </div>

        {(phase === 'loading' || phase === 'slow') && (
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
            <p>{error?.message}</p>
            <div className="wla-reader-error-actions">
              <button type="button" className="wla-button wla-button-gold" onClick={retry}><RefreshCw size={18} aria-hidden="true" /> Try again</button>
              <Link href={backHref} className="wla-button wla-button-light">Back to book</Link>
              <Link href="/library" className="wla-button wla-button-light">Library</Link>
            </div>
            {error?.detail && <small className="wla-reader-detail">Technical details for your librarian: {error.detail}</small>}
          </div>
        )}

        {ready && pageBusy && !pageError && (
          <div className="wla-page-status" role="status"><span className="wla-spinner wla-spinner-small" /> Loading page {page}…</div>
        )}

        {ready && pageError && (
          <div className="wla-page-status wla-page-status-error" role="alert">
            Page {page} could not be displayed.
            <button type="button" onClick={() => { setPageError(false); setRenderNonce((n) => n + 1); }}>Try again</button>
          </div>
        )}

        {ready && resumeNotice > 1 && (
          <div className="wla-toast" role="status">
            <span>Continuing from page {resumeNotice}.</span>
            <button type="button" onClick={() => { goTo(1); setResumeNotice(0); }}>Start from page 1</button>
            <button type="button" aria-label="Dismiss" onClick={() => setResumeNotice(0)}><X size={18} aria-hidden="true" /></button>
          </div>
        )}

        {tracking.finishedNow && (
          <div className="wla-toast wr-toast-finished" role="status">
            <span>🎉 You finished this book! It now counts in My reading.</span>
            <button type="button" aria-label="Dismiss" onClick={tracking.dismissFinished}><X size={18} aria-hidden="true" /></button>
          </div>
        )}

        {signedOutNotice && (
          <div className="wla-toast" role="status">
            <span>Signed out after 15 minutes without reading. Tap “Who’s reading?” to continue counting.</span>
            <button type="button" aria-label="Dismiss" onClick={() => setSignedOutNotice(false)}><X size={18} aria-hidden="true" /></button>
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
        <div className="wla-reader-nav">
          <button type="button" className="wla-nav-button" onClick={() => goTo(page - 1)} disabled={!ready || page <= 1} aria-label="Previous page">
            <ChevronLeft size={26} aria-hidden="true" /><span>Previous</span>
          </button>
          <form className="wla-page-form" onSubmit={submitPage}>
            <label htmlFor="wla-page-input" className="wla-sr">Go to page</label>
            <input
              id="wla-page-input"
              className="wla-page-input"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="go"
              autoComplete="off"
              disabled={!ready}
              value={pageDraft ?? String(page)}
              onFocus={(event) => { setPageDraft(String(page)); event.currentTarget.select(); }}
              onChange={(event) => setPageDraft(event.target.value.replace(/\D/g, '').slice(0, 5))}
              onBlur={() => setPageDraft(null)}
            />
            <span aria-live="polite">of {numPages || '…'}</span>
          </form>
          <button type="button" className="wla-nav-button" onClick={() => goTo(page + 1)} disabled={!ready || (numPages > 0 && page >= numPages)} aria-label="Next page">
            <span>Next</span><ChevronRight size={26} aria-hidden="true" />
          </button>
        </div>
        <div className="wla-reader-tools">
          <button type="button" className="wla-chip wla-chip-icon" onClick={() => zoomBy(1 / 1.2)} disabled={!ready || shownScale <= MIN_SCALE} aria-label="Zoom out"><ZoomOut size={20} aria-hidden="true" /></button>
          <span className="wla-zoom-value" aria-label={`Zoom ${zoomLabel}`}>{zoomLabel}</span>
          <button type="button" className="wla-chip wla-chip-icon" onClick={() => zoomBy(1.2)} disabled={!ready || shownScale >= MAX_SCALE} aria-label="Zoom in"><ZoomIn size={20} aria-hidden="true" /></button>
          <button type="button" className={`wla-chip${zoom === 'page-width' ? ' is-active' : ''}`} onClick={() => setFit('page-width')} disabled={!ready} aria-pressed={zoom === 'page-width'}>Fit width</button>
          <button type="button" className={`wla-chip${zoom === 'page-fit' ? ' is-active' : ''}`} onClick={() => setFit('page-fit')} disabled={!ready} aria-pressed={zoom === 'page-fit'}>Fit page</button>
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
