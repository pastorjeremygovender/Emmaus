/**
 * seed-content.ts — Insert foundational authored content on a fresh installation.
 *
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PRODUCTION SAFETY GUARD                                                ║
 * ║  This script will NOT run in production unless                          ║
 * ║  ALLOW_SEED_IN_PRODUCTION=true is explicitly set.                       ║
 * ║                                                                          ║
 * ║  It NEVER deletes existing records.                                      ║
 * ║  All inserts use ON CONFLICT DO NOTHING.                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Run from the api-server directory:
 *   pnpm seed:content
 *   # or:
 *   tsx src/scripts/seed-content.ts
 *
 * Idempotent — safe to run multiple times. Skips records that already exist.
 */

const isProd = process.env.NODE_ENV === "production";
const allowProd = process.env.ALLOW_SEED_IN_PRODUCTION === "true";

if (isProd && !allowProd) {
  console.error(
    "\n[seed-content] BLOCKED: NODE_ENV=production detected.\n" +
    "  This script must not run automatically in production.\n" +
    "  To run intentionally on production data, set:\n" +
    "    ALLOW_SEED_IN_PRODUCTION=true tsx src/scripts/seed-content.ts\n"
  );
  process.exit(1);
}

if (isProd && allowProd) {
  console.warn(
    "\n[seed-content] WARNING: Running against production with ALLOW_SEED_IN_PRODUCTION=true.\n" +
    "  All inserts use ON CONFLICT DO NOTHING — no existing records will be modified.\n"
  );
}

import { pool } from "@workspace/db";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`  [seed-content] ${msg}`);
}

function skip(msg: string) {
  console.log(`  [seed-content] (skip) ${msg}`);
}

// ─── 1. Coming to Jesus — collection ─────────────────────────────────────────
//
// LOCKED STRUCTURE:
//   Collection  : 00000000-0000-0000-0000-000000000010  "Coming to Jesus"
//   Journey/Walk: coming-to-jesus                       "Who Is God?"
//   Steps (5)   : In the Beginning · The Master Designer · The Lord of Creation
//                 God Knows You · God Wants You to Know Him
//   + day-6 Journey Complete step (Draft, is_completion_step = true)
//
// Body content (scripture, devotional, reflection, prayer, action step) must be
// authored via the Content Studio — it is not seeded here.

async function seedComingToJesusCollection() {
  const res = await pool.query(
    `INSERT INTO collections
       (id, title, description, status, display_order, tags, created_at, updated_at)
     VALUES
       ('00000000-0000-0000-0000-000000000010',
        'Coming to Jesus',
        'An introductory pathway for people just beginning their faith journey.',
        'Published', 10, '[]', NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`
  );
  if ((res.rowCount ?? 0) > 0) {
    log("Inserted collection: Coming to Jesus (00000000-0000-0000-0000-000000000010)");
  } else {
    skip("Collection 'Coming to Jesus' already exists");
  }
}

async function seedComingToJesusJourney() {
  const res = await pool.query(
    `INSERT INTO journeys
       (id, title, description, journey_type, status, collection_id,
        difficulty, estimated_duration, duration_days, tags, published_at,
        created_at, updated_at)
     VALUES
       ('coming-to-jesus',
        'Who Is God?',
        '',
        'growth', 'Published', '00000000-0000-0000-0000-000000000010',
        'Beginner', '5 min/day', 5, '["new believers","foundations"]',
        NOW(), NOW(), NOW())
     ON CONFLICT (id) DO NOTHING`
  );
  if ((res.rowCount ?? 0) > 0) {
    log("Inserted journey: coming-to-jesus ('Who Is God?')");
  } else {
    skip("Journey 'coming-to-jesus' already exists");
  }
}

async function seedComingToJesusSteps() {
  const steps = [
    { day: 1, title: "In the Beginning",           isCompletion: false, status: "Published" },
    { day: 2, title: "The Master Designer",        isCompletion: false, status: "Published" },
    { day: 3, title: "The Lord of Creation",       isCompletion: false, status: "Published" },
    { day: 4, title: "God Knows You",              isCompletion: false, status: "Published" },
    { day: 5, title: "God Wants You to Know Him",  isCompletion: false, status: "Published" },
    { day: 6, title: "Journey Complete",            isCompletion: true,  status: "Draft"     },
  ];

  let inserted = 0;
  let skipped = 0;
  for (const s of steps) {
    const res = await pool.query(
      `INSERT INTO journey_steps
         (journey_id, day, title, status, is_completion_step, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (journey_id, day) DO NOTHING`,
      ["coming-to-jesus", s.day, s.title, s.status, s.isCompletion]
    );
    if ((res.rowCount ?? 0) > 0) { inserted++; } else { skipped++; }
  }
  if (inserted > 0) log(`Inserted ${inserted} step(s) for coming-to-jesus (${skipped} already existed)`);
  else skip(`All ${skipped} steps for coming-to-jesus already exist`);
}

