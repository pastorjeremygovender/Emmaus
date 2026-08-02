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
  transcript: string;
  transcriptStatus: "none" | "pending" | "complete";
  summary: string;
  themes: string[];
  sections: SermonSection[];
  keywords: string[];
  mainTheme: string;
  status: "Draft" | "Review" | "Published";
  publishedAt: string | null;    // ISO timestamp
  createdAt: string;
  updatedAt: string;
}

export interface SermonSection {
  timestampSeconds: number;
  label: string;
  summary?: string;
}

export type CreateSermonData = Omit<CanonicalSermon, "id" | "createdAt" | "updatedAt" | "publishedAt">;
export type UpdateSermonData = Partial<Omit<CanonicalSermon, "id" | "createdAt">>;

// ─── Row → Domain ─────────────────────────────────────────────────────────────

function rowToSermon(row: Record<string, unknown>): CanonicalSermon {
  return {
    id:                 String(row.id),
    legacyJsonId:       row.legacy_json_id != null ? String(row.legacy_json_id) : null,
    title:              String(row.title ?? ""),
    speaker:            String(row.speaker ?? ""),
    sermonDate:         String(row.sermon_date ?? ""),
    series:             String(row.series ?? ""),
    scriptureReference: String(row.scripture_reference ?? ""),
    scriptureBookIds:   (row.scripture_book_ids as string[]) ?? [],
    scriptureChapters:  (row.scripture_chapters as number[]) ?? [],
    youtubeUrl:         String(row.youtube_url ?? ""),
    youtubeVideoId:     String(row.youtube_video_id ?? ""),
    audioPath:          String(row.audio_path ?? ""),
    notes:              String(row.notes ?? ""),
    transcript:         String(row.transcript ?? ""),
    transcriptStatus:   (row.transcript_status as CanonicalSermon["transcriptStatus"]) ?? "none",
    summary:            String(row.summary ?? ""),
    themes:             (row.themes as string[]) ?? [],
    sections:           (row.sections as SermonSection[]) ?? [],
    keywords:           (row.keywords as string[]) ?? [],
    mainTheme:          String(row.main_theme ?? ""),
    status:             (row.status as CanonicalSermon["status"]) ?? "Draft",
    publishedAt:        row.published_at != null ? String(row.published_at) : null,
    createdAt:          String(row.created_at),
    updatedAt:          String(row.updated_at),
  };
}

// ─── Read ─────────────────────────────────────────────────────────────────────

// ─── Extended type: includes companion linkage ────────────────────────────────

export interface CanonicalSermonWithCompanion extends CanonicalSermon {
  companionId: string | null;
}

function rowToSermonWithCompanion(row: Record<string, unknown>): CanonicalSermonWithCompanion {
  return {
    ...rowToSermon(row),
    companionId: row.companion_id != null ? String(row.companion_id) : null,
  };
}

export async function getAllSermons(): Promise<CanonicalSermonWithCompanion[]> {
  const result = await pool.query(
    `SELECT s.*,
       (SELECT id FROM sermon_companion WHERE sermon_uuid = s.id LIMIT 1) AS companion_id
     FROM sermons s
     ORDER BY s.created_at DESC`
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
 * Used by Ask Emmaus retrieval and Preached Here.
 */
export async function listPublishedSermons(): Promise<CanonicalSermon[]> {
  const result = await pool.query(
    `SELECT * FROM sermons WHERE status = 'Published' ORDER BY published_at DESC NULLS LAST`
  );
  return result.rows.map(rowToSermon);
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
       audio_path, notes, transcript, transcript_status, summary, themes,
       sections, keywords, main_theme, status, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21
     ) RETURNING *`,
    [
      data.legacyJsonId ?? null,
      data.title,
      data.speaker,
      data.sermonDate,
      data.series,
      data.scriptureReference,
      JSON.stringify(data.scriptureBookIds ?? []),
      JSON.stringify(data.scriptureChapters ?? []),
      data.youtubeUrl,
      data.youtubeVideoId,
      data.audioPath,
      data.notes,
      data.transcript,
      data.transcriptStatus,
      data.summary,
      JSON.stringify(data.themes ?? []),
      JSON.stringify(data.sections ?? []),
      JSON.stringify(data.keywords ?? []),
      data.mainTheme,
      data.status,
      now,
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
    title:              "title",
    speaker:            "speaker",
    sermonDate:         "sermon_date",
    series:             "series",
    scriptureReference: "scripture_reference",
    scriptureBookIds:   "scripture_book_ids",
    scriptureChapters:  "scripture_chapters",
    youtubeUrl:         "youtube_url",
    youtubeVideoId:     "youtube_video_id",
    audioPath:          "audio_path",
    notes:              "notes",
    transcript:         "transcript",
    transcriptStatus:   "transcript_status",
    summary:            "summary",
    themes:             "themes",
    sections:           "sections",
    keywords:           "keywords",
    mainTheme:          "main_theme",
    status:             "status",
    publishedAt:        "published_at",
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
 * Publish a canonical sermon atomically.
 * Sets status = 'Published', records published_at, and links the companion
 * (sermon_companion) if one exists via the sermon_uuid FK.
 */
export async function publishSermon(id: string): Promise<CanonicalSermon | null> {
  const now = new Date().toISOString();
  const result = await pool.query(
    `UPDATE sermons SET status = 'Published', published_at = $1, updated_at = $1
     WHERE id = $2 RETURNING *`,
    [now, id]
  );
  if (!result.rows[0]) return null;
  const sermon = rowToSermon(result.rows[0]);
  logger.info({ sermonId: id, title: sermon.title }, "Canonical sermon published");
  return sermon;
}

export async function unpublishSermon(id: string): Promise<CanonicalSermon | null> {
  const result = await pool.query(
    `UPDATE sermons SET status = 'Draft', published_at = NULL, updated_at = $1
     WHERE id = $2 RETURNING *`,
    [new Date().toISOString(), id]
  );
  return result.rows[0] ? rowToSermon(result.rows[0]) : null;
}

export async function deleteSermon(id: string): Promise<boolean> {
  const result = await pool.query(
    `DELETE FROM sermons WHERE id = $1 RETURNING id`,
    [id]
  );
  return result.rowCount != null && result.rowCount > 0;
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

  // No existing record — insert fresh
  const result = await pool.query(
    `INSERT INTO sermons (
       legacy_json_id, title, speaker, sermon_date, series, scripture_reference,
       scripture_book_ids, scripture_chapters, youtube_url, youtube_video_id,
       audio_path, notes, transcript, transcript_status, summary, themes,
       sections, keywords, main_theme, status, created_at, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$21
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
      data.transcriptStatus ?? "none",
      data.summary ?? "",
      JSON.stringify(data.themes ?? []),
      JSON.stringify(data.sections ?? []),
      JSON.stringify(data.keywords ?? []),
      data.mainTheme ?? "",
      data.status ?? "Draft",
      now,
    ]
  );
  return rowToSermon(result.rows[0]);
}
