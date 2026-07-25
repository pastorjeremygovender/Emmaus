/**
 * Bible Verse Search — lightweight BSB keyword search for context injection.
 *
 * Reads the same BSB data files as the Bible route but maintains its own
 * in-memory index. Used to inject relevant Scripture passages into the Ask
 * Emmaus system context so the LLM can quote from the app's translation
 * rather than relying solely on training data.
 *
 * Runs concurrently with sermon retrieval before every LLM call.
 * Index is built lazily on first call and cached for the process lifetime.
 */

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const DATA_DIR = join(process.cwd(), "data", "bible", "bsb");

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BiblePassage {
  reference: string;   // "John 3:16"
  bookId: string;
  chapter: number;
  verse: number;
  text: string;
}

interface IndexedVerse extends BiblePassage {
  textLower: string;
  terms: Set<string>;
}

// ─── Book name display map ────────────────────────────────────────────────────

const BOOK_NAMES: Record<string, string> = {
  genesis: "Genesis", exodus: "Exodus", leviticus: "Leviticus",
  numbers: "Numbers", deuteronomy: "Deuteronomy", joshua: "Joshua",
  judges: "Judges", ruth: "Ruth", "1samuel": "1 Samuel", "2samuel": "2 Samuel",
  "1kings": "1 Kings", "2kings": "2 Kings", "1chronicles": "1 Chronicles",
  "2chronicles": "2 Chronicles", ezra: "Ezra", nehemiah: "Nehemiah",
  esther: "Esther", job: "Job", psalms: "Psalms", proverbs: "Proverbs",
  ecclesiastes: "Ecclesiastes", songofsolomon: "Song of Solomon",
  isaiah: "Isaiah", jeremiah: "Jeremiah", lamentations: "Lamentations",
  ezekiel: "Ezekiel", daniel: "Daniel", hosea: "Hosea", joel: "Joel",
  amos: "Amos", obadiah: "Obadiah", jonah: "Jonah", micah: "Micah",
  nahum: "Nahum", habakkuk: "Habakkuk", zephaniah: "Zephaniah",
  haggai: "Haggai", zechariah: "Zechariah", malachi: "Malachi",
  matthew: "Matthew", mark: "Mark", luke: "Luke", john: "John",
  acts: "Acts", romans: "Romans", "1corinthians": "1 Corinthians",
  "2corinthians": "2 Corinthians", galatians: "Galatians",
  ephesians: "Ephesians", philippians: "Philippians", colossians: "Colossians",
  "1thessalonians": "1 Thessalonians", "2thessalonians": "2 Thessalonians",
  "1timothy": "1 Timothy", "2timothy": "2 Timothy", titus: "Titus",
  philemon: "Philemon", hebrews: "Hebrews", james: "James",
  "1peter": "1 Peter", "2peter": "2 Peter", "1john": "1 John",
  "2john": "2 John", "3john": "3 John", jude: "Jude", revelation: "Revelation",
};

function displayName(bookId: string): string {
  return BOOK_NAMES[bookId] ?? bookId;
}

// ─── Tokeniser ────────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "that", "this", "with", "from", "have", "been", "they", "them", "their",
  "will", "shall", "unto", "also", "your", "thou", "thee", "which", "when",
  "then", "what", "said", "were", "does", "hath", "upon", "into", "even",
  "those", "these", "such", "more", "than", "not", "but", "and", "for",
  "the", "are", "you", "his", "her", "him", "all", "can", "had",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

// ─── Index ────────────────────────────────────────────────────────────────────

let _index: IndexedVerse[] | null = null;

function buildIndex(): IndexedVerse[] {
  if (_index !== null) return _index;
  if (!existsSync(DATA_DIR)) {
    _index = [];
    return _index;
  }

  const records: IndexedVerse[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  } catch {
    _index = [];
    return _index;
  }

  for (const file of files) {
    try {
      const raw = readFileSync(join(DATA_DIR, file), "utf-8");
      const data = JSON.parse(raw) as {
        bookId: string;
        chapters: Record<string, Array<{ verse: number; text: string }>>;
      };
      for (const [chStr, verses] of Object.entries(data.chapters)) {
        const chapter = parseInt(chStr, 10);
        for (const v of verses) {
          const textLower = v.text.toLowerCase();
          records.push({
            reference: `${displayName(data.bookId)} ${chapter}:${v.verse}`,
            bookId: data.bookId,
            chapter,
            verse: v.verse,
            text: v.text,
            textLower,
            terms: new Set(tokenize(textLower)),
          });
        }
      }
    } catch {
      /* skip unreadable files */
    }
  }

  _index = records;
  return records;
}

// ─── Public search API ────────────────────────────────────────────────────────

/**
 * Search the BSB for verses relevant to the query.
 * Returns up to `limit` passages ordered by relevance.
 * Runs synchronously (index is in-memory). Never throws.
 */
export function searchBibleVerses(query: string, limit = 5): BiblePassage[] {
  try {
    const index = buildIndex();
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0 || index.length === 0) return [];

    // Score each verse by matched terms
    const scored = index
      .map((v) => {
        let score = 0;
        for (const qt of queryTerms) {
          if (v.terms.has(qt)) {
            score += 2;
          } else {
            // partial prefix match
            for (const vt of v.terms) {
              if (vt.startsWith(qt) || qt.startsWith(vt)) {
                score += 0.5;
                break;
              }
            }
          }
        }
        return { v, score };
      })
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return scored.map((r) => ({
      reference: r.v.reference,
      bookId: r.v.bookId,
      chapter: r.v.chapter,
      verse: r.v.verse,
      text: r.v.text,
    }));
  } catch {
    return [];
  }
}