// ─── 2. Daily Rhythm — journeyType promotion ──────────────────────────────────
// Promotes "15-minutes-with-jesus" from journeyType 'core' → 'daily-rhythm'.
// Only updates if the row exists and still has the old type.

async function promoteDailyRhythmType() {
  const res = await pool.query(
    `UPDATE journeys
        SET journey_type = 'daily-rhythm', updated_at = NOW()
      WHERE id = '15-minutes-with-jesus'
        AND journey_type = 'core'`
  );
  if ((res.rowCount ?? 0) > 0) {
    log("Updated 15-minutes-with-jesus: journey_type core → daily-rhythm");
  } else {
    skip("15-minutes-with-jesus: already daily-rhythm or does not exist");
  }
}

// ─── 3. Bible study notes ────────────────────────────────────────────────────
// Seeds 1,014 pre-authored notes from the bundled JSON when the DB has none,
// then backfills key_truth / reflection_question / related_scriptures on
// existing rows that were seeded before those columns were added.
//
// Runs only when COUNT(*) = 0 for the initial seed, but backfill runs
// unconditionally (it is a no-op when all rows are already populated).

type SeedNote = {
  book_id: string;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  title: string;
  content: string;
  context_note: string;
  historical_note: string;
  original_language_note: string;
  jesus_connection: string;
  apply_it: string;
  status: string;
  key_truth: string;
  reflection_question: string;
  related_scriptures: string;
};

async function seedBibleStudyNotes() {
  // Resolve path relative to this source file so the script works both from
  // `tsx src/scripts/seed-content.ts` and from a compiled dist bundle.
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  // When run as source (tsx), the file is in src/scripts/ so data is two levels up.
  // When run from dist (node dist/...) the data dir is sibling of dist/index.mjs.
  // Try source-relative path first, fall back to dist-sibling.
  let seedPath: string;
  const sourcePath = resolve(scriptDir, "../../data/bible-study-notes-seed.json");
  const distPath   = resolve(scriptDir, "../data/bible-study-notes-seed.json");
  try {
    readFileSync(sourcePath); // test existence
    seedPath = sourcePath;
  } catch {
    seedPath = distPath;
  }

  const notes: SeedNote[] = JSON.parse(readFileSync(seedPath, "utf-8")) as SeedNote[];

  const { rows: countRows } = await pool.query(`SELECT COUNT(*) AS n FROM bible_study_notes`);
  if (Number(countRows[0].n) === 0) {
    let inserted = 0;
    for (const n of notes) {
      await pool.query(
        `INSERT INTO bible_study_notes
           (book_id, chapter, verse_start, verse_end, title, content, context_note,
            historical_note, original_language_note, jesus_connection, apply_it,
            key_truth, reflection_question, related_scriptures,
            status, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'seed','seed')
         ON CONFLICT DO NOTHING`,
        [
          n.book_id, n.chapter, n.verse_start, n.verse_end ?? null,
          n.title, n.content, n.context_note, n.historical_note,
          n.original_language_note, n.jesus_connection, n.apply_it,
          n.key_truth ?? "", n.reflection_question ?? "", n.related_scriptures ?? "",
          n.status,
        ]
      );
      inserted++;
    }
    log(`Seeded ${inserted} bible_study_notes from bundled JSON`);
  } else {
    skip(`bible_study_notes already has ${countRows[0].n} rows — initial seed skipped`);
  }

  // Backfill authoring fields (key_truth / reflection_question / related_scriptures)
  // on any existing rows that were seeded before those columns were added.
  let backfilled = 0;
  for (const n of notes) {
    if (!n.key_truth && !n.reflection_question && !n.related_scriptures) continue;
    const result = await pool.query(
      `UPDATE bible_study_notes
          SET key_truth          = $1,
              reflection_question = $2,
              related_scriptures  = $3,
              updated_at          = now()
        WHERE book_id = $4 AND chapter = $5 AND verse_start = $6
          AND (key_truth = '' OR key_truth IS NULL)`,
      [
        n.key_truth ?? "", n.reflection_question ?? "", n.related_scriptures ?? "",
        n.book_id, n.chapter, n.verse_start,
      ]
    );
    backfilled += result.rowCount ?? 0;
  }
  if (backfilled > 0) {
    log(`Backfilled key_truth/reflection/related_scriptures on ${backfilled} existing note(s)`);
  } else {
    skip("Bible study note authoring fields already populated — backfill no-op");
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n[seed-content] Starting content seed…");
  console.log(`  NODE_ENV: ${process.env.NODE_ENV ?? "(unset)"}`);

  try {
    await seedComingToJesusCollection();
    await seedComingToJesusJourney();
    await seedComingToJesusSteps();
    await promoteDailyRhythmType();
    await seedBibleStudyNotes();
  } finally {
    await pool.end();
  }

  console.log("[seed-content] Done.\n");
  process.exit(0);
}

main().catch(err => {
  console.error("[seed-content] Fatal error:", err);
  process.exit(1);
});
