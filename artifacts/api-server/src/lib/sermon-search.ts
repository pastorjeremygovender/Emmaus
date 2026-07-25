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
        .filter((v) => v.reviewStatus === "approved" || v.reviewStatus === "auto-approved")
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
 * Return sermons that reference a specific Bible book (and optionally chapter).
 * Used by GET /api/youtube-archive/preached-here for the chapter badge in the
 * Bible reader. Runs synchronously from the current in-memory index.
 */
export async function searchByScripture(
  bookId: string,
  chapter?: number,
  maxResults = 10,
): Promise<SermonSearchResult[]> {
  // Build the index if it hasn't been built yet (mirrors searchSermons behaviour)
  const index = _index ?? await buildIndex().catch(() => null);
  if (!index) return [];
  // Point _index to the built index for the synchronous logic below
  _index = index;

  const lowerBookId = bookId.toLowerCase();
  const candidateIndices = new Set<number>();

  // ── Primary: walk the bookIndex (pre-tagged scriptureBookIds) ────────────
  for (const [key, indices] of _index.bookIndex) {
    const keyNorm = key.replace(/\s+/g, "").toLowerCase();
    if (keyNorm === lowerBookId || keyNorm.startsWith(lowerBookId)) {
      for (const idx of indices) candidateIndices.add(idx);
    }
  }

  // ── Fallback: search the term index for the book name ────────────────────
  // Handles sermons whose segments weren't tagged with scriptureBookIds but
  // whose transcript text or AI keywords mention the book (e.g. "John 3:16").
  // We limit fallback candidates to avoid returning unrelated results.
  if (candidateIndices.size === 0) {
    // Short book names like "john", "acts", "mark" appear as terms
    for (const idx of _index.termIndex.get(lowerBookId) ?? []) {
      candidateIndices.add(idx);
    }
    // Also try without the number prefix (e.g. "1corinthians" → "corinthians")
    const strippedId = lowerBookId.replace(/^\d/, "");
    if (strippedId !== lowerBookId) {
      for (const idx of _index.termIndex.get(strippedId) ?? []) {
        candidateIndices.add(idx);
      }
    }
  }

  const seenVideos = new Set<string>();
  const results: SermonSearchResult[] = [];

  for (const idx of candidateIndices) {
    const seg = _index.segments[idx];
    if (!seg) continue;

    // Chapter filter — only applied when the segment has actual scripture metadata.
    // When both arrays are empty (text-based fallback), we lack reliable chapter
    // data so we include the result rather than filtering it out.
    if (chapter !== undefined) {
      const hasScriptureMetadata =
        seg.scriptureChapters.length > 0 || seg.scriptureRefs.length > 0;
      if (hasScriptureMetadata) {
        const hasChapter =
          seg.scriptureChapters.includes(chapter) ||
          seg.scriptureRefs.some((ref) => {
            const norm = ref.toLowerCase().replace(/\s+/g, "");
            return norm.includes(lowerBookId) && norm.includes(String(chapter));
          });
        if (!hasChapter) continue;
      }
      // Else: no scripture metadata → include (trust the book-name text match)
    }

    if (seenVideos.has(seg.videoId)) continue;
    seenVideos.add(seg.videoId);

    const timestampedUrl = buildTimestampedUrl(seg.youtubeUrl, seg.absoluteStartSeconds);
    const timestampLabel = formatTimestampLabel(seg.absoluteStartSeconds);
    const relativeTimestampLabel = seg.audioUrl
      ? formatTimestampLabel(seg.relativeStartSeconds)
      : undefined;
    const evidence = seg.cleanedText.slice(0, 200) + (seg.cleanedText.length > 200 ? "…" : "");

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
      relevanceScore: 1,
      absoluteStartSeconds: seg.absoluteStartSeconds,
      relativeStartSeconds: seg.relativeStartSeconds,
      relativeTimestampLabel,
      audioUrl: seg.audioUrl,
    });

    if (results.length >= maxResults) break;
  }

  return results;
}
