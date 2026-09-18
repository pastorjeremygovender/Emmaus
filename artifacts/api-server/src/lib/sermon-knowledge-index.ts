/**
 * sermon-knowledge-index.ts — Emmaus Knowledge Index for Sermon Companions.
 *
 * Stores enriched sermon + companion data so Ask Emmaus and search can find
 * sermons by step content, reflection themes, teaching points, and prayer text —
 * not just the top-level title / scripture / themes on the canonical sermon record.
 *
 * The index is upserted:
 *   • When a Sermon Companion is published (full companion step content included)
 *   • When a canonical sermon is published or materially updated
 *
 * Fields per entry:
 *   sermon metadata   — title, speaker, date, series, scripture, themes, keywords
 *   companion content — step titles, concatenated step content, prayer themes
 *   media URLs        — youtubeUrl, audioPath
 *
 * Table DDL lives in startup-migrations.ts (emmaus_knowledge_index).
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface KnowledgeIndexEntry {
  /** Canonical sermon UUID (sermons.id). */
  sermonId: string;
  /** Sermon companion UUID — null when indexing sermon-only (no companion yet). */
  companionId?: string | null;
  title: string;
  speaker: string;
  sermonDate: string;
  series: string;
  scriptureReference: string;
  scriptureBookIds: string[];
  scriptureChapters: number[];
  themes: string[];
  keywords: string[];
  mainTheme: string;
  summary: string;
  /** Titles of each companion step (e.g. ["Drawn By Love", "A New Creation", …]). */
  stepTitles: string[];
  /**
   * Concatenated text of all companion step bodies — greeting + reflection +
   * nextStep + closing. Used for keyword / topic matching.
   */
  stepContent: string;
  /** Concatenated prayer text from all companion steps. */
  prayerThemes: string;
  youtubeUrl: string;
  audioPath: string;
  publishedAt?: string | null;
  /**
   * Full lifecycle reconciliation should replace companion-derived fields,
   * including clearing them after an unpublish. Ordinary sermon metadata edits
   * leave this false so a concurrent companion publish is not overwritten.
   */
  replaceCompanionContent?: boolean;
}

export interface KnowledgeIndexResult extends KnowledgeIndexEntry {
  score: number;
}

export interface KnowledgeIndexDiagnostics {
  totalIndexRows: number;
  indexedPublished: number;
  staleIndexRows: number;
  orphanedIndexRows: number;
  missingIndexRows: number;
}

/**
 * Read-only coverage diagnostics for the admin UI. This deliberately does not
 * repair or delete anything; lifecycle hooks remain the only mutation path.
 */
