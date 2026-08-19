/**
 * Collection Completion Persistence — Integration Test
 *
 * Guards the full round-trip: complete a walk → reload → JourneyContext
 * rehydrates from the server → JourneysPanel still sees the correct count.
 *
 * What it tests
 * ─────────────
 * A. After completing all steps in one of two walks, GET /journeys/progress
 *    returns completedDays.length >= durationDays for that walk, and the
 *    partial-completion subtitle formula ("1 of 2 walks completed") holds.
 *
 * B. After completing both walks, GET /journeys/progress confirms both walks
 *    are fully complete, and the full-collection formula ("2 Walks · Completed")
 *    holds.
 *
 * C. memberProgressState in GET /next-steps journeyCollections reflects the
 *    persisted progress (not stale cache).
 *
 * Why the subtitle logic is tested here (not just in unit tests)
 * ──────────────────────────────────────────────────────────────
 * JourneysPanel derives the subtitle entirely from two data sources:
 *
 *   1. `col.journeys[i].metadata.durationDays`  — from GET /next-steps
 *   2. `progress[j.id].completedDays`           — from GET /journeys/progress
 *
 * A unit test can mock these values; this test verifies the server actually
 * persists and returns them correctly after a simulated app restart.
 *
 * Requires the API server to be running.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/collection-completion-persistence.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { authHeader, cleanupTestAuth } from "../../test-utils/test-auth.ts";

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const url = new URL(BASE_URL);
const isHttps = url.protocol === "https:";
const transport = isHttps ? https : http;

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

type ReqOpts = {
  method?: string;
  path: string;
  userId?: string;
  role?: "user" | "admin" | "superAdmin";
  body?: object;
};

async function request(opts: ReqOpts): Promise<{ status: number; body: string }> {
  const authHeaders = opts.userId
    ? await authHeader(opts.userId, { role: opts.role ?? "user" })
    : {};
  return new Promise((resolve, reject) => {
    const payload = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...authHeaders,
    };
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

// ─── Test fixtures ────────────────────────────────────────────────────────────

// Admin setup uses a real test session whose database app_role is superAdmin,
// created via the shared test-auth harness — no demo-user ownership semantics.
const RUN_TAG        = Date.now();
const ADMIN_USER_ID  = `test-collection-admin-${RUN_TAG}`;
const MEMBER_USER_ID = `test-collection-member-${RUN_TAG}`;

/** Issue a request as the superAdmin setup identity. */
function adminRequest(opts: Omit<ReqOpts, "userId" | "role">) {
  return request({ ...opts, userId: ADMIN_USER_ID, role: "superAdmin" });
}

// Each walk has exactly 2 steps so the completion check is
// completedDays.length (2) >= durationDays (2).
const STEPS_PER_WALK = 2;

let collectionId = "";
let walkId1 = "";
let walkId2 = "";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FrontendProgress = {
  journeyId: string;
  currentDay: number;
  completedDays: number[];
  startedAt: string;
  lastCompletedAt: string | null;
  status?: string;
};

type NextStepsItem = {
  id: string;
  contentType: string;
  title: string;
  memberProgressState: string;
  metadata: {
    durationDays?: number;
    currentDay?: number;
    collectionId?: string;
  };
};

type JourneyCollectionGroup = {
  id: string;
  title: string;
  journeys: NextStepsItem[];
};

type NextStepsResponse = {
  journeyCollections: JourneyCollectionGroup[];
  standaloneJourneys: NextStepsItem[];
  dailyDevotionals: NextStepsItem[];
  currentSermonCompanion: NextStepsItem | null;
  previousSermonCompanions: NextStepsItem[];
};

async function getAllProgress(userId: string): Promise<Record<string, FrontendProgress>> {
  const res = await request({ path: "/api/journeys/progress", userId });
  assert.equal(res.status, 200, `GET /api/journeys/progress failed (${res.status}): ${res.body}`);
  return (JSON.parse(res.body) as { progress: Record<string, FrontendProgress> }).progress;
}

async function fetchNextSteps(userId: string): Promise<NextStepsResponse> {
  const res = await request({ path: "/api/next-steps", userId });
  assert.equal(res.status, 200, `GET /api/next-steps failed (${res.status}): ${res.body}`);
  return JSON.parse(res.body) as NextStepsResponse;
}

/**
 * Replicates the JourneysPanel completion count formula exactly.
 *
 * Source: artifacts/project-emmaus/src/pages/Journeys.tsx  lines 519–543
 *
 *   const completed = col.journeys.filter(j => {
 *     const p = progress[j.id];
 *     const total = j.metadata.durationDays ?? 0;
 *     return total > 0 && (p?.completedDays.length ?? 0) >= total;
 *   }).length;
 *
 *   subtitle = completed === walkCount
 *     ? `${walkCount} Walks · Completed`
 *     : `${completed} of ${walkCount} walks completed`;
 */
