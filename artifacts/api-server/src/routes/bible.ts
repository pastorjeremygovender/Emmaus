import { Router } from "express";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";
import { apiBibleProvider } from "../lib/api-bible-provider";
import { type Request, type Response } from "express";
import { requireAuth } from "../emmaus/auth.js";
import { getBibleData, patchBibleData, type UserBibleData } from "../bible/store.js";
import { isAdmin } from "../lib/user-role-store.js";
import { pool } from "@workspace/db";
import {
  parseBulkImport,
  type VerseCountResolver,
} from "../lib/bible-bulk-import.js";
import {
  addImportConflicts,
  importBibleStudyChapters,
  listBibleStudyImportHistory,
  PUBLISHED_STUDY_NOTE_FOR_VERSE_SQL,
  type ImportConflictMode,
  type ImportTargetStatus,
} from "../lib/bible-bulk-import-store.js";

// Resolve data dir relative to the compiled bundle file, not process.cwd().
// In production the run command is `node artifacts/api-server/dist/index.mjs`
// executed from the workspace root, so process.cwd() ≠ artifacts/api-server/.
// import.meta.url always points to the actual bundle file regardless of cwd.
const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "../data/bible");

const router = Router();

// ─── Local (public-domain) translation metadata ───────────────────────────────

type LocalTranslation = {
  id: string;
  name: string;
  abbreviation: string;
  language: string;
  copyright: string;
  provider: "local";
};

const LOCAL_TRANSLATIONS: LocalTranslation[] = [
  {
    id: "bsb",
    name: "Berean Standard Bible",
    abbreviation: "BSB",
    language: "en",
    copyright:
      "Public Domain (CC0). Berean Standard Bible. Free to use, copy, and distribute without restriction.",
    provider: "local",
  },
  {
    id: "asv",
    name: "American Standard Version",
    abbreviation: "ASV",
    language: "en",
    copyright:
      "Public Domain. American Standard Version (1901). No copyright restrictions.",
    provider: "local",
  },
  {
    id: "kjv",
    name: "King James Version",
    abbreviation: "KJV",
    language: "en",
    copyright:
      "Public Domain. King James Version (1611/1769). No copyright restrictions.",
    provider: "local",
  },
];

const LOCAL_TRANSLATION_IDS = new Set(LOCAL_TRANSLATIONS.map((t) => t.id));

// Licensed translation IDs that may be served via API.Bible.
// Must match the internal IDs in CONFIRMED_BIBLES in api-bible-provider.ts.
const LICENSED_TRANSLATION_IDS = new Set(["niv", "gnt", "msg"]);

// ─── In-memory search index ───────────────────────────────────────────────────

type VerseRecord = {
  bookId: string;
  chapter: number;
  verse: number;
  text: string;
  textLower: string;
};

const searchIndices: Map<string, VerseRecord[]> = new Map();

function buildSearchIndex(translationId: string): VerseRecord[] {
  const cached = searchIndices.get(translationId);
  if (cached) return cached;

  logger.info({ translationId }, "Building Bible search index");
  const records: VerseRecord[] = [];
  const transDir = join(DATA_DIR, translationId);
  if (!existsSync(transDir)) return records;

  let files: string[] = [];
  try { files = readdirSync(transDir); } catch { return records; }

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = readFileSync(join(transDir, file), "utf8");
      const data = JSON.parse(raw) as {
        bookId: string;
        chapters: Record<string, Array<{ verse: number; text: string }>>;
      };
      for (const [chStr, verses] of Object.entries(data.chapters)) {
        const chapter = parseInt(chStr, 10);
        for (const v of verses) {
          records.push({
            bookId: data.bookId,
            chapter,
            verse: v.verse,
            text: v.text,
            textLower: v.text.toLowerCase(),
          });
        }
      }
    } catch (err) {
      logger.warn({ file, err }, "Failed to load bible book file for search index");
    }
  }

  searchIndices.set(translationId, records);
  logger.info({ translationId, verses: records.length }, "Bible search index ready");
  return records;
}

// Pre-load local indices on startup
setTimeout(() => {
  for (const t of LOCAL_TRANSLATIONS) {
    buildSearchIndex(t.id);
  }
  // Kick off licensed catalogue discovery in background (non-blocking)
  if (process.env.API_BIBLE_KEY) {
    apiBibleProvider.getAvailableTranslations().then(licensed => {
      if (licensed.length > 0) {
        logger.info({ count: licensed.length, ids: licensed.map(t => t.id) }, "Licensed translations available");
      } else {
        logger.info("No licensed translations available on this API.Bible account");
      }
    }).catch(() => { /* logged inside provider */ });
  } else {
    logger.info("API_BIBLE_KEY not set — licensed translations (NIV, GNT, MSG) unavailable");
  }
}, 500);

// ─── GET /api/bible/translations ──────────────────────────────────────────────
// Returns local translations always; licensed translations only when confirmed
// available on the configured API.Bible account.

router.get("/bible/translations", async (_req, res) => {
  try {
    const licensed = process.env.API_BIBLE_KEY
      ? await apiBibleProvider.getAvailableTranslations()
      : [];

    // Strip internal bibleId from client response — never expose it
    const licensedPublic = licensed.map(({ bibleId: _bibleId, attributionUrl, ...rest }) => ({
      ...rest,
      attributionUrl,
    }));

    res.json({ translations: [...LOCAL_TRANSLATIONS, ...licensedPublic] });
  } catch {
    // Fall back to local-only if catalogue fails
    res.json({ translations: LOCAL_TRANSLATIONS });
  }
});

// ─── Canonical book IDs allowlist (all 66 Protestant canon books) ─────────────

const VALID_BOOK_IDS = new Set([
  "genesis", "exodus", "leviticus", "numbers", "deuteronomy",
  "joshua", "judges", "ruth", "1samuel", "2samuel",
  "1kings", "2kings", "1chronicles", "2chronicles",
  "ezra", "nehemiah", "esther", "job", "psalms", "proverbs",
  "ecclesiastes", "songofsolomon", "isaiah", "jeremiah",
  "lamentations", "ezekiel", "daniel", "hosea", "joel", "amos",
  "obadiah", "jonah", "micah", "nahum", "habakkuk", "zephaniah",
  "haggai", "zechariah", "malachi",
  "matthew", "mark", "luke", "john", "acts", "romans",
  "1corinthians", "2corinthians", "galatians", "ephesians",
  "philippians", "colossians", "1thessalonians", "2thessalonians",
  "1timothy", "2timothy", "titus", "philemon", "hebrews",
  "james", "1peter", "2peter", "1john", "2john", "3john",
  "jude", "revelation",
]);

// All valid translation IDs (local + licensed)
function isValidTranslation(id: string): boolean {
  return LOCAL_TRANSLATION_IDS.has(id) || LICENSED_TRANSLATION_IDS.has(id);
}

// ─── Book Intros & Chapter Overviews (must be before the wildcard route) ──────
//
// GET /api/bible/book-intro/:bookId
// GET /api/bible/chapter-overview/:bookId/:chapter

import { BOOK_INTROS, CHAPTER_OVERVIEWS } from "../bible/book-intros.js";

router.get("/bible/book-intro/:bookId", (req, res, next) => {
  const bookId = String(req.params.bookId).toLowerCase().trim();
  // Keep the literal admin collection route reachable below. Express treats
  // /admin as a valid :bookId unless this dynamic route explicitly passes it on.
  if (bookId === "admin") {
    next();
    return;
  }
  const intro = BOOK_INTROS[bookId];
  if (!intro) {
    res.status(404).json({ error: "No intro available for this book" });
    return;
  }
  res.json(intro);
});

router.get("/bible/chapter-overview/:bookId/:chapter", (req, res) => {
  const bookId = String(req.params.bookId).toLowerCase().trim();
  const chapter = parseInt(String(req.params.chapter), 10);
  if (isNaN(chapter) || chapter < 1) {
    res.status(400).json({ error: "Invalid chapter number" });
    return;
  }
  const key = `${bookId}:${chapter}`;
  const summary = CHAPTER_OVERVIEWS[key];
  if (!summary) {
    res.status(404).json({ error: "No overview available for this chapter" });
    return;
  }
  res.json({ bookId, chapter, summary });
});

// ─── GET /api/bible/:translation/:bookId/:chapter ─────────────────────────────

