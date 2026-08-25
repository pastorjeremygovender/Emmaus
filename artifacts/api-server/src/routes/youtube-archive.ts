/**
 * YouTube Archive Routes
 *
 * POST   /api/youtube-archive/sync              — discover & import videos from channel
 * GET    /api/youtube-archive/status            — connection + stats
 * GET    /api/youtube-archive/videos            — list all video records
 * GET    /api/youtube-archive/videos/:id        — single video detail
 * PATCH  /api/youtube-archive/videos/:id        — update (approve, reject, edit)
 * POST   /api/youtube-archive/videos/:id/process — import captions + segment + enrich
 * GET    /api/youtube-archive/videos/:id/segments — segments for video
 * GET    /api/youtube-archive/jobs              — list recent import jobs
 * GET    /api/youtube-archive/oauth/status      — OAuth connection status
 * GET    /api/youtube-archive/oauth/start       — begin OAuth flow (redirect)
 * GET    /api/youtube-archive/oauth/callback    — OAuth callback (exchange code)
 * DELETE /api/youtube-archive/oauth             — disconnect OAuth
 * POST   /api/youtube-archive/search            — search sermon segments
 */

import { Router, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import {
  getAllVideos, getVideoById, upsertVideo, updateVideo,
  getAllSegments, getSegmentsForVideo, replaceSegments, updateSegment,
  getAllJobs, createJob, updateJob,
  getIndexingCheckpoint, saveIndexingCheckpoint, clearIndexingCheckpoint,
  type IndexingCheckpoint, type ImportJob,
  getArchiveStats, type YoutubeVideoRecord,
} from "../lib/sermon-store.js";
import { isQuotaExhaustion, isSafeBatchCandidate, advanceCheckpoint, pauseCheckpoint } from "../lib/safe-indexing-policy.js";
import { readArchiveState, writeArchiveState } from "../lib/archive-state-store.js";
import {
  getYoutubeConfig, getChannelInfo, getPlaylistVideoIds,
  getVideoMetadata, listCaptionTracks, downloadCaptionTrack,
  buildOAuthUrl, exchangeCodeForTokens, getOAuthConfig,
} from "../lib/youtube-client.js";
import {
  storeRefreshToken, hasOAuthCredentials, getValidAccessToken,
  clearOAuthCredentials, getOAuthStatus,
  addPendingState, verifyAndConsumePendingState,
} from "../lib/oauth-store.js";
import { classifyVideo } from "../lib/sermon-classifier.js";
import { requireAdmin } from "../emmaus/auth.js";
import { processCaption } from "../lib/transcript-segmenter.js";
import { enrichSegment, enrichSermon } from "../lib/sermon-enricher.js";
import { invalidateIndex, searchByScripture } from "../lib/sermon-search.js";
import { listPublishedSermons } from "../lib/canonical-sermon-store.js";
import { detectSermonStartFromSegments, getFinalSermonStart } from "../lib/sermon-start-detector.js";
import {
  generateSermonAudio, getAudioFilePath, getAudioFileUrl, AUDIO_DIR,
} from "../lib/audio-pipeline.js";
import { logger } from "../lib/logger.js";
import { existsSync, createReadStream } from "node:fs";
import { readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";

const router = Router();

// ─── Authorization allowlist ────────────────────────────────────────────────
//
// Only a small set of member/public routes may be reached unauthenticated.
// Every other youtube-archive route — status, video/job/segment listings,
// OAuth management, and every mutation/pipeline/process endpoint — requires a
// verified DB role of admin or superAdmin (req.user.role is populated from the
// user's profile by authMiddleware, never from client-supplied headers).
//
// The allowlist is matched by method + exact path so that a new route added
// later is admin-gated by default (fails closed).
const PUBLIC_ALLOWLIST: ReadonlyArray<{ method: string; path: string }> = [
  { method: "POST", path: "/youtube-archive/search" },
  { method: "GET", path: "/youtube-archive/preached-here" },
  // The callback is protected by the one-time state created by the
  // admin-authenticated /oauth/start route. The browser may return from
  // Google without the original session cookie after a hostname transition.
  { method: "GET", path: "/youtube-archive/oauth/callback" },
  // Audio streaming is matched by prefix below (path carries the :id param).
];

function isPublicArchiveRoute(method: string, path: string): boolean {
  // Preflight requests are always allowed (no state change, no data access).
  if (method === "OPTIONS") return true;
  // GET /youtube-archive/audio/:id — public audio streaming.
  if (method === "GET" && /^\/youtube-archive\/audio\/[^/]+\/?$/.test(path)) {
    return true;
  }
  return PUBLIC_ALLOWLIST.some(
    (r) => r.method === method && r.path === path.replace(/\/$/, ""),
  );
}

router.use((req: Request, res: Response, next) => {
  // Only guard youtube-archive routes; leave anything else this router might
  // carry untouched (defensive — every route here is /youtube-archive/*).
  if (!req.path.startsWith("/youtube-archive/")) {
    next();
    return;
  }
  if (isPublicArchiveRoute(req.method, req.path)) {
    next();
    return;
  }
  // requireAdmin sends 401 (unauthenticated) or 403 (wrong role) itself.
  if (!requireAdmin(req, res)) return;
  next();
});

// OAuth state is now persisted to disk via oauth-store so it survives
// hot-reloads and process restarts (see addPendingState / verifyAndConsumePendingState).

// ─── Status ───────────────────────────────────────────────────────────────────

router.get("/youtube-archive/status", async (_req: Request, res: Response) => {
  const ytConfig = getYoutubeConfig();
  const oauthStatus = await getOAuthStatus();
  const stats = await getArchiveStats();
  const jobs = await getAllJobs();
  const activeJob = jobs.filter((j) => j.status === "running" || j.status === "queued").pop() ?? null;

  // Try channel info if configured
  let channelInfo: { title: string; videoCount: number } | null = null;
  if (ytConfig.configured) {
    try {
      const info = await getChannelInfo(ytConfig.channelId!);
      channelInfo = { title: info.title, videoCount: info.videoCount };
    } catch {
      channelInfo = null;
    }
  }

  res.json({
    youtube: {
      configured: ytConfig.configured,
      channelId: ytConfig.channelId,
      channelInfo,
    },
    oauth: oauthStatus,
    stats,
    activeJob,
  });
});

// ─── Sync (channel discovery) ─────────────────────────────────────────────────

router.post("/youtube-archive/sync", async (req: Request, res: Response) => {
  const ytConfig = getYoutubeConfig();
  if (!ytConfig.configured) {
    res.status(400).json({ error: "YOUTUBE_API_KEY and YOUTUBE_CHANNEL_ID must be configured" });
    return;
  }

  const maxVideos = Math.min(parseInt(String(req.body?.maxVideos ?? "500")), 2000);

  // Create job record
  const job = await createJob("sync", { maxVideos });
  res.json({ jobId: job.id, message: "Sync started" });

  // Run async (non-blocking)
  setImmediate(async () => {
    try {
      await updateJob(job.id, { status: "running" });

      // 1. Get uploads playlist
      const channelInfo = await getChannelInfo(ytConfig.channelId!);
      const videoRefs = await getPlaylistVideoIds(channelInfo.uploadsPlaylistId, maxVideos);

      await updateJob(job.id, {
        progress: { total: videoRefs.length, done: 0, failed: 0 },
      });

      // 2. Fetch metadata in batches of 50
      const BATCH = 50;
      let done = 0;
      let failed = 0;
      const now = new Date().toISOString();

      for (let i = 0; i < videoRefs.length; i += BATCH) {
        const batch = videoRefs.slice(i, i + BATCH);
        const ids = batch.map((r) => r.videoId);

        try {
          const metadataList = await getVideoMetadata(ids);

          for (const meta of metadataList) {
            try {
              const cls = classifyVideo(meta.title, meta.description, meta.durationSeconds);
              // New videos are ALWAYS persisted as pending. Approval is an
              // explicit, manual admin action (PATCH reviewStatus) — sync must
              // never auto-approve, regardless of classification confidence.
              const reviewStatus = "pending" as const;

              await upsertVideo({
                youtubeVideoId: meta.videoId,
                youtubeUrl: meta.youtubeUrl,
                title: meta.title,
                description: meta.description,
                publishedAt: meta.publishedAt,
                durationSeconds: meta.durationSeconds,
                thumbnailUrl: meta.thumbnailUrl,
                channelId: meta.channelId,
                privacyStatus: meta.privacyStatus,
                lastSyncAt: now,
                contentType: cls.contentType,
                sermonLikelihood: cls.sermonLikelihood,
                classificationReason: cls.reason,
                reviewStatus,
                aiIndexStatus: "none",
                transcriptStatus: "none",
              });
              done++;
            } catch (err) {
              logger.warn({ videoId: meta.videoId, err: String(err) }, "Failed to upsert video");
              failed++;
            }
          }
        } catch (err) {
          logger.warn({ batch: ids, err: String(err) }, "Metadata batch failed");
          failed += batch.length;
        }

        await updateJob(job.id, { progress: { total: videoRefs.length, done, failed } });
        // Quota courtesy pause between batches
        await new Promise((r) => setTimeout(r, 200));
      }

      await updateJob(job.id, {
        status: "completed",
        progress: { total: videoRefs.length, done, failed },
      });

      invalidateIndex();
      logger.info({ done, failed, total: videoRefs.length }, "Sync job completed");

    } catch (err) {
      await updateJob(job.id, { status: "failed", error: String(err) });
      logger.error({ err: String(err) }, "Sync job failed");
    }
  });
});

// ─── Video list ───────────────────────────────────────────────────────────────

router.get("/youtube-archive/videos", async (req: Request, res: Response) => {
  const videos = await getAllVideos();
  const { contentType, reviewStatus, transcriptStatus } = req.query as Record<string, string | undefined>;

  let filtered = videos;
  if (contentType) filtered = filtered.filter((v) => v.contentType === contentType);
  if (reviewStatus) filtered = filtered.filter((v) => v.reviewStatus === reviewStatus);
  if (transcriptStatus) filtered = filtered.filter((v) => v.transcriptStatus === transcriptStatus);

  // Newest first
  filtered.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  // Omit full transcript text from list (bandwidth)
  const slim = filtered.map(({ transcriptText: _, transcriptCleanedText: __, ...rest }) => rest);
  res.json({ videos: slim, total: filtered.length });
});

// ─── Video detail ─────────────────────────────────────────────────────────────

router.get("/youtube-archive/videos/:id", async (req: Request, res: Response) => {
  const video = await getVideoById(String(req.params.id));
  if (!video) { res.status(404).json({ error: "Not found" }); return; }
  res.json(video);
});

// ─── Video update ─────────────────────────────────────────────────────────────

router.patch("/youtube-archive/videos/:id", async (req: Request, res: Response) => {
  const video = await getVideoById(String(req.params.id));
  if (!video) { res.status(404).json({ error: "Not found" }); return; }

  const allowed = [
    "reviewStatus", "speaker", "sermonDate", "series",
    "scriptureReferences", "scriptureBookIds", "scriptureChapters",
    "topics", "keywords", "summary", "contentType",
    "manualSermonStartSeconds", "sermonStartVerified",
    "manualSermonEndSeconds",
  ] as const;
  type AllowedKey = typeof allowed[number];

  const patch: Partial<YoutubeVideoRecord> = {};
  for (const key of allowed) {
    if (key in req.body) {
      (patch as Record<string, unknown>)[key] = (req.body as Record<AllowedKey, unknown>)[key];
    }
  }

  // If manualSermonStartSeconds changed, recompute and persist finalSermonStartSeconds
  // so the generate-audio route always uses the correct trim point.
  if ("manualSermonStartSeconds" in patch) {
    const manual = patch.manualSermonStartSeconds as number | undefined;
    const existing = video.detectedSermonStartSeconds;
    const final = getFinalSermonStart(manual, existing);
    (patch as Record<string, unknown>)["finalSermonStartSeconds"] = final;
  }

  const updated = await updateVideo(String(req.params.id), patch);
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }

  // Rebuild search index if approval status changed
  if ("reviewStatus" in patch) invalidateIndex();

  res.json(updated);
});

// ─── Process video (caption import + segment + enrich) ────────────────────────

router.post("/youtube-archive/videos/:id/process", async (req: Request, res: Response) => {
  const video = await getVideoById(String(req.params.id));
  if (!video) { res.status(404).json({ error: "Not found" }); return; }

  const job = await createJob("process-video", {}, video.id);
  res.json({ jobId: job.id, message: "Processing started" });

  setImmediate(async () => {
    try {
      await updateJob(job.id, { status: "running" });
      const result = await processVideoInternal(video.id);
      invalidateIndex();
      await updateJob(job.id, {
        status: result.success ? "completed" : "failed",
        error: result.error,
        progress: { total: result.segmentCount, done: result.segmentCount, failed: result.success ? 0 : 1 },
      });
    } catch (err) {
      await updateJob(job.id, { status: "failed", error: String(err) });
      logger.error({ videoId: video.id, err: String(err) }, "Video processing failed");
    }
  });
});

// ─── Internal processing helpers ──────────────────────────────────────────────

async function enrichSegments(
  segments: Array<{ cleanedText: string }>,
  opts: { concurrency: number },
): Promise<Array<{ themes: string[]; scriptureRefs: string[]; keywords: string[]; summary: string }>> {
  const { enrichSegment } = await import("../lib/sermon-enricher.js");
  const { concurrency } = opts;
  const results = new Array(segments.length).fill(null);
  for (let i = 0; i < segments.length; i += concurrency) {
    const batch = segments.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((s) => enrichSegment(s.cleanedText)));
    for (let j = 0; j < batchResults.length; j++) results[i + j] = batchResults[j];
    if (i + concurrency < segments.length) await new Promise((r) => setTimeout(r, 300));
  }
  return results;
}

