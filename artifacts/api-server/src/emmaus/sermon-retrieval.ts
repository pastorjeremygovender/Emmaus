/**
 * Emmaus Sermon Retrieval — Verified Record Search
 *
 * Priority order:
 *   1. YouTube Archive search (approved sermon segments from sermon-store)
 *   2. Hard-coded VERIFIED_SERMONS registry (demo/fallback — for records not yet
 *      imported into the archive but already manually curated)
 *
 * The YouTube archive search is preferred when segments exist. The hardcoded
 * registry provides a fallback so existing curated sermons still surface.
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

import { searchSermons } from "../lib/sermon-search.js";
import { logger } from "../lib/logger.js";
import { PASTOR_DISPLAY_NAME } from "../lib/pastor-name.js";
import {
  listPublishedSermons,
  getPublishedYoutubeVideoIds,
  type CanonicalSermon,
} from "../lib/canonical-sermon-store.js";

// ─── Verified Sermon Registry (hardcoded demo fallback) ───────────────────────
//
// These records back-fill the search when the YouTube archive has no
// approved segments. Only add entries with a corresponding admin record.

interface VerifiedSermon {
  id: string;
  title: string;
  speaker: string;
  sermonDate: string;    // ISO date "YYYY-MM-DD"
  series?: string;
  scriptureReference: string;
  scriptureBookIds: string[];
  scriptureChapters: number[];
  youtubeUrl: string;
  summary: string;
  topics: string[];
  priorityKeywords: string[];
  keywords: string[];
}

const VERIFIED_SERMONS: VerifiedSermon[] = [
  {
    id: "sermon-john-3",
    title: "Born Again: The Night Nicodemus Met Jesus",
    speaker: PASTOR_DISPLAY_NAME,
    sermonDate: "2024-09-15",
    series: "Gospel of John",
    scriptureReference: "John 3:1–21",
    scriptureBookIds: ["john"],
    scriptureChapters: [3],
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID",
    summary:
      'Jesus tells Nicodemus something that changes everything: "You must be born again." What does it mean, and why does it matter for you today?',
    topics: ["salvation", "rebirth", "holy spirit", "new birth", "eternal life", "regeneration"],
    priorityKeywords: ["nicodemus", "born again", "john 3:16", "born of water", "born of spirit"],
    keywords: ["john 3", "spirit", "eternal life", "darkness and light", "believe", "perish"],
  },
  {
    id: "sermon-2-samuel-9",
    title: "God's Kindness Restores the Broken",
    speaker: PASTOR_DISPLAY_NAME,
    sermonDate: "2024-11-10",
    series: "Stories of Grace",
    scriptureReference: "2 Samuel 9",
    scriptureBookIds: ["2samuel", "2-samuel", "2 samuel"],
    scriptureChapters: [9],
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID",
    summary:
      "Exploring how God's covenant kindness reaches those who feel most broken and unworthy, through the story of Mephibosheth.",
    topics: ["grace", "restoration", "identity", "belonging", "covenant kindness", "worth", "brokenness"],
    priorityKeywords: ["mephibosheth", "lo debar", "hesed", "2 samuel 9"],
    keywords: ["david", "covenant", "kindness", "broken", "restore", "worthy", "unworthy", "2 samuel", "table"],
  },
];

// ─── Scoring (hardcoded registry) ─────────────────────────────────────────────

function scoreVerifiedSermon(
  sermon: VerifiedSermon,
  query: string,
  bibleBookId?: string,
  bibleChapter?: number
): number {
  let score = 0;
  const q = query.toLowerCase();

  if (bibleBookId) {
    const bookIdNorm = bibleBookId.toLowerCase();
    if (sermon.scriptureBookIds.includes(bookIdNorm)) {
      score += 12;
      if (bibleChapter != null && sermon.scriptureChapters.includes(bibleChapter)) {
        score += 8;
      }
    }
  }
  for (const topic of sermon.topics) { if (q.includes(topic)) score += 4; }
  for (const kw of sermon.priorityKeywords) { if (q.includes(kw)) score += 5; }
  for (const kw of sermon.keywords) { if (q.includes(kw)) score += 3; }
  for (const bookId of sermon.scriptureBookIds) { if (q.includes(bookId)) score += 2; }

  return score;
}

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
  /** "canonical" = DB sermon table; "archive" = YouTube TF/IDF; "registry" = hardcoded fallback */
  source: "canonical" | "archive" | "registry";
  audioUrl?: string;                 // in-app audio URL (Listen)
  relativeStartSeconds?: number;     // position within trimmed audio
  relativeTimestampLabel?: string;
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

// ─── Retrieval ────────────────────────────────────────────────────────────────

const RETRIEVAL_TIMEOUT_MS = 2500;

/**
 * Find the strongest verified sermon match for this query.
 *
 * Priority:
 *   1. Canonical DB sermons (Published) — highest precedence
 *   2. YouTube Archive search (suppresses videos linked to canonical sermons)
 *   3. Hardcoded registry fallback
 *
 * Returns null when no match clears the minimum score threshold.
 * The caller must not show a sermon card when this returns null.
 */
