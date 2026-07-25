/**
 * Sermon Store — File-based JSON persistence for YouTube sermon archive
 *
 * Stores YoutubeVideoRecord and SermonSegment objects as JSON files under
 * data/sermons/. Uses atomic writes (temp → rename) so the store is never
 * left in a partial state if the process is interrupted.
 *
 * All operations are async and safe to call concurrently from the same Node
 * process (single-threaded JS means no race conditions on reads/writes).
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentType = "sermon" | "worship" | "announcement" | "other" | "unknown";
export type ReviewStatus = "pending" | "approved" | "rejected" | "auto-approved";
export type TranscriptStatus =
  | "none"
  | "pending"
  | "caption-imported"
  | "whisper-pending"
  | "complete"
  | "failed";
export type TranscriptSource = "youtube-manual" | "youtube-auto" | "whisper" | "manual";
export type AiIndexStatus = "none" | "pending" | "indexed";

export interface YoutubeVideoRecord {
  id: string;                  // internal UUID
  youtubeVideoId: string;      // e.g. "dQw4w9WgXcQ"
  youtubeUrl: string;          // https://www.youtube.com/watch?v=...
  title: string;
  description: string;
  publishedAt: string;         // ISO date string
  durationSeconds: number;
  thumbnailUrl: string;
  channelId: string;
  privacyStatus: string;       // "public" | "unlisted" | "private"
  importedAt: string;          // ISO
  lastSyncAt: string;          // ISO

  // ── Classification ────────────────────────────────────────────────────────
  contentType: ContentType;
  sermonLikelihood: number;    // 0–1
  classificationReason: string;
  reviewStatus: ReviewStatus;

  // ── Admin-verified metadata ───────────────────────────────────────────────
  speaker?: string;
  sermonDate?: string;         // ISO date
  series?: string;
  scriptureReferences?: string[];   // e.g. ["John 3:16", "Romans 8"]
  scriptureBookIds?: string[];      // normalised lowercase, e.g. ["john", "romans"]
  scriptureChapters?: number[];
  topics?: string[];
  keywords?: string[];
  summary?: string;

  // ── AI-derived metadata (not verified) ───────────────────────────────────
  aiThemes?: string[];
  aiScriptureRefs?: string[];
  aiKeywords?: string[];
  aiSummary?: string;
  aiIndexStatus: AiIndexStatus;

  // ── Transcript ────────────────────────────────────────────────────────────
  transcriptStatus: TranscriptStatus;
  transcriptSource?: TranscriptSource;
  transcriptText?: string;         // full raw transcript (original)
  transcriptCleanedText?: string;  // normalised version
  captionTrackId?: string;
  captionTrackKind?: string;       // "standard" | "asr" (auto-generated)
  transcriptError?: string;

  // ── Sermon start detection ────────────────────────────────────────────────
  detectedSermonStartSeconds?: number;
  sermonStartConfidence?: number;
  sermonStartMethod?: "phrase" | "music-gap" | "duration-estimate";
  manualSermonStartSeconds?: number;
  sermonStartVerified?: boolean;
  finalSermonStartSeconds?: number; // = manualSermonStartSeconds ?? detectedSermonStartSeconds ?? 0

  // ── Audio asset ───────────────────────────────────────────────────────────
  audioProcessingStatus?: "none" | "processing" | "ready" | "failed";
  audioUrl?: string;              // relative: /api/youtube-archive/audio/:id
  audioDurationSeconds?: number;
  audioFormat?: string;
  audioGeneratedAt?: string;
  audioError?: string;
}

export interface SermonSegment {
  id: string;
  videoId: string;             // internal video record ID
  youtubeVideoId: string;      // for URL construction
  sequenceNumber: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  originalText: string;
  cleanedText: string;
  wordCount: number;
  // ── AI metadata ───────────────────────────────────────────────────────────
  themes?: string[];
  scriptureRefs?: string[];
  keywords?: string[];
  summary?: string;
  /** Vector embedding (text-embedding-3-small, 256 dims). Populated by the
   *  /pipeline/embed job. When present, cosine similarity search is used
   *  instead of TF-IDF. */
  embedding?: number[];
  aiIndexStatus: AiIndexStatus;

  // ── Dual timestamp model ──────────────────────────────────────────────────
  // absoluteStartSeconds = raw VTT time = YouTube timestamp (same as startTimeSeconds)
  // relativeStartSeconds = absoluteStart - video.finalSermonStartSeconds (audio position)
  absoluteStartSeconds?: number;
  absoluteEndSeconds?: number;
  relativeStartSeconds?: number;
  relativeEndSeconds?: number;
  isSermonContent?: boolean;          // absoluteStart >= video.finalSermonStartSeconds
  transcriptTimingBasis?: "absolute_video" | "unknown";
  timestampsRepaired?: boolean;
}

export type JobType =
  | "sync"
  | "process-video"
  | "enrich"
  | "pipeline-run"
  | "embed"
  | "generate-audio"
  | "repair-timestamps"
  | "detect-sermon-starts";
