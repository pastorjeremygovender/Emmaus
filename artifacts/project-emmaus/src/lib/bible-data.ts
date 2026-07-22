// ─── Bible Engine v1.0 — Catalogue & Shared Types ────────────────────────────
// Translation: King James Version (KJV) — Public Domain
// Luke is the flagship book (all 24 chapters). John remains available as a book.
// All Scripture reads go through the BibleProvider abstraction in bible-provider.ts.

// ─── Re-exports for backward compat ──────────────────────────────────────────

export type { BibleVerse, BibleProviderChapter as BibleChapter } from './bible-provider';
export { getChapter } from './bible-provider';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BibleBook = {
  id: string;
  name: string;
  shortName: string;
  testament: 'OT' | 'NT';
  chapters: number;
  available: boolean;
  description?: string;
  genre?: string;
};

export type BibleJourney = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  bookId: string;
  chapterCount: number;
  available: boolean;
  coverLabel?: string;
};

export type WeeklyMemoryVerse = {
  reference: string;
  text: string;
  weekOf: string;
};

// ─── 66 Books Catalogue ──────────────────────────────────────────────────────

export const BIBLE_BOOKS: BibleBook[] = [
  // Old Testament
  { id: 'genesis',       name: 'Genesis',          shortName: 'Gen',   testament: 'OT', chapters: 50,  available: false, genre: 'Law' },
  { id: 'exodus',        name: 'Exodus',            shortName: 'Ex',    testament: 'OT', chapters: 40,  available: false, genre: 'Law' },
  { id: 'leviticus',     name: 'Leviticus',         shortName: 'Lev',   testament: 'OT', chapters: 27,  available: false, genre: 'Law' },
  { id: 'numbers',       name: 'Numbers',           shortName: 'Num',   testament: 'OT', chapters: 36,  available: false, genre: 'Law' },
  { id: 'deuteronomy',   name: 'Deuteronomy',       shortName: 'Deut',  testament: 'OT', chapters: 34,  available: false, genre: 'Law' },
  { id: 'joshua',        name: 'Joshua',            shortName: 'Josh',  testament: 'OT', chapters: 24,  available: false, genre: 'History' },
  { id: 'judges',        name: 'Judges',            shortName: 'Judg',  testament: 'OT', chapters: 21,  available: false, genre: 'History' },
  { id: 'ruth',          name: 'Ruth',              shortName: 'Ruth',  testament: 'OT', chapters: 4,   available: false, genre: 'History' },
  { id: '1samuel',       name: '1 Samuel',          shortName: '1 Sam', testament: 'OT', chapters: 31,  available: false, genre: 'History' },
  { id: '2samuel',       name: '2 Samuel',          shortName: '2 Sam', testament: 'OT', chapters: 24,  available: false, genre: 'History' },
  { id: '1kings',        name: '1 Kings',           shortName: '1 Kgs', testament: 'OT', chapters: 22,  available: false, genre: 'History' },
  { id: '2kings',        name: '2 Kings',           shortName: '2 Kgs', testament: 'OT', chapters: 25,  available: false, genre: 'History' },
  { id: '1chronicles',   name: '1 Chronicles',      shortName: '1 Chr', testament: 'OT', chapters: 29,  available: false, genre: 'History' },
  { id: '2chronicles',   name: '2 Chronicles',      shortName: '2 Chr', testament: 'OT', chapters: 36,  available: false, genre: 'History' },
  { id: 'ezra',          name: 'Ezra',              shortName: 'Ezra',  testament: 'OT', chapters: 10,  available: false, genre: 'History' },
  { id: 'nehemiah',      name: 'Nehemiah',          shortName: 'Neh',   testament: 'OT', chapters: 13,  available: false, genre: 'History' },
  { id: 'esther',        name: 'Esther',            shortName: 'Est',   testament: 'OT', chapters: 10,  available: false, genre: 'History' },
  { id: 'job',           name: 'Job',               shortName: 'Job',   testament: 'OT', chapters: 42,  available: false, genre: 'Wisdom' },
  { id: 'psalms',        name: 'Psalms',            shortName: 'Ps',    testament: 'OT', chapters: 150, available: false, genre: 'Wisdom' },
  { id: 'proverbs',      name: 'Proverbs',          shortName: 'Prov',  testament: 'OT', chapters: 31,  available: false, genre: 'Wisdom' },
  { id: 'ecclesiastes',  name: 'Ecclesiastes',      shortName: 'Eccl',  testament: 'OT', chapters: 12,  available: false, genre: 'Wisdom' },
  { id: 'songofsolomon', name: 'Song of Solomon',   shortName: 'Song',  testament: 'OT', chapters: 8,   available: false, genre: 'Wisdom' },
  { id: 'isaiah',        name: 'Isaiah',            shortName: 'Isa',   testament: 'OT', chapters: 66,  available: false, genre: 'Prophecy' },
  { id: 'jeremiah',      name: 'Jeremiah',          shortName: 'Jer',   testament: 'OT', chapters: 52,  available: false, genre: 'Prophecy' },
  { id: 'lamentations',  name: 'Lamentations',      shortName: 'Lam',   testament: 'OT', chapters: 5,   available: false, genre: 'Prophecy' },
  { id: 'ezekiel',       name: 'Ezekiel',           shortName: 'Ezek',  testament: 'OT', chapters: 48,  available: false, genre: 'Prophecy' },
  { id: 'daniel',        name: 'Daniel',            shortName: 'Dan',   testament: 'OT', chapters: 12,  available: false, genre: 'Prophecy' },
  { id: 'hosea',         name: 'Hosea',             shortName: 'Hos',   testament: 'OT', chapters: 14,  available: false, genre: 'Prophecy' },
  { id: 'joel',          name: 'Joel',              shortName: 'Joel',  testament: 'OT', chapters: 3,   available: false, genre: 'Prophecy' },
  { id: 'amos',          name: 'Amos',              shortName: 'Amos',  testament: 'OT', chapters: 9,   available: false, genre: 'Prophecy' },
  { id: 'obadiah',       name: 'Obadiah',           shortName: 'Obad',  testament: 'OT', chapters: 1,   available: false, genre: 'Prophecy' },
  { id: 'jonah',         name: 'Jonah',             shortName: 'Jon',   testament: 'OT', chapters: 4,   available: false, genre: 'Prophecy' },
  { id: 'micah',         name: 'Micah',             shortName: 'Mic',   testament: 'OT', chapters: 7,   available: false, genre: 'Prophecy' },
  { id: 'nahum',         name: 'Nahum',             shortName: 'Nah',   testament: 'OT', chapters: 3,   available: false, genre: 'Prophecy' },
  { id: 'habakkuk',      name: 'Habakkuk',          shortName: 'Hab',   testament: 'OT', chapters: 3,   available: false, genre: 'Prophecy' },
  { id: 'zephaniah',     name: 'Zephaniah',         shortName: 'Zeph',  testament: 'OT', chapters: 3,   available: false, genre: 'Prophecy' },
  { id: 'haggai',        name: 'Haggai',            shortName: 'Hag',   testament: 'OT', chapters: 2,   available: false, genre: 'Prophecy' },
  { id: 'zechariah',     name: 'Zechariah',         shortName: 'Zech',  testament: 'OT', chapters: 14,  available: false, genre: 'Prophecy' },
  { id: 'malachi',       name: 'Malachi',           shortName: 'Mal',   testament: 'OT', chapters: 4,   available: false, genre: 'Prophecy' },
  // New Testament
  { id: 'matthew',       name: 'Matthew',           shortName: 'Matt',  testament: 'NT', chapters: 28,  available: false, genre: 'Gospel' },
  { id: 'mark',          name: 'Mark',              shortName: 'Mark',  testament: 'NT', chapters: 16,  available: false, genre: 'Gospel' },
  {
    id: 'luke', name: 'Luke', shortName: 'Luke', testament: 'NT', chapters: 24, available: true, genre: 'Gospel',
    description: 'The Gospel of Luke presents the most complete account of the life of Jesus. Written for all people, Luke shows us Jesus as the compassionate Saviour — who came to seek and to save what was lost.',
  },
  {
    id: 'john', name: 'John', shortName: 'John', testament: 'NT', chapters: 21, available: false, genre: 'Gospel',
    description: 'The Gospel of John presents Jesus as the eternal Word of God made flesh. Written so that you may believe that Jesus is the Messiah, the Son of God, and that by believing you may have life in his name.',
  },
  { id: 'acts',          name: 'Acts',              shortName: 'Acts',  testament: 'NT', chapters: 28,  available: false, genre: 'History' },
  { id: 'romans',        name: 'Romans',            shortName: 'Rom',   testament: 'NT', chapters: 16,  available: false, genre: 'Epistle' },
  { id: '1corinthians',  name: '1 Corinthians',     shortName: '1 Cor', testament: 'NT', chapters: 16,  available: false, genre: 'Epistle' },
  { id: '2corinthians',  name: '2 Corinthians',     shortName: '2 Cor', testament: 'NT', chapters: 13,  available: false, genre: 'Epistle' },
  { id: 'galatians',     name: 'Galatians',         shortName: 'Gal',   testament: 'NT', chapters: 6,   available: false, genre: 'Epistle' },
  { id: 'ephesians',     name: 'Ephesians',         shortName: 'Eph',   testament: 'NT', chapters: 6,   available: false, genre: 'Epistle' },
  { id: 'philippians',   name: 'Philippians',       shortName: 'Phil',  testament: 'NT', chapters: 4,   available: false, genre: 'Epistle' },
  { id: 'colossians',    name: 'Colossians',        shortName: 'Col',   testament: 'NT', chapters: 4,   available: false, genre: 'Epistle' },
  { id: '1thessalonians',name: '1 Thessalonians',   shortName: '1 Th',  testament: 'NT', chapters: 5,   available: false, genre: 'Epistle' },
  { id: '2thessalonians',name: '2 Thessalonians',   shortName: '2 Th',  testament: 'NT', chapters: 3,   available: false, genre: 'Epistle' },
  { id: '1timothy',      name: '1 Timothy',         shortName: '1 Tim', testament: 'NT', chapters: 6,   available: false, genre: 'Epistle' },
  { id: '2timothy',      name: '2 Timothy',         shortName: '2 Tim', testament: 'NT', chapters: 4,   available: false, genre: 'Epistle' },
  { id: 'titus',         name: 'Titus',             shortName: 'Tit',   testament: 'NT', chapters: 3,   available: false, genre: 'Epistle' },
  { id: 'philemon',      name: 'Philemon',          shortName: 'Phlm',  testament: 'NT', chapters: 1,   available: false, genre: 'Epistle' },
  { id: 'hebrews',       name: 'Hebrews',           shortName: 'Heb',   testament: 'NT', chapters: 13,  available: false, genre: 'Epistle' },
  { id: 'james',         name: 'James',             shortName: 'Jas',   testament: 'NT', chapters: 5,   available: false, genre: 'Epistle' },
  { id: '1peter',        name: '1 Peter',           shortName: '1 Pet', testament: 'NT', chapters: 5,   available: false, genre: 'Epistle' },
  { id: '2peter',        name: '2 Peter',           shortName: '2 Pet', testament: 'NT', chapters: 3,   available: false, genre: 'Epistle' },
  { id: '1john',         name: '1 John',            shortName: '1 Jn',  testament: 'NT', chapters: 5,   available: false, genre: 'Epistle' },
  { id: '2john',         name: '2 John',            shortName: '2 Jn',  testament: 'NT', chapters: 1,   available: false, genre: 'Epistle' },
  { id: '3john',         name: '3 John',            shortName: '3 Jn',  testament: 'NT', chapters: 1,   available: false, genre: 'Epistle' },
  { id: 'jude',          name: 'Jude',              shortName: 'Jude',  testament: 'NT', chapters: 1,   available: false, genre: 'Epistle' },
  { id: 'revelation',    name: 'Revelation',        shortName: 'Rev',   testament: 'NT', chapters: 22,  available: false, genre: 'Prophecy' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getBibleBook(id: string): BibleBook | undefined {
  return BIBLE_BOOKS.find(b => b.id === id);
}

// ─── Bible Journeys ───────────────────────────────────────────────────────────

export const BIBLE_JOURNEYS: BibleJourney[] = [
  {
    id: 'walk-through-luke',
    title: 'Walk Through Luke',
    subtitle: 'Discover Jesus through the Gospel according to Luke.',
    description: 'Journey through all 24 chapters of the Gospel of Luke. Each chapter is one step. Walk with Jesus from his birth to his resurrection — as Luke, the careful historian, recorded it.',
    bookId: 'luke',
    chapterCount: 24,
    available: true,
    coverLabel: '24 Chapters',
  },
  {
    id: 'acts',
    title: 'Acts',
    subtitle: 'The Spirit-empowered church',
    description: 'Walk through the birth of the church and be inspired by the Spirit-filled men and women who turned the world upside down.',
    bookId: 'acts',
    chapterCount: 28,
    available: false,
    coverLabel: '28 Chapters',
  },
  {
    id: 'new-to-jesus',
    title: 'New to Jesus',
    subtitle: '7 Days',
    description: 'A 7-day introduction to Jesus for those exploring faith for the first time or returning after a long absence.',
    bookId: 'luke',
    chapterCount: 7,
    available: false,
    coverLabel: '7 Days',
  },
  {
    id: 'psalms-for-difficult-days',
    title: 'Psalms for Difficult Days',
    subtitle: 'Finding God in the hard places',
    description: 'A journey through the honest prayers of the Psalms — for grief, anxiety, confusion, and the longing for God.',
    bookId: 'psalms',
    chapterCount: 14,
    available: false,
    coverLabel: '14 Days',
  },
  {
    id: 'foundations',
    title: 'Foundations of Faith',
    subtitle: 'Core truths of the Christian faith',
    description: 'A journey through key passages that lay the foundation for a lifetime of following Jesus.',
    bookId: 'luke',
    chapterCount: 10,
    available: false,
    coverLabel: '10 Days',
  },
];

export function getBibleJourney(id: string): BibleJourney | undefined {
  return BIBLE_JOURNEYS.find(j => j.id === id);
}

// ─── Weekly Memory Verse ──────────────────────────────────────────────────────

export const WEEKLY_MEMORY_VERSE: WeeklyMemoryVerse = {
  reference: 'Luke 19:10',
  text: 'For the Son of man is come to seek and to save that which was lost.',
  weekOf: 'This week',
};

// ─── Today's Reading ──────────────────────────────────────────────────────────
// Later this will be driven by the user's active journey or reading plan.

export const TODAYS_READING = {
  bookId: 'luke',
  chapter: 1,
  heading: 'The Birth of John the Baptist Foretold',
  readingMinutes: 8,
};
