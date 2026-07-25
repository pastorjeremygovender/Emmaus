/**
 * API.Bible server-side provider
 *
 * Proxies chapter/verse requests to api.bible on behalf of the Emmaus API
 * server. The API key (API_BIBLE_KEY) never leaves the server.
 *
 * Licence restrictions:
 *  - Do not cache licensed text permanently or make it downloadable in bulk.
 *  - Short-term in-memory caching (per server process) is permitted to reduce
 *    round-trips and stay within rate limits.
 *  - Attribution must accompany every display of licensed text.
 *
 * Bible IDs are the confirmed API.Bible Bible IDs for this account.
 * They are used directly — no keyword matching or dynamic discovery.
 */

import { logger } from './logger';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiBibleTranslation = {
  id: string;             // internal stable ID: 'niv' | 'gnt' | 'msg'
  name: string;
  abbreviation: string;
  language: string;
  copyright: string;
  provider: 'api.bible';
  bibleId: string;        // confirmed API.Bible Bible ID for this account
  attributionUrl?: string;
};

export type ApiBibleVerse = { verse: number; text: string };

export type ApiBibleChapter = {
  bookId: string;
  chapter: number;
  translationId: string;
  verses: ApiBibleVerse[];
  copyright: string;
  attributionText?: string;
};

// ─── Confirmed Bible IDs for this API.Bible account ──────────────────────────
// These IDs were verified against the account's /bibles endpoint.
// Do not substitute guesses — if the account changes, update here.

type ConfirmedBible = {
  id: string;           // Emmaus internal ID
  name: string;
  abbreviation: string;
  language: string;
  copyright: string;
  bibleId: string;      // exact API.Bible Bible ID
};

const CONFIRMED_BIBLES: ConfirmedBible[] = [
  {
    id: 'niv',
    name: 'New International Version',
    abbreviation: 'NIV',
    language: 'en',
    copyright: '© 1973, 1978, 1984, 2011 by Biblica, Inc.® All rights reserved worldwide.',
    bibleId: '78a9f6124f344018-01',
  },
  {
    id: 'gnt',
    name: 'Good News Translation',
    abbreviation: 'GNT',
    language: 'en',
    copyright: '© 1992 American Bible Society. All rights reserved.',
    bibleId: '61fd76eafa1577c2-02',
  },
  {
    id: 'msg',
    name: 'The Message',
    abbreviation: 'MSG',
    language: 'en',
    copyright: '© 1993, 2002, 2018 by Eugene H. Peterson. All rights reserved.',
    bibleId: '6f11a7de016f942e-01',
  },
];

// ─── Emmaus book ID → API.Bible book abbreviation mapping ────────────────────

const BOOK_ID_TO_APIBIBLE: Record<string, string> = {
  genesis: 'GEN', exodus: 'EXO', leviticus: 'LEV', numbers: 'NUM',
  deuteronomy: 'DEU', joshua: 'JOS', judges: 'JDG', ruth: 'RUT',
  '1samuel': '1SA', '2samuel': '2SA', '1kings': '1KI', '2kings': '2KI',
  '1chronicles': '1CH', '2chronicles': '2CH', ezra: 'EZR', nehemiah: 'NEH',
  esther: 'EST', job: 'JOB', psalms: 'PSA', proverbs: 'PRO',
  ecclesiastes: 'ECC', songofsolomon: 'SNG', isaiah: 'ISA', jeremiah: 'JER',
  lamentations: 'LAM', ezekiel: 'EZK', daniel: 'DAN', hosea: 'HOS',
  joel: 'JOL', amos: 'AMO', obadiah: 'OBA', jonah: 'JON', micah: 'MIC',
  nahum: 'NAH', habakkuk: 'HAB', zephaniah: 'ZEP', haggai: 'HAG',
  zechariah: 'ZEC', malachi: 'MAL', matthew: 'MAT', mark: 'MRK',
  luke: 'LUK', john: 'JHN', acts: 'ACT', romans: 'ROM',
  '1corinthians': '1CO', '2corinthians': '2CO', galatians: 'GAL',
  ephesians: 'EPH', philippians: 'PHP', colossians: 'COL',
  '1thessalonians': '1TH', '2thessalonians': '2TH', '1timothy': '1TI',
  '2timothy': '2TI', titus: 'TIT', philemon: 'PHM', hebrews: 'HEB',
  james: 'JAS', '1peter': '1PE', '2peter': '2PE', '1john': '1JN',
  '2john': '2JN', '3john': '3JN', jude: 'JUD', revelation: 'REV',
};

