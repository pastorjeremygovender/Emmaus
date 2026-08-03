/**
 * sermon-retrieval.test.ts — Integration tests for canonical sermon surfacing.
 *
 * Verifies that:
 *   1. A published canonical sermon with known scripture_book_ids / scripture_chapters
 *      is returned by retrieveSermon() as source="canonical" with the correct ID.
 *   2. The youtube_video_id of that sermon is present in the suppression set so any
 *      archive segment for the same video would be filtered.
 *   3. GET /api/youtube-archive/preached-here?bookId=john&chapter=3 — exercised via
 *      an actual HTTP call to a minimal in-process Express server — returns the
 *      canonical sermon first and does NOT include its video ID in the archive results.
 *
 * Fixture isolation: each run generates a unique TEST_VIDEO_ID so parallel runs
 * cannot collide. The fixture sermon is deleted in the after() hook regardless
 * of test outcome.
 *
 * Requires DATABASE_URL (runs against the live dev database).
 *
 * Run:
 *   pnpm --filter @workspace/api-server run test:integrity
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { pool } from "@workspace/db";

import {
  createSermon,
  publishSermon,
  deleteSermon,
  listPublishedSermons,
  getPublishedYoutubeVideoIds,
} from "../canonical-sermon-store.js";

import { retrieveSermon } from "../../emmaus/sermon-retrieval.js";

// Lazy-import Express + the youtube-archive router inside before() so that
// the router's module-level side-effects (sermon-store init, etc.) only fire
// once the DB is ready.
let testServer: http.Server;
let testBaseUrl: string;

// ─── Fixture ─────────────────────────────────────────────────────────────────

/** Unique per-run to prevent parallel CI collisions. */
const TEST_VIDEO_ID = `test-int-john3-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

let testSermonId = "";

// ─── Setup / teardown ─────────────────────────────────────────────────────────

before(async () => {
  // 1. Create and publish the canonical fixture sermon
  const sermon = await createSermon({
    legacyJsonId: null,
    title: "Test: Born Again — Integration Fixture",
    speaker: "Test Pastor",
    sermonDate: "2024-09-15",
    series: "Test Series",
    scriptureReference: "John 3:1–21",
    scriptureBookIds: ["john"],
    scriptureChapters: [3],
    youtubeUrl: `https://www.youtube.com/watch?v=${TEST_VIDEO_ID}`,
    youtubeVideoId: TEST_VIDEO_ID,
    audioPath: "",
    notes: "",
    transcript: "",
    transcriptStatus: "none",
    summary: "A test sermon about being born again — integration fixture only.",
    themes: ["salvation", "rebirth"],
    sections: [],
    keywords: ["nicodemus", "john 3:16"],
    mainTheme: "new birth",
    processingStage: "idle",
    processingError: "",
    status: "Draft",
  });

  testSermonId = sermon.id;
  await publishSermon(testSermonId);

  // 2. Spin up a minimal in-process Express app that only mounts the
  //    youtube-archive router. This is enough to exercise the preached-here
  //    route without pulling in startup migrations or other app-level concerns.
  const { default: express } = await import("express");
  const { default: youtubeArchiveRouter } = await import("../../routes/youtube-archive.js");

  const app = express();
  app.use(express.json());
  app.use("/api", youtubeArchiveRouter);

  testServer = http.createServer(app);
  await new Promise<void>((resolve) => testServer.listen(0, "127.0.0.1", resolve));
  const addr = testServer.address() as { port: number };
  testBaseUrl = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  // Close the test HTTP server
  await new Promise<void>((resolve, reject) =>
    testServer.close((err) => (err ? reject(err) : resolve()))
  );

  // Delete the fixture sermon (best-effort — never blocks the test runner)
  if (testSermonId) {
    await deleteSermon(testSermonId).catch(() => {});
  }

  await pool.end().catch(() => {});
});

// ─── Test group 1: Ask Emmaus — retrieveSermon ───────────────────────────────

