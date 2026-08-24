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
  // "who-is-god" intentionally REMOVED 2026-08-18:
  // The admin created a NEW walk with this ID in production on 2026-08-18.
  // Keeping it here caused prod-data-sync to delete the admin's walk on every boot.
  // Do NOT add it back — the ID is reused for authored content.
  "created-in-god-s-image", "what-went-wrong", "jesus-saves",
  "beginning-your-new-life", "walking-with-god", "prayer", "the-bible",
  "church", "baptism", "holy-communion", "faith", "the-holy-spirit",
  "following-jesus-every-day", "serving-others", "overcoming-temptation",
  "the-fruit-of-the-spirit", "living-with-hope",
  // Incomplete Draft AI walk (1 step only) — the published 5-day version is the-emmaus-road-2
  "the-emmaus-road",
  // Admin permanently deleted 2026-08-17
  "the-road-to-emmaus",
];

/**
 * Seeded chapter overviews are insert-only. Once a chapter exists, it may have
 * been authored or bulk-imported by an admin and must never be overwritten by a
 * later deploy (including its Draft/Published status).
 */
export const CHAPTER_OVERVIEW_SEED_INSERT_SQL = `
  INSERT INTO bible_chapter_overviews
    (id, book_id, chapter, title, summary,
     main_themes, important_people, important_locations, passage_divisions,
     key_verse, key_verse_start, key_verse_end,
     book_connection, jesus_connection,
     status, created_by, updated_by)
  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
  ON CONFLICT (book_id, chapter) DO NOTHING`;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let devSeries: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let devEntries: any[] = [];

    try {
      overviews = _require(path.join(_dir, "data", "prod-sync-overviews.json"));
      const journeyData = _require(path.join(_dir, "data", "prod-sync-journeys.json"));
      journeys = journeyData.journeys;
      steps = journeyData.steps;
    } catch (err) {
      logger.warn({ err }, "prod-data-sync: seed files not found — skipping");
      return;
    }

    try {
      const devData = _require(path.join(_dir, "data", "prod-sync-devotionals.json"));
      devSeries  = devData.series  ?? [];
      devEntries = devData.entries ?? [];
    } catch {
      // File may not exist on first deploy after this change — safe to skip.
      logger.warn("prod-data-sync: prod-sync-devotionals.json not found — skipping devotionals");
    }

    // ── 1. Chapter overviews ─────────────────────────────────────────────
    // Insert missing seed chapters only. Existing rows are authored content and
    // their text/status must survive every subsequent boot.
    let overviewsInserted = 0;
    for (const ov of overviews) {
      try {
        const jsonbStr = (v: unknown) =>
          v != null ? (typeof v === "string" ? v : JSON.stringify(v)) : "[]";
        const r = await pool.query(
          CHAPTER_OVERVIEW_SEED_INSERT_SQL,
          [
             ov.id, ov.book_id, ov.chapter, ov.title ?? "", ov.summary ?? "",
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
        overviewsInserted += r.rowCount ?? 0;
      } catch (err) {
        logger.warn(
          { err, book_id: ov.book_id, chapter: ov.chapter },
          "prod-data-sync: chapter overview upsert failed",
        );
      }
    }
    logger.info(
      { seed: overviews.length, dbBefore: overviewCount, inserted: overviewsInserted },
      "prod-data-sync: chapter overviews synced",
    );

    // ── 2. Remove old journey IDs not present in dev ──────────────────────
    // Guard: before deleting, check every authored field in journey_steps.
    // A step is considered "authored" when ANY text or JSONB content column
    // is non-empty — covering all columns an admin can write to (teaching
    // text, scripture, reflection, prayer, mentor intro, today's action,
    // memory verse, and the generic JSONB content block).
    // If authored content is found the journey is SKIPPED and a WARN is
    // emitted naming the ID and step count so a developer can review and
    // remove the ID from OLD_JOURNEY_IDS instead.  We never silently
    // discard content; when provenance is unclear we err on the side of
    // preservation.
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
            "prod-data-sync: skipping delete of OLD_JOURNEY_ID — admin-authored content detected; remove this ID from OLD_JOURNEY_IDS to silence this warning",
          );
          continue;
        }

        await pool.query("DELETE FROM user_journey_progress WHERE journey_id=$1", [jid]);
        await pool.query("DELETE FROM journey_steps WHERE journey_id=$1", [jid]);
        await pool.query("DELETE FROM journeys WHERE id=$1", [jid]);
      } catch (err) {
        logger.warn({ err, jid }, "prod-data-sync: old journey delete failed (non-fatal)");
      }
    }

    // ── 3. [Removed] Stale step cleanup was here.
    // It was too aggressive: it deleted any production step not in the dev seed
    // for a given journey, destroying admin-authored content on every boot.
    // The COALESCE/NULLIF guards on the step upsert (step 4 below) are sufficient
    // to protect authored content — no destructive cleanup is needed.

    // ── 4. Upsert journeys (skip tombstoned IDs) ─────────────────────────
    // Tombstones record journeys the admin permanently deleted — we must not
    // restore them from seed data on subsequent boots.
    let tombstones = new Set<string>();
    try {
      const { rows } = await pool.query<{ journey_id: string }>(
        "SELECT journey_id FROM reseed_tombstones",
      );
      tombstones = new Set(rows.map((r) => r.journey_id));
    } catch { /* table may not exist on very first boot — safe to skip */ }

    for (const j of journeys) {
      if (tombstones.has(j.id)) continue; // admin permanently deleted this — skip
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
             -- status intentionally omitted: admin publish/unpublish is the source of truth.
             -- Status is written only on INSERT (new journeys); existing journeys always
             -- keep whatever the admin set. A contaminated seed must NOT revert a
             -- journey the admin has already published.
             duration_days = EXCLUDED.duration_days,
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
      // A tombstoned journey is intentionally not restored above. Its seed
      // steps must be skipped as well, otherwise the FK rejects them on every
      // boot and can keep the API unhealthy while startup is still settling.
      if (tombstones.has(s.journey_id)) continue;
      try {
        const contentVal = s.content != null
          ? (typeof s.content === "string" ? s.content : JSON.stringify(s.content))
          : null;
        const r = await pool.query(
          `INSERT INTO journey_steps
             (id, journey_id, day, title, content, status,
              mentor_intro, scripture, teaching_content, reflection_question,
              prayer, todays_action, memory_verse, preferred_translation,
              is_completion_step, share_image_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (id) DO UPDATE SET
             title               = EXCLUDED.title,
             -- Authored content: NEVER overwrite what an admin wrote.
             -- Use COALESCE/NULLIF for text fields; use CASE for JSONB to also
             -- treat empty-object {} and empty-array [] as "no content".
             -- Upgrade Draft → Published if the seed says Published, but never downgrade.
             -- This repairs steps that were saved as Draft before the auto-publish fix.
             status              = CASE
                                     WHEN journey_steps.status = 'Draft' AND EXCLUDED.status = 'Published'
                                     THEN 'Published'
                                     ELSE journey_steps.status
                                   END,
             content             = CASE
                                     WHEN journey_steps.content IS NOT NULL
                                       AND journey_steps.content::text NOT IN ('null','{}','[]')
                                     THEN journey_steps.content
                                     ELSE EXCLUDED.content
                                   END,
             teaching_content    = COALESCE(NULLIF(journey_steps.teaching_content, ''), EXCLUDED.teaching_content),
             reflection_question = COALESCE(NULLIF(journey_steps.reflection_question, ''), EXCLUDED.reflection_question),
             prayer              = COALESCE(NULLIF(journey_steps.prayer, ''), EXCLUDED.prayer),
             todays_action       = COALESCE(NULLIF(journey_steps.todays_action, ''), EXCLUDED.todays_action),
             mentor_intro        = COALESCE(NULLIF(journey_steps.mentor_intro, ''), EXCLUDED.mentor_intro),
             is_completion_step  = EXCLUDED.is_completion_step,
             -- Preserve admin-saved share images; only fill from seed when the DB value is null
             share_image_url     = COALESCE(journey_steps.share_image_url, EXCLUDED.share_image_url)`,
          [
            s.id, s.journey_id, s.day, s.title ?? "", contentVal,
            s.status ?? "Published",
            s.mentor_intro ?? null, s.scripture ?? null,
            s.teaching_content ?? null, s.reflection_question ?? null,
            s.prayer ?? null, s.todays_action ?? null,
            s.memory_verse ?? null, s.preferred_translation ?? null,
            s.is_completion_step ?? false,
            s.share_image_url ?? null,
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

    // ── 6. Upsert devotional series (skip tombstoned IDs) ────────────────
    // Tombstones record series the admin permanently deleted — we must not
    // restore them from seed data on subsequent boots.
    let devTombstones = new Set<string>();
    try {
      const { rows: devTombRows } = await pool.query<{ series_id: string }>(
        "SELECT series_id FROM reseed_devotional_tombstones",
      );
      devTombstones = new Set(devTombRows.map((r) => r.series_id));
    } catch { /* table may not exist on very first boot — safe to skip */ }

    for (const s of devSeries) {
      if (devTombstones.has(s.id)) continue; // admin permanently deleted this — skip
      try {
        await pool.query(
          `INSERT INTO devotional_series
             (id, title, description, series_type, status, published_at, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (id) DO UPDATE SET
             title        = EXCLUDED.title,
             description  = EXCLUDED.description,
             series_type  = EXCLUDED.series_type,
             status       = EXCLUDED.status,
             published_at = EXCLUDED.published_at`,
          [
            s.id, s.title, s.description ?? "",
            s.series_type ?? "general", s.status ?? "Draft",
            s.published_at ?? null, s.created_by ?? "seed",
          ],
        );
      } catch (err) {
        logger.warn({ err, id: s.id }, "prod-data-sync: devotional series upsert failed (non-fatal)");
      }
    }

    // ── 7. Upsert devotional entries (including display_label) ────────────
    // Skip entries whose parent series was permanently deleted (tombstoned).
    // Without this guard, foreign-key errors fire on every boot for orphaned entries.
    let entriesUpserted = 0;
    for (const e of devEntries) {
      if (devTombstones.has(e.series_id)) continue; // parent series was permanently deleted
      try {
        const r = await pool.query(
          `INSERT INTO devotional_entries
             (id, series_id, day_number, title, scripture_reference,
              greeting, consider_this, prayer, next_step, closing,
              status, published_at, display_label)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (id) DO UPDATE SET
             title               = EXCLUDED.title,
             scripture_reference = EXCLUDED.scripture_reference,
             greeting            = EXCLUDED.greeting,
             consider_this       = EXCLUDED.consider_this,
             prayer              = EXCLUDED.prayer,
             next_step           = EXCLUDED.next_step,
             closing             = EXCLUDED.closing,
             status              = EXCLUDED.status,
             published_at        = EXCLUDED.published_at,
             display_label       = EXCLUDED.display_label`,
          [
            e.id, e.series_id, e.day_number, e.title ?? "",
            e.scripture_reference ?? "", e.greeting ?? "",
            e.consider_this ?? "", e.prayer ?? "",
            e.next_step ?? "", e.closing ?? "",
            e.status ?? "Draft", e.published_at ?? null,
            e.display_label ?? null,
          ],
        );
        entriesUpserted += r.rowCount ?? 0;
      } catch (err) {
        logger.warn({ err, id: e.id }, "prod-data-sync: devotional entry upsert failed (non-fatal)");
      }
    }

    logger.info(
      { series: devSeries.length, entries: devEntries.length, entriesUpserted },
      "prod-data-sync: devotionals synced",
    );
  } catch (err) {
    logger.error({ err }, "prod-data-sync: unexpected error (non-fatal)");
  }
}