// ─── Verse content parser ─────────────────────────────────────────────────────
// API.Bible returns chapter text as a single string with inline [N] verse
// markers, e.g. "  [1] In the beginning...  [2] And God said..."
// We split on those markers to produce individual verse objects.

/**
 * Parse API.Bible plain-text chapter content into individual verse objects.
 *
 * API.Bible marks verses inline with [N] for standard translations and
 * [N-M] range markers for The Message and some other translations.
 * In both cases we use the *start* verse number as the key and store the
 * full text for that block under it.  The text for a range is not split —
 * it reads as the author intended for that group of verses.
 */
function parseVerseMarkers(content: string): ApiBibleVerse[] {
  const verses: ApiBibleVerse[] = [];
  // Match [N] or [N-M] (range markers used by The Message and similar),
  // followed by the text up to the next marker or end of string.
  const pattern = /\[(\d+)(?:-\d+)?\]\s*([\s\S]*?)(?=\s*\[\d+(?:-\d+)?\]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const verseNum = parseInt(match[1], 10);
    const text = match[2].replace(/\s+/g, ' ').trim();
    if (text) {
      verses.push({ verse: verseNum, text });
    }
  }
  verses.sort((a, b) => a.verse - b.verse);
  return verses;
}

// ─── Provider class ───────────────────────────────────────────────────────────

class ApiBibleProvider {
  private apiKey: string | null = null;
  private baseUrl = 'https://api.scripture.api.bible/v1';

  // Verified translations (confirmed accessible on this account)
  private verifiedTranslations: ApiBibleTranslation[] | null = null;
  private verifyPromise: Promise<ApiBibleTranslation[]> | null = null;

  // Short-term chapter cache: `{bibleId}:{bookAbbrev}:{chapter}` → data
  // Lives in-memory only; cleared on restart. Complies with licensed-content
  // caching restrictions.
  private chapterCache = new Map<string, ApiBibleChapter>();

  private getKey(): string | null {
    if (!this.apiKey) {
      this.apiKey = process.env.API_BIBLE_KEY ?? null;
    }
    return this.apiKey;
  }

  /** Returns true if the provider is configured (key present). */
  isConfigured(): boolean {
    return !!this.getKey();
  }

