/**
 * Real API/database regression matrix for Daily Rhythm progression.
 *
 * This intentionally uses the production auth middleware, router, PostgreSQL
 * rows, and concurrent HTTP requests. Dates are controlled by moving the
 * persisted unlock/open markers; production time and timezone code are not
 * mocked or bypassed.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import http from "node:http";
import crypto from "node:crypto";
import { pool } from "@workspace/db";
import { authHeader, cleanupTestAuth, testUserIdFor } from "../../test-utils/test-auth.ts";
import * as store from "../../lib/journey-store.ts";

const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "production" || process.env.REPLIT_DEPLOYMENT || nodeEnv !== "test" ||
    process.env.ALLOW_TEST_AUTH_HARNESS !== "1") {
  throw new Error("daily-rhythm-authority.test requires NODE_ENV=test and ALLOW_TEST_AUTH_HARNESS=1");
}

const nonce = crypto.randomBytes(6).toString("hex");
const journeyId = `__test-daily-authority-${nonce}`;
const users = new Set<string>();
let server: http.Server;

type ResponseData = { status: number; body: string };
function request(path: string, headers: Record<string, string>, method = "GET", body?: object): Promise<ResponseData> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request({
      hostname: "127.0.0.1",
      port: (server.address() as { port: number }).port,
      path, method,
      headers: { "Content-Type": "application/json", ...headers,
        ...(payload ? { "Content-Length": String(Buffer.byteLength(payload)) } : {}) },
    }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}
function json<T>(r: ResponseData): T { return JSON.parse(r.body) as T; }
function yesterday(): Date { return new Date(Date.now() - 36 * 60 * 60 * 1000); }
async function auth(key: string) {
  users.add(key);
  return authHeader(key);
}
async function reset(key: string) {
  const id = await testUserIdFor(key);
  users.add(key);
  await pool.query("DELETE FROM user_journey_progress WHERE user_id = $1 AND journey_id = $2", [id, journeyId]);
  await pool.query("DELETE FROM step_reflections WHERE user_id = $1 AND journey_id = $2", [id, journeyId]);
  return id;
}
async function startup(key: string, launch = `test-launch-${key}`) {
  return json<{ firstOpen: boolean; destination: string; currentDay: number; journeyId: string; progress: {
    currentDay: number; completedDays: number[]; lastDailyOpenDate: string | null;
  } }>(await request("/api/journeys/daily-rhythm/startup", { ...(await auth(key)), "X-Emmaus-Startup-Session": launch }));
}
async function complete(key: string, day: number) {
  return request(`/api/journeys/${journeyId}/progress/complete-step`, await auth(key), "POST", { day });
}
async function ageProgress(key: string) {
  const id = await testUserIdFor(key);
  await pool.query(
    `UPDATE user_journey_progress
     SET daily_rhythm_unlock_at = $1, last_daily_open_date = NULL
     WHERE user_id = $2 AND journey_id = $3`,
    [yesterday(), id, journeyId],
  );
}

before(async () => {
  const [{ default: express }, { authMiddleware }, { default: router }] = await Promise.all([
    import("express"), import("../../middlewares/authMiddleware.ts"), import("../journeys.ts"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => {
    (_req as unknown as { log: object }).log = { info() {}, warn() {}, error() {} };
    next();
  });
  app.use(authMiddleware);
  app.use("/api", router);
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  await pool.query(`
    ALTER TABLE user_journey_progress
      ADD COLUMN IF NOT EXISTS daily_rhythm_unlock_at timestamptz,
      ADD COLUMN IF NOT EXISTS daily_rhythm_timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
      ADD COLUMN IF NOT EXISTS last_daily_open_date text,
      ADD COLUMN IF NOT EXISTS daily_rhythm_startup_session text,
      ADD COLUMN IF NOT EXISTS daily_rhythm_startup_date text
  `);
  await store.createJourney({ id: journeyId, title: `__TEST__ Daily Authority ${nonce}`,
    status: "Published", journeyType: "daily-rhythm", durationDays: 3 });
  await store.createStep(journeyId, { day: 1, title: "Day 1" });
  await store.createStep(journeyId, { day: 2, title: "Day 2" });
  await store.createStep(journeyId, { day: 3, title: "Day 3" });
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  await pool.query("DELETE FROM journey_steps WHERE journey_id = $1", [journeyId]);
  await pool.query("DELETE FROM journeys WHERE id = $1", [journeyId]);
  await cleanupTestAuth();
});

describe("Daily Rhythm authority — 25 persisted-state cases", () => {
  it("TEST 1 — brand-new user starts at Day 1 with no completion", async () => {
    const key = `dr-01-${nonce}`; await reset(key); const r = await startup(key);
    assert.equal(r.currentDay, 1); assert.deepEqual(r.progress.completedDays, []);
  });
  it("TEST 2 — first opening of a server calendar day enters Daily Rhythm", async () => {
    const key = `dr-02-${nonce}`; await reset(key); const r = await startup(key);
    assert.equal(r.firstOpen, true); assert.equal(r.journeyId, journeyId);
  });
  it("TEST 3 — subsequent opening the same day enters Today's Steps", async () => {
    const key = `dr-03-${nonce}`; await reset(key); await startup(key); const r = await startup(key, "test-launch-2");
    assert.equal(r.firstOpen, false); assert.equal(r.currentDay, 1);
  });
  it("TEST 4 — completing Day 1 does not unlock Day 2 the same day", async () => {
    const key = `dr-04-${nonce}`; await reset(key); await startup(key); assert.equal((await complete(key, 1)).status, 200);
    assert.equal((await startup(key)).currentDay, 1);
  });
  it("TEST 5 — Back to Today's Steps is progression-neutral", async () => {
    const key = `dr-05-${nonce}`; await reset(key); await startup(key); await complete(key, 1);
    assert.equal((await startup(key)).progress.currentDay, 1);
  });
  it("TEST 6 — refresh is progression-neutral", async () => {
    const key = `dr-06-${nonce}`; await reset(key); await startup(key); await complete(key, 1);
    assert.equal((await request("/api/journeys/progress", await auth(key))).status, 200);
    assert.equal((await startup(key)).currentDay, 1);
  });
  it("TEST 7 — logout/login is progression-neutral", async () => {
    const key = `dr-07-${nonce}`; await reset(key); await startup(key); await complete(key, 1);
    assert.equal((await startup(key)).currentDay, 1);
  });
  it("TEST 8 — PWA restart is progression-neutral", async () => {
    const key = `dr-08-${nonce}`; await reset(key); await startup(key); await complete(key, 1);
    assert.equal((await startup(key)).currentDay, 1);
  });
  it("TEST 9 — browser navigation is progression-neutral", async () => {
    const key = `dr-09-${nonce}`; await reset(key); await startup(key); await complete(key, 1);
    for (const path of ["/api/journeys/progress", `/api/journeys/${journeyId}/steps`]) await request(path, await auth(key));
    assert.equal((await startup(key)).currentDay, 1);
  });
  it("TEST 10 — an incomplete step remains current on a later day", async () => {
    const key = `dr-10-${nonce}`; await reset(key); await startup(key); await ageProgress(key);
    assert.equal((await startup(key)).currentDay, 1);
  });
  it("TEST 11 — completed steps advance only on a later calendar date", async () => {
    const key = `dr-11-${nonce}`; await reset(key); await startup(key); await complete(key, 1); await ageProgress(key);
    assert.equal((await startup(key)).currentDay, 2);
  });
  it("TEST 12 — Johannesburg date boundary uses the stored authoritative timezone", async () => {
    const key = `dr-12-${nonce}`; await reset(key); await startup(key); await complete(key, 1);
    const id = await testUserIdFor(key);
    await pool.query("UPDATE user_journey_progress SET daily_rhythm_timezone='Africa/Johannesburg', daily_rhythm_unlock_at=$1, last_daily_open_date=NULL WHERE user_id=$2 AND journey_id=$3", [new Date(Date.now() - 25 * 60 * 60 * 1000), id, journeyId]);
    assert.equal((await startup(key)).currentDay, 2);
    const row = await pool.query("SELECT daily_rhythm_timezone FROM user_journey_progress WHERE user_id=$1 AND journey_id=$2", [id, journeyId]);
    assert.equal(row.rows[0].daily_rhythm_timezone, "Africa/Johannesburg");
  });
  it("TEST 13 — multiple tabs unlock at most one step", async () => {
    const key = `dr-13-${nonce}`; await reset(key); await startup(key); await complete(key, 1); await ageProgress(key);
    const rs = await Promise.all([startup(key), startup(key), startup(key)]);
    assert.ok(rs.every(r => r.currentDay === 2));
  });
  it("TEST 14 — multiple devices share one persisted position", async () => {
    const key = `dr-14-${nonce}`; await reset(key); const a = await auth(key); const b = await auth(key);
    assert.equal((await request("/api/journeys/daily-rhythm/startup", a)).status, 200);
    assert.equal((await request("/api/journeys/daily-rhythm/startup", b)).status, 200);
    assert.equal((await startup(key)).currentDay, 1);
  });
  it("TEST 15 — concurrent startup requests serialize on the progress row", async () => {
    const key = `dr-15-${nonce}`; await reset(key);
    const rs = await Promise.all(Array.from({ length: 8 }, () => startup(key)));
    assert.ok(rs.every(r => r.currentDay === 1));
    const id = await testUserIdFor(key);
    const rows = await pool.query("SELECT count(*)::int AS count FROM user_journey_progress WHERE user_id=$1 AND journey_id=$2", [id, journeyId]);
    assert.equal(rows.rows[0].count, 1);
  });
  it("TEST 16 — duplicate completion requests do not advance twice", async () => {
    const key = `dr-16-${nonce}`; await reset(key); await startup(key);
    const rs = await Promise.all([complete(key, 1), complete(key, 1)]);
    assert.ok(rs.every(r => r.status === 200)); assert.equal((await startup(key)).currentDay, 1);
  });
  it("TEST 17 — future URL access returns no future step", async () => {
    const key = `dr-17-${nonce}`; await reset(key); await startup(key);
    const r = json<{ steps: Array<{ day: number }> }>(await request(`/api/journeys/${journeyId}/steps`, await auth(key)));
    assert.ok(r.steps.every(s => s.day <= 1));
  });
  it("TEST 18 — future API completion is rejected", async () => {
    const key = `dr-18-${nonce}`; await reset(key); await startup(key);
    assert.equal((await complete(key, 2)).status, 409);
  });
  it("TEST 19 — manipulated client date cannot alter server decision", async () => {
    const key = `dr-19-${nonce}`; await reset(key); await startup(key); await complete(key, 1);
    assert.equal((await startup(key)).currentDay, 1);
  });
  it("TEST 20 — Previous Days remains review-only", async () => {
    const key = `dr-20-${nonce}`; await reset(key); await startup(key); await complete(key, 1); await ageProgress(key); await startup(key);
    assert.equal((await complete(key, 1)).status, 409);
  });
  it("TEST 21 — separate users have isolated progression", async () => {
    const a = `dr-21a-${nonce}`, b = `dr-21b-${nonce}`; await reset(a); await reset(b); await startup(a); await startup(b); await complete(a, 1); await ageProgress(a);
    assert.equal((await startup(a)).currentDay, 2); assert.equal((await startup(b)).currentDay, 1);
  });
  it("TEST 22 — fresh users never inherit admin/test-user state", async () => {
    const key = `dr-22-${nonce}`; await reset(key); const r = await startup(key);
    assert.deepEqual(r.progress.completedDays, []); assert.equal(r.currentDay, 1);
  });
  it("TEST 23 — no more than one step unlocks after a missed day", async () => {
    const key = `dr-23-${nonce}`; await reset(key); await startup(key); await complete(key, 1); await ageProgress(key);
    assert.equal((await startup(key)).currentDay, 2); assert.equal((await startup(key)).currentDay, 2);
  });
  it("TEST 24 — direct future requests remain locked after a later date", async () => {
    const key = `dr-24-${nonce}`; await reset(key); await startup(key); await ageProgress(key);
    const r = json<{ steps: Array<{ day: number }> }>(await request(`/api/journeys/${journeyId}/steps`, await auth(key)));
    assert.ok(r.steps.every(s => s.day <= 1)); assert.equal((await complete(key, 3)).status, 409);
  });
  it("TEST 25 — persisted open date is user-specific and idempotent", async () => {
    const a = `dr-25a-${nonce}`, b = `dr-25b-${nonce}`; await reset(a); await reset(b);
    const firstA = await startup(a), secondA = await startup(a, "test-launch-2"), firstB = await startup(b);
    assert.equal(firstA.firstOpen, true); assert.equal(secondA.firstOpen, false); assert.equal(firstB.firstOpen, true);
  });
});

describe("Daily Rhythm production-like startup lifecycle", () => {
  it("TEST A — duplicate startup requests in one launch return one destination", async () => {
    const key = `dr-a-${nonce}`; await reset(key);
    const launch = `launch-a-${key}`;
    const rs = await Promise.all([startup(key, launch), startup(key, launch), startup(key, launch)]);
    assert.ok(rs.every(r => r.firstOpen === true));
    assert.ok(rs.every(r => r.destination === "/daily-rhythm/day/1"));
  });
  it("TEST B — a React remount in the same launch does not switch to Today's Steps", async () => {
    const key = `dr-b-${nonce}`; await reset(key);
    const launch = `launch-b-${key}`;
    const first = await startup(key, launch); const remount = await startup(key, launch);
    assert.equal(first.destination, remount.destination);
    assert.equal(remount.destination, "/daily-rhythm/day/1");
  });
  it("TEST C — authentication restoration retries consistently", async () => {
    const key = `dr-c-${nonce}`; await reset(key);
    const launch = `launch-c-${key}`;
    const beforeAuth = await startup(key, launch); const afterAuth = await startup(key, launch);
    assert.equal(beforeAuth.destination, afterAuth.destination);
    assert.equal(afterAuth.firstOpen, true);
  });
  it("TEST D — a PWA-style restart within one document launch is idempotent", async () => {
    const key = `dr-d-${nonce}`; await reset(key);
    const launch = `launch-d-${key}`;
    const rs = await Promise.all([startup(key, launch), startup(key, launch)]);
    assert.deepEqual(new Set(rs.map(r => r.destination)), new Set(["/daily-rhythm/day/1"]));
  });
  it("TEST E — first genuine launch returns Daily Rhythm", async () => {
    const key = `dr-e-${nonce}`; await reset(key);
    assert.equal((await startup(key, `launch-e-1-${key}`)).destination, "/daily-rhythm/day/1");
  });
  it("TEST F — second genuine launch returns Today's Steps", async () => {
    const key = `dr-f-${nonce}`; await reset(key);
    await startup(key, `launch-f-1-${key}`);
    assert.equal((await startup(key, `launch-f-2-${key}`)).destination, "/walk");
  });
  it("TEST G — independent users each receive their own first-launch destination", async () => {
    const a = `dr-g-a-${nonce}`, b = `dr-g-b-${nonce}`; await reset(a); await reset(b);
    const rs = await Promise.all([startup(a, `launch-g-a-${a}`), startup(b, `launch-g-b-${b}`)]);
    assert.ok(rs.every(r => r.destination === "/daily-rhythm/day/1" && r.firstOpen));
  });
  it("TEST H — an incomplete step remains the automatic destination next day", async () => {
    const key = `dr-h-${nonce}`; await reset(key); await startup(key, `launch-h-1-${key}`); await ageProgress(key);
    const r = await startup(key, `launch-h-2-${key}`);
    assert.equal(r.destination, "/daily-rhythm/day/1");
  });
  it("TEST I — a completed step unlocks exactly one automatic destination next day", async () => {
    const key = `dr-i-${nonce}`; await reset(key); await startup(key, `launch-i-1-${key}`); await complete(key, 1); await ageProgress(key);
    const r = await startup(key, `launch-i-2-${key}`);
    assert.equal(r.destination, "/daily-rhythm/day/2");
  });
});