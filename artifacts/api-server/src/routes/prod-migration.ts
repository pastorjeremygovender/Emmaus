/**
 * ONE-TIME production data sync route.
 *
 * POST /api/admin/prod-sync
 * Protected by x-migration-token header (must equal SESSION_SECRET).
 *
 * Safe to call multiple times — all operations are idempotent.
 * Remove this file after the migration has been confirmed successful.
 */
import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { createRequire } from "module";
import path from "path";
import { fileURLToPath } from "url";

const router = Router();
// After esbuild bundles to dist/index.mjs, data files sit at dist/data/.
// Use the bundle file's directory as the base for require resolution.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Old journey IDs that exist in production but not in dev — must be removed.
// NOTE: "who-is-god" was intentionally removed 2026-08-18.  The admin created
// a new walk with that ID; adding it back here would delete their content.
const OLD_JOURNEY_IDS = [
  "created-in-god-s-image",
  "what-went-wrong",
  "jesus-saves",
  "beginning-your-new-life",
  "walking-with-god",
  "prayer",
  "the-bible",
  "church",
  "baptism",
  "holy-communion",
  "faith",
  "the-holy-spirit",
  "following-jesus-every-day",
  "serving-others",
  "overcoming-temptation",
  "the-fruit-of-the-spirit",
  "living-with-hope",
];

