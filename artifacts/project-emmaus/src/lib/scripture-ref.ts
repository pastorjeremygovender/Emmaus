/**
 * scripture-ref.ts — parse a scripture reference string into structured data.
 *
 * Examples:
 *   "John 1:35–39"       → { bookId: 'john', chapter: 1, startVerse: 35, endVerse: 39 }
 *   "John 6:35"          → { bookId: 'john', chapter: 6, startVerse: 35, endVerse: 35 }
 *   "John 1"             → { bookId: 'john', chapter: 1, startVerse: null, endVerse: null }
 *   "1 John 4:7-10"      → { bookId: '1john', chapter: 4, startVerse: 7, endVerse: 10 }
 *   "Song of Solomon 3"  → { bookId: 'songofsolomon', chapter: 3, ... }
 *   "Psalm 1:1"          → { bookId: 'psalms', chapter: 1, startVerse: 1, endVerse: 1 }
 *
 * Book ID convention matches BIBLE_BOOKS IDs:
 *   lowercase, no spaces, leading number concatenated.
 *   "1 John" → "1john", "2 Samuel" → "2samuel"
 *
 * Aliases map common singular/abbreviated forms to canonical plural/full IDs.
 */

/**
 * Maps common alternate/singular/abbreviated book names (lowercased, no spaces)
 * to the canonical BIBLE_BOOKS id used by the Emmaus Bible service.
 *
 * Only aliases that differ from the canonical ID are listed.
 */
const BOOK_ALIASES: Record<string, string> = {
  // Psalms — most common issue: "Psalm" (singular) is used in most references
  psalm:           'psalms',
  psa:             'psalms',
  ps:              'psalms',
  pss:             'psalms',

  // Song of Solomon
  song:            'songofsolomon',
  songs:           'songofsolomon',
  sos:             'songofsolomon',
  songofsongsofsolomon: 'songofsolomon',
  canticles:       'songofsolomon',

  // Revelation — "revelations" (plural) is a common misspelling
  revelations:     'revelation',
  rev:             'revelation',

  // Ecclesiastes
  eccl:            'ecclesiastes',
  ecc:             'ecclesiastes',

  // Lamentations
  lam:             'lamentations',

  // Numbered books — handle spaces being stripped differently
  // e.g. "1 Cor" → "1cor" which is fine; these are edge cases
  philemon:        'philemon',
  phm:             'philemon',
  phlm:            'philemon',

  // Obadiah
  obad:            'obadiah',

  // Nahum
  nah:             'nahum',

  // Habakkuk — common misspellings
  habakuk:         'habakkuk',
  habacuc:         'habakkuk',

  // Zephaniah
  zeph:            'zephaniah',
  zep:             'zephaniah',

  // Haggai
  hag:             'haggai',
};

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

  // Build bookId: lowercase, strip all internal spaces, then normalize aliases
  const rawId = bookRaw.toLowerCase().replace(/\s+/g, '');
  const bookId = BOOK_ALIASES[rawId] ?? rawId;

  return { bookId, chapter, startVerse: sv, endVerse: ev, display: ref.trim() };
}
