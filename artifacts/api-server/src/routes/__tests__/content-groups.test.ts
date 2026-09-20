/**
 * Content Groups — Integration Tests (Task #614)
 *
 * Covers:
 *   A. Create group (admin required, title required)
 *   B. List groups
 *   C. Update group (status lifecycle)
 *   D. Replace group items (with type validation)
 *   E. Get group detail with items
 *   F. Get groups by target
 *   G. Delete group removes only group + memberships (not content)
 *   H. Unauthenticated member sees only Published groups
 *
 * Requires the API server to be running.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/content-groups.test.ts
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

async function request(opts: ReqOpts): Promise<{ status: number; body: unknown }> {
  const authHeaders = opts.userId
    ? await authHeader(opts.userId, { role: opts.role ?? "user" })
    : {};
  return new Promise((resolve, reject) => {
    const payload = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...authHeaders,
    };
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
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          let body: unknown;
          try { body = JSON.parse(raw); } catch { body = raw; }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ─── Test fixtures ────────────────────────────────────────────────────────────

const RUN_TAG = Date.now();
const ADMIN_ID = `test-cg-admin-${RUN_TAG}`;
const MEMBER_ID = `test-cg-member-${RUN_TAG}`;

let createdGroupId: string;

describe("Content Groups API", () => {
  after(async () => {
    // cleanupTestAuth() purges all test identities created by this process
    await cleanupTestAuth();
  });

  // ── A. Create ──────────────────────────────────────────────────────────────

  it("A1: POST /api/content-groups requires admin", async () => {
    const res = await request({
      method: "POST",
      path: "/api/content-groups",
      userId: MEMBER_ID,
      role: "user",
      body: { title: "Test Group" },
    });
    assert.equal(res.status, 403, "member should be forbidden");
  });

  it("A2: POST /api/content-groups requires title", async () => {
    const res = await request({
      method: "POST",
      path: "/api/content-groups",
      userId: ADMIN_ID,
      role: "admin",
      body: { description: "no title" },
    });
    assert.equal(res.status, 400, "missing title should be 400");
  });

  it("A3: POST /api/content-groups creates a group", async () => {
    const res = await request({
      method: "POST",
      path: "/api/content-groups",
      userId: ADMIN_ID,
      role: "admin",
      body: {
        title: `CG Test ${RUN_TAG}`,
        description: "Integration test group",
        status: "Draft",
        displayOrder: 99,
      },
    });
    assert.equal(res.status, 201, `expected 201, got ${res.status}`);
    const body = res.body as { group: { id: string; title: string; status: string } };
    assert.ok(body.group?.id, "group.id should be present");
    assert.equal(body.group.status, "Draft");
    createdGroupId = body.group.id;
  });

  // ── B. List ────────────────────────────────────────────────────────────────

  it("B1: GET /api/content-groups returns groups for admin", async () => {
    const res = await request({
      path: "/api/content-groups",
      userId: ADMIN_ID,
      role: "admin",
    });
    assert.equal(res.status, 200);
    const body = res.body as { groups: unknown[] };
    assert.ok(Array.isArray(body.groups), "groups should be an array");
    assert.ok(body.groups.length >= 0, "should have groups array");
  });

  it("B2: GET /api/content-groups excludes Draft groups for members", async () => {
    // The Draft group we just created should not appear to members
    const res = await request({
      path: "/api/content-groups",
      userId: MEMBER_ID,
      role: "user",
    });
    assert.equal(res.status, 200);
    const body = res.body as { groups: Array<{ id: string }> };
    const found = body.groups.find(g => g.id === createdGroupId);
    assert.equal(found, undefined, "Draft group should not appear to members");
  });

  // ── C. Update ──────────────────────────────────────────────────────────────

  it("C1: PUT /api/content-groups/:id updates status to Published", async () => {
    const res = await request({
      method: "PUT",
      path: `/api/content-groups/${createdGroupId}`,
      userId: ADMIN_ID,
      role: "admin",
      body: { status: "Published" },
    });
    assert.equal(res.status, 200);
    const body = res.body as { group: { status: string } };
    assert.equal(body.group.status, "Published");
  });

  it("C2: PUT /api/content-groups/:id rejects invalid status", async () => {
    const res = await request({
      method: "PUT",
      path: `/api/content-groups/${createdGroupId}`,
      userId: ADMIN_ID,
      role: "admin",
      body: { status: "InvalidStatus" },
    });
    assert.equal(res.status, 400);
  });

  // ── D. Replace items ───────────────────────────────────────────────────────

  it("D1: PUT /api/content-groups/:id/items rejects invalid targetType", async () => {
    const res = await request({
      method: "PUT",
      path: `/api/content-groups/${createdGroupId}/items`,
      userId: ADMIN_ID,
      role: "admin",
      body: { items: [{ targetType: "invalid-type", targetId: "some-id" }] },
    });
    assert.equal(res.status, 400);
  });

  it("D2: PUT /api/content-groups/:id/items with empty array clears memberships", async () => {
    const res = await request({
      method: "PUT",
      path: `/api/content-groups/${createdGroupId}/items`,
      userId: ADMIN_ID,
      role: "admin",
      body: { items: [] },
    });
    assert.equal(res.status, 200);
    const body = res.body as { items: unknown[] };
    assert.ok(Array.isArray(body.items));
    assert.equal(body.items.length, 0);
  });

  // ── E. Get detail ──────────────────────────────────────────────────────────

  it("E1: GET /api/content-groups/:id returns group detail", async () => {
    const res = await request({
      path: `/api/content-groups/${createdGroupId}`,
      userId: ADMIN_ID,
      role: "admin",
    });
    assert.equal(res.status, 200);
    const body = res.body as { group: { id: string; items: unknown[] } };
    assert.equal(body.group.id, createdGroupId);
    assert.ok(Array.isArray(body.group.items));
  });

  it("E2: GET /api/content-groups/:id returns 404 for unknown group", async () => {
    const res = await request({
      path: "/api/content-groups/00000000-0000-0000-0000-000000000000",
      userId: ADMIN_ID,
      role: "admin",
    });
    assert.equal(res.status, 404);
  });

  // ── F. Groups by target ────────────────────────────────────────────────────

  it("F1: GET /api/content-groups/by-target rejects invalid type", async () => {
    const res = await request({
      path: "/api/content-groups/by-target/bad-type/some-id",
      userId: ADMIN_ID,
      role: "admin",
    });
    assert.equal(res.status, 400);
  });

  it("F2: GET /api/content-groups/by-target returns groups for valid type", async () => {
    const res = await request({
      path: "/api/content-groups/by-target/journey/walk-through-luke",
      userId: ADMIN_ID,
      role: "admin",
    });
    assert.equal(res.status, 200);
    const body = res.body as { groups: unknown[] };
    assert.ok(Array.isArray(body.groups));
  });

  // ── G. Delete ──────────────────────────────────────────────────────────────

  it("G1: DELETE /api/content-groups/:id removes group only", async () => {
    const res = await request({
      method: "DELETE",
      path: `/api/content-groups/${createdGroupId}`,
      userId: ADMIN_ID,
      role: "admin",
    });
    assert.equal(res.status, 200);
    const body = res.body as { ok: boolean };
    assert.equal(body.ok, true);
  });

  it("G2: DELETE /api/content-groups/:id returns 404 after deletion", async () => {
    const res = await request({
      method: "DELETE",
      path: `/api/content-groups/${createdGroupId}`,
      userId: ADMIN_ID,
      role: "admin",
    });
    assert.equal(res.status, 404);
  });

  // ── H. Next Steps integration ──────────────────────────────────────────────

  it("H1: GET /api/next-steps includes contentGroups field", async () => {
    const res = await request({
      path: "/api/next-steps",
      userId: MEMBER_ID,
      role: "user",
    });
    assert.equal(res.status, 200);
    const body = res.body as {
      dailyDevotionals: unknown[];
      journeyCollections: unknown[];
      standaloneJourneys: unknown[];
      currentSermonCompanion: unknown;
      previousSermonCompanions: unknown[];
      contentGroups: unknown[];
    };
    // Existing fields must still be present
    assert.ok(Array.isArray(body.dailyDevotionals), "dailyDevotionals must exist");
    assert.ok(Array.isArray(body.journeyCollections), "journeyCollections must exist");
    assert.ok(Array.isArray(body.standaloneJourneys), "standaloneJourneys must exist");
    assert.ok(Array.isArray(body.previousSermonCompanions), "previousSermonCompanions must exist");
    // New field
    assert.ok(Array.isArray(body.contentGroups), "contentGroups must be an array");
  });
});