function deriveSubtitle(
  collectionJourneys: NextStepsItem[],
  progress: Record<string, FrontendProgress>,
): string {
  const walkCount = collectionJourneys.length;
  const completed = collectionJourneys.filter(j => {
    const p = progress[j.id];
    const total = j.metadata.durationDays ?? 0;
    return total > 0 && (p?.completedDays.length ?? 0) >= total;
  }).length;

  const hasInProgress = collectionJourneys.some(j => {
    const p = progress[j.id];
    if (!p) return false;
    const total = j.metadata.durationDays ?? 0;
    return !(total > 0 && p.completedDays.length >= total);
  });

  const hasProgress = completed > 0 || hasInProgress;

  if (!hasProgress) {
    return `${walkCount} ${walkCount === 1 ? "Walk" : "Walks"}`;
  }
  if (completed === walkCount) {
    return `${walkCount} ${walkCount === 1 ? "Walk" : "Walks"} · Completed`;
  }
  return `${completed} of ${walkCount} ${walkCount === 1 ? "walk" : "walks"} completed`;
}

// ─── Before: seed collection, walks, and steps ───────────────────────────────

before(async () => {
  // 1. Create the collection.
  const colRes = await adminRequest({
    method: "POST",
    path: "/api/collections",
    body: {
      title: `__TEST__ Collection Completion [${RUN_TAG}]`,
      description: "Integration test collection — safe to delete",
      status: "Published",
    },
  });
  assert.equal(colRes.status, 201, `Create collection failed (${colRes.status}): ${colRes.body}`);
  collectionId = (JSON.parse(colRes.body) as { collection: { id: string } }).collection.id;

  // 2. Create two walks inside the collection.
  for (const [idx, varLabel] of [["1", "Alpha"], ["2", "Beta"]] as const) {
    const jRes = await adminRequest({
      method: "POST",
      path: "/api/journeys",
      body: {
        title: `__TEST__ Walk ${varLabel} [${RUN_TAG}]`,
        description: "Test walk — safe to delete",
        journeyType: "journey",
        collectionId,
        status: "Draft",
        durationDays: 0,   // server updates this after steps are added
      },
    });
    assert.equal(jRes.status, 201, `Create walk ${varLabel} failed (${jRes.status}): ${jRes.body}`);
    const j = JSON.parse(jRes.body) as { id: string };
    if (idx === "1") walkId1 = j.id;
    else             walkId2 = j.id;
  }

  // 3. Add STEPS_PER_WALK Published steps to each walk.
  for (const [walkId, varLabel] of [[walkId1, "Alpha"], [walkId2, "Beta"]] as const) {
    for (let day = 1; day <= STEPS_PER_WALK; day++) {
      const sRes = await adminRequest({
        method: "POST",
        path: `/api/journeys/${walkId}/steps`,
        body: {
          day,
          title: `${varLabel} Step ${day}`,
          status: "Published",
          mentorIntro: "",
          scripture: "John 1:1",
          devotional: "Test content.",
          reflectionQuestion: "Reflect.",
          prayerPrompt: "Pray.",
          actionStep: "Act.",
        },
      });
      // POST /journeys/:id/steps returns 201 for new steps, 200 on upsert.
      assert.ok(
        sRes.status === 200 || sRes.status === 201,
        `Add step day ${day} to ${varLabel} failed (${sRes.status}): ${sRes.body}`,
      );
    }
  }

  // 4. Publish both walks — publishing auto-publishes steps and updates durationDays.
  for (const [walkId, varLabel] of [[walkId1, "Alpha"], [walkId2, "Beta"]] as const) {
    const pubRes = await adminRequest({
      method: "POST",
      path: `/api/journeys/${walkId}/publish`,
    });
    assert.equal(pubRes.status, 200, `Publish walk ${varLabel} failed (${pubRes.status}): ${pubRes.body}`);
    const published = JSON.parse(pubRes.body) as { durationDays: number };
    assert.equal(
      published.durationDays,
      STEPS_PER_WALK,
      `Walk ${varLabel} durationDays should be ${STEPS_PER_WALK} after publish, got ${published.durationDays}`,
    );
  }
});

// ─── After: permanent-delete test data ───────────────────────────────────────
// Cleanup failures are surfaced as assertion errors so a broken test run cannot
// silently leave __TEST__ walks or collections in the shared server database.
// Startup-migrations.ts has a best-effort __TEST__ cleaner, but relying on it
// means test pollution can persist across restarts and interfere with integrity
// checks that count rows in authored-content tables.

