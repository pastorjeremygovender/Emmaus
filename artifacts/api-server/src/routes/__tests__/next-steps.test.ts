/**
 * Next Steps — Progress Description Integration Tests
 *
 * Guards against the "progress divergence" regression: buildDevotionalItem and
 * buildCompanionItem must always return a progress-aware description
 * ("Day N of M · Title") rather than reverting to the generic s.description.
 *
 * What it tests:
 *   A. Devotional item description is progress-aware (not the series description)
 *   B. Devotional item description matches "Day N of M" pattern after marking day 1 complete
 *   C. Devotional item in not-started state shows "Day 1 of N"
 *   D. Companion items (when present) do not carry a raw generic description string
 *
 * Requires the API server to be running.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/next-steps.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const url = new URL(BASE_URL);
const isHttps = url.protocol === "https:";
const transport = isHttps ? https : http;

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

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
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
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

// Stable unique IDs scoped to this test run — avoids collision with real data.
const RUN_TAG = Date.now();
const ADMIN_USER_ID = `test-admin-${RUN_TAG}`;
const MEMBER_USER_ID = `test-member-${RUN_TAG}`;
// Deliberately verbose generic description — the test asserts this string never
// appears as the item's description when the member has progress.
const GENERIC_SERIES_DESCRIPTION = `Generic series description that must never surface as the card text [run=${RUN_TAG}]`;

const ENTRY_TITLES = [
  "Faith Foundation",
  "The First Place You Turn",
  "Roots of Trust",
  "Daily Bread",
  "A Heart at Peace",
  "Walking in Light",
  "Finishing Strong",
];

// Sparse series — published entries at days 1 and 3 (no day 2).
// Used to confirm the cap formula uses Math.max(dayNumber) not entries.length.
const SPARSE_MEMBER_USER_ID = `test-member-sparse-${RUN_TAG}`;
const SPARSE_ENTRY_TITLES = ["Sparse Foundation", "Sparse Conclusion"];
let testSeriesId = "";
let sparseSeriesId = "";

// ─── Before: seed test data ───────────────────────────────────────────────────

before(async () => {
  // 1. Create the devotional series (admin).
  const createRes = await request({
    method: "POST",
    path: "/api/devotionals",
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: {
      title: `__TEST__ Progress Divergence Guard [${RUN_TAG}]`,
      description: GENERIC_SERIES_DESCRIPTION,
      seriesType: "general",
    },
  });
  assert.equal(
    createRes.status,
    201,
    `Create series failed (${createRes.status}): ${createRes.body}`
  );
  const created = JSON.parse(createRes.body) as { id: string };
  testSeriesId = created.id;

  // 2. Upsert all 7 entries as Published so the entry count and titles are known.
  for (let day = 1; day <= ENTRY_TITLES.length; day++) {
    const entryRes = await request({
      method: "PUT",
      path: `/api/devotionals/${testSeriesId}/entries/${day}`,
      userId: ADMIN_USER_ID,
      role: "superAdmin",
      body: {
        title: ENTRY_TITLES[day - 1],
        scriptureReference: `John ${day}:1`,
        status: "Published",
      },
    });
    assert.equal(
      entryRes.status,
      200,
      `Upsert entry day ${day} failed (${entryRes.status}): ${entryRes.body}`
    );
  }

  // 3. Publish the series itself.
  const publishRes = await request({
    method: "PATCH",
    path: `/api/devotionals/${testSeriesId}`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: { status: "Published" },
  });
  assert.equal(
    publishRes.status,
    200,
    `Publish series failed (${publishRes.status}): ${publishRes.body}`
  );

  // 4. Start the series as the member user.
  const startRes = await request({
    method: "POST",
    path: `/api/devotionals/${testSeriesId}/start`,
    userId: MEMBER_USER_ID,
  });
  assert.equal(
    startRes.status,
    200,
    `Start series failed (${startRes.status}): ${startRes.body}`
  );

  // 5. Mark day 1 as complete so the member is now in-progress on day 2.
  const completeRes = await request({
    method: "POST",
    path: `/api/devotionals/${testSeriesId}/progress/complete`,
    userId: MEMBER_USER_ID,
    body: { day: 1 },
  });
  assert.equal(
    completeRes.status,
    200,
    `Mark day 1 complete failed (${completeRes.status}): ${completeRes.body}`
  );

  // ── Sparse series fixture (non-contiguous days) ──────────────────────────
  // Published entries at days 1 and 3 — day 2 is absent.
  // count=2, maxPublishedDay=3.
  // A member who completes day 3 first has completedDays=[3].
  // Correct cap (maxPublishedDay=3): min(4, 3) = 3  → routes to published day 3.
  // Wrong cap  (count=2):           min(4, 2) = 2  → routes to missing day 2.

  const sparseCreateRes = await request({
    method: "POST",
    path: "/api/devotionals",
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: {
      title: `__TEST__ Sparse Days Guard [${RUN_TAG}]`,
      description: "Sparse series description that must not appear",
      seriesType: "general",
    },
  });
  assert.equal(sparseCreateRes.status, 201, `Create sparse series failed: ${sparseCreateRes.body}`);
  sparseSeriesId = (JSON.parse(sparseCreateRes.body) as { id: string }).id;

  // Day 1 published.
  const s1 = await request({
    method: "PUT",
    path: `/api/devotionals/${sparseSeriesId}/entries/1`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: { title: SPARSE_ENTRY_TITLES[0], scriptureReference: "John 1:1", status: "Published" },
  });
  assert.equal(s1.status, 200, `Sparse entry day 1 failed: ${s1.body}`);

  // Day 3 published — day 2 deliberately absent.
  const s3 = await request({
    method: "PUT",
    path: `/api/devotionals/${sparseSeriesId}/entries/3`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: { title: SPARSE_ENTRY_TITLES[1], scriptureReference: "John 3:1", status: "Published" },
  });
  assert.equal(s3.status, 200, `Sparse entry day 3 failed: ${s3.body}`);

  // Publish the series.
  const sparsePub = await request({
    method: "PATCH",
    path: `/api/devotionals/${sparseSeriesId}`,
    userId: ADMIN_USER_ID,
    role: "superAdmin",
    body: { status: "Published" },
  });
  assert.equal(sparsePub.status, 200, `Publish sparse series failed: ${sparsePub.body}`);

  // Member starts the sparse series, then completes day 3 (the highest published day)
  // WITHOUT completing day 1 first — exercises the count-vs-maxDay cap divergence.
  await request({
    method: "POST",
    path: `/api/devotionals/${sparseSeriesId}/start`,
    userId: SPARSE_MEMBER_USER_ID,
  });
  const sparseComplete = await request({
    method: "POST",
    path: `/api/devotionals/${sparseSeriesId}/progress/complete`,
    userId: SPARSE_MEMBER_USER_ID,
    body: { day: 3 },
  });
  assert.equal(sparseComplete.status, 200, `Sparse complete day 3 failed: ${sparseComplete.body}`);
});

// ─── After: permanent-delete the test series ─────────────────────────────────

after(async () => {
  await Promise.all([
    testSeriesId
      ? request({
          method: "DELETE",
          path: `/api/devotionals/${testSeriesId}/permanent`,
          userId: ADMIN_USER_ID,
          role: "superAdmin",
        })
      : Promise.resolve(),
    sparseSeriesId
      ? request({
          method: "DELETE",
          path: `/api/devotionals/${sparseSeriesId}/permanent`,
          userId: ADMIN_USER_ID,
          role: "superAdmin",
        })
      : Promise.resolve(),
  ]);
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

type NextStepsItem = {
  id: string;
  contentType: string;
  title: string;
  description?: string;
  memberProgressState: string;
  metadata: {
    durationDays?: number;
    currentDay?: number;
    publishedAt?: string;
  };
  route: string;
  primaryActionLabel: string | null;
};

type NextStepsResponse = {
  dailyDevotionals: NextStepsItem[];
  journeyCollections: { journeys: NextStepsItem[] }[];
  standaloneJourneys: NextStepsItem[];
  currentSermonCompanion: NextStepsItem | null;
  previousSermonCompanions: NextStepsItem[];
};

async function fetchNextSteps(userId: string): Promise<NextStepsResponse> {
  const res = await request({ path: `/api/next-steps?userId=${encodeURIComponent(userId)}` });
  assert.equal(res.status, 200, `GET /next-steps failed (${res.status}): ${res.body}`);
  return JSON.parse(res.body) as NextStepsResponse;
}

function findTestDevotional(data: NextStepsResponse): NextStepsItem | undefined {
  return data.dailyDevotionals.find(d => d.id === testSeriesId);
}

// ─── A. Description is progress-aware, not the raw series description ─────────

describe("A — Devotional description is never the raw series description", () => {
  it("in-progress devotional description does not contain the generic series description text", async () => {
    const data = await fetchNextSteps(MEMBER_USER_ID);
    const item = findTestDevotional(data);
    assert.ok(item, `Test devotional series ${testSeriesId} not found in dailyDevotionals`);
    assert.notEqual(
      item.description,
      GENERIC_SERIES_DESCRIPTION,
      "description must not be the raw series description string"
    );
    assert.ok(
      !item.description?.includes("must never surface"),
      `description contains generic text: "${item.description}"`
    );
  });

  it("not-started devotional description does not contain the generic series description text", async () => {
    // A different user who has never interacted with the series.
    const OTHER_USER = `test-member-nostart-${RUN_TAG}`;
    const data = await fetchNextSteps(OTHER_USER);
    const item = findTestDevotional(data);
    assert.ok(item, "Test devotional series not found for not-started user");
    assert.notEqual(
      item.description,
      GENERIC_SERIES_DESCRIPTION,
      "not-started description must not be the raw series description"
    );
  });
});

// ─── B. In-progress description follows "Day N of M" pattern ─────────────────

describe("B — In-progress devotional shows Day N of M format", () => {
  it("description matches /^Day \\d+ of \\d+/ pattern", async () => {
    const data = await fetchNextSteps(MEMBER_USER_ID);
    const item = findTestDevotional(data);
    assert.ok(item, "Test devotional not found");
    assert.ok(
      item.description,
      "in-progress devotional must have a non-empty description"
    );
    assert.match(
      item.description,
      /^Day \d+ of \d+/,
      `description "${item.description}" does not start with "Day N of M"`
    );
  });

  it("description is exactly 'Day 2 of 7 · The First Place You Turn' after completing day 1", async () => {
    // After marking day 1 complete, completedDays = [1].
    // calcAvailableDaySelfPaced formula: Math.min(max(completedDays) + 1, cap) = 2.
    // Entry for day 2 is "The First Place You Turn".
    // This is the same value Walk.tsx computes — the test enforces parity.
    const data = await fetchNextSteps(MEMBER_USER_ID);
    const item = findTestDevotional(data);
    assert.ok(item, "Test devotional not found");
    assert.equal(
      item.description,
      "Day 2 of 7 · The First Place You Turn",
      `expected "Day 2 of 7 · The First Place You Turn", got: "${item.description}"`
    );
  });

  it("memberProgressState is 'in-progress' after completing day 1", async () => {
    const data = await fetchNextSteps(MEMBER_USER_ID);
    const item = findTestDevotional(data);
    assert.ok(item, "Test devotional not found");
    assert.equal(item.memberProgressState, "in-progress");
  });
});

// ─── C. Not-started devotional shows "Day 1 of N" ────────────────────────────

describe("C — Not-started devotional shows Day 1 of N", () => {
  it("description is 'Day 1 of 7' for a user who has not started", async () => {
    const OTHER_USER = `test-member-nostart-${RUN_TAG}`;
    const data = await fetchNextSteps(OTHER_USER);
    const item = findTestDevotional(data);
    assert.ok(item, "Test devotional not found");
    assert.equal(
      item.description,
      "Day 1 of 7",
      `not-started description should be "Day 1 of 7", got: "${item.description}"`
    );
  });

  it("memberProgressState is 'not-started' for a new user", async () => {
    const OTHER_USER = `test-member-nostart2-${RUN_TAG}`;
    const data = await fetchNextSteps(OTHER_USER);
    const item = findTestDevotional(data);
    assert.ok(item, "Test devotional not found");
    assert.equal(item.memberProgressState, "not-started");
  });
});

// ─── D. Companion items never carry a raw generic description ─────────────────
//
// buildCompanionItem (sermon-table source) intentionally omits `description`.
// This test guards against a regression where someone adds `description: c.title`
// or `description: c.description` to that return value.
// Journey-source companions are allowed to have a description (from buildJourneyItem)
// but it should be a short subtitle/scripture — never a long generic paragraph.
//
// We cannot easily seed a sermon companion without the AI pipeline, so we check
// whatever companions the DB already contains. If none exist, the test is skipped
// with a diagnostic note.

describe("D — Companion items do not carry a raw generic description", () => {
  it("sermon-table companion items have no description field (or a short one)", async () => {
    // Use an anonymous userId so we get not-started state for all companions.
    const data = await fetchNextSteps(`test-anon-${RUN_TAG}`);
    const companions: NextStepsItem[] = [
      ...(data.currentSermonCompanion ? [data.currentSermonCompanion] : []),
      ...data.previousSermonCompanions,
    ];

    if (companions.length === 0) {
      // No companions in DB — cannot verify companion shape; skip with a note.
      // This is acceptable: the devotional tests above still guard buildDevotionalItem.
      console.log("  ⚠  No published sermon companions in DB — companion description check skipped.");
      return;
    }

    for (const companion of companions) {
      if (companion.contentType !== "sermon-devotional") continue;

      // A description is allowed when it is a progress-aware string (Day N of M)
      // or a short scripture reference / subtitle.
      // What it must NOT be: a long generic paragraph (>120 chars) — those come
      // from s.description / c.description, never from the progress formula.
      if (companion.description !== undefined) {
        assert.ok(
          companion.description.length <= 120,
          `companion "${companion.title}" description is suspiciously long ` +
            `(${companion.description.length} chars) — likely a raw series description: ` +
            `"${companion.description.slice(0, 80)}..."`
        );
        // Must not look like a generic sentence that starts with "A " or "An " (typical blurb).
        assert.ok(
          !/^(A |An |This |Join |Explore |Discover )/i.test(companion.description),
          `companion description looks like a generic marketing blurb: "${companion.description}"`
        );
      }
    }
  });
});

// ─── F. Non-contiguous published entries use maxPublishedDay cap ─────────────
//
// Regression guard for the count-vs-maxDay cap bug:
//   Published days [1, 3], count=2, maxPublishedDay=3.
//   Member completes day 3 first (completedDays=[3], completedCount=1).
//   Wrong cap (count=2):     min(4, 2)=2 → routes to unpublished day 2.
//   Correct cap (maxDay=3):  min(4, 3)=3 → routes to published day 3.

describe("F — Non-contiguous published entries: cap uses maxPublishedDay not count", () => {
  it("routes to the highest published day, not a phantom mid-series day", async () => {
    const data = await fetchNextSteps(SPARSE_MEMBER_USER_ID);
    const item = data.dailyDevotionals.find(d => d.id === sparseSeriesId);
    assert.ok(item, `Sparse series ${sparseSeriesId} not found in dailyDevotionals`);
    // nextDay = min(max(3)+1, maxPublishedDay=3) = min(4,3) = 3.
    // The route must point to published day 3, not day 2 (absent) or day 4 (past cap).
    assert.equal(
      item.route,
      `/devotional/${sparseSeriesId}/day/3`,
      `route should be day/3 (published), got: "${item.route}"`
    );
  });

  it("description includes the day-3 entry title, not a phantom day-2 fallback", async () => {
    const data = await fetchNextSteps(SPARSE_MEMBER_USER_ID);
    const item = data.dailyDevotionals.find(d => d.id === sparseSeriesId);
    assert.ok(item, "Sparse series not found");
    // Description: completedCount=1, not allComplete (1 < 2); currentDay=3 (maxDay cap).
    // Entry at day 3 = SPARSE_ENTRY_TITLES[1] = "Sparse Conclusion".
    assert.equal(
      item.description,
      `Day 3 of 2 · ${SPARSE_ENTRY_TITLES[1]}`,
      `expected "Day 3 of 2 · ${SPARSE_ENTRY_TITLES[1]}", got: "${item.description}"`
    );
  });

  it("does not route to an unpublished day (count-cap regression)", async () => {
    const data = await fetchNextSteps(SPARSE_MEMBER_USER_ID);
    const item = data.dailyDevotionals.find(d => d.id === sparseSeriesId);
    assert.ok(item, "Sparse series not found");
    // day/2 does not exist as a published entry — routing there is the regression.
    assert.notEqual(
      item.route,
      `/devotional/${sparseSeriesId}/day/2`,
      "route must not point to the non-existent day 2"
    );
  });
});

// ─── G. Sermon companion description parity with Today's Steps ───────────────
//
// buildCompanionItem (sermon-table source) must compute the same
// "Day N of M · Entry Title" string that Walk.tsx shows so the two screens
// never diverge. This test seeds progress on whatever published companion
// exists in the DB and verifies the description format.
//
// If no published companion exists the test is skipped with a diagnostic note —
// the devotional and sparse-series tests above still protect buildDevotionalItem.

describe("G — Sermon companion description matches Today's Steps formula", () => {
  it("companion in-progress description is 'Day N of M' or 'Day N of M · Title' (not generic)", async () => {
    // Step 1: discover the current published companion (if any).
    const companionRes = await request({
      path: "/api/sermon-companions/current-week/member",
      userId: ADMIN_USER_ID,
    });
    if (companionRes.status === 404) {
      console.log("  ⚠  No published sermon companion in DB — companion parity check skipped.");
      return;
    }
    assert.equal(
      companionRes.status,
      200,
      `current-week/member failed (${companionRes.status}): ${companionRes.body}`
    );
    const companion = JSON.parse(companionRes.body) as {
      id: string;
      title: string;
      numberOfDays: number;
      entries?: { dayNumber: number; title: string }[];
      progress: { currentDay: number; completedDays: number[] } | null;
    };

    // Step 2: start the companion as a dedicated test user.
    const COMPANION_USER = `test-companion-parity-${RUN_TAG}`;
    await request({
      method: "POST",
      path: `/api/sermon-companions/${companion.id}/progress/start`,
      userId: COMPANION_USER,
    });

    // Step 3: complete day 1 → currentDay advances to 2.
    await request({
      method: "POST",
      path: `/api/sermon-companions/${companion.id}/progress/complete-day`,
      userId: COMPANION_USER,
      body: { dayNumber: 1 },
    });

    // Step 4: fetch next-steps for this user.
    const data = await fetchNextSteps(COMPANION_USER);
    const allCompanions = [
      ...(data.currentSermonCompanion ? [data.currentSermonCompanion] : []),
      ...data.previousSermonCompanions,
    ];
    const item = allCompanions.find(c => c.id === companion.id);
    assert.ok(item, `Companion ${companion.id} not found in next-steps response`);

    // Step 5: assert description format.
    // After completing day 1, currentDay = 2 (companion.markDayComplete increments it).
    // Walk.tsx formula: allComplete ? "N of N completed" : completedCount > 0 ? "Day N of M · Title" : "Day 1 of M"
    // completedCount = 1, allComplete = (1 >= numberOfDays)? only if 1-day companion.
    const expectedDay = companion.numberOfDays === 1 ? "completed" : "Day 2";
    assert.ok(
      item.description?.startsWith(expectedDay) ||
        (companion.numberOfDays === 1 && item.description?.endsWith("completed")),
      `description "${item.description}" should start with "${expectedDay}" ` +
        `for a ${companion.numberOfDays}-day companion after completing day 1`
    );

    // The description must NEVER be the companion's title or a generic long string.
    assert.ok(
      item.description !== companion.title,
      "description must not equal the companion title"
    );
    assert.ok(
      (item.description?.length ?? 0) <= 80,
      `description is suspiciously long (${item.description?.length} chars): "${item.description}"`
    );

    // Route must point to day 2 (in-progress) or /previous (if 1-day complete).
    if (companion.numberOfDays > 1) {
      assert.equal(
        item.route,
        `/sermon-companion/${companion.id}/day/2`,
        `route should be /day/2 after completing day 1`
      );
    }
  });
});

// ─── E. Response shape contract ──────────────────────────────────────────────

describe("E — GET /next-steps response shape", () => {
  it("returns all five required top-level keys", async () => {
    const data = await fetchNextSteps(MEMBER_USER_ID);
    assert.ok(Array.isArray(data.dailyDevotionals), "dailyDevotionals must be an array");
    assert.ok(Array.isArray(data.journeyCollections), "journeyCollections must be an array");
    assert.ok(Array.isArray(data.standaloneJourneys), "standaloneJourneys must be an array");
    assert.ok(
      data.currentSermonCompanion === null || typeof data.currentSermonCompanion === "object",
      "currentSermonCompanion must be null or an object"
    );
    assert.ok(Array.isArray(data.previousSermonCompanions), "previousSermonCompanions must be an array");
  });

  it("each dailyDevotional item has the required fields", async () => {
    const data = await fetchNextSteps(MEMBER_USER_ID);
    for (const item of data.dailyDevotionals) {
      assert.ok(item.id, "item.id is required");
      assert.equal(item.contentType, "daily-devotional", "contentType must be 'daily-devotional'");
      assert.ok(item.title, "item.title is required");
      assert.ok(item.memberProgressState, "item.memberProgressState is required");
      assert.ok(item.route, "item.route is required");
      assert.ok(
        item.primaryActionLabel !== undefined,
        "item.primaryActionLabel must be present (string or null)"
      );
    }
  });

  it("returns 200 with no userId (anonymous request)", async () => {
    const res = await request({ path: "/api/next-steps" });
    assert.equal(res.status, 200, `anonymous request failed: ${res.body}`);
    const data = JSON.parse(res.body) as NextStepsResponse;
    assert.ok(Array.isArray(data.dailyDevotionals));
  });
});
