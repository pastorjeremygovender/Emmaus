/**
 * progress-identity-isolation.test.ts — Task #604 regression guard
 *
 * Proves that a caller-supplied userId in a query string or request body
 * cannot read or mutate another verified subject's journey progress.
 *
 * Security invariants verified:
 *   ISO-1  GET /api/journeys/progress?userId=<other> returns the
 *          authenticated caller's progress (empty), NOT the other user's
 *          progress — the query parameter is silently ignored.
 *
 *   ISO-2  POST /api/journeys/:id/progress/start with { userId: <other> }
 *          in the body starts progress for the authenticated caller only —
 *          the body userId is silently ignored.
 *
 *   ISO-3  GET /api/journeys/progress returns 400 when there is no
 *          authenticated session at all (unauthenticated callers cannot
 *          supply a userId and get any data).
 *
 *   ISO-4  A stale tab assertion for a different verified subject is rejected
 *          before it can read or mutate the current cookie subject's data.
 *
 * Approach
 * ────────
 * An in-process Express app is spun up with the real journey router and the
 * real authMiddleware so the full server-side session resolution path is
 * exercised. No TEST_SERVER_URL required; no demo-user ownership semantics.
 *
 * Identities use unique __TEST__ subjects (nonce-scoped) and every row
 * created — journeys, progress, users, profiles, sessions — is deleted in
 * the after() hook via the production DB client.
 *
 * Run:
 *   pnpm --filter @workspace/api-server run test:progress-isolation
 */

import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import http from "node:http";
import crypto from "node:crypto";
import { db, userJourneyProgressTable } from "@workspace/db";
import { and, eq, inArray } from "drizzle-orm";
import { authHeader, cleanupTestAuth } from "../../test-utils/test-auth.ts";
import * as store from "../../lib/journey-store.ts";

// ── env guard ─────────────────────────────────────────────────────────────────

const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error(
    "progress-identity-isolation.test: refused to run in production/deployment",
  );
}
if (process.env.ALLOW_TEST_AUTH_HARNESS !== "1" || nodeEnv !== "test") {
  throw new Error(
    "progress-identity-isolation.test: set NODE_ENV=test and ALLOW_TEST_AUTH_HARNESS=1",
  );
}

// ── in-process server ─────────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

// ── fixture IDs ───────────────────────────────────────────────────────────────

const NONCE = crypto.randomBytes(6).toString("hex");
const JOURNEY_ID = `__test-iso-journey-${NONCE}`;

// Logical keys for the test-auth harness (distinct per nonce → distinct DB rows)
const ALICE_KEY = `iso-alice-${NONCE}`; // the authenticated caller
const BOB_KEY = `iso-bob-${NONCE}`;   // the "other" user whose data must not leak

// ── HTTP helper ───────────────────────────────────────────────────────────────

type ReqOpts = {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: object;
};

function httpRequest(opts: ReqOpts): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    };
    if (payload) headers["Content-Length"] = String(Buffer.byteLength(payload));

    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: (server.address() as { port: number }).port,
        method: opts.method ?? "GET",
        path: opts.path,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }),
        );
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function json<T>(res: { body: string }): T {
  return JSON.parse(res.body) as T;
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

before(async () => {
  // 1. Stand up a minimal Express app with the real auth middleware and the
  //    real journey router — no mocking, no bypass.
  const [
    { default: express },
    { authMiddleware },
    { default: journeysRouter },
  ] = await Promise.all([
    import("express"),
    import("../../middlewares/authMiddleware.ts"),
    import("../journeys.ts"),
  ]);

  const app = express();
  app.use(express.json());
  // Replicate the logger stub that pino-http normally adds so req.log.info
  // used in auth.ts doesn't crash.
  app.use((_req, _res, next) => {
    (_req as unknown as Record<string, unknown>)["log"] = {
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    next();
  });
  app.use(authMiddleware);
  app.use("/api", journeysRouter);

  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  // 2. Seed a minimal journey (needed so progress/start doesn't 404).
  await store.createJourney({
    id: JOURNEY_ID,
    title: `__TEST__ ISO Journey ${NONCE}`,
    status: "Published",
    journeyType: "core",
    durationDays: 1,
  });

  // 3. Pre-start Bob's progress so there IS something to *not* leak to Alice.
  const bobId = await (await import("../../test-utils/test-auth.ts")).testUserIdFor(BOB_KEY);
  await store.startJourney(bobId, JOURNEY_ID);
});

after(async () => {
  // Close the test server.
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );

  // Remove progress rows keyed to our test journey (cascade from journey
  // delete covers this, but an explicit delete is safer and avoids FK races).
  await db
    .delete(userJourneyProgressTable)
    .where(eq(userJourneyProgressTable.journeyId, JOURNEY_ID));

  // Hard-delete the test journey (cascade removes any remaining progress).
  const { pool } = await import("@workspace/db");
  await pool.query(`DELETE FROM journey_steps WHERE journey_id = $1`, [JOURNEY_ID]);
  await pool.query(`DELETE FROM journeys       WHERE id         = $1`, [JOURNEY_ID]);

  // Remove all test auth rows (users, profiles, sessions).
  await cleanupTestAuth();
});

// ── ISO-1: GET /api/journeys/progress?userId=<other> ─────────────────────────

describe("ISO-1 — GET /journeys/progress ignores caller-supplied userId query param", () => {
  it("returns Alice's own (empty) progress even when ?userId=<Bob> is supplied", async () => {
    // Alice is the authenticated caller; she has no progress yet.
    const aliceHeaders = await authHeader(ALICE_KEY);

    // Resolve Bob's actual DB user-id so we can supply it in the query string.
    const { testUserIdFor } = await import("../../test-utils/test-auth.ts");
    const bobUserId = await testUserIdFor(BOB_KEY);

    // Attempt to read Bob's progress by supplying his userId in the query string.
    const res = await httpRequest({
      path: `/api/journeys/progress?userId=${encodeURIComponent(bobUserId)}`,
      headers: aliceHeaders,
    });

    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${res.body}`);
    const data = json<{ progress: Record<string, unknown> }>(res);

    // Bob has progress for JOURNEY_ID; Alice has none.
    // The server must return Alice's progress (empty), not Bob's.
    assert.equal(
      Object.keys(data.progress).length,
      0,
      `ISO-1: Alice's progress must be empty — server must ignore ?userId=${bobUserId}. ` +
        `Got keys: ${Object.keys(data.progress).join(", ")}`,
    );

    assert.ok(
      !(JOURNEY_ID in data.progress),
      `ISO-1: Bob's journey progress must not appear in Alice's response`,
    );
  });
});

