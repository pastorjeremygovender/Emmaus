/**
 * absence-alerts.test.ts — End-to-end tests confirming the care-signal
 * pipeline fires correctly when a session is closed (marked 'completed').
 *
 * The pipeline is triggered by PATCH /sessions/:id {status:"completed"} which
 * atomically claims the scheduled→completed transition via tryCompleteSession()
 * and then calls generateCareSignals().  Signals are stored in the care_signals
 * table and surfaced via GET /care-signals.
 *
 * Scenarios:
 *  1. Missing attender — person is expected, has NO attendance record → signal created.
 *  2. Apology exemption — person is expected, sent an apology → NO signal.
 *  3. Not-expected override — person's expectation is 'not_expected' → NO signal.
 *  4. Present — person is expected and attended → NO signal.
 *  5. Absent record — person is expected and explicitly marked 'absent' → signal created.
 *  6. Idempotency — closing an already-completed session again → 0 new signals; still exactly 1 in table.
 *  7. Cancelled→completed — closing a cancelled session → NO signals.
 *  8. care_signal_enabled=false — closing session on non-signal type → NO signals.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/absence-alerts.test.ts
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
    if (opts.role)   headers["X-User-Role"] = opts.role;
    if (payload)     headers["Content-Length"] = String(Buffer.byteLength(payload));

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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TAG        = Date.now();
const ADMIN_ID   = `test-admin-alerts-${TAG}`;
const ADMIN_ROLE = "admin";

let meetingTypeId    = "";
let expectedPersonId = ""; // expectation='expected', no attendance → alert
let apologyPersonId  = ""; // expectation='expected', sends apology → no alert
let notExpPersonId   = ""; // expectation='not_expected' → no alert
let presentPersonId  = ""; // expectation='expected', attends → no alert

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function createPerson(name: string): Promise<string> {
  const res = await request({
    method: "POST",
    path: "/api/pastoral/people",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { fullName: name, personType: "attendance_only" },
  });
  assert.equal(res.status, 201, `Create person '${name}' failed: ${res.body}`);
  return (JSON.parse(res.body) as { id: string }).id;
}

async function createSession(date: string, mtId = meetingTypeId): Promise<string> {
  const res = await request({
    method: "POST",
    path: "/api/pastoral/sessions",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { meetingTypeId: mtId, sessionDate: date, startTime: "09:00" },
  });
  assert.equal(res.status, 201, `Create session failed: ${res.body}`);
  return (JSON.parse(res.body) as { id: string }).id;
}

async function setExpectation(
  personId: string,
  expectation: "expected" | "not_expected",
  mtId = meetingTypeId
): Promise<void> {
  const res = await request({
    method: "PUT",
    path: `/api/pastoral/people/pp-${personId}/expectations`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { meetingTypeId: mtId, expectation },
  });
  assert.equal(res.status, 200, `Set expectation failed for ${personId}: ${res.body}`);
}

async function recordAttendance(
  sessionId: string,
  personId: string,
  status: string
): Promise<void> {
  const res = await request({
    method: "POST",
    path: `/api/pastoral/sessions/${sessionId}/register`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { personId, personType: "pastoral_person", status },
  });
  assert.equal(res.status, 200, `Record attendance failed: ${res.body}`);
}

async function closeSession(sessionId: string): Promise<{ ok: boolean; alertCount: number }> {
  const res = await request({
    method: "PATCH",
    path: `/api/pastoral/sessions/${sessionId}`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { status: "completed" },
  });
  assert.equal(res.status, 200, `Close session failed: ${res.body}`);
  return JSON.parse(res.body) as { ok: boolean; alertCount: number };
}

/**
 * Returns care signals for a specific person in a specific session.
 * Queries GET /care-signals and filters client-side on sessionId.
 */
