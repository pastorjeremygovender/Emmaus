/**
 * YouTube Archive API client
 * Thin wrappers around the server-side youtube-archive routes.
 * Never exposes API keys or tokens — all operations go through the server.
 */

import { getApiUrl } from './api';

// ─── Types (mirrors server-side types) ───────────────────────────────────────

export type ContentType = 'sermon' | 'worship' | 'announcement' | 'other' | 'unknown';
export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'auto-approved';
export type TranscriptStatus =
  | 'none'
  | 'pending'
  | 'caption-imported'
  | 'whisper-pending'
  | 'complete'
  | 'failed';

export interface VideoRecord {
  id: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSeconds: number;
  thumbnailUrl: string;
  channelId: string;
  privacyStatus: string;
  importedAt: string;
  lastSyncAt: string;
  contentType: ContentType;
  sermonLikelihood: number;
  classificationReason: string;
  reviewStatus: ReviewStatus;
  speaker?: string;
  sermonDate?: string;
  series?: string;
  scriptureReferences?: string[];
  topics?: string[];
  keywords?: string[];
  summary?: string;
  aiThemes?: string[];
  aiScriptureRefs?: string[];
  aiKeywords?: string[];
  aiSummary?: string;
  aiIndexStatus: string;
  transcriptStatus: TranscriptStatus;
  transcriptSource?: string;
  captionTrackKind?: string;
  transcriptError?: string;
  // Sermon start detection
  detectedSermonStartSeconds?: number;
  sermonStartConfidence?: number;
  sermonStartMethod?: string;
  manualSermonStartSeconds?: number;
  manualSermonEndSeconds?: number;
  sermonStartVerified?: boolean;
  finalSermonStartSeconds?: number;
  // Audio asset
  audioProcessingStatus?: 'none' | 'processing' | 'ready' | 'failed';
  audioUrl?: string;
  audioDurationSeconds?: number;
  audioError?: string;
}

export interface SermonSegment {
  id: string;
  videoId: string;
  youtubeVideoId: string;
  sequenceNumber: number;
  startTimeSeconds: number;
  endTimeSeconds: number;
  originalText: string;
  cleanedText: string;
  wordCount: number;
  themes?: string[];
  scriptureRefs?: string[];
  keywords?: string[];
  summary?: string;
}

export interface ImportJob {
  id: string;
  type: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'paused';
  createdAt: string;
  updatedAt: string;
  targetVideoId?: string;
  progress: {
    total: number;
    done: number;
    failed: number;
    skipped?: number;
    currentItem?: string;
    failures?: Array<{
      itemId: string;
      itemTitle?: string;
      stage: string;
      error: string;
      at: string;
    }>;
  };
  error?: string;
}

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

export interface ArchiveStatus {
  youtube: {
    configured: boolean;
    channelId: string | null;
    channelInfo: { title: string; videoCount: number } | null;
  };
  oauth: {
    connected: boolean;
    authorizedAt?: string;
    oauthConfigured: boolean;
  };
  stats: ArchiveStats;
  activeJob: ImportJob | null;
}