/**
 * Core video processing logic — shared by the single-video route and the
 * bulk pipeline. Downloads captions, segments, enriches, and persists.
 * Returns { success, segments } — never throws.
 */
async function processVideoInternal(
  videoId: string,
): Promise<{ success: boolean; segmentCount: number; error?: string }> {
  try {
    const video = await getVideoById(videoId);
    if (!video) return { success: false, segmentCount: 0, error: "Video not found" };

    await updateVideo(videoId, { transcriptStatus: "pending" });

    // ── Step 1: Import captions ──────────────────────────────────────────────
    let captionContent: string | null = null;
    let captionKind = "unknown";
    let captionFailure: string | null = null;

    const accessToken = await getValidAccessToken();

    if (accessToken) {
      try {
        const tracks = await listCaptionTracks(video.youtubeVideoId, accessToken);
        const manual = tracks.find((t) => t.language.startsWith("en") && t.trackKind === "standard" && !t.isDraft);
        const asr = tracks.find((t) => t.language.startsWith("en") && t.trackKind === "asr");
        const chosen = manual ?? asr;

        if (chosen) {
          captionContent = await downloadCaptionTrack(chosen.id, accessToken);
          captionKind = chosen.trackKind;
          await updateVideo(videoId, {
            captionTrackId: chosen.id,
            captionTrackKind: captionKind,
          });
        }
      } catch (err) {
        captionFailure = String(err);
        logger.warn({ videoId: video.youtubeVideoId, err: String(err) }, "Caption download failed");
      }
    }

    if (!captionContent) {
      const reason = captionFailure && isQuotaExhaustion(captionFailure)
        ? `YouTube quota exhausted: ${captionFailure}`
        : accessToken
        ? "No usable caption track found"
        : "OAuth not connected — cannot access captions";
      await updateVideo(videoId, {
        transcriptStatus: accessToken ? "whisper-pending" : "none",
        transcriptError: reason,
      });
      return { success: false, segmentCount: 0, error: reason };
    }

    // ── Step 2: Parse + segment ──────────────────────────────────────────────
    const { segments: rawSegments, fullText, fullCleanedText } = processCaption(captionContent);

    if (rawSegments.length === 0) {
      await updateVideo(videoId, {
        transcriptStatus: "failed",
        transcriptError: "Caption parsed but no segments produced",
      });
      return { success: false, segmentCount: 0, error: "No segments produced" };
    }

    // ── Step 2b: Detect sermon start ─────────────────────────────────────────
    const freshVideo = await getVideoById(videoId);
    const startResult = detectSermonStartFromSegments(rawSegments, video.durationSeconds);
    const finalSermonStartSeconds = getFinalSermonStart(
      freshVideo?.manualSermonStartSeconds,
      startResult?.detectedStartSeconds,
    );

    await updateVideo(videoId, {
      transcriptText: fullText,
      transcriptCleanedText: fullCleanedText,
      transcriptStatus: "caption-imported",
      transcriptSource: captionKind === "standard" ? "youtube-manual" : "youtube-auto",
      detectedSermonStartSeconds: startResult?.detectedStartSeconds,
      sermonStartConfidence: startResult?.confidence,
      sermonStartMethod: startResult?.method,
      finalSermonStartSeconds,
    });

    // ── Step 3: Enrich segments ──────────────────────────────────────────────
    const enrichments = process.env.OPENAI_API_KEY
      ? await enrichSegments(rawSegments, { concurrency: 3 })
      : rawSegments.map(() => ({ themes: [], scriptureRefs: [], keywords: [], summary: "" }));

    // ── Step 4: Store segments with dual timestamp model ─────────────────────
    const segmentData = rawSegments.map((s, i) => {
      const absoluteStart = s.startTimeSeconds;
      const absoluteEnd = s.endTimeSeconds;
      const relativeStart = Math.max(0, absoluteStart - finalSermonStartSeconds);
      const relativeEnd = Math.max(0, absoluteEnd - finalSermonStartSeconds);
      const isSermonContent = absoluteStart >= finalSermonStartSeconds;
      return {
        videoId,
        youtubeVideoId: video.youtubeVideoId,
        sequenceNumber: s.sequenceNumber,
        startTimeSeconds: absoluteStart,
        endTimeSeconds: absoluteEnd,
        absoluteStartSeconds: absoluteStart,
        absoluteEndSeconds: absoluteEnd,
        relativeStartSeconds: relativeStart,
        relativeEndSeconds: relativeEnd,
        isSermonContent,
        transcriptTimingBasis: "absolute_video" as const,
        timestampsRepaired: false,
        originalText: s.originalText,
        cleanedText: s.cleanedText,
        wordCount: s.wordCount,
        themes: enrichments[i]?.themes ?? [],
        scriptureRefs: enrichments[i]?.scriptureRefs ?? [],
        keywords: enrichments[i]?.keywords ?? [],
        summary: enrichments[i]?.summary ?? "",
        aiIndexStatus: "indexed" as const,
      };
    });

    await replaceSegments(videoId, segmentData);

    // ── Step 5: Sermon-level enrichment ─────────────────────────────────────
    let sermonEnrichment = {
      aiThemes: [] as string[],
      aiScriptureRefs: [] as string[],
      aiKeywords: [] as string[],
      aiSummary: "",
    };
    if (process.env.OPENAI_API_KEY && fullCleanedText) {
      try {
        sermonEnrichment = await enrichSermon(fullCleanedText);
      } catch {
        // Non-fatal
      }
    }

    await updateVideo(videoId, {
      transcriptStatus: "complete",
      aiIndexStatus: "indexed",
      ...sermonEnrichment,
    });

    logger.info(
      { videoId, segments: rawSegments.length, captionKind },
      "processVideoInternal complete"
    );

    return { success: true, segmentCount: rawSegments.length };

  } catch (err) {
    const msg = String(err);
    await updateVideo(videoId, { transcriptStatus: "failed", transcriptError: msg }).catch(() => {});
    logger.warn({ videoId, err: msg }, "processVideoInternal failed");
    return { success: false, segmentCount: 0, error: msg };
  }
}

