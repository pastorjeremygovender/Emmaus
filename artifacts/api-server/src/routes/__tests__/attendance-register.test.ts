/**
 * attendance-register.test.ts — End-to-end integrity tests for the attendance
 * register save + correction flow (Pastoral Care module, Checkpoint 1).
 *
 * Scenarios covered:
 *  1. Upsert idempotency — marking a person twice produces exactly one record.
 *  2. Correction flow — changing status creates a 'correct' audit entry with
 *     oldStatus / newStatus captured, and the register reflects the new status.
 *  3. Cancelled-session guard — POST /sessions/:id/register returns 409 when
 *     the session has been cancelled.
 *  4. Add Visitor → subsequent register — a pastoral_person created mid-session
 *     (the "Add Visitor" flow) appears in the register on the next GET.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/attendance-register.test.ts
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

const TAG         = Date.now();
const ADMIN_ID    = `test-admin-reg-${TAG}`;
const ADMIN_ROLE  = "admin";

let meetingTypeId = "";
let sessionId     = "";
let cancelledSessionId = "";
let personId      = ""; // pastoral_person used across tests

// ─── Setup ────────────────────────────────────────────────────────────────────

before(async () => {
  // 1. Create a meeting type.
  const mtRes = await request({
    method: "POST",
    path: "/api/pastoral/meeting-types",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: {
      name: `__TEST__ Attendance Register [${TAG}]`,
      category: "general",
      trackAttendance: true,
    },
  });
  assert.equal(mtRes.status, 201, `Create meeting type failed: ${mtRes.body}`);
  meetingTypeId = (JSON.parse(mtRes.body) as { id: string }).id;

  // 2. Create the primary test session.
  const sessRes = await request({
    method: "POST",
    path: "/api/pastoral/sessions",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: {
      meetingTypeId,
      sessionDate: "2026-08-04",
      startTime: "09:00",
      location: "Test Chapel",
    },
  });
  assert.equal(sessRes.status, 201, `Create session failed: ${sessRes.body}`);
  sessionId = (JSON.parse(sessRes.body) as { id: string }).id;

  // 3. Create a pastoral_person to attend.
  const personRes = await request({
    method: "POST",
    path: "/api/pastoral/people",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: {
      fullName: `Test Attender [${TAG}]`,
      personType: "attendance_only",
    },
  });
  assert.equal(personRes.status, 201, `Create person failed: ${personRes.body}`);
  personId = (JSON.parse(personRes.body) as { id: string }).id;

  // 4. Create a session and immediately cancel it for the guard test.
  const cancelSessRes = await request({
    method: "POST",
    path: "/api/pastoral/sessions",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: {
      meetingTypeId,
      sessionDate: "2026-08-05",
    },
  });
  assert.equal(cancelSessRes.status, 201, `Create cancel-session failed: ${cancelSessRes.body}`);
  cancelledSessionId = (JSON.parse(cancelSessRes.body) as { id: string }).id;

  const cancelRes = await request({
    method: "PATCH",
    path: `/api/pastoral/sessions/${cancelledSessionId}`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { status: "cancelled" },
  });
  assert.equal(cancelRes.status, 200, `Cancel session failed: ${cancelRes.body}`);
});

// ─── Teardown ─────────────────────────────────────────────────────────────────
// The test data lives in the dev DB and uses unique TAGs so it doesn't
// affect production or other test runs. No hard teardown — the pastoral module
// currently has no bulk-delete API, and the test rows are cheap to keep.
// (A future task can add a delete endpoint; see task notes.)

after(async () => {
  // Soft-delete the test person and meeting type so they don't appear in UIs.
  if (personId) {
    await request({
      method: "PATCH",
      path: `/api/pastoral/people/${personId}`,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function recordAttendance(
  sId: string,
  pId: string,
  pType: string,
  status: string
): Promise<{ status: number; body: string }> {
  return request({
    method: "POST",
    path: `/api/pastoral/sessions/${sId}/register`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { personId: pId, personType: pType, status },
  });
}

async function getRegister(sId: string): Promise<Array<Record<string, unknown>>> {
  const res = await request({
    path: `/api/pastoral/sessions/${sId}/register`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
  });
  assert.equal(res.status, 200, `getRegister failed: ${res.body}`);
  return JSON.parse(res.body) as Array<Record<string, unknown>>;
}

async function getAuditLog(
  opts: { entityId?: string; personId?: string } = {}
): Promise<Array<Record<string, unknown>>> {
  const params = new URLSearchParams();
  params.set("entityType", "attendance_record");
  if (opts.entityId) params.set("entityId", opts.entityId);
  if (opts.personId) params.set("personId", opts.personId);
  params.set("limit", "50");

  const res = await request({
    path: `/api/pastoral/audit-log?${params.toString()}`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
  });
  assert.equal(res.status, 200, `getAuditLog failed: ${res.body}`);
  return JSON.parse(res.body) as Array<Record<string, unknown>>;
}

// ─── Test 1: Upsert idempotency ───────────────────────────────────────────────

describe("1 — Upsert idempotency: marking Present twice creates exactly one record", () => {
  it("first POST returns ok=true and created=true", async () => {
    const res = await recordAttendance(sessionId, personId, "pastoral_person", "present");
    assert.equal(res.status, 200, `First record failed: ${res.body}`);
    const body = JSON.parse(res.body) as { ok: boolean; created: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.created, true);
  });

  it("second POST (same status) returns ok=true and created=false", async () => {
    const res = await recordAttendance(sessionId, personId, "pastoral_person", "present");
    assert.equal(res.status, 200, `Second record failed: ${res.body}`);
    const body = JSON.parse(res.body) as { ok: boolean; created: boolean };
    assert.equal(body.ok, true);
    assert.equal(body.created, false);
  });

  it("register contains exactly one record for this person", async () => {
    const records = await getRegister(sessionId);
    const forPerson = records.filter(r => r.personId === personId && r.personType === "pastoral_person");
    assert.equal(
      forPerson.length,
      1,
      `Expected exactly 1 attendance record, found ${forPerson.length}: ${JSON.stringify(forPerson)}`
    );
  });

  it("the single record has status 'present'", async () => {
    const records = await getRegister(sessionId);
    const rec = records.find(r => r.personId === personId && r.personType === "pastoral_person");
    assert.ok(rec, "Attendance record not found");
    assert.equal(rec.status, "present");
  });
});

// ─── Test 2: Correction flow ──────────────────────────────────────────────────

describe("2 — Correction flow: changing Present → Apology writes audit log + updates register", () => {
  let attendanceRecordId = "";

  it("POST with 'apology' returns ok=true, created=false, previousStatus='present'", async () => {
    const res = await recordAttendance(sessionId, personId, "pastoral_person", "apology");
    assert.equal(res.status, 200, `Correction POST failed: ${res.body}`);
    const body = JSON.parse(res.body) as {
      ok: boolean;
      created: boolean;
      previousStatus: string;
    };
    assert.equal(body.ok, true);
    assert.equal(body.created, false);
    assert.equal(
      body.previousStatus,
      "present",
      `Expected previousStatus='present', got '${body.previousStatus}'`
    );
  });

  it("register still has exactly one record for this person after correction", async () => {
    const records = await getRegister(sessionId);
    const forPerson = records.filter(r => r.personId === personId && r.personType === "pastoral_person");
    assert.equal(
      forPerson.length,
      1,
      `Expected 1 record after correction, found ${forPerson.length}`
    );
  });

  it("register shows the corrected status 'apology' after reload", async () => {
    const records = await getRegister(sessionId);
    const rec = records.find(r => r.personId === personId && r.personType === "pastoral_person");
    assert.ok(rec, "Attendance record not found in register after correction");
    assert.equal(
      rec.status,
      "apology",
      `Expected status 'apology' after correction, got '${rec.status}'`
    );
    // Capture the record id for the audit log check below.
    attendanceRecordId = String(rec.id);
  });

  it("audit log has a 'correct' entry for this person", async () => {
    const log = await getAuditLog({ personId });
    const corrections = log.filter(
      e => e.action === "correct" && e.personId === personId
    );
    assert.ok(
      corrections.length >= 1,
      `Expected at least one 'correct' audit entry; got ${log.map(e => e.action).join(", ")}`
    );
  });

  it("audit log 'correct' entry captures old status as 'present'", async () => {
    const log = await getAuditLog({ personId });
    const correction = log.find(
      e => e.action === "correct" && e.personId === personId
    );
    assert.ok(correction, "'correct' audit entry not found");

    // previousValue is stored as JSON; the server returns it already parsed.
    const prev = correction.previousValue as { status?: string } | null;
    assert.ok(prev, "previousValue is null on correct entry");
    assert.equal(
      prev.status,
      "present",
      `Expected previousValue.status='present', got '${prev.status}'`
    );
  });

  it("audit log 'correct' entry captures new status as 'apology'", async () => {
    const log = await getAuditLog({ personId });
    const correction = log.find(
      e => e.action === "correct" && e.personId === personId
    );
    assert.ok(correction, "'correct' audit entry not found");

    const nv = correction.newValue as { status?: string } | null;
    assert.ok(nv, "newValue is null on correct entry");
    assert.equal(
      nv.status,
      "apology",
      `Expected newValue.status='apology', got '${nv.status}'`
    );
  });

  it("audit log 'correct' entry links to the correct sessionId", async () => {
    const log = await getAuditLog({ personId });
    const correction = log.find(
      e => e.action === "correct" && e.personId === personId
    );
    assert.ok(correction, "'correct' audit entry not found");
    assert.equal(
      correction.sessionId,
      sessionId,
      `Expected sessionId='${sessionId}', got '${correction.sessionId}'`
    );
  });
});

// ─── Test 3: Cancelled session guard ─────────────────────────────────────────

describe("3 — Cancelled-session guard: POST /register returns 409 for a cancelled session", () => {
  it("returns HTTP 409 when trying to record attendance for a cancelled session", async () => {
    const res = await recordAttendance(cancelledSessionId, personId, "pastoral_person", "present");
    assert.equal(
      res.status,
      409,
      `Expected 409 for cancelled session, got ${res.status}: ${res.body}`
    );
  });

  it("error message mentions 'cancelled'", async () => {
    const res = await recordAttendance(cancelledSessionId, personId, "pastoral_person", "present");
    const body = JSON.parse(res.body) as { error?: string };
    assert.ok(
      body.error?.toLowerCase().includes("cancel"),
      `Expected error to mention 'cancel', got: '${body.error}'`
    );
  });
});

// ─── Test 4: Add Visitor → appears in subsequent register ────────────────────

describe("4 — Add Visitor flow: a pastoral_person created mid-session appears in the register", () => {
  let visitorPersonId = "";
  let visitorSessionId = "";

  before(async () => {
    // Create a fresh session (simulating a new service).
    const sessRes = await request({
      method: "POST",
      path: "/api/pastoral/sessions",
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: {
        meetingTypeId,
        sessionDate: "2026-08-06",
        startTime: "10:00",
      },
    });
    assert.equal(sessRes.status, 201, `Create visitor-test session failed: ${sessRes.body}`);
    visitorSessionId = (JSON.parse(sessRes.body) as { id: string }).id;

    // Simulate the "Add Visitor" modal: create the pastoral_person first.
    const personRes = await request({
      method: "POST",
      path: "/api/pastoral/people",
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: {
        fullName: `Test Visitor [${TAG}]`,
        personType: "visitor",
      },
    });
    assert.equal(personRes.status, 201, `Create visitor person failed: ${personRes.body}`);
    visitorPersonId = (JSON.parse(personRes.body) as { id: string }).id;

    // Immediately mark as Visitor in the register (as the UI does).
    const regRes = await recordAttendance(visitorSessionId, visitorPersonId, "pastoral_person", "visitor");
    assert.equal(regRes.status, 200, `Mark visitor failed: ${regRes.body}`);
  });

  after(async () => {
    if (visitorPersonId) {
      await request({
        method: "PATCH",
        path: `/api/pastoral/people/${visitorPersonId}`,
        userId: ADMIN_ID,
        role: ADMIN_ROLE,
        body: { isActive: false },
      });
    }
  });

  it("the newly added visitor appears in the register for that session", async () => {
    const records = await getRegister(visitorSessionId);
    const found = records.find(
      r => r.personId === visitorPersonId && r.personType === "pastoral_person"
    );
    assert.ok(
      found,
      `Visitor person (${visitorPersonId}) not found in register ${visitorSessionId}`
    );
  });

  it("the visitor's status is 'visitor' in the register", async () => {
    const records = await getRegister(visitorSessionId);
    const rec = records.find(
      r => r.personId === visitorPersonId && r.personType === "pastoral_person"
    );
    assert.ok(rec, "Visitor record not found");
    assert.equal(rec.status, "visitor");
  });

  it("the visitor's record is the only one for that person (no duplicates)", async () => {
    const records = await getRegister(visitorSessionId);
    const forVisitor = records.filter(
      r => r.personId === visitorPersonId && r.personType === "pastoral_person"
    );
    assert.equal(
      forVisitor.length,
      1,
      `Expected exactly 1 record for the visitor, found ${forVisitor.length}`
    );
  });

  it("the visitor also appears in GET /api/pastoral/people (unified list)", async () => {
    const res = await request({
      path: "/api/pastoral/people",
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
    });
    assert.equal(res.status, 200, `List people failed: ${res.body}`);
    const people = JSON.parse(res.body) as Array<{ id?: string; sourceId?: string }>;
    const found = people.find(p => p.id === visitorPersonId || p.sourceId === visitorPersonId);
    assert.ok(
      found,
      `Visitor (${visitorPersonId}) not found in unified people list after creation`
    );
  });
});

// ─── Test 5: Input validation ─────────────────────────────────────────────────

describe("5 — Input validation: bad requests are rejected", () => {
  it("returns 400 when status is missing", async () => {
    const res = await request({
      method: "POST",
      path: `/api/pastoral/sessions/${sessionId}/register`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { personId, personType: "pastoral_person" },
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}: ${res.body}`);
  });

  it("returns 400 when status is an unrecognised value", async () => {
    const res = await request({
      method: "POST",
      path: `/api/pastoral/sessions/${sessionId}/register`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { personId, personType: "pastoral_person", status: "maybe" },
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}: ${res.body}`);
  });

  it("returns 400 when personId is missing", async () => {
    const res = await request({
      method: "POST",
      path: `/api/pastoral/sessions/${sessionId}/register`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { personType: "pastoral_person", status: "present" },
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}: ${res.body}`);
  });
});
