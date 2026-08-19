/**
 * auth-identity.test.ts — Focused database-backed tests for upsertVerifiedIdentity
 * and the callback/identity helpers.
 *
 * Invariants verified:
 *   1. Two distinct verified subjects/emails create two distinct user_profiles,
 *      each defaulting to the "user" app role.
 *   2. A legacy email-only profile (no authSubject) cannot be claimed by a new
 *      verified identity (IdentityConflictError).
 *   3. upsertVerifiedIdentity requires a verified email (email_verified: true);
 *      missing / false email_verified is rejected.
 *   4. upsertVerifiedIdentity requires a non-empty subject claim.
 *
 * Identities are __TEST__-scoped, unique per run (process nonce), and cleaned
 * up in the after() hook. No production data is touched.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run test:auth-identity
 */

import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import crypto from "node:crypto";
import { db, userProfilesTable, usersTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// ── env guard ─────────────────────────────────────────────────────────────────

const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error(
    "auth-identity.test: refused to run in production/deployment environment",
  );
}
if (process.env.ALLOW_TEST_AUTH_HARNESS !== "1" || nodeEnv !== "test") {
  throw new Error(
    "auth-identity.test: set NODE_ENV=test and ALLOW_TEST_AUTH_HARNESS=1",
  );
}

// ── subject under test ────────────────────────────────────────────────────────

// Imported after env guard; routes/auth.ts exports this helper for testing.
const { requireMigratedProfileForEmail, upsertVerifiedIdentity } =
  await import("../../routes/auth.ts");

// ── identity naming helpers ───────────────────────────────────────────────────

const NONCE = crypto.randomBytes(6).toString("hex");
// NOTE: email must be lowercase because upsertVerifiedIdentity lowercases the
// email claim before all lookups. A mismatch would cause the legacy-profile
// query to miss its row.
const PREFIX = `test-auth-id-${NONCE}`;
const DOMAIN = "test.invalid";

function makeIdentity(label: string): { sub: string; email: string } {
  return {
    // sub can be any string (it is the provider UUID, not lowercased)
    sub: `__TEST__-auth-id-${NONCE}-${label}`,
    // email must be lowercase to match upsertVerifiedIdentity's normalisation
    email: `${PREFIX}-${label}@${DOMAIN}`,
  };
}

// ── cleanup tracking ──────────────────────────────────────────────────────────

const createdSubjects: string[] = [];
const createdEmails: string[] = [];

async function purgeTestRows(): Promise<void> {
  if (createdSubjects.length > 0) {
    await db
      .delete(userProfilesTable)
      .where(inArray(userProfilesTable.authSubject, createdSubjects));
  }
  if (createdEmails.length > 0) {
    // Catch email-only profiles created without an authSubject
    await db
      .delete(userProfilesTable)
      .where(inArray(userProfilesTable.email, createdEmails));
  }
  if (createdSubjects.length > 0) {
    await db
      .delete(usersTable)
      .where(inArray(usersTable.id, createdSubjects));
  }
}

function track(sub: string, email: string): void {
  createdSubjects.push(sub);
  createdEmails.push(email);
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe("upsertVerifiedIdentity", () => {
  before(async () => {
    // Pre-clean any residue from a previous crashed run with the same nonce
    // (extremely unlikely but safe to do).
    await purgeTestRows();
  });

  after(async () => {
    await purgeTestRows();
  });

  it("creates two distinct user_profiles for two distinct verified subjects/emails", async () => {
    const alpha = makeIdentity("alpha");
    const beta = makeIdentity("beta");
    track(alpha.sub, alpha.email);
    track(beta.sub, beta.email);

    await upsertVerifiedIdentity({
      sub: alpha.sub,
      email: alpha.email,
      email_verified: true,
    });
    await upsertVerifiedIdentity({
      sub: beta.sub,
      email: beta.email,
      email_verified: true,
    });

    const [alphaProfile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.authSubject, alpha.sub));
    const [betaProfile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.authSubject, beta.sub));

    assert.ok(alphaProfile, "alpha profile must exist");
    assert.ok(betaProfile, "beta profile must exist");
    assert.notEqual(
      alphaProfile.email,
      betaProfile.email,
      "profiles must be distinct rows",
    );
    assert.equal(
      alphaProfile.appRole,
      "user",
      "alpha must default to user role",
    );
    assert.equal(betaProfile.appRole, "user", "beta must default to user role");
    assert.equal(alphaProfile.authSubject, alpha.sub);
    assert.equal(betaProfile.authSubject, beta.sub);
  });

  it("rejects a new verified identity claiming a legacy email-only profile", async () => {
    const legacy = makeIdentity("legacy-claim");
    track(legacy.sub, legacy.email);

    // Insert a legacy email-only profile (no authSubject) as the existing state.
    await db.insert(userProfilesTable).values({
      email: legacy.email,
      preferredName: "Legacy User",
      // authSubject intentionally omitted — simulates a pre-auth profile
    });

    // Now a new verified identity with the same email attempts to claim it.
    await assert.rejects(
      () =>
        upsertVerifiedIdentity({
          sub: legacy.sub,
          email: legacy.email,
          email_verified: true,
        }),
      (err: Error) => {
        assert.equal(
          err.name,
          "IdentityConflictError",
          "must throw IdentityConflictError for legacy email-only profile",
        );
        return true;
      },
    );

    // The users row should also not have been created (transaction rolled back).
    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, legacy.sub));
    assert.equal(user, undefined, "user row must not persist after conflict");
  });

  it("blocks sign-in, sign-up, and password-reset entry points before a legacy profile can look like a new account", async () => {
    const legacy = makeIdentity("legacy-entry-guard");
    track(legacy.sub, legacy.email);
    await db.insert(userProfilesTable).values({
      email: legacy.email,
      preferredName: "Legacy User",
    });

    await assert.rejects(
      () => requireMigratedProfileForEmail(legacy.email),
      (err: Error) => {
        assert.equal(err.name, "LegacyProfileMigrationRequiredError");
        assert.match(err.message, /secure account migration/i);
        return true;
      },
    );
  });

  it("rejects claims with email_verified: false", async () => {
    const unverified = makeIdentity("unverified-email");
    track(unverified.sub, unverified.email);

    await assert.rejects(
      () =>
        upsertVerifiedIdentity({
          sub: unverified.sub,
          email: unverified.email,
          email_verified: false,
        }),
      /verified email/i,
    );
  });

  it("rejects claims without an email claim", async () => {
    const noEmail = makeIdentity("no-email");
    track(noEmail.sub, noEmail.email);

    await assert.rejects(
      () =>
        upsertVerifiedIdentity({
          sub: noEmail.sub,
          email_verified: true,
          // email deliberately omitted
        }),
      /verified email/i,
    );
  });

  it("rejects claims without a subject", async () => {
    await assert.rejects(
      () =>
        upsertVerifiedIdentity({
          // sub deliberately omitted
          email: "no-sub@test.invalid",
          email_verified: true,
        }),
      /subject/i,
    );
  });
});
