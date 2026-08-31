/**
 * Bible Data Store — PostgreSQL-backed
 *
 * Each authenticated user's annotations are stored as a JSONB blob in
 * `user_bible_data`. The shape is identical to BibleContext's UserBibleData
 * so the existing PATCH /api/bible/data payload works without client changes.
 *
 * Falls back to EMPTY_DATA on DB error so the reader never hard-crashes.
 */

import { pool } from "@workspace/db";

// ─── Shared Types (mirrors BibleContext types) ────────────────────────────────

export type HighlightColor = 'amber' | 'blue' | 'green';

export type VerseHighlight = {
  bookId: string;
  chapter: number;
  verse: number;
  color: HighlightColor;
};

export type VerseFavourite = {
  id: string;
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  verseText: string;
  savedAt: string;
};

export type VerseNote = {
  id: string;
  bookId: string;
  chapter: number;
  verse: number;
  verseText: string;
  text: string;
  createdAt: string;
  updatedAt: string;
};

export type ChapterBookmark = {
  id: string;
  bookId: string;
  bookName: string;
  chapter: number;
  chapterHeading: string;
  savedAt: string;
};

export type ReadingHistoryEntry = {
  bookId: string;
  bookName: string;
  chapter: number;
  chapterHeading: string;
  openedAt: string;
};

export type BibleJourneyProgress = {
  journeyId: string;
  currentChapter: number;
  completedChapters: number[];
  startedAt: string;
  lastCompletedAt: string | null;
};

export type ChapterReflection = {
  id: string;
  bookId: string;
  chapter: number;
  text: string;
  createdAt: string;
};

export type PersonalPrayer = {
  id: string;
  bookId: string;
  chapter: number;
  verse?: number;
  verseText?: string;
  text: string;
  savedAt: string;
};

export type UserBibleData = {
  /** Explicit account preference. Missing means legacy data with no choice saved yet. */
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

// ─── Empty defaults ────────────────────────────────────────────────────────────

const EMPTY_DATA: UserBibleData = {
  history: [],
  completed: [],
  journeyProgress: {},
  highlights: [],
  favourites: [],
  bookmarks: [],
  notes: [],
  reflections: [],
  prayers: [],
};

const VALID_TRANSLATION_IDS = new Set(["bsb", "asv", "kjv", "niv", "gnt", "msg"]);

// ─── DB-backed store ───────────────────────────────────────────────────────────

/**
 * Returns the user's stored Bible data, or null when no cloud record exists yet.
 * Returning null (vs. an empty object) lets the route return 404 and the client
 * fall back to — and then migrate — its localStorage data on first authenticated load.
 * DB errors propagate so the route can return 500.
 */
export async function getBibleData(userId: string): Promise<UserBibleData | null> {
  const res = await pool.query(
    'SELECT data FROM user_bible_data WHERE user_id = $1',
    [userId]
  );
  if (res.rows.length === 0) return null;  // no cloud record yet
  const stored = res.rows[0].data as Partial<UserBibleData>;
  const data = { ...EMPTY_DATA, ...stored };
  if (data.translationId && !VALID_TRANSLATION_IDS.has(data.translationId)) {
    delete data.translationId;
  }
  return data;
}

/**
 * Atomically merges the provided fields into the user's stored data using
 * PostgreSQL's jsonb || operator, avoiding the read-then-upsert race condition.
 * Each key in `patch` overwrites only that key; untouched keys are preserved.
 * DB errors propagate so the route can return 500 (the client already holds
 * the update in localStorage, so no data is lost on a failed cloud write).
 */
export async function patchBibleData(userId: string, patch: Partial<UserBibleData>): Promise<void> {
  await pool.query(
    `INSERT INTO user_bible_data (user_id, data, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (user_id)
     DO UPDATE SET data = user_bible_data.data || $2::jsonb, updated_at = now()`,
    [userId, JSON.stringify(patch)]
  );
}