router.get("/bible/:translation/:bookId/:chapter", async (req, res) => {
  const { translation, bookId, chapter } = req.params;
  const chapterNum = parseInt(chapter, 10);

  // Strict allowlist checks before any I/O
  if (!isValidTranslation(translation)) {
    res.status(404).json({ error: "Translation not found" });
    return;
  }
  if (!VALID_BOOK_IDS.has(bookId)) {
    res.status(400).json({ error: "Invalid book ID" });
    return;
  }
  if (isNaN(chapterNum) || chapterNum < 1 || chapterNum > 150) {
    res.status(400).json({ error: "Invalid chapter number" });
    return;
  }

  // ── Licensed translation (NIV, GNT, NKJV via API.Bible) ──────────────────
  if (LICENSED_TRANSLATION_IDS.has(translation)) {
    try {
      const chapterData = await apiBibleProvider.getChapter(translation, bookId, chapterNum);
      if (!chapterData) {
        res.status(404).json({ error: "This translation is not currently available." });
        return;
      }
      const wordCount = chapterData.verses.reduce((acc, v) => acc + v.text.split(/\s+/).length, 0);
      const readingMinutes = Math.max(1, Math.round(wordCount / 200));

      // Licensed content: short cache only, no CDN persistence
      res.setHeader("Cache-Control", "private, max-age=300");
      res.json({
        translation,
        bookId,
        chapter: chapterNum,
        verses: chapterData.verses,
        readingMinutes,
        copyright: chapterData.copyright,
        attributionText: chapterData.attributionText,
      });
    } catch (err) {
      logger.warn({ err: String(err), translation, bookId, chapterNum }, "Licensed chapter fetch failed");
      res.status(503).json({ error: "This chapter could not be loaded in the selected translation just now." });
    }
    return;
  }

  // ── Local public-domain translation (BSB, ASV, KJV) ──────────────────────
  const filePath = join(DATA_DIR, translation, `${bookId}.json`);
  if (!filePath.startsWith(DATA_DIR + "/")) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  if (!existsSync(filePath)) {
    res.status(404).json({ error: "Book not found", bookId, translation });
    return;
  }

  try {
    const raw = readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as {
      bookId: string;
      chapters: Record<string, Array<{ verse: number; text: string }>>;
    };

    const verses = data.chapters[String(chapterNum)];
    if (!verses) {
      res.status(404).json({ error: "Chapter not found", chapter: chapterNum });
      return;
    }

    const wordCount = verses.reduce((acc, v) => acc + v.text.split(/\s+/).length, 0);
    const readingMinutes = Math.max(1, Math.round(wordCount / 200));

    res.setHeader("Cache-Control", "public, max-age=86400");
    res.json({ translation, bookId, chapter: chapterNum, verses, readingMinutes });
  } catch (err) {
    logger.error({ err, bookId, translation, chapterNum }, "Failed to read Bible chapter");
    res.status(500).json({ error: "Failed to load chapter" });
  }
});

// ─── POST /api/bible/search ───────────────────────────────────────────────────

const BOOK_NAMES: Record<string, string> = {
  genesis: "Genesis", exodus: "Exodus", leviticus: "Leviticus", numbers: "Numbers",
  deuteronomy: "Deuteronomy", joshua: "Joshua", judges: "Judges", ruth: "Ruth",
  "1samuel": "1 Samuel", "2samuel": "2 Samuel", "1kings": "1 Kings", "2kings": "2 Kings",
  "1chronicles": "1 Chronicles", "2chronicles": "2 Chronicles", ezra: "Ezra",
  nehemiah: "Nehemiah", esther: "Esther", job: "Job", psalms: "Psalms",
  proverbs: "Proverbs", ecclesiastes: "Ecclesiastes", songofsolomon: "Song of Solomon",
  isaiah: "Isaiah", jeremiah: "Jeremiah", lamentations: "Lamentations", ezekiel: "Ezekiel",
  daniel: "Daniel", hosea: "Hosea", joel: "Joel", amos: "Amos", obadiah: "Obadiah",
  jonah: "Jonah", micah: "Micah", nahum: "Nahum", habakkuk: "Habakkuk",
  zephaniah: "Zephaniah", haggai: "Haggai", zechariah: "Zechariah", malachi: "Malachi",
  matthew: "Matthew", mark: "Mark", luke: "Luke", john: "John", acts: "Acts",
  romans: "Romans", "1corinthians": "1 Corinthians", "2corinthians": "2 Corinthians",
  galatians: "Galatians", ephesians: "Ephesians", philippians: "Philippians",
  colossians: "Colossians", "1thessalonians": "1 Thessalonians", "2thessalonians": "2 Thessalonians",
  "1timothy": "1 Timothy", "2timothy": "2 Timothy", titus: "Titus", philemon: "Philemon",
  hebrews: "Hebrews", james: "James", "1peter": "1 Peter", "2peter": "2 Peter",
  "1john": "1 John", "2john": "2 John", "3john": "3 John", jude: "Jude",
  revelation: "Revelation",
};

const BOOK_ALIASES: Record<string, string> = {
  "gen": "genesis", "ex": "exodus", "exo": "exodus", "lev": "leviticus", "num": "numbers",
  "deut": "deuteronomy", "deu": "deuteronomy", "josh": "joshua", "judg": "judges",
  "ps": "psalms", "psa": "psalms", "psalm": "psalms", "prov": "proverbs", "pro": "proverbs",
  "eccl": "ecclesiastes", "ecc": "ecclesiastes", "song": "songofsolomon", "sos": "songofsolomon",
  "isa": "isaiah", "jer": "jeremiah", "lam": "lamentations", "ezek": "ezekiel", "eze": "ezekiel",
  "dan": "daniel", "hos": "hosea", "hab": "habakkuk", "zeph": "zephaniah", "hag": "haggai",
  "zech": "zechariah", "zec": "zechariah", "mal": "malachi",
  "matt": "matthew", "mat": "matthew", "mk": "mark", "lk": "luke", "jn": "john",
  "jhn": "john", "rom": "romans", "1cor": "1corinthians", "2cor": "2corinthians",
  "gal": "galatians", "eph": "ephesians", "phil": "philippians", "col": "colossians",
  "1thes": "1thessalonians", "2thes": "2thessalonians", "1tim": "1timothy", "2tim": "2timothy",
  "tit": "titus", "phlm": "philemon", "heb": "hebrews", "jas": "james",
  "1pet": "1peter", "2pet": "2peter", "1jn": "1john", "2jn": "2john", "3jn": "3john",
  "rev": "revelation",
};

function parseReference(query: string) {
  const q = query.trim();
  const refPattern = /^(\d?\s*[a-zA-Z\s]+?)\s+(\d+)(?::(\d+))?$/;
  const match = q.match(refPattern);
  if (!match) return null;
  const rawBook = match[1].replace(/\s+/g, "").toLowerCase();
  const chapter = parseInt(match[2], 10);
  const verse = match[3] ? parseInt(match[3], 10) : null;
  const bookId =
    BOOK_ALIASES[rawBook] ??
    Object.keys(BOOK_NAMES).find(
      (id) =>
        id === rawBook ||
        BOOK_NAMES[id].toLowerCase().replace(/\s/g, "") === rawBook.replace(/\s/g, "")
    ) ??
    null;
  if (bookId && !isNaN(chapter) && chapter >= 1) return { bookId, chapter, verse };
  return null;
}

router.post("/bible/search", (req, res) => {
  const { query, translation = "bsb" } = req.body as { query?: string; translation?: string };

  if (!query || query.trim().length < 2) {
    res.status(400).json({ error: "Query must be at least 2 characters" });
    return;
  }
  if (!LOCAL_TRANSLATION_IDS.has(translation)) {
    // Search is only supported for local public-domain translations
    res.status(400).json({ error: "Search is not supported for this translation" });
    return;
  }

  const q = query.trim();
  type Result = { bookId: string; bookName: string; chapter: number; verse: number; text: string; isReference: boolean };
  const results: Result[] = [];

  // Try reference first — bookId comes from parseReference which resolves only known canonical IDs
  const ref = parseReference(q);
  if (ref && VALID_BOOK_IDS.has(ref.bookId)) {
    const refPath = join(DATA_DIR, translation, `${ref.bookId}.json`);
    if (existsSync(refPath)) {
      try {
        const raw = readFileSync(refPath, "utf8");
        const data = JSON.parse(raw) as { bookId: string; chapters: Record<string, Array<{ verse: number; text: string }>> };
        const chVers = data.chapters[String(ref.chapter)] ?? [];
        const bookName = BOOK_NAMES[ref.bookId] ?? ref.bookId;
        if (ref.verse) {
          const v = chVers.find((v) => v.verse === ref.verse);
          if (v) results.push({ bookId: ref.bookId, bookName, chapter: ref.chapter, verse: v.verse, text: v.text, isReference: true });
        } else {
          for (const v of chVers.slice(0, 5)) {
            results.push({ bookId: ref.bookId, bookName, chapter: ref.chapter, verse: v.verse, text: v.text, isReference: true });
          }
        }
      } catch { /* ignore */ }
    }
  }

  if (results.length === 0) {
    // Full-text search
    const index = buildSearchIndex(translation);
    const qLower = q.toLowerCase();
    for (const record of index) {
      if (record.textLower.includes(qLower)) {
        results.push({ bookId: record.bookId, bookName: BOOK_NAMES[record.bookId] ?? record.bookId, chapter: record.chapter, verse: record.verse, text: record.text, isReference: false });
        if (results.length >= 30) break;
      }
    }
  }

  res.json({ query: q, translation, results });
});

