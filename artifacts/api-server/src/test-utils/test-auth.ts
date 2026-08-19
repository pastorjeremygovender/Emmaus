/**
 * test-auth.ts — Shared integration-test authentication harness.
 *
 * Creates REAL opaque provider sessions in the development PostgreSQL database so
 * networked integration tests can authenticate exactly the way a browser does:
 * with an `Authorization: Bearer <sid>` header that the server resolves through
 * its production auth middleware (session → users.id → user_profiles.app_role).
 *
 * SECURITY CONTRACT
 * ─────────────────
 *   • This helper NEVER installs a runtime auth bypass and NEVER relies on
 *     X-User-* headers. It exercises the same session lookup path as real users.
 *   • It refuses to run in production / deployment environments (see guardEnv).
 *   • It only ever creates and deletes clearly test-scoped identities. It never
 *     touches pre-existing non-test users, profiles, or sessions, and it does
 *     not assume any `demo-user-1` ownership semantics.
 *
 * USAGE
 * ─────
 *   import { authHeader, cleanupTestAuth } from "../../test-utils/test-auth.ts";
 *
 *   const headers = await authHeader({ role: "superAdmin" });
 *   // headers = { Authorization: "Bearer <sid>" }
 *
 *   // In an after()/module teardown:
 *   await cleanupTestAuth();
 */

import crypto from "node:crypto";
import {
  db,
  devotionalProgressTable,
  devotionalSeriesTable,
  pool,
  sermonCompanionProgressTable,
  sessionsTable,
  userProfilesTable,
  usersTable,
  type UserRole,
} from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

// ─── Environment guard ─────────────────────────────────────────────────────

/**
 * The explicit, test-only opt-in flag. The harness writes real rows to the
 * configured database, so besides rejecting production/deployment it now
 * refuses to run UNLESS the invoking process has deliberately enabled it. This
 * means it can never activate merely because NODE_ENV is unset/"development" —
 * both this flag AND NODE_ENV=test are required.
 */
export const TEST_AUTH_ALLOW_ENV = "ALLOW_TEST_AUTH_HARNESS";

/**
 * Throws unless invoked in an explicitly-enabled test environment. Order of
 * checks:
 *   1. Reject production (NODE_ENV=production).
 *   2. Reject live Replit deployments (REPLIT_DEPLOYMENT truthy).
 *   3. Require the explicit opt-in flag AND NODE_ENV=test.
 * There is intentionally NO production bypass and NO implicit
 * unset/development activation.
 */
export function guardEnv(): void {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv === "production") {
    throw new Error(
      "test-auth harness refused to run: NODE_ENV=production. " +
        "This helper is for integration tests only.",
    );
  }
  // Replit deployments set REPLIT_DEPLOYMENT=1 (or a deployment id). Any truthy
  // value indicates a live deployment and must be rejected.
  if (process.env.REPLIT_DEPLOYMENT) {
    throw new Error(
      "test-auth harness refused to run: REPLIT_DEPLOYMENT is set. " +
        "This helper is for integration tests only.",
    );
  }
  // Require an explicit test-only allow flag. This prevents the harness from
  // ever activating just because NODE_ENV happens to be unset or "development".
  if (process.env[TEST_AUTH_ALLOW_ENV] !== "1") {
    throw new Error(
      `test-auth harness refused to run: ${TEST_AUTH_ALLOW_ENV} is not set. ` +
        "Run it only via the test:integration script, which sets this flag.",
    );
  }
  // Require NODE_ENV=test in addition to the allow flag.
  if (nodeEnv !== "test") {
    throw new Error(
      "test-auth harness refused to run: NODE_ENV must be 'test'. " +
        "Run it only via the test:integration script, which sets NODE_ENV=test.",
    );
  }
}

// ─── Test identity naming ──────────────────────────────────────────────────

/**
 * A unique, clearly test-only prefix for every identity this helper creates.
 * `pid` + `nonce` keeps IDs unique across concurrent `node --test` files while
 * still being obviously test-scoped and easy to bulk-clean.
 */
const TEST_PREFIX = "itest-auth";
const PROCESS_NONCE = `${process.pid.toString(36)}-${crypto
  .randomBytes(4)
  .toString("hex")}`;

/** Domain used for generated emails — clearly synthetic, never a real domain. */
const TEST_EMAIL_DOMAIN = "itest.invalid";

/**
 * Sanitise a caller-supplied logical key (typically the test's own userId
 * string) into a slug safe for an email localpart / id fragment.
 */
