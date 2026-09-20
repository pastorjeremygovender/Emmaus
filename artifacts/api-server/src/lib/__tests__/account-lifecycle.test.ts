import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import crypto from "node:crypto";
import { db, pool, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ensureAuthSchema } from "../ensure-auth-schema.ts";
import {
  AccountLifecycleError,
  listAccountLifecycleEvents,
  permanentlyDeleteRemovedAccount,
  reinstateAccount,
  removeAccountRetainingData,
  isPermanentlyDeletedAccount,
} from "../account-lifecycle-store.ts";
import { createSession } from "../oidc-auth.ts";
import { listEmmausAccounts, listUnifiedPeople } from "../pastoral-store.ts";

if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("account-lifecycle.test: refused to run in production/deployment");
}
if (process.env.ALLOW_TEST_AUTH_HARNESS !== "1" || process.env.NODE_ENV !== "test") {
  throw new Error("account-lifecycle.test: set NODE_ENV=test and ALLOW_TEST_AUTH_HARNESS=1");
}

const { upsertVerifiedIdentity } = await import("../../routes/auth.ts");
const nonce = crypto.randomBytes(6).toString("hex");
const memberId = `__TEST__-account-lifecycle-member-${nonce}`;
const memberEmail = `account-lifecycle-${nonce}@test.invalid`;
const actorId = `__TEST__-account-lifecycle-admin-${nonce}`;
const actorEmail = `account-lifecycle-admin-${nonce}@test.invalid`;
const permanentId = `__TEST__-account-lifecycle-delete-${nonce}`;
const permanentEmail = `account-lifecycle-delete-${nonce}@test.invalid`;

async function cleanup(): Promise<void> {
  const ids = [memberId, actorId, permanentId];
  await pool.query(`DELETE FROM permanently_deleted_accounts WHERE account_id = ANY($1::text[])`, [ids]);
  await pool.query(`DELETE FROM account_lifecycle_audit WHERE account_id = ANY($1::text[])`, [ids]);
  await pool.query(`DELETE FROM step_reflections WHERE user_id = ANY($1::text[])`, [ids]);
  await pool.query(`DELETE FROM user_journey_progress WHERE user_id = ANY($1::text[])`, [ids]);
  await pool.query(`DELETE FROM user_bible_data WHERE user_id = ANY($1::text[])`, [ids]);
  await pool.query(`DELETE FROM user_profiles WHERE auth_subject = ANY($1::text[])`, [ids]);
  await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [ids]);
}

async function createIdentity(id: string, email: string, firstName: string): Promise<void> {
  await upsertVerifiedIdentity({ sub: id, email, email_verified: true, first_name: firstName });
}

