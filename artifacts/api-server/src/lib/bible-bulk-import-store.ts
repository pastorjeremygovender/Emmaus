import { pool } from "@workspace/db";
import type {
  BulkImportPreview,
  ParsedChapter,
} from "./bible-bulk-import.js";

export type ImportConflictMode = "skip" | "replace" | "merge";
export type ImportTargetStatus = "Draft" | "Published";

export interface PassageConflict {
  exists: boolean;
  id?: string;
  status?: string;
  verseEnd?: number | null;
  overlapCount?: number;
  exactRange?: boolean;
}

export interface ChapterConflict {
  overview: {
    exists: boolean;
    id?: string;
    status?: string;
  };
  existingPassages: number;
  publishedPassages: number;
}

export type ConflictPreview = Omit<BulkImportPreview, "books"> & {
  books: Array<
    Omit<BulkImportPreview["books"][number], "chapters"> & {
      chapters: Array<
        ParsedChapter & {
          key: string;
          conflicts: ChapterConflict;
          passages: Array<
            ParsedChapter["passages"][number] & { conflict: PassageConflict }
          >;
        }
      >;
    }
  >;
  conflicts: {
    existingOverviews: number;
    existingPassages: number;
    publishedRecords: number;
  };
};

export interface ImportResultCounts {
  created: number;
  replaced: number;
  merged: number;
  skipped: number;
  published: number;
  errored: number;
}

export interface ChapterImportResult extends ImportResultCounts {
  key: string;
  bookId: string;
  chapter: number;
  status: "Completed" | "Failed";
  error?: string;
}

export interface BibleStudyImportResult {
  importId: string;
  status: "Completed" | "Partial" | "Failed";
  counts: ImportResultCounts;
  chapters: ChapterImportResult[];
  firstChapter: { bookId: string; chapter: number } | null;
}

export interface TransactionClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
  release?: () => void;
}

const NOTE_TEXT_COLUMNS = [
  "content",
  "context_note",
  "historical_note",
  "original_language_note",
  "jesus_connection",
  "apply_it",
  "key_truth",
  "reflection_question",
  "related_scriptures",
] as const;

export const PUBLISHED_STUDY_NOTE_FOR_VERSE_SQL = `
  SELECT * FROM bible_study_notes
   WHERE book_id = $1
     AND chapter = $2
     AND verse_start <= $3
     AND COALESCE(verse_end, verse_start) >= $3
     AND status = 'Published'
   ORDER BY
     (COALESCE(verse_end, verse_start) - verse_start) ASC,
     verse_start DESC,
     updated_at DESC,
     id ASC
   LIMIT 1`;

export function chapterImportKey(bookId: string, chapter: number): string {
  return `${bookId}:${chapter}`;
}

export function hasPassageStudyContent(fields: Record<string, string>): boolean {
  return NOTE_TEXT_COLUMNS.some((column) => Boolean(fields[column]?.trim()));
}

export function resolveImportedStatus(
  existingStatus: string,
  mode: ImportConflictMode,
  targetStatus: ImportTargetStatus,
): string {
  if (mode === "merge" && existingStatus === "Published" && targetStatus === "Draft") {
    return "Published";
  }
  return targetStatus;
}

/**
 * Kept as a small exported primitive so transaction rollback behaviour can be
 * verified without needing a live database.
 */
