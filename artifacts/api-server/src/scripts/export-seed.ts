/**
 * export-seed.ts — Dump all authored content from the dev DB to seed files.
 *
 * Run before every deployment:
 *   pnpm --filter @workspace/api-server run export:seed
 *
 * ─── What it exports ──────────────────────────────────────────────────────
 *  • bible_chapter_overviews  → src/data/prod-sync-overviews.json
 *  • journeys + journey_steps → src/data/prod-sync-journeys.json
 *
 * ─── Safety ───────────────────────────────────────────────────────────────
 *  READ-ONLY — never writes to the database.
 *  Blocked in NODE_ENV=production so it can never run against the prod DB.
 */

import { pool } from "@workspace/db";
import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = resolve(__dirname, "../data");

if (process.env["NODE_ENV"] === "production") {
  console.error(
    "\n[export-seed] BLOCKED: NODE_ENV=production.\n" +
    "  This script reads from the DEV database to build seed files.\n" +
    "  Never run it against production.\n",
  );
  process.exit(1);
}

async function main() {
  try {
    // ── Chapter overviews ─────────────────────────────────────────────────
    const overviewResult = await pool.query<Record<string, unknown>>(`
      SELECT
        id, book_id, chapter, summary,
        main_themes, important_people, important_locations, passage_divisions,
        key_verse, key_verse_start, key_verse_end,
        book_connection, jesus_connection,
        status, created_by, updated_by
      FROM bible_chapter_overviews
      WHERE status = 'Published'
      ORDER BY book_id, chapter
    `);

    const overviewsPath = resolve(dataDir, "prod-sync-overviews.json");
    writeFileSync(overviewsPath, JSON.stringify(overviewResult.rows, null, 2), "utf8");
    console.log(`[export-seed] ✓ ${overviewResult.rows.length} chapter overviews → prod-sync-overviews.json`);

    // ── Journeys ──────────────────────────────────────────────────────────
    const journeyResult = await pool.query<Record<string, unknown>>(`
      SELECT
        id, title, subtitle, description, journey_type, duration_days, status,
        cover_image_url, church_wide, start_date, end_date, linked_sermon_id,
        overload_exempt, pastor_edited, published_at, metadata,
        category, difficulty, estimated_duration, tags, prerequisites,
        xp_reward, collection_id, theme_color, version
      FROM journeys
      WHERE deleted_at IS NULL
      ORDER BY id
    `);

    // ── Journey steps ─────────────────────────────────────────────────────
    const stepResult = await pool.query<Record<string, unknown>>(`
      SELECT
        id, journey_id, day, title, content, status,
        mentor_intro, scripture, teaching_content, reflection_question,
        prayer, todays_action, memory_verse, preferred_translation,
        is_completion_step
      FROM journey_steps
      WHERE deleted_at IS NULL
      ORDER BY journey_id, day
    `);

    const journeysPath = resolve(dataDir, "prod-sync-journeys.json");
    writeFileSync(
      journeysPath,
      JSON.stringify({ journeys: journeyResult.rows, steps: stepResult.rows }, null, 2),
      "utf8",
    );
    console.log(`[export-seed] ✓ ${journeyResult.rows.length} journeys → prod-sync-journeys.json`);
    console.log(`[export-seed] ✓ ${stepResult.rows.length} steps    → prod-sync-journeys.json`);
    console.log("[export-seed] Seed files are up to date.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[export-seed] Failed:", err);
  process.exit(1);
});