describe("member account lifecycle", () => {
  before(async () => {
    await ensureAuthSchema();
    await cleanup();
    await createIdentity(actorId, actorEmail, "Admin");
    await pool.query(`UPDATE user_profiles SET app_role = 'superAdmin' WHERE auth_subject = $1`, [actorId]);
    await createIdentity(memberId, memberEmail, "Member");
    await createIdentity(permanentId, permanentEmail, "Delete");
  });

  after(cleanup);

  it("removes access while preserving progress, then reinstates the same identity", async () => {
    const journey = await pool.query<{ id: string }>(
      `SELECT id FROM journeys ORDER BY created_at ASC LIMIT 1`,
    );
    assert.ok(journey.rows[0], "test requires one seeded journey");
    await pool.query(
      `INSERT INTO user_journey_progress (user_id, journey_id, current_day, completed_days, status)
       VALUES ($1, $2, 3, '[1,2]'::jsonb, 'active')`,
      [memberId, journey.rows[0].id],
    );
    await pool.query(
      `INSERT INTO step_reflections (user_id, journey_id, day, reflection)
       VALUES ($1, $2, 2, 'Keep this reflection')`,
      [memberId, journey.rows[0].id],
    );
    await pool.query(
      `INSERT INTO user_bible_data (user_id, data) VALUES ($1, '{"savedVerses":["John 1:1"]}'::jsonb)`,
      [memberId],
    );
    const sid = await createSession({
      user: { id: memberId, email: memberEmail, firstName: "Member", lastName: null, profileImageUrl: null },
      access_token: "test-token",
    });

    await removeAccountRetainingData({ accountId: memberId, actorId });
    const retry = await removeAccountRetainingData({ accountId: memberId, actorId });
    assert.equal(retry.alreadyRemoved, true, "a provider-lock retry must not fail after local removal");

    assert.equal((await listEmmausAccounts()).some((account) => account.id === memberId), false);
    assert.equal((await listEmmausAccounts("removed")).some((account) => account.id === memberId), true);
    assert.equal((await listUnifiedPeople()).some((person) => person.id === memberId), false);
    const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.sid, sid));
    assert.equal(session, undefined, "all opaque member sessions must be invalidated");
    const retained = await pool.query<{ current_day: number; reflections: string; data: unknown }>(
      `SELECT ujp.current_day,
              (SELECT COUNT(*)::text FROM step_reflections WHERE user_id = $1) AS reflections,
              (SELECT data FROM user_bible_data WHERE user_id = $1) AS data
       FROM user_journey_progress ujp WHERE ujp.user_id = $1`,
      [memberId],
    );
    assert.equal(retained.rows[0]?.current_day, 3);
    assert.equal(retained.rows[0]?.reflections, "1");
    assert.deepEqual(retained.rows[0]?.data, { savedVerses: ["John 1:1"] });

    await reinstateAccount({ accountId: memberId, actorId });
    const restored = (await listEmmausAccounts()).find((account) => account.id === memberId);
    assert.equal(restored?.currentDay, 3, "the original walk position must be available after reinstatement");
    assert.equal(restored?.reflectionCount, 1);
    assert.equal((await listUnifiedPeople()).some((person) => person.id === memberId), true);
    assert.deepEqual(
      (await listAccountLifecycleEvents(memberId)).map((event) => event.action),
      ["reinstated", "removed"],
    );
  });

  it("requires the exact member email before permanently deleting retained data", async () => {
    await removeAccountRetainingData({ accountId: permanentId, actorId });
    await assert.rejects(
      permanentlyDeleteRemovedAccount({
        accountId: permanentId,
        actorId,
        confirmationEmail: "wrong@example.test",
      }),
      (error: unknown) => error instanceof AccountLifecycleError,
    );
    assert.equal((await listEmmausAccounts("removed")).some((account) => account.id === permanentId), true);
  });

  it("permanently purges the verified identity and supported member records after confirmation", async () => {
    const deleted = await permanentlyDeleteRemovedAccount({
      accountId: permanentId,
      actorId,
      confirmationEmail: permanentEmail,
    });
    assert.equal(deleted.id, permanentId);
    const identity = await pool.query(`SELECT id FROM users WHERE id = $1`, [permanentId]);
    const profile = await pool.query(`SELECT email FROM user_profiles WHERE auth_subject = $1`, [permanentId]);
    assert.equal(identity.rows.length, 0);
    assert.equal(profile.rows.length, 0);
    assert.equal(await isPermanentlyDeletedAccount(permanentId), true);
    assert.deepEqual(
      (await listAccountLifecycleEvents(permanentId)).map((event) => event.action),
      ["permanently_deleted", "removed"],
    );
    await assert.rejects(
      upsertVerifiedIdentity({
        sub: permanentId,
        email: permanentEmail,
        email_verified: true,
        first_name: "Resurfaced",
      }),
      /permanently deleted/i,
      "a delayed provider login must never recreate a tombstoned identity",
    );
    const resurfacedIdentity = await pool.query(`SELECT id FROM users WHERE id = $1`, [permanentId]);
    const resurfacedProfile = await pool.query(`SELECT email FROM user_profiles WHERE auth_subject = $1`, [permanentId]);
    assert.equal(resurfacedIdentity.rows.length, 0);
    assert.equal(resurfacedProfile.rows.length, 0);
  });
});