// ─── GET /api/bible/validate-ref?ref=John+15 ─────────────────────────────────
// Returns { valid, reference, bookId, chapter, verseCount, verseText }
// verseText is populated only if ref includes a specific verse number.

router.get("/bible/validate-ref", (req, res) => {
  const raw = String(req.query.ref ?? "").trim();
  if (!raw) {
    res.status(400).json({ error: "ref query param is required" });
    return;
  }

  const ref = parseReference(raw);
  if (!ref || !VALID_BOOK_IDS.has(ref.bookId)) {
    res.json({ valid: false });
    return;
  }

  // Try to read the file to get verse count and optionally verse text
  // (only available for local public-domain translations)
  const defaultTranslation = "bsb";
  const filePath = join(DATA_DIR, defaultTranslation, `${ref.bookId}.json`);
  if (!existsSync(filePath)) {
    // Book recognised but no local data — valid reference, no text
    const bookName = BOOK_NAMES[ref.bookId] ?? ref.bookId;
    const verseLabel = ref.verse ? `:${ref.verse}` : "";
    res.json({
      valid: true,
      reference: `${bookName} ${ref.chapter}${verseLabel}`,
      bookId: ref.bookId,
      chapter: ref.chapter,
      verseCount: 0,
    });
    return;
  }

  try {
    const raw2 = readFileSync(filePath, "utf8");
    const data = JSON.parse(raw2) as {
      bookId: string;
      chapters: Record<string, Array<{ verse: number; text: string }>>;
    };
    const chapterVerses = data.chapters[String(ref.chapter)] ?? [];
    if (chapterVerses.length === 0) {
      res.json({ valid: false }); return;
    }

    const bookName = BOOK_NAMES[ref.bookId] ?? ref.bookId;
    const verseLabel = ref.verse ? `:${ref.verse}` : "";
    const reference = `${bookName} ${ref.chapter}${verseLabel}`;

    let verseText: string | undefined;
    if (ref.verse) {
      const v = chapterVerses.find(v => v.verse === ref.verse);
      verseText = v?.text;
    } else {
      // Return first 5 verses joined
      verseText = chapterVerses.slice(0, 5).map(v => `${v.verse} ${v.text}`).join(" ");
    }

    res.json({
      valid: true,
      reference,
      bookId: ref.bookId,
      chapter: ref.chapter,
      verseCount: chapterVerses.length,
      verseText,
    });
  } catch {
    res.json({ valid: false });
  }
});

// ─── User Reading Data Routes ──────────────────────────────────────────────────
//
// GET  /api/bible/data   — load all Bible reading data for the authenticated user
// PATCH /api/bible/data  — merge a partial update into the user's stored data
//
// Identity: X-User-Id header (demo mode) or signed session cookie.

// GET /api/bible/data — returns full Bible data for the caller
// Returns 404 when no cloud record exists yet (client should fall back to
// localStorage and migrate it to cloud via PATCH on first authenticated load).
router.get("/bible/data", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const data = await getBibleData(userId);
    if (data === null) {
      res.status(404).json({ error: "No Bible data found for user" });
      return;
    }
    res.json(data);
  } catch (err) {
    logger.error({ err }, "GET /bible/data failed");
    res.status(500).json({ error: "Failed to load Bible data" });
  }
});

// PATCH /api/bible/data — atomically merges provided fields into the caller's stored data
router.patch("/bible/data", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const patch = req.body as Partial<UserBibleData>;

  // Only allow known fields to prevent injection of arbitrary data
  const allowed: (keyof UserBibleData)[] = [
    "history",
    "completed",
    "journeyProgress",
    "highlights",
    "favourites",
    "bookmarks",
    "notes",
    "reflections",
    "prayers",
  ];

  const sanitized: Partial<UserBibleData> = {};
  for (const key of allowed) {
    if (key in patch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sanitized as any)[key] = (patch as any)[key];
    }
  }

  try {
    const updated = await patchBibleData(userId, sanitized);
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "PATCH /bible/data failed");
    res.status(500).json({ error: "Failed to save Bible data" });
  }
});

// ─── Cross References ──────────────────────────────────────────────────────────
//
// GET  /api/bible/cross-references?bookId=john&chapter=3&verse=16
//   → Returns all cross reference pairs that include this verse (in either direction),
//     with inline verse text fetched from the pre-loaded BSB search index.
//
// Admin CRUD:
//   GET    /api/bible/cross-references/admin
//   POST   /api/bible/cross-references/admin
//   DELETE /api/bible/cross-references/admin/:id

// Helper: look up a verse text from the already-loaded in-memory BSB search index.
// Falls back to a one-time synchronous file load (cached) if the index isn't warm yet.
// Never reads a file on a hot request path.
const bsbVerseCache = new Map<string, string>(); // key: "bookId:chapter:verse"
function getLocalVerseText(bookId: string, chapter: number, verse: number): string | null {
  const cacheKey = `${bookId}:${chapter}:${verse}`;
  if (bsbVerseCache.has(cacheKey)) return bsbVerseCache.get(cacheKey)!;

  // Try the pre-built BSB search index first (avoids any I/O if already warmed)
  const index = searchIndices.get("bsb");
  if (index && index.length > 0) {
    const record = index.find(r => r.bookId === bookId && r.chapter === chapter && r.verse === verse);
    const text = record?.text ?? null;
    if (text) bsbVerseCache.set(cacheKey, text);
    return text;
  }

  // Fallback: one-time synchronous load (only before index is warm, typically never on hot path)
  try {
    const filePath = join(DATA_DIR, "bsb", `${bookId}.json`);
    if (!existsSync(filePath)) return null;
    const raw = readFileSync(filePath, "utf8");
    const data = JSON.parse(raw) as {
      chapters: Record<string, Array<{ verse: number; text: string }>>;
    };
    const verses = data.chapters[String(chapter)] ?? [];
    const text = verses.find(v => v.verse === verse)?.text ?? null;
    if (text) bsbVerseCache.set(cacheKey, text);
    return text;
  } catch {
    return null;
  }
}

// Validation helper for cross-reference verse coordinates
function validateVerseCoords(
  bookId: unknown, chapter: unknown, verse: unknown
): { bookId: string; chapter: number; verse: number } | null {
  const bid = String(bookId ?? "").trim().toLowerCase();
  const ch  = Number(chapter);
  const v   = Number(verse);
  if (!VALID_BOOK_IDS.has(bid))          return null;
  if (!Number.isFinite(ch) || ch < 1 || ch > 150) return null;
  if (!Number.isFinite(v)  || v < 1  || v > 200)  return null;
  return { bookId: bid, chapter: ch, verse: v };
}

// Member: fetch cross references for a verse (both directions)
router.get("/bible/cross-references", async (req: Request, res: Response) => {
  const bookId  = String(req.query.bookId ?? "").trim().toLowerCase();
  const chapter = parseInt(String(req.query.chapter ?? ""), 10);
  const verse   = parseInt(String(req.query.verse ?? ""), 10);

  if (!bookId || isNaN(chapter) || isNaN(verse)) {
    res.status(400).json({ error: "bookId, chapter, and verse are required" });
    return;
  }

  try {
    const result = await pool.query(
      `SELECT * FROM bible_cross_references
       WHERE (from_book_id = $1 AND from_chapter = $2 AND from_verse = $3)
          OR (to_book_id   = $1 AND to_chapter   = $2 AND to_verse   = $3)
       ORDER BY created_at ASC`,
      [bookId, chapter, verse]
    );

    // Enrich each row with inline verse text for the "other" side of the link
    const enriched = result.rows.map((row: {
      id: string;
      from_book_id: string; from_chapter: number; from_verse: number;
      to_book_id: string;   to_chapter: number;   to_verse: number;
      relationship_note: string;
    }) => {
      const isFrom = row.from_book_id === bookId && row.from_chapter === chapter && row.from_verse === verse;
      const targetBook    = isFrom ? row.to_book_id    : row.from_book_id;
      const targetChapter = isFrom ? row.to_chapter    : row.from_chapter;
      const targetVerse   = isFrom ? row.to_verse      : row.from_verse;
      const verseText     = getLocalVerseText(targetBook, targetChapter, targetVerse);
      const bookName      = BOOK_NAMES[targetBook] ?? targetBook;
      return {
        id: row.id,
        from_book_id: row.from_book_id, from_chapter: row.from_chapter, from_verse: row.from_verse,
        to_book_id:   row.to_book_id,   to_chapter:   row.to_chapter,   to_verse:   row.to_verse,
        relationship_note: row.relationship_note,
        // Resolved target for display
        targetBookId:   targetBook,
        targetBookName: bookName,
        targetChapter,
        targetVerse,
        targetVerseText: verseText,
        targetRef: `${bookName} ${targetChapter}:${targetVerse}`,
      };
    });

    res.json(enriched);
  } catch (err) {
    logger.error({ err }, "GET /bible/cross-references failed");
    res.json([]); // non-critical
  }
});

