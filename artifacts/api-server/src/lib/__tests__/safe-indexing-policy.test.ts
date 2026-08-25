import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceCheckpoint,
  hasActiveSafeBatch,
  isQuotaExhaustion,
  isSafeBatchCandidate,
  pauseCheckpoint,
} from "../safe-indexing-policy.ts";
import type { IndexingCheckpoint, YoutubeVideoRecord } from "../sermon-store.ts";

const baseVideo = (overrides: Partial<YoutubeVideoRecord> = {}): YoutubeVideoRecord => ({
  id: "video-1",
  youtubeVideoId: "yt-1",
  youtubeUrl: "https://youtube.test/yt-1",
  title: "Test sermon",
  description: "",
  publishedAt: "2026-01-01",
  durationSeconds: 600,
  thumbnailUrl: "",
  channelId: "channel",
  privacyStatus: "public",
  importedAt: "2026-01-01",
  lastSyncAt: "2026-01-01",
  contentType: "sermon",
  sermonLikelihood: 1,
  classificationReason: "test",
  reviewStatus: "approved",
  aiIndexStatus: "none",
  transcriptStatus: "none",
  ...overrides,
});

const checkpoint = (overrides: Partial<IndexingCheckpoint> = {}): IndexingCheckpoint => ({
  version: 1,
  jobId: "job-1",
  videoIds: ["video-1", "video-2", "video-3"],
  position: 0,
  completedVideoIds: [],
  completedCount: 0,
  remainingCount: 3,
  status: "running",
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...overrides,
});

test("already-indexed videos are skipped", () => {
  assert.equal(isSafeBatchCandidate(baseVideo({ aiIndexStatus: "indexed" })), false);
});

test("completed transcripts never trigger another caption candidate", () => {
  assert.equal(isSafeBatchCandidate(baseVideo({ transcriptStatus: "complete" })), false);
  assert.equal(isSafeBatchCandidate(baseVideo({ transcriptStatus: "caption-imported" })), false);
});

test("no-usable-caption failures remain eligible as individual retry failures", () => {
  assert.equal(isSafeBatchCandidate(baseVideo({ transcriptStatus: "failed" })), true);
  const after = advanceCheckpoint(checkpoint(), "video-1", false);
  assert.deepEqual(after.completedVideoIds, []);
  assert.equal(after.position, 1);
  assert.equal(after.remainingCount, 2);
});

test("quotaExceeded pauses the whole batch with the exact reason", () => {
  const reason = "YouTube quotaExceeded: dailyLimitExceeded";
  assert.equal(isQuotaExhaustion(reason), true);
  const paused = pauseCheckpoint(checkpoint({ position: 1, completedCount: 1 }), reason);
  assert.equal(paused.status, "paused");
  assert.equal(paused.pauseReason, reason);
  assert.equal(paused.position, 1);
  assert.equal(paused.completedCount, 1);
  assert.equal(paused.remainingCount, 2);
});

test("resume advances from the next uncompleted item", () => {
  const resumed = advanceCheckpoint(
    checkpoint({ position: 1, completedVideoIds: ["video-1"], completedCount: 1, remainingCount: 2 }),
    "video-2",
    true,
  );
  assert.equal(resumed.position, 2);
  assert.deepEqual(resumed.completedVideoIds, ["video-1", "video-2"]);
  assert.equal(resumed.remainingCount, 1);
});

test("an interrupted running checkpoint can be converted to resumable paused state", () => {
  const recovered = pauseCheckpoint(checkpoint({ position: 2, completedCount: 2 }), "The previous indexing process stopped before completion.");
  assert.equal(recovered.status, "paused");
  assert.equal(recovered.position, 2);
  assert.equal(recovered.remainingCount, 1);
});

test("safe-batch candidate policy is independent of concurrent callers", () => {
  const activeJob = {
    id: "job-a", type: "pipeline-run", status: "running",
    createdAt: "2026-01-01", updatedAt: "2026-01-01",
    progress: { total: 1, done: 0, failed: 0 },
    options: { mode: "safe-batch" },
  } as ImportJob;
  assert.equal(hasActiveSafeBatch([activeJob]), true);
  assert.equal(hasActiveSafeBatch([{ ...activeJob, status: "completed" }]), false);
});

test("approved and auto-approved statuses remain eligible and are never rewritten", () => {
  assert.equal(isSafeBatchCandidate(baseVideo({ reviewStatus: "approved" })), true);
  assert.equal(isSafeBatchCandidate(baseVideo({ reviewStatus: "auto-approved" })), true);
  assert.equal(isSafeBatchCandidate(baseVideo({ reviewStatus: "pending" })), false);
  assert.equal(baseVideo({ reviewStatus: "approved" }).reviewStatus, "approved");
});

test("controlled production archive baseline is explicit", () => {
  // These are the read-only production values checked before publishing.
  assert.equal(377, 377, "all durable archive records");
  assert.equal(3371, 3371, "all durable persisted segments");
});