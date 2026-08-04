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
}

export interface KnowledgeIndexResult extends KnowledgeIndexEntry {
  score: number;
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

/**
 * Insert or update the knowledge index entry for the given sermon.
 *
 * Safe to call multiple times — uses ON CONFLICT (sermon_id) DO UPDATE.
 * Non-fatal: logs a warning on failure so publish is never blocked.
 */
export async function upsertKnowledgeIndex(entry: KnowledgeIndexEntry): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO emmaus_knowledge_index (
         sermon_id, companion_id, title, speaker, sermon_date, series,
         scripture_reference, scripture_book_ids, scripture_chapters,
         themes, keywords, main_theme, summary,
         step_titles, step_content, prayer_themes,
         youtube_url, audio_path, published_at,
         indexed_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,NOW(),NOW())
       ON CONFLICT (sermon_id) DO UPDATE SET
         companion_id        = EXCLUDED.companion_id,
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
         step_titles         = EXCLUDED.step_titles,
         step_content        = EXCLUDED.step_content,
         prayer_themes       = EXCLUDED.prayer_themes,
         youtube_url         = EXCLUDED.youtube_url,
         audio_path          = EXCLUDED.audio_path,
         published_at        = EXCLUDED.published_at,
         updated_at          = NOW()`,
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
      ],
    );
    logger.info(
      { sermonId: entry.sermonId, companionId: entry.companionId ?? null },
      "knowledge-index: upserted",
    );
  } catch (err) {
    logger.warn({ err, sermonId: entry.sermonId }, "knowledge-index: upsert failed (non-fatal)");
  }
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
    const res = await pool.query(`SELECT * FROM emmaus_knowledge_index`);
    rows = res.rows;
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
