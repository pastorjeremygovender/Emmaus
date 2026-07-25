// ─── Emmaus Bible Engine — Provider Abstraction ──────────────────────────────

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
  sermonRefs: string[];
  verseMetadata?: Record<number, {
    crossRefs?: string[];
    audioUrl?: string;
    sermonLinks?: Array<{ sermonId: string; timestampSeconds: number; note?: string }>;
  }>;
};

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface BibleProvider {
  readonly translation: BibleProviderTranslation;
  supportsBook(bookId: string): boolean;
  getChapter(bookId: string, chapter: number): BibleProviderChapter | null;
  listAvailableBooks(): string[];
}

// ─── KJV Local Provider ───────────────────────────────────────────────────────
// Ships KJV data for Luke (all 24 chapters) and John (ch 1–3 with real text).
// Kept for Walk Through Luke journey and as an offline fallback.

import { LUKE_CHAPTERS, LUKE_HEADINGS, LUKE_READING_MINUTES } from '@/data/kjv-luke';
import { JOHN_CHAPTERS, JOHN_HEADINGS, JOHN_READING_MINUTES, JOHN_SERMON_REFS_MAP } from '@/data/kjv-john';
import { getChapterHeading as _getChapterHeadingFromMap, ALL_CHAPTER_HEADINGS } from '@/data/chapter-headings';

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
        bookId: 'luke', chapter,
        heading: LUKE_HEADINGS[chapter] ?? `Chapter ${chapter}`,
        readingMinutes: LUKE_READING_MINUTES[chapter] ?? 5,
        verses, isPlaceholder: false, sermonRefs: [],
      };
    }
    if (bookId === 'john') {
      const verses = JOHN_CHAPTERS[chapter];
      if (!verses) return null;
      return {
        bookId: 'john', chapter,
        heading: JOHN_HEADINGS[chapter] ?? `Chapter ${chapter}`,
        readingMinutes: JOHN_READING_MINUTES[chapter] ?? 5,
        verses, isPlaceholder: chapter > 3,
        sermonRefs: JOHN_SERMON_REFS_MAP[chapter] ?? [],
      };
    }
    return null;
  }

  listAvailableBooks(): string[] {
    return ['luke', 'john'];
  }
}

export const kjvLocalProvider = new KJVLocalProvider();

// ─── Remote Bible Provider ────────────────────────────────────────────────────
// Fetches chapters from the API server, caches results in memory.
// Supports BSB (default) and ASV.

// Re-export the curated headings so existing imports continue to work.
// ALL_CHAPTER_HEADINGS is now the single source of truth (chapter-headings.ts).
export const LUKE_CHAPTER_HEADINGS: Record<number, string> = ALL_CHAPTER_HEADINGS.luke ?? {};

function getChapterHeadingForBook(bookId: string, chapter: number): string {
  return _getChapterHeadingFromMap(bookId, chapter);
}

export class RemoteBibleProvider {
  private cache = new Map<string, BibleProviderChapter>();
  private inflight = new Map<string, Promise<BibleProviderChapter | null>>();

  private cacheKey(bookId: string, chapter: number, translationId: string): string {
    return `${translationId}:${bookId}:${chapter}`;
  }

  async getChapter(
    bookId: string,
    chapter: number,
    translationId: string,
  ): Promise<BibleProviderChapter | null> {
    const key = this.cacheKey(bookId, chapter, translationId);

    // Cache hit
    const cached = this.cache.get(key);
    if (cached) return cached;

    // Deduplicate in-flight requests
    const existing = this.inflight.get(key);
    if (existing) return existing;

    const promise = this._fetchChapter(bookId, chapter, translationId).then(data => {
      this.inflight.delete(key);
      if (data) this.cache.set(key, data);
      return data;
    }).catch(err => {
      this.inflight.delete(key);
      throw err;
    });

    this.inflight.set(key, promise);
    return promise;
  }

  private async _fetchChapter(
    bookId: string,
    chapter: number,
    translationId: string,
  ): Promise<BibleProviderChapter | null> {
    const apiBase = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL?.replace(/\/$/, '') ?? '';
    const url = `${apiBase}/api/bible/${translationId}/${bookId}/${chapter}`;
    const res = await fetch(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Bible API error ${res.status}`);

    const data = await res.json() as {
      translation: string;
      bookId: string;
      chapter: number;
      verses: BibleVerse[];
      readingMinutes: number;
    };

    return {
      bookId: data.bookId,
      chapter: data.chapter,
      heading: getChapterHeadingForBook(bookId, chapter),
      readingMinutes: data.readingMinutes,
      verses: data.verses,
      isPlaceholder: false,
      sermonRefs: [],
    };
  }
}

// Singleton remote provider
export const remoteBibleProvider = new RemoteBibleProvider();

// Legacy singleton (sync KJV for Luke/John)
export const bibleProvider: BibleProvider = kjvLocalProvider;

// Legacy sync convenience — only works for KJV Luke/John
export function getChapter(bookId: string, chapter: number): BibleProviderChapter | null {
  return kjvLocalProvider.getChapter(bookId, chapter);
}
