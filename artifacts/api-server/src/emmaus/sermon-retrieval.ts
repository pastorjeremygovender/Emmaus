/**
 * Emmaus Sermon Retrieval — Verified Record Search
 *
 * Priority order:
 *   1. Published canonical sermons and the publication-safe knowledge index
 *   2. Approved YouTube Archive sermon segments
 *
 * Canonical records take precedence; approved archive segments fill gaps.
 *
 * Retrieval runs with a bounded timeout so it never delays Ask Emmaus.
 * When no verified match clears the minimum threshold, returns null and
 * no sermon card is shown.
 *
 * YouTube link construction is deterministic — the LLM never writes URLs.
 *
 * Optional env:
 *   EMMAUS_SERMON_MIN_SCORE — minimum retrieval score (default: 5)
 */

import { searchSermons, type SermonSearchResult } from "../lib/sermon-search.js";
import { logger } from "../lib/logger.js";
import {
  listPublishedSermons,
  type CanonicalSermon,
} from "../lib/canonical-sermon-store.js";
import { searchKnowledgeIndex } from "../lib/sermon-knowledge-index.js";

// ─── Public Result Type ───────────────────────────────────────────────────────

export interface SermonRetrievalResult {
  sermonId: string;
  segmentId?: string;
  title: string;
  speaker: string;
  sermonDate: string;
  series?: string;
  scriptureReference: string;
  youtubeUrl: string;
  timestampedUrl: string;
  summary: string;
  timestampSeconds?: number;         // absolute YouTube timestamp (Watch)
  timestampLabel?: string;
  transcriptEvidence?: string;
  /** "canonical" = DB sermon table; "archive" = approved YouTube archive segment */
  source: "canonical" | "archive";
  audioUrl?: string;                 // in-app audio URL (Listen)
  relativeStartSeconds?: number;     // position within trimmed audio
  relativeTimestampLabel?: string;
  /** Only canonical records have a published member route. */
  openPath?: string;
  /** Canonical audio opens the member page; archive audio is played directly. */
  listenPath?: string;
  /** Archive results use this for canonical duplicate suppression. */
  youtubeVideoId?: string;
  relevanceScore?: number;
}

export interface SermonSearchCardResult extends SermonRetrievalResult {
  reason: string;
  excerpt: string;
}

// ─── Canonical DB sermon scoring ─────────────────────────────────────────────

function scoreCanonicalSermon(
  sermon: CanonicalSermon,
  query: string,
  bibleBookId?: string,
  bibleChapter?: number
): number {
  let score = 0;
  const q = query.toLowerCase();

  // Scripture match — strong signal
  if (bibleBookId) {
    const normBookId = bibleBookId.toLowerCase();
    if (sermon.scriptureBookIds.some(id => id.toLowerCase() === normBookId)) {
      score += 12;
      if (bibleChapter != null && sermon.scriptureChapters.includes(bibleChapter)) {
        score += 8;
      }
    }
  }

  // Keyword / theme overlap
  for (const theme of sermon.themes)   { if (q.includes(theme.toLowerCase()))   score += 4; }
  for (const kw   of sermon.keywords)  { if (q.includes(kw.toLowerCase()))       score += 3; }

  // Scripture reference text in query
  const ref = sermon.scriptureReference.toLowerCase();
  if (ref && q.includes(ref.split(" ")[0])) score += 3; // book name

  // Title word overlap
  const titleWords = sermon.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  for (const w of titleWords) { if (q.includes(w)) score += 1; }

  // Main theme in query
  if (sermon.mainTheme && q.includes(sermon.mainTheme.toLowerCase().slice(0, 20))) score += 6;

  return score;
}

function isEligibleCanonical(sermon: CanonicalSermon): boolean {
  return Boolean(
    sermon.id &&
    sermon.title.trim() &&
    sermon.speaker.trim() &&
    sermon.speaker.trim().toLowerCase() !== "unknown speaker" &&
    !/\bshorts?\b/i.test(sermon.title),
  );
}

/** Reject malformed or non-YouTube URLs before they reach a member-facing card. */
export function isValidYouTubeUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "www.youtube.com" ||
        url.hostname === "youtube.com" ||
        url.hostname === "youtu.be") &&
      Boolean(url.searchParams.get("v") || url.hostname === "youtu.be")
    );
  } catch {
    return false;
  }
}

