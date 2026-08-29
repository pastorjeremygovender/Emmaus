import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import crypto from "node:crypto";
import http from "node:http";
import { pool } from "@workspace/db";
import { authHeader, cleanupTestAuth, testUserIdFor } from "../../test-utils/test-auth.ts";
import {
  claimReminderDelivery,
  hasCompletedDailyRhythm,
  listReminderSubscriptions,
} from "../../lib/reminder-store.ts";

if (process.env.NODE_ENV !== "test" || process.env.ALLOW_TEST_AUTH_HARNESS !== "1" ||
    process.env.REPLIT_DEPLOYMENT) {
  throw new Error("reminders.test must run with the explicit test auth harness outside deployments");
}

const nonce = crypto.randomBytes(7).toString("hex");
const alice = `reminders-alice-${nonce}`;
const bob = `reminders-bob-${nonce}`;
const endpoint = `https://fcm.googleapis.com/fcm/send/__test__-${nonce}`;
const journeyId = `__test-reminder-rhythm-${nonce}`;
const keys = {
  p256dh: Buffer.concat([Buffer.from([4]), crypto.randomBytes(64)]).toString("base64url"),
  auth: crypto.randomBytes(16).toString("base64url"),
};
let server: http.Server;

function request(path: string, headers: Record<string, string>, method = "GET", body?: object) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const data = body ? JSON.stringify(body) : undefined;
    const req = http.request({
      hostname: "127.0.0.1", port: (server.address() as { port: number }).port,
      path, method, headers: { "Content-Type": "application/json", ...headers,
        ...(data ? { "Content-Length": String(Buffer.byteLength(data)) } : {}) },
    }, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

before(async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminder_subscriptions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint text NOT NULL UNIQUE, subscription text NOT NULL, reminder_time text NOT NULL, timezone text NOT NULL,
      active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS reminder_delivery_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subscription_id uuid NOT NULL REFERENCES reminder_subscriptions(id) ON DELETE CASCADE,
      local_date text NOT NULL, status text NOT NULL DEFAULT 'claimed', error text, delivered_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(subscription_id, local_date)
    );
    CREATE TABLE IF NOT EXISTS daily_rhythm_opening_ledger (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL, journey_id text NOT NULL,
      local_date text NOT NULL, local_timezone text NOT NULL DEFAULT 'Africa/Johannesburg', assigned_day integer NOT NULL,
      target_step_id uuid, state text NOT NULL, completed_today boolean NOT NULL DEFAULT false,
      destination text NOT NULL, reason text NOT NULL, decision_id uuid NOT NULL DEFAULT gen_random_uuid(),
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
    )`);
  await pool.query(
    `INSERT INTO journeys (id, title, description, journey_type, duration_days, status)
     VALUES ($1, $2, '', 'daily-rhythm', 1, 'Published')
     ON CONFLICT (id) DO NOTHING`,
    [journeyId, `__TEST__ Reminder Rhythm ${nonce}`],
  );
  const [{ default: express }, { authMiddleware }, { remindersRouter }] = await Promise.all([
    import("express"), import("../../middlewares/authMiddleware.ts"), import("../reminders.ts"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((_req, _res, next) => { (_req as unknown as { log: object }).log = { warn() {}, info() {}, error() {} }; next(); });
  app.use(authMiddleware);
  app.use("/api", remindersRouter);
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
});

after(async () => {
  await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  const ids = [await testUserIdFor(alice), await testUserIdFor(bob)];
  await pool.query(`DELETE FROM daily_rhythm_opening_ledger WHERE user_id = ANY($1::text[])`, [ids]);
  await pool.query(`DELETE FROM reminder_subscriptions WHERE endpoint = $1`, [endpoint]);
  await pool.query(`DELETE FROM journeys WHERE id = $1`, [journeyId]);
  await cleanupTestAuth();
});

describe("reminder subscription lifecycle and identity isolation", () => {
  it("creates, updates, deactivates, and does not expose another user's device", async () => {
    const aliceAuth = await authHeader(alice);
    const bobAuth = await authHeader(bob);
    const bad = await request("/api/reminders/subscriptions", aliceAuth, "POST", {
      subscription: { endpoint: "http://not-push.test", keys: { p256dh: "bad", auth: "bad" } },
      reminderTime: "09:00", timezone: "Africa/Johannesburg",
    });
    assert.equal(bad.status, 400);
    for (const maliciousEndpoint of [
      "https://127.0.0.1/internal",
      "https://169.254.169.254/latest/meta-data",
      "https://example.com/member-controlled",
      "https://fcm.googleapis.com:8443/fcm/send/not-allowed",
      "https://fcm.googleapis.com/fcm/send/token#hidden-fragment",
      "https://fcm.googleapis.com.evil.test/fcm/send/token",
    ]) {
      const rejected = await request("/api/reminders/subscriptions", aliceAuth, "POST", {
        subscription: { endpoint: maliciousEndpoint, keys },
        reminderTime: "09:00", timezone: "Africa/Johannesburg",
      });
      assert.equal(rejected.status, 400, maliciousEndpoint);
    }
    const created = await request("/api/reminders/subscriptions", aliceAuth, "POST", {
      subscription: { endpoint, keys }, reminderTime: "09:00", timezone: "Africa/Johannesburg",
    });
    assert.equal(created.status, 201, created.body);
    const takeover = await request("/api/reminders/subscriptions", bobAuth, "POST", {
      subscription: { endpoint, keys }, reminderTime: "07:30", timezone: "Europe/London",
    });
    assert.equal(takeover.status, 409, takeover.body);
    const bobStatus = await request(`/api/reminders/status?endpoint=${encodeURIComponent(endpoint)}`, bobAuth);
    assert.equal(bobStatus.status, 200);
    assert.equal(JSON.parse(bobStatus.body).currentDevice, null);
    const prefs = await request("/api/reminders/preferences", aliceAuth, "PATCH", {
      reminderTime: "18:30", timezone: "America/New_York",
    });
    assert.equal(prefs.status, 200);
    const status = await request(`/api/reminders/status?endpoint=${encodeURIComponent(endpoint)}`, aliceAuth);
    assert.deepEqual(JSON.parse(status.body).currentDevice, { active: true, endpoint });
    assert.equal(JSON.parse(status.body).reminderTime, "18:30");
    const foreignDelete = await request("/api/reminders/subscriptions", bobAuth, "DELETE", { endpoint });
    assert.equal(foreignDelete.status, 204);
    assert.equal((await listReminderSubscriptions()).some(item => item.endpoint === endpoint), true);
    const removed = await request("/api/reminders/subscriptions", aliceAuth, "DELETE", { endpoint });
    assert.equal(removed.status, 204);
    assert.equal((await listReminderSubscriptions()).some(item => item.endpoint === endpoint), false);
  });
});

it("atomically claims one delivery and honors authoritative completed-today suppression", async () => {
  const aliceId = await testUserIdFor(alice);
  const result = await pool.query(`SELECT id FROM reminder_subscriptions WHERE endpoint = $1`, [endpoint]);
  // Re-enable/create a dedicated device after lifecycle test deactivated it.
  const subscription = result.rows[0]?.id ?? (await pool.query(
    `INSERT INTO reminder_subscriptions(user_id, endpoint, subscription, reminder_time, timezone)
     VALUES($1,$2,$3,'09:00','Africa/Johannesburg') RETURNING id`,
    [aliceId, endpoint, JSON.stringify({ endpoint, keys })],
  )).rows[0].id;
  const claims = await Promise.all(Array.from({ length: 8 }, () => claimReminderDelivery(subscription, "2099-01-02")));
  assert.equal(claims.filter(Boolean).length, 1);
  await pool.query(
    `INSERT INTO daily_rhythm_opening_ledger
       (user_id, journey_id, local_date, assigned_day, state, completed_today, destination, reason, updated_at)
     VALUES($1,$2,'2099-01-01',1,'opened',true,'/daily-rhythm','completed','2099-01-02 12:00:00+02')`,
    [aliceId, journeyId],
  );
  // The ledger date label may come from an earlier account timezone. The
  // completion instant still suppresses the reminder's Johannesburg day.
  assert.equal(await hasCompletedDailyRhythm(aliceId, "2099-01-02", "Africa/Johannesburg"), true);
  assert.equal(await hasCompletedDailyRhythm(aliceId, "2099-01-03", "Africa/Johannesburg"), false);
});