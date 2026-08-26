/**
 * canonical-sermon-store.ts — PostgreSQL-backed canonical sermon records.
 *
 * This is the SINGLE SOURCE OF TRUTH for all sermon content in Emmaus.
 *
 * Replaces the file-backed admin-sermon-store.ts for new sermon creation.
 * Legacy JSON records from admin-drafts.json are migrated in via
 * sermon-data-migration.ts on first boot; this store is the ongoing home.
 *
 * Ask Emmaus retrieval priority:
 *   1. Canonical sermons (this store, status = 'Published')   ← PRIMARY
 *   2. Legacy YouTube archive (sermon-search.ts)              ← FALLBACK only
 *
 * A canonical sermon that is published SUPPRESSES any matching YouTube archive
 * result to prevent duplicates. The youtube_video_id column provides the link
 * needed to perform that suppression.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CanonicalSermon {
  id: string;               // UUID primary key
  legacyJsonId: string | null; // original admin-drafts.json string ID (null for new)
  title: string;
  speaker: string;
  sermonDate: string;
  series: string;
  scriptureReference: string;
  scriptureBookIds: string[];    // e.g. ["john", "luke"]
  scriptureChapters: number[];   // e.g. [3, 16]
  youtubeUrl: string;
  youtubeVideoId: string;        // links to YouTube archive videos.json for dedup
  audioPath: string;             // GCS object path (e.g. /objects/uploads/uuid.mp3)
  notes: string;                 // admin-only notes
  /** Sermon-section-only transcript (trimmed to the sermon portion). */
  transcript: string;
  /** Full recording transcript — retained for re-detection and editor use. */
  fullTranscript: string;
  transcriptStatus: "none" | "pending" | "complete";
  summary: string;
  themes: string[];
  sections: SermonSection[];
  keywords: string[];
  mainTheme: string;
  /** HH:MM:SS start of the detected sermon within the recording. */
  sermonStartTime: string;
  /** HH:MM:SS end of the detected sermon within the recording. */
  sermonEndTime: string;
  /** AI detection confidence 0–1. */
  detectionConfidence: number;
  /** How the sermon section was identified. */
  detectionMethod: "ai-auto" | "ai-confirmed" | "manual" | "none";
  status: "Draft" | "Review" | "Published";
  publishedAt: string | null;    // ISO timestamp
  /** Background processing pipeline state. Values: idle | transcribing | generating | complete | failed:<stage> */
  processingStage: string;
  processingError: string;
  createdAt: string;
  updatedAt: string;
  displayOrder: number;
}

export interface SermonSection {
  timestampSeconds: number;
  label: string;
  summary?: string;
}

// Detection/full-transcript fields are optional so legacy callers (migration,
// manual sermon creation) don't need to supply them — they default to '' / 0 / 'none'.
export type CreateSermonData = Omit<
  CanonicalSermon,
  "id" | "createdAt" | "updatedAt" | "publishedAt" |
  "fullTranscript" | "sermonStartTime" | "sermonEndTime" | "detectionConfidence" | "detectionMethod" | "displayOrder"
> & {
  /** Defaults to zero in the database when omitted. */
  displayOrder?: number;
  fullTranscript?: string;
  sermonStartTime?: string;
  sermonEndTime?: string;
  detectionConfidence?: number;
  detectionMethod?: CanonicalSermon["detectionMethod"];
};
export type UpdateSermonData = Partial<Omit<CanonicalSermon, "id" | "createdAt">>;

// ─── Row → Domain ─────────────────────────────────────────────────────────────