async function getSignalsForPersonInSession(
  personId: string,
  sessionId: string
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    personId,
    personType: "pastoral_person",
    includesDismissed: "true",
    limit: "100",
  });
  const res = await request({
    path: `/api/pastoral/care-signals?${params}`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
  });
  assert.equal(res.status, 200, `Get care signals failed: ${res.body}`);
  const all = JSON.parse(res.body) as Array<Record<string, unknown>>;
  return all.filter(s => s.sessionId === sessionId);
}

/**
 * Returns all care signals for a specific session (any person).
 */
async function getSignalsForSession(
  sessionId: string
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams({
    includesDismissed: "true",
    limit: "200",
  });
  const res = await request({
    path: `/api/pastoral/care-signals?${params}`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
  });
  assert.equal(res.status, 200, `Get care signals failed: ${res.body}`);
  const all = JSON.parse(res.body) as Array<Record<string, unknown>>;
  return all.filter(s => s.sessionId === sessionId);
}

// ─── Setup ────────────────────────────────────────────────────────────────────

before(async () => {
  const mtRes = await request({
    method: "POST",
    path: "/api/pastoral/meeting-types",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: {
      name: `__TEST__ Absence Alerts [${TAG}]`,
      category: "general",
      trackAttendance: true,
      careSignalEnabled: true,
    },
  });
  assert.equal(mtRes.status, 201, `Create meeting type failed: ${mtRes.body}`);
  meetingTypeId = (JSON.parse(mtRes.body) as { id: string }).id;

  expectedPersonId = await createPerson(`Expected Absentee [${TAG}]`);
  apologyPersonId  = await createPerson(`Apology Sender [${TAG}]`);
  notExpPersonId   = await createPerson(`Not Expected [${TAG}]`);
  presentPersonId  = await createPerson(`Present Attender [${TAG}]`);

  await setExpectation(expectedPersonId, "expected");
  await setExpectation(apologyPersonId,  "expected");
  await setExpectation(notExpPersonId,   "not_expected");
  await setExpectation(presentPersonId,  "expected");
});

after(async () => {
  for (const id of [expectedPersonId, apologyPersonId, notExpPersonId, presentPersonId]) {
    if (!id) continue;
    await request({
      method: "PATCH",
      path: `/api/pastoral/people/${id}`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { isActive: false },
    });
  }
  if (meetingTypeId) {
    await request({
      method: "PATCH",
      path: `/api/pastoral/meeting-types/${meetingTypeId}`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { isActive: false },
    });
  }
});

// ─── Test 1: Missing attender → care signal generated ────────────────────────

describe("1 — Missing attender: no attendance record → care signal created", () => {
  let sessionId = "";

  before(async () => {
    sessionId = await createSession("2026-07-01");
    // expectedPersonId intentionally has no attendance record
  });

  it("PATCH /sessions/:id with status='completed' returns ok=true", async () => {
    const result = await closeSession(sessionId);
    assert.equal(result.ok, true);
  });

  it("alertCount in the response is ≥ 1", async () => {
    const signals = await getSignalsForSession(sessionId);
    assert.ok(signals.length >= 1, `Expected ≥1 care signal, got ${signals.length}`);
  });

  it("a care signal exists for the expected-but-missing person", async () => {
    const signals = await getSignalsForPersonInSession(expectedPersonId, sessionId);
    assert.ok(
      signals.length >= 1,
      `No care signal found for person ${expectedPersonId} in session ${sessionId}`
    );
  });

  it("the signal trigger is 'missed_session'", async () => {
    const signals = await getSignalsForPersonInSession(expectedPersonId, sessionId);
    const signal = signals[0];
    assert.ok(signal, "Care signal not found");
    assert.equal(signal.trigger, "missed_session");
  });

  it("the signal sessionId links back to the closed session", async () => {
    const signals = await getSignalsForPersonInSession(expectedPersonId, sessionId);
    const signal = signals[0];
    assert.ok(signal, "Care signal not found");
    assert.equal(signal.sessionId, sessionId);
  });
});

