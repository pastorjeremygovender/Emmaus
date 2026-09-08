import { pool } from "@workspace/db";
import { logger } from "./logger.js";

export const KNOWN_ACCOUNT_FIXTURE_EMAILS = Object.freeze([
  "demo@emmaus.church",
]);

const CLEANUP_KEY = "remove-confirmed-demo-profile-2026-08-19";

export interface AccountFixtureCandidate {
  email: string;
  authSubject: string | null;
  appRole: string;
  hasAttachedData?: boolean;
}

/**
 * Deliberately narrow: only the one production-previewed fixture is eligible,
 * and only while it is unverified, unprivileged, data-free, and not the owner.
 */
export function canRemoveKnownAccountFixture(
  candidate: AccountFixtureCandidate,
  initialOwnerEmail = process.env.EMMAUS_INITIAL_SUPERADMIN_EMAIL ?? "",
): boolean {
  const email = candidate.email.trim().toLowerCase();
  return (
    KNOWN_ACCOUNT_FIXTURE_EMAILS.includes(email) &&
    email !== initialOwnerEmail.trim().toLowerCase() &&
    candidate.authSubject == null &&
    candidate.appRole === "user" &&
    candidate.hasAttachedData !== true
  );
}

/**
 * Auditable, one-time removal of the single confirmed persisted demo profile.
 *
 * A durable receipt prevents the cleanup from ever targeting a future account
 * that happens to reuse the same email. The transaction also refuses to delete
 * a verified, privileged, owner, or data-bearing profile.
 */
export async function removeKnownAccountFixtures(): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS maintenance_receipts (
      key text PRIMARY KEY,
      outcome text NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb,
      applied_at timestamptz NOT NULL DEFAULT NOW()
    )
  `);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      [CLEANUP_KEY],
    );

    const receipt = await client.query(
      "SELECT outcome FROM maintenance_receipts WHERE key = $1",
      [CLEANUP_KEY],
    );
    if (receipt.rows.length > 0) {
      await client.query("COMMIT");
      return [];
    }

    const email = KNOWN_ACCOUNT_FIXTURE_EMAILS[0];
    const candidateResult = await client.query<{
      email: string;
      auth_subject: string | null;
      app_role: string;
    }>(
      `SELECT email, auth_subject, app_role
       FROM user_profiles
       WHERE LOWER(email) = $1
       FOR UPDATE`,
      [email],
    );
    const row = candidateResult.rows[0];

    let hasAttachedData = false;
    if (row) {
      const attached = await client.query<{ has_attached_data: boolean }>(
        `SELECT (
          EXISTS (SELECT 1 FROM users WHERE LOWER(email) = $1)
          OR EXISTS (SELECT 1 FROM sessions WHERE LOWER(sess #>> '{user,email}') = $1 OR sess #>> '{user,id}' = $1)
          OR EXISTS (SELECT 1 FROM user_journey_progress WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM step_reflections WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM devotional_progress WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM sermon_companion_progress WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM user_bible_data WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM user_favourites WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM user_history WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM room_members WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM room_messages WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM room_session_attendance WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM room_session_acknowledgements WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM room_highlights WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM room_shared_notes WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM room_poll_votes WHERE user_id = $1)
          OR EXISTS (SELECT 1 FROM room_emmaus_answers WHERE asked_by = $1)
          OR EXISTS (SELECT 1 FROM room_polls WHERE created_by = $1)
          OR EXISTS (SELECT 1 FROM room_media_presentations WHERE presented_by = $1)
          OR EXISTS (SELECT 1 FROM room_sessions WHERE started_by = $1)
          OR EXISTS (SELECT 1 FROM room_journeys WHERE started_by = $1)
          OR EXISTS (
            SELECT 1 FROM pastoral_persons
            WHERE LOWER(COALESCE(email, '')) = $1 OR linked_user_id = $1
          )
          OR EXISTS (
            SELECT 1 FROM attendance_records
            WHERE person_type = 'emmaus_user' AND person_id = $1
          )
          OR EXISTS (
            SELECT 1 FROM care_signals
            WHERE person_type = 'emmaus_user' AND person_id = $1
          )
          OR EXISTS (
            SELECT 1 FROM discipleship_signals
            WHERE person_type = 'emmaus_user' AND person_id = $1
          )
        ) AS has_attached_data`,
        [email],
      );
      hasAttachedData = attached.rows[0]?.has_attached_data === true;
    }

    const candidate = row
      ? {
          email: row.email,
          authSubject: row.auth_subject,
          appRole: row.app_role,
          hasAttachedData,
        }
      : null;

    let outcome = "not_found";
    const removedEmails: string[] = [];
    if (candidate && canRemoveKnownAccountFixture(candidate)) {
      const removed = await client.query<{ email: string }>(
        `DELETE FROM user_profiles
         WHERE LOWER(email) = $1
           AND auth_subject IS NULL
           AND app_role = 'user'
         RETURNING email`,
        [email],
      );
      if (removed.rows[0]) {
        removedEmails.push(removed.rows[0].email.toLowerCase());
        outcome = "removed";
      }
    } else if (candidate) {
      outcome = "skipped_protected";
    }

    await client.query(
      `INSERT INTO maintenance_receipts (key, outcome, details)
       VALUES ($1, $2, $3::jsonb)`,
      [
        CLEANUP_KEY,
        outcome,
        JSON.stringify({
          email,
          profileFound: Boolean(candidate),
          verified: Boolean(candidate?.authSubject),
          appRole: candidate?.appRole ?? null,
          hasAttachedData,
        }),
      ],
    );
    await client.query("COMMIT");

    logger.info(
      { accountFixtureCleanup: { email, outcome } },
      "Startup cleanup: confirmed account fixture handled",
    );
    return removedEmails;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}