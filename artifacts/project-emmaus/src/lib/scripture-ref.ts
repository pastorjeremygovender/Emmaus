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

const CANONICAL_BOOK_NAMES: Record<string, string> = {
  genesis: 'Genesis', exodus: 'Exodus', leviticus: 'Leviticus', numbers: 'Numbers',
  deuteronomy: 'Deuteronomy', joshua: 'Joshua', judges: 'Judges', ruth: 'Ruth',
  '1samuel': '1 Samuel', '2samuel': '2 Samuel', '1kings': '1 Kings', '2kings': '2 Kings',
  '1chronicles': '1 Chronicles', '2chronicles': '2 Chronicles', ezra: 'Ezra',
  nehemiah: 'Nehemiah', esther: 'Esther', job: 'Job', psalms: 'Psalms',
  proverbs: 'Proverbs', ecclesiastes: 'Ecclesiastes', songofsolomon: 'Song of Solomon',
  isaiah: 'Isaiah', jeremiah: 'Jeremiah', lamentations: 'Lamentations', ezekiel: 'Ezekiel',
  daniel: 'Daniel', hosea: 'Hosea', joel: 'Joel', amos: 'Amos', obadiah: 'Obadiah',
  jonah: 'Jonah', micah: 'Micah', nahum: 'Nahum', habakkuk: 'Habakkuk',
  zephaniah: 'Zephaniah', haggai: 'Haggai', zechariah: 'Zechariah', malachi: 'Malachi',
  matthew: 'Matthew', mark: 'Mark', luke: 'Luke', john: 'John', acts: 'Acts',
  romans: 'Romans', '1corinthians': '1 Corinthians', '2corinthians': '2 Corinthians',
  galatians: 'Galatians', ephesians: 'Ephesians', philippians: 'Philippians',
  colossians: 'Colossians', '1thessalonians': '1 Thessalonians',
  '2thessalonians': '2 Thessalonians', '1timothy': '1 Timothy', '2timothy': '2 Timothy',
  titus: 'Titus', philemon: 'Philemon', hebrews: 'Hebrews', james: 'James',
  '1peter': '1 Peter', '2peter': '2 Peter', '1john': '1 John', '2john': '2 John',
  '3john': '3 John', jude: 'Jude', revelation: 'Revelation',
};

export function canonicalBibleBookName(bookOrId: string): string {
  const id = bookOrId.toLowerCase().replace(/\s+/g, '');
  return CANONICAL_BOOK_NAMES[BOOK_ALIASES[id] ?? id] ?? bookOrId;
}

export function formatScriptureReference(ref: {
  book: string;
  chapter: number;
  verseStart?: number | null;
  verseEnd?: number | null;
}): string {
  const book = canonicalBibleBookName(ref.book);
  const verse = ref.verseStart == null ? '' :
    `:${ref.verseStart}${ref.verseEnd != null && ref.verseEnd !== ref.verseStart ? `–${ref.verseEnd}` : ''}`;
  return `${book} ${ref.chapter}${verse}`;
}

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
