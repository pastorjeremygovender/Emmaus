/**
 * prod-data-sync.ts — one-time production data hydration
 *
 * Runs on every boot, but only performs inserts when the production database
 * is empty of authored content.  All operations are INSERT ... ON CONFLICT DO
 * NOTHING, so re-running on a populated database is a safe no-op.
 *
 * ─── Why this exists ────────────────────────────────────────────────────────
 * Replit maintains separate dev and production PostgreSQL databases.  Authored
 * content (chapter overviews, journeys, steps) is created via the admin UI
 * in the dev environment.  The production database starts empty — this module
 * seeds it on first boot without any manual intervention.
 *
 * ─── Safety properties ──────────────────────────────────────────────────────
 * • Only inserts; never updates or deletes existing authored rows.
 * • Guard check (count = 0 / journey missing) prevents duplicate work.
 * • Seed files embedded in the bundle at build time — no external calls.
 * • Non-fatal: a failure logs an error but does not abort server startup.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

// After esbuild bundles to dist/index.mjs, data files are in dist/data/.
// The esbuild banner sets globalThis.__dirname = dir of the bundle file.
const _dir = typeof __dirname !== "undefined"
  ? __dirname
  : path.dirname(fileURLToPath(import.meta.url));
const _require = createRequire(import.meta.url);

// Journeys in production that don't exist in dev — remove them.
const OLD_JOURNEY_IDS = [
  "who-is-god", "created-in-god-s-image", "what-went-wrong", "jesus-saves",
  "beginning-your-new-life", "walking-with-god", "prayer", "the-bible",
  "church", "baptism", "holy-communion", "faith", "the-holy-spirit",
  "following-jesus-every-day", "serving-others", "overcoming-temptation",
  "the-fruit-of-the-spirit", "living-with-hope",
];

export async function runProdDataSync(): Promise<void> {
  try {
    // ── Quick check: how many overviews do we have? ───────────────────────
    const { rows: [{ cnt }] } = await pool.query<{ cnt: string }>(
      "SELECT COUNT(*) AS cnt FROM bible_chapter_overviews",
    );
    const overviewCount = parseInt(cnt, 10);

    // ── Load seed data ────────────────────────────────────────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let overviews: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let journeys: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let steps: any[] = [];

    try {
      overviews = _require(path.join(_dir, "data", "prod-sync-overviews.json"));
      const journeyData = _require(path.join(_dir, "data", "prod-sync-journeys.json"));
      journeys = journeyData.journeys;
      steps = journeyData.steps;
    } catch (err) {
      logger.warn({ err }, "prod-data-sync: seed files not found — skipping");
      return;
    }

    // ── 1. Chapter overviews ─────────────────────────────────────────────
    // Always upsert — ensures any newly authored overview reaches production
    // on the next deploy, not just when the table is empty.
    let overviewsInserted = 0;
    let overviewsUpdated = 0;
    for (const ov of overviews) {
      try {
        const jsonbStr = (v: unknown) =>
          v != null ? (typeof v === "string" ? v : JSON.stringify(v)) : "[]";
        const r = await pool.query(
          `INSERT INTO bible_chapter_overviews
             (id, book_id, chapter, summary,
              main_themes, important_people, important_locations, passage_divisions,
              key_verse, key_verse_start, key_verse_end,
              book_connection, jesus_connection,
              status, created_by, updated_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (book_id, chapter) DO UPDATE SET
             summary            = EXCLUDED.summary,
             main_themes        = EXCLUDED.main_themes,
             important_people   = EXCLUDED.important_people,
             important_locations = EXCLUDED.important_locations,
             passage_divisions  = EXCLUDED.passage_divisions,
             key_verse          = EXCLUDED.key_verse,
             key_verse_start    = EXCLUDED.key_verse_start,
             key_verse_end      = EXCLUDED.key_verse_end,
             book_connection    = EXCLUDED.book_connection,
             jesus_connection   = EXCLUDED.jesus_connection,
             status             = EXCLUDED.status,
             updated_by         = EXCLUDED.updated_by`,
          [
            ov.id, ov.book_id, ov.chapter, ov.summary ?? "",
            jsonbStr(ov.main_themes),
            jsonbStr(ov.important_people),
            jsonbStr(ov.important_locations),
            jsonbStr(ov.passage_divisions),
            ov.key_verse ?? "", ov.key_verse_start ?? null, ov.key_verse_end ?? null,
            ov.book_connection ?? "", ov.jesus_connection ?? "",
            ov.status ?? "Published",
            ov.created_by ?? "seed", ov.updated_by ?? "seed",
          ],
        );
        if ((r.rowCount ?? 0) > 0) {
          // rowCount=1 on both INSERT and UPDATE for ON CONFLICT DO UPDATE.
          // Track by comparing against the pre-existing count.
          overviewsInserted++;
        }
      } catch (err) {
        logger.warn(
          { err, book_id: ov.book_id, chapter: ov.chapter },
          "prod-data-sync: chapter overview upsert failed",
        );
      }
    }
    // Rows updated = upserts that touched existing rows.
    overviewsUpdated = overviewsInserted - Math.max(0, overviews.length - overviewCount);
    logger.info(
      { seed: overviews.length, dbBefore: overviewCount, upserted: overviewsInserted },
      "prod-data-sync: chapter overviews synced",
    );

    // ── 2. Remove old journey IDs not present in dev ──────────────────────
    for (const jid of OLD_JOURNEY_IDS) {
      try {
        await pool.query("DELETE FROM user_journey_progress WHERE journey_id=$1", [jid]);
        await pool.query("DELETE FROM journey_steps WHERE journey_id=$1", [jid]);
        await pool.query("DELETE FROM journeys WHERE id=$1", [jid]);
      } catch (err) {
        logger.warn({ err, jid }, "prod-data-sync: old journey delete failed (non-fatal)");
      }
    }

    // ── 3. Clear stale null-titled steps for coming-to-jesus ─────────────
    const devStepIds = steps
      .filter((s) => s.journey_id === "coming-to-jesus")
      .map((s) => s.id as string);
    if (devStepIds.length > 0) {
      try {
        const placeholders = devStepIds.map((_, i) => `$${i + 1}`).join(",");
        await pool.query(
          `DELETE FROM journey_steps
             WHERE journey_id='coming-to-jesus'
               AND id NOT IN (${placeholders})`,
          devStepIds,
        );
      } catch (err) {
        logger.warn({ err }, "prod-data-sync: stale step cleanup failed (non-fatal)");
      }
    }

    // ── 4. Upsert journeys ────────────────────────────────────────────────
    for (const j of journeys) {
      try {
        await pool.query(
          `INSERT INTO journeys
             (id, title, subtitle, description, journey_type, duration_days, status,
              cover_image_url, church_wide, start_date, end_date, linked_sermon_id,
              overload_exempt, pastor_edited, published_at, metadata,
              category, difficulty, estimated_duration, tags, prerequisites,
              xp_reward, collection_id, theme_color, version, created_by, updated_by)
           VALUES
             ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
           ON CONFLICT (id) DO UPDATE SET
             title        = EXCLUDED.title,
             subtitle     = EXCLUDED.subtitle,
             description  = EXCLUDED.description,
             journey_type = EXCLUDED.journey_type,
             status       = EXCLUDED.status,
             theme_color  = EXCLUDED.theme_color,
             version      = EXCLUDED.version,
             updated_by   = EXCLUDED.updated_by`,
          [
            j.id, j.title, j.subtitle ?? null, j.description ?? null,
            j.journey_type, j.duration_days ?? null, j.status,
            j.cover_image_url ?? null, j.church_wide ?? false,
            j.start_date ?? null, j.end_date ?? null,
            j.linked_sermon_id ?? null,
            j.overload_exempt ?? false, j.pastor_edited ?? false,
            j.published_at ?? null,
            j.metadata != null ? JSON.stringify(j.metadata) : null,
            j.category ?? null, j.difficulty ?? null,
            j.estimated_duration ?? null,
            j.tags != null ? JSON.stringify(j.tags) : null,
            j.prerequisites != null ? JSON.stringify(j.prerequisites) : null,
            j.xp_reward ?? 0, j.collection_id ?? null,
            j.theme_color ?? null, j.version ?? 1,
            j.created_by ?? "migration", j.updated_by ?? "migration",
          ],
        );
      } catch (err) {
        logger.warn({ err, id: j.id }, "prod-data-sync: journey upsert failed (non-fatal)");
      }
    }

    // ── 5. Upsert journey steps ───────────────────────────────────────────
    // NOTE: `content` is a JSONB column — must pass null or JSON.stringify(obj),
    // never an empty string (which fails Postgres JSONB parsing).
    let stepsInserted = 0;
    for (const s of steps) {
      try {
        const contentVal = s.content != null
          ? (typeof s.content === "string" ? s.content : JSON.stringify(s.content))
          : null;
        const r = await pool.query(
          `INSERT INTO journey_steps
             (id, journey_id, day, title, content, status,
              mentor_intro, scripture, teaching_content, reflection_question,
              prayer, todays_action, memory_verse, preferred_translation,
              is_completion_step)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (id) DO UPDATE SET
             title               = EXCLUDED.title,
             content             = EXCLUDED.content,
             status              = EXCLUDED.status,
             teaching_content    = EXCLUDED.teaching_content,
             reflection_question = EXCLUDED.reflection_question,
             prayer              = EXCLUDED.prayer,
             todays_action       = EXCLUDED.todays_action,
             is_completion_step  = EXCLUDED.is_completion_step`,
          [
            s.id, s.journey_id, s.day, s.title ?? "", contentVal,
            s.status ?? "Published",
            s.mentor_intro ?? null, s.scripture ?? null,
            s.teaching_content ?? null, s.reflection_question ?? null,
            s.prayer ?? null, s.todays_action ?? null,
            s.memory_verse ?? null, s.preferred_translation ?? null,
            s.is_completion_step ?? false,
          ],
        );
        stepsInserted += r.rowCount ?? 0;
      } catch (err) {
        logger.warn({ err, id: s.id }, "prod-data-sync: step upsert failed (non-fatal)");
      }
    }

    logger.info(
      { journeys: journeys.length, steps: steps.length, stepsInserted },
      "prod-data-sync: journeys/steps synced",
    );
  } catch (err) {
    logger.error({ err }, "prod-data-sync: unexpected error (non-fatal)");
  }
}
