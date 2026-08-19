/**
 * archive-authz.test.ts — Authorization tests for the legacy YouTube-archive
 * admin routes and the one-time production sync route.
 *
 * Security invariants verified (final security review remediation):
 *  1. The public archive search endpoint still works unauthenticated (200).
 *  2. Every archive ADMIN endpoint (status / videos / jobs / segments / oauth
 *     status) returns 401 without a verified session.
 *  3. Every archive MUTATION / pipeline / process / OAuth-delete endpoint
 *     returns 401 without a verified session — authorization fails BEFORE the
 *     handler runs, so no paid/destructive work (YouTube quota, OpenAI spend,
 *     yt-dlp/ffmpeg, OAuth teardown) is ever triggered by these tests.
 *  4. Forged X-User-Id / X-User-Role headers do NOT grant access — identity is
 *     taken only from the server-populated session, never client headers.
 *  5. POST /api/admin/prod-sync returns 401 without a verified superAdmin
 *     session (the old X-Migration-Token / SESSION_SECRET path is gone).
 *
 * These assertions only check that access is DENIED, so they never execute the
 * underlying handlers. They intentionally do NOT assert product behaviour of
 * the authorized paths.
 *
 * Requires the API server to be running.
 *
 * Run (from artifacts/api-server/):
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/archive-authz.test.ts
 */

import { describe, it } from "node:test";
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
  headers?: Record<string, string>;
  body?: object;
};

function request(
  opts: ReqOpts,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = opts.body ? JSON.stringify(opts.body) : undefined;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
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
        let data = "";
        res.on("data", (c: string) => {
          data += c;
        });
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode ?? 0, body: data });
          }
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Forged, client-controlled identity headers a real attacker might try. The
// server must ignore these entirely — identity comes only from the session.
const FORGED_HEADERS = {
  "X-User-Id": "demo-superadmin-1",
  "X-User-Role": "superAdmin",
};

// ─── Public route still works ───────────────────────────────────────────────