after(async () => {
  const errors: string[] = [];

  try {
    // Delete domain fixtures FIRST (walks + collection), then let the finally
    // block always remove helper-created auth rows + residue.

    // Delete test walks (permanent — requires superAdmin).
    for (const walkId of [walkId1, walkId2]) {
      if (!walkId) continue;
      const r = await adminRequest({
        method: "DELETE",
        path: `/api/journeys/${walkId}`,
        body: { confirm: "PERMANENTLY_DELETE" },
      });
      // 200 = deleted; 404 = already gone — both are acceptable.
      if (r.status !== 200 && r.status !== 404) {
        errors.push(`DELETE walk ${walkId} returned ${r.status}: ${r.body.slice(0, 120)}`);
      }
    }

    // Delete the collection (cascade-unlinks any walks first).
    if (collectionId) {
      const r = await adminRequest({
        method: "DELETE",
        path: `/api/collections/${collectionId}`,
      });
      if (r.status !== 200 && r.status !== 404) {
        errors.push(`DELETE collection ${collectionId} returned ${r.status}: ${r.body.slice(0, 120)}`);
      }
    }
  } finally {
    // Auth cleanup + domain residue purge ALWAYS runs, even if a delete above
    // threw or the assertion below fails.
    await cleanupTestAuth();
  }

  assert.equal(
    errors.length,
    0,
    `Cleanup failed — __TEST__ data may have been left in the server database:\n${errors.join("\n")}`,
  );
});

// ─── A. Partial completion — "1 of 2 walks completed" ────────────────────────

describe("A — Partial completion persists across reload", () => {
  before(async () => {
    // Start walk 1 and complete all its steps (simulating a member session).
    await request({
      method: "POST",
      path: `/api/journeys/${walkId1}/progress/start`,
      userId: MEMBER_USER_ID,
    });

    for (let day = 1; day <= STEPS_PER_WALK; day++) {
      const r = await request({
        method: "POST",
        path: `/api/journeys/${walkId1}/progress/complete-step`,
        userId: MEMBER_USER_ID,
        body: { day },
      });
      assert.equal(r.status, 200, `Complete walk1 step ${day} failed: ${r.body}`);
    }
  });

  it("GET /journeys/progress returns completedDays for walk 1 after reload", async () => {
    // Simulates JourneyContext calling api.getAllProgress(user.id) on mount.
    const progress = await getAllProgress(MEMBER_USER_ID);
    const p = progress[walkId1];
    assert.ok(p, `No progress record found for walk 1 (${walkId1}) after completing all steps`);
    assert.deepEqual(
      [...p.completedDays].sort((a, b) => a - b),
      Array.from({ length: STEPS_PER_WALK }, (_, i) => i + 1),
      `completedDays should be [1, 2], got: ${JSON.stringify(p.completedDays)}`,
    );
  });

  it("completedDays.length >= durationDays — walk 1 counts as completed", async () => {
    const progress = await getAllProgress(MEMBER_USER_ID);
    const p = progress[walkId1];
    assert.ok(p, "No progress record found for walk 1");
    assert.ok(
      p.completedDays.length >= STEPS_PER_WALK,
      `Expected completedDays.length (${p.completedDays.length}) >= ${STEPS_PER_WALK}`,
    );
  });

  it("walk 2 has no progress record — counts as not-started", async () => {
    const progress = await getAllProgress(MEMBER_USER_ID);
    const p2 = progress[walkId2];
    // Not started at all — no row in the DB.
    assert.ok(!p2, `Walk 2 should have no progress yet, got: ${JSON.stringify(p2)}`);
  });

  it("JourneysPanel subtitle formula yields '1 of 2 walks completed'", async () => {
    // Fetch both data sources exactly as JourneyContext + JourneysPanel would.
    const [progress, nextSteps] = await Promise.all([
      getAllProgress(MEMBER_USER_ID),
      fetchNextSteps(MEMBER_USER_ID),
    ]);

    const col = nextSteps.journeyCollections.find(c => c.id === collectionId);
    assert.ok(col, `Collection ${collectionId} not found in journeyCollections`);

    const subtitle = deriveSubtitle(col.journeys, progress);
    assert.equal(
      subtitle,
      "1 of 2 walks completed",
      `Expected "1 of 2 walks completed", got: "${subtitle}"`,
    );
  });

  it("memberProgressState for walk 1 is 'completed' in /next-steps", async () => {
    const nextSteps = await fetchNextSteps(MEMBER_USER_ID);
    const col = nextSteps.journeyCollections.find(c => c.id === collectionId);
    assert.ok(col, `Collection not found in journeyCollections`);
    const walk1Item = col.journeys.find(j => j.id === walkId1);
    assert.ok(walk1Item, `Walk 1 not found in collection journeys`);
    assert.equal(
      walk1Item.memberProgressState,
      "completed",
      `Walk 1 memberProgressState should be 'completed', got: '${walk1Item.memberProgressState}'`,
    );
  });

  it("durationDays in /next-steps matches STEPS_PER_WALK for both walks", async () => {
    const nextSteps = await fetchNextSteps(MEMBER_USER_ID);
    const col = nextSteps.journeyCollections.find(c => c.id === collectionId);
    assert.ok(col, "Collection not found");
    for (const walk of col.journeys) {
      assert.equal(
        walk.metadata.durationDays,
        STEPS_PER_WALK,
        `Walk "${walk.id}" durationDays should be ${STEPS_PER_WALK}, got ${walk.metadata.durationDays}`,
      );
    }
  });
});

