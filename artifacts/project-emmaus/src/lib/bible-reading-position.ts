import { getBibleBook } from './bible-data';
import { accountStorageKey } from './account-storage';

export const BIBLE_READING_POSITION_STORAGE_KEY = 'emmaus_bible_reading_positions_v1';

const VALID_TRANSLATION_IDS = new Set(['bsb', 'asv', 'kjv', 'niv', 'gnt', 'msg']);

export type BibleReadingPositions = Record<string, number>;

function positionKey(translationId: string, bookId: string): string {
  return `${translationId}:${bookId}`;
}

function isValidPosition(translationId: string, bookId: string, chapter: number): boolean {
  const book = getBibleBook(bookId);
  return (
    VALID_TRANSLATION_IDS.has(translationId) &&
    Boolean(book) &&
    Number.isInteger(chapter) &&
    chapter >= 1 &&
    chapter <= (book?.chapters ?? 0)
  );
}

export function loadBibleReadingPositions(subject: string): BibleReadingPositions {
  try {
    const raw = localStorage.getItem(accountStorageKey(BIBLE_READING_POSITION_STORAGE_KEY, subject));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

    const valid: BibleReadingPositions = {};
    for (const [key, chapter] of Object.entries(parsed)) {
      const separator = key.indexOf(':');
      if (separator <= 0) continue;
      const translationId = key.slice(0, separator);
      const bookId = key.slice(separator + 1);
      if (isValidPosition(translationId, bookId, chapter)) {
        valid[key] = chapter;
      }
    }
    return valid;
  } catch {
    return {};
  }
}

export function saveBibleReadingPositions(subject: string, positions: BibleReadingPositions): void {
  try {
    localStorage.setItem(
      accountStorageKey(BIBLE_READING_POSITION_STORAGE_KEY, subject),
      JSON.stringify(positions),
    );
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }
}

export function getRememberedBibleChapter(
  positions: BibleReadingPositions,
  translationId: string,
  bookId: string,
): number | null {
  const chapter = positions[positionKey(translationId, bookId)];
  return isValidPosition(translationId, bookId, chapter) ? chapter : null;
}

export function rememberBibleChapter(
  positions: BibleReadingPositions,
  translationId: string,
  bookId: string,
  chapter: number,
): BibleReadingPositions {
  if (!isValidPosition(translationId, bookId, chapter)) return positions;
  return { ...positions, [positionKey(translationId, bookId)]: chapter };
}