/**
 * One-time backfill script: populate emmaus_knowledge_index for all
 * Published sermon companions that were published before the automatic
 * upsert-on-publish logic was added.
 *
 * WHAT IT DOES:
 *   1. Fetches every Published sermon companion (with Published entries).
 *   2. For each companion, resolves the linked canonical sermon (via sermon_uuid).
 *   3. Assembles an enriched KnowledgeIndexEntry — same shape the publish route
 *      produces — and upserts it into emmaus_knowledge_index (ON CONFLICT DO UPDATE).
 *   4. Also indexes Published canonical sermons that have NO companion yet, so
 *      Ask Emmaus can find them by sermon metadata alone.
 *
 * SAFETY:
 *   - Idempotent: uses ON CONFLICT (sermon_id) DO UPDATE, so re-running is always safe.
 *   - Non-destructive: only writes to emmaus_knowledge_index; never touches
 *     sermons or companion tables.
 *   - Blocked in production unless ALLOW_BACKFILL_IN_PRODUCTION=true is set.
 *
 * USAGE (development):
 *   pnpm --filter @workspace/api-server run backfill:knowledge-index
 *
 * USAGE (production — requires explicit opt-in):
 *   ALLOW_BACKFILL_IN_PRODUCTION=true node --experimental-strip-types \
 *     src/scripts/backfill-knowledge-index.ts
 */

const isProd = process.env.NODE_ENV === "production";
const allowProd = process.env.ALLOW_BACKFILL_IN_PRODUCTION === "true";

if (isProd && !allowProd) {
  console.error(`
[backfill-knowledge-index] BLOCKED: NODE_ENV=production detected.
  This script writes to emmaus_knowledge_index.
  To run intentionally on production data, set:
    ALLOW_BACKFILL_IN_PRODUCTION=true node --experimental-strip-types src/scripts/backfill-knowledge-index.ts
`);
  process.exit(1);
}

import { pool } from "@workspace/db";

// ─── Inline upsert (mirrors upsertKnowledgeIndex in sermon-knowledge-index.ts) ─

async function upsertEntry(entry: {
  sermonId: string;
  companionId: string | null;
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
  stepTitles: string[];
  stepContent: string;
  prayerThemes: string;
  youtubeUrl: string;
  audioPath: string;
  publishedAt: string | null;
}): Promise<void> {
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
      entry.companionId,
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
}