export type JobStatus = "queued" | "running" | "completed" | "failed" | "paused";

export interface ImportJob {
  id: string;
  type: JobType;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  targetVideoId?: string;     // for process-video jobs
  progress: {
    total: number;
    done: number;
    failed: number;
    currentItem?: string;
  };
  error?: string;
  options?: Record<string, unknown>;
}

// ─── Storage paths ────────────────────────────────────────────────────────────

const DATA_DIR = join(process.cwd(), "data", "sermons");
const VIDEOS_FILE = join(DATA_DIR, "videos.json");
const SEGMENTS_FILE = join(DATA_DIR, "segments.json");
const JOBS_FILE = join(DATA_DIR, "jobs.json");

async function ensureDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
    logger.info("Created sermon data directory");
  }
}

// ─── Atomic write helpers ─────────────────────────────────────────────────────

async function atomicWrite(filePath: string, data: unknown): Promise<void> {
  await ensureDir();
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
  // On POSIX rename is atomic; on Windows it replaces atomically in Node 16+
  const { rename } = await import("node:fs/promises");
  await rename(tmp, filePath);
}

async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

// ─── Video Records ────────────────────────────────────────────────────────────

export async function getAllVideos(): Promise<YoutubeVideoRecord[]> {
  return readJsonFile<YoutubeVideoRecord[]>(VIDEOS_FILE, []);
}

export async function getVideoById(id: string): Promise<YoutubeVideoRecord | null> {
  const videos = await getAllVideos();
  return videos.find((v) => v.id === id) ?? null;
}

export async function getVideoByYoutubeId(youtubeVideoId: string): Promise<YoutubeVideoRecord | null> {
  const videos = await getAllVideos();
  return videos.find((v) => v.youtubeVideoId === youtubeVideoId) ?? null;
}

/**
 * Idempotent upsert keyed by youtubeVideoId.
 * If a record with this YouTube ID already exists, merges the new data onto it
 * (preserving admin-edited fields unless explicitly overridden).
 * Returns the upserted record.
 */
export async function upsertVideo(
  data: Omit<YoutubeVideoRecord, "id" | "importedAt"> & { importedAt?: string }
): Promise<YoutubeVideoRecord> {
  const videos = await getAllVideos();
  const idx = videos.findIndex((v) => v.youtubeVideoId === data.youtubeVideoId);

  if (idx >= 0) {
    const existing = videos[idx];
    // Preserve admin-edited fields unless explicitly overriding
    const merged: YoutubeVideoRecord = {
      ...existing,
      // Always refresh from YouTube
      title: data.title,
      description: data.description,
      durationSeconds: data.durationSeconds,
      thumbnailUrl: data.thumbnailUrl,
      privacyStatus: data.privacyStatus,
      lastSyncAt: data.lastSyncAt,
      // Keep existing classification/review/transcript unless caller overrides
      contentType: data.contentType !== "unknown" ? data.contentType : existing.contentType,
      sermonLikelihood: data.sermonLikelihood !== existing.sermonLikelihood ? data.sermonLikelihood : existing.sermonLikelihood,
      classificationReason: data.classificationReason || existing.classificationReason,
      // Never overwrite admin-approved fields
      reviewStatus: existing.reviewStatus !== "pending" ? existing.reviewStatus : data.reviewStatus,
      speaker: existing.speaker ?? data.speaker,
      sermonDate: existing.sermonDate ?? data.sermonDate,
      summary: existing.summary ?? data.summary,
      topics: existing.topics ?? data.topics,
      keywords: existing.keywords ?? data.keywords,
      scriptureReferences: existing.scriptureReferences ?? data.scriptureReferences,
      scriptureBookIds: existing.scriptureBookIds ?? data.scriptureBookIds,
      scriptureChapters: existing.scriptureChapters ?? data.scriptureChapters,
      // Preserve transcript status
      transcriptStatus: existing.transcriptStatus !== "none" ? existing.transcriptStatus : data.transcriptStatus,
      aiIndexStatus: existing.aiIndexStatus !== "none" ? existing.aiIndexStatus : data.aiIndexStatus,
    };
    videos[idx] = merged;
    await atomicWrite(VIDEOS_FILE, videos);
    return merged;
  }

  const record: YoutubeVideoRecord = {
    ...data,
    id: randomUUID(),
    importedAt: data.importedAt ?? new Date().toISOString(),
  };
  videos.push(record);
  await atomicWrite(VIDEOS_FILE, videos);
  return record;
}

export async function updateVideo(
  id: string,
  patch: Partial<YoutubeVideoRecord>
): Promise<YoutubeVideoRecord | null> {
  const videos = await getAllVideos();
  const idx = videos.findIndex((v) => v.id === id);
  if (idx < 0) return null;

  const updated = { ...videos[idx], ...patch } as YoutubeVideoRecord;
  videos[idx] = updated;
  await atomicWrite(VIDEOS_FILE, videos);
  return updated;
}

// ─── Segments ─────────────────────────────────────────────────────────────────

