/**
 * signal-rule-config.test.ts — Authorization and validation tests for
 * the signal rule configuration endpoint (Task 380).
 *
 * Key invariants tested:
 *  1. A non-superAdmin with a spoofed X-User-Role: superAdmin header CANNOT
 *     modify thresholds — role is verified from the server-side role store.
 *  2. A valid superAdmin CAN adjust thresholds, and values are clamped to
 *     the declared min/max of the rule's thresholdDef.
 *  3. An unknown ruleId returns 404.
 *  4. A non-superAdmin toggle preserves existing DB thresholds (no wipe).
 *  5. Disabling a rule resolves its open signals (resolvedSignals ≥ 0).
 *
 * Requires the API server to be running.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/signal-rule-config.test.ts
 */

import { describe, it, before } from "node:test";
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

function request(opts: ReqOpts): Promise<{ status: number; body: unknown }> {
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
        let data = "";
        res.on("data", (c: string) => { data += c; });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Known demo users — roles are seeded in user-role-store.ts
const SUPER_ADMIN = { id: "demo-superadmin-1", role: "superAdmin" as const };
// A regular admin user.  We send a spoofed superAdmin header so the test
// verifies the server ignores the header and uses the role store.
const REGULAR_ADMIN = { id: "demo-admin-1", role: "superAdmin" as const }; // spoofed!

// Rule with a thresholdDef to test against
const THRESHOLD_RULE_ID = "missed_three_services";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("GET /api/pastoral/signal-rule-config", () => {
  it("returns all 18 rules for a pastoral admin", async () => {
    const { status, body } = await request({
      path:   "/api/pastoral/signal-rule-config",
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
    });
    assert.equal(status, 200);
    assert.ok(Array.isArray(body), "body should be an array");
    assert.equal((body as unknown[]).length, 18, "should return exactly 18 rules");
  });

  it("returns thresholdDefs for threshold-aware rules", async () => {
    const { body } = await request({
      path:   "/api/pastoral/signal-rule-config",
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
    });
    const rules = body as Array<{ id: string; thresholdDefs?: unknown[] }>;
    const rule = rules.find((r) => r.id === THRESHOLD_RULE_ID);
    assert.ok(rule, `${THRESHOLD_RULE_ID} should be in the list`);
    assert.ok(Array.isArray(rule.thresholdDefs) && rule.thresholdDefs.length > 0,
      "threshold rule should have thresholdDefs");
  });
});

describe("PATCH /api/pastoral/signal-rule-config/:ruleId — authorization", () => {
  it("rejects unknown ruleId with 404", async () => {
    const { status } = await request({
      method: "PATCH",
      path:   "/api/pastoral/signal-rule-config/not_a_real_rule",
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
      body:   { enabled: false },
    });
    assert.equal(status, 404, "unknown rule should return 404");
  });

  it("rejects missing enabled field with 400", async () => {
    const { status } = await request({
      method: "PATCH",
      path:   `/api/pastoral/signal-rule-config/${THRESHOLD_RULE_ID}`,
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
      body:   { thresholds: { consecutiveMissed: 4 } }, // no enabled
    });
    assert.equal(status, 400);
  });

  it("a superAdmin can set a threshold", async () => {
    const { status, body } = await request({
      method: "PATCH",
      path:   `/api/pastoral/signal-rule-config/${THRESHOLD_RULE_ID}`,
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
      body:   { enabled: true, thresholds: { consecutiveMissed: 4 } },
    });
    assert.equal(status, 200);
    assert.equal((body as { ok: boolean }).ok, true);

    // Verify it was persisted
    const { body: list } = await request({
      path:   "/api/pastoral/signal-rule-config",
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
    });
    const rules = list as Array<{ id: string; thresholds: Record<string, number> }>;
    const rule = rules.find((r) => r.id === THRESHOLD_RULE_ID);
    assert.equal(rule?.thresholds?.consecutiveMissed, 4, "threshold should be persisted");
  });

  it("a non-superAdmin with spoofed role header CANNOT modify thresholds", async () => {
    // REGULAR_ADMIN has role='admin' in the server store, but we send
    // X-User-Role: superAdmin to simulate a spoofed header.
    const { status } = await request({
      method: "PATCH",
      path:   `/api/pastoral/signal-rule-config/${THRESHOLD_RULE_ID}`,
      userId: REGULAR_ADMIN.id,
      role:   REGULAR_ADMIN.role, // spoofed superAdmin header
      body:   { enabled: true, thresholds: { consecutiveMissed: 99 } },
    });
    // Request succeeds (toggle is permitted) — but threshold should NOT be 99
    assert.equal(status, 200, "toggle itself should still succeed");

    const { body: list } = await request({
      path:   "/api/pastoral/signal-rule-config",
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
    });
    const rules = list as Array<{ id: string; thresholds: Record<string, number> }>;
    const rule = rules.find((r) => r.id === THRESHOLD_RULE_ID);
    assert.notEqual(rule?.thresholds?.consecutiveMissed, 99,
      "non-superAdmin should NOT be able to set threshold even with spoofed header");
  });

  it("out-of-bounds threshold is clamped to declared max", async () => {
    const { status } = await request({
      method: "PATCH",
      path:   `/api/pastoral/signal-rule-config/${THRESHOLD_RULE_ID}`,
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
      body:   { enabled: true, thresholds: { consecutiveMissed: 9999 } },
    });
    assert.equal(status, 200);

    const { body: list } = await request({
      path:   "/api/pastoral/signal-rule-config",
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
    });
    const rules = list as Array<{ id: string; thresholds: Record<string, number> }>;
    const rule = rules.find((r) => r.id === THRESHOLD_RULE_ID);
    // The declared max for consecutiveMissed is 10
    assert.ok(
      (rule?.thresholds?.consecutiveMissed ?? 0) <= 10,
      `threshold should be clamped to max (got ${rule?.thresholds?.consecutiveMissed})`
    );
  });
});

describe("PATCH — spoofed X-User-Role: admin header is rejected for toggle", () => {
  it("a member with spoofed X-User-Role: admin cannot toggle a rule", async () => {
    // This user is NOT in the server-side role store as admin or superAdmin.
    const { status } = await request({
      method: "PATCH",
      path:   `/api/pastoral/signal-rule-config/${THRESHOLD_RULE_ID}`,
      userId: "unknown-member-99",
      role:   "admin",   // spoofed — server role store has no entry, defaults to "user"
      body:   { enabled: false },
    });
    assert.equal(status, 403, "spoofed admin header should be rejected with 403");
  });
});

describe("PATCH — threshold preservation on non-superAdmin toggle", () => {
  before(async () => {
    // Set a known threshold as superAdmin
    await request({
      method: "PATCH",
      path:   `/api/pastoral/signal-rule-config/${THRESHOLD_RULE_ID}`,
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
      body:   { enabled: true, thresholds: { consecutiveMissed: 5 } },
    });
  });

  it("non-superAdmin toggle preserves existing superAdmin-configured thresholds", async () => {
    // Toggle with admin (spoofed superAdmin header — server should still use role store)
    await request({
      method: "PATCH",
      path:   `/api/pastoral/signal-rule-config/${THRESHOLD_RULE_ID}`,
      userId: REGULAR_ADMIN.id,
      role:   REGULAR_ADMIN.role, // spoofed
      body:   { enabled: false },
    });

    const { body: list } = await request({
      path:   "/api/pastoral/signal-rule-config",
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
    });
    const rules = list as Array<{ id: string; thresholds: Record<string, number> }>;
    const rule = rules.find((r) => r.id === THRESHOLD_RULE_ID);
    assert.equal(rule?.thresholds?.consecutiveMissed, 5,
      "threshold set by superAdmin should be preserved after non-superAdmin toggle");
  });
});

describe("PATCH — disable resolves open signals", () => {
  it("returns resolvedSignals count when disabling a rule", async () => {
    // First ensure the rule is enabled
    await request({
      method: "PATCH",
      path:   `/api/pastoral/signal-rule-config/${THRESHOLD_RULE_ID}`,
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
      body:   { enabled: true, thresholds: { consecutiveMissed: 3 } },
    });

    // Now disable — response should include resolvedSignals
    const { status, body } = await request({
      method: "PATCH",
      path:   `/api/pastoral/signal-rule-config/${THRESHOLD_RULE_ID}`,
      userId: SUPER_ADMIN.id,
      role:   SUPER_ADMIN.role,
      body:   { enabled: false },
    });
    assert.equal(status, 200);
    const result = body as { ok: boolean; resolvedSignals: number };
    assert.equal(result.ok, true);
    assert.ok(typeof result.resolvedSignals === "number" && result.resolvedSignals >= 0,
      "resolvedSignals should be a non-negative number");
  });
});