function safeArr<T>(val: unknown): T[] {
  return Array.isArray(val) ? (val as T[]) : [];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log("[backfill-knowledge-index] Starting…\n");

// ── Phase 1: Published companions linked to canonical sermons ─────────────────

const companionsRes = await pool.query(`
  SELECT
    sc.id              AS companion_id,
    sc.published_at    AS companion_published_at,
    s.id               AS sermon_id,
    s.title            AS title,
    s.speaker          AS speaker,
    s.sermon_date      AS sermon_date,
    s.series           AS series,
    s.scripture_reference  AS scripture_reference,
    s.scripture_book_ids   AS scripture_book_ids,
    s.scripture_chapters   AS scripture_chapters,
    s.themes           AS themes,
    s.keywords         AS keywords,
    s.main_theme       AS main_theme,
    s.summary          AS summary,
    s.youtube_url      AS youtube_url,
    s.audio_path       AS audio_path
  FROM sermon_companion sc
  JOIN sermons s ON s.id = sc.sermon_uuid
  WHERE sc.status = 'Published'
    AND EXISTS (
      SELECT 1 FROM sermon_companion_entry sce
      WHERE sce.companion_id = sc.id AND sce.status = 'Published'
    )
  ORDER BY sc.published_at ASC NULLS LAST
`);

console.log(`Phase 1 — Found ${companionsRes.rowCount} Published companion(s) linked to canonical sermons.`);

let companionIndexed = 0;
let companionFailed  = 0;

for (const row of companionsRes.rows) {
  const companionId = String(row.companion_id);
  const sermonId    = String(row.sermon_id);

  // Fetch Published entries for this companion (same fields used in publish route)
  const entriesRes = await pool.query(
    `SELECT title, greeting, reflection, prayer, next_step, closing
     FROM sermon_companion_entry
     WHERE companion_id = $1 AND status = 'Published'
     ORDER BY day_number ASC`,
    [companionId],
  );

  const entries = entriesRes.rows;

  const stepTitles = entries
    .map((e: Record<string, unknown>) => String(e.title ?? ""))
    .filter(Boolean);

  const stepContent = entries
    .map((e: Record<string, unknown>) =>
      [e.greeting, e.reflection, e.next_step, e.closing]
        .map((v) => String(v ?? ""))
        .filter(Boolean)
        .join(" "),
    )
    .join(" ");

  const prayerThemes = entries
    .map((e: Record<string, unknown>) => String(e.prayer ?? ""))
    .filter(Boolean)
    .join(" ");

  try {
    await upsertEntry({
      sermonId,
      companionId,
      title:              String(row.title ?? ""),
      speaker:            String(row.speaker ?? ""),
      sermonDate:         String(row.sermon_date ?? ""),
      series:             String(row.series ?? ""),
      scriptureReference: String(row.scripture_reference ?? ""),
      scriptureBookIds:   safeArr<string>(row.scripture_book_ids),
      scriptureChapters:  safeArr<number>(row.scripture_chapters),
      themes:             safeArr<string>(row.themes),
      keywords:           safeArr<string>(row.keywords),
      mainTheme:          String(row.main_theme ?? ""),
      summary:            String(row.summary ?? ""),
      stepTitles,
      stepContent,
      prayerThemes,
      youtubeUrl:         String(row.youtube_url ?? ""),
      audioPath:          String(row.audio_path ?? ""),
      publishedAt:        row.companion_published_at
                          ? (row.companion_published_at instanceof Date
                              ? row.companion_published_at.toISOString()
                              : String(row.companion_published_at))
                          : null,
    });
    console.log(`  ✓ companion ${companionId} → "${row.title}" (${stepTitles.length} step(s))`);
    companionIndexed++;
  } catch (err) {
    console.error(`  ✗ companion ${companionId} FAILED:`, err);
    companionFailed++;
  }
}

// ── Phase 2: Published sermons with no index row yet ─────────────────────────

const sermonOnlyRes = await pool.query(`
  SELECT
    s.id               AS id,
    s.title            AS title,
    s.speaker          AS speaker,
    s.sermon_date      AS sermon_date,
    s.series           AS series,
    s.scripture_reference  AS scripture_reference,
    s.scripture_book_ids   AS scripture_book_ids,
    s.scripture_chapters   AS scripture_chapters,
    s.themes           AS themes,
    s.keywords         AS keywords,
    s.main_theme       AS main_theme,
    s.summary          AS summary,
    s.youtube_url      AS youtube_url,
    s.audio_path       AS audio_path,
    s.published_at     AS published_at
  FROM sermons s
  WHERE s.status = 'Published'
    AND NOT EXISTS (
      SELECT 1 FROM emmaus_knowledge_index ki WHERE ki.sermon_id::text = s.id::text
    )
  ORDER BY s.published_at ASC NULLS LAST
`);

console.log(`\nPhase 2 — Found ${sermonOnlyRes.rowCount} Published sermon(s) not yet in the index.`);

let sermonIndexed = 0;
let sermonFailed  = 0;

for (const row of sermonOnlyRes.rows) {
  const sermonId = String(row.id);
  try {
    await upsertEntry({
      sermonId,
      companionId:        null,
      title:              String(row.title ?? ""),
      speaker:            String(row.speaker ?? ""),
      sermonDate:         String(row.sermon_date ?? ""),
      series:             String(row.series ?? ""),
      scriptureReference: String(row.scripture_reference ?? ""),
      scriptureBookIds:   safeArr<string>(row.scripture_book_ids),
      scriptureChapters:  safeArr<number>(row.scripture_chapters),
      themes:             safeArr<string>(row.themes),
      keywords:           safeArr<string>(row.keywords),
      mainTheme:          String(row.main_theme ?? ""),
      summary:            String(row.summary ?? ""),
      stepTitles:         [],
      stepContent:        "",
      prayerThemes:       "",
      youtubeUrl:         String(row.youtube_url ?? ""),
      audioPath:          String(row.audio_path ?? ""),
      publishedAt:        row.published_at ? String(row.published_at) : null,
    });
    console.log(`  ✓ sermon-only "${row.title}" (${sermonId})`);
    sermonIndexed++;
  } catch (err) {
    console.error(`  ✗ sermon ${sermonId} FAILED:`, err);
    sermonFailed++;
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`
[backfill-knowledge-index] Done.
  Companions indexed : ${companionIndexed}  (failed: ${companionFailed})
  Sermons indexed    : ${sermonIndexed}     (failed: ${sermonFailed})
  Total rows written : ${companionIndexed + sermonIndexed}
`);

await pool.end().catch(() => {});

if (companionFailed + sermonFailed > 0) {
  console.error("[backfill-knowledge-index] Some entries failed — check logs above.");
  process.exit(1);
}
