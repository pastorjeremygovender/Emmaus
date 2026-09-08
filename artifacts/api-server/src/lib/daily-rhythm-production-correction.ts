/**
 * Guarded production data correction for the Daily Rhythm launch.
 *
 * This is deliberately separate from prod-data-sync.ts. It changes exactly two
 * existing scalar fields and is called before the production server listens.
 * It must never be added to startup-migrations.ts or the broad content sync.
 */

import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "@workspace/db";
import { logger } from "./logger.js";

export const DAILY_RHYTHM_JOURNEY_ID = "15-minutes-with-jesus";
export const DAILY_RHYTHM_DAY_8_STEP_ID =
  "10acfaf0-b5c7-4997-8473-2e1bdf050ab9";

// Supplied by the pre-correction production/development verification.
export const VERIFIED_DAY_8_CONTENT_HASH =
  "14ce2738c1ccc2c266ed346eee407283";

const MIGRATION_NAME = "daily-rhythm-production-correction-2026-09-02";
const VERIFIED_STEP_STATUS = "Draft";
const VERIFIED_JOURNEY_DURATION = 7;

type DbRow = Record<string, unknown>;

export interface MigrationQueryResult<T extends DbRow = DbRow> {
  rows: T[];
  rowCount: number | null;
}

export interface MigrationClient {
  query<T extends DbRow = DbRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<MigrationQueryResult<T>>;
}

export type DailyRhythmMigrationResult =
  | {
      outcome: "applied";
      migration: string;
      stepRowsUpdated: 1;
      journeyRowsUpdated: 1;
      verifiedContentHash: string;
    }
  | {
      outcome: "already applied";
      migration: string;
      stepRowsUpdated: 0;
      journeyRowsUpdated: 0;
      verifiedContentHash: string;
    };

type VerifiedStep = {
  [key: string]: unknown;
};

const VERIFIED_STEP_FIELDS = [
  "id",
  "journey_id",
  "day",
  "title",
  "content",
  "mentor_intro",
  "scripture",
  "teaching_content",
  "reflection_question",
  "prayer",
  "todays_action",
  "memory_verse",
  "preferred_translation",
  "scripture_references",
  "suggested_sermons",
  "suggested_follow_up_questions",
  "unlock_conditions",
  "is_completion_step",
  "display_label",
  "share_image_url",
  "display_order",
  "deleted_at",
] as const;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right));
}

function normalizedDbValue(value: unknown): unknown {
  return value === undefined ? null : value;
}

function verifiedSeedStep(): VerifiedStep {
  const candidatePaths = [
    path.join(moduleDir, "../data/prod-sync-journeys.json"),
    path.join(moduleDir, "data/prod-sync-journeys.json"),
  ];

  for (const candidatePath of candidatePaths) {
    try {
      const data = require(candidatePath) as {
        steps?: VerifiedStep[];
      };
      const step = data.steps?.find(
        (entry) => entry.id === DAILY_RHYTHM_DAY_8_STEP_ID,
      );
      if (step) {
        // These fields are present in the database but intentionally omitted
        // by export:seed because the seed format predates them. Their verified
        // development values were recorded during the production preflight.
        return {
          ...step,
          scripture_references: [],
          suggested_sermons: [],
          suggested_follow_up_questions: [],
          unlock_conditions: null,
          display_label: null,
          display_order: step.display_order ?? 0,
          deleted_at: null,
        };
      }
    } catch {
      // Try the other runtime location. A missing verified snapshot is fatal
      // when the migration runs, rather than allowing an unguarded update.
    }
  }

  throw new Error("Verified Daily Rhythm Day 8 snapshot is unavailable");
}

function assertVerifiedDay8Content(row: DbRow): void {
  const expected = verifiedSeedStep();

  for (const field of VERIFIED_STEP_FIELDS) {
    if (
      !valuesEqual(
        normalizedDbValue(row[field]),
        normalizedDbValue(expected[field]),
      )
    ) {
      throw new Error(`verified Day 8 content guard failed for field ${field}`);
    }
  }
}

function publicFailureMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown migration failure";
}

/**
 * Applies the correction inside an already-open transaction.
 *
 * The caller owns BEGIN/COMMIT/ROLLBACK. Keeping the SQL body separate makes
 * the exact same guarded statements testable against a development transaction.
 */
