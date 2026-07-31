/**
 * Bible Data API Client
 *
 * Typed fetch helpers for reading/writing Bible progress data to the API server.
 * Identity: signed session cookie (production) with X-User-Id header fallback
 * for dev/demo mode — mirrors the pattern used by rooms-api, devotionals-api, etc.
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

function authHeaders(userId: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    // Dev/demo: identify the caller via header; in production the signed
    // session cookie (emmaus_uid) takes precedence — see auth.ts extractUserId.
    'X-User-Id': userId,
  };
}

/**
 * Load all Bible reading data for the authenticated user.
 * Returns null on any failure (network, 4xx, 5xx) so BibleContext
 * falls back to localStorage rather than clobbering it with empty data.
 */
export async function loadBibleData(userId: string): Promise<UserBibleData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/bible/data`, {
      credentials: 'include',        // send signed session cookie in production
      headers: authHeaders(userId),
    });
    if (!res.ok) return null;
    return (await res.json()) as UserBibleData;
  } catch {
    return null;
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
      body: JSON.stringify(patch),
    });
  } catch {
    // Silent — localStorage retains state even if the cloud write fails
  }
}