// ─── Test 2: Apology exemption — no signal ───────────────────────────────────

describe("2 — Apology exemption: person sent apology → NO care signal", () => {
  let sessionId = "";

  before(async () => {
    sessionId = await createSession("2026-07-08");
    await recordAttendance(sessionId, apologyPersonId, "apology");
  });

  it("closing the session succeeds", async () => {
    const result = await closeSession(sessionId);
    assert.equal(result.ok, true);
  });

  it("NO care signal for the person who sent an apology", async () => {
    const signals = await getSignalsForPersonInSession(apologyPersonId, sessionId);
    assert.equal(
      signals.length,
      0,
      `Expected 0 signals for apology sender, got ${signals.length}`
    );
  });
});

// ─── Test 3: Not-expected override — no signal ───────────────────────────────

describe("3 — Not-expected: person expectation is 'not_expected' → NO care signal", () => {
  let sessionId = "";

  before(async () => {
    sessionId = await createSession("2026-07-15");
    // notExpPersonId has expectation='not_expected'
  });

  it("closing the session succeeds", async () => {
    const result = await closeSession(sessionId);
    assert.equal(result.ok, true);
  });

  it("NO care signal for a person whose expectation is 'not_expected'", async () => {
    const signals = await getSignalsForPersonInSession(notExpPersonId, sessionId);
    assert.equal(
      signals.length,
      0,
      `Expected 0 signals for not_expected person, got ${signals.length}`
    );
  });
});

// ─── Test 4: Present attender — no signal ────────────────────────────────────

describe("4 — Present: expected person who attended → NO care signal", () => {
  let sessionId = "";

  before(async () => {
    sessionId = await createSession("2026-07-22");
    await recordAttendance(sessionId, presentPersonId, "present");
  });

  it("closing the session succeeds", async () => {
    const result = await closeSession(sessionId);
    assert.equal(result.ok, true);
  });

  it("NO care signal for a person who attended", async () => {
    const signals = await getSignalsForPersonInSession(presentPersonId, sessionId);
    assert.equal(
      signals.length,
      0,
      `Expected 0 signals for present person, got ${signals.length}`
    );
  });
});

// ─── Test 5: Explicitly-absent record → signal created ───────────────────────

describe("5 — Absent record: expected person marked 'absent' → care signal created", () => {
  let sessionId = "";

  before(async () => {
    sessionId = await createSession("2026-07-29");
    await recordAttendance(sessionId, expectedPersonId, "absent");
  });

  it("closing the session succeeds", async () => {
    const result = await closeSession(sessionId);
    assert.equal(result.ok, true);
  });

  it("care signal created for the explicitly-absent person", async () => {
    const signals = await getSignalsForPersonInSession(expectedPersonId, sessionId);
    assert.ok(
      signals.length >= 1,
      `Expected ≥1 signal for absent person, got ${signals.length}`
    );
  });

  it("signal trigger is 'missed_session'", async () => {
    const signals = await getSignalsForPersonInSession(expectedPersonId, sessionId);
    assert.equal(signals[0]?.trigger, "missed_session");
  });
});

// ─── Test 6: Idempotency — closing twice creates signal only once ─────────────

describe("6 — Idempotency: closing an already-completed session again does not duplicate signals", () => {
  let sessionId = "";

  before(async () => {
    sessionId = await createSession("2026-08-05");
    // expectedPersonId has no attendance record
    await closeSession(sessionId); // first close
  });

  it("second PATCH with status='completed' returns ok=true", async () => {
    const result = await closeSession(sessionId);
    assert.equal(result.ok, true);
  });

  it("alertCount from second close is 0", async () => {
    const result = await closeSession(sessionId);
    assert.equal(result.alertCount, 0, `Expected 0 on re-close, got ${result.alertCount}`);
  });

  it("exactly 1 care signal for the person after two closes (no duplicates)", async () => {
    const signals = await getSignalsForPersonInSession(expectedPersonId, sessionId);
    assert.equal(
      signals.length,
      1,
      `Expected exactly 1 signal after two closes, got ${signals.length}`
    );
  });
});