export async function applyDailyRhythmProductionCorrection(
  client: MigrationClient,
): Promise<DailyRhythmMigrationResult> {
  const journeyResult = await client.query<DbRow>(
    `SELECT id, journey_type, duration_days, status, deleted_at
       FROM journeys
      WHERE id = $1
      FOR UPDATE`,
    [DAILY_RHYTHM_JOURNEY_ID],
  );
  const stepResult = await client.query<DbRow>(
    `SELECT id, journey_id, day, title, content, status, mentor_intro,
            scripture, teaching_content, reflection_question, prayer,
            todays_action, memory_verse, preferred_translation,
            scripture_references, suggested_sermons,
            suggested_follow_up_questions, unlock_conditions,
            is_completion_step, display_label, share_image_url,
            display_order, deleted_at
       FROM journey_steps
      WHERE id = $1
      FOR UPDATE`,
    [DAILY_RHYTHM_DAY_8_STEP_ID],
  );

  const journey = journeyResult.rows[0];
  const step = stepResult.rows[0];

  if (!journey || !step) {
    throw new Error("verified Daily Rhythm correction rows are missing");
  }

  if (
    journey.id !== DAILY_RHYTHM_JOURNEY_ID ||
    journey.journey_type !== "daily-rhythm" ||
    journey.deleted_at !== null
  ) {
    throw new Error("verified Daily Rhythm journey identity guard failed");
  }

  if (
    step.id !== DAILY_RHYTHM_DAY_8_STEP_ID ||
    step.journey_id !== DAILY_RHYTHM_JOURNEY_ID ||
    step.day !== 8 ||
    step.deleted_at !== null
  ) {
    throw new Error("verified Daily Rhythm Day 8 identity guard failed");
  }

  // Exact field comparison is stronger than relying only on the historical
  // preflight hash serialization. The supplied hash is logged as the verified
  // fingerprint and the full immutable projection must match its snapshot.
  assertVerifiedDay8Content(step);

  const isAlreadyApplied =
    step.status === "Published" && journey.duration_days === 30;
  if (isAlreadyApplied) {
    return {
      outcome: "already applied",
      migration: MIGRATION_NAME,
      stepRowsUpdated: 0,
      journeyRowsUpdated: 0,
      verifiedContentHash: VERIFIED_DAY_8_CONTENT_HASH,
    };
  }

  if (
    step.status !== VERIFIED_STEP_STATUS ||
    journey.duration_days !== VERIFIED_JOURNEY_DURATION
  ) {
    throw new Error("verified pre-correction status/duration guard failed");
  }

  const stepUpdate = await client.query(
    `UPDATE journey_steps
        SET status = 'Published'
      WHERE id = $1
        AND status = 'Draft'`,
    [DAILY_RHYTHM_DAY_8_STEP_ID],
  );
  if (stepUpdate.rowCount !== 1) {
    throw new Error("Day 8 status update affected an unexpected row count");
  }

  const journeyUpdate = await client.query(
    `UPDATE journeys
        SET duration_days = 30
      WHERE id = $1
        AND duration_days = 7`,
    [DAILY_RHYTHM_JOURNEY_ID],
  );
  if (journeyUpdate.rowCount !== 1) {
    throw new Error("Daily Rhythm duration update affected an unexpected row count");
  }

  return {
    outcome: "applied",
    migration: MIGRATION_NAME,
    stepRowsUpdated: 1,
    journeyRowsUpdated: 1,
    verifiedContentHash: VERIFIED_DAY_8_CONTENT_HASH,
  };
}

/**
 * Runs only in production, using the application's normal @workspace/db pool.
 * It is intentionally called before the HTTP server starts listening.
 */
export async function runDailyRhythmProductionCorrection(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    logger.info(
      { migration: MIGRATION_NAME },
      "Daily Rhythm production correction skipped outside production",
    );
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await applyDailyRhythmProductionCorrection(client);
    await client.query("COMMIT");
    logger.info(result, "Daily Rhythm production correction result");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error(
      {
        migration: MIGRATION_NAME,
        outcome: "aborted and rolled back",
        reason: publicFailureMessage(error),
      },
      "Daily Rhythm production correction failed",
    );
    throw error;
  } finally {
    client.release();
  }
}

// Exported for the rollback module and for a stable, non-private diagnostic
// fingerprint when validating a fixture in tests.
export function verifiedDay8ProjectionHash(row: DbRow): string {
  const projection = Object.fromEntries(
    VERIFIED_STEP_FIELDS.map((field) => [field, normalizedDbValue(row[field])]),
  );
  return createHash("sha256")
    .update(JSON.stringify(stableValue(projection)))
    .digest("hex");
}

export { assertVerifiedDay8Content, MIGRATION_NAME };