// Admin: list all cross references
router.get("/bible/cross-references/admin", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const bookId = String(req.query.bookId ?? "").trim().toLowerCase();
  try {
    let query = "SELECT * FROM bible_cross_references";
    const params: string[] = [];
    if (bookId) {
      params.push(bookId);
      query += ` WHERE from_book_id = $1 OR to_book_id = $1`;
    }
    query += " ORDER BY from_book_id, from_chapter, from_verse";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "GET /bible/cross-references/admin failed");
    res.status(500).json({ error: "Failed to list cross references" });
  }
});

// Admin: create a cross reference
router.post("/bible/cross-references/admin", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const { from_book_id, from_chapter, from_verse, to_book_id, to_chapter, to_verse, relationship_note } = req.body;

  const fromCoords = validateVerseCoords(from_book_id, from_chapter, from_verse);
  const toCoords   = validateVerseCoords(to_book_id,   to_chapter,   to_verse);

  if (!fromCoords) {
    res.status(400).json({ error: `Invalid 'from' verse: book must be a canonical Bible book ID, chapter 1–150, verse 1–200` });
    return;
  }
  if (!toCoords) {
    res.status(400).json({ error: `Invalid 'to' verse: book must be a canonical Bible book ID, chapter 1–150, verse 1–200` });
    return;
  }
  // Reject self-links
  if (
    fromCoords.bookId === toCoords.bookId &&
    fromCoords.chapter === toCoords.chapter &&
    fromCoords.verse === toCoords.verse
  ) {
    res.status(400).json({ error: "A verse cannot reference itself" });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO bible_cross_references
         (from_book_id, from_chapter, from_verse, to_book_id, to_chapter, to_verse, relationship_note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        fromCoords.bookId, fromCoords.chapter, fromCoords.verse,
        toCoords.bookId,   toCoords.chapter,   toCoords.verse,
        String(relationship_note ?? '').trim(), userId,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "POST /bible/cross-references/admin failed");
    res.status(500).json({ error: "Failed to create cross reference" });
  }
});

// Admin: delete a cross reference
router.delete("/bible/cross-references/admin/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }

  try {
    await pool.query("DELETE FROM bible_cross_references WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /bible/cross-references/admin/:id failed");
    res.status(500).json({ error: "Failed to delete cross reference" });
  }
});

// ─── Study Notes ───────────────────────────────────────────────────────────────
//
// GET  /api/bible/study-notes?bookId=john&chapter=1&verse=1
//   → Returns the first Published study note that covers the requested verse.
//
// Admin CRUD (requires server-verified admin or superAdmin role via user-role-store):
//   GET    /api/bible/study-notes/admin
//   POST   /api/bible/study-notes/admin
//   PUT    /api/bible/study-notes/admin/:id
//   PATCH  /api/bible/study-notes/admin/:id/status
//   DELETE /api/bible/study-notes/admin/:id

/**
 * Verifies the caller is an authenticated admin or superAdmin using the
 * server-side role store — never trusts the client-controlled x-user-role header.
 * Returns the authenticated userId on success, or null after sending 401/403.
 */
async function requireAdminRole(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null; // 401 already sent by requireAuth

  const adminAccess = await isAdmin(userId);
  if (!adminAccess) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

// ─── Bulk Bible Study Import ──────────────────────────────────────────────────

const MAX_BULK_IMPORT_CHARS = 10_000_000;
const bulkImportVerseCountCache = new Map<string, number | null>();

const resolveBulkImportVerseCount: VerseCountResolver = (bookId, chapter) => {
  const key = `${bookId}:${chapter}`;
  if (bulkImportVerseCountCache.has(key)) {
    return bulkImportVerseCountCache.get(key) ?? null;
  }
  if (!VALID_BOOK_IDS.has(bookId)) return null;

  try {
    const filePath = join(DATA_DIR, "bsb", `${bookId}.json`);
    if (!existsSync(filePath)) {
      bulkImportVerseCountCache.set(key, null);
      return null;
    }
    const data = JSON.parse(readFileSync(filePath, "utf8")) as {
      chapters?: Record<string, Array<{ verse: number; text: string }>>;
    };
    const count = data.chapters?.[String(chapter)]?.length ?? null;
    bulkImportVerseCountCache.set(key, count);
    return count;
  } catch {
    bulkImportVerseCountCache.set(key, null);
    return null;
  }
};

function validateBulkImportText(
  value: unknown,
  res: Response,
): value is string {
  if (typeof value !== "string" || !value.trim()) {
    res.status(400).json({ error: "A non-empty text block is required" });
    return false;
  }
  if (value.length > MAX_BULK_IMPORT_CHARS) {
    res.status(413).json({
      error: "Import text is too large",
      maxCharacters: MAX_BULK_IMPORT_CHARS,
    });
    return false;
  }
  return true;
}

router.post("/bible/study-import/preview", async (req: Request, res: Response) => {
  const userId = await requireAdminRole(req, res);
  if (!userId) return;
  const text = req.body?.text;
  if (!validateBulkImportText(text, res)) return;

  try {
    const parsed = await parseBulkImport(text, resolveBulkImportVerseCount);
    const preview = await addImportConflicts(parsed);
    res.json(preview);
  } catch (err) {
    logger.error({ err, userId }, "POST /bible/study-import/preview failed");
    res.status(500).json({ error: "Failed to parse Bible Study import" });
  }
});

router.post("/bible/study-import", async (req: Request, res: Response) => {
  const userId = await requireAdminRole(req, res);
  if (!userId) return;

  const text = req.body?.text;
  const mode = req.body?.mode as ImportConflictMode;
  const targetStatus = req.body?.targetStatus as ImportTargetStatus;
  const selectedChapterKeys = req.body?.selectedChapterKeys;

  if (!validateBulkImportText(text, res)) return;
  if (!["skip", "replace", "merge"].includes(mode)) {
    res.status(400).json({ error: "mode must be skip, replace, or merge" });
    return;
  }
  if (!["Draft", "Published"].includes(targetStatus)) {
    res.status(400).json({ error: "targetStatus must be Draft or Published" });
    return;
  }
  if (
    !Array.isArray(selectedChapterKeys) ||
    selectedChapterKeys.length === 0 ||
    !selectedChapterKeys.every(
      (key: unknown) => typeof key === "string" && /^[a-z0-9]+:\d+$/.test(key),
    )
  ) {
    res.status(400).json({ error: "At least one valid chapter must be selected" });
    return;
  }

  try {
    // Reparse on import so writes never trust a client-edited preview payload.
    const parsed = await parseBulkImport(text, resolveBulkImportVerseCount);
    if (!parsed.valid) {
      res.status(400).json({
        error: "The import contains validation errors",
        preview: await addImportConflicts(parsed),
      });
      return;
    }

    const result = await importBibleStudyChapters({
      preview: parsed,
      selectedChapterKeys,
      mode,
      targetStatus,
      userId,
    });
    res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Import failed";
    logger.error({ err, userId }, "POST /bible/study-import failed");
    if (message === "No valid chapters were selected") {
      res.status(400).json({ error: message });
      return;
    }
    res.status(500).json({ error: "Bible Study import failed" });
  }
});

router.get("/bible/study-import/history", async (req: Request, res: Response) => {
  const userId = await requireAdminRole(req, res);
  if (!userId) return;
  const limit = Number(req.query.limit ?? 50);
  try {
    const history = await listBibleStudyImportHistory(
      Number.isFinite(limit) ? limit : 50,
    );
    res.json({ history });
  } catch (err) {
    logger.error({ err, userId }, "GET /bible/study-import/history failed");
    res.status(500).json({ error: "Failed to load import history" });
  }
});

// Member: fetch Published study note for a specific verse
router.get("/bible/study-notes", async (req: Request, res: Response) => {
  const bookId  = String(req.query.bookId ?? "").trim().toLowerCase();
  const chapter = parseInt(String(req.query.chapter ?? ""), 10);
  const verse   = parseInt(String(req.query.verse ?? ""), 10);

  if (!bookId || isNaN(chapter) || isNaN(verse)) {
    res.status(400).json({ error: "bookId, chapter, and verse are required" });
    return;
  }

  try {
    const result = await pool.query(PUBLISHED_STUDY_NOTE_FOR_VERSE_SQL, [
      bookId,
      chapter,
      verse,
    ]);
    res.json(result.rows[0] ?? null);
  } catch (err) {
    logger.error({ err }, "GET /bible/study-notes failed");
    res.json(null); // non-critical — reader still works without study notes
  }
});

// Admin: list all study notes (all statuses)
router.get("/bible/study-notes/admin", async (req: Request, res: Response) => {
  if (!await requireAdminRole(req, res)) return;
  try {
    const bookId  = String(req.query.bookId ?? "").trim().toLowerCase();
    const chapter = parseInt(String(req.query.chapter ?? ""), 10);
    let query = "SELECT * FROM bible_study_notes";
    const params: (string | number)[] = [];
    if (bookId) {
      params.push(bookId);
      query += ` WHERE book_id = $${params.length}`;
      if (!isNaN(chapter)) {
        params.push(chapter);
        query += ` AND chapter = $${params.length}`;
      }
    }
    query += " ORDER BY book_id, chapter, verse_start";
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "GET /bible/study-notes/admin failed");
    res.status(500).json({ error: "Failed to list study notes" });
  }
});

