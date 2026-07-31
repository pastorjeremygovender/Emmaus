import { PASTOR_DISPLAY_NAME } from '@/lib/pastor-name';

// ─── Sermon-to-Verse Links ────────────────────────────────────────────────────
// Maps `bookId:chapter:verse` → array of sermon references.
// When a user taps a verse in ChapterReader and a match exists here,
// the "Preached Here" row appears in the verse-action sheet.
//
// Key format: `${bookId}:${chapter}:${verse}`  (all lowercase bookId)
// Sermons are cross-referenced by their ID in admin-demo-data.ts.

export type SermonVerseLink = {
  sermonId: string;
  title: string;
  speaker: string;
  sermonDate: string;          // ISO date string "YYYY-MM-DD"
  series?: string;
  scriptureReference: string;  // Display label, e.g. "John 3:1–21"
};

// ─── Registry ─────────────────────────────────────────────────────────────────

const LINKS: Record<string, SermonVerseLink[]> = {

  // ── John 3 (sermon-john-3 covers vv 1–21) ────────────────────────────────
  'john:3:1':  [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:2':  [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:3':  [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:4':  [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:5':  [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:6':  [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:7':  [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:8':  [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:9':  [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:10': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:11': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:12': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:13': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:14': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:15': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:16': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:17': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:18': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:19': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:20': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
  'john:3:21': [{ sermonId: 'sermon-john-3', title: 'Born Again: The Night Nicodemus Met Jesus', speaker: PASTOR_DISPLAY_NAME, sermonDate: '2024-09-15', series: 'Gospel of John', scriptureReference: 'John 3:1–21' }],
};

// ─── Public API ───────────────────────────────────────────────────────────────

/** Return sermon links for a specific verse, or an empty array if none. */
export function getVerseSermonLinks(
  bookId: string,
  chapter: number,
  verse: number,
): SermonVerseLink[] {
  return LINKS[`${bookId}:${chapter}:${verse}`] ?? [];
}
