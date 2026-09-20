import fs from 'node:fs';
import path from 'node:path';

const sourceDir = process.argv[2];
const bibleDir = process.argv[3];
const outputPath = process.argv[4];

if (!sourceDir || !bibleDir || !outputPath) {
  throw new Error('Usage: node generate-bible-section-headings.mjs <usfm-dir> <bible-json-dir> <output-file>');
}

const BOOK_IDS = {
  GEN: 'genesis', EXO: 'exodus', LEV: 'leviticus', NUM: 'numbers', DEU: 'deuteronomy',
  JOS: 'joshua', JDG: 'judges', RUT: 'ruth', '1SA': '1samuel', '2SA': '2samuel',
  '1KI': '1kings', '2KI': '2kings', '1CH': '1chronicles', '2CH': '2chronicles',
  EZR: 'ezra', NEH: 'nehemiah', EST: 'esther', JOB: 'job', PSA: 'psalms',
  PRO: 'proverbs', ECC: 'ecclesiastes', SNG: 'songofsolomon', ISA: 'isaiah',
  JER: 'jeremiah', LAM: 'lamentations', EZK: 'ezekiel', DAN: 'daniel', HOS: 'hosea',
  JOL: 'joel', AMO: 'amos', OBA: 'obadiah', JON: 'jonah', MIC: 'micah', NAM: 'nahum',
  HAB: 'habakkuk', ZEP: 'zephaniah', HAG: 'haggai', ZEC: 'zechariah', MAL: 'malachi',
  MAT: 'matthew', MRK: 'mark', LUK: 'luke', JHN: 'john', ACT: 'acts', ROM: 'romans',
  '1CO': '1corinthians', '2CO': '2corinthians', GAL: 'galatians', EPH: 'ephesians',
  PHP: 'philippians', COL: 'colossians', '1TH': '1thessalonians', '2TH': '2thessalonians',
  '1TI': '1timothy', '2TI': '2timothy', TIT: 'titus', PHM: 'philemon', HEB: 'hebrews',
  JAS: 'james', '1PE': '1peter', '2PE': '2peter', '1JN': '1john', '2JN': '2john',
  '3JN': '3john', JUD: 'jude', REV: 'revelation',
};

const sections = {};
let total = 0;

for (const [code, bookId] of Object.entries(BOOK_IDS)) {
  const usfm = fs.readFileSync(path.join(sourceDir, `${code}.usfm`), 'utf8');
  const bible = JSON.parse(fs.readFileSync(path.join(bibleDir, `${bookId}.json`), 'utf8'));
  let chapter = 0;
  let pendingTitle = null;

  for (const line of usfm.split(/\r?\n/)) {
    const chapterMatch = line.match(/^\\c\s+(\d+)/);
    if (chapterMatch) chapter = Number(chapterMatch[1]);

    const sectionMatch = line.match(/^\\s[1-4]\s+(.+?)\s*$/);
    if (sectionMatch) {
      pendingTitle = sectionMatch[1].replace(/\\[^ ]+\s*/g, '').trim();
      continue;
    }

    if (!pendingTitle || !chapter) continue;
    const verseMatch = line.match(/(?:^|\s)\\v\s+(\d+)/);
    if (!verseMatch) continue;

    const verse = Number(verseMatch[1]);
    const validVerse = bible.chapters?.[String(chapter)]?.some(entry => entry.verse === verse);
    if (!validVerse) {
      throw new Error(`Invalid section anchor: ${bookId} ${chapter}:${verse} (${pendingTitle})`);
    }

    const key = `${bookId}:${chapter}`;
    (sections[key] ??= []).push({ verse, title: pendingTitle });
    total += 1;
    pendingTitle = null;
  }
}

const file = `/**
 * Bible section headings anchored to their first verse.
 * Generated from the official Berean Standard Bible USFM section markers.
 * The Berean Bible text and editorial material entered the public domain
 * on 30 April 2023: https://berean.bible/licensing.htm
 *
 * Regenerate with:
 * node scripts/src/generate-bible-section-headings.mjs <bsb-usfm-dir> \\
 *   artifacts/api-server/data/bible/bsb \\
 *   artifacts/project-emmaus/src/data/bible-section-headings.generated.ts
 */

export type BibleSectionHeading = { verse: number; title: string };

export const BIBLE_SECTION_HEADINGS: Readonly<Record<string, readonly BibleSectionHeading[]>> = ${JSON.stringify(sections, null, 2)};

export function getBibleSectionHeading(bookId: string, chapter: number, verse: number): string | null {
  return BIBLE_SECTION_HEADINGS[\`${'${bookId}:${chapter}'}\`]?.find(section => section.verse === verse)?.title ?? null;
}
`;

fs.writeFileSync(outputPath, file);
console.log(`Wrote ${total} section headings across ${Object.keys(sections).length} chapters to ${outputPath}`);
