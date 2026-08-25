import type { IndexingCheckpoint } from "./sermon-store.js";
import type { YoutubeVideoRecord } from "./sermon-store.js";
import type { ImportJob } from "./sermon-store.js";

export function isSafeBatchCandidate(video: YoutubeVideoRecord): boolean {
  return (
    (video.reviewStatus === "approved" || video.reviewStatus === "auto-approved") &&
    video.aiIndexStatus !== "indexed" &&
    (video.transcriptStatus === "none" || video.transcriptStatus === "failed")
  );
}

export function isQuotaExhaustion(error: string): boolean {
  return /quota|daily.?limit|rate.?limit|too many requests|403.*youtube|exceeded/i.test(error);
}

export function hasActiveSafeBatch(jobs: ImportJob[]): boolean {
  return jobs.some(
    job =>
      (job.status === "running" || job.status === "queued") &&
      job.options?.mode === "safe-batch",
  );
}

export function advanceCheckpoint(
  checkpoint: IndexingCheckpoint,
  videoId: string,
  succeeded: boolean,
): IndexingCheckpoint {
  return {
    ...checkpoint,
    position: checkpoint.position + 1,
    completedVideoIds: succeeded
      ? [...checkpoint.completedVideoIds, videoId]
      : checkpoint.completedVideoIds,
    completedCount: checkpoint.completedCount + (succeeded ? 1 : 0),
    remainingCount: Math.max(0, checkpoint.videoIds.length - checkpoint.position - 1),
    updatedAt: new Date().toISOString(),
  };
}

export function pauseCheckpoint(
  checkpoint: IndexingCheckpoint,
  reason: string,
): IndexingCheckpoint {
  return {
    ...checkpoint,
    status: "paused",
    pauseReason: reason,
    remainingCount: Math.max(0, checkpoint.videoIds.length - checkpoint.position),
    updatedAt: new Date().toISOString(),
  };
}