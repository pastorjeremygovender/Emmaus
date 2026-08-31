/**
 * Bible Data API Client
 *
 * Typed fetch helpers for reading/writing Bible progress data to the API server.
 * Identity: derived server-side from the secure session cookie.
 *
 * When the API is unreachable, functions fail silently so localStorage
 * remains the last-resort fallback in BibleContext.
 */

import type {
  ReadingHistoryEntry,
  BibleJourneyProgress,
  VerseHighlight,
  VerseFavourite,
  ChapterBookmark,
  VerseNote,
  ChapterReflection,
  PersonalPrayer,
} from '../contexts/BibleContext';

const API_BASE = (import.meta.env.VITE_API_URL ?? '') as string;

export type UserBibleData = {
  /** Optional for backwards compatibility with pre-preference cloud records. */
  translationId?: string;
  history: ReadingHistoryEntry[];        // ordered newest-first, max 20
  completed: string[];
  journeyProgress: Record<string, BibleJourneyProgress>;
  highlights: VerseHighlight[];
  favourites: VerseFavourite[];
  bookmarks: ChapterBookmark[];
  notes: VerseNote[];
  reflections: ChapterReflection[];
  prayers: PersonalPrayer[];
};

export type BibleDataLoadResult = {
  data: UserBibleData | null;
  status: 'found' | 'missing' | 'unavailable';
};

function authHeaders(_userId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
  };
}

/**
 * Load all Bible reading data for the authenticated user.
 * Returns null on any failure (network, 4xx, 5xx) so BibleContext
 * falls back to localStorage rather than clobbering it with empty data.
 */
export async function loadBibleData(userId: string): Promise<UserBibleData | null> {
  const result = await loadBibleDataWithStatus(userId);
  return result.data;
}

/**
 * The status matters during preference migration: a temporary GET failure must
 * never look like an empty account and overwrite cloud data with local cache.
 */
export async function loadBibleDataWithStatus(userId: string): Promise<BibleDataLoadResult> {
  try {
    const res = await fetch(`${API_BASE}/api/bible/data`, {
      credentials: 'include',        // send signed session cookie in production
      headers: authHeaders(userId),
      cache: 'no-store',
    });
    if (res.status === 404) return { data: null, status: 'missing' };
    if (!res.ok) return { data: null, status: 'unavailable' };
    return { data: (await res.json()) as UserBibleData, status: 'found' };
  } catch {
    return { data: null, status: 'unavailable' };
  }
}

/**
 * Persist a partial update to the user's Bible reading data.
 * Fire-and-forget — localStorage already reflects the change; the cloud
 * write is best-effort and failures are silent to keep the UI responsive.
 */
export async function patchBibleData(
  userId: string,
  patch: Partial<UserBibleData>
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/bible/data`, {
      method: 'PATCH',
      credentials: 'include',        // send signed session cookie in production
      headers: authHeaders(userId),
      cache: 'no-store',
      body: JSON.stringify(patch),
    });
  } catch {
    // Silent — localStorage retains state even if the cloud write fails
  }
}