function rowToSermon(row: Record<string, unknown>): CanonicalSermon {
  const publishedAt = row.published_at;

  return {
    id:                  String(row.id),
    legacyJsonId:        row.legacy_json_id != null ? String(row.legacy_json_id) : null,
    title:               String(row.title ?? ""),
    speaker:             String(row.speaker ?? ""),
    sermonDate:          String(row.sermon_date ?? ""),
    series:              String(row.series ?? ""),
    scriptureReference:  String(row.scripture_reference ?? ""),
    scriptureBookIds:    (row.scripture_book_ids as string[]) ?? [],
    scriptureChapters:   (row.scripture_chapters as number[]) ?? [],
    youtubeUrl:          String(row.youtube_url ?? ""),
    youtubeVideoId:      String(row.youtube_video_id ?? ""),
    audioPath:           String(row.audio_path ?? ""),
    notes:               String(row.notes ?? ""),
    transcript:          String(row.transcript ?? ""),
    fullTranscript:      String(row.full_transcript ?? ""),
    transcriptStatus:    (row.transcript_status as CanonicalSermon["transcriptStatus"]) ?? "none",
    summary:             String(row.summary ?? ""),
    themes:              (row.themes as string[]) ?? [],
    sections:            (row.sections as SermonSection[]) ?? [],
    keywords:            (row.keywords as string[]) ?? [],
    mainTheme:           String(row.main_theme ?? ""),
    sermonStartTime:     String(row.sermon_start_time ?? ""),
    sermonEndTime:       String(row.sermon_end_time ?? ""),
    detectionConfidence: Number(row.detection_confidence ?? 0),
    detectionMethod:     (row.detection_method as CanonicalSermon["detectionMethod"]) ?? "none",
    status:              (row.status as CanonicalSermon["status"]) ?? "Draft",
    publishedAt:         publishedAt instanceof Date ||
                        typeof publishedAt === "string" ||
                        typeof publishedAt === "number"
      ? new Date(publishedAt).toISOString()
      : null,
    processingStage:     String(row.processing_stage ?? "idle"),
    processingError:     String(row.processing_error ?? ""),
    createdAt:           String(row.created_at),
    updatedAt:           String(row.updated_at),
    displayOrder:        Number(row.display_order ?? 0),
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

// ─── Extended type: includes companion linkage ────────────────────────────────

export interface CanonicalSermonWithCompanion extends CanonicalSermon {
  companionId: string | null;
  isCurrentWeek: boolean;
}

function rowToSermonWithCompanion(row: Record<string, unknown>): CanonicalSermonWithCompanion {
  return {
    ...rowToSermon(row),
    companionId: row.companion_id != null ? String(row.companion_id) : null,
    isCurrentWeek: row.is_current_week === true || row.is_current_week === "true",
  };
}

export async function getAllSermons(): Promise<CanonicalSermonWithCompanion[]> {
  // Explicitly select columns — intentionally exclude `transcript` and
  // `full_transcript`. These can be hundreds of kilobytes each and are not
  // needed for the admin list view; they are returned individually by
  // getSermonById() when the admin opens a specific sermon for editing.
  // Returning them here caused large response payloads that could trigger
  // serialization pressure or proxy timeouts in production.
  const result = await pool.query(
    `SELECT
       s.id, s.legacy_json_id, s.title, s.speaker, s.sermon_date,
       s.series, s.scripture_reference, s.scripture_book_ids, s.scripture_chapters,
       s.youtube_url, s.youtube_video_id, s.audio_path, s.notes,
       s.transcript_status, s.summary, s.themes, s.sections, s.keywords,
       s.main_theme, s.sermon_start_time, s.sermon_end_time,
       s.detection_confidence, s.detection_method,
       s.status, s.published_at, s.created_at, s.updated_at, s.display_order,
       s.processing_stage, s.processing_error,
       '' AS transcript,
       '' AS full_transcript,
       sc.id AS companion_id,
       COALESCE(sc.is_current_week, false) AS is_current_week
      FROM sermons s
      LEFT JOIN sermon_companion sc
        ON sc.sermon_uuid = s.id
        OR sc.sermon_id = s.id::text
        OR sc.sermon_id = s.legacy_json_id
      ORDER BY s.display_order ASC, s.created_at DESC`
  );
  return result.rows.map(rowToSermonWithCompanion);
}

export async function getSermonById(id: string): Promise<CanonicalSermon | null> {
  const result = await pool.query(
    `SELECT * FROM sermons WHERE id = $1`,
    [id]
  );
  return result.rows[0] ? rowToSermon(result.rows[0]) : null;
}

export async function getSermonByLegacyId(legacyId: string): Promise<CanonicalSermon | null> {
  const result = await pool.query(
    `SELECT * FROM sermons WHERE legacy_json_id = $1`,
    [legacyId]
  );
  return result.rows[0] ? rowToSermon(result.rows[0]) : null;
}

/**
 * Returns all published canonical sermons, ordered by most recent first.
 * Includes companion linkage so member clients can route to SermonHome correctly.
 * Used by Ask Emmaus retrieval and Preached Here.
 */
export async function listPublishedSermons(): Promise<CanonicalSermonWithCompanion[]> {
  // Explicit column list — excludes transcript/full_transcript (same reasoning as getAllSermons).
  const result = await pool.query(
    `SELECT
       s.id, s.legacy_json_id, s.title, s.speaker, s.sermon_date,
       s.series, s.scripture_reference, s.scripture_book_ids, s.scripture_chapters,
       s.youtube_url, s.youtube_video_id, s.audio_path, s.notes,
       s.transcript_status, s.summary, s.themes, s.sections, s.keywords,
       s.main_theme, s.sermon_start_time, s.sermon_end_time,
       s.detection_confidence, s.detection_method,
       s.status, s.published_at, s.created_at, s.updated_at, s.display_order,
       s.processing_stage, s.processing_error,
       '' AS transcript,
       '' AS full_transcript,
       sc.id AS companion_id,
       COALESCE(sc.is_current_week, false) AS is_current_week
      FROM sermons s
      LEFT JOIN sermon_companion sc
        ON sc.sermon_uuid = s.id
        OR sc.sermon_id = s.id::text
        OR sc.sermon_id = s.legacy_json_id
     WHERE s.status = 'Published'
      ORDER BY s.display_order ASC, s.published_at DESC NULLS LAST`
  );
  return result.rows.map(rowToSermonWithCompanion);
}

/**
 * Returns a single published sermon by UUID, with companion linkage.
 * Used by SermonHome member page.
 */
export async function getPublishedSermonById(id: string): Promise<CanonicalSermonWithCompanion | null> {
  const result = await pool.query(
    `SELECT s.*,
       (SELECT id FROM sermon_companion WHERE sermon_uuid = s.id LIMIT 1) AS companion_id
     FROM sermons s
     WHERE s.id = $1`,
    [id]
  );
  if (!result.rows[0]) return null;
  return rowToSermonWithCompanion(result.rows[0]);
}

/**
 * Returns the youtube_video_ids of all published canonical sermons.
 * Used by sermon-search.ts to suppress legacy archive duplicates.
 */
export async function getPublishedYoutubeVideoIds(): Promise<Set<string>> {
  const result = await pool.query(
    `SELECT youtube_video_id FROM sermons
     WHERE status = 'Published' AND youtube_video_id != ''`
  );
  return new Set(result.rows.map((r: Record<string, unknown>) => String(r.youtube_video_id)));
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function createSermon(data: CreateSermonData): Promise<CanonicalSermon> {
  const now = new Date().toISOString();
  const result = await pool.query(
    `INSERT INTO sermons (
       legacy_json_id, title, speaker, sermon_date, series, scripture_reference,
       scripture_book_ids, scripture_chapters, youtube_url, youtube_video_id,
       audio_path, notes, transcript, full_transcript, transcript_status, summary, themes,
       sections, keywords, main_theme, sermon_start_time, sermon_end_time,
       detection_confidence, detection_method, status, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$26
     ) RETURNING *`,
    [
      data.legacyJsonId ?? null,           // $1
      data.title,                           // $2
      data.speaker,                         // $3
      data.sermonDate,                      // $4
      data.series,                          // $5
      data.scriptureReference,              // $6
      JSON.stringify(data.scriptureBookIds ?? []),  // $7
      JSON.stringify(data.scriptureChapters ?? []), // $8
      data.youtubeUrl,                      // $9
      data.youtubeVideoId,                  // $10
      data.audioPath,                       // $11
      data.notes,                           // $12
      data.transcript,                      // $13 — sermon-section transcript
      data.fullTranscript ?? "",            // $14 — full recording transcript
      data.transcriptStatus,                // $15
      data.summary,                         // $16
      JSON.stringify(data.themes ?? []),    // $17
      JSON.stringify(data.sections ?? []), // $18
      JSON.stringify(data.keywords ?? []), // $19
      data.mainTheme,                       // $20
      data.sermonStartTime ?? "",           // $21
      data.sermonEndTime ?? "",             // $22
      data.detectionConfidence ?? 0,        // $23
      data.detectionMethod ?? "none",       // $24
      data.status,                          // $25
      now,                                  // $26 — created_at + updated_at
    ]
  );
  return rowToSermon(result.rows[0]);
}

export async function updateSermon(
  id: string,
  patch: UpdateSermonData
): Promise<CanonicalSermon | null> {
  // Build SET clause dynamically from only the provided keys
  const columnMap: Record<string, string> = {
    title:               "title",
    speaker:             "speaker",
    sermonDate:          "sermon_date",
    series:              "series",
    scriptureReference:  "scripture_reference",
    scriptureBookIds:    "scripture_book_ids",
    scriptureChapters:   "scripture_chapters",
    youtubeUrl:          "youtube_url",
    youtubeVideoId:      "youtube_video_id",
    audioPath:           "audio_path",
    notes:               "notes",
    transcript:          "transcript",
    fullTranscript:      "full_transcript",
    transcriptStatus:    "transcript_status",
    summary:             "summary",
    themes:              "themes",
    sections:            "sections",
    keywords:            "keywords",
    mainTheme:           "main_theme",
    sermonStartTime:     "sermon_start_time",
    sermonEndTime:       "sermon_end_time",
    detectionConfidence: "detection_confidence",
    detectionMethod:     "detection_method",
    status:              "status",
    publishedAt:         "published_at",
    processingStage:     "processing_stage",
    processingError:     "processing_error",
    displayOrder:        "display_order",
  };

  const jsonbCols = new Set(["scripture_book_ids", "scripture_chapters", "themes", "sections", "keywords"]);

  const setClauses: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  for (const [jsKey, colName] of Object.entries(columnMap)) {
    if (jsKey in patch) {
      const val = (patch as Record<string, unknown>)[jsKey];
      setClauses.push(`${colName} = $${idx}`);
      values.push(jsonbCols.has(colName) ? JSON.stringify(val) : val);
      idx++;
    }
  }

  if (setClauses.length === 0) {
    return getSermonById(id);
  }

  setClauses.push(`updated_at = $${idx}`);
  values.push(new Date().toISOString());
  idx++;
  values.push(id);

  const result = await pool.query(
    `UPDATE sermons SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
    values
  );
  return result.rows[0] ? rowToSermon(result.rows[0]) : null;
}

/**
 * Atomically update sermon fields and sync the knowledge index in one DB transaction.
 *
 * This is the single write path for all PATCH operations (title, speaker, scripture,
 * status changes, etc.) that must keep the knowledge index consistent.
 *
 * Index rules applied within the same transaction:
 *   - Final status = 'Published'          → UPSERT emmaus_knowledge_index
 *   - Final status = 'Draft' or 'Review'  → DELETE FROM emmaus_knowledge_index
 *
 * Companion-derived index fields (step_titles, step_content, prayer_themes) are
 * always preserved via CASE/COALESCE — only the companion publish endpoint may
 * overwrite them.
 *
 * If the transaction fails (including the index sync) the whole operation rolls back
 * so the sermon status and index are never left in an inconsistent state.
 */
export async function updateSermonLifecycle(
  id: string,
  patch: UpdateSermonData,
): Promise<CanonicalSermon | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Build SET clause dynamically (same column map as updateSermon) ────────
    const columnMap: Record<string, string> = {
      title:               "title",
      speaker:             "speaker",
      sermonDate:          "sermon_date",
      series:              "series",
      scriptureReference:  "scripture_reference",
      scriptureBookIds:    "scripture_book_ids",
      scriptureChapters:   "scripture_chapters",
      youtubeUrl:          "youtube_url",
      youtubeVideoId:      "youtube_video_id",
      audioPath:           "audio_path",
      notes:               "notes",
      transcript:          "transcript",
      fullTranscript:      "full_transcript",
      transcriptStatus:    "transcript_status",
      summary:             "summary",
      themes:              "themes",
      sections:            "sections",
      keywords:            "keywords",
      mainTheme:           "main_theme",
      sermonStartTime:     "sermon_start_time",
      sermonEndTime:       "sermon_end_time",
      detectionConfidence: "detection_confidence",
      detectionMethod:     "detection_method",
      status:              "status",
      publishedAt:         "published_at",
      processingStage:     "processing_stage",
      processingError:     "processing_error",
    };

    const jsonbCols = new Set([
      "scripture_book_ids", "scripture_chapters", "themes", "sections", "keywords",
    ]);

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const [jsKey, colName] of Object.entries(columnMap)) {
      if (jsKey in patch) {
        const val = (patch as Record<string, unknown>)[jsKey];
        setClauses.push(`${colName} = $${idx}`);
        values.push(jsonbCols.has(colName) ? JSON.stringify(val) : val);
        idx++;
      }
    }

    if (setClauses.length === 0) {
      await client.query("ROLLBACK");
      return getSermonById(id);
    }

    setClauses.push(`updated_at = $${idx}`);
    values.push(new Date().toISOString());
    idx++;
    values.push(id);

    const updateResult = await client.query(
      `UPDATE sermons SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values,
    );

    if (!updateResult.rows[0]) {
      await client.query("ROLLBACK");
      return null;
    }

    const sermon = rowToSermon(updateResult.rows[0]);

    // ── Sync knowledge index within the same transaction ─────────────────────
    if (sermon.status === "Published") {
      // Sermon is Published in this transaction — upsert directly, no conditional
      // check needed. Companion-derived fields preserved via CASE/COALESCE.
      await client.query(
        `INSERT INTO emmaus_knowledge_index (
           sermon_id, companion_id, title, speaker, sermon_date, series,
           scripture_reference, scripture_book_ids, scripture_chapters,
           themes, keywords, main_theme, summary,
           step_titles, step_content, prayer_themes,
           youtube_url, audio_path, published_at,
           indexed_at, updated_at
         ) VALUES (
           $1, NULL, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb,
           $9::jsonb, $10::jsonb, $11, $12,
           '[]'::jsonb, '', '',
           $13, $14, $15,
           NOW(), NOW()
         )
         ON CONFLICT (sermon_id) DO UPDATE SET
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
           companion_id        = COALESCE(emmaus_knowledge_index.companion_id, EXCLUDED.companion_id),
           step_titles         = CASE WHEN emmaus_knowledge_index.step_titles::text = '[]' OR emmaus_knowledge_index.step_titles IS NULL
                                      THEN '[]'::jsonb ELSE emmaus_knowledge_index.step_titles END,
           step_content        = CASE WHEN COALESCE(emmaus_knowledge_index.step_content, '') = ''
                                      THEN '' ELSE emmaus_knowledge_index.step_content END,
           prayer_themes       = CASE WHEN COALESCE(emmaus_knowledge_index.prayer_themes, '') = ''
                                      THEN '' ELSE emmaus_knowledge_index.prayer_themes END`,
        [
          sermon.id,
          sermon.title,
          sermon.speaker,
          sermon.sermonDate,
          sermon.series,
          sermon.scriptureReference,
          JSON.stringify(sermon.scriptureBookIds),
          JSON.stringify(sermon.scriptureChapters),
          JSON.stringify(sermon.themes),
          JSON.stringify(sermon.keywords),
          sermon.mainTheme,
          sermon.summary,
          sermon.youtubeUrl,
          sermon.audioPath,
          sermon.publishedAt,
        ],
      );
      logger.info({ sermonId: id }, "sermon-lifecycle: knowledge index upserted (Published)");
    } else {
      // Draft or Review: not visible to members — remove from index.
      // DELETE is safe to call even when no row exists (0 rows affected is fine).
      await client.query(
        "DELETE FROM emmaus_knowledge_index WHERE sermon_id = $1",
        [id],
      );
      logger.info({ sermonId: id, status: sermon.status }, "sermon-lifecycle: knowledge index cleared (non-Published)");
    }

    await client.query("COMMIT");
    return sermon;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Publish a canonical sermon atomically.
 * Delegates to updateSermonLifecycle so the status update and knowledge index
 * upsert happen in a single DB transaction.
 */
export async function publishSermon(id: string): Promise<CanonicalSermon | null> {
  const now = new Date().toISOString();
  const sermon = await updateSermonLifecycle(id, { status: "Published", publishedAt: now });
  if (sermon) {
    logger.info({ sermonId: id, title: sermon.title }, "Canonical sermon published");
  }
  return sermon;
}

/**
 * Unpublish a canonical sermon atomically.
 *
 * Delegates to updateSermonLifecycle so the status update (Draft) and
 * knowledge index removal happen in a single DB transaction. If the index
 * removal fails the whole transaction rolls back — the caller receives an
 * error they can retry, and the sermon is never left with status=Draft while
 * the index entry remains.
 */
export async function unpublishSermon(id: string): Promise<CanonicalSermon | null> {
  return updateSermonLifecycle(id, { status: "Draft", publishedAt: null });
}

export async function deleteSermon(id: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM sermons WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rowCount != null && result.rowCount > 0;
}

/**
 * Atomically delete a canonical sermon and all its associated companion data
 * (sermon_companion, entries, progress) in a single transaction.
 *
 * Use this instead of separate deleteSermonCompanionContent + deleteSermon calls
 * to guarantee the DB is never left in a state where the companion is gone but
 * the sermon record remains visible (or vice-versa).
 */
export async function deleteSermonFully(sermonId: string): Promise<{ deleted: boolean; companionId: string | null }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Resolve companion UUID inside the transaction for consistency
    const companionRes = await client.query(
      "SELECT id FROM sermon_companion WHERE sermon_uuid = $1 LIMIT 1",
      [sermonId]
    );
    const companionId: string | null = companionRes.rows[0]?.id ?? null;

    if (companionId) {
      await client.query("DELETE FROM sermon_companion_progress WHERE companion_id = $1", [companionId]);
      await client.query("DELETE FROM sermon_companion_entry   WHERE companion_id = $1", [companionId]);
      await client.query("DELETE FROM sermon_companion         WHERE id = $1",            [companionId]);
    }

    const sermonRes = await client.query(
      "DELETE FROM sermons WHERE id = $1 RETURNING id",
      [sermonId]
    );

    // Remove from knowledge index in the same transaction. If this fails the
    // sermon delete also rolls back, keeping DB and index consistent.
    await client.query(
      "DELETE FROM emmaus_knowledge_index WHERE sermon_id = $1",
      [sermonId]
    );

    await client.query("COMMIT");

    return {
      deleted:     (sermonRes.rowCount ?? 0) > 0,
      companionId,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Upsert by legacy_json_id — used during JSON migration.
 * Uses explicit SELECT + INSERT/UPDATE to avoid relying on ON CONFLICT index
 * availability during the migration boot window.
 */
export async function upsertByLegacyId(data: CreateSermonData & { legacyJsonId: string }): Promise<CanonicalSermon> {
  const now = new Date().toISOString();
  const existing = await getSermonByLegacyId(data.legacyJsonId);

  if (existing) {
    // Preserve richer values already in DB (don't overwrite transcript/summary with blank)
    const result = await pool.query(
      `UPDATE sermons SET
         title               = $2,
         speaker             = $3,
         sermon_date         = $4,
         series              = $5,
         scripture_reference = $6,
         scripture_book_ids  = $7,
         scripture_chapters  = $8,
         youtube_url         = $9,
         youtube_video_id    = $10,
         transcript          = CASE WHEN $11 = '' THEN transcript ELSE $11 END,
         transcript_status   = $12,
         summary             = CASE WHEN $13 = '' THEN summary ELSE $13 END,
         themes              = $14,
         keywords            = $15,
         main_theme          = CASE WHEN $16 = '' THEN main_theme ELSE $16 END,
         status              = $17,
         updated_at          = $18
       WHERE legacy_json_id = $1
       RETURNING *`,
      [
        data.legacyJsonId,
        data.title,
        data.speaker,
        data.sermonDate,
        data.series,
        data.scriptureReference,
        JSON.stringify(data.scriptureBookIds ?? []),
        JSON.stringify(data.scriptureChapters ?? []),
        data.youtubeUrl,
        data.youtubeVideoId,
        data.transcript ?? "",
        data.transcriptStatus ?? "none",
        data.summary ?? "",
        JSON.stringify(data.themes ?? []),
        JSON.stringify(data.keywords ?? []),
        data.mainTheme ?? "",
        data.status ?? "Draft",
        now,
      ]
    );
    return rowToSermon(result.rows[0]);
  }

  // No existing record — insert fresh (detection fields default to empty)
  const result = await pool.query(
    `INSERT INTO sermons (
       legacy_json_id, title, speaker, sermon_date, series, scripture_reference,
       scripture_book_ids, scripture_chapters, youtube_url, youtube_video_id,
       audio_path, notes, transcript, full_transcript, transcript_status, summary, themes,
       sections, keywords, main_theme, sermon_start_time, sermon_end_time,
       detection_confidence, detection_method, status, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$26
     ) RETURNING *`,
    [
      data.legacyJsonId,
      data.title,
      data.speaker,
      data.sermonDate,
      data.series,
      data.scriptureReference,
      JSON.stringify(data.scriptureBookIds ?? []),
      JSON.stringify(data.scriptureChapters ?? []),
      data.youtubeUrl,
      data.youtubeVideoId,
      data.audioPath ?? "",
      data.notes ?? "",
      data.transcript ?? "",
      data.fullTranscript ?? "",
      data.transcriptStatus ?? "none",
      data.summary ?? "",
      JSON.stringify(data.themes ?? []),
      JSON.stringify(data.sections ?? []),
      JSON.stringify(data.keywords ?? []),
      data.mainTheme ?? "",
      data.sermonStartTime ?? "",
      data.sermonEndTime ?? "",
      data.detectionConfidence ?? 0,
      data.detectionMethod ?? "none",
      data.status ?? "Draft",
      now,
    ]
  );
  return rowToSermon(result.rows[0]);
}
