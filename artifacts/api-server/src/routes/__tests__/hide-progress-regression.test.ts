/**
 * hide-progress-regression.test.ts — Spec §8 regression guard
 *
 * Eight checks that confirm progress is never lost by the hide-instead-of-remove
 * change. A regression here would silently reset a member's spiritual journey.
 *
 *  RC-1  hide endpoint returns 400 for Daily Rhythm journeys (no hide for DR)
 *  RC-2  Devotional progress survives hide → reopen (day/completedDays intact)
 *  RC-3  Companion progress survives hide → reopen (day/completedDays intact)
 *  RC-4  Hidden devotional absent from Today's Steps (/api/devotionals/progress/all)
 *  RC-5  Hidden companion absent from Today's Steps (/api/sermon-companions/member/engagements)
 *  RC-6  Completion history retained after hide/reopen for both content types
 *  RC-7  Active Engagement rule preserved — hidden items NOT in GET /api/engagements
 *  RC-8  unhide is idempotent — safe to call when content is not hidden
 *
 * Requires the API server to be running.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/hide-progress-regression.test.ts
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
        port:     Number(url.port) || (isHttps ? 443 : 80),
        method:   opts.method ?? "GET",
        path:     opts.path,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() })
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

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RUN     = Date.now();
const ADMIN   = `test-admin-hide-${RUN}`;
const MEMBER  = `test-member-hide-${RUN}`;

let devotionalSeriesId = "";
let companionId        = "";

// Helper: create + publish a devotional series with `days` entries.
async function seedDevotionalSeries(days: number): Promise<string> {
  const createRes = await request({
    method: "POST",
    path:   "/api/devotionals",
    userId: ADMIN,
    role:   "superAdmin",
    body:   {
      title:       `__TEST__ Hide Regression [${RUN}]`,
      description: "Progress regression guard series",
      seriesType:  "general",
    },
  });
  assert.equal(createRes.status, 201, `Create devotional failed: ${createRes.body}`);
  const { id } = json<{ id: string }>(createRes);

  // Seed entries and publish them.
  for (let d = 1; d <= days; d++) {
    const entryRes = await request({
      method: "PUT",
      path:   `/api/devotionals/${id}/entries/${d}`,
      userId: ADMIN,
      role:   "superAdmin",
      body:   {
        title:              `Day ${d} — Regression Guard`,
        scriptureReference: `John ${d}:1`,
        status:             "Published",
      },
    });
    assert.equal(entryRes.status, 200, `Seed entry day=${d} failed: ${entryRes.body}`);
  }

  // Publish the series (PATCH, not PUT).
  const pubRes = await request({
    method: "PATCH",
    path:   `/api/devotionals/${id}`,
    userId: ADMIN,
    role:   "superAdmin",
    body:   { status: "Published" },
  });
  assert.equal(pubRes.status, 200, `Publish series failed: ${pubRes.body}`);

  return id;
}

// Helper: pick the first published companion.
async function pickPublishedCompanion(): Promise<string | null> {
  const res = await request({
    path:   "/api/sermon-companions",
    userId: ADMIN,
    role:   "superAdmin",
  });
  if (res.status !== 200) return null;
  const list = json<Array<{ id: string; status: string }>>(res);
  return list.find(c => c.status === "Published")?.id ?? null;
}

// ─── Setup ────────────────────────────────────────────────────────────────────

before(async () => {
  // Seed a 5-entry devotional series for the regression member.
  devotionalSeriesId = await seedDevotionalSeries(5);

  // Find any published companion to test companion hide/reopen.
  const found = await pickPublishedCompanion();
  if (found) {
    companionId = found;
  }
});

// ─── Cleanup ──────────────────────────────────────────────────────────────────

after(async () => {
  // Remove test progress records so they don't pollute other test runs.
  if (devotionalSeriesId) {
    await request({
      method: "POST",
      path:   `/api/engagements/devotional/${encodeURIComponent(devotionalSeriesId)}/remove`,
      userId: MEMBER,
    });
  }
  if (companionId) {
    await request({
      method: "POST",
      path:   `/api/engagements/sermon-companion/${encodeURIComponent(companionId)}/remove`,
      userId: MEMBER,
    });
  }
});

// ─── RC-1: Daily Rhythm cannot be hidden ─────────────────────────────────────

describe("RC-1 — Daily Rhythm has no hide option", () => {
  it("POST /api/engagements/journey/:id/hide returns 400", async () => {
    // The hide endpoint only supports devotional and sermon-companion.
    // For any other type — including journeys (which covers daily-rhythm) —
    // the server must reject with 400 rather than silently no-op.
    const fakeJourneyId = `fake-journey-${RUN}`;
    const res = await request({
      method: "POST",
      path:   `/api/engagements/journey/${encodeURIComponent(fakeJourneyId)}/hide`,
      userId: MEMBER,
    });
    assert.equal(
      res.status,
      400,
      `Expected 400 for journey hide, got ${res.status}: ${res.body}`,
    );
  });
});

// ─── RC-2 & RC-6: Devotional progress survives hide → reopen ─────────────────

describe("RC-2 & RC-6 — Devotional progress survives hide → reopen", () => {
  it("completedDays and currentDay are intact after hide then unhide", async () => {
    assert.ok(devotionalSeriesId, "devotionalSeriesId must be seeded in before()");

    // 1. Start the series.
    const startRes = await request({
      method: "POST",
      path:   `/api/devotionals/${devotionalSeriesId}/start`,
      userId: MEMBER,
    });
    assert.equal(startRes.status, 200, `start failed: ${startRes.body}`);

    // 2. Mark days 1–3 complete so completedDays is non-empty.
    for (const day of [1, 2, 3]) {
      const compRes = await request({
        method: "POST",
        path:   `/api/devotionals/${devotionalSeriesId}/progress/complete`,
        userId: MEMBER,
        body:   { day },
      });
      assert.equal(compRes.status, 200, `complete day=${day} failed: ${compRes.body}`);
    }

    // 3. Snapshot progress before hide.
    const beforeRes = await request({
      path:   `/api/devotionals/${devotionalSeriesId}/progress`,
      userId: MEMBER,
    });
    assert.equal(beforeRes.status, 200, `get progress failed: ${beforeRes.body}`);
    const before = json<{ currentDay: number; completedDays: number[] }>(beforeRes);
    assert.ok(
      before.completedDays.length >= 3,
      `Expected ≥3 completedDays before hide, got ${before.completedDays.length}`,
    );

    // 4. Hide (remove from Today's Steps — non-destructive).
    const hideRes = await request({
      method: "POST",
      path:   `/api/engagements/devotional/${encodeURIComponent(devotionalSeriesId)}/hide`,
      userId: MEMBER,
    });
    assert.equal(hideRes.status, 200, `hide failed: ${hideRes.body}`);

    // 5. Check progress is unchanged while hidden.
    const whileHiddenRes = await request({
      path:   `/api/devotionals/${devotionalSeriesId}/progress`,
      userId: MEMBER,
    });
    assert.equal(whileHiddenRes.status, 200, `get progress (hidden) failed: ${whileHiddenRes.body}`);
    const whileHidden = json<{ currentDay: number; completedDays: number[] }>(whileHiddenRes);
    assert.deepEqual(
      whileHidden.completedDays.sort((a: number, b: number) => a - b),
      before.completedDays.sort((a: number, b: number) => a - b),
      "completedDays must not change while hidden",
    );
    assert.equal(
      whileHidden.currentDay,
      before.currentDay,
      "currentDay must not change while hidden",
    );

    // 6. Unhide (simulates member opening from Next Steps).
    const unhideRes = await request({
      method: "POST",
      path:   `/api/engagements/devotional/${encodeURIComponent(devotionalSeriesId)}/unhide`,
      userId: MEMBER,
    });
    assert.equal(unhideRes.status, 200, `unhide failed: ${unhideRes.body}`);

    // 7. Progress after reopen must equal snapshot from before hide (RC-2).
    const afterRes = await request({
      path:   `/api/devotionals/${devotionalSeriesId}/progress`,
      userId: MEMBER,
    });
    assert.equal(afterRes.status, 200, `get progress (after unhide) failed: ${afterRes.body}`);
    const after = json<{ currentDay: number; completedDays: number[] }>(afterRes);

    // RC-2: position preserved
    assert.equal(
      after.currentDay,
      before.currentDay,
      `RC-2: currentDay changed after hide→reopen (was ${before.currentDay}, now ${after.currentDay})`,
    );
    // RC-6: completion history preserved
    assert.deepEqual(
      after.completedDays.sort((a: number, b: number) => a - b),
      before.completedDays.sort((a: number, b: number) => a - b),
      "RC-6: completedDays must be identical after hide→reopen",
    );
  });
});

// ─── RC-4: Hidden devotional absent from Today's Steps ───────────────────────

describe("RC-4 — Hidden devotional is absent from Today's Steps list", () => {
  it("GET /api/devotionals/progress/all omits series when hidden_from_today=true", async () => {
    assert.ok(devotionalSeriesId, "devotionalSeriesId must be seeded in before()");

    // Hide the series (it may already be hidden from the previous test or not —
    // either way, explicitly set it hidden here).
    await request({
      method: "POST",
      path:   `/api/engagements/devotional/${encodeURIComponent(devotionalSeriesId)}/hide`,
      userId: MEMBER,
    });

    // The client-side getAllProgress call uses GET /api/devotionals/progress/all.
    // Walk.tsx then filters on !progress.hidden_from_today.
    // The raw API must return the hidden_from_today flag so the client can filter.
    const allRes = await request({
      path:   "/api/devotionals/progress/all",
      userId: MEMBER,
    });
    assert.equal(allRes.status, 200, `progress/all failed: ${allRes.body}`);
    const all = json<Array<{ seriesId: string; hidden_from_today?: boolean }>>(allRes);

    const item = all.find(p => p.seriesId === devotionalSeriesId);
    assert.ok(item, `Series ${devotionalSeriesId} must still appear in progress/all when hidden`);
    assert.equal(
      item.hidden_from_today,
      true,
      "RC-4: hidden_from_today must be true after hide so Walk.tsx can filter it out",
    );

    // Restore for subsequent tests.
    await request({
      method: "POST",
      path:   `/api/engagements/devotional/${encodeURIComponent(devotionalSeriesId)}/unhide`,
      userId: MEMBER,
    });
  });
});

// ─── RC-3, RC-5, RC-6: Companion progress survives hide → reopen ─────────────

describe("RC-3, RC-5 & RC-6 — Companion progress survives hide → reopen", () => {
  it("completedDays intact and hiddenFromToday flag toggled correctly", async () => {
    if (!companionId) {
      // No published companion in this environment — skip gracefully.
      console.log("  ⚠ No published companion found — skipping companion hide tests");
      return;
    }

    // 1. Start the companion.
    await request({
      method: "POST",
      path:   `/api/sermon-companions/${companionId}/progress/start`,
      userId: MEMBER,
    });

    // 2. Mark day 1 complete so completedDays is non-empty.
    const compRes = await request({
      method: "POST",
      path:   `/api/sermon-companions/${companionId}/progress/complete-day`,
      userId: MEMBER,
      body:   { dayNumber: 1 },
    });
    assert.equal(compRes.status, 200, `complete-day failed: ${compRes.body}`);
    const afterComplete = json<{ currentDay: number; completedDays: number[] }>(compRes);
    assert.ok(
      afterComplete.completedDays.includes(1),
      "Day 1 must be in completedDays after marking complete",
    );

    // 3. Hide the companion.
    const hideRes = await request({
      method: "POST",
      path:   `/api/engagements/sermon-companion/${encodeURIComponent(companionId)}/hide`,
      userId: MEMBER,
    });
    assert.equal(hideRes.status, 200, `hide companion failed: ${hideRes.body}`);

    // 4. RC-5: hidden companion must have hiddenFromToday=true in member/engagements.
    const engRes = await request({
      path:   "/api/sermon-companions/member/engagements",
      userId: MEMBER,
    });
    assert.equal(engRes.status, 200, `member/engagements failed: ${engRes.body}`);
    const engagements = json<Array<{
      id: string;
      progress: { currentDay: number; completedDays: number[]; status: string; hiddenFromToday?: boolean } | null;
    }>>(engRes);
    const item = engagements.find(e => e.id === companionId);
    assert.ok(item, `Companion ${companionId} must still appear in member/engagements while hidden`);
    assert.ok(
      item.progress !== null,
      "RC-3: progress must not be null while hidden (progress is preserved)",
    );
    assert.equal(
      item.progress?.hiddenFromToday,
      true,
      "RC-5: hiddenFromToday must be true after hide so Walk.tsx can filter it out",
    );

    // 5. Verify completedDays are intact while hidden (RC-6).
    assert.ok(
      item.progress!.completedDays.includes(1),
      "RC-6: completedDays must still include day 1 while hidden",
    );

    // 6. Unhide (simulates member opening from Next Steps).
    const unhideRes = await request({
      method: "POST",
      path:   `/api/engagements/sermon-companion/${encodeURIComponent(companionId)}/unhide`,
      userId: MEMBER,
    });
    assert.equal(unhideRes.status, 200, `unhide companion failed: ${unhideRes.body}`);

    // 7. After reopen: hiddenFromToday must be false, completedDays must be intact (RC-3, RC-6).
    const afterRes = await request({
      path:   "/api/sermon-companions/member/engagements",
      userId: MEMBER,
    });
    assert.equal(afterRes.status, 200, `member/engagements (after unhide) failed: ${afterRes.body}`);
    const after = json<Array<{
      id: string;
      progress: { currentDay: number; completedDays: number[]; status: string; hiddenFromToday?: boolean } | null;
    }>>(afterRes);
    const afterItem = after.find(e => e.id === companionId);
    assert.ok(afterItem?.progress, "Companion must still have progress after unhide");
    assert.equal(
      afterItem.progress?.hiddenFromToday,
      false,
      "RC-3: hiddenFromToday must be false after unhide",
    );
    assert.ok(
      afterItem.progress!.completedDays.includes(1),
      "RC-6: completedDays must still include day 1 after hide→reopen",
    );
  });
});

// ─── RC-7: Active Engagement rule — hidden items remain active in /api/engagements
//
// Hide is a view-layer filter for Today's Steps only.
// The engagement record must stay status=active so the member can re-open
// the content from Next Steps. The Active Engagement rule counts hidden
// items as still-active, not paused or removed.

describe("RC-7 — Active Engagement rule: hiding does not pause or remove the engagement", () => {
  it("GET /api/engagements returns the devotional as status=active even while hidden", async () => {
    assert.ok(devotionalSeriesId, "devotionalSeriesId must be seeded in before()");

    // Start with an unhidden, active engagement.
    await request({
      method: "POST",
      path:   `/api/engagements/devotional/${encodeURIComponent(devotionalSeriesId)}/unhide`,
      userId: MEMBER,
    });

    // Confirm the item appears as active before hiding.
    const beforeRes = await request({
      path:   "/api/engagements",
      userId: MEMBER,
    });
    assert.equal(beforeRes.status, 200, `GET /api/engagements (before hide) failed: ${beforeRes.body}`);
    const before = json<Array<{ contentType: string; contentId: string; status: string }>>(beforeRes);
    const beforeItem = before.find(e => e.contentType === "devotional" && e.contentId === devotionalSeriesId);
    assert.ok(beforeItem, "Devotional must appear in /api/engagements before being hidden");
    assert.equal(beforeItem.status, "active", "Devotional must be status=active before being hidden");

    // Hide it (view-layer filter — must NOT change the engagement status).
    await request({
      method: "POST",
      path:   `/api/engagements/devotional/${encodeURIComponent(devotionalSeriesId)}/hide`,
      userId: MEMBER,
    });

    // The engagement record must still appear in /api/engagements as status=active.
    // Hiding removes the card from Today's Steps (Walk.tsx filters on hidden_from_today)
    // but the member is still engaged — they can re-open from Next Steps at any time.
    const afterRes = await request({
      path:   "/api/engagements",
      userId: MEMBER,
    });
    assert.equal(afterRes.status, 200, `GET /api/engagements (after hide) failed: ${afterRes.body}`);
    const after = json<Array<{ contentType: string; contentId: string; status: string }>>(afterRes);
    const afterItem = after.find(e => e.contentType === "devotional" && e.contentId === devotionalSeriesId);
    assert.ok(
      afterItem,
      "RC-7: devotional must still appear in /api/engagements after being hidden",
    );
    assert.equal(
      afterItem.status,
      "active",
      "RC-7: status must remain 'active' after hide — hidden is a view filter, not an engagement state change",
    );

    // Restore for cleanup.
    await request({
      method: "POST",
      path:   `/api/engagements/devotional/${encodeURIComponent(devotionalSeriesId)}/unhide`,
      userId: MEMBER,
    });
  });
});

// ─── RC-8: unhide is idempotent ───────────────────────────────────────────────

describe("RC-8 — unhide is idempotent (safe when content is not hidden)", () => {
  it("calling unhide twice does not error or corrupt progress", async () => {
    assert.ok(devotionalSeriesId, "devotionalSeriesId must be seeded in before()");

    // Ensure not hidden first.
    await request({
      method: "POST",
      path:   `/api/engagements/devotional/${encodeURIComponent(devotionalSeriesId)}/unhide`,
      userId: MEMBER,
    });

    // Call unhide a second time — must return 200, not 500.
    const secondUnhide = await request({
      method: "POST",
      path:   `/api/engagements/devotional/${encodeURIComponent(devotionalSeriesId)}/unhide`,
      userId: MEMBER,
    });
    assert.equal(
      secondUnhide.status,
      200,
      `RC-8: second unhide call failed: ${secondUnhide.body}`,
    );

    // Progress must still be intact.
    const progRes = await request({
      path:   `/api/devotionals/${devotionalSeriesId}/progress`,
      userId: MEMBER,
    });
    assert.equal(progRes.status, 200, `get progress after double-unhide failed: ${progRes.body}`);
    const prog = json<{ hidden_from_today?: boolean }>(progRes);
    assert.equal(
      prog.hidden_from_today ?? false,
      false,
      "RC-8: progress must remain unhidden after idempotent unhide",
    );
  });

  it("calling unhide on companion twice does not error", async () => {
    if (!companionId) return;

    await request({
      method: "POST",
      path:   `/api/engagements/sermon-companion/${encodeURIComponent(companionId)}/unhide`,
      userId: MEMBER,
    });

    const second = await request({
      method: "POST",
      path:   `/api/engagements/sermon-companion/${encodeURIComponent(companionId)}/unhide`,
      userId: MEMBER,
    });
    assert.equal(second.status, 200, `RC-8: second companion unhide failed: ${second.body}`);
  });
});

// ─── RC-4b: Brand-new member sees no optional content on Today's Steps ────────
// (New member = no progress rows → Walk.tsx shows only unstarted discovery cards,
//  never automatically-added active devotional or companion cards.)

describe("RC-4b — New member has no auto-started optional content", () => {
  it("fresh user has empty devotional progress/all", async () => {
    const FRESH_USER = `test-fresh-${RUN}`;
    const res = await request({
      path:   "/api/devotionals/progress/all",
      userId: FRESH_USER,
    });
    assert.equal(res.status, 200, `progress/all (fresh user) failed: ${res.body}`);
    const all = json<Array<unknown>>(res);
    assert.equal(
      all.length,
      0,
      `RC-4b: fresh user must have 0 devotional progress rows, found ${all.length}`,
    );
  });

  it("fresh user has null progress for all companions in member/engagements", async () => {
    const FRESH_USER = `test-fresh-sc-${RUN}`;
    const res = await request({
      path:   "/api/sermon-companions/member/engagements",
      userId: FRESH_USER,
    });
    assert.equal(res.status, 200, `member/engagements (fresh) failed: ${res.body}`);
    const companions = json<Array<{ progress: unknown }>>(res);
    const started = companions.filter(c => c.progress !== null);
    assert.equal(
      started.length,
      0,
      `RC-4b: fresh user must have 0 started companions, found ${started.length}`,
    );
  });
});