// ─── Bulk pipeline (process approved only) ─────────────────────────────────────

async function startSafeBatch(res: Response, resume: boolean): Promise<void> {
  const existing = await getIndexingCheckpoint();
  const activeJob = (await getAllJobs()).find(job =>
    (job.status === "running" || job.status === "queued") &&
    job.options?.mode === "safe-batch"
  );
  if (activeJob) {
    res.status(409).json({ error: "A safe indexing batch is already running.", jobId: activeJob.id });
    return;
  }
  if (resume && !existing) {
    res.status(404).json({ error: "No resumable checkpoint exists. Start Safe Indexing Batch." });
    return;
  }
  if (!resume && existing?.status === "paused") {
    res.status(409).json({ error: "A paused indexing checkpoint exists. Resume it before starting another batch." });
    return;
  }

  const videos = await getAllVideos();
  const videoIds = resume
    ? existing!.videoIds
    : videos.filter(isSafeBatchCandidate).map(v => v.id);
  const job = await createJob("pipeline-run", { mode: "safe-batch", resume });
  const checkpoint: IndexingCheckpoint = resume
    ? { ...existing!, jobId: job.id, status: "running", pauseReason: undefined, updatedAt: new Date().toISOString() }
    : {
        version: 1, jobId: job.id, videoIds, position: 0, completedVideoIds: [],
        completedCount: 0, remainingCount: videoIds.length, status: "running",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
  await saveIndexingCheckpoint(checkpoint);
  res.json({ jobId: job.id, message: resume ? "Safe indexing resumed" : "Safe indexing batch started", checkpoint });

  setImmediate(async () => {
    await updateJob(job.id, { status: "running" });
    let current = checkpoint;
    try {
      for (let i = current.position; i < current.videoIds.length; i++) {
        const currentVideo = (await getAllVideos()).find(v => v.id === current.videoIds[i]);
        if (!currentVideo || !isSafeBatchCandidate(currentVideo)) {
          current = { ...current, position: i + 1, remainingCount: Math.max(0, current.videoIds.length - i - 1), updatedAt: new Date().toISOString() };
          await saveIndexingCheckpoint(current);
          continue;
        }
        await updateJob(job.id, { progress: { total: current.videoIds.length, done: current.completedCount, failed: 0, skipped: i - current.completedCount, currentItem: currentVideo.title } });
        const result = await processVideoInternal(currentVideo.id);
        if (result.error && isQuotaExhaustion(result.error)) {
          current = pauseCheckpoint({ ...current, position: i }, result.error);
          await saveIndexingCheckpoint(current);
          await updateJob(job.id, { status: "paused", error: result.error });
          return;
        }
        current = advanceCheckpoint({ ...current, position: i }, currentVideo.id, result.success);
        await saveIndexingCheckpoint(current);
        invalidateIndex();
      }
      await updateJob(job.id, { status: "completed", progress: { total: current.videoIds.length, done: current.completedCount, failed: 0, skipped: 0, currentItem: `${current.completedCount} indexed` } });
      await clearIndexingCheckpoint();
    } catch (err) {
      const reason = String(err);
      current = pauseCheckpoint(current, reason);
      await saveIndexingCheckpoint(current);
      await updateJob(job.id, { status: isQuotaExhaustion(reason) ? "paused" : "failed", error: reason });
    }
  });
}

router.get("/youtube-archive/pipeline/checkpoint", async (_req: Request, res: Response) => {
  const checkpoint = await getIndexingCheckpoint();
  const activeJob = (await getAllJobs()).find(job =>
    job.id === checkpoint?.jobId && (job.status === "running" || job.status === "queued")
  );
  // A process restart can leave a durable cursor marked running. If there is
  // no live job, expose it as paused so the admin can safely resume it.
  if (checkpoint?.status === "running" && !activeJob) {
    const paused = { ...checkpoint, status: "paused" as const, pauseReason: "The previous indexing process stopped before completion." };
    await saveIndexingCheckpoint(paused);
    res.json({ checkpoint: paused });
    return;
  }
  res.json({ checkpoint });
});

router.post("/youtube-archive/pipeline/safe-batch", async (_req: Request, res: Response) => {
  await startSafeBatch(res, false);
});

router.post("/youtube-archive/pipeline/resume", async (_req: Request, res: Response) => {
  await startSafeBatch(res, true);
});

/**
 * POST /api/youtube-archive/pipeline/run
 *
 * Processes every video that has ALREADY been explicitly approved by an admin
 * (reviewStatus === "approved") and has no transcript yet. Each is processed
 * sequentially: caption download → segmentation → OpenAI enrichment → search
 * index rebuild.
 *
 * This pipeline NEVER approves videos. Approval is a manual admin action via
 * PATCH /youtube-archive/videos/:id — pending items are left untouched.
 */
router.post("/youtube-archive/pipeline/run", async (_req: Request, res: Response) => {
  if (_req.body?.confirmFullRebuild !== true) {
    res.status(400).json({ error: "Full rebuild is an advanced action. Explicit confirmation is required." });
    return;
  }
  const job = await createJob("pipeline-run", {});
  res.json({ jobId: job.id, message: "Pipeline started" });

  setImmediate(async () => {
    try {
      await updateJob(job.id, { status: "running" });

      // ── Process explicitly-approved videos without transcripts ───────────
      // Only records an admin has manually approved (reviewStatus === "approved")
      // are eligible. Pending / rejected videos are never processed or approved.
      const allVideos = await getAllVideos();
      const toProcess = allVideos.filter(
        (v) =>
          (v.reviewStatus === "approved" || v.reviewStatus === "auto-approved") &&
          (v.transcriptStatus === "none" || v.transcriptStatus === "failed")
      );

      await updateJob(job.id, {
        progress: {
          total: toProcess.length,
          done: 0,
          failed: 0,
          currentItem: `${toProcess.length} approved videos queued`,
        },
      });

      let done = 0;
      let failed = 0;
      let totalSegments = 0;
      const failures: NonNullable<ImportJob["progress"]["failures"]> = [];

      for (const video of toProcess) {
        await updateJob(job.id, {
          progress: {
            total: toProcess.length,
            done,
            failed,
            currentItem: video.title.slice(0, 80),
          },
        });

        let result: Awaited<ReturnType<typeof processVideoInternal>>;
        try {
          result = await processVideoInternal(video.id);
        } catch (err) {
          result = { success: false, segmentCount: 0, error: String(err) };
        }

        if (result.success) {
          done++;
          totalSegments += result.segmentCount;
        } else {
          failed++;
          failures.push({
            itemId: video.id,
            itemTitle: video.title,
            stage: "process-video",
            error: result.error ?? "Unknown processing failure",
            at: new Date().toISOString(),
          });
        }

        // Invalidate after each so partial index is queryable
        invalidateIndex();

        // Quota / rate-limit courtesy pause
        await new Promise((r) => setTimeout(r, 800));
      }

      await updateJob(job.id, {
        status: "completed",
        progress: {
          total: toProcess.length,
          done,
          failed,
          skipped: 0,
          currentItem: `${done} indexed · ${totalSegments} segments`,
          failures,
        },
      });

      logger.info(
        { done, failed, totalSegments, total: toProcess.length },
        "Pipeline job completed"
      );

    } catch (err) {
      await updateJob(job.id, { status: "failed", error: String(err) });
      logger.error({ err: String(err) }, "Pipeline job failed");
    }
  });
});

// ─── Re-enrich all segments without themes ────────────────────────────────────

/**
 * POST /api/youtube-archive/pipeline/enrich
 *
 * Re-runs OpenAI enrichment on every segment that has no themes yet
 * (i.e. enrichment previously failed or was skipped). Approved videos only.
 * Safe to call multiple times — skips segments that already have themes.
 */
router.post("/youtube-archive/pipeline/enrich", async (_req: Request, res: Response) => {
  if (!process.env.OPENAI_API_KEY) {
    res.status(400).json({ error: "OPENAI_API_KEY not configured" });
    return;
  }

  const job = await createJob("enrich", {});
  res.json({ jobId: job.id, message: "Re-enrichment started" });

  setImmediate(async () => {
    try {
      await updateJob(job.id, { status: "running" });

      const [videos, allSegments] = await Promise.all([getAllVideos(), getAllSegments()]);
      const approvedIds = new Set(
        videos
          .filter((v) => v.reviewStatus === "approved" || v.reviewStatus === "auto-approved")
          .map((v) => v.id)
      );

      // Only re-enrich segments with no themes from approved videos
      const toEnrichIndices: number[] = [];
      for (let i = 0; i < allSegments.length; i++) {
        const s = allSegments[i];
        if (approvedIds.has(s.videoId) && (!s.themes || s.themes.length === 0)) {
          toEnrichIndices.push(i);
        }
      }

      await updateJob(job.id, {
        progress: { total: toEnrichIndices.length, done: 0, failed: 0, currentItem: "starting" },
      });

      let done = 0;
      let failed = 0;
      const CONCURRENCY = 3;

      // Process in batches — collect results into allSegments in-memory array
      // to avoid concurrent file-write race conditions. Write once per batch of WRITE_EVERY.
      const WRITE_EVERY = 60; // flush to disk every 60 segments

      for (let b = 0; b < toEnrichIndices.length; b += CONCURRENCY) {
        const batchIndices = toEnrichIndices.slice(b, b + CONCURRENCY);
        const results = await Promise.allSettled(
          batchIndices.map(async (segIdx) => {
            const seg = allSegments[segIdx];
            const enrich = await enrichSegment(seg.cleanedText);
            // Mutate in place — safe because allSegments is our private copy
            allSegments[segIdx] = {
              ...seg,
              themes: enrich.themes,
              scriptureRefs: enrich.scriptureRefs.length ? enrich.scriptureRefs : seg.scriptureRefs ?? [],
              keywords: enrich.keywords,
              summary: enrich.summary,
            };
          })
        );

        for (const r of results) {
          if (r.status === "fulfilled") done++;
          else failed++;
        }

        // Flush to disk periodically to avoid losing progress on crash
        if (done % WRITE_EVERY === 0 || b + CONCURRENCY >= toEnrichIndices.length) {
          const { writeFile, mkdir } = await import("node:fs/promises");
          const { join } = await import("node:path");
          const { existsSync } = await import("node:fs");
          const dataDir = join(process.cwd(), "data", "sermons");
          if (!existsSync(dataDir)) await mkdir(dataDir, { recursive: true });
          const segFile = join(dataDir, "segments.json");
          const tmp = `${segFile}.tmp.${Date.now()}`;
          await writeFile(tmp, JSON.stringify(allSegments, null, 2), "utf-8");
          const { rename } = await import("node:fs/promises");
          await rename(tmp, segFile);

          await updateJob(job.id, {
            progress: {
              total: toEnrichIndices.length,
              done,
              failed,
              currentItem: `${done}/${toEnrichIndices.length} enriched`,
            },
          });
        }

        // Rate-limit between batches
        if (b + CONCURRENCY < toEnrichIndices.length) {
          await new Promise((r) => setTimeout(r, 400));
        }
      }

      invalidateIndex();

      await updateJob(job.id, {
        status: "completed",
        progress: {
          total: toEnrichIndices.length,
          done,
          failed,
          currentItem: `${done} segments enriched · ${failed} failed`,
        },
      });

      logger.info({ done, failed, total: toEnrichIndices.length }, "Re-enrichment job completed");

    } catch (err) {
      await updateJob(job.id, { status: "failed", error: String(err) });
      logger.error({ err: String(err) }, "Re-enrichment job failed");
    }
  });
});

// ─── Segments ─────────────────────────────────────────────────────────────────

router.get("/youtube-archive/videos/:id/segments", async (req: Request, res: Response) => {
  const video = await getVideoById(String(req.params.id));
  if (!video) { res.status(404).json({ error: "Not found" }); return; }
  const segments = await getSegmentsForVideo(video.id);
  res.json({ segments, total: segments.length });
});

// ─── Jobs ─────────────────────────────────────────────────────────────────────

router.get("/youtube-archive/jobs", async (_req: Request, res: Response) => {
  const jobs = await getAllJobs();
  res.json({ jobs: jobs.slice().reverse() });
});

// ─── Search (internal + admin testing) ────────────────────────────────────────

router.post("/youtube-archive/search", async (req: Request, res: Response) => {
  const { query, bibleBookId, bibleChapter } = req.body as {
    query?: string;
    bibleBookId?: string;
    bibleChapter?: number;
  };

  if (!query || typeof query !== "string" || !query.trim()) {
    res.status(400).json({ error: "query is required" });
    return;
  }

  const { searchSermons } = await import("../lib/sermon-search.js");
  const results = await searchSermons(query.trim(), {
    bibleBookId,
    bibleChapter,
    maxResults: 5,
  });

  res.json({ results });
});

// ─── Preached Here ────────────────────────────────────────────────────────────
//
// Returns sermons that reference a specific Bible book/chapter.
// Used by the chapter-level "Preached Here" badge in the Bible reader.

router.get("/youtube-archive/preached-here", async (req: Request, res: Response) => {
  const bookId  = String(req.query.bookId ?? "").trim();
  const chapter = req.query.chapter
    ? parseInt(String(req.query.chapter), 10)
    : undefined;

  if (!bookId) {
    res.status(400).json({ error: "bookId is required" });
    return;
  }

  // ── 1. Canonical DB sermons — priority source ─────────────────────────────
  //
  // Match published canonical sermons by scripture_book_ids (+ chapter when provided).
  // These are returned first, and their youtube_video_id suppresses archive duplicates.

  const suppressedVideoIds = new Set<string>();
  let canonicalChapterSermons: object[] = [];
  let canonicalBookSermons:    object[] = [];

  try {
    const published = await listPublishedSermons();
    const normBook  = bookId.toLowerCase();

    const chapterMatches = published.filter(s =>
      s.scriptureBookIds.some(id => id.toLowerCase() === normBook) &&
      (chapter === undefined || s.scriptureChapters.includes(chapter))
    );
    const bookMatches = published.filter(s =>
      s.scriptureBookIds.some(id => id.toLowerCase() === normBook) &&
      !chapterMatches.includes(s)
    );

    // Build response objects compatible with the frontend's SermonSearchResult shape
    function toPreachedHereShape(s: typeof published[0]) {
      if (s.youtubeVideoId) suppressedVideoIds.add(s.youtubeVideoId);
      return {
        sermonId:           s.id,
        segmentId:          s.id,
        title:              s.title,
        speaker:            s.speaker,
        sermonDate:         s.sermonDate,
        series:             s.series || undefined,
        scriptureReference: s.scriptureReference,
        youtubeUrl:         s.youtubeUrl,
        timestampedUrl:     s.youtubeUrl,
        startTimeSeconds:   0,
        endTimeSeconds:     0,
        timestampLabel:     "",
        transcriptEvidence: s.summary,
        summary:            s.summary,
        relevanceScore:     20,
        absoluteStartSeconds: 0,
        relativeStartSeconds: 0,
        source:             "canonical",
      };
    }

    canonicalChapterSermons = chapterMatches.map(toPreachedHereShape);
    canonicalBookSermons    = bookMatches.map(toPreachedHereShape);
  } catch (err) {
    logger.warn({ err }, "preached-here: canonical lookup failed (non-fatal)");
  }

  // ── 2. YouTube archive — legacy fallback (deduplicated) ───────────────────

  let archiveChapter: object[] = [];
  let archiveBook:    object[] = [];

  try {
    const { chapterSermons, bookSermons } = await searchByScripture(bookId, chapter, 10);
    archiveChapter = chapterSermons.filter(
      (s: { sermonId?: string }) => !suppressedVideoIds.has(s.sermonId ?? "")
    );
    archiveBook = bookSermons.filter(
      (s: { sermonId?: string }) => !suppressedVideoIds.has(s.sermonId ?? "")
    );
  } catch (err) {
    logger.warn({ err }, "preached-here: archive lookup failed (non-fatal)");
  }

  const chapterSermons = [...canonicalChapterSermons, ...archiveChapter];
  const bookSermons    = [...canonicalBookSermons,    ...archiveBook];

  // `sermons` kept for backward compatibility (chapter-specific only)
  res.json({ sermons: chapterSermons, chapterSermons, bookSermons });
});

// ─── Embedding Generation ─────────────────────────────────────────────────────
//
// Generates text-embedding-3-small (256 dims) for all approved segments.
// Stores results in data/sermons/embeddings.json.
// Idempotent: segments that already have an embedding are skipped.

const SERMON_DATA_DIR = join(process.cwd(), "data", "sermons");
const EMBEDDINGS_FILE = join(SERMON_DATA_DIR, "embeddings.json");

router.post("/youtube-archive/pipeline/embed", async (_req: Request, res: Response) => {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    res.status(400).json({ error: "OPENAI_API_KEY not configured" });
    return;
  }

  const job = await createJob("embed", {});
  res.json({ jobId: job.id, message: "Embedding generation started in background" });

  // Run asynchronously — do not block the response
  void (async () => {
    try {
      // Load existing embeddings to support resumption
      let existing: Record<string, number[]> = {};
      try {
        const durable = await readArchiveState<Record<string, number[]>>("embeddings");
        if (durable) {
          existing = durable;
        } else if (existsSync(EMBEDDINGS_FILE)) {
          existing = JSON.parse(await readFile(EMBEDDINGS_FILE, "utf-8")) as Record<string, number[]>;
          await writeArchiveState("embeddings", existing);
        }
      } catch { /* start fresh */ }

      const [segments, videos] = await Promise.all([getAllSegments(), getAllVideos()]);
      const approvedIds = new Set(
        videos
          .filter((v) => v.reviewStatus === "approved" || v.reviewStatus === "auto-approved")
          .map((v) => v.id)
      );

      const todo = segments.filter((s) => approvedIds.has(s.videoId) && !existing[s.id]);

      await updateJob(job.id, {
        status: "running",
        progress: { total: todo.length, done: 0, failed: 0 },
      });

      logger.info({ total: todo.length, alreadyDone: Object.keys(existing).length }, "Embedding job started");

      let done = 0;
      let failed = 0;
      const failures: NonNullable<ImportJob["progress"]["failures"]> = [];
      const BATCH_SIZE = 10;

      for (let i = 0; i < todo.length; i += BATCH_SIZE) {
        const batch = todo.slice(i, i + BATCH_SIZE);
        const texts = batch.map((s) =>
          [
            s.cleanedText.slice(0, 1500),
            (s.themes ?? []).join(" "),
            (s.keywords ?? []).join(" "),
          ]
            .filter(Boolean)
            .join(" ")
            .trim()
        );

        try {
          const response = await fetch("https://api.openai.com/v1/embeddings", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "text-embedding-3-small",
              input: texts,
              dimensions: 256,
            }),
          });

          if (response.ok) {
            const data = (await response.json()) as { data: Array<{ embedding: number[] }> };
            for (let j = 0; j < batch.length; j++) {
              if (data.data[j]) {
                existing[batch[j].id] = data.data[j].embedding;
                done++;
              }
            }
          } else {
            const errorBody = await response.text().catch(() => "");
            const error = `OpenAI embeddings HTTP ${response.status}${errorBody ? `: ${errorBody.slice(0, 240)}` : ""}`;
            logger.warn({ status: response.status, error, batchSize: batch.length }, "Embedding API error");
            failed += batch.length;
            failures.push(...batch.map((segment) => ({
              itemId: segment.id,
              itemTitle: `Segment ${segment.sequenceNumber}`,
              stage: "embed",
              error,
              at: new Date().toISOString(),
            })));
          }
        } catch (err) {
          const error = String(err);
          logger.warn({ err: error, batchSize: batch.length }, "Embedding batch failed");
          failed += batch.length;
          failures.push(...batch.map((segment) => ({
            itemId: segment.id,
            itemTitle: `Segment ${segment.sequenceNumber}`,
            stage: "embed",
            error,
            at: new Date().toISOString(),
          })));
        }

        // Atomic write after each batch so progress survives interruption
        const tmp = `${EMBEDDINGS_FILE}.tmp.${Date.now()}`;
        await writeFile(tmp, JSON.stringify(existing), "utf-8");
        const { rename } = await import("node:fs/promises");
        await rename(tmp, EMBEDDINGS_FILE);
        await writeArchiveState("embeddings", existing);

        await updateJob(job.id, {
          progress: {
            total: todo.length,
            done,
            failed,
            skipped: segments.length - todo.length,
            currentItem: `${done}/${todo.length} embeddings`,
            failures,
          },
        });
      }

      await updateJob(job.id, {
        status: failed > 0 && done === 0 ? "failed" : "completed",
        progress: {
          total: todo.length,
          done,
          failed,
          skipped: segments.length - todo.length,
          currentItem: `${done} indexed · ${failed} failed`,
          failures,
        },
      });

      logger.info({ done, failed }, "Embedding job complete");
    } catch (err) {
      logger.error({ err: String(err) }, "Embedding job crashed");
      await updateJob(job.id, { status: "failed", error: String(err) });
    }
  })();
});

