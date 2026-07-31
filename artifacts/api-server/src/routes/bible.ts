import { Router } from "express";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../lib/logger";
import { apiBibleProvider } from "../lib/api-bible-provider";
import { type Request, type Response } from "express";
import { requireAuth } from "../emmaus/auth.js";
import { getBibleData, patchBibleData, type UserBibleData } from "../bible/store.js";

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
router.get("/bible/data", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const data = await getBibleData(userId);
    res.json(data);
  } catch (err) {
    logger.error({ err }, "GET /bible/data failed");
    res.status(500).json({ error: "Failed to load Bible data" });
  }
});

// PATCH /api/bible/data — merges provided fields into the caller's stored data
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

// ─── Study Notes ───────────────────────────────────────────────────────────────
//
// GET  /api/bible/study-notes?bookId=john&chapter=1&verse=1
//   → Returns the first Published study note that covers the requested verse.
//
// Admin CRUD (requires x-user-role: admin|superAdmin):
//   GET    /api/bible/study-notes/admin
//   POST   /api/bible/study-notes/admin
//   PUT    /api/bible/study-notes/admin/:id
//   PATCH  /api/bible/study-notes/admin/:id/status
//   DELETE /api/bible/study-notes/admin/:id

import { pool } from "@workspace/db";

function requireAdminRole(req: Request, res: Response): boolean {
  const role = String(req.headers["x-user-role"] ?? "");
  if (role !== "admin" && role !== "superAdmin") {
    res.status(403).json({ error: "Admin access required" });
    return false;
  }
  return true;
}

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
    const result = await pool.query(
      `SELECT * FROM bible_study_notes
       WHERE book_id = $1
         AND chapter = $2
         AND verse_start <= $3
         AND (verse_end IS NULL OR verse_end >= $3)
         AND status = 'Published'
       ORDER BY verse_start ASC
       LIMIT 1`,
      [bookId, chapter, verse]
    );
    res.json(result.rows[0] ?? null);
  } catch (err) {
    logger.error({ err }, "GET /bible/study-notes failed");
    res.json(null); // non-critical — reader still works without study notes
  }
});

// Admin: list all study notes (all statuses)
router.get("/bible/study-notes/admin", async (req: Request, res: Response) => {
  if (!requireAdminRole(req, res)) return;
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
  if (!requireAdminRole(req, res)) return;
  const userId = requireAuth(req, res);
  if (!userId) return;

  const {
    book_id, chapter, verse_start, verse_end, title, content,
    context_note, historical_note, original_language_note,
    jesus_connection, apply_it, status,
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
          jesus_connection, apply_it, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
       RETURNING *`,
      [
        book_id, Number(chapter), Number(verse_start),
        verse_end ? Number(verse_end) : null,
        title ?? '', content ?? '', context_note ?? '',
        historical_note ?? '', original_language_note ?? '',
        jesus_connection ?? '', apply_it ?? '',
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
  if (!requireAdminRole(req, res)) return;
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { id } = req.params;
  const {
    book_id, chapter, verse_start, verse_end, title, content,
    context_note, historical_note, original_language_note,
    jesus_connection, apply_it, status,
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE bible_study_notes SET
         book_id = $1, chapter = $2, verse_start = $3, verse_end = $4,
         title = $5, content = $6, context_note = $7, historical_note = $8,
         original_language_note = $9, jesus_connection = $10, apply_it = $11,
         status = $12, updated_by = $13, updated_at = now()
       WHERE id = $14 RETURNING *`,
      [
        book_id, Number(chapter), Number(verse_start),
        verse_end ? Number(verse_end) : null,
        title ?? '', content ?? '', context_note ?? '',
        historical_note ?? '', original_language_note ?? '',
        jesus_connection ?? '', apply_it ?? '',
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
  if (!requireAdminRole(req, res)) return;
  const userId = requireAuth(req, res);
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
  if (!requireAdminRole(req, res)) return;
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    await pool.query("DELETE FROM bible_study_notes WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /bible/study-notes/admin/:id failed");
    res.status(500).json({ error: "Failed to delete study note" });
  }
});

export default router;
