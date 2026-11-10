'use client';

import { useSyncExternalStore } from 'react';
import {
  READING_STATE_KEY,
  emptyReadingState,
  parseReadingState,
  recordProgress,
  setZoomPreference,
  toggleBookmark,
} from '@/lib/reading-state.mjs';

export type ReadingEntry = { page: number; numPages: number; updatedAt: number; bookmarks: number[] };
export type ReadingState = { v: 1; books: Record<string, ReadingEntry>; prefs: { zoom?: string } };

const CHANGE_EVENT = 'wla:reading-change';
const serverSnapshot = emptyReadingState() as ReadingState;
let cachedRaw: string | null | undefined;
let cachedState: ReadingState = serverSnapshot;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(READING_STATE_KEY);
  } catch {
    return null; // Private mode / storage blocked: behave as empty.
  }
}

export function getReadingState(): ReadingState {
  const raw = readRaw();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedState = parseReadingState(raw) as ReadingState;
  }
  return cachedState;
}

function write(next: ReadingState) {
  try {
    window.localStorage.setItem(READING_STATE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded or blocked: reading continues, progress just isn't remembered.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useReadingState(): ReadingState {
  return useSyncExternalStore(subscribe, getReadingState, () => serverSnapshot);
}

export function saveProgress(bookId: string, page: number, numPages: number) {
  write(recordProgress(getReadingState(), bookId, page, numPages) as ReadingState);
}

export function toggleBookmarkFor(bookId: string, page: number, numPages: number): boolean {
  const { state, added } = toggleBookmark(getReadingState(), bookId, page, numPages) as { state: ReadingState; added: boolean };
  write(state);
  return added;
}

export function saveZoomPreference(zoom: string) {
  write(setZoomPreference(getReadingState(), zoom) as ReadingState);
}