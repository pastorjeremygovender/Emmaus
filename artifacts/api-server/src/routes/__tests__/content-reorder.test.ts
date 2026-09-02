/**
 * Content Studio reorder integration coverage.
 *
 * The test uses isolated rows and real opaque test sessions. It must only run
 * with the explicit test-auth harness enabled and never against production.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";
import { pool } from "@workspace/db";
import {
  authHeader,
  cleanupTestAuth,
  testUserIdFor,
} from "../../test-utils/test-auth.ts";

const nodeEnv = process.env.NODE_ENV;
if (nodeEnv === "production" || process.env.REPLIT_DEPLOYMENT) {
  throw new Error("content-reorder.test: refused to run in production/deployment");
}
if (process.env.ALLOW_TEST_AUTH_HARNESS !== "1" || nodeEnv !== "test") {
  throw new Error(
    "content-reorder.test: set NODE_ENV=test and ALLOW_TEST_AUTH_HARNESS=1",
  );
}

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const base = new URL(BASE_URL);
const transport = base.protocol === "https:" ? https : http;
const nonce = crypto.randomBytes(8).toString("hex");
const adminKey = `content-reorder-admin-${nonce}`;
const memberKey = `content-reorder-member-${nonce}`;

const sermonIds = [
  crypto.randomUUID(),
  crypto.randomUUID(),
  crypto.randomUUID(),
];
const archivedSermonId = crypto.randomUUID();
const collectionIds = [crypto.randomUUID(), crypto.randomUUID()];
const journeyIds = [
  `__TEST__-reorder-${nonce}-a`,
  `__TEST__-reorder-${nonce}-b`,
  `__TEST__-reorder-${nonce}-other`,
];
let activeSermonIds: string[] = [];
let originalSermonOrders: Array<{ id: string; display_order: number; updated_at: Date }> = [];

type RequestOptions = {
  method?: string;
  path: string;
  userId?: string;
  role?: "user" | "admin" | "superAdmin";
  body?: object;
};

type ResponseData = {
  status: number;
  body: unknown;
};

async function request(options: RequestOptions): Promise<ResponseData> {
  const auth = options.userId
    ? await authHeader(options.userId, { role: options.role ?? "user" })
    : {};
  const payload = options.body ? JSON.stringify(options.body) : undefined;

  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...auth,
    };
    if (payload) headers["Content-Length"] = String(Buffer.byteLength(payload));

    const req = transport.request(
      {
        hostname: base.hostname,
        port: Number(base.port) || (base.protocol === "https:" ? 443 : 80),
        method: options.method ?? "GET",
        path: options.path,
        headers,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString();
          let body: unknown = raw;
          try {
            body = JSON.parse(raw);
          } catch {
            // Keep non-JSON errors available to assertions.
          }
          resolve({ status: res.statusCode ?? 0, body });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitForAuditRows(expectedCount: number): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const result = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
         FROM content_audit_log
        WHERE performed_by = $1
          AND content_id = ANY($2::text[])
          AND action = 'reorder'`,
      [await testUserIdFor(adminKey, "admin"), [...sermonIds, ...journeyIds]],
    );
    if (Number(result.rows[0]?.count ?? 0) >= expectedCount) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail(`timed out waiting for ${expectedCount} reorder audit rows`);
}

describe("Content Studio reorder API", () => {
  let adminId = "";

  before(async () => {
    adminId = await testUserIdFor(adminKey, "admin");
    await testUserIdFor(memberKey, "user");

    await pool.query(
      `INSERT INTO collections (id, title, status, display_order, created_by)
       VALUES
         ($1, $2, 'Published', 20, $3),
         ($4, $5, 'Published', 21, $3)`,
      [
        collectionIds[0],
        `__TEST__ Reorder Collection A ${nonce}`,
        adminId,
        collectionIds[1],
        `__TEST__ Reorder Collection B ${nonce}`,
      ],
    );

    await pool.query(
      `INSERT INTO journeys
        (id, title, description, journey_type, status, collection_id, display_order, created_by, updated_by)
       VALUES
        ($1, $2, '', 'course', 'Published', $3, 30, $4, $4),
        ($5, $6, '', 'course', 'Published', $3, 31, $4, $4),
        ($7, $8, '', 'course', 'Published', $9, 32, $4, $4)`,
      [
        journeyIds[0],
        `__TEST__ Reorder Journey A1 ${nonce}`,
        collectionIds[0],
        adminId,
        journeyIds[1],
        `__TEST__ Reorder Journey A2 ${nonce}`,
        journeyIds[2],
        `__TEST__ Reorder Journey B1 ${nonce}`,
        collectionIds[1],
      ],
    );

    await pool.query(
      `INSERT INTO sermons (id, title, status, display_order)
       VALUES
         ($1, $2, 'Published', 40),
         ($3, $4, 'Published', 10),
         ($5, $6, 'Published', 10),
         ($7, $8, 'Archived', 50)`,
      [
        sermonIds[0],
        `__TEST__ Reorder Sermon 1 ${nonce}`,
        sermonIds[1],
        `__TEST__ Reorder Sermon 2 ${nonce}`,
        sermonIds[2],
        `__TEST__ Reorder Sermon 3 ${nonce}`,
        archivedSermonId,
        `__TEST__ Archived Reorder Sermon ${nonce}`,
      ],
    );

    const original = await pool.query<{
      id: string;
      display_order: number;
      updated_at: Date;
    }>(
      `SELECT id::text, display_order, updated_at
         FROM sermons
        WHERE status <> 'Archived'
        ORDER BY display_order ASC NULLS LAST, id ASC`,
    );
    originalSermonOrders = original.rows;
    activeSermonIds = original.rows.map(row => row.id);
  });

  after(async () => {
    await pool.query(
      `DELETE FROM content_audit_log
        WHERE performed_by = $1
          AND (content_id = ANY($2::text[]) OR content_id = ANY($3::text[]))`,
      [adminId, [...sermonIds, archivedSermonId], journeyIds],
    );
    for (const row of originalSermonOrders) {
      await pool.query(
        `UPDATE sermons
            SET display_order = $1, updated_at = $2
          WHERE id = $3::uuid`,
        [row.display_order, row.updated_at, row.id],
      );
    }
    await pool.query(`DELETE FROM sermons WHERE id = ANY($1::uuid[])`, [
      [...sermonIds, archivedSermonId],
    ]);
    await pool.query(`DELETE FROM journeys WHERE id = ANY($1::text[])`, [journeyIds]);
    await pool.query(`DELETE FROM collections WHERE id = ANY($1::uuid[])`, [collectionIds]);
    await cleanupTestAuth();
  });

  it("requires authentication and an administrator role", async () => {
    const unauthenticated = await request({
      method: "POST",
      path: "/api/admin/reorder",
      body: { resourceType: "sermon", orderedIds: sermonIds },
    });
    assert.equal(unauthenticated.status, 401);

    const member = await request({
      method: "POST",
      path: "/api/admin/reorder",
      userId: memberKey,
      role: "user",
      body: { resourceType: "sermon", orderedIds: sermonIds },
    });
    assert.equal(member.status, 403);
  });

  it("rejects invalid resource types and duplicate or incomplete ID lists", async () => {
    const invalidType = await request({
      method: "POST",
      path: "/api/admin/reorder",
      userId: adminKey,
      role: "admin",
      body: { resourceType: "unknown", orderedIds: sermonIds },
    });
    assert.equal(invalidType.status, 400);

    const duplicate = await request({
      method: "POST",
      path: "/api/admin/reorder",
      userId: adminKey,
      role: "admin",
      body: { resourceType: "sermon", orderedIds: [sermonIds[0], sermonIds[0], sermonIds[2]] },
    });
    assert.equal(duplicate.status, 400);

    const incomplete = await request({
      method: "POST",
      path: "/api/admin/reorder",
      userId: adminKey,
      role: "admin",
      body: { resourceType: "sermon", orderedIds: [sermonIds[0], sermonIds[1]] },
    });
    assert.equal(incomplete.status, 409);
  });

  it("normalizes the complete sermon list and records only changed item audits", async () => {
    const reordered = [
      sermonIds[2],
      sermonIds[0],
      sermonIds[1],
      ...activeSermonIds.filter(id => !(new Set<string>(sermonIds)).has(id)),
    ];
    const response = await request({
      method: "POST",
      path: "/api/admin/reorder",
      userId: adminKey,
      role: "admin",
      body: { resourceType: "sermon", orderedIds: reordered },
    });
    assert.equal(response.status, 200);
    assert.deepEqual((response.body as { orderedIds: string[] }).orderedIds, reordered);
    assert.equal((response.body as { changed: boolean }).changed, true);

    const rows = await pool.query<{ id: string; display_order: number }>(
      `SELECT id::text, display_order
         FROM sermons
        WHERE id = ANY($1::uuid[])
        ORDER BY display_order ASC`,
      [activeSermonIds],
    );
    assert.deepEqual(
      rows.rows.map(row => row.display_order),
      activeSermonIds.map((_, index) => index),
    );
    assert.deepEqual(rows.rows.slice(0, 3).map(row => row.id), reordered.slice(0, 3));
    await waitForAuditRows(3);

    const noOp = await request({
      method: "POST",
      path: "/api/admin/reorder",
      userId: adminKey,
      role: "admin",
      body: { resourceType: "sermon", orderedIds: reordered },
    });
    assert.equal(noOp.status, 200);
    assert.equal((noOp.body as { changed: boolean }).changed, false);
  });

  it("keeps archived records out of the active reorder list", async () => {
    const response = await request({
      method: "POST",
      path: "/api/admin/reorder",
      userId: adminKey,
      role: "admin",
      body: {
        resourceType: "sermon",
        orderedIds: [...activeSermonIds, archivedSermonId],
      },
    });
    assert.equal(response.status, 409);
  });

  it("enforces collection parent scope for journey lists", async () => {
    const response = await request({
      method: "POST",
      path: "/api/admin/reorder",
      userId: adminKey,
      role: "admin",
      body: {
        resourceType: "journey",
        scope: "collection",
        parentId: collectionIds[0],
        orderedIds: [journeyIds[1], journeyIds[0]],
      },
    });
    assert.equal(response.status, 200);

    const rows = await pool.query<{ id: string; display_order: number }>(
      `SELECT id, display_order
         FROM journeys
        WHERE id = ANY($1::text[])
        ORDER BY display_order ASC`,
      [journeyIds.slice(0, 2)],
    );
    assert.deepEqual(rows.rows, [
      { id: journeyIds[1], display_order: 0 },
      { id: journeyIds[0], display_order: 1 },
    ]);

    const wrongParentList = await request({
      method: "POST",
      path: "/api/admin/reorder",
      userId: adminKey,
      role: "admin",
      body: {
        resourceType: "journey",
        scope: "collection",
        parentId: collectionIds[1],
        orderedIds: [journeyIds[1], journeyIds[0]],
      },
    });
    assert.equal(wrongParentList.status, 409);
  });
});