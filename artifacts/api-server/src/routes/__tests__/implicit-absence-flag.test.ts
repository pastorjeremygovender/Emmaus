/**
 * implicit-absence-flag.test.ts — Confirms that generateCareSignals flags
 * expected members who were NEVER added to the register (no attendance record
 * at all), not just those explicitly marked 'absent'.
 *
 * Scenario:
 *   - A meeting type with care_signal_enabled = true.
 *   - Two people both set as 'expected' for that meeting type.
 *   - Person A is recorded as 'present' during the session.
 *   - Person B is never touched — no attendance record exists for them.
 *   - The session is completed.
 *   - Expected: a care signal is generated for Person B (implicit absence).
 *   - Expected: no care signal is generated for Person A (was present).
 *
 * Teardown:
 *   - Expectations removed for both persons.
 *   - Attendance record for Person A deleted.
 *   - Open care signals for Person B dismissed.
 *   - Both persons and the meeting type soft-deleted (isActive = false).
 *
 * Run (from artifacts/api-server/):
 *   TEST_SERVER_URL=http://localhost:8080 node --test --experimental-strip-types \
 *     src/routes/__tests__/implicit-absence-flag.test.ts
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

/** Poll until predicate returns true, or throw after maxWaitMs. */
async function pollUntil(
  fn: () => Promise<boolean>,
  { maxWaitMs = 5000, intervalMs = 200 }: { maxWaitMs?: number; intervalMs?: number } = {}
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil: condition not met within ${maxWaitMs}ms`);
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TAG        = Date.now();
const ADMIN_ID   = `test-admin-implicit-${TAG}`;
const ADMIN_ROLE = "admin";

// Use today's date dynamically so the test never contains a stale hardcoded value.
const SESSION_DATE = new Date().toISOString().slice(0, 10);

let meetingTypeId    = "";
let sessionId        = "";
let personAId        = ""; // will be recorded 'present'
let personBId        = ""; // will NOT be recorded at all
let personARecordId  = ""; // attendance record id for Person A (for cleanup)

// ─── Setup ────────────────────────────────────────────────────────────────────

before(async () => {
  // 1. Create a meeting type with care signals enabled.
  const mtRes = await request({
    method: "POST",
    path: "/api/pastoral/meeting-types",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: {
      name: `__TEST__ Implicit Absence [${TAG}]`,
      category: "general",
      trackAttendance: true,
      careSignalEnabled: true,
    },
  });
  assert.equal(mtRes.status, 201, `Create meeting type failed: ${mtRes.body}`);
  meetingTypeId = (JSON.parse(mtRes.body) as { id: string }).id;

  // 2. Create Person A — will be recorded as present.
  const personARes = await request({
    method: "POST",
    path: "/api/pastoral/people",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { fullName: `Test Person A Present [${TAG}]`, personType: "attendance_only" },
  });
  assert.equal(personARes.status, 201, `Create Person A failed: ${personARes.body}`);
  personAId = (JSON.parse(personARes.body) as { id: string }).id;

  // 3. Create Person B — will never be recorded.
  const personBRes = await request({
    method: "POST",
    path: "/api/pastoral/people",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { fullName: `Test Person B Unrecorded [${TAG}]`, personType: "attendance_only" },
  });
  assert.equal(personBRes.status, 201, `Create Person B failed: ${personBRes.body}`);
  personBId = (JSON.parse(personBRes.body) as { id: string }).id;

  // 4. Set 'expected' attendance expectations for BOTH persons on this meeting type.
  for (const [personId, label] of [[personAId, "A"], [personBId, "B"]] as const) {
    const expRes = await request({
      method: "PUT",
      path: `/api/pastoral/people/pp-${personId}/expectations`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { meetingTypeId, expectation: "expected" },
    });
    assert.equal(expRes.status, 200, `Set expectation for Person ${label} failed: ${expRes.body}`);
  }

  // 5. Create a session for this meeting type.
  const sessRes = await request({
    method: "POST",
    path: "/api/pastoral/sessions",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { meetingTypeId, sessionDate: SESSION_DATE, startTime: "09:00" },
  });
  assert.equal(sessRes.status, 201, `Create session failed: ${sessRes.body}`);
  sessionId = (JSON.parse(sessRes.body) as { id: string }).id;

  // 6. Record Person A as 'present' — but leave Person B completely unrecorded.
  const regRes = await request({
    method: "POST",
    path: `/api/pastoral/sessions/${sessionId}/register`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { personId: personAId, personType: "pastoral_person", status: "present" },
  });
  assert.equal(regRes.status, 200, `Record Person A failed: ${regRes.body}`);

  // Capture the record id so we can delete it during teardown.
  const regBody = JSON.parse(regRes.body) as { recordId?: string; id?: string };
  personARecordId = String(regBody.recordId ?? regBody.id ?? "");

  // 7. Complete the session — this triggers generateCareSignals asynchronously.
  const completeRes = await request({
    method: "PATCH",
    path: `/api/pastoral/sessions/${sessionId}`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { status: "completed" },
  });
  assert.equal(completeRes.status, 200, `Complete session failed: ${completeRes.body}`);

  // 8. Poll until Person B's signal appears (deterministic, no fixed sleep).
  await pollUntil(async () => {
    const res = await request({
      path: `/api/pastoral/care-signals?personId=${personBId}&personType=pastoral_person`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
    });
    if (res.status !== 200) return false;
    const signals = JSON.parse(res.body) as Array<{ sessionId: string; dismissedAt?: string | null }>;
    return signals.some((s) => s.sessionId === sessionId && !s.dismissedAt);
  }, { maxWaitMs: 5000, intervalMs: 250 });
});

// ─── Teardown ─────────────────────────────────────────────────────────────────

after(async () => {
  // Remove expectations so the meeting type can be cleanly deactivated.
  for (const personId of [personAId, personBId]) {
    if (personId && meetingTypeId) {
      await request({
        method: "DELETE",
        path: `/api/pastoral/people/pp-${personId}/expectations/${meetingTypeId}`,
        userId: ADMIN_ID,
        role: ADMIN_ROLE,
      }).catch(() => {/* non-fatal */});
    }
  }

  // Remove Person A's attendance record.
  if (sessionId && personAId) {
    await request({
      method: "DELETE",
      path: `/api/pastoral/sessions/${sessionId}/register/pp-${personAId}`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
    }).catch(() => {/* non-fatal */});
  }

  // Dismiss any open care signals for Person B so they don't pollute the badge count.
  if (personBId) {
    const sigRes = await request({
      path: `/api/pastoral/care-signals?personId=${personBId}&personType=pastoral_person`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
    }).catch(() => ({ status: 0, body: "[]" }));
    if (sigRes.status === 200) {
      const signals = JSON.parse(sigRes.body) as Array<{ id: string; dismissedAt?: string | null }>;
      for (const sig of signals.filter((s) => !s.dismissedAt)) {
        await request({
          method: "PATCH",
          path: `/api/pastoral/care-signals/${sig.id}/dismiss`,
          userId: ADMIN_ID,
          role: ADMIN_ROLE,
        }).catch(() => {/* non-fatal */});
      }
    }
  }

  // Soft-delete persons and meeting type so they don't appear in UIs.
  for (const personId of [personAId, personBId]) {
    if (personId) {
      await request({
        method: "PATCH",
        path: `/api/pastoral/people/${personId}`,
        userId: ADMIN_ID,
        role: ADMIN_ROLE,
        body: { isActive: false },
      }).catch(() => {/* non-fatal */});
    }
  }
  if (meetingTypeId) {
    await request({
      method: "PATCH",
      path: `/api/pastoral/meeting-types/${meetingTypeId}`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { isActive: false },
    }).catch(() => {/* non-fatal */});
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────

async function getCareSignalsForPerson(
  personId: string
): Promise<Array<Record<string, unknown>>> {
  const res = await request({
    path: `/api/pastoral/care-signals?personId=${personId}&personType=pastoral_person`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
  });
  assert.equal(res.status, 200, `getCareSignals failed: ${res.body}`);
  return JSON.parse(res.body) as Array<Record<string, unknown>>;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Implicit absence flagging — Person B (never recorded) receives a care signal", () => {
  it("Person B has at least one open care signal after session completion", async () => {
    const signals = await getCareSignalsForPerson(personBId);
    const openSignals = signals.filter((s) => !s.dismissedAt);
    assert.ok(
      openSignals.length >= 1,
      `Expected ≥1 open care signal for Person B (never recorded), found ${openSignals.length}. ` +
      `All signals: ${JSON.stringify(signals)}`
    );
  });

  it("Person B's care signal is linked to the completed session", async () => {
    const signals = await getCareSignalsForPerson(personBId);
    const forSession = signals.filter((s) => s.sessionId === sessionId);
    assert.ok(
      forSession.length >= 1,
      `Expected a care signal for Person B linked to sessionId=${sessionId}, ` +
      `found signals: ${JSON.stringify(signals)}`
    );
  });

  it("Person B's care signal has trigger 'missed_session'", async () => {
    const signals = await getCareSignalsForPerson(personBId);
    const forSession = signals.find((s) => s.sessionId === sessionId);
    assert.ok(forSession, "Signal for session not found");
    assert.equal(
      forSession.trigger,
      "missed_session",
      `Expected trigger='missed_session', got '${forSession.trigger}'`
    );
  });
});

describe("Implicit absence flagging — Person A (recorded present) is not flagged", () => {
  it("Person A has no open care signal for this session", async () => {
    const signals = await getCareSignalsForPerson(personAId);
    const forSession = signals.filter(
      (s) => s.sessionId === sessionId && !s.dismissedAt
    );
    assert.equal(
      forSession.length,
      0,
      `Expected 0 care signals for Person A (was present), found ${forSession.length}: ` +
      JSON.stringify(forSession)
    );
  });
});

describe("Implicit absence flagging — Badge count includes implicit absences", () => {
  it("GET /care-signals (all open) returns at least the signal for Person B", async () => {
    const res = await request({
      path: `/api/pastoral/care-signals`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
    });
    assert.equal(res.status, 200, `List care signals failed: ${res.body}`);
    const signals = JSON.parse(res.body) as Array<Record<string, unknown>>;
    const found = signals.some(
      (s) => s.personId === personBId && s.sessionId === sessionId && !s.dismissedAt
    );
    assert.ok(
      found,
      `Person B's implicit-absence signal not found in the global open-signals list. ` +
      `Signals returned: ${signals.length}`
    );
  });
});