// Admin: create a study note
router.post("/bible/study-notes/admin", async (req: Request, res: Response) => {
  const userId = await requireAdminRole(req, res);
  if (!userId) return;

  const {
    book_id, chapter, verse_start, verse_end, title, content,
    context_note, historical_note, original_language_note,
    jesus_connection, apply_it, key_truth, reflection_question, related_scriptures, status,
  } = req.body;

  if (!book_id || !chapter || !verse_start) {
    res.status(400).json({ error: "book_id, chapter, verse_start are required" });
    return;
  }

  try {
    const result = await pool.query(
      `INSERT INTO bible_study_notes
         (book_id, chapter, verse_start, verse_end, title, content,
          context_note, historical_note, original_language_note,
          jesus_connection, apply_it, key_truth, reflection_question, related_scriptures,
          status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)
       RETURNING *`,
      [
        book_id, Number(chapter), Number(verse_start),
        verse_end ? Number(verse_end) : null,
        title ?? '', content ?? '', context_note ?? '',
        historical_note ?? '', original_language_note ?? '',
        jesus_connection ?? '', apply_it ?? '',
        key_truth ?? '', reflection_question ?? '', related_scriptures ?? '',
        status ?? 'Draft', userId,
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "POST /bible/study-notes/admin failed");
    res.status(500).json({ error: "Failed to create study note" });
  }
});

// Admin: update a study note
router.put("/bible/study-notes/admin/:id", async (req: Request, res: Response) => {
  const userId = await requireAdminRole(req, res);
  if (!userId) return;

  const { id } = req.params;
  const {
    book_id, chapter, verse_start, verse_end, title, content,
    context_note, historical_note, original_language_note,
    jesus_connection, apply_it, key_truth, reflection_question, related_scriptures, status,
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE bible_study_notes SET
         book_id = $1, chapter = $2, verse_start = $3, verse_end = $4,
         title = $5, content = $6, context_note = $7, historical_note = $8,
         original_language_note = $9, jesus_connection = $10, apply_it = $11,
         key_truth = $12, reflection_question = $13, related_scriptures = $14,
         status = $15, updated_by = $16, updated_at = now()
       WHERE id = $17 RETURNING *`,
      [
        book_id, Number(chapter), Number(verse_start),
        verse_end ? Number(verse_end) : null,
        title ?? '', content ?? '', context_note ?? '',
        historical_note ?? '', original_language_note ?? '',
        jesus_connection ?? '', apply_it ?? '',
        key_truth ?? '', reflection_question ?? '', related_scriptures ?? '',
        status ?? 'Draft', userId, id,
      ]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "PUT /bible/study-notes/admin/:id failed");
    res.status(500).json({ error: "Failed to update study note" });
  }
});

// Admin: change status only
router.patch("/bible/study-notes/admin/:id/status", async (req: Request, res: Response) => {
  const userId = await requireAdminRole(req, res);
  if (!userId) return;

  const { id } = req.params;
  const { status } = req.body;
  const VALID = ['Draft', 'In Review', 'Published', 'Archived'];
  if (!VALID.includes(status)) {
    res.status(400).json({ error: `status must be one of ${VALID.join(', ')}` });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE bible_study_notes SET status = $1, updated_by = $2, updated_at = now()
       WHERE id = $3 RETURNING *`,
      [status, userId, id]
    );
    if (result.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(result.rows[0]);
  } catch (err) {
    logger.error({ err }, "PATCH /bible/study-notes/admin/:id/status failed");
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Admin: delete a study note
router.delete("/bible/study-notes/admin/:id", async (req: Request, res: Response) => {
  const userId = await requireAdminRole(req, res);
  if (!userId) return;

  try {
    await pool.query("DELETE FROM bible_study_notes WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /bible/study-notes/admin/:id failed");
    res.status(500).json({ error: "Failed to delete study note" });
  }
});

// Admin: bulk-status update for all overviews in a book (P2-9)
router.patch("/bible/chapter-overviews/admin/book-status", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const { bookId, status } = req.body as { bookId?: string; status?: string };
  const VALID = ['Draft', 'In Review', 'Published', 'Archived'];
  if (!bookId || !VALID.includes(status ?? '')) {
    res.status(400).json({ error: "bookId and valid status required" }); return;
  }
  try {
    const r = await pool.query(
      `UPDATE bible_chapter_overviews
       SET status=$1, updated_by=$2, updated_at=now()
       WHERE book_id=$3 AND status IN ('Draft','In Review') RETURNING id`,
      [status, userId, bookId.toLowerCase()]
    );
    res.json({ ok: true, updated: r.rowCount });
  } catch (err) {
    logger.error({ err }, "PATCH /bible/chapter-overviews/admin/book-status failed");
    res.status(500).json({ error: "Bulk overview status update failed" });
  }
});

// Admin: bulk-status update for multiple study notes
router.patch("/bible/study-notes/admin/bulk/status", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const { ids, status } = req.body as { ids?: string[]; status?: string };
  const VALID = ['Draft', 'In Review', 'Published', 'Archived'];
  if (!Array.isArray(ids) || ids.length === 0 || !VALID.includes(status ?? '')) {
    res.status(400).json({ error: "ids (array) and valid status required" }); return;
  }
  try {
    await pool.query(
      `UPDATE bible_study_notes SET status=$1, updated_by=$2, updated_at=now() WHERE id=ANY($3::uuid[])`,
      [status, userId, ids]
    );
    res.json({ ok: true, updated: ids.length });
  } catch (err) {
    logger.error({ err }, "PATCH /bible/study-notes/admin/bulk/status failed");
    res.status(500).json({ error: "Bulk status update failed" });
  }
});

// ─── Book Introductions ────────────────────────────────────────────────────────
//
// GET  /api/bible/book-intro?bookId=   → member: Published intro
// GET  /api/bible/book-intro/admin     → admin: list all (filtered by bookId)
// POST /api/bible/book-intro/admin     → admin: create
// PUT  /api/bible/book-intro/admin/:id → admin: update
// PATCH /api/bible/book-intro/admin/:id/status → admin: status change
// DELETE /api/bible/book-intro/admin/:id

router.get("/bible/book-intro", async (req: Request, res: Response) => {
  const bookId = String(req.query.bookId ?? "").trim().toLowerCase();
  if (!bookId) { res.status(400).json({ error: "bookId required" }); return; }
  try {
    const r = await pool.query(
      `SELECT * FROM bible_book_introductions WHERE book_id=$1 AND status='Published' LIMIT 1`,
      [bookId]
    );
    res.json(r.rows[0] ?? null);
  } catch (err) {
    logger.error({ err }, "GET /bible/book-intro failed");
    res.json(null);
  }
});

router.get("/bible/book-intro/admin", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  try {
    const bookId = String(req.query.bookId ?? "").trim().toLowerCase();
    const params: string[] = [];
    let q = "SELECT * FROM bible_book_introductions";
    if (bookId) { params.push(bookId); q += ` WHERE book_id=$1`; }
    q += " ORDER BY book_name";
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) {
    logger.error({ err }, "GET /bible/book-intro/admin failed");
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/bible/book-intro/admin", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const { book_id, book_name, testament, genre, author_attribution, date_range,
          original_audience, historical_setting, purpose, major_themes, key_people,
          key_places, outline, key_passages, points_to_jesus, interpretation_notes, status } = req.body;
  if (!book_id) { res.status(400).json({ error: "book_id required" }); return; }
  try {
    const r = await pool.query(
      `INSERT INTO bible_book_introductions
         (book_id, book_name, testament, genre, author_attribution, date_range,
          original_audience, historical_setting, purpose, major_themes, key_people,
          key_places, outline, key_passages, points_to_jesus, interpretation_notes,
          status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$18)
       ON CONFLICT (book_id) DO UPDATE SET
         book_name=$2, testament=$3, genre=$4, author_attribution=$5, date_range=$6,
         original_audience=$7, historical_setting=$8, purpose=$9, major_themes=$10,
         key_people=$11, key_places=$12, outline=$13, key_passages=$14,
         points_to_jesus=$15, interpretation_notes=$16, status=$17,
         updated_by=$18, updated_at=now()
       RETURNING *`,
      [
        book_id.toLowerCase(), book_name ?? '', testament ?? '', genre ?? '',
        author_attribution ?? '', date_range ?? '', original_audience ?? '',
        historical_setting ?? '', purpose ?? '',
        JSON.stringify(major_themes ?? []), JSON.stringify(key_people ?? []),
        JSON.stringify(key_places ?? []), JSON.stringify(outline ?? []),
        JSON.stringify(key_passages ?? []),
        points_to_jesus ?? '', interpretation_notes ?? '',
        status ?? 'Draft', userId,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    logger.error({ err }, "POST /bible/book-intro/admin failed");
    res.status(500).json({ error: "Failed to save book introduction" });
  }
});

router.put("/bible/book-intro/admin/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const { id } = req.params;
  const { book_id, book_name, testament, genre, author_attribution, date_range,
          original_audience, historical_setting, purpose, major_themes, key_people,
          key_places, outline, key_passages, points_to_jesus, interpretation_notes, status } = req.body;
  try {
    const r = await pool.query(
      `UPDATE bible_book_introductions SET
         book_id=$1, book_name=$2, testament=$3, genre=$4, author_attribution=$5,
         date_range=$6, original_audience=$7, historical_setting=$8, purpose=$9,
         major_themes=$10, key_people=$11, key_places=$12, outline=$13,
         key_passages=$14, points_to_jesus=$15, interpretation_notes=$16,
         status=$17, updated_by=$18, updated_at=now()
       WHERE id=$19 RETURNING *`,
      [
        book_id?.toLowerCase() ?? '', book_name ?? '', testament ?? '', genre ?? '',
        author_attribution ?? '', date_range ?? '', original_audience ?? '',
        historical_setting ?? '', purpose ?? '',
        JSON.stringify(major_themes ?? []), JSON.stringify(key_people ?? []),
        JSON.stringify(key_places ?? []), JSON.stringify(outline ?? []),
        JSON.stringify(key_passages ?? []),
        points_to_jesus ?? '', interpretation_notes ?? '',
        status ?? 'Draft', userId, id,
      ]
    );
    if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(r.rows[0]);
  } catch (err) {
    logger.error({ err }, "PUT /bible/book-intro/admin/:id failed");
    res.status(500).json({ error: "Failed to update book introduction" });
  }
});

router.patch("/bible/book-intro/admin/:id/status", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const { status } = req.body;
  const VALID = ['Draft', 'In Review', 'Published', 'Archived'];
  if (!VALID.includes(status)) { res.status(400).json({ error: `status must be one of ${VALID.join(', ')}` }); return; }
  try {
    const r = await pool.query(
      `UPDATE bible_book_introductions SET status=$1, updated_by=$2, updated_at=now() WHERE id=$3 RETURNING *`,
      [status, userId, req.params.id]
    );
    if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(r.rows[0]);
  } catch (err) {
    logger.error({ err }, "PATCH /bible/book-intro/admin/:id/status failed");
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.delete("/bible/book-intro/admin/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  try {
    await pool.query("DELETE FROM bible_book_introductions WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /bible/book-intro/admin/:id failed");
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ─── Chapter Overviews ────────────────────────────────────────────────────────
//
// GET  /api/bible/chapter-overview?bookId=&chapter=   → member
// GET  /api/bible/chapter-overview/admin?bookId=&chapter= → admin list
// POST /api/bible/chapter-overview/admin              → create/upsert
// PUT  /api/bible/chapter-overview/admin/:id          → update
// PATCH /api/bible/chapter-overview/admin/:id/status  → status
// DELETE /api/bible/chapter-overview/admin/:id

router.get("/bible/chapter-overview", async (req: Request, res: Response) => {
  const bookId  = String(req.query.bookId ?? "").trim().toLowerCase();
  const chapter = parseInt(String(req.query.chapter ?? ""), 10);
  if (!bookId || isNaN(chapter)) { res.status(400).json({ error: "bookId and chapter required" }); return; }
  try {
    const r = await pool.query(
      `SELECT * FROM bible_chapter_overviews WHERE book_id=$1 AND chapter=$2 AND status='Published' LIMIT 1`,
      [bookId, chapter]
    );
    res.json(r.rows[0] ?? null);
  } catch (err) {
    logger.error({ err }, "GET /bible/chapter-overview failed");
    res.json(null);
  }
});

router.get("/bible/chapter-overview/admin", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  try {
    const bookId  = String(req.query.bookId ?? "").trim().toLowerCase();
    const chapter = parseInt(String(req.query.chapter ?? ""), 10);
    let q = "SELECT * FROM bible_chapter_overviews";
    const params: (string | number)[] = [];
    if (bookId) {
      params.push(bookId); q += ` WHERE book_id=$${params.length}`;
      if (!isNaN(chapter)) { params.push(chapter); q += ` AND chapter=$${params.length}`; }
    }
    q += " ORDER BY book_id, chapter";
    const r = await pool.query(q, params);
    res.json(r.rows);
  } catch (err) {
    logger.error({ err }, "GET /bible/chapter-overview/admin failed");
    res.status(500).json({ error: "Failed" });
  }
});

router.post("/bible/chapter-overview/admin", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const { book_id, chapter, summary, main_themes, important_people, important_locations,
          passage_divisions, key_verse, key_verse_start, key_verse_end,
          book_connection, jesus_connection, status } = req.body;
  if (!book_id || !chapter) { res.status(400).json({ error: "book_id and chapter required" }); return; }
  try {
    const r = await pool.query(
      `INSERT INTO bible_chapter_overviews
         (book_id, chapter, summary, main_themes, important_people, important_locations,
          passage_divisions, key_verse, key_verse_start, key_verse_end,
          book_connection, jesus_connection, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
       ON CONFLICT (book_id, chapter) DO UPDATE SET
         summary=$3, main_themes=$4, important_people=$5, important_locations=$6,
         passage_divisions=$7, key_verse=$8, key_verse_start=$9, key_verse_end=$10,
         book_connection=$11, jesus_connection=$12, status=$13, updated_by=$14, updated_at=now()
       RETURNING *`,
      [
        book_id.toLowerCase(), Number(chapter),
        summary ?? '', JSON.stringify(main_themes ?? []),
        JSON.stringify(important_people ?? []), JSON.stringify(important_locations ?? []),
        JSON.stringify(passage_divisions ?? []), key_verse ?? '',
        key_verse_start ? Number(key_verse_start) : null,
        key_verse_end ? Number(key_verse_end) : null,
        book_connection ?? '', jesus_connection ?? '',
        status ?? 'Draft', userId,
      ]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    logger.error({ err }, "POST /bible/chapter-overview/admin failed");
    res.status(500).json({ error: "Failed to save chapter overview" });
  }
});

router.put("/bible/chapter-overview/admin/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const { book_id, chapter, summary, main_themes, important_people, important_locations,
          passage_divisions, key_verse, key_verse_start, key_verse_end,
          book_connection, jesus_connection, status } = req.body;
  try {
    const r = await pool.query(
      `UPDATE bible_chapter_overviews SET
         book_id=$1, chapter=$2, summary=$3, main_themes=$4, important_people=$5,
         important_locations=$6, passage_divisions=$7, key_verse=$8,
         key_verse_start=$9, key_verse_end=$10, book_connection=$11,
         jesus_connection=$12, status=$13, updated_by=$14, updated_at=now()
       WHERE id=$15 RETURNING *`,
      [
        book_id?.toLowerCase() ?? '', Number(chapter),
        summary ?? '', JSON.stringify(main_themes ?? []),
        JSON.stringify(important_people ?? []), JSON.stringify(important_locations ?? []),
        JSON.stringify(passage_divisions ?? []), key_verse ?? '',
        key_verse_start ? Number(key_verse_start) : null,
        key_verse_end ? Number(key_verse_end) : null,
        book_connection ?? '', jesus_connection ?? '',
        status ?? 'Draft', userId, req.params.id,
      ]
    );
    if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(r.rows[0]);
  } catch (err) {
    logger.error({ err }, "PUT /bible/chapter-overview/admin/:id failed");
    res.status(500).json({ error: "Failed to update chapter overview" });
  }
});

router.patch("/bible/chapter-overview/admin/:id/status", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const { status } = req.body;
  const VALID = ['Draft', 'In Review', 'Published', 'Archived'];
  if (!VALID.includes(status)) { res.status(400).json({ error: `status must be one of ${VALID.join(', ')}` }); return; }
  try {
    const r = await pool.query(
      `UPDATE bible_chapter_overviews SET status=$1, updated_by=$2, updated_at=now() WHERE id=$3 RETURNING *`,
      [status, userId, req.params.id]
    );
    if (r.rows.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(r.rows[0]);
  } catch (err) {
    logger.error({ err }, "PATCH /bible/chapter-overview/admin/:id/status failed");
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.delete("/bible/chapter-overview/admin/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  try {
    await pool.query("DELETE FROM bible_chapter_overviews WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /bible/chapter-overview/admin/:id failed");
    res.status(500).json({ error: "Failed to delete" });
  }
});

// ─── Bulk chapter-level operations ───────────────────────────────────────────

// Publish all Draft/In Review records for a chapter (overview + passages)
router.post("/bible/chapter-overview/admin/bulk-publish", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }
  const { bookId, chapter } = req.body as { bookId?: string; chapter?: number };
  if (!bookId || !chapter) { res.status(400).json({ error: "bookId and chapter required" }); return; }
  try {
    const bId = bookId.toLowerCase();
    const ch = Number(chapter);
    const [ov, sn] = await Promise.all([
      pool.query(
        `UPDATE bible_chapter_overviews SET status='Published', updated_by=$1, updated_at=now()
         WHERE book_id=$2 AND chapter=$3 AND status IN ('Draft','In Review') RETURNING id`,
        [userId, bId, ch]
      ),
      pool.query(
        `UPDATE bible_study_notes SET status='Published', updated_by=$1, updated_at=now()
         WHERE book_id=$2 AND chapter=$3 AND status IN ('Draft','In Review') RETURNING id`,
        [userId, bId, ch]
      ),
    ]);
    res.json({ ok: true, overviewsPublished: ov.rowCount, passagesPublished: sn.rowCount });
  } catch (err) {
    logger.error({ err }, "bulk-publish failed");
    res.status(500).json({ error: "Bulk publish failed" });
  }
});

// ─── Study Statistics ──────────────────────────────────────────────────────────
//
// GET /api/bible/study-stats?bookId=   → admin: coverage stats per book (or single book)

const BOOK_CHAPTER_COUNTS: Record<string, number> = {
  genesis:50, exodus:40, leviticus:27, numbers:36, deuteronomy:34,
  joshua:24, judges:21, ruth:4, "1samuel":31, "2samuel":24,
  "1kings":22, "2kings":25, "1chronicles":29, "2chronicles":36,
  ezra:10, nehemiah:13, esther:10, job:42, psalms:150, proverbs:31,
  ecclesiastes:12, songofsolomon:8, isaiah:66, jeremiah:52,
  lamentations:5, ezekiel:48, daniel:12, hosea:14, joel:3, amos:9,
  obadiah:1, jonah:4, micah:7, nahum:3, habakkuk:3, zephaniah:3,
  haggai:2, zechariah:14, malachi:4,
  matthew:28, mark:16, luke:24, john:21, acts:28, romans:16,
  "1corinthians":16, "2corinthians":13, galatians:6, ephesians:6,
  philippians:4, colossians:4, "1thessalonians":5, "2thessalonians":3,
  "1timothy":6, "2timothy":4, titus:3, philemon:1, hebrews:13,
  james:5, "1peter":5, "2peter":3, "1john":5, "2john":1, "3john":1,
  jude:1, revelation:22,
};

router.get("/bible/study-stats", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }

  const filterBook = String(req.query.bookId ?? "").trim().toLowerCase() || null;
  const targetBooks = filterBook
    ? [filterBook]
    : Object.keys(BOOK_CHAPTER_COUNTS); // report coverage for all 66 Bible books

  try {
    const [introRes, overviewRes, noteRes] = await Promise.all([
      pool.query(
        `SELECT book_id, status FROM bible_book_introductions
         WHERE book_id = ANY($1::text[])`,
        [targetBooks]
      ),
      pool.query(
        `SELECT book_id, chapter, status FROM bible_chapter_overviews
         WHERE book_id = ANY($1::text[])`,
        [targetBooks]
      ),
      pool.query(
        `SELECT book_id, chapter, verse_start, verse_end, status
         FROM bible_study_notes
         WHERE book_id = ANY($1::text[])`,
        [targetBooks]
      ),
    ]);

    const stats = targetBooks.map(bookId => {
      const totalChapters = BOOK_CHAPTER_COUNTS[bookId] ?? 0;
      const intro = introRes.rows.find(r => r.book_id === bookId);
      const overviews = overviewRes.rows.filter(r => r.book_id === bookId);
      const notes = noteRes.rows.filter(r => r.book_id === bookId);

      const statusCount = (arr: { status: string }[], status: string) =>
        arr.filter(r => r.status === status).length;

      return {
        bookId,
        totalChapters,
        bookIntroStatus: intro?.status ?? null,
        overviewsTotal: overviews.length,
        overviewsDraft: statusCount(overviews, 'Draft'),
        overviewsInReview: statusCount(overviews, 'In Review'),
        overviewsPublished: statusCount(overviews, 'Published'),
        passagesTotal: notes.length,
        passagesDraft: statusCount(notes, 'Draft'),
        passagesInReview: statusCount(notes, 'In Review'),
        passagesPublished: statusCount(notes, 'Published'),
        chaptersWithOverview: new Set(overviews.map(r => r.chapter)).size,
        chaptersWithPassages: new Set(notes.map(r => r.chapter)).size,
      };
    });

    res.json(stats);
  } catch (err) {
    logger.error({ err }, "GET /bible/study-stats failed");
    res.status(500).json({ error: "Failed to load stats" });
  }
});

