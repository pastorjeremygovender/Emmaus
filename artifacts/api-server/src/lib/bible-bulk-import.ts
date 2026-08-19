/**
 * bible-bulk-import.ts
 *
 * Pure parser and validator for the Bulk Bible Study Importer.
 * No filesystem access — verse-count validation uses an injected resolver.
 *
 * Supported markers (case-insensitive):
 *   BOOK, CHAPTER, TITLE, CHAPTER_OVERVIEW, PASSAGE
 *
 * Supported study-field labels (aliases supported):
 *   EXPLANATION
 *   PASSAGE_CONTEXT  | CONTEXT
 *   HISTORICAL_BACKGROUND | HISTORICAL_NOTE
 *   ORIGINAL_LANGUAGE_NOTE | ORIGINAL_LANGUAGE
 *   HOW_THIS_POINTS_TO_JESUS | JESUS_CONNECTION
 *   PRACTICAL_APPLICATION | APPLY_IT
 *   KEY_TRUTH
 *   REFLECTION | REFLECTION_QUESTION
 *   RELATED_SCRIPTURES
 */

// ─── Canonical chapter counts ─────────────────────────────────────────────────

export const CANONICAL_CHAPTER_COUNTS: Record<string, number> = {
  genesis: 50, exodus: 40, leviticus: 27, numbers: 36, deuteronomy: 34,
  joshua: 24, judges: 21, ruth: 4, "1samuel": 31, "2samuel": 24,
  "1kings": 22, "2kings": 25, "1chronicles": 29, "2chronicles": 36,
  ezra: 10, nehemiah: 13, esther: 10, job: 42, psalms: 150, proverbs: 31,
  ecclesiastes: 12, songofsolomon: 8, isaiah: 66, jeremiah: 52,
  lamentations: 5, ezekiel: 48, daniel: 12, hosea: 14, joel: 3, amos: 9,
  obadiah: 1, jonah: 4, micah: 7, nahum: 3, habakkuk: 3, zephaniah: 3,
  haggai: 2, zechariah: 14, malachi: 4,
  matthew: 28, mark: 16, luke: 24, john: 21, acts: 28, romans: 16,
  "1corinthians": 16, "2corinthians": 13, galatians: 6, ephesians: 6,
  philippians: 4, colossians: 4, "1thessalonians": 5, "2thessalonians": 3,
  "1timothy": 6, "2timothy": 4, titus: 3, philemon: 1, hebrews: 13,
  james: 5, "1peter": 5, "2peter": 3, "1john": 5, "2john": 1, "3john": 1,
  jude: 1, revelation: 22,
};

// ─── Book name → canonical ID map ────────────────────────────────────────────

const BOOK_NAME_TO_ID: Record<string, string> = {
  genesis: "genesis", exodus: "exodus", leviticus: "leviticus",
  numbers: "numbers", deuteronomy: "deuteronomy", joshua: "joshua",
  judges: "judges", ruth: "ruth",
  "1samuel": "1samuel", "1 samuel": "1samuel",
  "2samuel": "2samuel", "2 samuel": "2samuel",
  "1kings": "1kings", "1 kings": "1kings",
  "2kings": "2kings", "2 kings": "2kings",
  "1chronicles": "1chronicles", "1 chronicles": "1chronicles",
  "2chronicles": "2chronicles", "2 chronicles": "2chronicles",
  ezra: "ezra", nehemiah: "nehemiah", esther: "esther", job: "job",
  psalms: "psalms", psalm: "psalms", proverbs: "proverbs",
  ecclesiastes: "ecclesiastes",
  "songofsolomon": "songofsolomon", "song of solomon": "songofsolomon",
  "song of songs": "songofsolomon", "songs": "songofsolomon",
  isaiah: "isaiah", jeremiah: "jeremiah", lamentations: "lamentations",
  ezekiel: "ezekiel", daniel: "daniel", hosea: "hosea", joel: "joel",
  amos: "amos", obadiah: "obadiah", jonah: "jonah", micah: "micah",
  nahum: "nahum", habakkuk: "habakkuk", zephaniah: "zephaniah",
  haggai: "haggai", zechariah: "zechariah", malachi: "malachi",
  matthew: "matthew", mark: "mark", luke: "luke", john: "john",
  acts: "acts", romans: "romans",
  "1corinthians": "1corinthians", "1 corinthians": "1corinthians",
  "2corinthians": "2corinthians", "2 corinthians": "2corinthians",
  galatians: "galatians", ephesians: "ephesians",
  philippians: "philippians", colossians: "colossians",
  "1thessalonians": "1thessalonians", "1 thessalonians": "1thessalonians",
  "2thessalonians": "2thessalonians", "2 thessalonians": "2thessalonians",
  "1timothy": "1timothy", "1 timothy": "1timothy",
  "2timothy": "2timothy", "2 timothy": "2timothy",
  titus: "titus", philemon: "philemon", hebrews: "hebrews",
  james: "james",
  "1peter": "1peter", "1 peter": "1peter",
  "2peter": "2peter", "2 peter": "2peter",
  "1john": "1john", "1 john": "1john",
  "2john": "2john", "2 john": "2john",
  "3john": "3john", "3 john": "3john",
  jude: "jude", revelation: "revelation",
};