export async function getKnowledgeIndexDiagnostics(): Promise<KnowledgeIndexDiagnostics> {
  const result = await pool.query<{
    total_index_rows: string;
    indexed_published: string;
    stale_index_rows: string;
    orphaned_index_rows: string;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM emmaus_knowledge_index) AS total_index_rows,
      (SELECT COUNT(*)
         FROM emmaus_knowledge_index k
         INNER JOIN sermons s ON s.id::text = k.sermon_id
        WHERE s.status = 'Published') AS indexed_published,
      (SELECT COUNT(*)
         FROM emmaus_knowledge_index k
         INNER JOIN sermons s ON s.id::text = k.sermon_id
        WHERE s.status <> 'Published') AS stale_index_rows,
      (SELECT COUNT(*)
         FROM emmaus_knowledge_index k
         LEFT JOIN sermons s ON s.id::text = k.sermon_id
        WHERE s.id IS NULL) AS orphaned_index_rows
  `);
  const row = result.rows[0];
  return {
    totalIndexRows: Number(row?.total_index_rows ?? 0),
    indexedPublished: Number(row?.indexed_published ?? 0),
    staleIndexRows: Number(row?.stale_index_rows ?? 0),
    orphanedIndexRows: Number(row?.orphaned_index_rows ?? 0),
    missingIndexRows: await countMissingEligibleRows(),
  };
}

async function countMissingEligibleRows(): Promise<number> {
  const result = await pool.query(`
    SELECT COUNT(*) AS count
      FROM sermons s
     WHERE s.status = 'Published'
       AND NULLIF(BTRIM(s.title), '') IS NOT NULL
       AND NULLIF(BTRIM(s.speaker), '') IS NOT NULL
       AND LOWER(BTRIM(s.speaker)) <> 'unknown speaker'
       AND s.title !~* '\\mshorts?\\M'
       AND NOT EXISTS (
         SELECT 1 FROM emmaus_knowledge_index k WHERE k.sermon_id = s.id::text
       )
  `);
  return Number(result.rows[0]?.count ?? 0);
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Insert or update the knowledge index entry for the given sermon.
 *
 * Safe to call multiple times — uses ON CONFLICT (sermon_id) DO UPDATE.
 *
 * The INSERT is conditional: a CTE verifies the sermon is still 'Published'
 * in the canonical store before inserting. This prevents a stale post-unpublish
 * upsert from re-adding a Draft sermon when publish and unpublish run concurrently
 * (unpublish transaction commits first → status = Draft → CTE returns no rows →
 * INSERT is a no-op, leaving the index clean).
 *
 * This function does NOT catch errors — callers are responsible for deciding
 * whether an indexing failure should fail the operation or be logged and swallowed.
 */
export async function upsertKnowledgeIndex(entry: KnowledgeIndexEntry): Promise<void> {
  await pool.query(
    `WITH status_check AS (
       SELECT id FROM sermons WHERE id = $1::uuid AND status = 'Published'
     )
     INSERT INTO emmaus_knowledge_index (
       sermon_id, companion_id, title, speaker, sermon_date, series,
       scripture_reference, scripture_book_ids, scripture_chapters,
       themes, keywords, main_theme, summary,
       step_titles, step_content, prayer_themes,
       youtube_url, audio_path, published_at,
       indexed_at, updated_at
     )
     SELECT
       $1::uuid, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb,
       $10::jsonb, $11::jsonb, $12, $13,
       $14::jsonb, $15, $16, $17, $18, $19,
       NOW(), NOW()
     FROM status_check
     ON CONFLICT (sermon_id) DO UPDATE SET
       -- Always refresh sermon metadata fields.
       title               = EXCLUDED.title,
       speaker             = EXCLUDED.speaker,
       sermon_date         = EXCLUDED.sermon_date,
       series              = EXCLUDED.series,
       scripture_reference = EXCLUDED.scripture_reference,
       scripture_book_ids  = EXCLUDED.scripture_book_ids,
       scripture_chapters  = EXCLUDED.scripture_chapters,
       themes              = EXCLUDED.themes,
       keywords            = EXCLUDED.keywords,
       main_theme          = EXCLUDED.main_theme,
       summary             = EXCLUDED.summary,
       youtube_url         = EXCLUDED.youtube_url,
       audio_path          = EXCLUDED.audio_path,
       published_at        = EXCLUDED.published_at,
       updated_at          = NOW(),
       -- Companion-derived fields: only overwrite when the incoming value is non-empty.
       -- Sermon publish/edit calls pass empty arrays/strings; companion publish passes
       -- real content. COALESCE/CASE preserves step text when a sermon metadata edit
       -- runs after the companion has already been indexed.
        companion_id        = CASE WHEN $20::boolean THEN EXCLUDED.companion_id ELSE COALESCE(EXCLUDED.companion_id, emmaus_knowledge_index.companion_id) END,
        step_titles         = CASE WHEN $20::boolean THEN EXCLUDED.step_titles
                                   WHEN EXCLUDED.step_titles::text = '[]' THEN emmaus_knowledge_index.step_titles
                                   ELSE EXCLUDED.step_titles END,
        step_content        = CASE WHEN $20::boolean THEN EXCLUDED.step_content
                                   WHEN EXCLUDED.step_content = '' THEN emmaus_knowledge_index.step_content
                                   ELSE EXCLUDED.step_content END,
        prayer_themes       = CASE WHEN $20::boolean THEN EXCLUDED.prayer_themes
                                   WHEN EXCLUDED.prayer_themes = '' THEN emmaus_knowledge_index.prayer_themes
                                   ELSE EXCLUDED.prayer_themes END`,
    [
      entry.sermonId,
      entry.companionId ?? null,
      entry.title,
      entry.speaker,
      entry.sermonDate,
      entry.series,
      entry.scriptureReference,
      JSON.stringify(entry.scriptureBookIds),
      JSON.stringify(entry.scriptureChapters),
      JSON.stringify(entry.themes),
      JSON.stringify(entry.keywords),
      entry.mainTheme,
      entry.summary,
      JSON.stringify(entry.stepTitles),
      entry.stepContent,
      entry.prayerThemes,
      entry.youtubeUrl,
      entry.audioPath,
      entry.publishedAt ?? null,
      entry.replaceCompanionContent === true,
    ],
  );
  logger.info(
    { sermonId: entry.sermonId, companionId: entry.companionId ?? null },
    "knowledge-index: upserted",
  );
}

type CompanionIndexRow = Record<string, unknown> & {
  companion_entries?: Array<Record<string, unknown>> | null;
};

function jsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isoTimestamp(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function expectedEntry(row: CompanionIndexRow): KnowledgeIndexEntry {
  const entries = jsonArray(row.companion_entries) as Array<Record<string, unknown>>;
  const hasPublishedCompanion = Boolean(row.companion_id);
  const stepTitles = hasPublishedCompanion
    ? entries.map((entry) => String(entry.title ?? "")).filter(Boolean)
    : [];
  const stepContent = hasPublishedCompanion
    ? entries.map((entry) =>
      [entry.greeting, entry.reflection, entry.next_step, entry.closing]
        .filter(Boolean)
        .join(" "),
    ).join(" ")
    : "";
  const prayerThemes = hasPublishedCompanion
    ? entries.map((entry) => String(entry.prayer ?? "")).filter(Boolean).join(" ")
    : "";

  return {
    sermonId: String(row.sermon_id),
    companionId: hasPublishedCompanion ? String(row.companion_id) : null,
    title: String(row.title ?? ""),
    speaker: String(row.speaker ?? ""),
    sermonDate: String(row.sermon_date ?? ""),
    series: String(row.series ?? ""),
    scriptureReference: String(row.scripture_reference ?? ""),
    scriptureBookIds: jsonArray(row.scripture_book_ids) as string[],
    scriptureChapters: jsonArray(row.scripture_chapters).map(Number),
    themes: jsonArray(row.themes) as string[],
    keywords: jsonArray(row.keywords) as string[],
    mainTheme: String(row.main_theme ?? ""),
    summary: String(row.summary ?? ""),
    stepTitles,
    stepContent,
    prayerThemes,
    youtubeUrl: String(row.youtube_url ?? ""),
    audioPath: String(row.audio_path ?? ""),
    publishedAt: isoTimestamp(row.published_at),
    replaceCompanionContent: true,
  };
}

/**
 * Rebuild one sermon entry from the canonical sermon and its currently
 * published companion content. This is awaited by companion lifecycle routes,
 * so an unpublish cannot return while old companion text remains searchable.
 */
export async function syncKnowledgeIndexForSermon(sermonId: string): Promise<void> {
  const result = await pool.query<CompanionIndexRow>(`
    SELECT
      s.id AS sermon_id, s.title, s.speaker, s.sermon_date, s.series,
      s.scripture_reference, s.scripture_book_ids, s.scripture_chapters,
      s.themes, s.keywords, s.main_theme, s.summary, s.youtube_url,
      s.audio_path, s.published_at,
      sc.id AS companion_id,
      COALESCE(
        json_agg(json_build_object(
          'title', sce.title,
          'greeting', sce.greeting,
          'reflection', sce.reflection,
          'prayer', sce.prayer,
          'next_step', sce.next_step,
          'closing', sce.closing
        ) ORDER BY sce.day_number) FILTER (WHERE sce.id IS NOT NULL),
        '[]'::json
      ) AS companion_entries
    FROM sermons s
    LEFT JOIN sermon_companion sc
      ON (sc.sermon_uuid = s.id
          OR sc.sermon_id = s.id::text
          OR (s.legacy_json_id IS NOT NULL AND sc.sermon_id = s.legacy_json_id))
     AND sc.status = 'Published'
     AND EXISTS (
       SELECT 1 FROM sermon_companion_entry visible_entry
        WHERE visible_entry.companion_id = sc.id
          AND visible_entry.status = 'Published'
     )
    LEFT JOIN sermon_companion_entry sce
      ON sce.companion_id = sc.id AND sce.status = 'Published'
    WHERE s.id = $1::uuid
    GROUP BY s.id, sc.id
    ORDER BY sc.published_at DESC NULLS LAST
    LIMIT 1
  `, [sermonId]);

  const row = result.rows[0];
  if (!row
    || String(row.speaker ?? "").trim().toLowerCase() === "unknown speaker"
    || /\bshorts?\b/i.test(String(row.title ?? ""))) {
    await removeFromKnowledgeIndex(sermonId);
    return;
  }
  if (String(row.title ?? "").trim() === "" || String(row.speaker ?? "").trim() === "") {
    await removeFromKnowledgeIndex(sermonId);
    return;
  }
  await upsertKnowledgeIndex(expectedEntry(row));
}

export interface KnowledgeIndexRepairResult extends KnowledgeIndexDiagnostics {
  repaired: boolean;
  removedRows: number;
  backfilledRows: number;
  failures: string[];
}

/**
 * Compare the persistent index with canonical Published sermons. Without
 * repair this is a read-only report; with repair it removes stale/orphaned
 * rows and backfills every eligible published sermon. Each write is
 * idempotent and the conditional upsert refuses to resurrect an unpublish
 * racing the repair.
 */
export async function reconcileKnowledgeIndex(
  repair = false,
): Promise<KnowledgeIndexRepairResult> {
  const before = await getKnowledgeIndexDiagnostics();
  const failures: string[] = [];
  let removedRows = 0;
  let backfilledRows = 0;

  const expected = await pool.query<CompanionIndexRow>(`
    SELECT
      s.id AS sermon_id, s.title, s.speaker, s.sermon_date, s.series,
      s.scripture_reference, s.scripture_book_ids, s.scripture_chapters,
      s.themes, s.keywords, s.main_theme, s.summary, s.youtube_url,
      s.audio_path, s.published_at,
      sc.id AS companion_id,
      COALESCE(
        json_agg(json_build_object(
          'title', sce.title, 'greeting', sce.greeting,
          'reflection', sce.reflection, 'prayer', sce.prayer,
          'next_step', sce.next_step, 'closing', sce.closing
        ) ORDER BY sce.day_number) FILTER (WHERE sce.id IS NOT NULL),
        '[]'::json
      ) AS companion_entries
    FROM sermons s
    LEFT JOIN sermon_companion sc
      ON (sc.sermon_uuid = s.id
          OR sc.sermon_id = s.id::text
          OR (s.legacy_json_id IS NOT NULL AND sc.sermon_id = s.legacy_json_id))
     AND sc.status = 'Published'
     AND EXISTS (
       SELECT 1 FROM sermon_companion_entry visible_entry
        WHERE visible_entry.companion_id = sc.id
          AND visible_entry.status = 'Published'
     )
    LEFT JOIN sermon_companion_entry sce
      ON sce.companion_id = sc.id AND sce.status = 'Published'
    WHERE s.status = 'Published'
      AND NULLIF(BTRIM(s.title), '') IS NOT NULL
      AND NULLIF(BTRIM(s.speaker), '') IS NOT NULL
      AND LOWER(BTRIM(s.speaker)) <> 'unknown speaker'
      AND s.title !~* '\\mshorts?\\M'
    GROUP BY s.id, sc.id
  `);

  if (!repair) {
    return { ...before, repaired: false, removedRows: 0, backfilledRows: 0, failures };
  }

  try {
    const validIds = expected.rows.map((row) => String(row.sermon_id));
    const deleted = validIds.length
      ? await pool.query(
        `DELETE FROM emmaus_knowledge_index
          WHERE sermon_id <> ALL($1::text[]) OR sermon_id IN (
            SELECT k.sermon_id FROM emmaus_knowledge_index k
             LEFT JOIN sermons s ON s.id::text = k.sermon_id
            WHERE s.id IS NULL OR s.status <> 'Published'
          )`,
        [validIds],
      )
      : await pool.query("DELETE FROM emmaus_knowledge_index");
    removedRows = deleted.rowCount ?? 0;
  } catch (err) {
    failures.push(`remove stale/orphan rows: ${String(err)}`);
  }

  for (const row of expected.rows) {
    try {
      await upsertKnowledgeIndex(expectedEntry(row));
      backfilledRows++;
    } catch (err) {
      failures.push(`${row.sermon_id}: ${String(err)}`);
    }
  }

  const after = await getKnowledgeIndexDiagnostics();
  logger.info({ before, after, removedRows, backfilledRows, failures }, "knowledge-index: reconciliation complete");
  return { ...after, repaired: true, removedRows, backfilledRows, failures };
}

// ─── Remove ───────────────────────────────────────────────────────────────────

/**
 * Remove the knowledge index entry for the given sermon.
 *
 * Called when a sermon is deleted or unpublished so Ask Emmaus and Preached
 * Here stop surfacing it immediately.
 *
 * This function does NOT catch errors — callers are responsible for deciding
 * whether a cleanup failure should propagate or be logged and swallowed.
 * Awaiting this before sending the HTTP response is required so that a
 * subsequent read cannot retrieve a stale entry.
 */
export async function removeFromKnowledgeIndex(sermonId: string): Promise<void> {
  const result = await pool.query(
    `DELETE FROM emmaus_knowledge_index WHERE sermon_id = $1 RETURNING sermon_id`,
    [sermonId],
  );
  const removed = (result.rowCount ?? 0) > 0;
  logger.info({ sermonId, removed }, "knowledge-index: removed");
}

// ─── Search ───────────────────────────────────────────────────────────────────

/**
 * Score all indexed sermons against the query and return results sorted by score.
 * Includes richer content matching (step reflections, prayer text) that the
 * canonical sermons table does not expose.
 *
 * Returns an empty array when no indexed entries exist or the query matches nothing.
 */
export async function searchKnowledgeIndex(
  query: string,
  bibleBookId?: string,
  bibleChapter?: number,
): Promise<KnowledgeIndexResult[]> {
  let rows: Record<string, unknown>[];
  try {
    const hasTextQuery = query.trim().length > 0;
    const hasBibleFilter = !!bibleBookId;

    if (hasTextQuery || hasBibleFilter) {
      // Build a predicate covering both FTS and Bible-context retrieval:
      //   - Text queries use the GIN-indexed tsvector for O(log n) pre-filtering.
      //   - Bible book filters use JSONB containment so scripture-matched rows are
      //     never dropped even when the sermon content doesn't textually repeat the
      //     book name. OR ensures either condition alone surfaces a row.
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (hasTextQuery) {
        conditions.push(`content_tsv @@ plainto_tsquery('english', $${paramIdx})`);
        params.push(query);
        paramIdx++;
      }

      if (hasBibleFilter) {
        // scripture_book_ids is stored as JSONB array — @> containment check
        conditions.push(`scripture_book_ids @> $${paramIdx}::jsonb`);
        params.push(JSON.stringify([bibleBookId]));
        paramIdx++;
      }

      const whereClause = conditions.join(" OR ");
      try {
        const res = await pool.query(
          `SELECT k.* FROM emmaus_knowledge_index k
             INNER JOIN sermons s ON s.id::text = k.sermon_id AND s.status = 'Published'
             WHERE ${whereClause.replace(/\b(content_tsv|scripture_book_ids)\b/g, "k.$1")}`,
          params,
        );
        rows = res.rows;
      } catch (ftsErr) {
        // content_tsv column may not exist yet (migration pending) — fall back
        // to a full scan so search keeps working on a freshly provisioned DB.
        logger.warn({ ftsErr }, "knowledge-index: FTS query failed, falling back to full scan");
        const fallback = await pool.query(
          `SELECT k.* FROM emmaus_knowledge_index k
             INNER JOIN sermons s ON s.id::text = k.sermon_id AND s.status = 'Published'`,
        );
        rows = fallback.rows;
      }
    } else {
      // No filters at all — fetch all rows; in-process scoring selects results.
      const res = await pool.query(
        `SELECT k.* FROM emmaus_knowledge_index k
           INNER JOIN sermons s ON s.id::text = k.sermon_id AND s.status = 'Published'`,
      );
      rows = res.rows;
    }
  } catch (err) {
    logger.warn({ err }, "knowledge-index: search query failed (non-fatal)");
    return [];
  }

  const q = query.toLowerCase();
  const results: KnowledgeIndexResult[] = [];

  for (const row of rows) {
    let score = 0;

    const bookIds: string[] = Array.isArray(row.scripture_book_ids)
      ? (row.scripture_book_ids as string[])
      : [];
    const chapters: number[] = Array.isArray(row.scripture_chapters)
      ? (row.scripture_chapters as number[])
      : [];
    const themes: string[] = Array.isArray(row.themes) ? (row.themes as string[]) : [];
    const keywords: string[] = Array.isArray(row.keywords) ? (row.keywords as string[]) : [];
    const stepTitles: string[] = Array.isArray(row.step_titles)
      ? (row.step_titles as string[])
      : [];
    const mainTheme = String(row.main_theme ?? "");
    const stepContent = String(row.step_content ?? "").toLowerCase();
    const prayerThemes = String(row.prayer_themes ?? "").toLowerCase();

    // ── Scripture match (highest weight) ───────────────────────────────────
    if (bibleBookId) {
      const normBookId = bibleBookId.toLowerCase();
      if (bookIds.some((id) => id.toLowerCase() === normBookId)) {
        score += 12;
        if (bibleChapter != null && chapters.includes(bibleChapter)) {
          score += 8;
        }
      }
    }

    // ── Theme / keyword overlap ─────────────────────────────────────────────
    for (const theme of themes) {
      if (q.includes(theme.toLowerCase())) score += 4;
    }
    for (const kw of keywords) {
      if (q.includes(kw.toLowerCase())) score += 3;
    }
    if (mainTheme && q.includes(mainTheme.toLowerCase().slice(0, 20))) score += 6;

    // ── Step titles ─────────────────────────────────────────────────────────
    for (const st of stepTitles) {
      if (st && q.includes(st.toLowerCase())) score += 3;
    }

    // ── Step content / prayer text (word-level matching for longer words) ───
    if (stepContent) {
      const words = q.split(/\s+/).filter((w) => w.length > 4);
      for (const word of words) {
        if (stepContent.includes(word)) score += 2;
      }
    }
    if (prayerThemes) {
      const words = q.split(/\s+/).filter((w) => w.length > 4);
      for (const word of words) {
        if (prayerThemes.includes(word)) score += 1;
      }
    }

    if (score > 0) {
      results.push({
        sermonId: String(row.sermon_id),
        companionId: row.companion_id ? String(row.companion_id) : null,
        title: String(row.title ?? ""),
        speaker: String(row.speaker ?? ""),
        sermonDate: String(row.sermon_date ?? ""),
        series: String(row.series ?? ""),
        scriptureReference: String(row.scripture_reference ?? ""),
        scriptureBookIds: bookIds,
        scriptureChapters: chapters,
        themes,
        keywords,
        mainTheme,
        summary: String(row.summary ?? ""),
        stepTitles,
        stepContent: String(row.step_content ?? ""),
        prayerThemes: String(row.prayer_themes ?? ""),
        youtubeUrl: String(row.youtube_url ?? ""),
        audioPath: String(row.audio_path ?? ""),
        publishedAt: row.published_at ? String(row.published_at) : null,
        score,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
