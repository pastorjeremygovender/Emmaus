import { pool } from "@workspace/db";
import { isValidIanaTimezone, isValidReminderTime } from "./reminder-validation.js";

export { isValidIanaTimezone, isValidReminderTime } from "./reminder-validation.js";

export type ReminderPreferences = { reminderTime: string; timezone: string };
export type StoredReminderSubscription = ReminderPreferences & {
  id: string;
  userId: string;
  endpoint: string;
  subscription: string;
  active: boolean;
};

export async function upsertReminderSubscription(
  userId: string,
  endpoint: string,
  subscription: string,
  preferences: ReminderPreferences,
): Promise<boolean> {
  const result = await pool.query(
    `INSERT INTO reminder_subscriptions (user_id, endpoint, subscription, reminder_time, timezone)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (endpoint) DO UPDATE SET
       subscription = EXCLUDED.subscription,
       reminder_time = EXCLUDED.reminder_time, timezone = EXCLUDED.timezone,
       active = true, updated_at = now()
     WHERE reminder_subscriptions.user_id = EXCLUDED.user_id
     RETURNING id`,
    [userId, endpoint, subscription, preferences.reminderTime, preferences.timezone],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getReminderSubscription(userId: string, endpoint: string) {
  const result = await pool.query(
    `SELECT endpoint, reminder_time AS "reminderTime", timezone, active
       FROM reminder_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint],
  );
  return result.rows[0] as { endpoint: string; reminderTime: string; timezone: string; active: boolean } | undefined;
}

export async function getUserReminderPreferences(userId: string): Promise<ReminderPreferences | undefined> {
  const result = await pool.query(
    `SELECT reminder_time AS "reminderTime", timezone
       FROM reminder_subscriptions
      WHERE user_id = $1
      ORDER BY active DESC, updated_at DESC
      LIMIT 1`,
    [userId],
  );
  return result.rows[0] as ReminderPreferences | undefined;
}

export async function updateReminderPreferences(userId: string, preferences: ReminderPreferences): Promise<number> {
  const result = await pool.query(
    `UPDATE reminder_subscriptions SET reminder_time = $2, timezone = $3, updated_at = now()
      WHERE user_id = $1`,
    [userId, preferences.reminderTime, preferences.timezone],
  );
  return result.rowCount ?? 0;
}

export async function deactivateReminderSubscription(userId: string, endpoint: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE reminder_subscriptions
        SET active = false, updated_at = now()
      WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function getOwnedReminderSubscription(userId: string, endpoint: string): Promise<StoredReminderSubscription | undefined> {
  const result = await pool.query(
    `SELECT id, user_id AS "userId", endpoint, subscription, active,
            reminder_time AS "reminderTime", timezone
       FROM reminder_subscriptions WHERE user_id = $1 AND endpoint = $2`,
    [userId, endpoint],
  );
  return result.rows[0] as StoredReminderSubscription | undefined;
}

export async function listReminderSubscriptions(): Promise<StoredReminderSubscription[]> {
  const result = await pool.query(
    `SELECT id, user_id AS "userId", endpoint, subscription, active,
            reminder_time AS "reminderTime", timezone
       FROM reminder_subscriptions
      WHERE active = true`,
  );
  return result.rows as StoredReminderSubscription[];
}

/** Atomically reserve a device/day before attempting the network delivery. */
export async function claimReminderDelivery(subscriptionId: string, localDate: string): Promise<string | undefined> {
  const result = await pool.query(
    `INSERT INTO reminder_delivery_ledger (subscription_id, local_date, status)
     VALUES ($1, $2, 'claimed')
     ON CONFLICT (subscription_id, local_date) DO NOTHING
     RETURNING id`,
    [subscriptionId, localDate],
  );
  return result.rows[0]?.id as string | undefined;
}

export async function markReminderDelivery(
  id: string,
  status: "delivered" | "failed" | "skipped",
  error?: string,
): Promise<void> {
  await pool.query(
    `UPDATE reminder_delivery_ledger
        SET status = $2, error = $3, delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE NULL END,
            updated_at = now()
      WHERE id = $1`,
    [id, status, error?.slice(0, 1000) ?? null],
  );
}

export async function deactivateReminderSubscriptionById(id: string): Promise<void> {
  await pool.query(
    `UPDATE reminder_subscriptions SET active = false, updated_at = now() WHERE id = $1`,
    [id],
  );
}

/**
 * Daily Rhythm's server-owned opening ledger is the completion authority.
 * Compare the completion instant with the reminder's local day rather than
 * trusting a date label that may have been written in an earlier timezone.
 */
export async function hasCompletedDailyRhythm(
  userId: string,
  localDate: string,
  timezone: string,
): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM daily_rhythm_opening_ledger
      WHERE user_id = $1
        AND completed_today = true
        AND updated_at >= ($2::date::timestamp AT TIME ZONE $3)
        AND updated_at < (($2::date + 1)::timestamp AT TIME ZONE $3)
      LIMIT 1`,
    [userId, localDate, timezone],
  );
  return result.rows.length > 0;
}