function slug(key: string): string {
  const cleaned = key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  // Fold anything left into a short stable hash suffix so distinct long keys
  // never collide after truncation.
  const hash = crypto
    .createHash("sha1")
    .update(key)
    .digest("hex")
    .slice(0, 8);
  return `${cleaned || "k"}-${hash}`;
}

function cacheKey(logicalKey: string, role: UserRole): string {
  return `${role}::${logicalKey}`;
}

function testUserId(logicalKey: string, role: UserRole): string {
  return `${TEST_PREFIX}-${role}-${slug(logicalKey)}-${PROCESS_NONCE}`;
}

function testEmail(logicalKey: string, role: UserRole): string {
  return `${TEST_PREFIX}-${role}-${slug(logicalKey)}-${PROCESS_NONCE}@${TEST_EMAIL_DOMAIN}`;
}

// ─── Session cache (per user+role, per process) ────────────────────────────

type CreatedIdentity = {
  userId: string;
  email: string;
  sid: string;
};

/**
 * Cache keyed by (logicalKey + role) so distinct test users each get their own
 * real identity+session — reused across the many calls a single test makes —
 * while never creating duplicate rows for the same logical user.
 */
const sessionCache = new Map<string, CreatedIdentity>();

/** Track every session id we create, even beyond the cache, for cleanup. */
const createdSids = new Set<string>();
/** Track every (userId,email) we create, for cleanup. */
const createdUsers = new Map<string, string>(); // userId -> email

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Upsert a test user + profile (with an explicit database app_role) and create
 * a real opaque session row. Returns the identity so callers can build headers.
 *
 * Cached per (logicalKey + role) within a process to avoid creating excessive
 * rows across the many calls a single test file makes.
 */
