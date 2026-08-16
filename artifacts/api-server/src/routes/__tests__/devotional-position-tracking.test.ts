/**
 * devotional-position-tracking.test.ts — markDayComplete edge-case tests
 *
 * Guards the SQL in `markDayComplete` (devotional-store.ts) that derives
 * `current_day` from the lowest uncompleted published entry after each
 * completion. Four edge-cases are exercised:
 *
 *   4a. In-order completion — current_day advances step by step.
 *   4b. Out-of-order completion — current_day jumps to the lowest uncompleted
 *       published entry, NOT simply the day after the one just completed.
 *   4c. All entries completed — current_day stays at the last entry (no null,
 *       no reset to day 1).
 *   4d. Idempotent re-completion — marking the same day twice produces no
 *       duplicate in completed_days and leaves current_day unchanged.
 *
 * Each sub-test uses its own unique member ID so tests are fully independent
 * and can run in any order without shared mutable state.
 *
 * Uses `demo-superadmin-1` (pre-seeded in user-roles.json) for admin routes
 * so the server-side role check passes without any extra setup.
 *
 * Requires the API server to be running.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/devotional-position-tracking.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const url = new URL(BASE_URL);
const isHttps = url.protocol === "https:";
const transport = isHttps ? https : http;

// ─── HTTP helper ──────────────────────────────────────────────────────────────

type ReqOpts = {
  method?: string;
  path: string;
  userId?: string;
  role?: string;
  body?: object;
};

function request(opts: ReqOpts): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const payload = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (opts.userId) headers["X-User-Id"] = opts.userId;
    if (opts.role) headers["X-User-Role"] = opts.role;
    if (payload) headers["Content-Length"] = String(Buffer.byteLength(payload));

    const req = transport.request(
      {
        hostname: url.hostname,
        port: Number(url.port) || (isHttps ? 443 : 80),
        method: opts.method ?? "GET",
        path: opts.path,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() })
        );
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RUN_TAG = Date.now();

// Pre-seeded in user-roles.json — passes the server-side admin role check.
const ADMIN = "demo-superadmin-1";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

// A single 4-entry published series shared across all sub-tests.
let seriesId = "";

before(async () => {
  // 1. Create the series.
  const createRes = await request({
    method: "POST",
    path: "/api/devotionals",
    userId: ADMIN,
    role: "superAdmin",
    body: {
      title: `__TEST__ Position Tracking [${RUN_TAG}]`,
      description: "Automated position-tracking edge-case tests",
      seriesType: "general",
    },
  });
  assert.equal(
    createRes.status,
    201,
    `Create series failed (${createRes.status}): ${createRes.body}`
  );
  seriesId = (JSON.parse(createRes.body) as { id: string }).id;

  // 2. Add and publish entries for days 1–4.
  for (let day = 1; day <= 4; day++) {
    const entryRes = await request({
      method: "PUT",
      path: `/api/devotionals/${seriesId}/entries/${day}`,
      userId: ADMIN,
      role: "superAdmin",
      body: {
        title: `Position Day ${day}`,
        scriptureReference: `John ${day}:1`,
        status: "Published",
      },
    });
    assert.equal(
      entryRes.status,
      200,
      `Publish entry day ${day} failed (${entryRes.status}): ${entryRes.body}`
    );
  }

  // 3. Publish the series itself.
  const publishRes = await request({
    method: "PATCH",
    path: `/api/devotionals/${seriesId}`,
    userId: ADMIN,
    role: "superAdmin",
    body: { status: "Published" },
  });
  assert.equal(
    publishRes.status,
    200,
    `Publish series failed (${publishRes.status}): ${publishRes.body}`
  );
});

after(async () => {
  if (seriesId) {
    await request({
      method: "DELETE",
      path: `/api/devotionals/${seriesId}/permanent`,
      userId: ADMIN,
      role: "superAdmin",
    });
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Call POST /:id/progress/complete and return the updated progress record. */
async function completeDay(
  userId: string,
  day: number
): Promise<{ currentDay: number; completedDays: number[] }> {
  const res = await request({
    method: "POST",
    path: `/api/devotionals/${seriesId}/progress/complete`,
    userId,
    body: { day },
  });
  assert.equal(
    res.status,
    200,
    `completeDay(${day}) for ${userId} failed (${res.status}): ${res.body}`
  );
  return JSON.parse(res.body) as { currentDay: number; completedDays: number[] };
}

