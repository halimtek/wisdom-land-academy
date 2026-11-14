'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { applyTodaySeconds, useReading } from '@/lib/reading-client';

const ACTIVE_WINDOW_MS = 2 * 60 * 1000; // counts as reading if active within the last 2 minutes
const PAGE_DWELL_MS = 3000; // a page counts as viewed after 3 seconds on screen
const FLUSH_EVERY_S = 60;

/**
 * Measures active reading for a signed-in student and sends it to the server about
 * once a minute (and when the reader is hidden or closed). Time only counts while
 * the page is visible and the student touched, scrolled, typed or turned a page in
 * the last 2 minutes. Anonymous reading is never sent.
 */
export function useReadingTracker({ bookId, page, numPages, ready }: { bookId: string; page: number; numPages: number; ready: boolean }) {
  const { status, progress } = useReading();
  const signedIn = Boolean(status?.reader);
  const [finishedNow, setFinishedNow] = useState(false);
  const state = useRef({ lastActivity: 0, seconds: 0, pending: new Set<number>(), pageShownAt: 0, page, numPages });

  const flush = useCallback((keepalive = false) => {
    const s = state.current;
    if (!signedIn || s.numPages < 1 || (s.seconds === 0 && s.pending.size === 0)) return;
    const body = JSON.stringify({ bookId, page: s.page, totalPages: s.numPages, pages: [...s.pending].slice(0, 200), seconds: s.seconds });
    s.seconds = 0; s.pending = new Set();
    void fetch('/api/reading/heartbeat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive })
      .then((r) => r.json())
      .then((data: { tracked?: boolean; todaySeconds?: number; finishedNow?: boolean }) => {
        if (typeof data.todaySeconds === 'number') applyTodaySeconds(data.todaySeconds);
        if (data.finishedNow) setFinishedNow(true);
      })
      .catch(() => undefined); // offline: this minute is not counted; reading continues
  }, [bookId, signedIn]);

  // Turning a page is activity; restart the dwell timer for the new page.
  useEffect(() => {
    const s = state.current;
    s.page = page; s.numPages = numPages;
    s.lastActivity = Date.now(); s.pageShownAt = Date.now();
  }, [page, numPages]);

  useEffect(() => {
    if (!signedIn || !ready) return;
    const mark = () => { state.current.lastActivity = Date.now(); };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
    for (const e of events) window.addEventListener(e, mark, { passive: true, capture: true });
    let sinceFlush = 0;
    const tick = window.setInterval(() => {
      const s = state.current; const now = Date.now();
      if (document.visibilityState !== 'visible') return;
      if (now - s.pageShownAt >= PAGE_DWELL_MS) s.pending.add(s.page);
      if (now - s.lastActivity < ACTIVE_WINDOW_MS) s.seconds += 1;
      if (++sinceFlush >= FLUSH_EVERY_S) { sinceFlush = 0; flush(); }
    }, 1000);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(true); };
    const onPageHide = () => flush(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.clearInterval(tick);
      for (const e of events) window.removeEventListener(e, mark, { capture: true });
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      flush(true);
    };
  }, [signedIn, ready, flush]);

  const saved = progress?.get(bookId);
  return { signedIn, serverPage: saved && saved.page > 1 ? saved.page : 0, finishedNow, dismissFinished: () => setFinishedNow(false) };
}