export async function retrieveSermon(
  query: string,
  bibleBookId?: string,
  bibleChapter?: number
): Promise<SermonRetrievalResult | null> {
  const minScore = parseInt(process.env.EMMAUS_SERMON_MIN_SCORE ?? "5", 10);
  const tStart = Date.now();

  // ── 1. Canonical DB sermons (priority 1) ─────────────────────────────────

  try {
    const canonical = await Promise.race([
      listPublishedSermons(),
      new Promise<null>((r) => setTimeout(() => r(null), RETRIEVAL_TIMEOUT_MS)),
    ]);

    if (canonical && canonical.length > 0) {
      let best: { sermon: CanonicalSermon; score: number } | null = null;
      for (const sermon of canonical) {
        const score = scoreCanonicalSermon(sermon, query, bibleBookId, bibleChapter);
        if (score >= minScore && (!best || score > best.score)) {
          best = { sermon, score };
        }
      }

      if (best) {
        const { sermon } = best;
        logger.info(
          { source: "canonical", sermonId: sermon.id, score: best.score, ms: Date.now() - tStart },
          "Sermon retrieved from canonical DB"
        );
        const audioUrl = sermon.audioPath
          ? `${process.env.BASE_URL ?? ""}/storage/objects/${sermon.audioPath.replace(/^\/objects\//, "")}`
          : undefined;
        return {
          sermonId: sermon.id,
          title: sermon.title,
          speaker: sermon.speaker,
          sermonDate: sermon.sermonDate,
          series: sermon.series || undefined,
          scriptureReference: sermon.scriptureReference,
          youtubeUrl: sermon.youtubeUrl,
          timestampedUrl: sermon.youtubeUrl,
          summary: sermon.summary || sermon.mainTheme,
          source: "canonical",
          audioUrl,
        };
      }
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "Canonical sermon retrieval failed — falling back to archive");
  }

  // ── 2. YouTube Archive search (suppress canonical-linked videos) ──────────

  // Fetch the set of youtube_video_ids covered by canonical sermons so we
  // don't return both a canonical card AND an archive card for the same sermon.
  let suppressedVideoIds: Set<string> = new Set();
  try {
    suppressedVideoIds = await getPublishedYoutubeVideoIds();
  } catch { /* non-fatal — proceed without suppression */ }

  try {
    const archiveResults = await Promise.race([
      searchSermons(query, { bibleBookId, bibleChapter, maxResults: 5 }),
      new Promise<null>((r) => setTimeout(() => r(null), RETRIEVAL_TIMEOUT_MS)),
    ]);

    if (archiveResults && archiveResults.length > 0) {
      // Skip results whose video is already covered by a canonical sermon
      const best = archiveResults.find(r => !suppressedVideoIds.has(r.sermonId));
      if (best) {
        logger.info(
          { source: "archive", score: best.relevanceScore, ms: Date.now() - tStart },
          "Sermon retrieved from archive"
        );
        return {
          sermonId: best.sermonId,
          segmentId: best.segmentId,
          title: best.title,
          speaker: best.speaker,
          sermonDate: best.sermonDate,
          series: best.series,
          scriptureReference: best.scriptureReference,
          youtubeUrl: best.youtubeUrl,
          timestampedUrl: best.timestampedUrl,
          summary: best.summary ?? best.transcriptEvidence,
          timestampSeconds: best.absoluteStartSeconds ?? best.startTimeSeconds,
          timestampLabel: best.timestampLabel,
          transcriptEvidence: best.transcriptEvidence,
          source: "archive",
          audioUrl: best.audioUrl,
          relativeStartSeconds: best.relativeStartSeconds,
          relativeTimestampLabel: best.relativeStartSeconds !== undefined
            ? formatTimestampLabel(best.relativeStartSeconds)
            : undefined,
        };
      }
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "Archive search failed — falling back to registry");
  }

  // ── 3. Hardcoded registry fallback ───────────────────────────────────────

  let best: { sermon: VerifiedSermon; score: number } | null = null;
  for (const sermon of VERIFIED_SERMONS) {
    const score = scoreVerifiedSermon(sermon, query, bibleBookId, bibleChapter);
    if (score >= minScore && (!best || score > best.score)) {
      best = { sermon, score };
    }
  }

  if (!best) return null;

  const { sermon } = best;
  const timestampedUrl = buildTimestampedUrl(sermon.youtubeUrl, undefined);

  return {
    sermonId: sermon.id,
    title: sermon.title,
    speaker: sermon.speaker,
    sermonDate: sermon.sermonDate,
    series: sermon.series,
    scriptureReference: sermon.scriptureReference,
    youtubeUrl: sermon.youtubeUrl,
    timestampedUrl,
    summary: sermon.summary,
    source: "registry",
  };
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