export async function withChapterTransaction<T>(
  client: Pick<TransactionClient, "query">,
  work: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const value = await work();
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function addImportConflicts(
  preview: BulkImportPreview,
): Promise<ConflictPreview> {
  const coordinates = preview.books.flatMap((book) =>
    book.chapters.map((chapter) => ({
      bookId: book.bookId,
      chapter: chapter.chapterNumber,
    })),
  );

  if (coordinates.length === 0) {
    return {
      ...preview,
      books: [],
      conflicts: {
        existingOverviews: 0,
        existingPassages: 0,
        publishedRecords: 0,
      },
    };
  }

  const params: Array<string | number> = [];
  const coordinateSql = coordinates
    .map(({ bookId, chapter }) => {
      params.push(bookId, chapter);
      return `(book_id = $${params.length - 1} AND chapter = $${params.length})`;
    })
    .join(" OR ");

  const [overviewResult, passageResult] = await Promise.all([
    pool.query<{
      id: string;
      book_id: string;
      chapter: number;
      status: string;
    }>(
      `SELECT id, book_id, chapter, status
         FROM bible_chapter_overviews
        WHERE ${coordinateSql}`,
      params,
    ),
    pool.query<{
      id: string;
      book_id: string;
      chapter: number;
      verse_start: number;
      verse_end: number | null;
      status: string;
    }>(
      `SELECT id, book_id, chapter, verse_start, verse_end, status
         FROM bible_study_notes
        WHERE ${coordinateSql}`,
      params,
    ),
  ]);

  const overviewMap = new Map(
    overviewResult.rows.map((row) => [
      chapterImportKey(row.book_id, row.chapter),
      row,
    ]),
  );
  const passagesByChapter = new Map<string, typeof passageResult.rows>();
  for (const row of passageResult.rows) {
    const key = chapterImportKey(row.book_id, row.chapter);
    const rows = passagesByChapter.get(key) ?? [];
    rows.push(row);
    passagesByChapter.set(key, rows);
  }

  let existingOverviews = 0;
  let existingPassages = 0;
  let publishedRecords = 0;

  const books = preview.books.map((book) => ({
    ...book,
    chapters: book.chapters.map((chapter) => {
      const key = chapterImportKey(book.bookId, chapter.chapterNumber);
      const overview = overviewMap.get(key);
      if (overview) {
        existingOverviews += 1;
        if (overview.status === "Published") publishedRecords += 1;
      }

      let chapterExistingPassages = 0;
      let chapterPublishedPassages = 0;
      const passages = chapter.passages.map((passage) => {
        const overlaps = (passagesByChapter.get(key) ?? []).filter((existing) => {
          const existingEnd = existing.verse_end ?? existing.verse_start;
          return (
            existing.verse_start <= passage.verseEnd &&
            existingEnd >= passage.verseStart
          );
        });
        if (overlaps.length > 0) {
          existingPassages += overlaps.length;
          chapterExistingPassages += overlaps.length;
          const publishedOverlaps = overlaps.filter(
            (existing) => existing.status === "Published",
          ).length;
          publishedRecords += publishedOverlaps;
          chapterPublishedPassages += publishedOverlaps;
        }
        const existing = overlaps[0];
        const exactRange =
          overlaps.length === 1 &&
          existing.verse_start === passage.verseStart &&
          (existing.verse_end ?? existing.verse_start) === passage.verseEnd;
        return {
          ...passage,
          conflict: overlaps.length > 0
            ? {
                exists: true,
                id: overlaps.length === 1 ? existing.id : undefined,
                status: overlaps.length === 1 ? existing.status : undefined,
                verseEnd: overlaps.length === 1 ? existing.verse_end : undefined,
                overlapCount: overlaps.length,
                exactRange,
              }
            : { exists: false },
        };
      });

      return {
        ...chapter,
        key,
        passages,
        conflicts: {
          overview: overview
            ? { exists: true, id: overview.id, status: overview.status }
            : { exists: false },
          existingPassages: chapterExistingPassages,
          publishedPassages: chapterPublishedPassages,
        },
      };
    }),
  }));

  return {
    ...preview,
    books,
    conflicts: {
      existingOverviews,
      existingPassages,
      publishedRecords,
    },
  };
}

function emptyCounts(): ImportResultCounts {
  return {
    created: 0,
    replaced: 0,
    merged: 0,
    skipped: 0,
    published: 0,
    errored: 0,
  };
}

function addCounts(target: ImportResultCounts, source: ImportResultCounts): void {
  for (const key of Object.keys(target) as Array<keyof ImportResultCounts>) {
    target[key] += source[key];
  }
}

async function importOverview(
  client: TransactionClient,
  bookId: string,
  chapter: ParsedChapter,
  userId: string,
  mode: ImportConflictMode,
  targetStatus: ImportTargetStatus,
  counts: ImportResultCounts,
): Promise<void> {
  const hasIncomingOverview = Boolean(chapter.title.trim() || chapter.chapterOverview.trim());
  if (!hasIncomingOverview) return;

  const existingResult = await client.query<{
    id: string;
    title: string;
    summary: string;
    status: string;
  }>(
    `SELECT id, title, summary, status
       FROM bible_chapter_overviews
      WHERE book_id = $1 AND chapter = $2
      FOR UPDATE`,
    [bookId, chapter.chapterNumber],
  );
  const existing = existingResult.rows[0];

  if (!existing) {
    await client.query(
      `INSERT INTO bible_chapter_overviews
         (book_id, chapter, title, summary, status, created_by, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $6)`,
      [
        bookId,
        chapter.chapterNumber,
        chapter.title,
        chapter.chapterOverview,
        targetStatus,
        userId,
      ],
    );
    counts.created += 1;
    if (targetStatus === "Published") counts.published += 1;
    return;
  }

  if (mode === "skip") {
    counts.skipped += 1;
    return;
  }

  const status = resolveImportedStatus(existing.status, mode, targetStatus);
  if (mode === "replace") {
    await client.query(
      `UPDATE bible_chapter_overviews
          SET title = $1,
              summary = $2,
              status = $3,
              updated_by = $4,
              updated_at = now()
        WHERE id = $5`,
      [chapter.title, chapter.chapterOverview, status, userId, existing.id],
    );
    counts.replaced += 1;
  } else {
    await client.query(
      `UPDATE bible_chapter_overviews
          SET title = CASE WHEN title = '' THEN $1 ELSE title END,
              summary = CASE WHEN summary = '' THEN $2 ELSE summary END,
              status = $3,
              updated_by = $4,
              updated_at = now()
        WHERE id = $5`,
      [chapter.title, chapter.chapterOverview, status, userId, existing.id],
    );
    counts.merged += 1;
  }
  if (status === "Published") counts.published += 1;
}

async function importPassage(
  client: TransactionClient,
  bookId: string,
  chapter: ParsedChapter,
  passage: ParsedChapter["passages"][number],
  userId: string,
  mode: ImportConflictMode,
  targetStatus: ImportTargetStatus,
  counts: ImportResultCounts,
): Promise<void> {
  if (!hasPassageStudyContent(passage.fields)) {
    counts.skipped += 1;
    return;
  }

  const existingResult = await client.query<{
    id: string;
    status: string;
    verse_start: number;
    verse_end: number | null;
  }>(
    `SELECT id, status, verse_start, verse_end
       FROM bible_study_notes
      WHERE book_id = $1
        AND chapter = $2
        AND verse_start <= $4
        AND COALESCE(verse_end, verse_start) >= $3
      ORDER BY verse_start, COALESCE(verse_end, verse_start)
      FOR UPDATE`,
    [bookId, chapter.chapterNumber, passage.verseStart, passage.verseEnd],
  );
  const overlaps = existingResult.rows;
  const existing = overlaps[0];
  const values = NOTE_TEXT_COLUMNS.map((column) => passage.fields[column] ?? "");

  if (!existing) {
    await client.query(
      `INSERT INTO bible_study_notes
         (book_id, chapter, verse_start, verse_end, title,
          content, context_note, historical_note, original_language_note,
          jesus_connection, apply_it, key_truth, reflection_question,
          related_scriptures, status, created_by, updated_by)
       VALUES
         ($1,$2,$3,$4,'',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)`,
      [
        bookId,
        chapter.chapterNumber,
        passage.verseStart,
        passage.verseEnd === passage.verseStart ? null : passage.verseEnd,
        ...values,
        targetStatus,
        userId,
      ],
    );
    counts.created += 1;
    if (targetStatus === "Published") counts.published += 1;
    return;
  }

  if (mode === "skip") {
    counts.skipped += 1;
    return;
  }

  const exactRange =
    overlaps.length === 1 &&
    existing.verse_start === passage.verseStart &&
    (existing.verse_end ?? existing.verse_start) === passage.verseEnd;
  if (mode === "merge" && !exactRange) {
    throw new Error(
      `Cannot merge ${passage.referenceRaw}: its range overlaps an existing Study record without matching it exactly`,
    );
  }
  if (mode === "replace" && overlaps.length > 1) {
    throw new Error(
      `Cannot replace ${passage.referenceRaw}: it overlaps multiple existing Study records`,
    );
  }

  const status = resolveImportedStatus(existing.status, mode, targetStatus);
  if (mode === "replace") {
    await client.query(
      `UPDATE bible_study_notes
          SET verse_start = $1,
              verse_end = $2,
              content = $3,
              context_note = $4,
              historical_note = $5,
              original_language_note = $6,
              jesus_connection = $7,
              apply_it = $8,
              key_truth = $9,
              reflection_question = $10,
              related_scriptures = $11,
              status = $12,
              updated_by = $13,
              updated_at = now()
        WHERE id = $14`,
      [
        passage.verseStart,
        passage.verseEnd === passage.verseStart ? null : passage.verseEnd,
        ...values,
        status,
        userId,
        existing.id,
      ],
    );
    counts.replaced += 1;
  } else {
    await client.query(
      `UPDATE bible_study_notes
          SET verse_end = COALESCE(verse_end, $1),
              content = CASE WHEN content = '' THEN $2 ELSE content END,
              context_note = CASE WHEN context_note = '' THEN $3 ELSE context_note END,
              historical_note = CASE WHEN historical_note = '' THEN $4 ELSE historical_note END,
              original_language_note = CASE WHEN original_language_note = '' THEN $5 ELSE original_language_note END,
              jesus_connection = CASE WHEN jesus_connection = '' THEN $6 ELSE jesus_connection END,
              apply_it = CASE WHEN apply_it = '' THEN $7 ELSE apply_it END,
              key_truth = CASE WHEN key_truth = '' THEN $8 ELSE key_truth END,
              reflection_question = CASE WHEN reflection_question = '' THEN $9 ELSE reflection_question END,
              related_scriptures = CASE WHEN related_scriptures = '' THEN $10 ELSE related_scriptures END,
              status = $11,
              updated_by = $12,
              updated_at = now()
        WHERE id = $13`,
      [
        passage.verseEnd === passage.verseStart ? null : passage.verseEnd,
        ...values,
        status,
        userId,
        existing.id,
      ],
    );
    counts.merged += 1;
  }
  if (status === "Published") counts.published += 1;
}

export async function importBibleStudyChapter(
  client: TransactionClient,
  bookId: string,
  chapter: ParsedChapter,
  importId: string,
  userId: string,
  mode: ImportConflictMode,
  targetStatus: ImportTargetStatus,
): Promise<ChapterImportResult> {
  const counts = emptyCounts();
  // Serialize writes for the same Bible chapter so two concurrent imports
  // cannot both pass the overlap check and create intersecting ranges.
  await client.query(
    "SELECT pg_advisory_xact_lock(hashtext($1), $2)",
    [bookId, chapter.chapterNumber],
  );
  await importOverview(client, bookId, chapter, userId, mode, targetStatus, counts);

  for (const passage of chapter.passages) {
    if (!passage.valid) continue;
    await importPassage(
      client,
      bookId,
      chapter,
      passage,
      userId,
      mode,
      targetStatus,
      counts,
    );
  }

  await client.query(
    `INSERT INTO content_audit_log
       (content_type, content_id, action, performed_by, new_state)
     VALUES ('bible_bulk_import', $1, $2, $3, $4)`,
    [
      `${importId}:${chapterImportKey(bookId, chapter.chapterNumber)}`,
      `import_${mode}`,
      userId,
      JSON.stringify({
        importId,
        bookId,
        chapter: chapter.chapterNumber,
        targetStatus,
        counts,
      }),
    ],
  );

  return {
    key: chapterImportKey(bookId, chapter.chapterNumber),
    bookId,
    chapter: chapter.chapterNumber,
    status: "Completed",
    ...counts,
  };
}

export async function importBibleStudyChapters(options: {
  preview: BulkImportPreview;
  selectedChapterKeys: string[];
  mode: ImportConflictMode;
  targetStatus: ImportTargetStatus;
  userId: string;
}): Promise<BibleStudyImportResult> {
  const selected = new Set(options.selectedChapterKeys);
  const chapters = options.preview.books.flatMap((book) =>
    book.chapters
      .filter(
        (chapter) =>
          chapter.valid &&
          selected.has(chapterImportKey(book.bookId, chapter.chapterNumber)),
      )
      .map((chapter) => ({ bookId: book.bookId, chapter })),
  );

  if (chapters.length === 0) {
    throw new Error("No valid chapters were selected");
  }

  const books = [...new Set(chapters.map(({ bookId }) => bookId))];
  const chapterCoordinates = chapters.map(({ bookId, chapter }) => ({
    bookId,
    chapter: chapter.chapterNumber,
  }));
  const passageCount = chapters.reduce(
    (count, item) => count + item.chapter.passages.length,
    0,
  );

  const historyResult = await pool.query<{ id: string }>(
    `INSERT INTO bible_study_import_history
       (imported_by, books, chapters, passage_count, conflict_mode, target_status)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      options.userId,
      JSON.stringify(books),
      JSON.stringify(chapterCoordinates),
      passageCount,
      options.mode,
      options.targetStatus,
    ],
  );
  const importId = historyResult.rows[0].id;
  const chapterResults: ChapterImportResult[] = [];
  const totalCounts = emptyCounts();

  for (const { bookId, chapter } of chapters) {
    let client: TransactionClient | undefined;
    try {
      const connectedClient = (await pool.connect()) as unknown as TransactionClient;
      client = connectedClient;
      const result = await withChapterTransaction(connectedClient, () =>
        importBibleStudyChapter(
          connectedClient,
          bookId,
          chapter,
          importId,
          options.userId,
          options.mode,
          options.targetStatus,
        ),
      );
      chapterResults.push(result);
      addCounts(totalCounts, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import error";
      const failure: ChapterImportResult = {
        key: chapterImportKey(bookId, chapter.chapterNumber),
        bookId,
        chapter: chapter.chapterNumber,
        status: "Failed",
        ...emptyCounts(),
        errored: 1,
        error: message,
      };
      chapterResults.push(failure);
      addCounts(totalCounts, failure);
    } finally {
      client?.release?.();
    }
  }

  const successfulChapters = chapterResults.filter(
    (chapter) => chapter.status === "Completed",
  );
  const finalStatus: BibleStudyImportResult["status"] =
    successfulChapters.length === chapterResults.length
      ? "Completed"
      : successfulChapters.length > 0
        ? "Partial"
        : "Failed";

  const result: BibleStudyImportResult = {
    importId,
    status: finalStatus,
    counts: totalCounts,
    chapters: chapterResults,
    firstChapter: successfulChapters[0]
      ? {
          bookId: successfulChapters[0].bookId,
          chapter: successfulChapters[0].chapter,
        }
      : null,
  };

  await pool.query(
    `UPDATE bible_study_import_history
        SET status = $1,
            result = $2,
            completed_at = now()
      WHERE id = $3`,
    [finalStatus, JSON.stringify(result), importId],
  );

  return result;
}

export async function listBibleStudyImportHistory(limit = 50): Promise<unknown[]> {
  const safeLimit = Math.min(Math.max(Math.trunc(limit), 1), 100);
  const result = await pool.query(
    `SELECT id, imported_by, books, chapters, passage_count, conflict_mode,
            target_status, status, result, created_at, completed_at
       FROM bible_study_import_history
      ORDER BY created_at DESC
      LIMIT $1`,
    [safeLimit],
  );
  return result.rows;
}