  /** Fetch JSON from API.Bible. Throws on network / auth errors. */
  private async apiFetch<T>(path: string): Promise<T> {
    const key = this.getKey();
    if (!key) throw new Error('API_BIBLE_KEY is not configured');

    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      headers: { 'api-key': key },
    });

    if (res.status === 401 || res.status === 403) {
      throw new Error('API.Bible authentication failed — check API_BIBLE_KEY');
    }
    if (!res.ok) {
      throw new Error(`API.Bible error ${res.status} for ${path}`);
    }
    return res.json() as Promise<T>;
  }

  /**
   * Return the list of confirmed-available translations.
   * On first call, verifies each Bible ID is accessible via the API.
   * Results are cached for the life of the server process.
   */
  async getAvailableTranslations(): Promise<ApiBibleTranslation[]> {
    if (this.verifiedTranslations) return this.verifiedTranslations;
    if (this.verifyPromise) return this.verifyPromise;

    this.verifyPromise = this._verify().then(result => {
      this.verifiedTranslations = result;
      this.verifyPromise = null;
      return result;
    }).catch(err => {
      this.verifyPromise = null;
      logger.warn({ err: String(err) }, 'API.Bible verification failed — no licensed translations');
      return [];
    });

    return this.verifyPromise;
  }

  /**
   * Verify each confirmed Bible ID is accessible on this account.
   * A Bible is included only when the API returns 200 for its /bibles/{id} endpoint.
   */
  private async _verify(): Promise<ApiBibleTranslation[]> {
    if (!this.isConfigured()) return [];

    logger.info({ count: CONFIRMED_BIBLES.length }, 'Verifying API.Bible confirmed translations');

    const results = await Promise.allSettled(
      CONFIRMED_BIBLES.map(async (bible) => {
        type BibleDetail = { data: { id: string; abbreviation: string; copyright?: string } };
        const detail = await this.apiFetch<BibleDetail>(`/bibles/${bible.bibleId}`);
        const translation: ApiBibleTranslation = {
          id: bible.id,
          name: bible.name,
          abbreviation: bible.abbreviation,
          language: bible.language,
          copyright: detail.data.copyright ?? bible.copyright,
          provider: 'api.bible',
          bibleId: bible.bibleId,
          attributionUrl: 'https://scripture.api.bible',
        };
        logger.info(
          { id: bible.id, bibleId: bible.bibleId, name: bible.name },
          'API.Bible translation verified',
        );
        return translation;
      })
    );

    const available: ApiBibleTranslation[] = [];
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled') {
        available.push(result.value);
      } else {
        logger.warn(
          { id: CONFIRMED_BIBLES[i].id, bibleId: CONFIRMED_BIBLES[i].bibleId, err: String(result.reason) },
          'API.Bible translation not accessible — excluded from selector',
        );
      }
    }

    return available;
  }

  /**
   * Retrieve a chapter from API.Bible by internal translation ID.
   * Returns null when the translation is unavailable or the chapter is not found.
   *
   * Uses the /chapters/{id} endpoint with content-type=text and
   * include-verse-numbers=true. The response is a single text blob with
   * inline [N] verse markers which we parse into individual verse objects.
   */
  async getChapter(
    translationId: string,
    bookId: string,
    chapterNum: number,
  ): Promise<ApiBibleChapter | null> {
    const translations = await this.getAvailableTranslations();
    const translation = translations.find(t => t.id === translationId);
    if (!translation) return null;

    const bookAbbrev = BOOK_ID_TO_APIBIBLE[bookId];
    if (!bookAbbrev) return null;

    const cacheKey = `${translation.bibleId}:${bookAbbrev}:${chapterNum}`;
    const cached = this.chapterCache.get(cacheKey);
    if (cached) return cached;

    // API.Bible chapter reference: BOOK.CHAPTER (e.g. JOS.4)
    const chapterId = `${bookAbbrev}.${chapterNum}`;

    type ApiBibleChapterResponse = {
      data: {
        id: string;
        content: string;       // full chapter text with [N] verse markers
        copyright: string;
        verseCount: number;
      };
    };

    try {
      const raw = await this.apiFetch<ApiBibleChapterResponse>(
        `/bibles/${translation.bibleId}/chapters/${chapterId}` +
        `?content-type=text` +
        `&include-notes=false` +
        `&include-titles=false` +
        `&include-chapter-numbers=false` +
        `&include-verse-numbers=true` +
        `&include-verse-spans=true`,
      );

      const verses = parseVerseMarkers(raw.data.content);

      if (verses.length === 0) {
        logger.warn(
          { translationId, bibleId: translation.bibleId, bookId, chapterNum },
          'API.Bible chapter returned no parseable verses',
        );
        return null;
      }

      const result: ApiBibleChapter = {
        bookId,
        chapter: chapterNum,
        translationId,
        verses,
        copyright: raw.data.copyright ?? translation.copyright,
        attributionText: `${translation.name}. Used with permission via API.Bible.`,
      };

      // Short-term in-process cache only — compliant with licensed caching restrictions
      this.chapterCache.set(cacheKey, result);
      return result;

    } catch (err) {
      logger.warn(
        { translationId, bibleId: translation.bibleId, bookId, chapterNum, err: String(err) },
        'API.Bible chapter fetch failed',
      );
      return null;
    }
  }

  /** Return a map of internalId → bibleId for all confirmed translations. */
  getConfirmedBibleIds(): Record<string, string> {
    return Object.fromEntries(CONFIRMED_BIBLES.map(b => [b.id, b.bibleId]));
  }

  /** Clear the in-memory chapter cache (e.g. for testing). */
  clearCache(): void {
    this.chapterCache.clear();
  }
}

// Singleton — one provider per server process
export const apiBibleProvider = new ApiBibleProvider();
