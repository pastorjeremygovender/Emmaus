import { pool } from "@workspace/db";
import { deleteSessionsForUser } from "./oidc-auth.js";

export type AccountLifecycleAction = "removed" | "reinstated" | "permanently_deleted";

export type AccountLifecycleEvent = {
  id: string;
  action: AccountLifecycleAction;
  actorId: string;
  occurredAt: string;
  detail: Record<string, unknown>;
};

type LockedAccount = {
  id: string;
  email: string;
  role: "user" | "admin" | "superAdmin";
  accountStatus: "active" | "removed";
};

export type PermanentlyDeletedAccount = {
  id: string;
  email: string;
  deletedAt: string;
};

type DbClient = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
};

export class AccountLifecycleError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "AccountLifecycleError";
  }
}

const REQUIRED_PURGE_TABLES = [
  "user_journey_progress",
  "step_reflections",
  "devotional_progress",
  "sermon_companion_progress",
  "user_bible_data",
  "user_favourites",
  "user_history",
  "room_members",
  "room_messages",
  "room_prayer_requests",
  "room_session_attendance",
  "room_session_acknowledgements",
  "room_highlights",
  "room_shared_notes",
  "room_poll_votes",
  "room_emmaus_answers",
  "room_journeys",
  "rooms",
  "room_sessions",
  "room_polls",
  "room_media_presentations",
  "permanently_deleted_accounts",
  "attendance_records",
  "person_attendance_expectations",
  "care_signals",
  "pastoral_milestones",
  "discipleship_signals",
  "ministry_tasks",
  "pastoral_workflow_notes",
  "pastoral_audit_log",
  "pastoral_persons",
] as const;

async function withLockedAccount<T>(
  accountId: string,
  run: (client: DbClient, account: LockedAccount) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [accountId]);
    const accountResult = await client.query<{
      id: string;
      email: string;
      app_role: LockedAccount["role"];
      account_status: LockedAccount["accountStatus"];
    }>(
      `SELECT u.id, u.email, up.app_role, up.account_status
       FROM users u
       INNER JOIN user_profiles up ON up.auth_subject = u.id
       WHERE u.id = $1
       FOR UPDATE OF u, up`,
      [accountId],
    );
    const row = accountResult.rows[0];
    if (!row) throw new AccountLifecycleError("This member account no longer exists.", 404);
    const result = await run(client, {
      id: row.id,
      email: row.email,
      role: row.app_role,
      accountStatus: row.account_status,
    });
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function assertManageable(account: LockedAccount, actorId: string): void {
  if (account.id === actorId) {
    throw new AccountLifecycleError("You cannot remove your own account.");
  }
  if (account.role !== "user") {
    throw new AccountLifecycleError(
      "Only member accounts can be removed here. Administrator accounts are protected.",
      403,
    );
  }
}

