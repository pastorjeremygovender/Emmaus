/**
 * Bible Data Store
 *
 * In-memory store keyed by userId. Holds all Bible reading data:
 * reading history (array, last 20), completed chapters, journey progress,
 * highlights, favourites, bookmarks, notes, reflections, and prayers.
 *
 * Production upgrade path: swap the Map for Firestore/Postgres reads/writes.
 */

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

// ─── Store ────────────────────────────────────────────────────────────────────

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

const store = new Map<string, UserBibleData>();

export function getBibleData(userId: string): UserBibleData {
  return store.get(userId) ?? { ...EMPTY_DATA };
}

export function patchBibleData(userId: string, patch: Partial<UserBibleData>): UserBibleData {
  const current = store.get(userId) ?? { ...EMPTY_DATA };
  const next = { ...current, ...patch };
  store.set(userId, next);
  return next;
}
