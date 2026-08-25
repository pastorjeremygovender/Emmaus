/**
 * Sermon Search — Hybrid Keyword + Scripture Matching
 *
 * Builds an in-memory inverted index from approved sermon segments and scores
 * queries using TF-IDF-like term overlap, Scripture reference matching, and
 * topic/keyword boosting.
 *
 * Does NOT query YouTube live — search operates entirely on the local index.
 * The index is rebuilt from the sermon store on demand (after import/approval).
 *
 * Integration with Ask Emmaus:
 *   - searchSermons(query, ctx) → SermonSearchResult[]
 *   - Run with bounded timeout; return [] on timeout/error
 *
 * Uses the project's existing in-process approach (no external vector DB).
 * Scripture reference matching is deterministic; no LLM involved in retrieval.
 */

import { getAllVideos, getAllSegments, type YoutubeVideoRecord, type SermonSegment } from "./sermon-store.js";
import { buildTimestampedUrl, formatTimestampLabel } from "../emmaus/sermon-retrieval.js";
import { logger } from "./logger.js";

// ─── Index types ──────────────────────────────────────────────────────────────

interface IndexedSegment {
  segmentId: string;
  videoId: string;
  youtubeVideoId: string;
  youtubeUrl: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  cleanedText: string;
  wordCount: number;
  summary?: string;
  // Pre-computed
  terms: Set<string>;
  termFreq: Map<string, number>;
  themes: string[];
  keywords: string[];
  scriptureRefs: string[];
  // Parent video data
  videoTitle: string;
  speaker: string;
  sermonDate: string;
  series?: string;
  scriptureReference: string;
  scriptureBookIds: string[];
  scriptureChapters: number[];
  // Dual timestamp model
  absoluteStartSeconds: number;       // same as startTimeSeconds (YouTube-correct)
  relativeStartSeconds: number;       // absolute - finalSermonStartSeconds (audio position)
  isSermonContent: boolean;
  audioUrl?: string;                  // populated when audio asset is ready
}

interface InvertedIndex {
  segments: IndexedSegment[];
  // term → set of segment indices
  termIndex: Map<string, Set<number>>;
  // book ID → set of segment indices
  bookIndex: Map<string, Set<number>>;
  // theme → set of segment indices
  themeIndex: Map<string, Set<number>>;
  totalDocuments: number;
  // term → document frequency (number of segments containing the term)
  docFreq: Map<string, number>;
  builtAt: number;
}

// ─── Public result type ───────────────────────────────────────────────────────

export interface SermonSearchResult {
  sermonId: string;         // internal video record ID
  segmentId: string;
  title: string;
  speaker: string;
  sermonDate: string;
  series?: string;
  scriptureReference: string;
  matchingReference?: string;        // the specific segment ref that matched the requested chapter
  youtubeUrl: string;
  timestampedUrl: string;
  startTimeSeconds: number;
  endTimeSeconds: number;
  timestampLabel: string;
  transcriptEvidence: string;  // cleaned segment text excerpt
  summary?: string;
  relevanceScore: number;
  absoluteStartSeconds: number;      // YouTube-correct timestamp (Watch)
  relativeStartSeconds: number;      // audio position (Listen)
  relativeTimestampLabel?: string;   // human-readable relative position, e.g. "12:34"
  audioUrl?: string;                 // in-app audio URL when available
}

// ─── Tokenisation ─────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "a","an","the","and","or","but","in","on","at","to","for","of","with",
  "is","are","was","were","be","been","being","have","has","had","do","does",
  "did","will","would","could","should","may","might","shall","can","this",
  "that","these","those","it","its","we","you","he","she","they","them",
  "their","our","your","his","her","i","me","my","us","what","which","who",
  "whom","when","where","why","how","all","more","also","so","if","not","by",
  "from","up","about","into","through","than","then","there","here","very",
  "just","as","much","many","some","any","no","yes",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens) {
    freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return freq;
}

// ─── Scripture reference detection in query ───────────────────────────────────

