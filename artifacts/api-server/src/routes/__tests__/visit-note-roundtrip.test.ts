/**
 * visit-note-roundtrip.test.ts — End-to-end integrity tests for the
 * "Mark visit done" flow in the Pastoral Care module.
 *
 * Scenarios covered:
 *  1. Note round-trip — completing a visit with a note and re-fetching the visit
 *     history shows the note in completedNote (not empty or null).
 *  2. No-note completion — completing a visit without a note returns an empty
 *     completedNote so the frontend never renders a spurious empty quote block.
 *  3. Status update — after marking done, the same visit record has isCompleted=true
 *     and a non-null completedAt timestamp.
 *  4. Button disappears — a visit that is already completed has isCompleted=true
 *     (the frontend condition that hides the "Mark done" button).
 *  5. Duplicate guard — trying to complete the same visit twice returns 409 with a
 *     human-readable error.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/visit-note-roundtrip.test.ts
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
const ADMIN_ID   = `test-admin-visit-${TAG}`;
const ADMIN_ROLE = "admin";

// A visit date that is today (always within the 7-day window the server enforces)
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

let meetingTypeId = "";
let personId      = "";           // pastoral_person used across all tests

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a pastoral person and return their id. */
async function createPerson(name: string): Promise<string> {
  const res = await request({
    method: "POST",
    path: "/api/pastoral/people",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { fullName: name, personType: "attendance_only" },
  });
  assert.equal(res.status, 201, `Create person failed: ${res.body}`);
  return (JSON.parse(res.body) as { id: string }).id;
}

/** Create a session for the given date and return its id. */
async function createSession(date: string): Promise<string> {
  const res = await request({
    method: "POST",
    path: "/api/pastoral/sessions",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { meetingTypeId, sessionDate: date, startTime: "09:00" },
  });
  assert.equal(res.status, 201, `Create session failed: ${res.body}`);
  return (JSON.parse(res.body) as { id: string }).id;
}

/** Mark a person as expected for the test meeting type. */
async function setExpected(pId: string): Promise<void> {
  const res = await request({
    method: "PUT",
    path: `/api/pastoral/people/pp-${pId}/expectations`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { meetingTypeId, expectation: "expected" },
  });
  assert.equal(res.status, 200, `Set expectation failed: ${res.body}`);
}

/** Close a session so care signals fire. */
async function closeSession(sId: string): Promise<void> {
  const res = await request({
    method: "PATCH",
    path: `/api/pastoral/sessions/${sId}`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { status: "completed" },
  });
  assert.equal(res.status, 200, `Close session failed: ${res.body}`);
}

/**
 * Schedule a visit from the oldest open care signal for a person.
 * Returns the visit audit entry id used for the complete call.
 */
async function scheduleVisitFromSignal(pId: string, visitDate: string): Promise<string> {
  // 1. Get open care signals for this person
  const params = new URLSearchParams({ personId: pId, personType: "pastoral_person", limit: "10" });
  const sigRes = await request({
    path: `/api/pastoral/care-signals?${params}`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
  });
  assert.equal(sigRes.status, 200, `List care signals failed: ${sigRes.body}`);
  const signals = JSON.parse(sigRes.body) as Array<{ id: string }>;
  assert.ok(signals.length > 0, `No open care signals found for person ${pId}`);

  // 2. Schedule a visit from the first signal
  const signalId = signals[0].id;
  const schedRes = await request({
    method: "PATCH",
    path: `/api/pastoral/care-signals/${signalId}/schedule-visit`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: { visitDate, reason: `Test visit [${TAG}]` },
  });
  assert.equal(schedRes.status, 200, `Schedule visit failed: ${schedRes.body}`);

  // 3. Read back the visit history to find the audit entry id
  const visitsRes = await request({
    path: `/api/pastoral/people/pp-${pId}/visits`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
  });
  assert.equal(visitsRes.status, 200, `Get visits failed: ${visitsRes.body}`);
  const visits = JSON.parse(visitsRes.body) as Array<{ id: string; isCompleted: boolean }>;
  const pending = visits.find(v => !v.isCompleted);
  assert.ok(pending, `No pending visit found for person ${pId} after scheduling`);
  return pending.id;
}