// ── ISO-2: POST /api/journeys/:id/progress/start with userId in body ──────────

describe("ISO-2 — POST /journeys/:id/progress/start ignores userId in request body", () => {
  it("creates progress for Alice only, regardless of userId supplied in body", async () => {
    const aliceHeaders = await authHeader(ALICE_KEY);
    const { testUserIdFor } = await import("../../test-utils/test-auth.ts");
    const aliceUserId = await testUserIdFor(ALICE_KEY);
    const bobUserId = await testUserIdFor(BOB_KEY);

    // Alice calls /start with Bob's userId in the body.
    const res = await httpRequest({
      method: "POST",
      path: `/api/journeys/${JOURNEY_ID}/progress/start`,
      headers: aliceHeaders,
      body: { userId: bobUserId, displayOrigin: "walk" },
    });

    // The request must succeed (Alice can start a journey she hasn't started yet).
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${res.body}`);
    assert.equal(
      json<{ displayOrigin?: string }>(res).displayOrigin,
      "walk",
      "ISO-2: the authenticated start must persist the requested display origin",
    );

    // Verify only Alice's progress row was created — not a second row for Bob.
    const [aliceProgress] = await db
      .select()
      .from(userJourneyProgressTable)
      .where(
        and(
          eq(userJourneyProgressTable.userId, aliceUserId),
          eq(userJourneyProgressTable.journeyId, JOURNEY_ID),
        ),
      );
    assert.ok(
      aliceProgress,
      "ISO-2: Alice's progress row must exist after /start",
    );
    assert.equal(
      aliceProgress.displayOrigin,
      "walk",
      "ISO-2: the persisted display origin must be returned from the database row",
    );

    // A later re-entry from another surface must not silently reclassify the
    // original start.
    const reentry = await httpRequest({
      method: "POST",
      path: `/api/journeys/${JOURNEY_ID}/progress/start`,
      headers: aliceHeaders,
      body: { displayOrigin: "journey" },
    });
    assert.equal(reentry.status, 200, `Expected 200, got ${reentry.status}: ${reentry.body}`);
    assert.equal(
      json<{ displayOrigin?: string }>(reentry).displayOrigin,
      "walk",
      "ISO-2: a later Journey entry must not overwrite a Walk origin",
    );

    // Confirm: only one row exists for JOURNEY_ID with aliceUserId
    // (Bob's pre-existing row must be unchanged, not duplicated).
    const allRows = await db
      .select()
      .from(userJourneyProgressTable)
      .where(eq(userJourneyProgressTable.journeyId, JOURNEY_ID));

    const aliceRows = allRows.filter((r) => r.userId === aliceUserId);
    assert.equal(
      aliceRows.length,
      1,
      "ISO-2: exactly one progress row must exist for Alice",
    );

    // Bob's row is untouched — still exactly one row.
    const bobRows = allRows.filter((r) => r.userId === bobUserId);
    assert.equal(
      bobRows.length,
      1,
      "ISO-2: Bob's original progress row must be untouched",
    );
  });
});

// ── ISO-3: Unauthenticated request is rejected ────────────────────────────────

describe("ISO-3 — GET /journeys/progress without a session returns 400", () => {
  it("returns 400 when no Authorization header is present", async () => {
    const { testUserIdFor } = await import("../../test-utils/test-auth.ts");
    const bobUserId = await testUserIdFor(BOB_KEY);

    // No auth header; supply Bob's userId as a query param (as an attacker would).
    const res = await httpRequest({
      path: `/api/journeys/progress?userId=${encodeURIComponent(bobUserId)}`,
    });

    assert.equal(
      res.status,
      400,
      `ISO-3: unauthenticated request with ?userId must return 400, got ${res.status}: ${res.body}`,
    );
  });
});

describe("ISO-4 — stale-tab subject assertion is rejected", () => {
  it("returns 409 before Alice's session can act through a tab still asserting Bob", async () => {
    const aliceHeaders = await authHeader(ALICE_KEY);
    const { testUserIdFor } = await import("../../test-utils/test-auth.ts");
    const bobUserId = await testUserIdFor(BOB_KEY);

    const res = await httpRequest({
      path: "/api/journeys/progress",
      headers: {
        ...aliceHeaders,
        "X-Emmaus-Expected-Subject": bobUserId,
      },
    });

    assert.equal(
      res.status,
      409,
      `ISO-4: mismatched tab subject must return 409, got ${res.status}: ${res.body}`,
    );
    assert.equal(
      json<{ code?: string }>(res).code,
      "AUTH_SUBJECT_MISMATCH",
    );
  });
});
