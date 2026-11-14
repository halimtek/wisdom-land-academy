'use client';

import { useEffect, useSyncExternalStore } from 'react';

// Browser-side state for "Who's reading?" and the signed-in student's progress.
// One shared store so the library, book page and reader stay in sync.

export type ReaderProfileInfo = { id: string; firstName: string; gradeName: string | null; hasPin: boolean; active: boolean };
export type ReadingStatus = {
  reader: { firstName: string; fullName: string; gradeName: string | null } | null;
  profiles: ReaderProfileInfo[];
  today: { seconds: number; pages: number; goalSeconds: number } | null;
  streak: number;
};
export type BookProgress = { bookId: string; page: number; maxPage: number; pagesViewed: number; totalPages: number; secondsRead: number; finished: boolean; updatedAt: string };

type Store = { status: ReadingStatus | null; progress: Map<string, BookProgress> | null; loaded: boolean };
let store: Store = { status: null, progress: null, loaded: false };
const serverStore: Store = { status: null, progress: null, loaded: false };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

const emit = () => { for (const listener of listeners) listener(); };
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

/** Reloads who is reading and their progress. */
export function refreshReading() {
  inflight ??= (async () => {
    try {
      const status = await (await fetch('/api/reading/status', { cache: 'no-store' })).json() as ReadingStatus;
      let progress: Map<string, BookProgress> | null = null;
      if (status.reader) {
        const data = await (await fetch('/api/reading/progress', { cache: 'no-store' })).json() as { books: BookProgress[] };
        progress = new Map(data.books.map((b) => [b.bookId, b]));
      }
      store = { status, progress, loaded: true };
    } catch {
      store = { ...store, loaded: true }; // offline: keep what we had; reading still works
    } finally {
      inflight = null;
      emit();
    }
  })();
  return inflight;
}

/** Updates today's total after a tracked reading update (no extra request). */
export function applyTodaySeconds(seconds: number) {
  if (!store.status?.today) return;
  store = { ...store, status: { ...store.status, today: { ...store.status.today, seconds } } };
  emit();
}

export function useReading() {
  const snapshot = useSyncExternalStore(subscribe, () => store, () => serverStore);
  useEffect(() => { if (!store.loaded && !inflight) void refreshReading(); }, []);
  return snapshot;
}

/** POST JSON to a reader endpoint; refreshes the shared state on success. */
export async function readerAction(path: 'sign-in' | 'switch' | 'sign-out' | 'forget', body: object = {}) {
  try {
    const response = await fetch(`/api/reading/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({})) as { error?: string; firstName?: string };
    if (response.ok) await refreshReading();
    return { ok: response.ok, error: data.error, firstName: data.firstName };
  } catch {
    return { ok: false, error: 'The library could not be reached. Check the connection and try again.' };
  }
}

export const minutes = (seconds: number) => Math.floor(seconds / 60);