const BOOK_ALIASES: Record<string, string> = {
  gen: "genesis", ex: "exodus", exo: "exodus", lev: "leviticus",
  num: "numbers", deut: "deuteronomy", deu: "deuteronomy",
  josh: "joshua", judg: "judges",
  ps: "psalms", psa: "psalms", prov: "proverbs", pro: "proverbs",
  eccl: "ecclesiastes", ecc: "ecclesiastes",
  song: "songofsolomon", sos: "songofsolomon",
  isa: "isaiah", jer: "jeremiah", lam: "lamentations",
  ezek: "ezekiel", eze: "ezekiel", dan: "daniel", hos: "hosea",
  hab: "habakkuk", zeph: "zephaniah", hag: "haggai",
  zech: "zechariah", zec: "zechariah", mal: "malachi",
  matt: "matthew", mat: "matthew", mk: "mark", lk: "luke",
  jn: "john", jhn: "john", rom: "romans",
  "1cor": "1corinthians", "2cor": "2corinthians",
  gal: "galatians", eph: "ephesians", phil: "philippians",
  col: "colossians",
  "1thes": "1thessalonians", "1thess": "1thessalonians",
  "2thes": "2thessalonians", "2thess": "2thessalonians",
  "1tim": "1timothy", "2tim": "2timothy",
  tit: "titus", phlm: "philemon", heb: "hebrews", jas: "james",
  "1pet": "1peter", "2pet": "2peter",
  "1jn": "1john", "2jn": "2john", "3jn": "3john",
  rev: "revelation",
};

// ─── Study field label → canonical DB column ──────────────────────────────────

/** Maps every accepted label variant (uppercased) to the DB column name */
const FIELD_LABEL_MAP: Record<string, string> = {
  "EXPLANATION": "content",
  "PASSAGE_CONTEXT": "context_note",
  "CONTEXT": "context_note",
  "HISTORICAL_BACKGROUND": "historical_note",
  "HISTORICAL_NOTE": "historical_note",
  "ORIGINAL_LANGUAGE": "original_language_note",
  "ORIGINAL_LANGUAGE_NOTE": "original_language_note",
  "HOW_THIS_POINTS_TO_JESUS": "jesus_connection",
  "JESUS_CONNECTION": "jesus_connection",
  "PRACTICAL_APPLICATION": "apply_it",
  "APPLY_IT": "apply_it",
  "KEY_TRUTH": "key_truth",
  "REFLECTION": "reflection_question",
  "REFLECTION_QUESTION": "reflection_question",
  "RELATED_SCRIPTURES": "related_scriptures",
};

// Structural markers — never treated as field labels
const STRUCTURAL_MARKERS = new Set([
  "BOOK", "CHAPTER", "TITLE", "CHAPTER_OVERVIEW", "PASSAGE",
]);

// Separator-only lines
const SEPARATOR_RE = /^\s*[-=]{3,}\s*$/;

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BulkImportDiagnostic {
  lineNumber: number;
  code: string;
  message: string;
}

export interface ParsedPassage {
  /** 1-based verse start */
  verseStart: number;
  /** 1-based verse end (same as verseStart for single verse) */
  verseEnd: number;
  /** Original reference text as written, e.g. "John 1:1-5" or "1:1-5" */
  referenceRaw: string;
  /** DB column → value map for study fields */
  fields: Record<string, string>;
  /** True when there are no errors for this passage */
  valid: boolean;
  /** Line number of PASSAGE marker */
  lineNumber: number;
}