// ─── Sermon start detection pipeline ─────────────────────────────────────────
//
// POST /api/youtube-archive/pipeline/detect-sermon-starts
// Runs sermon start detection on all approved videos that have transcripts but
// no detectedSermonStartSeconds yet. Safe to run multiple times (idempotent).

router.post("/youtube-archive/pipeline/detect-sermon-starts", async (_req: Request, res: Response) => {
  const job = await createJob("detect-sermon-starts", {});
  res.json({ jobId: job.id, message: "Sermon start detection started" });

  setImmediate(async () => {
    try {
      await updateJob(job.id, { status: "running" });
      const [allVideos, allSegments] = await Promise.all([getAllVideos(), getAllSegments()]);

      // Map videoId → segments for fast lookup
      const segsByVideo = new Map<string, typeof allSegments>();
      for (const seg of allSegments) {
        if (!segsByVideo.has(seg.videoId)) segsByVideo.set(seg.videoId, []);
        segsByVideo.get(seg.videoId)!.push(seg);
      }

      // Include videos that:
      //   a) have no detection yet (new), OR
      //   b) have an unverified low-confidence detection (< 0.70) — so improvements
      //      to the algorithm are applied to existing archive entries automatically.
      // Videos with a manual start or a verified detection are always left alone.
      const approved = allVideos.filter((v) =>
        (v.reviewStatus === "approved" || v.reviewStatus === "auto-approved") &&
        (v.transcriptStatus === "complete" || v.transcriptStatus === "caption-imported") &&
        v.manualSermonStartSeconds === undefined &&
        !v.sermonStartVerified &&
        (
          v.detectedSermonStartSeconds === undefined ||
          (v.sermonStartConfidence !== undefined && v.sermonStartConfidence < 0.70)
        )
      );

      await updateJob(job.id, { progress: { total: approved.length, done: 0, failed: 0 } });

      let done = 0; let failed = 0;
      for (const video of approved) {
        try {
          const segs = segsByVideo.get(video.id) ?? [];
          const result = detectSermonStartFromSegments(
            segs.sort((a, b) => a.sequenceNumber - b.sequenceNumber),
            video.durationSeconds,
          );
          const finalStart = getFinalSermonStart(undefined, result?.detectedStartSeconds);
          await updateVideo(video.id, {
            detectedSermonStartSeconds: result?.detectedStartSeconds,
            sermonStartConfidence: result?.confidence,
            sermonStartMethod: result?.method,
            finalSermonStartSeconds: finalStart,
          });
          done++;
        } catch {
          failed++;
        }
        await updateJob(job.id, { progress: { total: approved.length, done, failed } });
      }

      await updateJob(job.id, {
        status: "completed",
        progress: { total: approved.length, done, failed, currentItem: `${done} detected · ${failed} failed` },
      });
      logger.info({ done, failed, total: approved.length }, "Sermon start detection complete");
    } catch (err) {
      await updateJob(job.id, { status: "failed", error: String(err) });
    }
  });
});