const BOOK_ALIASES: Record<string, string> = {
  "gen": "genesis", "ex": "exodus", "exod": "exodus", "lev": "leviticus",
  "num": "numbers", "deut": "deuteronomy", "dt": "deuteronomy",
  "josh": "joshua", "jdg": "judges", "judg": "judges",
  "1sam": "1samuel", "2sam": "2samuel", "1ki": "1kings", "2ki": "2kings",
  "1chr": "1chronicles", "2chr": "2chronicles",
  "ps": "psalms", "psa": "psalms", "prov": "proverbs",
  "eccl": "ecclesiastes", "eccles": "ecclesiastes",
  "isa": "isaiah", "jer": "jeremiah", "lam": "lamentations",
  "ezek": "ezekiel", "dan": "daniel",
  "hos": "hosea", "mic": "micah", "hab": "habakkuk", "zeph": "zephaniah",
  "hag": "haggai", "zech": "zechariah", "mal": "malachi",
  "matt": "matthew", "mt": "matthew", "mk": "mark", "lk": "luke",
  "jn": "john", "rom": "romans",
  "1cor": "1corinthians", "2cor": "2corinthians",
  "gal": "galatians", "eph": "ephesians", "phil": "philippians",
  "col": "colossians", "1thess": "1thessalonians", "2thess": "2thessalonians",
  "1tim": "1timothy", "2tim": "2timothy", "tit": "titus", "phm": "philemon",
  "heb": "hebrews", "jas": "james", "1pet": "1peter", "2pet": "2peter",
  "1jn": "1john", "2jn": "2john", "3jn": "3john", "rev": "revelation",
  "jude": "jude",
};

const BOOK_NAME_RE = /\b(?:(\d)\s+)?([a-z]+)\s+(\d+)(?::(\d+))?/gi;

interface ScriptureRef {
  bookId: string;
  chapter: number;
  verse?: number;
}

function extractScriptureRefs(query: string): ScriptureRef[] {
  const refs: ScriptureRef[] = [];
  const lower = query.toLowerCase();
  BOOK_NAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;

  while ((m = BOOK_NAME_RE.exec(lower)) !== null) {
    const prefix = m[1] ? `${m[1]}` : "";
    const rawBook = prefix + m[2].replace(/\./g, "");
    const chapter = parseInt(m[3]);
    const verse = m[4] ? parseInt(m[4]) : undefined;

    const bookId = BOOK_ALIASES[rawBook] ?? rawBook;
    refs.push({ bookId, chapter, verse });
  }

  return refs;
}

// ─── Index ────────────────────────────────────────────────────────────────────

let _index: InvertedIndex | null = null;
let _indexBuilding = false;

export function invalidateIndex(): void {
  _index = null;
  logger.info("Sermon search index invalidated");
}

