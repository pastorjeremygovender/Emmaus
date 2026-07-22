// ─── Emmaus Bible Engine — Provider Abstraction ──────────────────────────────
// The application never depends directly on one Bible source.
// Swapping providers (licensed API, offline DB, etc.) is a configuration change.

// ─── Canonical Types ─────────────────────────────────────────────────────────

export type BibleVerse = {
  verse: number;
  text: string;
};

export type BibleProviderTranslation = {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  copyright: string;
};

export type BibleProviderChapter = {
  bookId: string;
  chapter: number;
  heading: string;
  readingMinutes: number;
  verses: BibleVerse[];
  isPlaceholder?: boolean;
  // ── Metadata hooks for future phases (kept for extension, not shown in reader) ──
  sermonRefs: string[];            // future: Preached Here
  verseMetadata?: Record<number, {
    crossRefs?: string[];          // future: cross-references
    audioUrl?: string;             // future: audio Bible
    sermonLinks?: Array<{
      sermonId: string;
      timestampSeconds: number;
      note?: string;
    }>;
  }>;
};

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface BibleProvider {
  readonly translation: BibleProviderTranslation;

  /** Returns true if this provider has data for the given book */
  supportsBook(bookId: string): boolean;

  /** Returns the chapter, or null if unavailable */
  getChapter(bookId: string, chapter: number): BibleProviderChapter | null;

  /** Returns book IDs that have at least one non-placeholder chapter */
  listAvailableBooks(): string[];
}

// ─── KJV Local Provider ───────────────────────────────────────────────────────
// Ships KJV (public domain) data for Luke (all 24 chapters) and John (ch 1–3
// with real text; 4–21 kept for backward compatibility as placeholders).
// Future: swap for a licensed API provider without touching any UI code.

import {
  LUKE_CHAPTERS,
  LUKE_HEADINGS,
  LUKE_READING_MINUTES,
} from '@/data/kjv-luke';

import {
  JOHN_CHAPTERS,
  JOHN_HEADINGS,
  JOHN_READING_MINUTES,
  JOHN_SERMON_REFS_MAP,
} from '@/data/kjv-john';

class KJVLocalProvider implements BibleProvider {
  readonly translation: BibleProviderTranslation = {
    id: 'kjv',
    name: 'King James Version',
    abbreviation: 'KJV',
    language: 'en',
    copyright: 'Public Domain',
  };

  supportsBook(bookId: string): boolean {
    return bookId === 'luke' || bookId === 'john';
  }

  getChapter(bookId: string, chapter: number): BibleProviderChapter | null {
    if (bookId === 'luke') {
      const verses = LUKE_CHAPTERS[chapter];
      if (!verses) return null;
      return {
        bookId: 'luke',
        chapter,
        heading: LUKE_HEADINGS[chapter] ?? `Chapter ${chapter}`,
        readingMinutes: LUKE_READING_MINUTES[chapter] ?? 5,
        verses,
        isPlaceholder: false,
        sermonRefs: [],
      };
    }

    if (bookId === 'john') {
      const verses = JOHN_CHAPTERS[chapter];
      if (!verses) return null;
      const isPlaceholder = chapter > 3;
      return {
        bookId: 'john',
        chapter,
        heading: JOHN_HEADINGS[chapter] ?? `Chapter ${chapter}`,
        readingMinutes: JOHN_READING_MINUTES[chapter] ?? 5,
        verses,
        isPlaceholder,
        sermonRefs: JOHN_SERMON_REFS_MAP[chapter] ?? [],
      };
    }

    return null;
  }

  listAvailableBooks(): string[] {
    return ['luke', 'john'];
  }
}

// ─── Singleton default provider ───────────────────────────────────────────────
// Components import this; swapping provider = one line change here.

export const bibleProvider: BibleProvider = new KJVLocalProvider();

// ─── Convenience helper used by UI components ─────────────────────────────────

export function getChapter(
  bookId: string,
  chapter: number,
): BibleProviderChapter | null {
  return bibleProvider.getChapter(bookId, chapter);
}