router.post(
  "/admin/prod-sync",
  async (req: Request, res: Response): Promise<void> => {
    // Auth: must supply SESSION_SECRET as migration token
    const token = req.headers["x-migration-token"];
    if (!token || token !== process.env.SESSION_SECRET) {
      res.status(403).json({ error: "Forbidden — invalid migration token" });
      return;
    }

    const report: Record<string, unknown> = {};

    try {
      // ── Load seed data ──────────────────────────────────────────────────────
      // After esbuild bundles to dist/index.mjs, data files sit at dist/data/.
      // __dirname resolves to dist/ at runtime (set by the esbuild banner).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const overviews: any[] = require(
        path.join(__dirname, "data", "prod-sync-overviews.json"),
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { journeys, steps }: { journeys: any[]; steps: any[] } = require(
        path.join(__dirname, "data", "prod-sync-journeys.json"),
      );

      // ── 1. Chapter overviews ──────────────────────────────────────────────
      let overviewsInserted = 0;
      for (const ov of overviews) {
        try {
          const r = await pool.query(
            `INSERT INTO bible_chapter_overviews
               (id, book_id, chapter, summary,
                main_themes, important_people, important_locations, passage_divisions,
                key_verse, key_verse_start, key_verse_end,
                book_connection, jesus_connection,
                status, created_by, updated_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (book_id, chapter) DO NOTHING`,
            [
              ov.id, ov.book_id, ov.chapter, ov.summary,
              JSON.stringify(ov.main_themes),
              JSON.stringify(ov.important_people),
              JSON.stringify(ov.important_locations),
              JSON.stringify(ov.passage_divisions),
              ov.key_verse, ov.key_verse_start, ov.key_verse_end,
              ov.book_connection, ov.jesus_connection,
              ov.status, ov.created_by, ov.updated_by,
            ],
          );
          overviewsInserted += r.rowCount ?? 0;
        } catch (err) {
          logger.warn({ err, book_id: ov.book_id, chapter: ov.chapter },
            "prod-sync: chapter overview insert failed");
        }
      }
      report.chapter_overviews = { total: overviews.length, inserted: overviewsInserted };
      logger.info(report.chapter_overviews, "prod-sync: chapter overviews done");

      // ── 2. Remove old journeys (not in dev) ───────────────────────────────
      // Guard: before deleting, check every authored field in journey_steps.
      // A step is "authored" when ANY text or JSONB content column is non-empty.
      // If authored content is found the journey is SKIPPED and a WARN is emitted
      // so a developer can review and remove the ID from OLD_JOURNEY_IDS instead.
      // When provenance is unclear we err on the side of preservation.
      let oldJourneysDeleted = 0;
      const oldJourneysSkipped: string[] = [];
      for (const jid of OLD_JOURNEY_IDS) {
        try {
          const { rows: authoredRows } = await pool.query<{ cnt: string }>(
            `SELECT COUNT(*) AS cnt FROM journey_steps
             WHERE journey_id = $1
               AND (
                 (teaching_content    IS NOT NULL AND teaching_content    <> '') OR
                 (scripture           IS NOT NULL AND scripture            <> '') OR
                 (reflection_question IS NOT NULL AND reflection_question  <> '') OR
                 (prayer              IS NOT NULL AND prayer               <> '') OR
                 (mentor_intro        IS NOT NULL AND mentor_intro         <> '') OR
                 (todays_action       IS NOT NULL AND todays_action        <> '') OR
                 (memory_verse        IS NOT NULL AND memory_verse         <> '') OR
                 (content IS NOT NULL AND content::text NOT IN ('null','{}','[]'))
               )`,
            [jid],
          );
          const authoredCount = parseInt(authoredRows[0]?.cnt ?? "0", 10);
          if (authoredCount > 0) {
            logger.warn(
              { jid, authoredSteps: authoredCount },
              "prod-sync: skipping delete of OLD_JOURNEY_ID — admin-authored content detected; remove this ID from OLD_JOURNEY_IDS to silence this warning",
            );
            oldJourneysSkipped.push(jid);
            continue;
          }

          // Remove user progress for these journeys first
          await pool.query(
            `DELETE FROM user_journey_progress WHERE journey_id = $1`,
            [jid],
          );
          // Remove steps
          await pool.query(
            `DELETE FROM journey_steps WHERE journey_id = $1`,
            [jid],
          );
          // Remove journey
          const r = await pool.query(
            `DELETE FROM journeys WHERE id = $1`,
            [jid],
          );
          oldJourneysDeleted += r.rowCount ?? 0;
        } catch (err) {
          logger.warn({ err, jid }, "prod-sync: old journey delete failed");
        }
      }
      report.old_journeys_deleted = oldJourneysDeleted;
      if (oldJourneysSkipped.length > 0) {
        report.old_journeys_skipped_authored = oldJourneysSkipped;
      }

      // ── 3. Also clear the old null-titled steps for coming-to-jesus ───────
      //    (the correct steps will be inserted below)
      const devStepIds = steps
        .filter((s) => s.journey_id === "coming-to-jesus")
        .map((s) => s.id);
      if (devStepIds.length > 0) {
        await pool.query(
          `DELETE FROM journey_steps
             WHERE journey_id = 'coming-to-jesus'
               AND id NOT IN (${devStepIds.map((_, i) => `$${i + 1}`).join(",")})`,
          devStepIds,
        );
      }

      // ── 4. Upsert journeys ────────────────────────────────────────────────
      let journeysUpserted = 0;
      for (const j of journeys) {
        try {
          const r = await pool.query(
            `INSERT INTO journeys
               (id, title, subtitle, description, journey_type, duration_days, status,
                cover_image_url, church_wide, start_date, end_date, linked_sermon_id,
                overload_exempt, pastor_edited, published_at, metadata,
                category, difficulty, estimated_duration, tags, prerequisites,
                xp_reward, collection_id, theme_color, version, created_by, updated_by)
             VALUES
               ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
             ON CONFLICT (id) DO UPDATE SET
               title            = EXCLUDED.title,
               subtitle         = EXCLUDED.subtitle,
               description      = EXCLUDED.description,
               journey_type     = EXCLUDED.journey_type,
               duration_days    = EXCLUDED.duration_days,
               status           = EXCLUDED.status,
               cover_image_url  = EXCLUDED.cover_image_url,
               theme_color      = EXCLUDED.theme_color,
               version          = EXCLUDED.version,
               updated_by       = EXCLUDED.updated_by`,
            [
              j.id, j.title, j.subtitle ?? null, j.description ?? null,
              j.journey_type, j.duration_days ?? null, j.status,
              j.cover_image_url ?? null, j.church_wide ?? false,
              j.start_date ?? null, j.end_date ?? null,
              j.linked_sermon_id ?? null,
              j.overload_exempt ?? false, j.pastor_edited ?? false,
              j.published_at ?? null,
              j.metadata ? JSON.stringify(j.metadata) : null,
              j.category ?? null, j.difficulty ?? null,
              j.estimated_duration ?? null,
              j.tags ? JSON.stringify(j.tags) : null,
              j.prerequisites ? JSON.stringify(j.prerequisites) : null,
              j.xp_reward ?? 0, j.collection_id ?? null,
              j.theme_color ?? null, j.version ?? 1,
              j.created_by ?? "migration", j.updated_by ?? "migration",
            ],
          );
          journeysUpserted += r.rowCount ?? 0;
        } catch (err) {
          logger.warn({ err, id: j.id }, "prod-sync: journey upsert failed");
        }
      }
      report.journeys_upserted = journeysUpserted;

      // ── 5. Upsert journey steps ──────────────────────────────────────────
      let stepsInserted = 0;
      for (const s of steps) {
        try {
          // `content` is JSONB — never pass empty string; use null or JSON.stringify
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
               title              = EXCLUDED.title,
               content            = EXCLUDED.content,
               status             = EXCLUDED.status,
               teaching_content   = EXCLUDED.teaching_content,
               reflection_question = EXCLUDED.reflection_question,
               prayer             = EXCLUDED.prayer,
               todays_action      = EXCLUDED.todays_action,
               is_completion_step = EXCLUDED.is_completion_step`,
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
          logger.warn({ err, id: s.id }, "prod-sync: step upsert failed");
        }
      }
      report.steps_upserted = stepsInserted;

      // ── Final count ──────────────────────────────────────────────────────
      const counts = await pool.query(`
        SELECT
          (SELECT COUNT(*) FROM bible_chapter_overviews WHERE status='Published') AS overviews,
          (SELECT COUNT(*) FROM journeys WHERE status='Published')                AS journeys,
          (SELECT COUNT(*) FROM journey_steps WHERE status='Published')           AS steps
      `);
      report.final_counts = counts.rows[0];

      logger.info(report, "prod-sync: migration complete");
      res.json({ ok: true, report });
    } catch (err) {
      logger.error({ err }, "prod-sync: unexpected error");
      res.status(500).json({ error: String(err) });
    }
  },
);

export default router;