// ─── AI Content Generator ──────────────────────────────────────────────────────
//
// POST /api/bible/generate
// Generates study content for a book-intro, chapter-overview, or full-chapter
// (overview + passage notes) using OpenAI.  Content is saved as 'Draft'.
//
// Body: {
//   type: 'book-intro' | 'chapter-overview' | 'chapter-batch'
//   bookId: string
//   chapter?: number  (required for chapter-* types)
//   force?: boolean   (overwrite existing Draft records; skip if Published)
// }

import OpenAI from "openai";

const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const BOOK_DISPLAY_NAMES: Record<string, string> = {
  luke: "Luke", acts: "Acts", romans: "Romans",
  "1corinthians": "1 Corinthians", "2corinthians": "2 Corinthians", psalms: "Psalms",
  genesis: "Genesis", exodus: "Exodus", matthew: "Matthew", mark: "Mark",
  john: "John", revelation: "Revelation",
};

function readChapterVerses(bookId: string, chapter: number): Array<{ verse: number; text: string }> | null {
  try {
    const filePath = join(DATA_DIR, "bsb", `${bookId}.json`);
    if (!existsSync(filePath)) return null;
    const data = JSON.parse(readFileSync(filePath, "utf8")) as {
      chapters: Record<string, Array<{ verse: number; text: string }>>;
    };
    return data.chapters[String(chapter)] ?? null;
  } catch {
    return null;
  }
}

