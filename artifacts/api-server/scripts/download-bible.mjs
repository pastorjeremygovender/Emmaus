#!/usr/bin/env node
// Download and convert ASV + BSB Bible data from scrollmapper/bible_databases
// Output: artifacts/api-server/data/bible/{translation}/{bookId}.json

import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Book name → bookId mapping (handles scrollmapper's displayed names)
const BOOK_NAME_TO_ID = {
  'Genesis': 'genesis', 'Exodus': 'exodus', 'Leviticus': 'leviticus',
  'Numbers': 'numbers', 'Deuteronomy': 'deuteronomy', 'Joshua': 'joshua',
  'Judges': 'judges', 'Ruth': 'ruth', '1 Samuel': '1samuel', '2 Samuel': '2samuel',
  '1 Kings': '1kings', '2 Kings': '2kings', '1 Chronicles': '1chronicles',
  '2 Chronicles': '2chronicles', 'Ezra': 'ezra', 'Nehemiah': 'nehemiah',
  'Esther': 'esther', 'Job': 'job', 'Psalms': 'psalms', 'Proverbs': 'proverbs',
  'Ecclesiastes': 'ecclesiastes', 'Song of Solomon': 'songofsolomon',
  'Isaiah': 'isaiah', 'Jeremiah': 'jeremiah', 'Lamentations': 'lamentations',
  'Ezekiel': 'ezekiel', 'Daniel': 'daniel', 'Hosea': 'hosea', 'Joel': 'joel',
  'Amos': 'amos', 'Obadiah': 'obadiah', 'Jonah': 'jonah', 'Micah': 'micah',
  'Nahum': 'nahum', 'Habakkuk': 'habakkuk', 'Zephaniah': 'zephaniah',
  'Haggai': 'haggai', 'Zechariah': 'zechariah', 'Malachi': 'malachi',
  'Matthew': 'matthew', 'Mark': 'mark', 'Luke': 'luke', 'John': 'john',
  'Acts': 'acts', 'Romans': 'romans', '1 Corinthians': '1corinthians',
  '2 Corinthians': '2corinthians', 'Galatians': 'galatians', 'Ephesians': 'ephesians',
  'Philippians': 'philippians', 'Colossians': 'colossians',
  '1 Thessalonians': '1thessalonians', '2 Thessalonians': '2thessalonians',
  '1 Timothy': '1timothy', '2 Timothy': '2timothy', 'Titus': 'titus',
  'Philemon': 'philemon', 'Hebrews': 'hebrews', 'James': 'james',
  '1 Peter': '1peter', '2 Peter': '2peter', '1 John': '1john',
  '2 John': '2john', '3 John': '3john', 'Jude': 'jude', 'Revelation': 'revelation',
  // BSB / ASV spelling variants
  'Song Of Solomon': 'songofsolomon',
  'Revelation of John': 'revelation',
  'The Revelation of John': 'revelation',
  'I Samuel': '1samuel', 'II Samuel': '2samuel',
  'I Kings': '1kings', 'II Kings': '2kings',
  'I Chronicles': '1chronicles', 'II Chronicles': '2chronicles',
  'I Corinthians': '1corinthians', 'II Corinthians': '2corinthians',
  'I Thessalonians': '1thessalonians', 'II Thessalonians': '2thessalonians',
  'I Timothy': '1timothy', 'II Timothy': '2timothy',
  'I Peter': '1peter', 'II Peter': '2peter',
  'I John': '1john', 'II John': '2john', 'III John': '3john',
  'Psalm': 'psalms', 'Song of Songs': 'songofsolomon',
};

const TRANSLATIONS = [
  {
    id: 'asv',
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/ASV.json',
  },
  {
    id: 'bsb',
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/BSB.json',
  },
  {
    id: 'kjv',
    url: 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/json/KJV.json',
  },
];

async function fetchJson(url) {
  console.log(`  Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function toBookId(name) {
  if (BOOK_NAME_TO_ID[name]) return BOOK_NAME_TO_ID[name];
  // Fallback: strip spaces and numbers, lowercase
  const lower = name.toLowerCase().replace(/\s+/g, '');
  const match = Object.entries(BOOK_NAME_TO_ID).find(([k]) => 
    k.toLowerCase().replace(/\s+/g, '') === lower
  );
  return match ? match[1] : null;
}

async function downloadTranslation(translation) {
  const outDir = join(ROOT, 'data', 'bible', translation.id);
  mkdirSync(outDir, { recursive: true });

  const data = await fetchJson(translation.url);
  const books = data.books ?? [];
  console.log(`  ${translation.id.toUpperCase()}: ${books.length} books`);

  let bookCount = 0;
  let skipped = [];

  for (const book of books) {
    const bookId = toBookId(book.name);
    if (!bookId) {
      skipped.push(book.name);
      continue;
    }

    const chapters = {};
    for (const ch of (book.chapters ?? [])) {
      chapters[String(ch.chapter)] = ch.verses.map(v => ({
        verse: v.verse,
        text: v.text,
      }));
    }

    const outPath = join(outDir, `${bookId}.json`);
    writeFileSync(outPath, JSON.stringify({ translation: translation.id, bookId, chapters }));
    bookCount++;
  }

  if (skipped.length > 0) {
    console.log(`  Skipped (unmapped): ${skipped.join(', ')}`);
  }
  console.log(`  Wrote ${bookCount} book files to data/bible/${translation.id}/`);
  return bookCount;
}

async function main() {
  console.log('Downloading Bible translations...\n');
  for (const t of TRANSLATIONS) {
    console.log(`[${t.id.toUpperCase()}]`);
    const count = await downloadTranslation(t);
    if (count < 60) {
      console.error(`  WARNING: only ${count} books written — expected 66`);
    }
    console.log('');
  }
  console.log('Done.');
}

main().catch(err => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