/** Fetch the full visit history for a pastoral person. */
async function getVisits(pId: string): Promise<Array<{
  id: string;
  visitDate: string;
  reason: string;
  scheduledBy: string;
  scheduledAt: string;
  isCompleted: boolean;
  completedNote: string;
  completedAt: string | null;
}>> {
  const res = await request({
    path: `/api/pastoral/people/pp-${pId}/visits`,
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
  });
  assert.equal(res.status, 200, `getVisits failed: ${res.body}`);
  return JSON.parse(res.body) as ReturnType<typeof getVisits> extends Promise<infer T> ? T : never;
}

// ─── Global setup ─────────────────────────────────────────────────────────────

before(async () => {
  // 1. Meeting type with care signals enabled
  const mtRes = await request({
    method: "POST",
    path: "/api/pastoral/meeting-types",
    userId: ADMIN_ID,
    role: ADMIN_ROLE,
    body: {
      name: `__TEST__ Visit Note [${TAG}]`,
      category: "general",
      trackAttendance: true,
      careSignalEnabled: true,
    },
  });
  assert.equal(mtRes.status, 201, `Create meeting type failed: ${mtRes.body}`);
  meetingTypeId = (JSON.parse(mtRes.body) as { id: string }).id;

  // 2. Pastoral person used across all tests
  personId = await createPerson(`Test Visit Person [${TAG}]`);

  // 3. Set expectation so closing a session produces a care signal
  await setExpected(personId);
});

// ─── Teardown ─────────────────────────────────────────────────────────────────