router.post("/bible/generate", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) { res.status(403).json({ error: "Admin access required" }); return; }

  if (!openaiClient) {
    res.status(503).json({ error: "OpenAI is not configured. Set OPENAI_API_KEY to enable generation." });
    return;
  }

  const { type, bookId: rawBookId, chapter: rawChapter, force = false } = req.body as {
    type?: string;
    bookId?: string;
    chapter?: number;
    force?: boolean;
  };

  const bookId = String(rawBookId ?? "").trim().toLowerCase();
  const chapter = rawChapter ? Number(rawChapter) : null;

  if (!bookId || !VALID_BOOK_IDS.has(bookId)) {
    res.status(400).json({ error: "Valid bookId required" });
    return;
  }

  const bookName = BOOK_DISPLAY_NAMES[bookId] ?? bookId;
  const model = process.env.OPENAI_MODEL || "gpt-4o-mini";
  // Reasoning models (o-series, gpt-5) reject temperature and burn completion tokens
  // on chain-of-thought before generating output — they need much larger token budgets.
  // gpt-5 behaves like a heavy reasoning model: it needs ~25k+ tokens to avoid producing
  // 0-char responses (all tokens consumed by internal reasoning before any output).
  const isReasoningModel = /^o\d/i.test(model) || /^gpt-5/i.test(model);
  function buildCreateParams(outputTokens: number, extraMessages?: OpenAI.ChatCompletionMessageParam[]) {
    // Reasoning models need a large total budget; standard models can stay lean.
    const maxTokens = isReasoningModel ? Math.max(outputTokens * 6, 25000) : outputTokens;
    const params: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: extraMessages ?? [],
      max_completion_tokens: maxTokens,
      response_format: { type: "json_object" } as OpenAI.ResponseFormatJSONObject,
    };
    if (isReasoningModel) {
      // reasoning_effort: "low" caps chain-of-thought to avoid excessive latency
      (params as unknown as Record<string, unknown>).reasoning_effort = "low";
    }
    return params;
  }

  try {
    // ── book-intro ────────────────────────────────────────────────────────────
    if (type === "book-intro") {
      // Skip if already Published (unless force)
      const existing = await pool.query(
        `SELECT id, status FROM bible_book_introductions WHERE book_id=$1 LIMIT 1`,
        [bookId]
      );
      if (existing.rows[0]?.status === "Published" && !force) {
        res.status(409).json({ error: "A Published intro already exists. Use force=true to regenerate." });
        return;
      }

      const prompt = `You are a biblical scholar writing accessible study content for a Christian discipleship app called Emmaus.
Write a complete book introduction for the book of ${bookName}.
Return ONLY a valid JSON object with exactly these fields (no markdown, no explanation outside JSON):
{
  "book_name": "${bookName}",
  "testament": "New Testament" or "Old Testament",
  "genre": "e.g. Gospel, History, Epistle, Poetry, Prophecy",
  "author_attribution": "traditional or debated attribution, explained honestly",
  "date_range": "approximate date or date range",
  "original_audience": "who the book was written for",
  "historical_setting": "2–3 sentences on historical context",
  "purpose": "2–3 sentences on why the book was written",
  "major_themes": ["theme1", "theme2", "theme3"],
  "key_people": ["person1", "person2"],
  "key_places": ["place1", "place2"],
  "outline": [{"section": "Part title", "chapters": "1–4", "description": "brief desc"}],
  "key_passages": ["${bookName} 1:1", "${bookName} 3:16"],
  "points_to_jesus": "2–3 sentences on how this book points to Jesus",
  "interpretation_notes": "any important notes on interpretation (leave empty string if none)"
}
Guidelines: accessible language, not academic, honest about debates, concise.`;

      const completion = await openaiClient.chat.completions.create(
        buildCreateParams(5000, [{ role: "user", content: prompt }])
      );

      const bookIntroContent = completion.choices[0].message.content ?? "{}";
      if (!bookIntroContent.trim().endsWith("}")) {
        throw new Error(`Book-intro response truncated (${bookIntroContent.length} chars). Increase max_completion_tokens.`);
      }
      const raw = JSON.parse(bookIntroContent);
      const r = await pool.query(
        `INSERT INTO bible_book_introductions
           (book_id, book_name, testament, genre, author_attribution, date_range,
            original_audience, historical_setting, purpose, major_themes, key_people,
            key_places, outline, key_passages, points_to_jesus, interpretation_notes,
            status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'Draft',$17,$17)
         ON CONFLICT (book_id) DO UPDATE SET
           book_name=$2, testament=$3, genre=$4, author_attribution=$5, date_range=$6,
           original_audience=$7, historical_setting=$8, purpose=$9, major_themes=$10,
           key_people=$11, key_places=$12, outline=$13, key_passages=$14,
           points_to_jesus=$15, interpretation_notes=$16,
           status=CASE WHEN bible_book_introductions.status='Published' AND $18=false THEN 'Published' ELSE 'Draft' END,
           updated_by=$17, updated_at=now()
         RETURNING *`,
        [
          bookId, raw.book_name ?? bookName, raw.testament ?? '', raw.genre ?? '',
          raw.author_attribution ?? '', raw.date_range ?? '', raw.original_audience ?? '',
          raw.historical_setting ?? '', raw.purpose ?? '',
          JSON.stringify(raw.major_themes ?? []), JSON.stringify(raw.key_people ?? []),
          JSON.stringify(raw.key_places ?? []), JSON.stringify(raw.outline ?? []),
          JSON.stringify(raw.key_passages ?? []),
          raw.points_to_jesus ?? '', raw.interpretation_notes ?? '',
          userId, force,
        ]
      );
      res.json({ type: "book-intro", record: r.rows[0] });
      return;
    }

    // ── chapter-overview or chapter-batch ─────────────────────────────────────
    if (type === "chapter-overview" || type === "chapter-batch") {
      if (!chapter || chapter < 1) {
        res.status(400).json({ error: "chapter number required for chapter-* types" });
        return;
      }

      const verses = readChapterVerses(bookId, chapter);
      if (!verses || verses.length === 0) {
        res.status(404).json({ error: `Chapter ${chapter} not found for ${bookName} (BSB required)` });
        return;
      }

      const verseText = verses.map(v => `${v.verse} ${v.text}`).join("\n");
      const includePasages = type === "chapter-batch";

      const prompt = `You are a biblical scholar creating study content for the Emmaus Christian app.
Generate study content for ${bookName} chapter ${chapter}.

FULL CHAPTER TEXT:
${verseText}

Return ONLY a valid JSON object (no markdown):
{
  "overview": {
    "summary": "2–4 sentences summarising what happens in this chapter",
    "main_themes": ["theme1", "theme2"],
    "important_people": ["person1"],
    "important_locations": ["place1"],
    "passage_divisions": [
      {"title": "Passage Title", "verse_start": 1, "verse_end": 5},
      {"title": "Another Passage", "verse_start": 6, "verse_end": 13}
    ],
    "key_verse": "verse reference e.g. ${bookName} ${chapter}:3",
    "book_connection": "1–2 sentences on how this chapter fits the wider book",
    "jesus_connection": "1–2 sentences on how this chapter relates to Jesus or the gospel (be honest — not every OT chapter has a direct connection; note typological/thematic if so)"
  }${includePasages ? `,
  "passages": [
    {
      "title": "Passage Title",
      "verse_start": 1,
      "verse_end": 5,
      "content": "2–4 paragraphs explaining what is happening and its meaning. Clear, faithful, accessible to a new Christian.",
      "context_note": "What comes before and after; how it fits the chapter and book",
      "historical_note": "Relevant historical or cultural background (only if genuinely helpful — leave empty string if not needed)",
      "original_language_note": "Key Greek or Hebrew word if genuinely significant (leave empty string if not needed)",
      "jesus_connection": "How this passage connects to Jesus — direct, typological, or thematic. Be honest about the strength of the connection.",
      "apply_it": "2–3 questions or invitations for reflection. Invitational, not prescriptive. No checklists or guilt.",
      "key_truth": "One concise sentence stating the central truth of this passage",
      "reflection_question": "One thoughtful, open-ended question for personal reflection",
      "related_scriptures": "2–4 related Scripture references with a short reason for each",
      "cross_references": [
        {"reference": "Book Chapter:Verse", "explanation": "why this is connected", "type": "Shared Theme"}
      ]
    }
  ]` : ""}
}
Cross-reference types: Quotation, Fulfilment, Parallel Event, Shared Theme, Explanation, Contrast, Promise, Old Testament Background, Gospel Connection.
Keep content concise and mobile-friendly. Do not use academic jargon.`;

      const completion = await openaiClient.chat.completions.create(
        buildCreateParams(includePasages ? 6000 : 3000, [{ role: "user", content: prompt }])
      );

      const chapterContent = completion.choices[0].message.content ?? "{}";
      if (!chapterContent.trim().endsWith("}")) {
        throw new Error(`Chapter response truncated (${chapterContent.length} chars). Increase max_completion_tokens.`);
      }
      const raw = JSON.parse(chapterContent);
      const ov = raw.overview ?? {};

      // Upsert chapter overview
      const ovResult = await pool.query(
        `INSERT INTO bible_chapter_overviews
           (book_id, chapter, summary, main_themes, important_people, important_locations,
            passage_divisions, key_verse, book_connection, jesus_connection, status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Draft',$11,$11)
         ON CONFLICT (book_id, chapter) DO UPDATE SET
           summary=$3, main_themes=$4, important_people=$5, important_locations=$6,
           passage_divisions=$7, key_verse=$8, book_connection=$9, jesus_connection=$10,
           status=CASE WHEN bible_chapter_overviews.status='Published' AND NOT $12 THEN 'Published' ELSE 'Draft' END,
           updated_by=$11, updated_at=now()
         RETURNING *`,
        [
          bookId, chapter,
          ov.summary ?? '', JSON.stringify(ov.main_themes ?? []),
          JSON.stringify(ov.important_people ?? []), JSON.stringify(ov.important_locations ?? []),
          JSON.stringify(ov.passage_divisions ?? []), ov.key_verse ?? '',
          ov.book_connection ?? '', ov.jesus_connection ?? '',
          userId, force,
        ]
      );

      const result: { overview: unknown; passages: unknown[] } = { overview: ovResult.rows[0], passages: [] };

      if (includePasages && Array.isArray(raw.passages)) {
        const passageRecords: unknown[] = [];
        for (const p of raw.passages) {
          const existingNote = await pool.query(
            `SELECT id, status FROM bible_study_notes
             WHERE book_id=$1 AND chapter=$2 AND verse_start=$3 LIMIT 1`,
            [bookId, chapter, p.verse_start]
          );
          const skip = existingNote.rows[0]?.status === "Published" && !force;
          if (skip) { passageRecords.push(existingNote.rows[0]); continue; }

          const pr = await pool.query(
            `INSERT INTO bible_study_notes
               (book_id, chapter, verse_start, verse_end, title, content,
                context_note, historical_note, original_language_note,
                jesus_connection, apply_it, key_truth, reflection_question,
                related_scriptures, cross_references, status, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'Draft',$16,$16)
             ON CONFLICT DO NOTHING
             RETURNING *`,
            [
              bookId, chapter, p.verse_start,
              p.verse_end ?? null,
              p.title ?? '', p.content ?? '',
              p.context_note ?? '', p.historical_note ?? '',
              p.original_language_note ?? '', p.jesus_connection ?? '',
              p.apply_it ?? '', p.key_truth ?? '', p.reflection_question ?? '',
              p.related_scriptures ?? '', JSON.stringify(p.cross_references ?? []),
              userId,
            ]
          );
          passageRecords.push(pr.rows[0] ?? existingNote.rows[0]);
        }
        result.passages = passageRecords;
      }

      res.json(result);
      return;
    }

    res.status(400).json({ error: "type must be 'book-intro', 'chapter-overview', or 'chapter-batch'" });
  } catch (err) {
    logger.error({ err }, "POST /bible/generate failed");
    res.status(500).json({ error: "Content generation failed" });
  }
});

export default router;
