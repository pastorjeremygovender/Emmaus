import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool } from "@workspace/db";
import {
  applyDailyRhythmProductionCorrection,
  DAILY_RHYTHM_DAY_8_STEP_ID,
  DAILY_RHYTHM_JOURNEY_ID,
  VERIFIED_DAY_8_CONTENT_HASH,
} from "../daily-rhythm-production-correction.js";
import {
  applyDailyRhythmProductionCorrectionRollback,
} from "../daily-rhythm-production-correction-rollback.js";

type DbRow = Record<string, unknown>;

async function selectTargetRows(client: {
  query<T extends DbRow = DbRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
}) {
  const journey = await client.query<DbRow>(
    "SELECT id, duration_days FROM journeys WHERE id = $1",
    [DAILY_RHYTHM_JOURNEY_ID],
  );
  const step = await client.query<DbRow>(
    `SELECT id, journey_id, day, title, content, status, mentor_intro,
            scripture, teaching_content, reflection_question, prayer,
            todays_action, memory_verse, preferred_translation,
            scripture_references, suggested_sermons,
            suggested_follow_up_questions, unlock_conditions,
            is_completion_step, display_label, share_image_url,
            display_order, deleted_at
       FROM journey_steps
      WHERE id = $1`,
    [DAILY_RHYTHM_DAY_8_STEP_ID],
  );
  return { journey: journey.rows[0], step: step.rows[0] };
}

describe("Daily Rhythm production correction", () => {
  before(async () => {
    const baseline = await selectTargetRows(pool);
    assert.ok(baseline.journey, "development journey fixture is present");
    assert.ok(baseline.step, "development Day 8 fixture is present");
  });

  it("applies only the guarded two-field correction, then is idempotent", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE journey_steps SET status = 'Draft' WHERE id = $1",
        [DAILY_RHYTHM_DAY_8_STEP_ID],
      );
      await client.query(
        "UPDATE journeys SET duration_days = 7 WHERE id = $1",
        [DAILY_RHYTHM_JOURNEY_ID],
      );

      const before = await selectTargetRows(client);
      const first = await applyDailyRhythmProductionCorrection(client);
      assert.equal(first.outcome, "applied");
      assert.equal(first.verifiedContentHash, VERIFIED_DAY_8_CONTENT_HASH);

      const afterFirst = await selectTargetRows(client);
      assert.equal(afterFirst.step.status, "Published");
      assert.equal(afterFirst.journey.duration_days, 30);
      assert.deepEqual(
        { ...afterFirst.step, status: "Draft" },
        { ...before.step, status: "Draft" },
        "only the Day 8 status changed",
      );
      assert.deepEqual(
        { ...afterFirst.journey, duration_days: 7 },
        { ...before.journey, duration_days: 7 },
        "only the journey duration changed",
      );

      const second = await applyDailyRhythmProductionCorrection(client);
      assert.equal(second.outcome, "already applied");
      assert.deepEqual(await selectTargetRows(client), afterFirst);

      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  it("aborts before writing when verified Day 8 content differs", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "UPDATE journey_steps SET status = 'Draft', title = '__MIGRATION_GUARD_TEST__' WHERE id = $1",
        [DAILY_RHYTHM_DAY_8_STEP_ID],
      );
      await client.query(
        "UPDATE journeys SET duration_days = 7 WHERE id = $1",
        [DAILY_RHYTHM_JOURNEY_ID],
      );

      await assert.rejects(
        () => applyDailyRhythmProductionCorrection(client),
        /verified Day 8 content guard failed/,
      );
      const unchanged = await selectTargetRows(client);
      assert.equal(unchanged.step.status, "Draft");
      assert.equal(unchanged.journey.duration_days, 7);
      assert.equal(unchanged.step.title, "__MIGRATION_GUARD_TEST__");

      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });

  it("guards and rolls back only the same two fields", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const before = await selectTargetRows(client);
      const result = await applyDailyRhythmProductionCorrectionRollback(client);
      assert.equal(result.outcome, "rolled back");
      const after = await selectTargetRows(client);
      assert.equal(after.step.status, "Draft");
      assert.equal(after.journey.duration_days, 7);
      assert.deepEqual(
        { ...after.step, status: "Published" },
        { ...before.step, status: "Published" },
        "rollback changed no Day 8 fields other than status",
      );
      assert.deepEqual(
        { ...after.journey, duration_days: 30 },
        { ...before.journey, duration_days: 30 },
        "rollback changed no journey fields other than duration",
      );
      assert.equal(
        (await applyDailyRhythmProductionCorrectionRollback(client)).outcome,
        "already rolled back",
      );
      await client.query("ROLLBACK");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  });
});

after(async () => {
  await pool.end().catch(() => {});
});