export interface ParsedChapter {
  chapterNumber: number;
  title: string;
  chapterOverview: string;
  passages: ParsedPassage[];
  /** True when there are no errors for this chapter */
  valid: boolean;
  /** Line number of CHAPTER marker */
  lineNumber: number;
}

export interface ParsedBook {
  bookId: string;
  chapters: ParsedChapter[];
  /** True when there are no errors for this book */
  valid: boolean;
  /** Line number of BOOK marker */
  lineNumber: number;
}

export interface BulkImportPreview {
  books: ParsedBook[];
  totalPassages: number;
  totalFieldValues: number;
  fieldCounts: Record<string, number>;
  errors: BulkImportDiagnostic[];
  warnings: BulkImportDiagnostic[];
  /** True when errors is empty */
  valid: boolean;
}

/**
 * Optional injector for verse-count validation.
 * Receives a canonical bookId and chapter number.
 * Return the number of verses in that chapter, or null/undefined if unknown.
 */
export type VerseCountResolver = (
  bookId: string,
  chapter: number,
) => number | null | undefined | Promise<number | null | undefined>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normalise a book name to its canonical ID or return null */
export function resolveBookId(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, " ");
  const nospaces = cleaned.replace(/\s/g, "");
  return (
    BOOK_NAME_TO_ID[cleaned] ??
    BOOK_NAME_TO_ID[nospaces] ??
    BOOK_ALIASES[cleaned] ??
    BOOK_ALIASES[nospaces] ??
    null
  );
}

/**
 * Parse a PASSAGE reference such as:
 *   "John 1:1-5"  "john 1:1"  "1:1-5"  "1:1"
 *
 * When no book name is present, `contextBookId` and `contextChapter` are used.
 * Returns null when the reference is unparseable.
 */
export function parsePassageReference(
  raw: string,
  contextBookId: string | null,
  contextChapter: number | null,
): {
  bookId: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
} | null {
  const s = raw.trim();

  // Pattern 1: full ref — "BookName chapter:verse[-verse]"
  const fullPattern =
    /^(\d?\s*[a-zA-Z][a-zA-Z\s]*?)\s+(\d+):(\d+)(?:-(\d+))?$/;
  const fullMatch = s.match(fullPattern);
  if (fullMatch) {
    const bookId = resolveBookId(fullMatch[1]);
    if (!bookId) return null;
    const chapter = parseInt(fullMatch[2], 10);
    const verseStart = parseInt(fullMatch[3], 10);
    const verseEnd = fullMatch[4] ? parseInt(fullMatch[4], 10) : verseStart;
    return { bookId, chapter, verseStart, verseEnd };
  }

  // Pattern 2: chapter-relative — "chapter:verse[-verse]"
  const relPattern = /^(\d+):(\d+)(?:-(\d+))?$/;
  const relMatch = s.match(relPattern);
  if (relMatch && contextBookId && contextChapter != null) {
    const chapter = parseInt(relMatch[1], 10);
    const verseStart = parseInt(relMatch[2], 10);
    const verseEnd = relMatch[3] ? parseInt(relMatch[3], 10) : verseStart;
    return {
      bookId: contextBookId,
      chapter,
      verseStart,
      verseEnd,
    };
  }

  return null;
}