async function ensureTestIdentity(
  logicalKey: string,
  role: UserRole,
): Promise<CreatedIdentity> {
  guardEnv();

  const key = cacheKey(logicalKey, role);
  const cached = sessionCache.get(key);
  if (cached) return cached;

  const userId = testUserId(logicalKey, role);
  const email = testEmail(logicalKey, role);
  const preferredName = `Integration Test ${role}`;

  // 1. Upsert the provider identity (users). Idempotent on id.
  await db
    .insert(usersTable)
    .values({
      id: userId,
      email,
      firstName: "Integration",
      lastName: `Test ${role}`,
      profileImageUrl: null,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { email, updatedAt: new Date() },
    });

  // 2. Upsert the profile bound to that subject, with an explicit app_role.
  //    Email is the profile primary key; authSubject links to the user id.
  await db
    .insert(userProfilesTable)
    .values({
      email,
      authSubject: userId,
      preferredName,
      appRole: role,
      roleAssignedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userProfilesTable.email,
      set: {
        authSubject: userId,
        appRole: role,
        roleAssignedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  // 3. Create a real opaque session row. The stored shape matches SessionData
  //    so the production auth middleware resolves it without special casing.
  const sid = crypto.randomBytes(32).toString("hex");
  const sess = {
    user: {
      id: userId,
      email,
      firstName: "Integration",
      lastName: `Test ${role}`,
      profileImageUrl: null,
    },
    access_token: `itest-${crypto.randomBytes(16).toString("hex")}`,
    // No refresh_token / expires_at → middleware treats the session as valid
    // (no expiry check) without ever attempting a token refresh.
  };

  await db.insert(sessionsTable).values({
    sid,
    sess: sess as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL_MS),
  });

  const identity: CreatedIdentity = { userId, email, sid };
  sessionCache.set(key, identity);
  createdSids.add(sid);
  createdUsers.set(userId, email);
  return identity;
}

// ─── Public API ────────────────────────────────────────────────────────────

export type TestRole = UserRole;

/**
 * Return an `Authorization: Bearer <sid>` header for a real session belonging to
 * a test identity.
 *
 * @param logicalKey A stable per-test identifier (typically the test's own
 *   userId string). Distinct keys map to distinct real identities so tests that
 *   depend on separate users having separate data continue to work. Repeated
 *   calls with the same key+role reuse one cached session (no row explosion).
 * @param opts.role  The database app_role to assign. Defaults to "user".
 */
export async function authHeader(
  logicalKey: string,
  opts: { role?: TestRole } = {},
): Promise<{ Authorization: string }> {
  const role = opts.role ?? "user";
  const identity = await ensureTestIdentity(logicalKey, role);
  return { Authorization: `Bearer ${identity.sid}` };
}

/** Convenience: the resolved verified user id for a logical key + role. */
export async function testUserIdFor(
  logicalKey: string,
  role: TestRole = "user",
): Promise<string> {
  const identity = await ensureTestIdentity(logicalKey, role);
  return identity.userId;
}

/**
 * Purge domain rows the server persisted keyed by the VERIFIED req.user.id of
 * our test identities. These are rows the HTTP API cannot always hard-delete
 * (progress rows on pre-existing content; pastoral rows that only support
 * soft-delete), and their id columns hold the generated `itest-auth-*` id — not
 * the logical key — so they leak past content-scoped teardown.
 *
 * Every predicate below is scoped to the exact set of verified ids THIS process
 * created, so no pre-existing, non-test data is ever touched. FK-child rows are
 * removed (or cascade) before their parents.
 */
async function purgeDomainResidue(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;

  // ── Drizzle-schema tables ────────────────────────────────────────────────
  // Progress rows keyed by member verified id (user_id).
  await db
    .delete(devotionalProgressTable)
    .where(inArray(devotionalProgressTable.userId, userIds));
  await db
    .delete(sermonCompanionProgressTable)
    .where(inArray(sermonCompanionProgressTable.userId, userIds));

  // Devotional series authored by a test admin (created_by), plus their
  // cascade children (entries + any remaining progress cascade on series id).
  await db
    .delete(devotionalSeriesTable)
    .where(inArray(devotionalSeriesTable.createdBy, userIds));

  // ── Raw pastoral tables (no drizzle schema) ──────────────────────────────
  // Order matters: sessions cascade-delete attendance_records + care_signals;
  // expectations cascade on meeting_type; then meeting_types; then persons.
  // Every delete is scoped to created_by IN (our verified ids).
  await pool.query(
    `DELETE FROM meeting_sessions WHERE created_by = ANY($1::text[])`,
    [userIds],
  );
  await pool.query(
    `DELETE FROM meeting_sessions
       WHERE meeting_type_id IN (
         SELECT id FROM meeting_types WHERE created_by = ANY($1::text[])
       )`,
    [userIds],
  );
  await pool.query(
    `DELETE FROM person_attendance_expectations WHERE created_by = ANY($1::text[])`,
    [userIds],
  );
  await pool.query(
    `DELETE FROM person_attendance_expectations
       WHERE meeting_type_id IN (
         SELECT id FROM meeting_types WHERE created_by = ANY($1::text[])
       )`,
    [userIds],
  );
  await pool.query(
    `DELETE FROM meeting_types WHERE created_by = ANY($1::text[])`,
    [userIds],
  );
  await pool.query(
    `DELETE FROM pastoral_persons WHERE created_by = ANY($1::text[])`,
    [userIds],
  );
}

/**
 * Delete everything this process created: first the domain rows the server
 * persisted under our verified ids (progress / authored content / pastoral
 * fixtures), then the auth rows — sessions, then test profiles, then test
 * users. Only rows created by THIS helper are removed — pre-existing, non-test
 * identities are never touched. Safe and idempotent, so it can be called from an
 * after() hook in each file (or module teardown) without racing concurrent
 * `node --test` files, which each use a distinct PROCESS_NONCE.
 */
export async function cleanupTestAuth(): Promise<void> {
  // Never run destructive cleanup against a production DB.
  guardEnv();

  const sids = [...createdSids];
  const userIds = [...createdUsers.keys()];
  const emails = [...createdUsers.values()];

  // 0. Domain residue keyed by our verified ids (before removing the users so
  //    the ids are still meaningful; deletes are id-scoped so order is safe).
  await purgeDomainResidue(userIds);

  // 1. Sessions (reference nothing else).
  if (sids.length > 0) {
    await db.delete(sessionsTable).where(inArray(sessionsTable.sid, sids));
  }

  // 2. Profiles (reference users via authSubject; delete before users).
  if (emails.length > 0) {
    await db
      .delete(userProfilesTable)
      .where(inArray(userProfilesTable.email, emails));
  }

  // 3. Users last (profiles/sessions already gone).
  if (userIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, userIds));
  }

  sessionCache.clear();
  createdSids.clear();
  createdUsers.clear();
}

/** Exposed for defensive per-row cleanup if a caller wants finer control. */
export async function deleteTestSession(sid: string): Promise<void> {
  guardEnv();
  await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
  createdSids.delete(sid);
}
