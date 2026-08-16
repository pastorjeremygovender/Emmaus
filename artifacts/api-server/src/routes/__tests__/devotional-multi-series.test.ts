/**
 * devotional-multi-series.test.ts — Session-reload regression tests
 *
 * Guards against two classes of silent regression:
 *
 *  1. Multi-series filter — when a member has progress in two devotional series,
 *     both must appear in GET /api/devotionals/progress/all (which Walk.tsx calls
 *     inside reloadDevotionals). A regression here silently drops cards on reload.
 *
 *  2. Companion pause filter — GET /api/sermon-companions/member/engagements must
 *     return null progress for paused companions so Walk.tsx's
 *     `.filter(c => c.progress !== null)` hides them. A regression here causes
 *     paused cards to resurface every time the page loads.
 *
 *  3. Pause isolation — pausing one devotional must not affect the other series'
 *     appearance in the progress list.
 *
 * Requires the API server to be running.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/devotional-multi-series.test.ts
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

// ─── Test fixtures ────────────────────────────────────────────────────────────

const RUN_TAG = Date.now();
const ADMIN_USER_ID = "demo-superadmin-1";
const MEMBER_USER_ID = `test-member-mseries-${RUN_TAG}`;

let seriesAId = "";
let seriesBId = "";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function createAndPublishSeries(label: string): Promise<string> {
  const createRes = await request({
    method: "POST",
    path: "/api/devotionals",
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: {
      title: `__TEST__ Multi-Series ${label} [${RUN_TAG}]`,
      description: `Test series ${label} for multi-series regression guard`,
      seriesType: "general",
    },
  });
  assert.equal(
    createRes.status,
    201,
    `Create series ${label} failed (${createRes.status}): ${createRes.body}`
  );
  const { id } = JSON.parse(createRes.body) as { id: string };

  // Add one published entry so the series has content.
  const entryRes = await request({
    method: "PUT",
    path: `/api/devotionals/${id}/entries/1`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: { title: `${label} Day 1`, scriptureReference: "John 1:1", status: "Published" },
  });
  assert.equal(entryRes.status, 200, `Entry upsert for ${label} failed: ${entryRes.body}`);

  const publishRes = await request({
    method: "PATCH",
    path: `/api/devotionals/${id}`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: { status: "Published" },
  });
  assert.equal(publishRes.status, 200, `Publish ${label} failed: ${publishRes.body}`);

  return id;
}

async function startSeries(seriesId: string, userId: string): Promise<void> {
  const res = await request({
    method: "POST",
    path: `/api/devotionals/${seriesId}/start`,
    userId,
  });
  assert.equal(res.status, 200, `Start series ${seriesId} failed (${res.status}): ${res.body}`);
}

async function pauseSeries(seriesId: string, userId: string): Promise<void> {
  const res = await request({
    method: "POST",
    path: `/api/engagements/devotional/${encodeURIComponent(seriesId)}/pause`,
    userId,
  });
  assert.equal(res.status, 200, `Pause series ${seriesId} failed (${res.status}): ${res.body}`);
}

async function deleteSeries(seriesId: string): Promise<void> {
  if (!seriesId) return;
  await request({
    method: "DELETE",
    path: `/api/devotionals/${seriesId}/permanent`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
  });
}

// ─── Before: seed two published series and start both ────────────────────────

before(async () => {
  [seriesAId, seriesBId] = await Promise.all([
    createAndPublishSeries("Alpha"),
    createAndPublishSeries("Beta"),
  ]);

  // Start both series as the same member.
  await Promise.all([
    startSeries(seriesAId, MEMBER_USER_ID),
    startSeries(seriesBId, MEMBER_USER_ID),
  ]);
});

// ─── After: clean up test series ─────────────────────────────────────────────

after(async () => {
  await Promise.all([deleteSeries(seriesAId), deleteSeries(seriesBId)]);
});

// ─── Test 1 — Multi-series: both appear in progress/all ──────────────────────
//
// Walk.tsx reloadDevotionals calls GET /api/devotionals/progress/all, then
// filters `withProg.filter(x => x.progress !== null)` to build activeDevotionals.
// A regression in the endpoint (e.g. only returning the first row) would silently
// drop one card on every page reload or session start.

describe("1 — Multi-series: both started series appear in progress/all", () => {
  it("returns a progress record for series A", async () => {
    const res = await request({
      path: "/api/devotionals/progress/all",
      userId: MEMBER_USER_ID,
    });
    assert.equal(res.status, 200, `progress/all failed: ${res.body}`);
    const list = JSON.parse(res.body) as Array<{ seriesId: string }>;
    const found = list.find(p => p.seriesId === seriesAId);
    assert.ok(found, `Progress record for series A (${seriesAId}) missing from progress/all`);
  });

  it("returns a progress record for series B", async () => {
    const res = await request({
      path: "/api/devotionals/progress/all",
      userId: MEMBER_USER_ID,
    });
    assert.equal(res.status, 200, `progress/all failed: ${res.body}`);
    const list = JSON.parse(res.body) as Array<{ seriesId: string }>;
    const found = list.find(p => p.seriesId === seriesBId);
    assert.ok(found, `Progress record for series B (${seriesBId}) missing from progress/all`);
  });

  it("returns progress records for BOTH series in a single response (not just the first)", async () => {
    const res = await request({
      path: "/api/devotionals/progress/all",
      userId: MEMBER_USER_ID,
    });
    assert.equal(res.status, 200, `progress/all failed: ${res.body}`);
    const list = JSON.parse(res.body) as Array<{ seriesId: string }>;

    const hasA = list.some(p => p.seriesId === seriesAId);
    const hasB = list.some(p => p.seriesId === seriesBId);
    assert.ok(hasA && hasB, `Expected both series in progress/all. Got: ${list.map(p => p.seriesId).join(", ")}`);
  });
});

// ─── Test 2 — Pause isolation: pausing one series doesn't affect the other ───
//
// Walk.tsx's reloadDevotionals shows ALL started series. Pausing series A must
// not affect series B's visibility. A regression here would silently drop the
// un-paused card after the member pauses a different one.

describe("2 — Pause isolation: pausing series A does not remove series B from progress/all", () => {
  it("series B still has a progress record after series A is paused", async () => {
    // Pause series A.
    await pauseSeries(seriesAId, MEMBER_USER_ID);

    const res = await request({
      path: "/api/devotionals/progress/all",
      userId: MEMBER_USER_ID,
    });
    assert.equal(res.status, 200, `progress/all failed: ${res.body}`);
    const list = JSON.parse(res.body) as Array<{ seriesId: string }>;

    const bRecord = list.find(p => p.seriesId === seriesBId);
    assert.ok(bRecord, `Series B progress vanished after series A was paused`);
  });

  it("series B progress record has status 'active' after series A is paused", async () => {
    const res = await request({
      path: "/api/devotionals/progress/all",
      userId: MEMBER_USER_ID,
    });
    assert.equal(res.status, 200, `progress/all failed: ${res.body}`);
    const list = JSON.parse(res.body) as Array<{ seriesId: string; status?: string }>;

    const bRecord = list.find(p => p.seriesId === seriesBId);
    assert.ok(bRecord, "Series B progress record not found");

    // status field is present in the progress row; verify it's still active.
    if (bRecord.status !== undefined) {
      assert.equal(
        bRecord.status,
        "active",
        `Series B status should be 'active' but got '${bRecord.status}'`
      );
    }
  });
});

// ─── Test 3 — /member/engagements: paused companion → progress is null ────────
//
// GET /api/sermon-companions/member/engagements must return `progress: null` for
// paused companions. Walk.tsx filters `.filter(c => c.progress !== null)` so a
// null progress is the contract that hides the card after a session break.
//
// Companion creation requires the AI pipeline, so this test skips gracefully
// when no published companion exists in the DB.

describe("3 — /member/engagements: paused companion has null progress", () => {
  it("paused companion's progress is null in /member/engagements response", async () => {
    // Step 1: discover any published companion.
    const companionRes = await request({
      path: "/api/sermon-companions/current-week/member",
      userId: ADMIN_USER_ID,
    });

    if (companionRes.status === 404) {
      console.log("  ⚠  No published sermon companion in DB — companion pause test skipped.");
      return;
    }

    assert.equal(
      companionRes.status,
      200,
      `current-week/member failed (${companionRes.status}): ${companionRes.body}`
    );
    const companion = JSON.parse(companionRes.body) as { id: string; title: string };

    const COMPANION_USER = `test-companion-pause-${RUN_TAG}`;

    // Step 2: start the companion.
    const startRes = await request({
      method: "POST",
      path: `/api/sermon-companions/${companion.id}/progress/start`,
      userId: COMPANION_USER,
    });
    assert.equal(
      startRes.status,
      200,
      `Start companion failed (${startRes.status}): ${startRes.body}`
    );

    // Step 3: pause the companion.
    const pauseRes = await request({
      method: "POST",
      path: `/api/engagements/sermon-companion/${encodeURIComponent(companion.id)}/pause`,
      userId: COMPANION_USER,
    });
    assert.equal(
      pauseRes.status,
      200,
      `Pause companion failed (${pauseRes.status}): ${pauseRes.body}`
    );

    // Step 4: fetch /member/engagements — the paused companion's progress must be null.
    const engagementsRes = await request({
      path: "/api/sermon-companions/member/engagements",
      userId: COMPANION_USER,
    });
    assert.equal(
      engagementsRes.status,
      200,
      `member/engagements failed (${engagementsRes.status}): ${engagementsRes.body}`
    );

    const engagements = JSON.parse(engagementsRes.body) as Array<{
      id: string;
      progress: { currentDay: number; completedDays: number[]; status: string } | null;
    }>;

    const item = engagements.find(e => e.id === companion.id);
    assert.ok(item, `Companion ${companion.id} not present in /member/engagements response`);
    assert.equal(
      item.progress,
      null,
      `Paused companion must have null progress in /member/engagements; ` +
        `got: ${JSON.stringify(item.progress)}`
    );

    // Cleanup: resume so subsequent runs start clean.
    await request({
      method: "POST",
      path: `/api/engagements/sermon-companion/${encodeURIComponent(companion.id)}/resume`,
      userId: COMPANION_USER,
    });
  });

  it("active companion alongside a paused one still has non-null progress", async () => {
    // Discover two published companions. If fewer than two exist, skip.
    const engagementsRes = await request({
      path: "/api/sermon-companions/member/engagements",
      userId: `test-anon-multi-${RUN_TAG}`,
    });
    assert.equal(engagementsRes.status, 200, `member/engagements failed: ${engagementsRes.body}`);

    const allCompanions = JSON.parse(engagementsRes.body) as Array<{ id: string }>;
    if (allCompanions.length < 2) {
      console.log("  ⚠  Fewer than 2 published companions in DB — multi-companion pause isolation test skipped.");
      return;
    }

    const [compA, compB] = allCompanions.slice(0, 2);
    const MULTI_USER = `test-companion-multi-pause-${RUN_TAG}`;

    // Start both companions.
    await Promise.all([
      request({ method: "POST", path: `/api/sermon-companions/${compA.id}/progress/start`, userId: MULTI_USER }),
      request({ method: "POST", path: `/api/sermon-companions/${compB.id}/progress/start`, userId: MULTI_USER }),
    ]);

    // Pause companion A only.
    await request({
      method: "POST",
      path: `/api/engagements/sermon-companion/${encodeURIComponent(compA.id)}/pause`,
      userId: MULTI_USER,
    });

    // Fetch engagements — companion B must still have non-null progress.
    const afterRes = await request({
      path: "/api/sermon-companions/member/engagements",
      userId: MULTI_USER,
    });
    assert.equal(afterRes.status, 200, `member/engagements (after pause) failed: ${afterRes.body}`);

    const after = JSON.parse(afterRes.body) as Array<{
      id: string;
      progress: { currentDay: number; completedDays: number[]; status: string } | null;
    }>;

    const itemA = after.find(e => e.id === compA.id);
    const itemB = after.find(e => e.id === compB.id);

    assert.ok(itemA, `Companion A not in response after pause`);
    assert.equal(itemA.progress, null, `Paused companion A must have null progress`);

    assert.ok(itemB, `Companion B disappeared from /member/engagements after companion A was paused`);
    assert.notEqual(
      itemB.progress,
      null,
      `Active companion B must have non-null progress alongside a paused companion A`
    );

    // Cleanup.
    await Promise.all([
      request({ method: "POST", path: `/api/engagements/sermon-companion/${encodeURIComponent(compA.id)}/resume`, userId: MULTI_USER }),
      request({ method: "POST", path: `/api/engagements/sermon-companion/${encodeURIComponent(compB.id)}/remove`, userId: MULTI_USER }),
    ]);
  });
});