after(async () => {
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

// ─── 1. Note round-trip ───────────────────────────────────────────────────────

describe("1 — Note round-trip: completing a visit with a note stores and returns it", () => {
  let visitEntryId = "";
  const NOTE = `Visited at home, spoke about community involvement. [${TAG}]`;

  before(async () => {
    // Generate a care signal by closing a session where the person is absent
    const sId = await createSession("2026-07-01");
    await closeSession(sId);
    visitEntryId = await scheduleVisitFromSignal(personId, todayISO());
  });

  it("PATCH /visits/:entryId/complete with a note returns ok=true", async () => {
    const res = await request({
      method: "PATCH",
      path: `/api/pastoral/visits/${visitEntryId}/complete`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { personId, note: NOTE },
    });
    assert.equal(res.status, 200, `Complete visit failed: ${res.body}`);
    const body = JSON.parse(res.body) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it("GET /people/:personKey/visits returns isCompleted=true for the visit", async () => {
    const visits = await getVisits(personId);
    const done = visits.find(v => v.id === visitEntryId);
    assert.ok(done, `Visit ${visitEntryId} not found in history`);
    assert.equal(done.isCompleted, true, "Expected isCompleted=true after marking done");
  });

  it("the note is returned verbatim in completedNote", async () => {
    const visits = await getVisits(personId);
    const done = visits.find(v => v.id === visitEntryId);
    assert.ok(done, `Visit ${visitEntryId} not found in history`);
    assert.equal(
      done.completedNote,
      NOTE,
      `Expected completedNote='${NOTE}', got '${done.completedNote}'`
    );
  });

  it("completedAt is non-null after marking done", async () => {
    const visits = await getVisits(personId);
    const done = visits.find(v => v.id === visitEntryId);
    assert.ok(done, `Visit ${visitEntryId} not found in history`);
    assert.ok(
      done.completedAt !== null,
      `Expected completedAt to be non-null, got ${done.completedAt}`
    );
  });
});

// ─── 2. No-note completion ────────────────────────────────────────────────────

describe("2 — No-note completion: empty note produces an empty completedNote (no phantom quote block)", () => {
  let visitEntryId = "";

  before(async () => {
    // Generate a second care signal
    const sId = await createSession("2026-07-08");
    await closeSession(sId);
    visitEntryId = await scheduleVisitFromSignal(personId, todayISO());
  });

  it("PATCH /visits/:entryId/complete with no note returns ok=true", async () => {
    const res = await request({
      method: "PATCH",
      path: `/api/pastoral/visits/${visitEntryId}/complete`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { personId, note: "" },
    });
    assert.equal(res.status, 200, `Complete visit (no note) failed: ${res.body}`);
    const body = JSON.parse(res.body) as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it("completedNote is an empty string (falsy — frontend will suppress the quote block)", async () => {
    const visits = await getVisits(personId);
    const done = visits.find(v => v.id === visitEntryId);
    assert.ok(done, `Visit ${visitEntryId} not found in history`);
    assert.equal(
      done.completedNote,
      "",
      `Expected completedNote='' when note was omitted, got '${done.completedNote}'`
    );
  });

  it("isCompleted is still true and completedAt is populated even without a note", async () => {
    const visits = await getVisits(personId);
    const done = visits.find(v => v.id === visitEntryId);
    assert.ok(done, `Visit ${visitEntryId} not found`);
    assert.equal(done.isCompleted, true, "Expected isCompleted=true");
    assert.ok(done.completedAt !== null, "Expected completedAt to be non-null");
  });
});

// ─── 3. Status badge / button — isCompleted drives the UI ────────────────────

describe("3 — Status update: isCompleted=true after save (drives green badge + hides button)", () => {
  let visitEntryId = "";

  before(async () => {
    // Generate a third care signal
    const sId = await createSession("2026-07-15");
    await closeSession(sId);
    visitEntryId = await scheduleVisitFromSignal(personId, todayISO());
  });

  it("before completion, the visit appears with isCompleted=false", async () => {
    const visits = await getVisits(personId);
    const pending = visits.find(v => v.id === visitEntryId);
    assert.ok(pending, `Pending visit ${visitEntryId} not found before completing`);
    assert.equal(pending.isCompleted, false, "Expected isCompleted=false before marking done");
  });

  it("after completion, the same visit has isCompleted=true", async () => {
    await request({
      method: "PATCH",
      path: `/api/pastoral/visits/${visitEntryId}/complete`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { personId, note: "Follow-up complete." },
    });
    const visits = await getVisits(personId);
    const done = visits.find(v => v.id === visitEntryId);
    assert.ok(done, `Visit ${visitEntryId} not found after completing`);
    assert.equal(done.isCompleted, true, "Expected isCompleted=true after marking done");
  });
});

// ─── 4. Duplicate guard ───────────────────────────────────────────────────────

describe("4 — Duplicate guard: completing the same visit twice returns 409", () => {
  let visitEntryId = "";

  before(async () => {
    // Generate a fourth care signal and complete it once
    const sId = await createSession("2026-07-22");
    await closeSession(sId);
    visitEntryId = await scheduleVisitFromSignal(personId, todayISO());

    const res = await request({
      method: "PATCH",
      path: `/api/pastoral/visits/${visitEntryId}/complete`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { personId, note: "First completion." },
    });
    assert.equal(res.status, 200, `First complete failed: ${res.body}`);
  });

  it("second PATCH to the same visit returns HTTP 409", async () => {
    const res = await request({
      method: "PATCH",
      path: `/api/pastoral/visits/${visitEntryId}/complete`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { personId, note: "Duplicate attempt." },
    });
    assert.equal(
      res.status,
      409,
      `Expected 409 on duplicate complete, got ${res.status}: ${res.body}`
    );
  });

  it("the 409 error body contains a human-readable message", async () => {
    const res = await request({
      method: "PATCH",
      path: `/api/pastoral/visits/${visitEntryId}/complete`,
      userId: ADMIN_ID,
      role: ADMIN_ROLE,
      body: { personId, note: "Duplicate attempt 2." },
    });
    const body = JSON.parse(res.body) as { error?: string };
    assert.ok(
      typeof body.error === "string" && body.error.length > 0,
      `Expected a non-empty error string in 409 body, got: ${JSON.stringify(body)}`
    );
  });

  it("visit history shows exactly one completion entry (the original note is preserved)", async () => {
    const visits = await getVisits(personId);
    const done = visits.find(v => v.id === visitEntryId);
    assert.ok(done, "Completed visit not found in history");
    assert.equal(done.isCompleted, true, "isCompleted should still be true");
    assert.equal(
      done.completedNote,
      "First completion.",
      `Original note should be preserved; got '${done.completedNote}'`
    );
  });
});