export async function getAllSegments(): Promise<SermonSegment[]> {
  return readJsonFile<SermonSegment[]>(SEGMENTS_FILE, []);
}

export async function getSegmentsForVideo(videoId: string): Promise<SermonSegment[]> {
  const segments = await getAllSegments();
  return segments.filter((s) => s.videoId === videoId).sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

export async function getApprovedSegments(): Promise<SermonSegment[]> {
  const [segments, videos] = await Promise.all([getAllSegments(), getAllVideos()]);
  const approvedIds = new Set(
    videos
      .filter((v) => v.reviewStatus === "approved" || v.reviewStatus === "auto-approved")
      .map((v) => v.id)
  );
  return segments
    .filter((s) => approvedIds.has(s.videoId))
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
}

/**
 * Replace all segments for a video — idempotent (re-process always replaces).
 */
export async function replaceSegments(
  videoId: string,
  newSegments: Omit<SermonSegment, "id">[]
): Promise<SermonSegment[]> {
  const existing = await getAllSegments();
  const kept = existing.filter((s) => s.videoId !== videoId);
  const created: SermonSegment[] = newSegments.map((s) => ({
    ...s,
    id: randomUUID(),
  }));
  await atomicWrite(SEGMENTS_FILE, [...kept, ...created]);
  return created;
}

export async function updateSegment(
  id: string,
  patch: Partial<SermonSegment>
): Promise<void> {
  const segments = await getAllSegments();
  const idx = segments.findIndex((s) => s.id === id);
  if (idx >= 0) {
    segments[idx] = { ...segments[idx], ...patch } as SermonSegment;
    await atomicWrite(SEGMENTS_FILE, segments);
  }
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export async function getAllJobs(): Promise<ImportJob[]> {
  return readJsonFile<ImportJob[]>(JOBS_FILE, []);
}

export async function getJob(id: string): Promise<ImportJob | null> {
  const jobs = await getAllJobs();
  return jobs.find((j) => j.id === id) ?? null;
}

export async function createJob(
  type: JobType,
  options?: Record<string, unknown>,
  targetVideoId?: string,
): Promise<ImportJob> {
  const jobs = await getAllJobs();
  const job: ImportJob = {
    id: randomUUID(),
    type,
    status: "queued",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    targetVideoId,
    progress: { total: 0, done: 0, failed: 0 },
    options,
  };
  jobs.push(job);
  // Prune old completed/failed jobs beyond 50
  const pruned = jobs.slice(-50);
  await atomicWrite(JOBS_FILE, pruned);
  return job;
}

export async function updateJob(
  id: string,
  patch: Partial<ImportJob>
): Promise<void> {
  const jobs = await getAllJobs();
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx >= 0) {
    jobs[idx] = {
      ...jobs[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    } as ImportJob;
    await atomicWrite(JOBS_FILE, jobs);
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface ArchiveStats {
  videosDiscovered: number;
  likelySermons: number;
  approvedSermons: number;
  transcriptsAvailable: number;
  transcriptsMissing: number;
  segmentsCreated: number;
  pendingReview: number;
  failedImports: number;
  sermonStartsDetected: number;
  sermonStartsNeedingReview: number;
  sermonStartsVerified: number;
  audioAssetsReady: number;
  audioProcessingFailed: number;
}

export async function getArchiveStats(): Promise<ArchiveStats> {
  const [videos, segments] = await Promise.all([getAllVideos(), getAllSegments()]);
  return {
    videosDiscovered: videos.length,
    likelySermons: videos.filter((v) => v.sermonLikelihood >= 0.6).length,
    approvedSermons: videos.filter((v) => v.reviewStatus === "approved" || v.reviewStatus === "auto-approved").length,
    transcriptsAvailable: videos.filter((v) => v.transcriptStatus === "complete" || v.transcriptStatus === "caption-imported").length,
    transcriptsMissing: videos.filter((v) => v.transcriptStatus === "none" || v.transcriptStatus === "failed").length,
    segmentsCreated: segments.length,
    pendingReview: videos.filter((v) => v.reviewStatus === "pending").length,
    failedImports: videos.filter((v) => v.transcriptStatus === "failed").length,
    sermonStartsDetected: videos.filter((v) => v.detectedSermonStartSeconds !== undefined || v.manualSermonStartSeconds !== undefined).length,
    sermonStartsNeedingReview: videos.filter(
      (v) =>
        ((v.transcriptStatus === "complete" || v.transcriptStatus === "caption-imported") &&
          (v.reviewStatus === "approved" || v.reviewStatus === "auto-approved")) &&
        !v.sermonStartVerified &&
        (v.detectedSermonStartSeconds === undefined ||
          (v.sermonStartConfidence !== undefined && v.sermonStartConfidence < 0.70))
    ).length,
    sermonStartsVerified: videos.filter((v) => v.sermonStartVerified === true).length,
    audioAssetsReady: videos.filter((v) => v.audioProcessingStatus === "ready").length,
    audioProcessingFailed: videos.filter((v) => v.audioProcessingStatus === "failed").length,
  };
}