function canonicalCard(
  sermon: CanonicalSermon,
  score: number,
  query: string,
  summaryOverride?: string,
): SermonSearchCardResult {
  const timestampSeconds = sermon.sections.find((s) => Number.isFinite(s.timestampSeconds))?.timestampSeconds;
  const youtubeUrl = isValidYouTubeUrl(sermon.youtubeUrl) ? sermon.youtubeUrl : "";
  const timestampedUrl = youtubeUrl ? buildTimestampedUrl(youtubeUrl, timestampSeconds) : "";
  const excerpt = (summaryOverride || sermon.summary || sermon.mainTheme || sermon.scriptureReference || "")
    .slice(0, 300);

  return {
    sermonId: sermon.id,
    title: sermon.title,
    speaker: sermon.speaker,
    sermonDate: sermon.sermonDate,
    series: sermon.series || undefined,
    scriptureReference: sermon.scriptureReference,
    youtubeUrl,
    timestampedUrl,
    summary: excerpt,
    timestampSeconds,
    timestampLabel: timestampSeconds == null ? undefined : formatTimestampLabel(timestampSeconds),
    source: "canonical",
    audioUrl: sermon.audioPath
      ? `${process.env.BASE_URL ?? ""}/storage/objects/${sermon.audioPath.replace(/^\/objects\//, "")}`
      : undefined,
    openPath: `/sermon/${sermon.id}`,
    listenPath: sermon.audioPath ? `/sermon/${sermon.id}` : undefined,
    relevanceScore: score,
    reason: query.trim()
      ? `Matches your search for “${query.trim().slice(0, 80)}”.`
      : "A published sermon from Emmaus.",
    excerpt,
  };
}

function archiveCard(result: SermonSearchResult): SermonSearchCardResult {
  const excerpt = (result.summary?.trim() || result.transcriptEvidence || "").slice(0, 300);
  return {
    sermonId: result.sermonId,
    segmentId: result.segmentId,
    title: result.title,
    speaker: result.speaker,
    sermonDate: result.sermonDate,
    series: result.series,
    scriptureReference: result.scriptureReference,
    youtubeUrl: result.youtubeUrl,
    timestampedUrl: result.timestampedUrl,
    summary: excerpt,
    timestampSeconds: result.absoluteStartSeconds ?? result.startTimeSeconds,
    timestampLabel: result.timestampLabel,
    transcriptEvidence: result.transcriptEvidence,
    source: "archive",
    audioUrl: result.audioUrl,
    relativeStartSeconds: result.relativeStartSeconds,
    relativeTimestampLabel: result.relativeTimestampLabel,
    youtubeVideoId: result.youtubeVideoId,
    relevanceScore: result.relevanceScore,
    reason: `Matches an approved ICC sermon archive segment${result.timestampLabel ? ` at ${result.timestampLabel}` : ""}.`,
    excerpt,
  };
}

/**
 * Return the publication-safe hybrid set used by typed Ask Emmaus and Voice.
 * Canonical records and their knowledge-index entries are preferred, while
 * approved archive segments fill gaps such as Prodigal/Luke 15.
 */