// ─── Timestamp repair pipeline ─────────────────────────────────────────────────
//
// POST /api/youtube-archive/pipeline/repair-timestamps
// Backfills absoluteStartSeconds, relativeStartSeconds, isSermonContent on all
// existing segments using the video's finalSermonStartSeconds.

router.post("/youtube-archive/pipeline/repair-timestamps", async (_req: Request, res: Response) => {
  const job = await createJob("repair-timestamps", {});
  res.json({ jobId: job.id, message: "Timestamp repair started" });

  setImmediate(async () => {
    try {
      await updateJob(job.id, { status: "running" });
      const [allVideos, allSegments] = await Promise.all([getAllVideos(), getAllSegments()]);
      const videoMap = new Map(allVideos.map((v) => [v.id, v]));

      // Only repair segments that haven't been repaired yet
      const toRepair = allSegments.filter((s) => !s.timestampsRepaired);
      await updateJob(job.id, { progress: { total: toRepair.length, done: 0, failed: 0 } });

      let done = 0;
      const repaired = allSegments.map((s) => {
        if (s.timestampsRepaired) return s;
        const video = videoMap.get(s.videoId);
        const finalStart = video?.finalSermonStartSeconds ?? 0;
        const absoluteStart = s.absoluteStartSeconds ?? s.startTimeSeconds;
        const absoluteEnd = s.absoluteEndSeconds ?? s.endTimeSeconds;
        done++;
        return {
          ...s,
          absoluteStartSeconds: absoluteStart,
          absoluteEndSeconds: absoluteEnd,
          relativeStartSeconds: Math.max(0, absoluteStart - finalStart),
          relativeEndSeconds: Math.max(0, absoluteEnd - finalStart),
          isSermonContent: absoluteStart >= finalStart,
          transcriptTimingBasis: "absolute_video" as const,
          timestampsRepaired: true,
        };
      });

      // Atomic batch write
      const { writeFile: wf, rename: rn } = await import("node:fs/promises");
      const { existsSync: ex } = await import("node:fs");
      const { mkdir: mk } = await import("node:fs/promises");
      const dataDir = join(process.cwd(), "data", "sermons");
      if (!ex(dataDir)) await mk(dataDir, { recursive: true });
      const segFile = join(dataDir, "segments.json");
      const tmp = `${segFile}.tmp.${Date.now()}`;
      await wf(tmp, JSON.stringify(repaired, null, 2), "utf-8");
      await rn(tmp, segFile);

      invalidateIndex();
      await updateJob(job.id, {
        status: "completed",
        progress: { total: toRepair.length, done, failed: 0, currentItem: `${done} segments repaired` },
      });
      logger.info({ done, total: allSegments.length }, "Timestamp repair complete");
    } catch (err) {
      await updateJob(job.id, { status: "failed", error: String(err) });
    }
  });
});