describe("retrieveSermon — canonical DB sermon priority", () => {
  it("returns source=canonical for a published John 3 sermon", async () => {
    const result = await retrieveSermon("john 3", "john", 3);

    assert.ok(result !== null, "Expected a non-null sermon result");
    assert.equal(
      result.source,
      "canonical",
      `Expected source='canonical', got '${result.source}'. ` +
        "retrieveSermon must prefer the canonical DB over archive and registry.",
    );
  });

  it("returns the correct sermon ID for the published John 3 canonical sermon", async () => {
    const result = await retrieveSermon("john 3", "john", 3);

    assert.ok(result !== null, "Expected a non-null sermon result");
    assert.equal(
      result.sermonId,
      testSermonId,
      `Expected sermonId='${testSermonId}', got '${result.sermonId}'. ` +
        "retrieveSermon must return the published canonical sermon's UUID.",
    );
  });

  it("does not return source=archive when a matching canonical sermon exists", async () => {
    const result = await retrieveSermon("john 3 nicodemus born again", "john", 3);

    assert.ok(result !== null, "Expected a non-null sermon result");
    assert.notEqual(
      result.source,
      "archive",
      "retrieveSermon must not return an archive result when a canonical sermon matches — " +
        "canonical has priority 1 and archive is suppressed for the same video.",
    );
  });
});

// ─── Test group 2: Archive suppression mechanism ─────────────────────────────

describe("Archive suppression — youtube_video_id deduplication", () => {
  it("getPublishedYoutubeVideoIds includes the published sermon's youtube_video_id", async () => {
    const ids = await getPublishedYoutubeVideoIds();

    assert.ok(
      ids.has(TEST_VIDEO_ID),
      `Expected getPublishedYoutubeVideoIds to contain '${TEST_VIDEO_ID}', ` +
        `but it returned: [${[...ids].slice(0, 10).join(", ")}…]. ` +
        "This set is the suppression key used to prevent archive duplicates.",
    );
  });

  it("an archive result sharing the canonical sermon's video_id is filtered by the suppression set", async () => {
    const suppressedIds = await getPublishedYoutubeVideoIds();

    // Simulate an archive result whose sermonId equals the canonical youtube_video_id
    const mockArchiveResult = { sermonId: TEST_VIDEO_ID };
    const wouldBeShown = !suppressedIds.has(mockArchiveResult.sermonId);

    assert.equal(
      wouldBeShown,
      false,
      "An archive result whose sermonId matches a published canonical youtube_video_id " +
        "must be filtered. The suppression set did not contain the expected video ID.",
    );
  });
});

// ─── Test group 3: Preached Here — HTTP endpoint ─────────────────────────────

describe("GET /api/youtube-archive/preached-here — canonical-first ordering (HTTP)", () => {
  it("returns HTTP 200 with a results array for bookId=john&chapter=3", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/youtube-archive/preached-here?bookId=john&chapter=3`,
    );

    assert.equal(res.status, 200, `Expected HTTP 200, got ${res.status}`);

    const body = (await res.json()) as { chapterSermons?: unknown[] };
    assert.ok(
      Array.isArray(body.chapterSermons),
      "Response must include a chapterSermons array",
    );
  });

  it("canonical sermon appears first in chapterSermons", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/youtube-archive/preached-here?bookId=john&chapter=3`,
    );
    const body = (await res.json()) as {
      chapterSermons: Array<{ sermonId: string; source?: string }>;
    };

    assert.ok(
      body.chapterSermons.length > 0,
      "chapterSermons must not be empty when a canonical John 3 sermon is published.",
    );

    const first = body.chapterSermons[0];
    assert.equal(
      first.source,
      "canonical",
      `First result must have source='canonical', got '${first.source}'. ` +
        "Canonical sermons must be prepended before archive results in preached-here.",
    );

    assert.equal(
      first.sermonId,
      testSermonId,
      `First sermonId must be '${testSermonId}' (the published canonical fixture), ` +
        `got '${first.sermonId}'.`,
    );
  });

  it("the canonical sermon's video_id does not appear in the archive portion of chapterSermons", async () => {
    const res = await fetch(
      `${testBaseUrl}/api/youtube-archive/preached-here?bookId=john&chapter=3`,
    );
    const body = (await res.json()) as {
      chapterSermons: Array<{ sermonId: string; source?: string }>;
    };

    // Canonical results have source="canonical"; archive results have source="archive"
    // (or no source field for legacy records). Either way, no result other than the
    // canonical entry should carry the test video_id.
    const archiveResults = body.chapterSermons.filter((s) => s.source !== "canonical");
    const archiveIds = archiveResults.map((s) => s.sermonId);

    assert.ok(
      !archiveIds.includes(TEST_VIDEO_ID),
      `Archive portion of chapterSermons must not include '${TEST_VIDEO_ID}' — ` +
        "the canonical sermon's video_id must be suppressed from the archive results. " +
        `Archive sermonIds found: [${archiveIds.slice(0, 5).join(", ")}]`,
    );
  });
});
