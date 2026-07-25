/**
 * Bible Data API Client
 *
 * Typed fetch helpers for reading/writing Bible progress data to the API server.
 * Identity is passed via the X-User-Id header (demo mode pattern).
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
    'X-User-Id': userId,
  };
}

/**
 * Load all Bible reading data for the authenticated user.
 * Returns null on network failure so the caller can fall back to localStorage.
 */
export async function loadBibleData(userId: string): Promise<UserBibleData | null> {
  try {
    const res = await fetch(`${API_BASE}/api/bible/data`, {
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
 * Fire-and-forget — failures are silent so UI stays responsive.
 */
export async function patchBibleData(
  userId: string,
  patch: Partial<UserBibleData>
): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/bible/data`, {
      method: 'PATCH',
      headers: authHeaders(userId),
      body: JSON.stringify(patch),
    });
  } catch {
    // Silent — localStorage retains state even if the cloud write fails
  }
}
