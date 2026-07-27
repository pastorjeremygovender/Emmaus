/**
 * scripture-ref.ts — parse a scripture reference string into structured data.
 *
 * Examples:
 *   "John 1:35–39"       → { bookId: 'john', chapter: 1, startVerse: 35, endVerse: 39 }
 *   "John 6:35"          → { bookId: 'john', chapter: 6, startVerse: 35, endVerse: 35 }
 *   "John 1"             → { bookId: 'john', chapter: 1, startVerse: null, endVerse: null }
 *   "1 John 4:7-10"      → { bookId: '1john', chapter: 4, startVerse: 7, endVerse: 10 }
 *   "Song of Solomon 3"  → { bookId: 'songofsolomon', chapter: 3, ... }
 *
 * Book ID convention matches BIBLE_BOOKS IDs:
 *   lowercase, no spaces, leading number concatenated.
 *   "1 John" → "1john", "2 Samuel" → "2samuel"
 */

export interface ParsedScriptureRef {
  bookId: string;
  chapter: number;
  startVerse: number | null;
  /** Same as startVerse for single-verse references; null when no verse given. */
  endVerse: number | null;
  /** The original reference text, trimmed. */
  display: string;
}

/**
 * Parse a scripture reference string.
 * Returns null if the reference cannot be understood.
 */
export function parseScriptureRef(ref: string): ParsedScriptureRef | null {
  if (!ref?.trim()) return null;

  // Normalise typographic dashes (en-dash, em-dash) to ASCII hyphen
  const s = ref.trim().replace(/[–—]/g, '-');

  // Non-greedy book name capture, so numbered books ("1 John") work correctly:
  //   "John 1:35-39"   → book="John",           ch=1, sv=35, ev=39
  //   "1 John 4:7"     → book="1 John",          ch=4, sv=7,  ev=7
  //   "Genesis 1"      → book="Genesis",         ch=1, sv=null
  const m = s.match(/^(.+?)\s+(\d+)(?::(\d+)(?:-(\d+))?)?$/);
  if (!m) return null;

  const bookRaw = m[1].trim();
  const chapter = parseInt(m[2], 10);
  const sv      = m[3] != null ? parseInt(m[3], 10) : null;
  const ev      = m[4] != null ? parseInt(m[4], 10) : sv; // single verse → ev === sv

  if (!bookRaw || isNaN(chapter)) return null;

  // Build bookId: lowercase, strip all internal spaces
  const bookId = bookRaw.toLowerCase().replace(/\s+/g, '');

  return { bookId, chapter, startVerse: sv, endVerse: ev, display: ref.trim() };
}
