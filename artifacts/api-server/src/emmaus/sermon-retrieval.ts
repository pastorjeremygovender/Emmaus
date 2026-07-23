/**
 * Emmaus Sermon Retrieval — Verified Record Search
 *
 * Provides deterministic keyword + scripture matching against the verified
 * published sermon registry. Never fabricates titles, speakers, timestamps,
 * or YouTube links — all data comes from the admin-approved record set.
 *
 * Retrieval is score-based with a minimum threshold so weak matches are
 * suppressed rather than shown. When no verified match clears the threshold,
 * returns null and no sermon card is shown.
 *
 * YouTube link construction uses the stored URL only. When the stored URL
 * contains a placeholder video ID, the link still opens YouTube but will not
 * resolve to the correct video until a real ID is stored.
 *
 * Optional env:
 *   EMMAUS_SERMON_MIN_SCORE — minimum retrieval score (default: 5)
 */

// ─── Verified Sermon Registry ─────────────────────────────────────────────────
//
// Mirrors the published sermons from admin-demo-data.ts on the frontend.
// Only sermons with status: "published" and pastorEdited: true appear here.
// Do not add entries without a corresponding verified admin record.

interface VerifiedSermon {
  id: string;
  title: string;
  speaker: string;
  sermonDate: string;    // ISO date "YYYY-MM-DD"
  series?: string;
  scriptureReference: string;  // display label, e.g. "John 3:1–21"
  scriptureBookIds: string[];  // normalised lowercase book ids for matching
  scriptureChapters: number[]; // chapters covered
  youtubeUrl: string;          // stored URL — may contain PLACEHOLDER_VIDEO_ID
  summary: string;
  topics: string[];    // lowercase topic tags — score 4 each
  /**
   * High-specificity phrases that uniquely identify this sermon.
   * Each match scores 5 points — enough to clear the default threshold alone.
   * Use for proper nouns, rare phrases, or exact scripture references that
   * cannot reasonably appear in an unrelated conversation.
   */
  priorityKeywords: string[];
  keywords: string[];  // lowercase keyword phrases — score 3 each
}

const VERIFIED_SERMONS: VerifiedSermon[] = [
  {
    id: "sermon-john-3",
    title: "Born Again: The Night Nicodemus Met Jesus",
    speaker: "Pastor Jeremy Govender",
    sermonDate: "2024-09-15",
    series: "Gospel of John",
    scriptureReference: "John 3:1–21",
    scriptureBookIds: ["john"],
    scriptureChapters: [3],
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID",
    summary:
      'Jesus tells Nicodemus something that changes everything: "You must be born again." What does it mean, and why does it matter for you today?',
    topics: [
      "salvation",
      "rebirth",
      "holy spirit",
      "new birth",
      "eternal life",
      "regeneration",
    ],
    // Phrases unique enough to this sermon that a single match clears threshold
    priorityKeywords: [
      "nicodemus",
      "born again",
      "john 3:16",
      "born of water",
      "born of spirit",
    ],
    keywords: [
      "john 3",
      "spirit",
      "eternal life",
      "darkness and light",
      "believe",
      "perish",
    ],
  },
  {
    id: "sermon-2-samuel-9",
    title: "God's Kindness Restores the Broken",
    speaker: "Pastor Jeremy Govender",
    sermonDate: "2024-11-10",
    series: "Stories of Grace",
    scriptureReference: "2 Samuel 9",
    scriptureBookIds: ["2samuel", "2-samuel", "2 samuel"],
    scriptureChapters: [9],
    youtubeUrl: "https://www.youtube.com/watch?v=PLACEHOLDER_VIDEO_ID",
    summary:
      "Exploring how God's covenant kindness reaches those who feel most broken and unworthy, through the story of Mephibosheth.",
    topics: [
      "grace",
      "restoration",
      "identity",
      "belonging",
      "covenant kindness",
      "worth",
      "brokenness",
    ],
    // Phrases unique enough to this sermon that a single match clears threshold
    priorityKeywords: [
      "mephibosheth",
      "lo debar",
      "hesed",
      "2 samuel 9",
    ],
    keywords: [
      "david",
      "covenant",
      "kindness",
      "broken",
      "restore",
      "worthy",
      "unworthy",
      "2 samuel",
      "table",
    ],
  },
];

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreSermon(
  sermon: VerifiedSermon,
  query: string,
  bibleBookId?: string,
  bibleChapter?: number
): number {
  let score = 0;
  const q = query.toLowerCase();

  // Strong signal: the user's current Bible passage matches the sermon scripture.
  // A Bible-context match on both book + chapter is the highest-confidence signal.
  if (bibleBookId) {
    const bookIdNorm = bibleBookId.toLowerCase();
    if (sermon.scriptureBookIds.includes(bookIdNorm)) {
      score += 12;
      if (bibleChapter != null && sermon.scriptureChapters.includes(bibleChapter)) {
        score += 8; // exact chapter match
      }
    }
  }

  // Topic match — medium signal
  for (const topic of sermon.topics) {
    if (q.includes(topic)) score += 4;
  }

  // Priority keyword match — high signal; unique phrases that identify this sermon
  for (const kw of sermon.priorityKeywords) {
    if (q.includes(kw)) score += 5;
  }

  // Standard keyword match — medium signal
  for (const kw of sermon.keywords) {
    if (q.includes(kw)) score += 3;
  }

  // Book name mentioned in query
  for (const bookId of sermon.scriptureBookIds) {
    if (q.includes(bookId)) score += 2;
  }

  return score;
}

// ─── Public Result Type ───────────────────────────────────────────────────────

export interface SermonRetrievalResult {
  sermonId: string;
  title: string;
  speaker: string;
  sermonDate: string;
  series?: string;
  scriptureReference: string;
  youtubeUrl: string;
  timestampedUrl: string;     // same as youtubeUrl when no segment timestamp
  summary: string;
  timestampSeconds?: number;  // present only when a segment-level timestamp is stored
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

/**
 * Find the strongest verified sermon match for this query.
 *
 * Returns null when:
 *  - No sermon clears the minimum score threshold (weak / no match)
 *  - No verified sermons exist in the registry
 *
 * The caller must not show a sermon card when this returns null.
 */
export function retrieveSermon(
  query: string,
  bibleBookId?: string,
  bibleChapter?: number
): SermonRetrievalResult | null {
  const minScore = parseInt(process.env.EMMAUS_SERMON_MIN_SCORE ?? "5", 10);
  let best: { sermon: VerifiedSermon; score: number } | null = null;

  for (const sermon of VERIFIED_SERMONS) {
    const score = scoreSermon(sermon, query, bibleBookId, bibleChapter);
    if (score >= minScore && (!best || score > best.score)) {
      best = { sermon, score };
    }
  }

  if (!best) return null;

  const { sermon } = best;
  // No transcript segments exist yet — timestamp is omitted until segment data is stored
  const timestampSeconds: number | undefined = undefined;
  const timestampedUrl = buildTimestampedUrl(sermon.youtubeUrl, timestampSeconds);

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
    timestampSeconds,
  };
}

// ─── URL Helpers ──────────────────────────────────────────────────────────────

/**
 * Construct a YouTube link that opens at the given timestamp.
 * Falls back to the base URL when no timestamp is provided or the URL is invalid.
 * Never fabricates a video ID or timestamp.
 */
export function buildTimestampedUrl(
  youtubeUrl: string,
  timestampSeconds?: number
): string {
  if (!timestampSeconds || timestampSeconds <= 0) return youtubeUrl;
  try {
    const url = new URL(youtubeUrl);
    url.searchParams.set("t", `${timestampSeconds}s`);
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
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
