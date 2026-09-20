/**
 * Guarded rollback for daily-rhythm-production-correction-2026-09-02.
 *
 * This is not wired into normal startup. It is a manually invoked emergency
 * rollback and changes only the same two fields as the forward correction.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";
import {
  assertVerifiedDay8Content,
  DAILY_RHYTHM_DAY_8_STEP_ID,
  DAILY_RHYTHM_JOURNEY_ID,
  MIGRATION_NAME,
} from "./daily-rhythm-production-correction.js";

const ROLLBACK_NAME = `${MIGRATION_NAME}-rollback`;

export type DailyRhythmRollbackResult =
  | { outcome: "rolled back"; migration: string; stepRowsUpdated: 1; journeyRowsUpdated: 1 }
  | { outcome: "already rolled back"; migration: string; stepRowsUpdated: 0; journeyRowsUpdated: 0 };

type DbRow = Record<string, unknown>;

export async function applyDailyRhythmProductionCorrectionRollback(
  client: {
    query<T extends DbRow = DbRow>(
      text: string,
      values?: readonly unknown[],
    ): Promise<{ rows: T[]; rowCount: number | null }>;
  },
): Promise<DailyRhythmRollbackResult> {
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
    throw new Error("verified Daily Rhythm rollback rows are missing");
  }
  if (
    journey.id !== DAILY_RHYTHM_JOURNEY_ID ||
    journey.journey_type !== "daily-rhythm" ||
    journey.deleted_at !== null ||
    step.id !== DAILY_RHYTHM_DAY_8_STEP_ID ||
    step.journey_id !== DAILY_RHYTHM_JOURNEY_ID ||
    step.day !== 8 ||
    step.deleted_at !== null
  ) {
    throw new Error("verified Daily Rhythm rollback identity guard failed");
  }

  assertVerifiedDay8Content(step);

  if (step.status === "Draft" && journey.duration_days === 7) {
    return {
      outcome: "already rolled back",
      migration: ROLLBACK_NAME,
      stepRowsUpdated: 0,
      journeyRowsUpdated: 0,
    };
  }

  if (step.status !== "Published" || journey.duration_days !== 30) {
    throw new Error("verified post-correction rollback guard failed");
  }

  const stepUpdate = await client.query(
    `UPDATE journey_steps
        SET status = 'Draft'
      WHERE id = $1
        AND status = 'Published'`,
    [DAILY_RHYTHM_DAY_8_STEP_ID],
  );
  if (stepUpdate.rowCount !== 1) {
    throw new Error("Day 8 rollback status update affected an unexpected row count");
  }

  const journeyUpdate = await client.query(
    `UPDATE journeys
        SET duration_days = 7
      WHERE id = $1
        AND duration_days = 30`,
    [DAILY_RHYTHM_JOURNEY_ID],
  );
  if (journeyUpdate.rowCount !== 1) {
    throw new Error("Daily Rhythm rollback duration update affected an unexpected row count");
  }

  return {
    outcome: "rolled back",
    migration: ROLLBACK_NAME,
    stepRowsUpdated: 1,
    journeyRowsUpdated: 1,
  };
}

/**
 * Manual rollback entry point. It intentionally refuses to run outside
 * production, and it is never called by the normal application startup path.
 */
export async function runDailyRhythmProductionCorrectionRollback(): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    throw new Error("Daily Rhythm production rollback requires NODE_ENV=production");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await applyDailyRhythmProductionCorrectionRollback(client);
    await client.query("COMMIT");
    logger.warn(result, "Daily Rhythm production correction rollback result");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error(
      { migration: ROLLBACK_NAME, outcome: "aborted and rolled back" },
      "Daily Rhythm production correction rollback failed",
    );
    throw error;
  } finally {
    client.release();
  }
}

export { ROLLBACK_NAME };