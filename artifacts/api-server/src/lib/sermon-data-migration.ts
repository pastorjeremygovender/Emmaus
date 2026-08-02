/**
 * sermon-data-migration.ts — One-time idempotent migration of legacy
 * admin-drafts.json records into the canonical `sermons` PostgreSQL table.
 *
 * Runs automatically on every boot (after runStartupMigrations + runProdDataSync).
 * Safe to run repeatedly — uses ON CONFLICT (legacy_json_id) DO UPDATE so
 * existing records are updated rather than duplicated.
 *
 * After migrating each record it also back-fills sermon_companion.sermon_uuid
 * by matching on sermon_companion.sermon_id = legacy_json_id.
 *
 * The admin-drafts.json file is NOT deleted — it remains as a read-only backup.
 * All new sermon creation goes through the canonical DB store.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import { upsertByLegacyId } from "./canonical-sermon-store.js";
import type { AdminSermonRecord } from "./admin-sermon-store.js";

const DRAFTS_FILE = join(process.cwd(), "data", "sermons", "admin-drafts.json");

async function readDrafts(): Promise<AdminSermonRecord[]> {
  try {
    const raw = await readFile(DRAFTS_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return []; // file doesn't exist yet — nothing to migrate
  }
}

/**
 * Derive scripture book IDs from a free-text scripture reference.
 * e.g. "John 3:16-17" → ["john"]
 * e.g. "Romans 8:28" → ["romans"]
 *
 * Returns an empty array if no known book is detected.
 */
function parseScriptureBookIds(ref: string): string[] {
  if (!ref) return [];
  const lower = ref.toLowerCase().replace(/[^a-z0-9 ]/g, " ");

  const books: Array<{ pattern: RegExp; id: string }> = [
    { pattern: /\bjohn\b/, id: "john" },
    { pattern: /\bluke\b/, id: "luke" },
    { pattern: /\bmark\b/, id: "mark" },
    { pattern: /\bmatthew\b/, id: "matthew" },
    { pattern: /\bacts\b/, id: "acts" },
    { pattern: /\bromans\b/, id: "romans" },
    { pattern: /\bgenesis\b/, id: "genesis" },
    { pattern: /\bexodus\b/, id: "exodus" },
    { pattern: /\bpsalms\b|\bpsalm\b/, id: "psalms" },
    { pattern: /\bproverbs\b/, id: "proverbs" },
    { pattern: /\bisaiah\b/, id: "isaiah" },
    { pattern: /\bjeremiah\b/, id: "jeremiah" },
    { pattern: /\bezekiel\b/, id: "ezekiel" },
    { pattern: /\bdaniel\b/, id: "daniel" },
    { pattern: /\b1 corinthians\b|1cor\b/, id: "1corinthians" },
    { pattern: /\b2 corinthians\b|2cor\b/, id: "2corinthians" },
    { pattern: /\bgalatians\b/, id: "galatians" },
    { pattern: /\bephesians\b/, id: "ephesians" },
    { pattern: /\bphilippians\b/, id: "philippians" },
    { pattern: /\bcolossians\b/, id: "colossians" },
    { pattern: /\bhebrews\b/, id: "hebrews" },
    { pattern: /\bjames\b/, id: "james" },
    { pattern: /\b1 peter\b|1pet\b/, id: "1peter" },
    { pattern: /\b2 peter\b|2pet\b/, id: "2peter" },
    { pattern: /\b1 john\b|1jn\b/, id: "1john" },
    { pattern: /\brevelation\b/, id: "revelation" },
    { pattern: /\b2 samuel\b|2sam\b/, id: "2samuel" },
    { pattern: /\b1 samuel\b|1sam\b/, id: "1samuel" },
    { pattern: /\bjoshua\b/, id: "joshua" },
    { pattern: /\bjudges\b/, id: "judges" },
    { pattern: /\bruth\b/, id: "ruth" },
  ];

  const matched: string[] = [];
  for (const { pattern, id } of books) {
    if (pattern.test(lower)) matched.push(id);
  }
  return matched;
}

/** Extract the first chapter number mentioned in a scripture reference. */
function parseChapterNumbers(ref: string): number[] {
  if (!ref) return [];
  const numbers: number[] = [];
  // Match patterns like "John 3:16", "Romans 8", "1 Cor 13:4-7"
  const matches = ref.matchAll(/\b(\d+):/g);
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && !numbers.includes(n)) numbers.push(n);
  }
  // Also catch bare chapter numbers like "Joshua 24"
  if (numbers.length === 0) {
    const bare = ref.match(/(\d+)\s*$/);
    if (bare) {
      const n = parseInt(bare[1], 10);
      if (!isNaN(n)) numbers.push(n);
    }
  }
  return numbers;
}

/**
 * Map legacy JSON `status` ("draft"|"review"|"published")
 * to canonical DB status ("Draft"|"Review"|"Published").
 */
function mapStatus(s: string): "Draft" | "Review" | "Published" {
  if (s === "published") return "Published";
  if (s === "review") return "Review";
  return "Draft";
}

export async function runSermonDataMigration(): Promise<void> {
  const drafts = await readDrafts();
  if (drafts.length === 0) {
    logger.info("sermon-data-migration: no legacy JSON records found — nothing to migrate");
    return;
  }

  let migrated = 0;
  let linked = 0;
  let errors = 0;

  for (const draft of drafts) {
    try {
      const bookIds = parseScriptureBookIds(draft.scriptureReference ?? "");
      const chapters = parseChapterNumbers(draft.scriptureReference ?? "");

      const canonical = await upsertByLegacyId({
        legacyJsonId:       draft.id,
        title:              draft.title ?? "",
        speaker:            draft.speaker ?? "",
        sermonDate:         draft.sermonDate ?? draft.sermonDate ?? "",
        series:             draft.series ?? "",
        scriptureReference: draft.scriptureReference ?? "",
        scriptureBookIds:   bookIds,
        scriptureChapters:  chapters,
        youtubeUrl:         draft.youtubeUrl ?? "",
        youtubeVideoId:     "",
        audioPath:          "",
        notes:              "",
        transcript:         draft.sermonTranscript ?? draft.transcript ?? "",
        transcriptStatus:   draft.transcriptStatus ?? "none",
        summary:            draft.summary ?? "",
        themes:             draft.topics ?? [],
        sections:           [],
        keywords:           draft.keywords ?? [],
        mainTheme:          draft.mainTheme ?? "",
        status:             mapStatus(draft.status ?? "draft"),
      });

      migrated++;

      // Back-fill sermon_companion.sermon_uuid using the legacy sermon_id text match
      const linkResult = await pool.query(
        `UPDATE sermon_companion
         SET sermon_uuid = $1
         WHERE sermon_id = $2 AND (sermon_uuid IS NULL OR sermon_uuid != $1)`,
        [canonical.id, draft.id]
      );
      if ((linkResult.rowCount ?? 0) > 0) {
        linked += linkResult.rowCount ?? 0;
      }
    } catch (err) {
      errors++;
      logger.warn({ err, draftId: draft.id }, "sermon-data-migration: failed to migrate record (non-fatal)");
    }
  }

  logger.info(
    { total: drafts.length, migrated, linked, errors },
    "sermon-data-migration: complete"
  );
}
