/**
 * Safe, idempotent Daily Rhythm opening schema readiness.
 *
 * Schema DDL only: this module never inserts, updates or deletes user/content
 * records. It replaces the required fragment of the retired legacy migration
 * runner.
 */
import { pool } from "@workspace/db";
import { setDailyRhythmOpeningReady } from "./feature-flags.js";

export async function ensureDailyRhythmOpeningSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '10s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    await client.query(`
      ALTER TABLE user_profiles
        ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Africa/Johannesburg';

      ALTER TABLE user_journey_progress
        ADD COLUMN IF NOT EXISTS daily_rhythm_unlock_at timestamptz,
        ADD COLUMN IF NOT EXISTS daily_rhythm_timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
        ADD COLUMN IF NOT EXISTS last_daily_open_date text,
        ADD COLUMN IF NOT EXISTS daily_rhythm_startup_session text,
        ADD COLUMN IF NOT EXISTS daily_rhythm_startup_date text;

      CREATE TABLE IF NOT EXISTS daily_rhythm_opening_ledger (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id text NOT NULL,
        journey_id text NOT NULL REFERENCES journeys(id) ON DELETE CASCADE,
        local_date text NOT NULL,
        local_timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
        assigned_day integer NOT NULL,
        target_step_id uuid REFERENCES journey_steps(id) ON DELETE SET NULL,
        state text NOT NULL,
        completed_today boolean NOT NULL DEFAULT false,
        destination text NOT NULL,
        reason text NOT NULL,
        decision_id uuid NOT NULL DEFAULT gen_random_uuid(),
        launch_session_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE UNIQUE INDEX IF NOT EXISTS daily_rhythm_opening_user_date_unique
        ON daily_rhythm_opening_ledger (user_id, local_date);
      CREATE UNIQUE INDEX IF NOT EXISTS daily_rhythm_opening_decision_unique
        ON daily_rhythm_opening_ledger (decision_id);
    `);
    await client.query("COMMIT");
    setDailyRhythmOpeningReady();
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