/** Call POST /:id/start so the member has a progress row before completing days. */
async function startSeries(userId: string): Promise<void> {
  const res = await request({
    method: "POST",
    path: `/api/devotionals/${seriesId}/start`,
    userId,
  });
  assert.equal(
    res.status,
    200,
    `startSeries for ${userId} failed (${res.status}): ${res.body}`
  );
}

// ─── 4a — In-order completion ─────────────────────────────────────────────────
//
// Completing days in sequential order must advance current_day to the next day.

describe("4a — in-order completion advances current_day", () => {
  it("completing day 1 sets current_day to 2", async () => {
    const userId = `test-pos-4a1-${RUN_TAG}`;
    await startSeries(userId);

    const p = await completeDay(userId, 1);
    assert.deepEqual(
      p.completedDays.sort((a, b) => a - b),
      [1],
      "completed_days should contain only [1]"
    );
    assert.equal(
      p.currentDay,
      2,
      `After completing day 1, current_day should be 2; got ${p.currentDay}`
    );
  });

  it("completing days 1 then 2 sets current_day to 3", async () => {
    const userId = `test-pos-4a2-${RUN_TAG}`;
    await startSeries(userId);

    await completeDay(userId, 1);
    const p = await completeDay(userId, 2);

    assert.deepEqual(
      p.completedDays.sort((a, b) => a - b),
      [1, 2],
      "completed_days should contain [1, 2]"
    );
    assert.equal(
      p.currentDay,
      3,
      `After completing days 1+2, current_day should be 3; got ${p.currentDay}`
    );
  });

  it("completing days 1, 2, 3 sets current_day to 4", async () => {
    const userId = `test-pos-4a3-${RUN_TAG}`;
    await startSeries(userId);

    await completeDay(userId, 1);
    await completeDay(userId, 2);
    const p = await completeDay(userId, 3);

    assert.deepEqual(
      p.completedDays.sort((a, b) => a - b),
      [1, 2, 3]
    );
    assert.equal(
      p.currentDay,
      4,
      `After completing days 1–3, current_day should be 4; got ${p.currentDay}`
    );
  });
});

// ─── 4b — Out-of-order completion ─────────────────────────────────────────────
//
// current_day must reflect the lowest uncompleted published entry, not simply
// the day after the one just completed.

describe("4b — out-of-order completion sets current_day to lowest uncompleted", () => {
  it("completing day 3 first sets current_day to 1 (not 4)", async () => {
    const userId = `test-pos-4b1-${RUN_TAG}`;
    await startSeries(userId);

    const p = await completeDay(userId, 3);
    assert.deepEqual(
      p.completedDays.sort((a, b) => a - b),
      [3],
      "completed_days should contain only [3]"
    );
    assert.equal(
      p.currentDay,
      1,
      `After completing only day 3, current_day must be 1 (lowest uncompleted); got ${p.currentDay}`
    );
  });

  it("completing days 3 then 1 sets current_day to 2 (the gap)", async () => {
    const userId = `test-pos-4b2-${RUN_TAG}`;
    await startSeries(userId);

    await completeDay(userId, 3);
    const p = await completeDay(userId, 1);

    assert.deepEqual(
      p.completedDays.sort((a, b) => a - b),
      [1, 3]
    );
    assert.equal(
      p.currentDay,
      2,
      `After completing days 3 then 1, current_day must be 2 (the skipped gap); got ${p.currentDay}`
    );
  });

  it("completing days 4, 2, 3 sets current_day to 1 (first gap)", async () => {
    const userId = `test-pos-4b3-${RUN_TAG}`;
    await startSeries(userId);

    await completeDay(userId, 4);
    await completeDay(userId, 2);
    const p = await completeDay(userId, 3);

    assert.deepEqual(
      p.completedDays.sort((a, b) => a - b),
      [2, 3, 4]
    );
    assert.equal(
      p.currentDay,
      1,
      `After completing days 4, 2, 3 — day 1 is the only gap; got ${p.currentDay}`
    );
  });
});