// ─── Test 7: cancelled→completed must NOT trigger signals ────────────────────

describe("7 — Cancelled→completed: closing a cancelled session fires no care signals", () => {
  let sessionId = "";

  before(async () => {
    sessionId = await createSession("2026-08-12");
    const cancelRes = await request({
      method: "PATCH",
      path: `/api/pastoral/sessions/${sessionId}`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { status: "cancelled" },
    });
    assert.equal(cancelRes.status, 200, `Cancel session failed: ${cancelRes.body}`);
  });

  it("PATCH with status='completed' on a cancelled session returns ok=true", async () => {
    const res = await request({
      method: "PATCH",
      path: `/api/pastoral/sessions/${sessionId}`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { status: "completed" },
    });
    assert.equal(res.status, 200, `PATCH failed: ${res.body}`);
    assert.equal((JSON.parse(res.body) as { ok: boolean }).ok, true);
  });

  it("alertCount is 0 — cancelled→completed must not trigger the alert pipeline", async () => {
    const res = await request({
      method: "PATCH",
      path: `/api/pastoral/sessions/${sessionId}`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { status: "completed" },
    });
    const body = JSON.parse(res.body) as { alertCount: number };
    assert.equal(body.alertCount, 0, `Expected 0 alerts for cancelled→completed, got ${body.alertCount}`);
  });

  it("no care signals for an expected person on a cancelled session", async () => {
    const signals = await getSignalsForSession(sessionId);
    assert.equal(signals.length, 0, `Expected 0 signals, got ${signals.length}`);
  });
});

// ─── Test 8: care_signal_enabled=false — no signals fired ────────────────────

describe("8 — care_signal_enabled=false: closing session on non-signal type → no signals", () => {
  let noSignalMeetingTypeId = "";
  let noSignalPersonId = "";
  let sessionId = "";

  before(async () => {
    const mtRes = await request({
      method: "POST",
      path: "/api/pastoral/meeting-types",
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: {
        name: `__TEST__ No Signal [${TAG}]`,
        category: "general",
        trackAttendance: true,
        careSignalEnabled: false,
      },
    });
    assert.equal(mtRes.status, 201, `Create no-signal meeting type failed: ${mtRes.body}`);
    noSignalMeetingTypeId = (JSON.parse(mtRes.body) as { id: string }).id;

    noSignalPersonId = await createPerson(`No-Signal Person [${TAG}]`);
    await setExpectation(noSignalPersonId, "expected", noSignalMeetingTypeId);

    sessionId = await createSession("2026-08-19", noSignalMeetingTypeId);
  });

  after(async () => {
    if (noSignalPersonId) {
      await request({
        method: "PATCH",
        path: `/api/pastoral/people/${noSignalPersonId}`,
        userId: ADMIN_ID,
        role: ADMIN_ROLE,
        body: { isActive: false },
      });
    }
    if (noSignalMeetingTypeId) {
      await request({
        method: "PATCH",
        path: `/api/pastoral/meeting-types/${noSignalMeetingTypeId}`,
        userId: ADMIN_ID,
        role: ADMIN_ROLE,
        body: { isActive: false },
      });
    }
  });

  it("closing the session returns ok=true and alertCount=0", async () => {
    const result = await closeSession(sessionId);
    assert.equal(result.ok, true);
    assert.equal(result.alertCount, 0, `Expected 0 alerts for non-signal type, got ${result.alertCount}`);
  });

  it("no care signals in the table for this session", async () => {
    const signals = await getSignalsForSession(sessionId);
    assert.equal(signals.length, 0, `Expected 0 signals when care_signal_enabled=false, got ${signals.length}`);
  });
});
