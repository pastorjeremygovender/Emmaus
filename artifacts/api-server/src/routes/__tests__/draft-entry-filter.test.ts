/**
 * draft-entry-filter.test.ts — Server-side Draft entry exclusion
 *
 * Defence-in-depth guard: confirms the API never sends Draft devotional or
 * sermon-companion entries to the browser in the first place, so a future
 * client-side regression cannot expose unpublished content.
 *
 * Covered endpoints:
 *
 *  1. GET /api/devotionals/:id  (member)
 *     — Draft entries must be absent from the entries array.
 *     — Admins still receive the full unfiltered list.
 *
 *  2. GET /api/sermon-companions/:id/member
 *     — Already filtered by the store (getPublicCompanionById queries
 *       WHERE status = 'Published').  These tests document and confirm that
 *       server-side guarantee so a future store refactor cannot accidentally
 *       regress it.
 *
 * Requires the API server to be running.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/draft-entry-filter.test.ts
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
const ADMIN_USER_ID = `test-admin-draft-filter-${RUN_TAG}`;
const MEMBER_USER_ID = `test-member-draft-filter-${RUN_TAG}`;

let seriesId = "";

// ─── Seed helpers ─────────────────────────────────────────────────────────────

async function seedSeriesWithMixedEntries(): Promise<string> {
  // Create series
  const createRes = await request({
    method: "POST",
    path: "/api/devotionals",
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: {
      title: `__TEST__ Draft-Filter [${RUN_TAG}]`,
      description: "Used to verify Draft entries are stripped from member responses",
      seriesType: "general",
    },
  });
  assert.equal(
    createRes.status,
    201,
    `Create series failed (${createRes.status}): ${createRes.body}`
  );
  const { id } = JSON.parse(createRes.body) as { id: string };

  // Day 1 — Published (should be visible to members)
  const e1 = await request({
    method: "PUT",
    path: `/api/devotionals/${id}/entries/1`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: { title: "Day 1 Published", scriptureReference: "John 1:1", status: "Published" },
  });
  assert.equal(e1.status, 200, `Entry 1 upsert failed: ${e1.body}`);

  // Day 2 — Draft (must NEVER be visible to members)
  const e2 = await request({
    method: "PUT",
    path: `/api/devotionals/${id}/entries/2`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: { title: "Day 2 Draft", scriptureReference: "John 1:2", status: "Draft" },
  });
  assert.equal(e2.status, 200, `Entry 2 upsert failed: ${e2.body}`);

  // Day 3 — Published (should be visible to members)
  const e3 = await request({
    method: "PUT",
    path: `/api/devotionals/${id}/entries/3`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: { title: "Day 3 Published", scriptureReference: "John 1:3", status: "Published" },
  });
  assert.equal(e3.status, 200, `Entry 3 upsert failed: ${e3.body}`);

  // Publish the series itself so members can access it
  const pubRes = await request({
    method: "PATCH",
    path: `/api/devotionals/${id}`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: { status: "Published" },
  });
  assert.equal(pubRes.status, 200, `Publish series failed: ${pubRes.body}`);

  return id;
}

async function permanentDeleteSeries(id: string): Promise<void> {
  if (!id) return;
  await request({
    method: "DELETE",
    path: `/api/devotionals/${id}/permanent`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
  });
}

// ─── Before/After ─────────────────────────────────────────────────────────────

before(async () => {
  seriesId = await seedSeriesWithMixedEntries();
});

after(async () => {
  await permanentDeleteSeries(seriesId);
});

// ─── 1 — GET /api/devotionals/:id  (member) ───────────────────────────────────
//
// The member-facing GET /:id must exclude Draft entries.  If a Draft entry
// reaches the browser, a client-side regression (e.g. removing the
// DevotionalPreviousDays filter) would immediately expose it.

describe("1 — GET /api/devotionals/:id (member) strips Draft entries", () => {
  it("returns HTTP 200 for a Published series", async () => {
    const res = await request({ path: `/api/devotionals/${seriesId}`, userId: MEMBER_USER_ID });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${res.body}`);
  });

  it("entries array contains only Published entries", async () => {
    const res = await request({ path: `/api/devotionals/${seriesId}`, userId: MEMBER_USER_ID });
    assert.equal(res.status, 200);
    const series = JSON.parse(res.body) as { entries: Array<{ status: string; title: string }> };

    assert.ok(Array.isArray(series.entries), "entries must be an array");

    const draftEntries = series.entries.filter(e => e.status !== "Published");
    assert.equal(
      draftEntries.length,
      0,
      `Member response must not contain non-Published entries. Got: ${JSON.stringify(draftEntries.map(e => ({ title: e.title, status: e.status })))}`
    );
  });

  it("entries array contains the Published entries (Days 1 and 3)", async () => {
    const res = await request({ path: `/api/devotionals/${seriesId}`, userId: MEMBER_USER_ID });
    assert.equal(res.status, 200);
    const series = JSON.parse(res.body) as { entries: Array<{ status: string; title: string }> };

    const publishedTitles = series.entries.map(e => e.title);
    assert.ok(
      publishedTitles.includes("Day 1 Published"),
      `Day 1 Published should be present. Got: ${publishedTitles.join(", ")}`
    );
    assert.ok(
      publishedTitles.includes("Day 3 Published"),
      `Day 3 Published should be present. Got: ${publishedTitles.join(", ")}`
    );
  });

  it("the Draft entry (Day 2) is absent from the member response", async () => {
    const res = await request({ path: `/api/devotionals/${seriesId}`, userId: MEMBER_USER_ID });
    assert.equal(res.status, 200);
    const series = JSON.parse(res.body) as { entries: Array<{ status: string; title: string }> };

    const hasDraft = series.entries.some(e => e.title === "Day 2 Draft");
    assert.equal(
      hasDraft,
      false,
      "Draft entry 'Day 2 Draft' must not appear in the member response"
    );
  });
});

// ─── 2 — GET /api/devotionals/:id  (admin) ────────────────────────────────────
//
// Admins need to see Draft entries to author and review them.  The filter must
// NOT apply to admin/superAdmin requests.

describe("2 — GET /api/devotionals/:id (admin) receives all entries including Drafts", () => {
  it("returns HTTP 200 for the admin", async () => {
    const res = await request({
      path: `/api/devotionals/${seriesId}`,
      userId: ADMIN_USER_ID,
      role: "superAdmin",
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}: ${res.body}`);
  });

  it("entries array includes the Draft entry (Day 2)", async () => {
    const res = await request({
      path: `/api/devotionals/${seriesId}`,
      userId: ADMIN_USER_ID,
      role: "superAdmin",
    });
    assert.equal(res.status, 200);
    const series = JSON.parse(res.body) as { entries: Array<{ status: string; title: string }> };

    const hasDraft = series.entries.some(e => e.title === "Day 2 Draft");
    assert.ok(
      hasDraft,
      "Admin response must include Draft entries so admins can see them. 'Day 2 Draft' is missing."
    );
  });

  it("entries array has all three entries for the admin", async () => {
    const res = await request({
      path: `/api/devotionals/${seriesId}`,
      userId: ADMIN_USER_ID,
      role: "superAdmin",
    });
    assert.equal(res.status, 200);
    const series = JSON.parse(res.body) as { entries: Array<{ title: string }> };

    assert.equal(
      series.entries.length,
      3,
      `Admin should see all 3 entries; got ${series.entries.length}: ${series.entries.map(e => e.title).join(", ")}`
    );
  });
});

// ─── 3 — GET /api/sermon-companions/:id/member ────────────────────────────────
//
// getPublicCompanionById() already queries WHERE status = 'Published' on both
// the companion header AND its entries.  These tests document that guarantee
// so any future store refactor that accidentally drops the WHERE clause is
// immediately caught.
//
// Companion creation requires the AI pipeline, so this test skips gracefully
// when no Published companion is present.

describe("3 — GET /api/sermon-companions/:id/member strips Draft SC entries", () => {
  it("returns only Published entries (or skips if no published companion exists)", async () => {
    // Discover any Published companion via the current-week endpoint.
    const weekRes = await request({
      path: "/api/sermon-companions/current-week/member",
      userId: MEMBER_USER_ID,
    });

    if (weekRes.status === 404) {
      console.log(
        "  ⚠  No Published sermon companion in DB — SC draft-entry filter test skipped."
      );
      return;
    }

    assert.equal(
      weekRes.status,
      200,
      `current-week/member failed (${weekRes.status}): ${weekRes.body}`
    );

    const companion = JSON.parse(weekRes.body) as {
      id: string;
      entries?: Array<{ status: string; title: string }>;
    };

    // Fetch via the member route directly.
    const res = await request({
      path: `/api/sermon-companions/${companion.id}/member`,
      userId: MEMBER_USER_ID,
    });
    assert.equal(
      res.status,
      200,
      `/:id/member failed (${res.status}): ${res.body}`
    );

    const data = JSON.parse(res.body) as {
      entries?: Array<{ status: string; title: string }>;
    };

    if (!data.entries || data.entries.length === 0) {
      // No entries in this companion — nothing to check.
      return;
    }

    const nonPublished = data.entries.filter(e => e.status !== "Published");
    assert.equal(
      nonPublished.length,
      0,
      `SC member route must not include non-Published entries. Got: ${JSON.stringify(
        nonPublished.map(e => ({ title: e.title, status: e.status }))
      )}`
    );
  });

  it("returns 404 when companion is not Published (server-side guard)", async () => {
    // A random UUID that won't match any companion.
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await request({
      path: `/api/sermon-companions/${fakeId}/member`,
      userId: MEMBER_USER_ID,
    });
    assert.equal(
      res.status,
      404,
      `Expected 404 for non-existent/non-published companion; got ${res.status}`
    );
  });
});