export interface IndexingCheckpoint {
  version: 1;
  jobId: string;
  videoIds: string[];
  position: number;
  completedVideoIds: string[];
  completedCount: number;
  remainingCount: number;
  status: 'running' | 'paused';
  pauseReason?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ─── Status ──────────────────────────────────────────────────────────────────

export async function getArchiveStatus(): Promise<ArchiveStatus> {
  return apiFetch('/api/youtube-archive/status');
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export async function syncChannel(maxVideos = 500): Promise<{ jobId: string; message: string }> {
  return apiFetch('/api/youtube-archive/sync', {
    method: 'POST',
    body: JSON.stringify({ maxVideos }),
  });
}

// ─── Videos ──────────────────────────────────────────────────────────────────

export async function listVideos(filters?: {
  contentType?: ContentType;
  reviewStatus?: ReviewStatus;
  transcriptStatus?: TranscriptStatus;
}): Promise<{ videos: VideoRecord[]; total: number }> {
  const params = new URLSearchParams();
  if (filters?.contentType) params.set('contentType', filters.contentType);
  if (filters?.reviewStatus) params.set('reviewStatus', filters.reviewStatus);
  if (filters?.transcriptStatus) params.set('transcriptStatus', filters.transcriptStatus);
  const qs = params.toString() ? `?${params}` : '';
  return apiFetch(`/api/youtube-archive/videos${qs}`);
}

export async function getVideo(id: string): Promise<VideoRecord> {
  return apiFetch(`/api/youtube-archive/videos/${id}`);
}

export async function updateVideo(id: string, patch: Partial<VideoRecord>): Promise<VideoRecord> {
  return apiFetch(`/api/youtube-archive/videos/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function processVideo(id: string): Promise<{ jobId: string; message: string }> {
  return apiFetch(`/api/youtube-archive/videos/${id}/process`, { method: 'POST' });
}

export async function getSegments(videoId: string): Promise<{ segments: SermonSegment[]; total: number }> {
  return apiFetch(`/api/youtube-archive/videos/${videoId}/segments`);
}

// ─── Jobs ────────────────────────────────────────────────────────────────────

export async function listJobs(): Promise<{ jobs: ImportJob[] }> {
  return apiFetch('/api/youtube-archive/jobs');
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

export interface PipelineResult {
  jobId: string;
  message: string;
}

export interface PipelineStatus {
  jobId: string;
  status: ImportJob['status'];
  progress: ImportJob['progress'];
  error?: string;
}

export async function runPipeline(confirmFullRebuild = false): Promise<PipelineResult> {
  return apiFetch('/api/youtube-archive/pipeline/run', {
    method: 'POST',
    body: JSON.stringify({ confirmFullRebuild }),
  });
}

export async function getIndexingCheckpoint(): Promise<{ checkpoint: IndexingCheckpoint | null }> {
  return apiFetch('/api/youtube-archive/pipeline/checkpoint');
}

export async function startSafeIndexingBatch(): Promise<PipelineResult> {
  return apiFetch('/api/youtube-archive/pipeline/safe-batch', { method: 'POST' });
}

export async function resumeSafeIndexing(): Promise<PipelineResult> {
  return apiFetch('/api/youtube-archive/pipeline/resume', { method: 'POST' });
}

export async function getPipelineJob(jobId: string): Promise<ImportJob | null> {
  const result = await listJobs();
  return result.jobs.find(j => j.id === jobId) ?? null;
}

export async function cancelArchiveJob(jobId: string): Promise<{ job: ImportJob }> {
  return apiFetch(`/api/youtube-archive/jobs/${jobId}/cancel`, { method: 'POST' });
}

export async function runEnrichment(): Promise<PipelineResult> {
  return apiFetch('/api/youtube-archive/pipeline/enrich', { method: 'POST' });
}

export async function runEmbedding(): Promise<PipelineResult> {
  return apiFetch('/api/youtube-archive/pipeline/embed', { method: 'POST' });
}

// ─── Preached Here ────────────────────────────────────────────────────────────

export interface PreachedHereSermon {
  sermonId: string;
  title: string;
  speaker: string;
  sermonDate: string;
  timestampedUrl: string;   // YouTube link at absoluteStartSeconds (Watch)
  timestampLabel: string;   // formatted absolute time for Watch button
  scriptureReference: string;
  summary?: string;
  audioUrl?: string;                 // in-app audio when ready (Listen)
  relativeStartSeconds?: number;     // position in trimmed audio
  relativeTimestampLabel?: string;   // formatted relative time for Listen button
  youtubeUrl?: string;               // base YouTube URL
}

export async function getPreachedHere(
  bookId: string,
  chapter: number,
): Promise<PreachedHereSermon[]> {
  const qs = `?bookId=${encodeURIComponent(bookId)}&chapter=${chapter}`;
  const result = await apiFetch<{ sermons: PreachedHereSermon[] }>(
    `/api/youtube-archive/preached-here${qs}`
  );
  return result.sermons ?? [];
}

// ─── Pipeline utilities ───────────────────────────────────────────────────────

export async function repairTimestamps(): Promise<PipelineResult> {
  return apiFetch('/api/youtube-archive/pipeline/repair-timestamps', { method: 'POST' });
}

export async function detectSermonStarts(): Promise<PipelineResult> {
  return apiFetch('/api/youtube-archive/pipeline/detect-sermon-starts', { method: 'POST' });
}

export async function generateAudio(videoId: string): Promise<{ jobId: string; message: string }> {
  return apiFetch(`/api/youtube-archive/videos/${videoId}/generate-audio`, { method: 'POST' });
}

export function getAudioStreamUrl(videoId: string): string {
  return getApiUrl(`/api/youtube-archive/audio/${videoId}`);
}

// ─── Search ──────────────────────────────────────────────────────────────────

export async function searchSermons(
  query: string,
  opts?: { bibleBookId?: string; bibleChapter?: number }
): Promise<{ results: unknown[] }> {
  return apiFetch('/api/youtube-archive/search', {
    method: 'POST',
    body: JSON.stringify({ query, ...opts }),
  });
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

export function startOAuthFlow(): void {
  // Opens the OAuth flow in a new window/tab.
  // The server-side callback completes the token exchange.
  window.open(getApiUrl('/api/youtube-archive/oauth/start'), '_blank', 'width=600,height=700');
}

export async function disconnectOAuth(): Promise<void> {
  await apiFetch('/api/youtube-archive/oauth', { method: 'DELETE' });
}

// ─── Formatters ──────────────────────────────────────────────────────────────

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}:${s.toString().padStart(2, '0')}`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}:${mm.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