async function writeAudit(
  client: DbClient,
  input: {
    accountId: string;
    action: AccountLifecycleAction;
    actorId: string;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query(
    `INSERT INTO account_lifecycle_audit (account_id, action, actor_id, detail)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [input.accountId, input.action, input.actorId, JSON.stringify(input.detail ?? {})],
  );
}

export async function removeAccountRetainingData(input: {
  accountId: string;
  actorId: string;
}): Promise<{ id: string; email: string; alreadyRemoved: boolean }> {
  return withLockedAccount(input.accountId, async (client, account) => {
    assertManageable(account, input.actorId);
    if (account.accountStatus === "removed") {
      // A provider suspension may have failed after the local access gate was
      // applied. Treat retry as safe and do not duplicate the audit event.
      return { id: account.id, email: account.email, alreadyRemoved: true };
    }
    await client.query(
      `UPDATE user_profiles
       SET account_status = 'removed', removed_at = NOW(), removed_by = $2, updated_at = NOW()
       WHERE auth_subject = $1`,
      [account.id, input.actorId],
    );
    await deleteSessionsForUser(account.id);
    await writeAudit(client, {
      accountId: account.id,
      action: "removed",
      actorId: input.actorId,
      detail: { dataRetained: true },
    });
    return { id: account.id, email: account.email, alreadyRemoved: false };
  });
}

export async function reinstateAccount(input: {
  accountId: string;
  actorId: string;
}): Promise<{ id: string; email: string }> {
  return withLockedAccount(input.accountId, async (client, account) => {
    assertManageable(account, input.actorId);
    if (account.accountStatus !== "removed") {
      throw new AccountLifecycleError("This account is already active.", 409);
    }
    await client.query(
      `UPDATE user_profiles
       SET account_status = 'active', removed_at = NULL, removed_by = NULL, updated_at = NOW()
       WHERE auth_subject = $1`,
      [account.id],
    );
    await writeAudit(client, {
      accountId: account.id,
      action: "reinstated",
      actorId: input.actorId,
      detail: { dataRetained: true },
    });
    return { id: account.id, email: account.email };
  });
}

async function assertPurgeCoverage(client: DbClient): Promise<void> {
  const result = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
    [REQUIRED_PURGE_TABLES],
  );
  const present = new Set(result.rows.map((row) => String(row.table_name)));
  const missing = REQUIRED_PURGE_TABLES.filter((table) => !present.has(table));
  if (missing.length > 0) {
    throw new AccountLifecycleError(
      `Permanent deletion is unavailable until account data coverage is complete (${missing.join(", ")}).`,
      503,
    );
  }
}

/** Check completeness before an irreversible provider deletion is attempted. */
export async function assertPermanentPurgeAvailable(): Promise<void> {
  const client = await pool.connect();
  try {
    await assertPurgeCoverage(client);
  } finally {
    client.release();
  }
}

export async function permanentlyDeleteRemovedAccount(input: {
  accountId: string;
  actorId: string;
  confirmationEmail: string;
}): Promise<{ id: string; email: string }> {
  return withLockedAccount(input.accountId, async (client, account) => {
    assertManageable(account, input.actorId);
    if (account.accountStatus !== "removed") {
      throw new AccountLifecycleError("Remove the account and retain its data before permanently deleting it.", 409);
    }
    if (account.email.toLowerCase() !== input.confirmationEmail.trim().toLowerCase()) {
      throw new AccountLifecycleError("Enter the member's email address to confirm permanent deletion.");
    }
    await assertPurgeCoverage(client);

    const id = account.id;
    const personPredicate = [id, "emmaus_user"];
    // Shared rooms remain available to their other members. Remove private
    // contributions and replace creator references with a non-identifying
    // marker rather than deleting an entire group or session.
    await client.query(
      `UPDATE rooms
       SET created_by = CASE WHEN created_by = $1 THEN 'deleted-account' ELSE created_by END,
           video_started_by = CASE WHEN video_started_by = $1 THEN 'deleted-account' ELSE video_started_by END
       WHERE created_by = $1 OR video_started_by = $1`,
      [id],
    );
    await client.query(`UPDATE room_sessions SET started_by = 'deleted-account' WHERE started_by = $1`, [id]);
    await client.query(`UPDATE room_polls SET created_by = 'deleted-account' WHERE created_by = $1`, [id]);
    await client.query(
      `UPDATE room_media_presentations
       SET presented_by = 'deleted-account', presented_by_name = 'Deleted member'
       WHERE presented_by = $1`,
      [id],
    );
    await client.query(`DELETE FROM room_poll_votes WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM room_emmaus_answers WHERE asked_by = $1`, [id]);
    await client.query(`DELETE FROM room_highlights WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM room_shared_notes WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM room_session_acknowledgements WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM room_session_attendance WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM room_prayer_requests WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM room_messages WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM room_journeys WHERE started_by = $1`, [id]);
    await client.query(`DELETE FROM room_members WHERE user_id = $1`, [id]);

    await client.query(`DELETE FROM pastoral_workflow_notes WHERE person_id = $1 AND person_type = $2`, personPredicate);
    await client.query(`DELETE FROM ministry_tasks WHERE person_id = $1 AND person_type = $2`, personPredicate);
    await client.query(`DELETE FROM discipleship_signals WHERE person_id = $1 AND person_type = $2`, personPredicate);
    await client.query(`DELETE FROM pastoral_milestones WHERE person_id = $1 AND person_type = $2`, personPredicate);
    await client.query(`DELETE FROM care_signals WHERE person_id = $1 AND person_type = $2`, personPredicate);
    await client.query(`DELETE FROM person_attendance_expectations WHERE person_id = $1 AND person_type = $2`, personPredicate);
    await client.query(`DELETE FROM attendance_records WHERE person_id = $1 AND person_type = $2`, personPredicate);
    await client.query(`DELETE FROM pastoral_audit_log WHERE person_id = $1`, [id]);
    await client.query(`DELETE FROM pastoral_persons WHERE linked_user_id = $1`, [id]);

    await client.query(`DELETE FROM step_reflections WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM user_journey_progress WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM devotional_progress WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM sermon_companion_progress WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM user_bible_data WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM user_favourites WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM user_history WHERE user_id = $1`, [id]);
    await client.query(`DELETE FROM sessions WHERE sess -> 'user' ->> 'id' = $1`, [id]);

    await client.query(
      `INSERT INTO permanently_deleted_accounts (account_id, email, deleted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (account_id) DO NOTHING`,
      [id, account.email, input.actorId],
    );
    await client.query(`DELETE FROM user_profiles WHERE auth_subject = $1`, [id]);
    await client.query(`DELETE FROM auth_bootstrap_state WHERE claimed_by = $1`, [id]);
    await client.query(`DELETE FROM users WHERE id = $1`, [id]);
    await writeAudit(client, {
      accountId: id,
      action: "permanently_deleted",
      actorId: input.actorId,
      detail: { dataRetained: false },
    });
    return { id, email: account.email };
  });
}

export async function getPermanentlyDeletedAccount(
  accountId: string,
): Promise<PermanentlyDeletedAccount | null> {
  const { rows } = await pool.query<{
    account_id: string;
    email: string;
    deleted_at: Date;
  }>(
    `SELECT account_id, email, deleted_at
     FROM permanently_deleted_accounts
     WHERE account_id = $1`,
    [accountId],
  );
  const row = rows[0];
  return row
    ? { id: row.account_id, email: row.email, deletedAt: row.deleted_at.toISOString() }
    : null;
}

export async function getAccountLifecycleCandidate(
  accountId: string,
): Promise<{ id: string; email: string } | null> {
  const { rows } = await pool.query<{ id: string; email: string }>(
    `SELECT u.id, u.email
     FROM users u
     INNER JOIN user_profiles up ON up.auth_subject = u.id
     WHERE u.id = $1`,
    [accountId],
  );
  return rows[0] ?? null;
}

export async function isPermanentlyDeletedAccount(accountId: string): Promise<boolean> {
  return (await getPermanentlyDeletedAccount(accountId)) !== null;
}

export async function listAccountLifecycleEvents(accountId: string): Promise<AccountLifecycleEvent[]> {
  const { rows } = await pool.query<{
    id: string;
    action: AccountLifecycleAction;
    actor_id: string;
    occurred_at: Date;
    detail: Record<string, unknown>;
  }>(
    `SELECT id, action, actor_id, occurred_at, detail
     FROM account_lifecycle_audit
     WHERE account_id = $1
     ORDER BY occurred_at DESC`,
    [accountId],
  );
  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actor_id,
    occurredAt: row.occurred_at.toISOString(),
    detail: row.detail ?? {},
  }));
}