/** Return the canonical field key for a label, or null if unknown */
export function resolveFieldLabel(label: string): string | null {
  const normalized = label.trim().toUpperCase().replace(/[\s-]+/g, "_");
  return FIELD_LABEL_MAP[normalized] ?? null;
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse and validate a bulk Bible study import text block.
 *
 * @param text    - raw pasted text from the admin importer
 * @param verseCountResolver - optional; supply to validate verse ranges
 */
export async function parseBulkImport(
  text: string,
  verseCountResolver?: VerseCountResolver,
): Promise<BulkImportPreview> {
  const lines = text.split(/\r?\n/);
  const errors: BulkImportDiagnostic[] = [];
  const warnings: BulkImportDiagnostic[] = [];

  function addError(lineNumber: number, code: string, message: string) {
    errors.push({ lineNumber, code, message });
  }
  function addWarning(lineNumber: number, code: string, message: string) {
    warnings.push({ lineNumber, code, message });
  }

  const books: ParsedBook[] = [];

  // Parser state
  let currentBookId: string | null = null;
  let currentBookLineNo = 0;
  let currentChapterNum: number | null = null;
  let currentChapterLineNo = 0;
  let currentChapterTitle = "";
  let currentChapterOverview = "";
  let currentChapters: ParsedChapter[] = [];

  let currentPassageRef: string | null = null;
  let currentPassageLineNo = 0;
  let currentPassageVerseStart: number | null = null;
  let currentPassageVerseEnd: number | null = null;
  let currentPassageFields: Record<string, string> = {};
  let currentPassages: ParsedPassage[] = [];

  // "currently collecting" state — what multiline content belongs to
  type CollectingTarget =
    | { type: "chapter_overview" }
    | { type: "chapter_title" }
    | { type: "field"; column: string };

  let collecting: CollectingTarget | null = null;
  let collectingLines: string[] = [];

  /** Flush the currently-accumulating multiline value */
  function flushCollecting() {
    if (!collecting) return;
    const value = trimMultiline(collectingLines.join("\n"));
    if (collecting.type === "chapter_overview") {
      currentChapterOverview = value;
    } else if (collecting.type === "chapter_title") {
      currentChapterTitle = value;
    } else if (collecting.type === "field") {
      currentPassageFields[collecting.column] = value;
    }
    collecting = null;
    collectingLines = [];
  }

  /** Flush current passage into currentPassages */
  function flushPassage() {
    flushCollecting();
    if (currentPassageRef == null) return;

    const passage: ParsedPassage = {
      verseStart: currentPassageVerseStart ?? 0,
      verseEnd: currentPassageVerseEnd ?? currentPassageVerseStart ?? 0,
      referenceRaw: currentPassageRef,
      fields: { ...currentPassageFields },
      valid: true, // errors will flip this below
      lineNumber: currentPassageLineNo,
    };
    currentPassages.push(passage);

    currentPassageRef = null;
    currentPassageVerseStart = null;
    currentPassageVerseEnd = null;
    currentPassageFields = {};
  }

  /** Flush current chapter into currentChapters */
  function flushChapter() {
    flushPassage();
    if (currentChapterNum == null) return;

    const chapter: ParsedChapter = {
      chapterNumber: currentChapterNum,
      title: currentChapterTitle,
      chapterOverview: currentChapterOverview,
      passages: currentPassages,
      valid: true,
      lineNumber: currentChapterLineNo,
    };
    currentChapters.push(chapter);

    currentChapterNum = null;
    currentChapterTitle = "";
    currentChapterOverview = "";
    currentPassages = [];
  }

  /** Flush current book into books[] */
  function flushBook() {
    flushChapter();
    if (currentBookId == null) return;

    const book: ParsedBook = {
      bookId: currentBookId,
      chapters: currentChapters,
      valid: true,
      lineNumber: currentBookLineNo,
    };
    books.push(book);

    currentBookId = null;
    currentChapters = [];
  }

  // Track chapter declarations and passage ranges for the entire pasted
  // document, not only the currently-open block. A repeated BOOK/CHAPTER block
  // must not reset overlap detection and become importable twice.
  const seenChapterDeclarations = new Set<string>();
  const seenPassageRangesByChapter = new Map<
    string,
    Array<{ start: number; end: number; reference: string }>
  >();

  for (let idx = 0; idx < lines.length; idx++) {
    const lineNo = idx + 1;
    const rawLine = lines[idx];
    const trimmed = rawLine.trim();

    // Blank lines and separators: flush collecting (append blank to multiline content)
    if (trimmed === "" || SEPARATOR_RE.test(trimmed)) {
      if (collecting && trimmed === "") {
        collectingLines.push("");
      }
      continue;
    }

    // ── Detect structural markers ────────────────────────────────────────────
    // Pattern A:  MARKER: value on same line
    // Pattern B:  MARKER  (alone on line, value follows)
    const markerColonMatch = trimmed.match(
      /^(BOOK|CHAPTER|TITLE|CHAPTER_OVERVIEW|PASSAGE)\s*:\s*(.*)/i,
    );
    const markerAloneMatch = !markerColonMatch
      ? trimmed.match(/^(BOOK|CHAPTER|TITLE|CHAPTER_OVERVIEW|PASSAGE)\s*$/i)
      : null;

    const markerName = (
      markerColonMatch?.[1] ??
      markerAloneMatch?.[1] ??
      ""
    ).toUpperCase();
    const markerInlineValue = markerColonMatch ? markerColonMatch[2].trim() : null;

    if (markerName) {
      // Close any open collection before handling a new structural marker
      flushCollecting();

      switch (markerName) {
        case "BOOK": {
          flushBook();
          const rawBook = markerInlineValue ?? "";
          if (!rawBook) {
            // value on next line is not collected for BOOK — expect on same line
            addError(lineNo, "MISSING_BOOK_VALUE", "BOOK marker has no value");
            break;
          }
          const bookId = resolveBookId(rawBook);
          if (!bookId) {
            addError(
              lineNo,
              "UNKNOWN_BOOK",
              `Unknown book name: "${rawBook}"`,
            );
          } else {
            currentBookId = bookId;
            currentBookLineNo = lineNo;
          }
          break;
        }

        case "CHAPTER": {
          if (currentBookId == null) {
            addError(
              lineNo,
              "CHAPTER_BEFORE_BOOK",
              "CHAPTER marker encountered before any BOOK marker",
            );
            break;
          }
          flushChapter();
          const rawChapter = markerInlineValue ?? "";
          const chNum = /^\d+$/.test(rawChapter) ? Number(rawChapter) : NaN;
          if (!rawChapter || !Number.isInteger(chNum) || chNum < 1) {
            addError(
              lineNo,
              "INVALID_CHAPTER",
              `CHAPTER marker has invalid value: "${rawChapter}"`,
            );
            break;
          }
          const maxChapters = CANONICAL_CHAPTER_COUNTS[currentBookId];
          if (maxChapters !== undefined && chNum > maxChapters) {
            addError(
              lineNo,
              "CHAPTER_OUT_OF_RANGE",
              `Chapter ${chNum} exceeds ${currentBookId} chapter count (${maxChapters})`,
            );
          }
          const chapterKey = `${currentBookId}:${chNum}`;
          if (seenChapterDeclarations.has(chapterKey)) {
            addError(
              lineNo,
              "DUPLICATE_CHAPTER",
              `Chapter ${chNum} of ${currentBookId} is declared more than once in this import`,
            );
          } else {
            seenChapterDeclarations.add(chapterKey);
          }
          currentChapterNum = chNum;
          currentChapterLineNo = lineNo;
          break;
        }

        case "TITLE": {
          if (currentChapterNum == null) {
            addError(
              lineNo,
              "TITLE_WITHOUT_CHAPTER",
              "TITLE marker encountered before any CHAPTER marker",
            );
            break;
          }
          if (markerInlineValue) {
            currentChapterTitle = markerInlineValue;
          } else {
            collecting = { type: "chapter_title" };
            collectingLines = [];
          }
          break;
        }

        case "CHAPTER_OVERVIEW": {
          if (currentChapterNum == null) {
            addError(
              lineNo,
              "OVERVIEW_WITHOUT_CHAPTER",
              "CHAPTER_OVERVIEW marker encountered before any CHAPTER marker",
            );
            break;
          }
          if (markerInlineValue) {
            currentChapterOverview = markerInlineValue;
          } else {
            collecting = { type: "chapter_overview" };
            collectingLines = [];
          }
          break;
        }

        case "PASSAGE": {
          if (currentBookId == null) {
            addError(
              lineNo,
              "PASSAGE_BEFORE_BOOK",
              "PASSAGE marker encountered before any BOOK marker",
            );
            break;
          }
          if (currentChapterNum == null) {
            addError(
              lineNo,
              "PASSAGE_BEFORE_CHAPTER",
              "PASSAGE marker encountered before any CHAPTER marker",
            );
            break;
          }
          flushPassage();

          const rawRef = markerInlineValue ?? "";
          if (!rawRef) {
            addError(
              lineNo,
              "MISSING_PASSAGE_VALUE",
              "PASSAGE marker has no reference value",
            );
            break;
          }

          const parsed = parsePassageReference(
            rawRef,
            currentBookId,
            currentChapterNum,
          );

          if (!parsed) {
            addError(
              lineNo,
              "INVALID_PASSAGE_REF",
              `Cannot parse passage reference: "${rawRef}"`,
            );
            break;
          }

          // Book mismatch
          if (parsed.bookId !== currentBookId) {
            addError(
              lineNo,
              "WRONG_BOOK_IN_PASSAGE",
              `Passage book "${parsed.bookId}" does not match current BOOK "${currentBookId}"`,
            );
          }

          // Chapter mismatch
          if (parsed.chapter !== currentChapterNum) {
            addError(
              lineNo,
              "WRONG_CHAPTER_IN_PASSAGE",
              `Passage chapter ${parsed.chapter} does not match current CHAPTER ${currentChapterNum}`,
            );
          }

          // Verse validation
          if (parsed.verseStart < 1) {
            addError(
              lineNo,
              "INVALID_VERSE",
              `Verse start must be >= 1 in "${rawRef}"`,
            );
          }
          if (parsed.verseEnd < parsed.verseStart) {
            addError(
              lineNo,
              "REVERSED_VERSE_RANGE",
              `Verse end ${parsed.verseEnd} < verse start ${parsed.verseStart} in "${rawRef}"`,
            );
          }

          // Duplicate or intersecting ranges within the pasted block would
          // make verse taps ambiguous, so reject them before preview/import.
          const chapterKey = `${currentBookId}:${currentChapterNum}`;
          const seenPassageRanges =
            seenPassageRangesByChapter.get(chapterKey) ?? [];
          const overlap = seenPassageRanges.find(
            (range) =>
              parsed.verseStart <= range.end && parsed.verseEnd >= range.start,
          );
          if (overlap) {
            addError(
              lineNo,
              overlap.start === parsed.verseStart && overlap.end === parsed.verseEnd
                ? "DUPLICATE_PASSAGE_RANGE"
                : "OVERLAPPING_PASSAGE_RANGE",
              overlap.start === parsed.verseStart && overlap.end === parsed.verseEnd
                ? `Duplicate passage range "${rawRef}" in this import block`
                : `Passage "${rawRef}" overlaps "${overlap.reference}" in this import block`,
            );
          }
          seenPassageRanges.push({
            start: parsed.verseStart,
            end: parsed.verseEnd,
            reference: rawRef,
          });
          seenPassageRangesByChapter.set(chapterKey, seenPassageRanges);

          currentPassageRef = rawRef;
          currentPassageLineNo = lineNo;
          currentPassageVerseStart = parsed.verseStart;
          currentPassageVerseEnd = parsed.verseEnd;
          currentPassageFields = {};

          // Validate verse count if resolver provided
          if (
            verseCountResolver &&
            parsed.verseStart >= 1 &&
            parsed.verseEnd >= parsed.verseStart
          ) {
            const maxVerses = await verseCountResolver(
              parsed.bookId,
              parsed.chapter,
            );
            if (maxVerses != null) {
              if (parsed.verseEnd > maxVerses) {
                addError(
                  lineNo,
                  "VERSE_OUT_OF_RANGE",
                  `Verse ${parsed.verseEnd} exceeds chapter verse count (${maxVerses}) in "${rawRef}"`,
                );
              }
            }
          }

          break;
        }
      }

      continue;
    }

    // ── Detect study-field labels ─────────────────────────────────────────────
    // Pattern A:  LABEL: value on same line  (case-insensitive)
    // Pattern B:  LABEL  (alone on line, value follows on next lines)
    const fieldColonMatch = trimmed.match(/^([A-Za-z][A-Za-z _-]*?)\s*:\s*(.*)/);
    const fieldAloneMatch = !fieldColonMatch
      ? trimmed.match(/^([A-Za-z][A-Za-z _-]+)\s*$/)
      : null;

    const rawLabel = (fieldColonMatch?.[1] ?? fieldAloneMatch?.[1] ?? "")
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");

    const standaloneLooksLikeLabel =
      Boolean(fieldAloneMatch) &&
      fieldAloneMatch![1].trim() === fieldAloneMatch![1].trim().toUpperCase();
    const resolvedColumn = rawLabel ? resolveFieldLabel(rawLabel) : null;

    if (rawLabel && (Boolean(fieldColonMatch) || resolvedColumn || standaloneLooksLikeLabel)) {
      // Check it isn't a structural marker (already handled above)
      if (!STRUCTURAL_MARKERS.has(rawLabel)) {
        const column = resolvedColumn;

        if (column == null) {
          // Unknown uppercase-ish label — warn and do not collect content
          addWarning(
            lineNo,
            "UNKNOWN_LABEL",
            `Unknown label "${rawLabel}" — content will be ignored`,
          );
          flushCollecting();
          // Start a "discard" collection so subsequent lines don't become content
          collecting = null; // don't collect unknowns
          continue;
        }

        // Valid field label
        if (currentPassageRef == null) {
          addError(
            lineNo,
            "FIELD_BEFORE_PASSAGE",
            `Field "${rawLabel}" encountered before any PASSAGE marker`,
          );
          continue;
        }

        flushCollecting();

        if (fieldColonMatch) {
          const inlineVal = fieldColonMatch[2].trim();
          if (inlineVal) {
            // Value on same line — start collecting with this as the first line
            collecting = { type: "field", column };
            collectingLines = [inlineVal];
          } else {
            // Colon but no inline value — collect multiline
            collecting = { type: "field", column };
            collectingLines = [];
          }
        } else {
          // Label alone on line — collect multiline
          collecting = { type: "field", column };
          collectingLines = [];
        }
        continue;
      }
    }

    // ── Content lines (continuation of collecting target) ─────────────────────
    if (collecting) {
      collectingLines.push(rawLine.trimEnd());
      continue;
    }

    // ── Unrecognised non-empty line outside of any collection ──────────────────
    // (silently skip — could be user notes, prose descriptions, etc.)
  }

  // Flush anything still open
  flushBook();

  if (books.length === 0 && !errors.some((error) => error.code.includes("BOOK"))) {
    addError(1, "MISSING_BOOK", "No BOOK marker was found");
  }

  for (const book of books) {
    if (
      book.chapters.length === 0 &&
      !errors.some((error) => error.lineNumber === book.lineNumber)
    ) {
      addError(book.lineNumber, "MISSING_CHAPTER", "BOOK has no CHAPTER marker");
    }
    for (const chapter of book.chapters) {
      if (
        chapter.passages.length === 0 &&
        !chapter.title.trim() &&
        !chapter.chapterOverview.trim() &&
        !errors.some((error) => error.lineNumber === chapter.lineNumber)
      ) {
        addError(
          chapter.lineNumber,
          "MISSING_PASSAGE",
          "CHAPTER has no PASSAGE, TITLE, or CHAPTER_OVERVIEW content",
        );
      }
    }
  }

  // ── Post-parse validation: mark books/chapters/passages as valid/invalid ────
  // Mark passages/chapters/books invalid when errors were emitted at their line.

  // Mark items invalid by checking errors against their spans
  for (const book of books) {
    for (const chapter of book.chapters) {
      for (const passage of chapter.passages) {
        passage.valid = !errors.some(
          (e) => e.lineNumber === passage.lineNumber,
        );
      }
      chapter.valid =
        Boolean(
          chapter.passages.length > 0 ||
          chapter.title.trim() ||
          chapter.chapterOverview.trim(),
        ) &&
        chapter.passages.every((p) => p.valid) &&
        !errors.some((e) => e.lineNumber === chapter.lineNumber);
    }
    book.valid =
      book.chapters.length > 0 &&
      book.chapters.every((c) => c.valid) &&
      !errors.some((e) => e.lineNumber === book.lineNumber);
  }

  const totalPassages = books.reduce(
    (acc, b) => acc + b.chapters.reduce((a, c) => a + c.passages.length, 0),
    0,
  );
  const totalFieldValues = books.reduce(
    (acc, b) =>
      acc +
      b.chapters.reduce(
        (a, c) =>
          a +
          c.passages.reduce(
            (pa, p) => pa + Object.keys(p.fields).length,
            0,
          ),
        0,
      ),
    0,
  );
  const fieldCounts: Record<string, number> = {};
  for (const book of books) {
    for (const chapter of book.chapters) {
      for (const passage of chapter.passages) {
        for (const [field, value] of Object.entries(passage.fields)) {
          if (value.trim()) fieldCounts[field] = (fieldCounts[field] ?? 0) + 1;
        }
      }
    }
  }

  return {
    books,
    totalPassages,
    totalFieldValues,
    fieldCounts,
    errors,
    warnings,
    valid: errors.length === 0,
  };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Trim leading/trailing blank lines from a multiline string */
function trimMultiline(s: string): string {
  return s.replace(/^\n+/, "").replace(/\n+$/, "").trimEnd();
}