// ─── B. Full-collection completion — "N Walks · Completed" ───────────────────

describe("B — Full-collection completion persists across reload", () => {
  before(async () => {
    // Now complete walk 2 as well.
    await request({
      method: "POST",
      path: `/api/journeys/${walkId2}/progress/start`,
      userId: MEMBER_USER_ID,
    });

    for (let day = 1; day <= STEPS_PER_WALK; day++) {
      const r = await request({
        method: "POST",
        path: `/api/journeys/${walkId2}/progress/complete-step`,
        userId: MEMBER_USER_ID,
        body: { day },
      });
      assert.equal(r.status, 200, `Complete walk2 step ${day} failed: ${r.body}`);
    }
  });

  it("GET /journeys/progress returns completedDays for walk 2 after reload", async () => {
    const progress = await getAllProgress(MEMBER_USER_ID);
    const p = progress[walkId2];
    assert.ok(p, `No progress record found for walk 2 (${walkId2}) after completing all steps`);
    assert.deepEqual(
      [...p.completedDays].sort((a, b) => a - b),
      Array.from({ length: STEPS_PER_WALK }, (_, i) => i + 1),
      `completedDays should be [1, 2], got: ${JSON.stringify(p.completedDays)}`,
    );
  });

  it("JourneysPanel subtitle formula yields '2 Walks · Completed'", async () => {
    // Both data sources fetched together — same as JourneyContext init path.
    const [progress, nextSteps] = await Promise.all([
      getAllProgress(MEMBER_USER_ID),
      fetchNextSteps(MEMBER_USER_ID),
    ]);

    const col = nextSteps.journeyCollections.find(c => c.id === collectionId);
    assert.ok(col, `Collection ${collectionId} not found in journeyCollections`);

    const subtitle = deriveSubtitle(col.journeys, progress);
    assert.equal(
      subtitle,
      "2 Walks · Completed",
      `Expected "2 Walks · Completed", got: "${subtitle}"`,
    );
  });

  it("memberProgressState for both walks is 'completed' in /next-steps", async () => {
    const nextSteps = await fetchNextSteps(MEMBER_USER_ID);
    const col = nextSteps.journeyCollections.find(c => c.id === collectionId);
    assert.ok(col, "Collection not found");
    for (const walk of col.journeys) {
      assert.equal(
        walk.memberProgressState,
        "completed",
        `Walk "${walk.id}" memberProgressState should be 'completed', got: '${walk.memberProgressState}'`,
      );
    }
  });
});

// ─── C. Idempotency — repeated reloads return the same counts ─────────────────

describe("C — Repeated GET /journeys/progress reloads return stable completedDays", () => {
  it("second reload returns identical completedDays for walk 1", async () => {
    const [p1, p2] = await Promise.all([
      getAllProgress(MEMBER_USER_ID),
      getAllProgress(MEMBER_USER_ID),
    ]);
    const w1a = p1[walkId1];
    const w1b = p2[walkId1];
    assert.ok(w1a && w1b, "Progress missing on one of the parallel requests");
    assert.deepEqual(
      [...w1a.completedDays].sort((a, b) => a - b),
      [...w1b.completedDays].sort((a, b) => a - b),
      "completedDays changed between two concurrent reloads — likely a race condition",
    );
  });

  it("completedDays are stable across walk 1 and walk 2 simultaneously", async () => {
    const progress = await getAllProgress(MEMBER_USER_ID);
    for (const [walkId, label] of [[walkId1, "Walk 1"], [walkId2, "Walk 2"]] as const) {
      const p = progress[walkId];
      assert.ok(p, `${label} progress missing`);
      assert.ok(
        p.completedDays.length >= STEPS_PER_WALK,
        `${label}: completedDays.length (${p.completedDays.length}) < ${STEPS_PER_WALK}`,
      );
    }
  });
});