// ─── Per-video audio generation ────────────────────────────────────────────────
//
// POST /api/youtube-archive/videos/:id/generate-audio
// Downloads and trims the sermon audio for a single video using yt-dlp + ffmpeg.

router.post("/youtube-archive/videos/:id/generate-audio", async (req: Request, res: Response) => {
  const video = await getVideoById(String(req.params.id));
  if (!video) { res.status(404).json({ error: "Not found" }); return; }
  if (video.audioProcessingStatus === "processing") {
    res.status(409).json({ error: "Audio generation already in progress" });
    return;
  }

  const job = await createJob("generate-audio", {}, video.id);
  await updateVideo(video.id, { audioProcessingStatus: "processing", audioError: undefined });
  res.json({ jobId: job.id, message: "Audio generation started" });

  setImmediate(async () => {
    try {
      await updateJob(job.id, { status: "running" });
      const sermonStart = video.finalSermonStartSeconds ?? 0;
      const sermonEnd = video.manualSermonEndSeconds;

      // Always re-download when triggered from the admin — ensures a changed
      // sermon start (manualSermonStartSeconds) produces a fresh trim.
      const result = await generateSermonAudio({
        videoId: video.id,
        youtubeVideoId: video.youtubeVideoId,
        youtubeUrl: video.youtubeUrl,
        sermonStartSeconds: sermonStart,
        sermonEndSeconds: sermonEnd,
        force: true,
        onProgress: (pct) => {
          updateJob(job.id, { progress: { total: 100, done: pct, failed: 0 } }).catch(() => {});
        },
      });

      const audioUrl = getAudioFileUrl(video.id);
      await updateVideo(video.id, {
        audioProcessingStatus: "ready",
        audioUrl,
        audioDurationSeconds: result.durationSeconds,
        audioFormat: "mp3",
        audioGeneratedAt: new Date().toISOString(),
        audioError: undefined,
      });

      invalidateIndex();
      await updateJob(job.id, {
        status: "completed",
        progress: { total: 100, done: 100, failed: 0, currentItem: `${Math.round(result.fileSizeBytes / 1024 / 1024 * 10) / 10}MB` },
      });
      logger.info({ videoId: video.id, durationSeconds: result.durationSeconds }, "Audio generation complete");
    } catch (err) {
      const msg = String(err);
      await updateVideo(video.id, { audioProcessingStatus: "failed", audioError: msg });
      await updateJob(job.id, { status: "failed", error: msg });
      logger.error({ videoId: video.id, err: msg }, "Audio generation failed");
    }
  });
});