async function buildIndex(): Promise<InvertedIndex> {
  if (_indexBuilding) {
    // Wait for concurrent build to finish
    await new Promise((r) => setTimeout(r, 200));
    if (_index) return _index;
  }

  _indexBuilding = true;
  const t0 = Date.now();

  try {
    const [videos, segments] = await Promise.all([getAllVideos(), getAllSegments()]);

    // Build video lookup map
    const videoMap = new Map<string, YoutubeVideoRecord>(videos.map((v) => [v.id, v]));

    // Only index approved segments from approved sermons
    const approvedVideoIds = new Set(
      videos
        .filter((v) =>
          (v.reviewStatus === "approved" || v.reviewStatus === "auto-approved") &&
          v.contentType === "sermon" &&
          v.speaker?.trim() &&
          v.speaker.trim().toLowerCase() !== "unknown speaker" &&
          !/\bshorts?\b/i.test(v.title) &&
          !/\bshorts?\b/i.test(v.youtubeUrl)
        )
        .map((v) => v.id)
    );

    const indexedSegments: IndexedSegment[] = [];
    const termIndex = new Map<string, Set<number>>();
    const bookIndex = new Map<string, Set<number>>();
    const themeIndex = new Map<string, Set<number>>();
    const docFreq = new Map<string, number>();

    for (const seg of segments) {
      if (!approvedVideoIds.has(seg.videoId)) continue;
      const video = videoMap.get(seg.videoId);
      if (!video) continue;

      // Skip pre-sermon content (worship/announcements) when isSermonContent is explicitly false.
      // Legacy segments without the field (undefined) are always included.
      if (seg.isSermonContent === false) continue;

      const text = [
        seg.cleanedText,
        seg.summary ?? "",
        (seg.themes ?? []).join(" "),
        (seg.keywords ?? []).join(" "),
      ].join(" ");

      const tokens = tokenize(text);
      const terms = new Set(tokens);
      const freq = termFrequency(tokens);

      const idx = indexedSegments.length;

      // Update inverted index
      for (const term of terms) {
        if (!termIndex.has(term)) termIndex.set(term, new Set());
        termIndex.get(term)!.add(idx);
        docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
      }

      // Scripture book index
      for (const bookId of video.scriptureBookIds ?? []) {
        if (!bookIndex.has(bookId)) bookIndex.set(bookId, new Set());
        bookIndex.get(bookId)!.add(idx);
      }
      for (const ref of seg.scriptureRefs ?? []) {
        const normalized = ref.toLowerCase().replace(/\s+/g, "");
        if (!bookIndex.has(normalized)) bookIndex.set(normalized, new Set());
        bookIndex.get(normalized)!.add(idx);
      }

      // Theme index
      for (const theme of [...(seg.themes ?? []), ...(video.topics ?? [])]) {
        const t = theme.toLowerCase();
        if (!themeIndex.has(t)) themeIndex.set(t, new Set());
        themeIndex.get(t)!.add(idx);
      }

      // Compute dual timestamps
      const finalSermonStart = video.finalSermonStartSeconds ?? 0;
      const absoluteStart = seg.absoluteStartSeconds ?? seg.startTimeSeconds;
      const relativeStart = seg.relativeStartSeconds ?? Math.max(0, absoluteStart - finalSermonStart);

      indexedSegments.push({
        segmentId: seg.id,
        videoId: seg.videoId,
        youtubeVideoId: seg.youtubeVideoId,
        youtubeUrl: video.youtubeUrl,
        startTimeSeconds: seg.startTimeSeconds,
        endTimeSeconds: seg.endTimeSeconds,
        cleanedText: seg.cleanedText,
        wordCount: seg.wordCount,
        summary: seg.summary,
        terms,
        termFreq: freq,
        themes: seg.themes ?? [],
        keywords: seg.keywords ?? [],
        scriptureRefs: seg.scriptureRefs ?? [],
        videoTitle: video.title,
        speaker: video.speaker ?? "Unknown Speaker",
        sermonDate: video.sermonDate ?? video.publishedAt.slice(0, 10),
        series: video.series,
        scriptureReference: (video.scriptureReferences ?? []).join("; ") || video.title,
        scriptureBookIds: video.scriptureBookIds ?? [],
        scriptureChapters: video.scriptureChapters ?? [],
        absoluteStartSeconds: absoluteStart,
        relativeStartSeconds: relativeStart,
        isSermonContent: seg.isSermonContent ?? true,
        audioUrl: video.audioProcessingStatus === "ready" ? video.audioUrl : undefined,
      });
    }

    const index: InvertedIndex = {
      segments: indexedSegments,
      termIndex,
      bookIndex,
      themeIndex,
      totalDocuments: indexedSegments.length,
      docFreq,
      builtAt: Date.now(),
    };

    _index = index;
    logger.info(
      { segments: indexedSegments.length, terms: termIndex.size, ms: Date.now() - t0 },
      "Sermon search index built"
    );
    return index;

  } finally {
    _indexBuilding = false;
  }
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function scoreSegment(
  seg: IndexedSegment,
  queryTokens: string[],
  queryRefs: ScriptureRef[],
  bibleBookId?: string,
  bibleChapter?: number,
  index?: InvertedIndex,
): number {
  let score = 0;
  const N = index?.totalDocuments ?? 1;

  // TF-IDF term matching
  for (const qt of queryTokens) {
    if (seg.terms.has(qt)) {
      const tf = (seg.termFreq.get(qt) ?? 0) / Math.max(1, seg.wordCount);
      const df = index?.docFreq.get(qt) ?? 1;
      const idf = Math.log((N + 1) / (df + 1)) + 1;
      score += tf * idf * 3;
    }
  }

  // Scripture reference matching from query
  for (const ref of queryRefs) {
    if (seg.scriptureBookIds.includes(ref.bookId)) {
      score += 15;
      if (seg.scriptureChapters.includes(ref.chapter)) {
        score += 10;
      }
    }
    // Check segment-level refs
    for (const segRef of seg.scriptureRefs) {
      if (segRef.toLowerCase().includes(ref.bookId)) {
        score += 8;
      }
    }
  }

  // Bible passage context match (user is reading a specific passage)
  if (bibleBookId && seg.scriptureBookIds.includes(bibleBookId.toLowerCase())) {
    score += 12;
    if (bibleChapter && seg.scriptureChapters.includes(bibleChapter)) {
      score += 8;
    }
  }

  // Theme/keyword match
  for (const qt of queryTokens) {
    if (seg.themes.includes(qt)) score += 5;
    if (seg.keywords.includes(qt)) score += 3;
  }

  return score;
}

// ─── Public search ────────────────────────────────────────────────────────────

// MIN_SCORE is very low so raw TF-IDF text matches always pass the threshold.
// A single mention of a specific term in a 168-word segment scores ~0.13;
// a MIN_SCORE of 0.05 lets any genuine text match through.
// Once enrichment populates themes (+5) and keywords (+3), scores rise sharply
// and the top-ranked results will be strongly relevant.
const MIN_SCORE = 0.05;
const MAX_CANDIDATES = 5;
const SEARCH_TIMEOUT_MS = 3000;

export interface SearchOptions {
  bibleBookId?: string;
  bibleChapter?: number;
  maxResults?: number;
}

export async function searchSermons(
  query: string,
  options: SearchOptions = {},
): Promise<SermonSearchResult[]> {
  const { bibleBookId, bibleChapter, maxResults = 1 } = options;
  const t0 = Date.now();

  try {
    // Build or reuse index — abort if stale check takes too long
    const indexPromise = _index ? Promise.resolve(_index) : buildIndex();
    const index = await Promise.race([
      indexPromise,
      new Promise<null>((r) => setTimeout(() => r(null), SEARCH_TIMEOUT_MS)),
    ]);

    if (!index) {
      logger.warn("Sermon search timed out waiting for index");
      return [];
    }

    if (index.segments.length === 0) return [];

    const queryTokens = tokenize(query);
    const queryRefs = extractScriptureRefs(query);

    // Candidate segments — use inverted index to avoid scoring all segments
    const candidateIndices = new Set<number>();

    for (const qt of queryTokens) {
      for (const idx of index.termIndex.get(qt) ?? []) {
        candidateIndices.add(idx);
      }
    }
    for (const ref of queryRefs) {
      for (const idx of index.bookIndex.get(ref.bookId) ?? []) {
        candidateIndices.add(idx);
      }
    }
    if (bibleBookId) {
      for (const idx of index.bookIndex.get(bibleBookId.toLowerCase()) ?? []) {
        candidateIndices.add(idx);
      }
    }

    // Score candidates
    const scored: Array<{ seg: IndexedSegment; score: number }> = [];
    for (const idx of candidateIndices) {
      const seg = index.segments[idx];
      const score = scoreSegment(seg, queryTokens, queryRefs, bibleBookId, bibleChapter, index);
      if (score >= MIN_SCORE) {
        scored.push({ seg, score });
      }
    }

    // Sort by score desc, deduplicate by video (return best segment per video)
    scored.sort((a, b) => b.score - a.score);

    const seenVideos = new Set<string>();
    const results: SermonSearchResult[] = [];

    for (const { seg, score } of scored) {
      if (seenVideos.has(seg.videoId)) continue;
      seenVideos.add(seg.videoId);

      const timestampedUrl = buildTimestampedUrl(seg.youtubeUrl, seg.absoluteStartSeconds);
      const timestampLabel = formatTimestampLabel(seg.absoluteStartSeconds);
      const relativeTimestampLabel = seg.audioUrl
        ? formatTimestampLabel(seg.relativeStartSeconds)
        : undefined;
      const evidence = seg.cleanedText.slice(0, 300) + (seg.cleanedText.length > 300 ? "…" : "");

      results.push({
        sermonId: seg.videoId,
        segmentId: seg.segmentId,
        title: seg.videoTitle,
        speaker: seg.speaker,
        sermonDate: seg.sermonDate,
        series: seg.series,
        scriptureReference: seg.scriptureReference,
        youtubeUrl: seg.youtubeUrl,
        timestampedUrl,
        startTimeSeconds: seg.startTimeSeconds,
        endTimeSeconds: seg.endTimeSeconds,
        timestampLabel,
        transcriptEvidence: evidence,
        summary: seg.summary,
        relevanceScore: score,
        absoluteStartSeconds: seg.absoluteStartSeconds,
        relativeStartSeconds: seg.relativeStartSeconds,
        relativeTimestampLabel,
        audioUrl: seg.audioUrl,
      });

      if (results.length >= Math.max(maxResults, MAX_CANDIDATES)) break;
    }

    logger.info(
      { query: query.slice(0, 60), candidates: candidateIndices.size, results: results.length, ms: Date.now() - t0 },
      "Sermon search complete"
    );

    return results.slice(0, maxResults);

  } catch (err) {
    logger.warn({ err: String(err), ms: Date.now() - t0 }, "Sermon search failed");
    return [];
  }
}

// ─── Preached Here — Scripture-based lookup ───────────────────────────────────

/**
 * Classify whether a segment specifically and accurately references the target
 * Bible book and chapter.
 *
 * Returns one of three tiers:
 *   'exact'     — segment has a parsed scriptureRef that resolves to (book, chapter)
 *   'book-only' — segment belongs to a video tagged to the book, but no
 *                 segment-level ref confirms the chapter
 *   'none'      — segment refs exist for this book but all resolve to different
 *                 chapters, so it is a false positive and must be excluded
 *
 * The key correctness rule: use extractScriptureRefs() (numeric comparison) rather
 * than naïve string includes(), which would match "Luke 1" inside "Luke 10"/"Luke 11".
 */
function classifySegmentForChapter(
  seg: IndexedSegment,
  lowerBookId: string,
  chapter: number,
): { tier: "exact" | "book-only" | "none"; matchingRef: string | null } {
  // Segment-level scriptureRefs are the most reliable (AI-enriched, segment-scoped).
  if (seg.scriptureRefs.length > 0) {
    let mentionsThisBook = false;
    for (const ref of seg.scriptureRefs) {
      const parsed = extractScriptureRefs(ref);
      for (const p of parsed) {
        if (p.bookId === lowerBookId) {
          mentionsThisBook = true;
          if (p.chapter === chapter) {
            // Exact numeric match — not a substring match
            return { tier: "exact", matchingRef: ref };
          }
        }
      }
    }
    if (mentionsThisBook) {
      // Segment refs exist for this book but all resolve to different chapters.
      // Exclude to prevent Luke 10 bleeding into Luke 1 results.
      return { tier: "none", matchingRef: null };
    }
    // scriptureRefs are for other books — fall through to video-level check below
  }

  // Video-level scriptureBookIds covers the whole sermon (not this segment specifically).
  // Reliable for confirming book identity; not reliable for per-segment chapter attribution.
  if (seg.scriptureBookIds.includes(lowerBookId)) {
    return { tier: "book-only", matchingRef: null };
  }

  // Came here via term/text index — book name appears in transcript text.
  // Treat as book-level only; no chapter evidence.
  return { tier: "book-only", matchingRef: null };
}

/**
 * Relevance score for sorting chapter-specific results.
 * Verse-level matches score higher than chapter-only.
 */
function computeRefMatchScore(
  seg: IndexedSegment,
  lowerBookId: string,
  chapter: number,
): number {
  let best = 0;
  for (const ref of seg.scriptureRefs) {
    for (const p of extractScriptureRefs(ref)) {
      if (p.bookId === lowerBookId && p.chapter === chapter) {
        best = Math.max(best, p.verse !== undefined ? 2 : 1);
      }
    }
  }
  return best;
}

/** Structured return type for the Preached Here endpoint. */
export interface PreachedHereResult {
  /** Sermons with segment-level refs confirmed for the requested chapter. */
  chapterSermons: SermonSearchResult[];
  /**
   * Sermons associated with the book at video level only — shown as a
   * secondary fallback when no chapter-specific results exist.
   */
  bookSermons: SermonSearchResult[];
}

/**
 * Return sermons that reference a specific Bible chapter.
 * Used by GET /api/youtube-archive/preached-here.
 *
 * Returns { chapterSermons, bookSermons } so the caller can distinguish
 * chapter-specific results from broader book-level fallbacks.
 */
export async function searchByScripture(
  bookId: string,
  chapter?: number,
  maxResults = 10,
): Promise<PreachedHereResult> {
  const index = _index ?? await buildIndex().catch(() => null);
  if (!index) return { chapterSermons: [], bookSermons: [] };
  _index = index;

  const lowerBookId = bookId.toLowerCase();
  const candidateIndices = new Set<number>();

  // ── Primary: bookIndex (pre-tagged scriptureBookIds + segment scriptureRefs) ─
  for (const [key, indices] of _index.bookIndex) {
    const keyNorm = key.replace(/\s+/g, "").toLowerCase();
    if (keyNorm === lowerBookId || keyNorm.startsWith(lowerBookId)) {
      for (const idx of indices) candidateIndices.add(idx);
    }
  }

  // ── Fallback: term index when no structured data exists ───────────────────
  if (candidateIndices.size === 0) {
    for (const idx of _index.termIndex.get(lowerBookId) ?? []) {
      candidateIndices.add(idx);
    }
    const strippedId = lowerBookId.replace(/^\d/, "");
    if (strippedId !== lowerBookId) {
      for (const idx of _index.termIndex.get(strippedId) ?? []) {
        candidateIndices.add(idx);
      }
    }
  }

  // ── Classify candidates into chapter-specific vs. book-level ─────────────
  const chapterCandidates: Array<{
    seg: IndexedSegment;
    matchingRef: string | null;
    score: number;
  }> = [];
  const bookCandidates: Array<{ seg: IndexedSegment }> = [];
  const seenChapterVideos = new Set<string>();
  const seenBookVideos = new Set<string>();

  for (const idx of candidateIndices) {
    const seg = _index.segments[idx];
    if (!seg) continue;

    if (chapter !== undefined) {
      const { tier, matchingRef } = classifySegmentForChapter(seg, lowerBookId, chapter);

      if (tier === "exact") {
        if (!seenChapterVideos.has(seg.videoId)) {
          seenChapterVideos.add(seg.videoId);
          chapterCandidates.push({
            seg,
            matchingRef,
            score: computeRefMatchScore(seg, lowerBookId, chapter),
          });
        }
      } else if (tier === "book-only") {
        if (!seenBookVideos.has(seg.videoId)) {
          seenBookVideos.add(seg.videoId);
          bookCandidates.push({ seg });
        }
      }
      // tier === 'none' → skip (wrong chapter)
    } else {
      // No chapter filter — return all book matches
      if (!seenChapterVideos.has(seg.videoId)) {
        seenChapterVideos.add(seg.videoId);
        chapterCandidates.push({ seg, matchingRef: null, score: 0 });
      }
    }
  }

  // Sort chapter results: strongest ref match first, then most recent date
  chapterCandidates.sort(
    (a, b) =>
      b.score - a.score ||
      (b.seg.sermonDate > a.seg.sermonDate
        ? 1
        : b.seg.sermonDate < a.seg.sermonDate
        ? -1
        : 0),
  );

  // Remove from bookCandidates any sermon already confirmed chapter-specific
  const chapterVideoIds = new Set(chapterCandidates.map((c) => c.seg.videoId));
  const filteredBookCandidates = bookCandidates.filter(
    (b) => !chapterVideoIds.has(b.seg.videoId),
  );

  // ── Build result objects ───────────────────────────────────────────────────
  function buildSegResult(
    seg: IndexedSegment,
    matchingRef: string | null,
  ): SermonSearchResult {
    const timestampedUrl = buildTimestampedUrl(seg.youtubeUrl, seg.absoluteStartSeconds);
    const timestampLabel = formatTimestampLabel(seg.absoluteStartSeconds);
    const relativeTimestampLabel = seg.audioUrl
      ? formatTimestampLabel(seg.relativeStartSeconds)
      : undefined;
    const evidence =
      seg.cleanedText.slice(0, 200) + (seg.cleanedText.length > 200 ? "…" : "");
    return {
      sermonId: seg.videoId,
      segmentId: seg.segmentId,
      title: seg.videoTitle,
      speaker: seg.speaker,
      sermonDate: seg.sermonDate,
      series: seg.series,
      scriptureReference: seg.scriptureReference,
      matchingReference: matchingRef ?? undefined,
      youtubeUrl: seg.youtubeUrl,
      timestampedUrl,
      startTimeSeconds: seg.startTimeSeconds,
      endTimeSeconds: seg.endTimeSeconds,
      timestampLabel,
      transcriptEvidence: evidence,
      summary: seg.summary,
      relevanceScore: 1,
      absoluteStartSeconds: seg.absoluteStartSeconds,
      relativeStartSeconds: seg.relativeStartSeconds,
      relativeTimestampLabel,
      audioUrl: seg.audioUrl,
    };
  }

  const chapterSermons = chapterCandidates
    .slice(0, maxResults)
    .map((c) => buildSegResult(c.seg, c.matchingRef));

  const bookSermons = filteredBookCandidates
    .slice(0, maxResults)
    .map((b) => buildSegResult(b.seg, null));

  return { chapterSermons, bookSermons };
}
