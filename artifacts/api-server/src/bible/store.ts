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

// ─── DB-backed store ───────────────────────────────────────────────────────────

export async function getBibleData(userId: string): Promise<UserBibleData> {
  try {
    const res = await pool.query(
      'SELECT data FROM user_bible_data WHERE user_id = $1',
      [userId]
    );
    if (res.rows.length === 0) return { ...EMPTY_DATA };
    return { ...EMPTY_DATA, ...(res.rows[0].data as Partial<UserBibleData>) };
  } catch {
    // DB unavailable — return empty rather than crashing the reader
    return { ...EMPTY_DATA };
  }
}

export async function patchBibleData(userId: string, patch: Partial<UserBibleData>): Promise<UserBibleData> {
  try {
    const current = await getBibleData(userId);
    const next = { ...current, ...patch };
    await pool.query(
      `INSERT INTO user_bible_data (user_id, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (user_id)
       DO UPDATE SET data = $2::jsonb, updated_at = now()`,
      [userId, JSON.stringify(next)]
    );
    return next;
  } catch {
    return { ...EMPTY_DATA, ...patch };
  }
}