export async function retrieveSermons(
  query: string,
  bibleBookId?: string,
  bibleChapter?: number,
  maxResults = 3,
): Promise<SermonSearchCardResult[]> {
  const minScore = parseInt(process.env.EMMAUS_SERMON_MIN_SCORE ?? "5", 10);
  const tStart = Date.now();

  try {
    const [published, indexResults, archiveResults] = await Promise.all([
      Promise.race([
        listPublishedSermons().catch((err) => {
          logger.warn({ err: String(err) }, "Canonical sermon source unavailable");
          return null;
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), RETRIEVAL_TIMEOUT_MS)),
      ]),
      Promise.race([
        searchKnowledgeIndex(query, bibleBookId, bibleChapter).catch((err) => {
          logger.warn({ err: String(err) }, "Sermon knowledge index unavailable");
          return null;
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), RETRIEVAL_TIMEOUT_MS)),
      ]),
      Promise.race([
        searchSermons(query, { bibleBookId, bibleChapter, maxResults: Math.max(maxResults, 5) }).catch((err) => {
          logger.warn({ err: String(err) }, "YouTube sermon archive unavailable");
          return null;
        }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), RETRIEVAL_TIMEOUT_MS)),
      ]),
    ]);

    const publishedRows = published ?? [];
    const canonicalById = new Map(publishedRows.map((sermon) => [sermon.id, sermon]));
    const suppressedVideoIds = new Set(
      publishedRows.map((sermon) => sermon.youtubeVideoId.trim()).filter(Boolean),
    );
    const candidates: Array<{ result: SermonSearchCardResult; sourceRank: number }> = [];

    for (const sermon of publishedRows) {
      if (!isEligibleCanonical(sermon)) continue;
      const score = scoreCanonicalSermon(sermon, query, bibleBookId, bibleChapter);
      if (score >= minScore) {
        candidates.push({ result: canonicalCard(sermon, score, query), sourceRank: 3 });
      }
    }

    for (const indexed of indexResults ?? []) {
      if (indexed.score < minScore) continue;
      const canonical = canonicalById.get(indexed.sermonId);
      if (canonical && isEligibleCanonical(canonical)) {
        if (!candidates.some(({ result }) => result.sermonId === canonical.id)) {
          candidates.push({
            result: canonicalCard(canonical, indexed.score, query, indexed.summary || indexed.mainTheme),
            sourceRank: 2,
          });
        }
        continue;
      }
      // The index query is publication-joined. This fallback covers a brief
      // list timeout while retaining a canonical-only member route.
      if (indexed.sermonId && indexed.title.trim() && indexed.speaker.trim()) {
        const indexedSermon: CanonicalSermon = {
          id: indexed.sermonId,
          legacyJsonId: null,
          title: indexed.title,
          speaker: indexed.speaker,
          sermonDate: indexed.sermonDate,
          series: indexed.series ?? "",
          scriptureReference: indexed.scriptureReference,
          scriptureBookIds: indexed.scriptureBookIds,
          scriptureChapters: indexed.scriptureChapters,
          youtubeUrl: indexed.youtubeUrl,
          youtubeVideoId: "",
          audioPath: indexed.audioPath,
          notes: "",
          transcript: "",
          fullTranscript: "",
          transcriptStatus: "none",
          summary: indexed.summary,
          themes: [],
          keywords: [],
          mainTheme: indexed.mainTheme,
          sections: [],
          sermonStartTime: "",
          sermonEndTime: "",
          detectionConfidence: 0,
          detectionMethod: "none",
          status: "Published",
          publishedAt: null,
          processingStage: "complete",
          processingError: "",
          createdAt: "",
          updatedAt: "",
          displayOrder: 0,
        };
        candidates.push({ result: canonicalCard(indexedSermon, indexed.score, query, indexed.summary), sourceRank: 2 });
      }
    }

    for (const archived of archiveResults ?? []) {
      if (
        suppressedVideoIds.has(archived.youtubeVideoId) ||
        suppressedVideoIds.has(archived.sermonId)
      ) {
        continue;
      }
      if (
        !archived.title.trim() ||
        !archived.speaker.trim() ||
        archived.speaker.trim().toLowerCase() === "unknown speaker" ||
        !isValidYouTubeUrl(archived.youtubeUrl)
      ) {
        continue;
      }
      candidates.push({ result: archiveCard(archived), sourceRank: 1 });
    }

    const deduped = new Map<string, { result: SermonSearchCardResult; sourceRank: number }>();
    for (const candidate of candidates) {
      const key = candidate.result.source === "canonical"
        ? `canonical:${candidate.result.sermonId}`
        : `archive:${candidate.result.youtubeVideoId || candidate.result.youtubeUrl}`;
      const existing = deduped.get(key);
      if (
        !existing ||
        candidate.sourceRank > existing.sourceRank ||
        (candidate.sourceRank === existing.sourceRank &&
          (candidate.result.relevanceScore ?? 0) > (existing.result.relevanceScore ?? 0))
      ) {
        deduped.set(key, candidate);
      }
    }

    const results = [...deduped.values()]
      .sort((a, b) =>
        b.sourceRank - a.sourceRank ||
        (b.result.relevanceScore ?? 0) - (a.result.relevanceScore ?? 0),
      )
      .slice(0, maxResults)
      .map(({ result }) => result);

    logger.info(
      {
        query: query.slice(0, 60),
        results: results.length,
        sources: results.map((result) => result.source),
        ms: Date.now() - tStart,
      },
      "Hybrid sermon retrieval complete",
    );
    return results;
  } catch (err) {
    logger.warn({ err: String(err), ms: Date.now() - tStart }, "Hybrid sermon retrieval failed");
    return [];
  }
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

const RETRIEVAL_TIMEOUT_MS = 2500;

/** Return the strongest result from the same hybrid contract used by cards. */
export async function retrieveSermon(
  query: string,
  bibleBookId?: string,
  bibleChapter?: number,
): Promise<SermonRetrievalResult | null> {
  const [result] = await retrieveSermons(query, bibleBookId, bibleChapter, 1);
  return result ?? null;
}

// ─── URL Helpers ──────────────────────────────────────────────────────────────

/**
 * Construct a YouTube link that opens at the given timestamp.
 * Falls back to the base URL when no timestamp is provided or the URL is invalid.
 * Never fabricates a video ID or timestamp.
 */
export function buildTimestampedUrl(youtubeUrl: string, timestampSeconds?: number): string {
  if (!timestampSeconds || timestampSeconds <= 0) return youtubeUrl;
  try {
    const url = new URL(youtubeUrl);
    url.searchParams.set("t", `${Math.round(timestampSeconds)}s`);
    return url.toString();
  } catch {
    return youtubeUrl;
  }
}

/**
 * Format seconds as M:SS for display (e.g. 1122 → "18:42").
 */
export function formatTimestampLabel(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