// ─── Audio file serving ────────────────────────────────────────────────────────
//
// GET /api/youtube-archive/audio/:id
// Streams the MP3 file for the given video record ID.
// Supports Range requests for seekable HTML5 audio.

router.get("/youtube-archive/audio/:id", async (req: Request, res: Response) => {
  const videoId = String(req.params.id);
  const filePath = getAudioFilePath(videoId);

  if (!existsSync(filePath)) {
    res.status(404).json({ error: "Audio not found — generate it first" });
    return;
  }

  try {
    const fileInfo = await stat(filePath);
    const fileSize = fileInfo.size;
    const rangeHeader = req.headers.range;

    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Accept-Ranges", "bytes");

    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Content-Length": chunkSize,
      });
      createReadStream(filePath, { start, end }).pipe(res);
    } else {
      res.setHeader("Content-Length", fileSize);
      createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// ─── OAuth ────────────────────────────────────────────────────────────────────

router.get("/youtube-archive/oauth/status", async (_req: Request, res: Response) => {
  const status = await getOAuthStatus();
  res.json(status);
});

router.get("/youtube-archive/oauth/start", async (req: Request, res: Response) => {
  const config = getOAuthConfig();
  if (!config) {
    res.status(400).json({
      error: "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI must be configured",
    });
    return;
  }

  // State is persisted to disk so it survives hot-reloads and restarts that
  // would wipe an in-memory Map (the root cause of "Invalid or expired OAuth state").
  const state = randomBytes(16).toString("hex");
  await addPendingState(state);

  const url = buildOAuthUrl(config, state);
  res.redirect(url);
});

/** Render a popup-friendly HTML page that closes itself on success or shows a retry button on error. */
function oauthPopupPage(opts: {
  success: boolean;
  title: string;
  body: string;
  retryUrl?: string;
}): string {
  const { success, title, body, retryUrl } = opts;
  const icon = success ? "✅" : "❌";
  const autoClose = success
    ? `<p style="color:#666;font-size:14px">This window will close automatically…</p>
       <script>
         if (window.opener) { try { window.opener.postMessage('oauth-success','*'); } catch(_){} }
         setTimeout(function(){ window.close(); }, 2500);
       </script>`
    : "";
  const retryBtn = retryUrl
    ? `<a href="${retryUrl}" style="display:inline-block;margin-top:1rem;padding:0.5rem 1.25rem;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none;font-size:14px">Try again</a>
       <button onclick="window.close()" style="margin-left:0.75rem;padding:0.5rem 1rem;border:1px solid #d1d5db;border-radius:6px;background:#fff;font-size:14px;cursor:pointer">Close</button>`
    : `<button onclick="window.close()" style="margin-top:1rem;padding:0.5rem 1rem;border:1px solid #d1d5db;border-radius:6px;background:#fff;font-size:14px;cursor:pointer">Close</button>`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>YouTube OAuth</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;max-width:420px;margin:auto">
  <h2 style="margin-top:0">${icon} ${title}</h2>
  <p style="color:#374151">${body}</p>
  ${success ? autoClose : retryBtn}
</body></html>`;
}

router.get("/youtube-archive/oauth/callback", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;
  const retryUrl = "/api/youtube-archive/oauth/start";

  if (error) {
    res.status(400).send(oauthPopupPage({
      success: false,
      title: "Google denied access",
      body: `Google returned an error: <code>${error}</code>. Make sure you approve all requested permissions.`,
      retryUrl,
    }));
    return;
  }

  if (!state || !code) {
    res.status(400).send(oauthPopupPage({
      success: false,
      title: "Invalid callback",
      body: "The OAuth callback was missing required parameters. Please try connecting again.",
      retryUrl,
    }));
    return;
  }

  // Verify state from the persistent file store (survives hot-reloads).
  const stateValid = await verifyAndConsumePendingState(state);
  if (!stateValid) {
    res.status(400).send(oauthPopupPage({
      success: false,
      title: "Session expired — please try again",
      body: "The OAuth session could not be verified (it may have expired or the server restarted). This is safe — please click 'Try again' to start a new connection.",
      retryUrl,
    }));
    return;
  }

  const config = getOAuthConfig();
  if (!config) {
    res.status(400).send(oauthPopupPage({
      success: false,
      title: "OAuth not configured",
      body: "YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, and YOUTUBE_REDIRECT_URI must all be set as environment secrets.",
    }));
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code, config);
    if (!tokens.refresh_token) {
      res.status(400).send(oauthPopupPage({
        success: false,
        title: "No refresh token",
        body: "Google did not return a refresh token. This usually means the account was already connected. Try disconnecting first, then reconnect to force a new token.",
        retryUrl: `${retryUrl}?prompt=consent`,
      }));
      return;
    }
    await storeRefreshToken(tokens.refresh_token);
    res.send(oauthPopupPage({
      success: true,
      title: "YouTube connected",
      body: "Your YouTube account is now connected. You can close this window and return to Media Studio.",
    }));
  } catch (err) {
    res.status(500).send(oauthPopupPage({
      success: false,
      title: "Connection failed",
      body: `Token exchange failed: ${String(err).slice(0, 200)}`,
      retryUrl,
    }));
  }
});

router.delete("/youtube-archive/oauth", async (_req: Request, res: Response) => {
  await clearOAuthCredentials();
  res.json({ message: "OAuth credentials removed" });
});

export default router;