describe("public archive search stays unauthenticated", () => {
  it("POST /api/youtube-archive/search returns 200 (no auth required)", async () => {
    const res = await request({
      method: "POST",
      path: "/api/youtube-archive/search",
      body: { query: "John 3", maxResults: 5 },
    });
    assert.equal(
      res.status,
      200,
      `public search should be 200, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
    const json = res.body as Record<string, unknown>;
    assert.ok(Array.isArray(json.results), "body.results should be an array");
  });

  it("GET /api/youtube-archive/preached-here returns 400 (reached handler, no auth)", async () => {
    // Missing bookId → the handler returns 400. Crucially it is NOT 401, which
    // proves the route is reachable without authentication.
    const res = await request({ path: "/api/youtube-archive/preached-here" });
    assert.equal(
      res.status,
      400,
      `preached-here without bookId should be 400 (public), got ${res.status}`,
    );
  });

  it("GET /api/youtube-archive/audio/:id returns 404 for a missing file (public)", async () => {
    const res = await request({
      path: "/api/youtube-archive/audio/nonexistent-authz-probe-id",
    });
    assert.equal(
      res.status,
      404,
      `public audio route should reach handler (404 for missing), got ${res.status}`,
    );
  });
});

// ─── Admin read endpoints require auth ────────────────────────────────────────

const ADMIN_READ_ENDPOINTS: ReadonlyArray<{ method: string; path: string }> = [
  { method: "GET", path: "/api/youtube-archive/status" },
  { method: "GET", path: "/api/youtube-archive/videos" },
  { method: "GET", path: "/api/youtube-archive/videos/some-id" },
  { method: "GET", path: "/api/youtube-archive/videos/some-id/segments" },
  { method: "GET", path: "/api/youtube-archive/jobs" },
  { method: "GET", path: "/api/youtube-archive/oauth/status" },
];

describe("archive admin read endpoints require a verified session", () => {
  for (const ep of ADMIN_READ_ENDPOINTS) {
    it(`${ep.method} ${ep.path} → 401 unauthenticated`, async () => {
      const res = await request({ method: ep.method, path: ep.path });
      assert.equal(
        res.status,
        401,
        `expected 401, got ${res.status}: ${JSON.stringify(res.body)}`,
      );
    });

    it(`${ep.method} ${ep.path} → 401 with forged X-User headers`, async () => {
      const res = await request({
        method: ep.method,
        path: ep.path,
        headers: FORGED_HEADERS,
      });
      assert.equal(
        res.status,
        401,
        `forged headers must not authenticate; expected 401, got ${res.status}`,
      );
    });
  }
});

// ─── Admin mutation / pipeline endpoints require auth ─────────────────────────
//
// Authorization must fail BEFORE the handler runs, so none of these trigger a
// job, YouTube quota use, OpenAI spend, audio download, or OAuth teardown.

const ADMIN_MUTATION_ENDPOINTS: ReadonlyArray<{
  method: string;
  path: string;
  body?: object;
}> = [
  { method: "POST", path: "/api/youtube-archive/sync", body: { maxVideos: 1 } },
  { method: "PATCH", path: "/api/youtube-archive/videos/some-id", body: { reviewStatus: "approved" } },
  { method: "POST", path: "/api/youtube-archive/videos/some-id/process" },
  { method: "POST", path: "/api/youtube-archive/videos/some-id/generate-audio" },
  { method: "POST", path: "/api/youtube-archive/pipeline/run" },
  { method: "POST", path: "/api/youtube-archive/pipeline/enrich" },
  { method: "POST", path: "/api/youtube-archive/pipeline/embed" },
  { method: "POST", path: "/api/youtube-archive/pipeline/detect-sermon-starts" },
  { method: "POST", path: "/api/youtube-archive/pipeline/repair-timestamps" },
  { method: "GET", path: "/api/youtube-archive/oauth/start" },
  { method: "DELETE", path: "/api/youtube-archive/oauth" },
];

describe("archive admin mutations require a verified session (fail before handler)", () => {
  for (const ep of ADMIN_MUTATION_ENDPOINTS) {
    it(`${ep.method} ${ep.path} → 401 unauthenticated`, async () => {
      const res = await request({ method: ep.method, path: ep.path, body: ep.body });
      assert.equal(
        res.status,
        401,
        `expected 401, got ${res.status}: ${JSON.stringify(res.body)}`,
      );
    });

    it(`${ep.method} ${ep.path} → 401 with forged X-User headers`, async () => {
      const res = await request({
        method: ep.method,
        path: ep.path,
        headers: FORGED_HEADERS,
        body: ep.body,
      });
      assert.equal(
        res.status,
        401,
        `forged headers must not authenticate; expected 401, got ${res.status}`,
      );
    });
  }
});

// ─── Production sync route ────────────────────────────────────────────────────

describe("POST /api/admin/prod-sync requires a verified superAdmin session", () => {
  it("returns 401 unauthenticated", async () => {
    const res = await request({ method: "POST", path: "/api/admin/prod-sync" });
    assert.equal(
      res.status,
      401,
      `expected 401, got ${res.status}: ${JSON.stringify(res.body)}`,
    );
  });

  it("returns 401 with a forged X-Migration-Token header (legacy path removed)", async () => {
    const res = await request({
      method: "POST",
      path: "/api/admin/prod-sync",
      headers: { "X-Migration-Token": "any-value" },
    });
    assert.equal(
      res.status,
      401,
      `legacy migration-token path must be gone; expected 401, got ${res.status}`,
    );
  });

  it("returns 401 with forged X-User headers", async () => {
    const res = await request({
      method: "POST",
      path: "/api/admin/prod-sync",
      headers: FORGED_HEADERS,
    });
    assert.equal(
      res.status,
      401,
      `forged headers must not authenticate; expected 401, got ${res.status}`,
    );
  });
});