// ─── 4c — All entries completed ───────────────────────────────────────────────
//
// When every published entry is complete the COALESCE in the SQL keeps the
// last current_day value rather than resetting to null or 1.

describe("4c — completing all entries leaves current_day at the last published day", () => {
  it("completing all 4 days in order leaves current_day at 4", async () => {
    const userId = `test-pos-4c1-${RUN_TAG}`;
    await startSeries(userId);

    await completeDay(userId, 1);
    await completeDay(userId, 2);
    await completeDay(userId, 3);
    const p = await completeDay(userId, 4);

    assert.deepEqual(
      p.completedDays.sort((a, b) => a - b),
      [1, 2, 3, 4],
      "All 4 days should be in completed_days"
    );
    assert.equal(
      p.currentDay,
      4,
      `After completing all 4 days current_day must stay at 4 (COALESCE fallback); got ${p.currentDay}`
    );
  });

  it("completing all 4 days in reverse order leaves current_day at the last published day (4)", async () => {
    const userId = `test-pos-4c2-${RUN_TAG}`;
    await startSeries(userId);

    // Complete 4 → 3 → 2 → 1; capture the result of the final call directly.
    let p: { currentDay: number; completedDays: number[] } = { currentDay: 0, completedDays: [] };
    for (const day of [4, 3, 2, 1]) {
      p = await completeDay(userId, day);
    }

    assert.deepEqual(
      p.completedDays.sort((a, b) => a - b),
      [1, 2, 3, 4],
      "All 4 days should be in completed_days"
    );
    assert.equal(
      p.currentDay,
      4,
      `When all entries are complete, current_day must be the last published day (4); got ${p.currentDay}`
    );
  });
});

// ─── 4d — Idempotent re-completion ────────────────────────────────────────────
//
// Marking the same day complete twice must be a no-op: no duplicate entry in
// completed_days and current_day must not change.

describe("4d — marking the same day complete twice is idempotent", () => {
  it("day 1 appears exactly once in completed_days after two calls", async () => {
    const userId = `test-pos-4d1-${RUN_TAG}`;
    await startSeries(userId);

    await completeDay(userId, 1);
    const p = await completeDay(userId, 1); // duplicate

    const count = p.completedDays.filter((d: number) => d === 1).length;
    assert.equal(
      count,
      1,
      `Day 1 must appear exactly once in completed_days; found ${count} copies`
    );
  });

  it("current_day does not change after a duplicate completion", async () => {
    const userId = `test-pos-4d2-${RUN_TAG}`;
    await startSeries(userId);

    const first = await completeDay(userId, 2);
    const second = await completeDay(userId, 2); // duplicate

    assert.equal(
      second.currentDay,
      first.currentDay,
      `current_day must be identical after a duplicate call; ` +
        `first=${first.currentDay}, second=${second.currentDay}`
    );
  });

  it("no phantom days are added to completed_days by a duplicate call", async () => {
    const userId = `test-pos-4d3-${RUN_TAG}`;
    await startSeries(userId);

    await completeDay(userId, 2);
    const before = await completeDay(userId, 2); // first duplicate — establishes baseline
    const after  = await completeDay(userId, 2); // second duplicate

    assert.deepEqual(
      after.completedDays.sort((a, b) => a - b),
      before.completedDays.sort((a, b) => a - b),
      "completed_days must be identical across repeated duplicate calls"
    );
  });
});
