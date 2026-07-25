/**
 * Audio Route & Search Shape — Integration Tests
 *
 * Verifies:
 *  1. GET /api/youtube-archive/audio/:id → 404 when file is missing
 *  2. GET /api/youtube-archive/audio/:id with Range header → 206 Partial Content
 *  3. POST /api/youtube-archive/search → valid response shape with required fields
 *
 * Requires the API server to be running.
 *
 * Run:
 *   node --test --experimental-strip-types \
 *     src/routes/__tests__/audio-route.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { writeFile, unlink, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const BASE_URL = process.env.TEST_SERVER_URL ?? "http://localhost:8080";
const parsed = new URL(BASE_URL);

// ─── Minimal valid-ish MP3 fixture (ID3v2 header + silent frame) ─────────────
// These bytes form a 128-byte pseudo-MP3 that the filesystem will serve; the
// audio decoder would reject it but the Range-request logic only needs the file
// to exist and be non-empty.
const FIXTURE_ID = "test-audio-range-fixture-4ba7c2d1";
const FIXTURE_FILENAME = `${FIXTURE_ID}.mp3`;

// ID3v2 header (10 bytes) + padding, total 128 bytes — non-empty is all we need
const FIXTURE_BYTES = Buffer.concat([
  Buffer.from([0x49, 0x44, 0x33, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]), // ID3 header
  Buffer.alloc(118, 0x00), // silence
]);

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

function request(opts: {
  method?: string;
  path: string;
  headers?: Record<string, string>;
  body?: object;
}): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
    const reqHeaders: Record<string, string> = {
      ...(opts.headers ?? {}),
      ...(bodyStr
        ? { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(bodyStr)) }
        : {}),
    };

    const req = http.request(
      {
        hostname: parsed.hostname,
        port: Number(parsed.port) || 80,
        method: opts.method ?? "GET",
        path: opts.path,
        headers: reqHeaders,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string>,
            body: Buffer.concat(chunks).toString(),
          });
        });
      },
    );
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Fixture management ───────────────────────────────────────────────────────

const AUDIO_DIR = join(process.cwd(), "data", "audio");
const FIXTURE_PATH = join(AUDIO_DIR, FIXTURE_FILENAME);

before(async () => {
  // Ensure the audio directory exists then write the fixture file
  if (!existsSync(AUDIO_DIR)) {
    await mkdir(AUDIO_DIR, { recursive: true });
  }
  await writeFile(FIXTURE_PATH, FIXTURE_BYTES);
});

after(async () => {
  // Clean up fixture file regardless of test outcome
  try {
    await unlink(FIXTURE_PATH);
  } catch {
    // already gone
  }
});

// ─── Audio Route Tests ────────────────────────────────────────────────────────

describe("GET /api/youtube-archive/audio/:id", () => {
  it("returns 404 when the audio file does not exist", async () => {
    const res = await request({ path: "/api/youtube-archive/audio/nonexistent-video-id-xyz" });
    assert.equal(res.status, 404, `expected 404, got ${res.status}. body: ${res.body}`);
    const json = JSON.parse(res.body) as Record<string, unknown>;
    assert.ok("error" in json, "body should contain an error field");
  });

  it("returns 200 with full content when no Range header is sent", async () => {
    const res = await request({ path: `/api/youtube-archive/audio/${FIXTURE_ID}` });
    assert.ok(
      res.status === 200 || res.status === 206,
      `expected 200 or 206, got ${res.status}`,
    );
    assert.equal(
      res.headers["content-type"],
      "audio/mpeg",
      "content-type should be audio/mpeg",
    );
    assert.equal(
      res.headers["accept-ranges"],
      "bytes",
      "should advertise byte-range support",
    );
  });

  it("returns 206 Partial Content for a valid Range request", async () => {
    const res = await request({
      path: `/api/youtube-archive/audio/${FIXTURE_ID}`,
      headers: { Range: "bytes=0-63" },
    });
    assert.equal(res.status, 206, `expected 206 Partial Content, got ${res.status}`);
    assert.ok(
      res.headers["content-range"],
      "response should include Content-Range header",
    );
    assert.match(
      res.headers["content-range"],
      /^bytes 0-63\/\d+$/,
      `unexpected Content-Range: ${res.headers["content-range"]}`,
    );
    assert.equal(
      res.headers["content-type"],
      "audio/mpeg",
      "partial response should have audio/mpeg content-type",
    );
    // Body should be exactly 64 bytes (0–63 inclusive)
    assert.equal(
      Buffer.byteLength(res.body, "binary"),
      64,
      "partial response body should be 64 bytes",
    );
  });

  it("returns 206 for a range starting mid-file", async () => {
    const mid = Math.floor(FIXTURE_BYTES.length / 2);
    const res = await request({
      path: `/api/youtube-archive/audio/${FIXTURE_ID}`,
      headers: { Range: `bytes=${mid}-${FIXTURE_BYTES.length - 1}` },
    });
    assert.equal(res.status, 206, `expected 206, got ${res.status}`);
    const contentRange = res.headers["content-range"];
    assert.ok(contentRange, "Content-Range header required");
    assert.ok(
      contentRange.startsWith(`bytes ${mid}-`),
      `Content-Range should start at ${mid}, got: ${contentRange}`,
    );
  });

  it("Content-Range header includes total file size", async () => {
    const res = await request({
      path: `/api/youtube-archive/audio/${FIXTURE_ID}`,
      headers: { Range: "bytes=0-9" },
    });
    assert.equal(res.status, 206);
    const contentRange = res.headers["content-range"];
    assert.match(
      contentRange,
      /bytes 0-9\/128$/,
      `expected total size 128 in Content-Range, got: ${contentRange}`,
    );
  });
});

// ─── Search Shape Tests ───────────────────────────────────────────────────────

describe("POST /api/youtube-archive/search", () => {
  it("returns 200 with a results array for any query", async () => {
    const res = await request({
      method: "POST",
      path: "/api/youtube-archive/search",
      body: { query: "John 3", maxResults: 5 },
    });
    assert.equal(res.status, 200, `expected 200, got ${res.status}. body: ${res.body}`);
    const json = JSON.parse(res.body) as Record<string, unknown>;
    assert.ok(Array.isArray(json.results), "body.results should be an array");
  });

  it("each result has the required shape fields", async () => {
    const res = await request({
      method: "POST",
      path: "/api/youtube-archive/search",
      body: { query: "John 3:16 God so loved the world", maxResults: 10 },
    });
    const json = JSON.parse(res.body) as { results: Record<string, unknown>[] };
    if (json.results.length === 0) return; // no data seeded; shape can't be verified

    const REQUIRED_FIELDS = [
      "sermonId", "segmentId", "title", "speaker", "sermonDate",
      "scriptureReference", "youtubeUrl", "timestampedUrl",
      "startTimeSeconds", "endTimeSeconds", "timestampLabel",
      "transcriptEvidence", "relevanceScore",
      "absoluteStartSeconds", "relativeStartSeconds",
    ];
    for (const result of json.results) {
      for (const field of REQUIRED_FIELDS) {
        assert.ok(field in result, `result missing required field: ${field}`);
      }
      // relativeTimestampLabel should be present when audioUrl is present
      if ("audioUrl" in result && result.audioUrl) {
        assert.ok(
          "relativeTimestampLabel" in result,
          "result with audioUrl should include relativeTimestampLabel",
        );
      }
      // Numeric timestamp fields should be non-negative
      assert.ok(
        Number(result.absoluteStartSeconds) >= 0,
        "absoluteStartSeconds must be ≥ 0",
      );
      assert.ok(
        Number(result.relativeStartSeconds) >= 0,
        "relativeStartSeconds must be ≥ 0",
      );
      // relevanceScore must be a positive number
      assert.ok(Number(result.relevanceScore) > 0, "relevanceScore should be > 0");
    }
  });

  it("returns an empty array for a query that matches nothing", async () => {
    const res = await request({
      method: "POST",
      path: "/api/youtube-archive/search",
      body: { query: "xyzzy-nonexistent-term-8472qwe", maxResults: 5 },
    });
    assert.equal(res.status, 200);
    const json = JSON.parse(res.body) as { results: unknown[] };
    assert.ok(Array.isArray(json.results), "should return an array even when nothing matches");
    assert.equal(json.results.length, 0, "no results expected for nonsense query");
  });

  it("never returns more than 5 results (route cap)", async () => {
    // The search route hardcodes maxResults: 5 — verify it never exceeds that.
    const res = await request({
      method: "POST",
      path: "/api/youtube-archive/search",
      body: { query: "sermon" },
    });
    const json = JSON.parse(res.body) as { results: unknown[] };
    assert.ok(
      json.results.length <= 5,
      `should return at most 5 results, got ${json.results.length}`,
    );
  });

  it("handles a missing query gracefully (returns 400 or empty)", async () => {
    const res = await request({
      method: "POST",
      path: "/api/youtube-archive/search",
      body: {},
    });
    // Either a validation error (400) or empty results (200) is acceptable
    assert.ok(
      res.status === 400 || res.status === 200,
      `expected 400 or 200, got ${res.status}`,
    );
  });
});

// ─── Preached Here Shape Tests ────────────────────────────────────────────────

describe("GET /api/youtube-archive/preached-here", () => {
  it("returns 400 when bookId is missing", async () => {
    const res = await request({ path: "/api/youtube-archive/preached-here" });
    assert.equal(res.status, 400, `expected 400, got ${res.status}`);
    const json = JSON.parse(res.body) as Record<string, unknown>;
    assert.ok("error" in json);
  });

  it("returns 200 with a sermons array for a known book", async () => {
    const res = await request({
      path: "/api/youtube-archive/preached-here?bookId=john&chapter=3",
    });
    assert.equal(res.status, 200, `expected 200, got ${res.status}. body: ${res.body}`);
    const json = JSON.parse(res.body) as { sermons: unknown[] };
    assert.ok(Array.isArray(json.sermons), "body.sermons should be an array");
  });

  it("sermon results include audioUrl and relativeTimestampLabel when audio is ready", async () => {
    const res = await request({
      path: "/api/youtube-archive/preached-here?bookId=john&chapter=3",
    });
    const json = JSON.parse(res.body) as { sermons: Record<string, unknown>[] };
    for (const sermon of json.sermons) {
      // If audioUrl is present, relativeTimestampLabel must also be present
      if (sermon.audioUrl) {
        assert.ok(
          "relativeTimestampLabel" in sermon,
          "sermon with audioUrl must include relativeTimestampLabel",
        );
      }
      // relativeStartSeconds must always be present and non-negative
      assert.ok("relativeStartSeconds" in sermon, "relativeStartSeconds is required");
      assert.ok(Number(sermon.relativeStartSeconds) >= 0, "relativeStartSeconds must be ≥ 0");
    }
  });
});
