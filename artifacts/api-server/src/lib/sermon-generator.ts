/**
 * sermon-generator.ts — AI-powered sermon draft and companion generator.
 *
 * Pipeline:
 *   1. Extract YouTube video ID from URL
 *   2. Fetch metadata via YouTube Data API
 *   3. Attempt transcript retrieval (OAuth captions → graceful fallback)
 *   4. OpenAI: analyse transcript → sermon draft fields
 *   5. OpenAI: generate 5-day companion from sermon context
 *   6. Save companion to PostgreSQL; return sermon draft for client to persist
 *
 * All generated content is Draft — never auto-published.
 */

import OpenAI from "openai";
import { randomUUID } from "node:crypto";
import { getVideoMetadata } from "./youtube-client.js";
import { listCaptionTracks, downloadCaptionTrack } from "./youtube-client.js";
import { getValidAccessToken } from "./oauth-store.js";
import { createCompanion, deleteCompanion } from "./sermon-companion-store.js";
import { upsertAdminSermon } from "./admin-sermon-store.js";
import { logger } from "./logger.js";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ─── Structured generation errors ────────────────────────────────────────────

/**
 * GenerationError carries a machine-readable code that the route translates
 * into a structured JSON response. Never surfaces raw OpenAI or Node errors.
 */
export class GenerationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    /** Optional extra data forwarded to the client (never includes secrets) */
    public readonly source?: Record<string, unknown>
  ) {
    super(message);
    this.name = "GenerationError";
  }
}

// ─── Safe JSON parser (handles truncated OpenAI responses) ───────────────────

/**
 * Attempts to parse JSON produced by the model.
 * When finish_reason is "length" the model may have been cut off mid-value.
 * This function tries a simple repair before giving up so partial responses
 * are still usable rather than crashing the whole pipeline.
 */
function safeParseJson(raw: string, finishReason?: string | null): Record<string, unknown> {
  // 1. Happy path
  try { return JSON.parse(raw); } catch {}

  // 2. Log the truncation so we can tune token limits
  if (finishReason === "length") {
    logger.warn({ rawLength: raw.length }, "sermon-generator: JSON truncated (finish_reason=length) — attempting repair");
  }

  // 3. Try to repair common truncation patterns
  try {
    let s = raw.trimEnd();
    // Remove trailing comma or incomplete key
    s = s.replace(/,\s*"[^"]*$/, "").replace(/,\s*$/, "");
    // Close any open string
    let inStr = false, escaped = false;
    for (const ch of s) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\" && inStr) { escaped = true; continue; }
      if (ch === '"') inStr = !inStr;
    }
    if (inStr) s += '"';
    s = s.trimEnd().replace(/,\s*$/, "");
    // Count and close open brackets/braces
    let braces = 0, brackets = 0;
    inStr = false; escaped = false;
    for (const ch of s) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\" && inStr) { escaped = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (inStr) continue;
      if (ch === "{") braces++;
      else if (ch === "}") braces--;
      else if (ch === "[") brackets++;
      else if (ch === "]") brackets--;
    }
    s += "]".repeat(Math.max(0, brackets));
    s += "}".repeat(Math.max(0, braces));
    return JSON.parse(s);
  } catch {
    logger.error({ raw: raw.slice(0, 200) }, "sermon-generator: JSON repair failed — returning empty object");
    return {};
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** A single VTT caption cue with its start time in seconds */
export interface TimedCue {
  startSecs: number;
  text: string;
}

export interface SermonDraftFields {
  id: string;
  title: string;
  speaker: string;
  sermonDate: string;
  series: string;
  scriptureReference: string;
  youtubeUrl: string;
  summary: string;
  topics: string[];
  keywords: string[];
  /** Full church-service transcript (retained for reference only) */
  transcript: string;
  /** Sermon-only transcript — canonical source for all AI generation */
  sermonTranscript: string;
  sermonStartTime: string;     // "HH:MM:SS" or "" if untimed
  sermonEndTime: string;       // "HH:MM:SS" or "" if untimed
  detectionConfidence: number; // 0.0 → 1.0
  detectionMethod: 'ai-auto' | 'ai-confirmed' | 'manual' | 'none';
  transcriptStatus: 'none' | 'pending' | 'complete';
  aiIndexStatus: 'none' | 'pending' | 'indexed';
  companionJourneyId: string;
  /** Pastor-confirmed one-sentence Big Idea — canonical theme for the companion */
  mainTheme: string;
  status: 'draft';
  pastorEdited: boolean;
  updatedAt: string;
}

export interface CompanionEntryDraft {
  dayNumber: number;
  title: string;
  scriptureReference: string;
  /** Stores the "From the Sermon" idea — what the preacher actually said. */
  greeting: string;
  reflection: string;
  prayer: string;
  nextStep: string;
  closing: string;
  /** Timestamped YouTube URL for the relevant sermon segment. */
  sermonLink: string;
}

export interface GenerationResult {
  sermon: SermonDraftFields;
  companion: {
    id: string;
    title: string;
    entries: CompanionEntryDraft[];
  };
}

// ─── YouTube URL parsing ──────────────────────────────────────────────────────

export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    // https://www.youtube.com/watch?v=ID
    const v = u.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    // https://youtu.be/ID
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1).split("?")[0];
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }
    // Path-based: /embed/ID  /live/ID  /shorts/ID
    const parts = u.pathname.split("/").filter(Boolean);
    for (const seg of ["embed", "live", "shorts"]) {
      const idx = parts.indexOf(seg);
      if (idx >= 0 && parts[idx + 1]) {
        const id = parts[idx + 1].split("?")[0];
        if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// ─── VTT transcript parser (plain text + timed cues) ─────────────────────────

/** Convert "HH:MM:SS.mmm" or "HH:MM:SS,mmm" → seconds */
function parseVttTimestamp(ts: string): number {
  const clean = ts.split(/[.,]/)[0];          // drop milliseconds
  const parts = clean.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/** Seconds → "HH:MM:SS" */
export function secsToHHMMSS(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Parse a VTT string into timed cues AND a plain-text transcript.
 * YouTube auto-captions repeat content in overlapping cues; we deduplicate
 * consecutive entries whose text is a subset of the previous cue.
 */
function parseVttTimed(vtt: string): { text: string; timedCues: TimedCue[] } {
  const lines = vtt.split("\n");
  const raw: TimedCue[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    const tsMatch = line.match(/^(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->/);
    if (tsMatch) {
      const startSecs = parseVttTimestamp(tsMatch[1]);
      const textParts: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        const tl = lines[i].replace(/<[^>]+>/g, "").trim();
        if (tl && !/^WEBVTT/.test(tl) && !/^\d+$/.test(tl) && !/^\d{2}:\d{2}/.test(tl)) {
          textParts.push(tl);
        }
        i++;
      }
      const text = textParts.join(" ").replace(/\s{2,}/g, " ").trim();
      if (text) raw.push({ startSecs, text });
    } else {
      i++;
    }
  }

  // Deduplicate: skip cues whose text is fully contained in the previous cue
  const deduped = raw.filter((cue, idx) => {
    if (idx === 0) return true;
    const prev = raw[idx - 1];
    return !(prev.text.includes(cue.text) && cue.text.length <= prev.text.length);
  });

  const text = deduped.map(c => c.text).join(" ").replace(/\s{2,}/g, " ").trim();
  return { text, timedCues: deduped };
}

// ─── Transcript retrieval ─────────────────────────────────────────────────────

async function fetchTranscript(videoId: string): Promise<{
  text: string;
  source: string;
  timedCues: TimedCue[];
} | null> {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) return null;

    const tracks = await listCaptionTracks(videoId, accessToken);
    if (!tracks.length) return null;

    const ranked = [...tracks].sort((a, b) => {
      const score = (t: typeof a) =>
        (t.language.startsWith("en") ? 10 : 0) +
        (t.trackKind === "standard" ? 5 : 0) +
        (t.isDraft ? -2 : 0);
      return score(b) - score(a);
    });

    const best = ranked[0];
    const vtt = await downloadCaptionTrack(best.id, accessToken);
    const { text, timedCues } = parseVttTimed(vtt);
    return { text, timedCues, source: best.trackKind === "asr" ? "youtube-auto" : "youtube-manual" };
  } catch (err) {
    logger.warn({ err: String(err) }, "sermon-generator: transcript retrieval failed (non-fatal)");
    return null;
  }
}

// ─── Sermon detection ─────────────────────────────────────────────────────────

const CONFIDENCE_THRESHOLD = 0.85;
const WORDS_PER_SEGMENT = 200;

const SERMON_DETECTION_SYSTEM = `You are analysing a church service transcript to identify only the sermon section.

A Sunday service typically contains these NON-SERMON elements:
• Welcome / greetings
• Worship songs and singing
• Announcements and notices
• Offering / giving
• Testimonies
• Communion / Lord's Supper
• Closing prayer and blessing

The SERMON is: sustained biblical teaching and exposition by the preacher, grounded in a specific scripture text, with application.

Signs the sermon has STARTED:
- "Let us turn in our Bibles to..." / "Open with me to..."
- "This morning / evening I want to..."
- "Today's message is from..." / "Our text today is..."
- First sustained reading and teaching from a biblical passage
- Consistent exposition of one passage or theme

Signs the sermon has ENDED:
- Closing prayer that follows the teaching (not a transition)
- Altar call or ministry response time
- "Let's pray" after the main teaching is complete
- Worship team returning / a worship song following the teaching
- Dismissal or closing blessing

You are given numbered transcript segments (each ≈200 words) with approximate timestamps.

Use MULTIPLE signals:
1. Semantic cues (explicit transition phrases)
2. Topic continuity (consistent biblical exposition)
3. Format shift (from narrative to exposition)

If the ENTIRE transcript appears to be only the sermon (no service content), set confidence to 0.95 and cover all segments.
If you cannot reliably detect a sermon, set confidence to 0.30.

Return ONLY this JSON (no markdown, no explanation):
{
  "sermonStartSegment": <integer>,
  "sermonEndSegment": <integer>,
  "confidence": <float 0.0–1.0>,
  "reasoning": "<1–2 sentence explanation>"
}`;

interface TranscriptSegment {
  index: number;
  startSecs: number | null;
  words: string[];
}

interface SermonDetectionResult {
  sermonTranscript: string;
  startSecs: number | null;
  endSecs: number | null;
  durationSecs: number | null;
  startWord: number;
  endWord: number;
  confidence: number;
  previewText: string;
  segmentCount: number;
}

function buildSegments(fullText: string, timedCues?: TimedCue[]): TranscriptSegment[] {
  const words = fullText.split(/\s+/).filter(Boolean);
  const segments: TranscriptSegment[] = [];

  // Build a word-index → seconds lookup from timed cues
  let wordToSecs: (idx: number) => number | null = () => null;
  if (timedCues && timedCues.length > 0) {
    const entries: Array<{ wordStart: number; secs: number }> = [];
    let w = 0;
    for (const cue of timedCues) {
      entries.push({ wordStart: w, secs: cue.startSecs });
      w += cue.text.split(/\s+/).filter(Boolean).length;
    }
    wordToSecs = (idx: number) => {
      let lo = 0, hi = entries.length - 1, result: number | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (entries[mid].wordStart <= idx) { result = entries[mid].secs; lo = mid + 1; }
        else hi = mid - 1;
      }
      return result;
    };
  }

  for (let i = 0; i < words.length; i += WORDS_PER_SEGMENT) {
    segments.push({
      index: segments.length,
      startSecs: wordToSecs(i),
      words: words.slice(i, i + WORDS_PER_SEGMENT),
    });
  }
  return segments;
}

async function detectSermonSection(
  fullText: string,
  timedCues?: TimedCue[]
): Promise<SermonDetectionResult> {
  const segments = buildSegments(fullText, timedCues);
  const totalWords = fullText.split(/\s+/).filter(Boolean).length;

  // Too short — probably just the sermon itself
  if (segments.length <= 3) {
    return {
      sermonTranscript: fullText,
      startSecs: segments[0]?.startSecs ?? null,
      endSecs: segments[segments.length - 1]?.startSecs ?? null,
      durationSecs: null,
      startWord: 0, endWord: totalWords,
      confidence: 0.95,
      previewText: fullText.split(/\s+/).slice(0, 60).join(" "),
      segmentCount: segments.length,
    };
  }

  // Build compact timeline for the model
  const timeline = segments.map(seg => {
    const ts = seg.startSecs !== null
      ? secsToHHMMSS(seg.startSecs)
      : `~${seg.index * 3}min`;
    const preview = seg.words.slice(0, 20).join(" ");
    return `[${seg.index}] ${ts} — ${preview}`;
  }).join("\n");

  logger.info({ segmentCount: segments.length }, "sermon-generator: running sermon detection");

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SERMON_DETECTION_SYSTEM },
      { role: "user", content: `Total segments: ${segments.length}\n\n${timeline}` },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 400,
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = safeParseJson(raw, res.choices[0]?.finish_reason) as {
    sermonStartSegment?: number;
    sermonEndSegment?: number;
    confidence?: number;
    reasoning?: string;
  };

  const n = segments.length;
  const rawStart = typeof parsed.sermonStartSegment === "number" ? parsed.sermonStartSegment : Math.floor(n * 0.30);
  const rawEnd   = typeof parsed.sermonEndSegment   === "number" ? parsed.sermonEndSegment   : Math.floor(n * 0.85);
  const startSeg = Math.max(0, Math.min(rawStart, n - 1));
  const endSeg   = Math.max(startSeg, Math.min(rawEnd, n - 1));
  const confidence = typeof parsed.confidence === "number"
    ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5;

  logger.info({ startSeg, endSeg, confidence, reasoning: parsed.reasoning },
    "sermon-generator: sermon detection result");

  const sermonSegs = segments.slice(startSeg, endSeg + 1);
  const sermonTranscript = sermonSegs.flatMap(s => s.words).join(" ");

  const startSecs = segments[startSeg]?.startSecs ?? null;
  // Estimate end time: last segment start + its words at ~2.5 words/sec
  const lastSeg = segments[endSeg];
  const endSecs = lastSeg?.startSecs != null
    ? Math.round(lastSeg.startSecs + lastSeg.words.length / 2.5)
    : null;

  return {
    sermonTranscript,
    startSecs,
    endSecs,
    durationSecs: startSecs != null && endSecs != null ? endSecs - startSecs : null,
    startWord: startSeg * WORDS_PER_SEGMENT,
    endWord: Math.min((endSeg + 1) * WORDS_PER_SEGMENT, totalWords),
    confidence,
    previewText: sermonTranscript.split(/\s+/).slice(0, 60).join(" "),
    segmentCount: n,
  };
}

/**
 * Given a target time in seconds and the timed VTT cues, return the word offset
 * in the full transcript that corresponds to that time. Used when the pastor
 * provides corrected timestamp boundaries (Adjust Sermon phase) to slice the
 * transcript server-side from the authoritative cue index.
 *
 * Falls back to a words-per-second estimate when no timed cues are available.
 */
function timeToWordOffset(
  secs: number,
  timedCues: TimedCue[] | undefined,
  totalWords: number
): number {
  if (!timedCues || timedCues.length === 0) {
    // No timed data — estimate at average speech rate (2.5 words/sec)
    return Math.min(Math.max(0, Math.round(secs * 2.5)), totalWords);
  }

  // Build cumulative word-start per cue (same as buildSegments does internally)
  const entries: Array<{ wordStart: number; secs: number }> = [];
  let w = 0;
  for (const cue of timedCues) {
    entries.push({ wordStart: w, secs: cue.startSecs });
    w += cue.text.split(/\s+/).filter(Boolean).length;
  }

  // Binary search: last entry whose cue.startSecs ≤ secs
  let lo = 0, hi = entries.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].secs <= secs) { best = entries[mid].wordStart; lo = mid + 1; }
    else hi = mid - 1;
  }
  return Math.min(best, totalWords);
}

// ─── OpenAI: main theme generation ───────────────────────────────────────────

const MAIN_THEME_SYSTEM = `You are a pastoral content editor for a church.

Your task: identify the BIG IDEA of this sermon in ONE sentence.

The Big Idea is:
- The single main point the preacher is making
- Something the congregation should walk away believing or doing differently
- Expressed as a complete sentence (subject + verb + complement)
- Grounded in this specific scripture passage

Rules:
- ONE sentence only — never a list, never a paragraph
- Plain, pastoral language the pastor himself would use
- No theological jargon ("Christocentric", "covenantal", "eschatological", etc.)
- No vague generic phrases ("we should trust God", "faith is important")
- Specific to THIS sermon — not a spiritual platitude that could apply to any sermon

Good examples:
- "Following Jesus means putting Him first in every area of life."
- "God's kindness restores people who believe they are beyond hope."
- "The Christian life begins when we trust Jesus rather than ourselves."
- "True peace is not the absence of problems but the presence of God."

Bad examples:
- "Christocentric Kingdom Discipleship Paradigm"
- "Exploring covenantal implications of grace"
- Lists or multiple ideas
- Paragraphs

Return ONLY JSON:
{ "mainTheme": "..." }`;

/**
 * Generate a one-sentence Big Idea from the sermon-only transcript.
 * Called once after sermon boundary detection, before companion generation.
 */
export async function generateMainTheme(sermonTranscript: string): Promise<string> {
  const snippet = sermonTranscript.split(/\s+/).slice(0, 2000).join(" ");
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: MAIN_THEME_SYSTEM },
      { role: "user", content: `Sermon transcript:\n\n${snippet}` },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 200,
  });
  const raw = res.choices[0]?.message?.content ?? '{"mainTheme":""}';
  const parsed = safeParseJson(raw) as { mainTheme?: string };
  const theme = typeof parsed.mainTheme === "string" ? parsed.mainTheme.trim() : "";
  logger.info({ theme }, "sermon-generator: main theme generated");
  return theme || "The main message of this sermon.";
}

/**
 * Generate an alternative one-sentence Big Idea (used by the "Regenerate Theme"
 * button on the pastoral confirmation screen).
 */
export async function suggestAlternativeTheme(
  sermonSnippet: string,
  previousTheme: string
): Promise<string> {
  const snippet = sermonSnippet.split(/\s+/).slice(0, 2000).join(" ");
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: MAIN_THEME_SYSTEM },
      {
        role: "user",
        content: `The previous suggestion was: "${previousTheme}"\n\nGenerate a different one-sentence main theme from this transcript:\n\n${snippet}`,
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 200,
  });
  const raw = res.choices[0]?.message?.content ?? '{"mainTheme":""}';
  const parsed = safeParseJson(raw) as { mainTheme?: string };
  const theme = typeof parsed.mainTheme === "string" ? parsed.mainTheme.trim() : "";
  return theme || previousTheme;
}

/** Re-run sermon detection on a stored sermon record (for the Re-detect button) */
export async function redetectSermon(fullTranscript: string): Promise<{
  sermonTranscript: string;
  sermonStartTime: string;
  sermonEndTime: string;
  detectionConfidence: number;
  detectionMethod: 'ai-auto';
}> {
  const result = await detectSermonSection(fullTranscript);
  return {
    sermonTranscript: result.sermonTranscript,
    sermonStartTime: result.startSecs != null ? secsToHHMMSS(result.startSecs) : "",
    sermonEndTime: result.endSecs != null ? secsToHHMMSS(result.endSecs) : "",
    detectionConfidence: result.confidence,
    detectionMethod: "ai-auto",
  };
}

// ─── OpenAI: sermon draft ─────────────────────────────────────────────────────

const SERMON_DRAFT_SYSTEM = `You are a pastoral content editor for a church. 
Given a YouTube sermon's metadata and optional transcript, extract structured sermon information.
Return ONLY JSON — no explanation, no markdown.

Extract ONLY what is actually present. If the transcript is empty, use only the title and description.

Required JSON shape:
{
  "title": "...",               // Clean sermon title (remove episode numbers, date prefixes)
  "speaker": "...",             // Speaker name (e.g. "Pastor Jeremy Govender")
  "series": "...",              // Series name if apparent, else ""
  "scriptureReference": "...", // Primary scripture reference (e.g. "John 3:1-21"), else ""
  "summary": "...",            // 2-3 sentence summary of the main message
  "topics": [...],             // Up to 5 pastoral/theological topics (lowercase)
  "keywords": [...]            // Up to 10 keywords (lowercase)
}`;

async function generateSermonDraft(meta: {
  title: string;
  description: string;
  transcript: string;
}): Promise<{
  title: string;
  speaker: string;
  series: string;
  scriptureReference: string;
  summary: string;
  topics: string[];
  keywords: string[];
}> {
  const transcriptSnippet = meta.transcript
    ? `\n\nTranscript (first 3000 words):\n${meta.transcript.split(/\s+/).slice(0, 3000).join(" ")}`
    : "";

  const userMsg = `Title: ${meta.title}\n\nDescription:\n${meta.description.slice(0, 800)}${transcriptSnippet}`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SERMON_DRAFT_SYSTEM },
      { role: "user", content: userMsg },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1500,  // 600 was too low — caused truncated JSON
  });

  const finishReason = res.choices[0]?.finish_reason;
  const raw = res.choices[0]?.message?.content ?? "{}";
  logger.info({ finishReason, rawLength: raw.length, model: MODEL }, "sermon-generator: OpenAI sermon draft response");

  const parsed = safeParseJson(raw, finishReason);

  return {
    title: typeof parsed.title === "string" ? parsed.title : meta.title,
    speaker: typeof parsed.speaker === "string" ? parsed.speaker : "",
    series: typeof parsed.series === "string" ? parsed.series : "",
    scriptureReference: typeof parsed.scriptureReference === "string" ? parsed.scriptureReference : "",
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    topics: Array.isArray(parsed.topics) ? (parsed.topics as unknown[]).map(String).slice(0, 5) : [],
    keywords: Array.isArray(parsed.keywords) ? (parsed.keywords as unknown[]).map(String).slice(0, 10) : [],
  };
}

// ─── Prescription filter ──────────────────────────────────────────────────────

/**
 * Patterns that indicate formulaic spiritual prescriptions.
 * The spec prohibits generated content containing arbitrary counts, repetitions,
 * writing-on-cards, phone reminders, or multi-step spiritual formulas.
 */
const PRESCRIPTION_PATTERNS = [
  /\b(write|copy|print)\s+(this|it|the\s+verse?)(\s+out)?\s+\d+\s+times?/i,
  /\brepeat\s+(this|it|the\s+verse?)\s+\d+\s+times?/i,
  /\bsay\s+(this|it|the\s+verse?)\s+(aloud\s+)?\d+\s+times?/i,
  /\bpray\s+(this|it)\s+\d+\s+times?/i,
  /\bread\s+(this|it)\s+every\s+hour/i,
  /\bwrite\s+(this|it|the\s+verse?|that)\s+on\s+a\s+card/i,
  /\bput\s+(this|it|the\s+verse?|that)\s+in\s+your\s+phone/i,
  /\bmake\s+a\s+list\s+of\s+(three|four|five|six|seven|\d+)/i,
  /\bcomplete\s+\d+\s+actions?/i,
  /\d+\s+times?\s+(a\s+day|per\s+day|daily)/i,
  /\bset\s+(a\s+)?reminder/i,
  /\bschedule\s+(a\s+time|time)\s+to/i,
];

export function hasPrescription(text: string): boolean {
  return PRESCRIPTION_PATTERNS.some(p => p.test(text));
}

// ─── Sermon-link builder ──────────────────────────────────────────────────────

/**
 * Build a timestamped YouTube URL from a videoId and start time in seconds.
 * Returns '' when either input is missing or startSeconds is invalid.
 */
export function buildSermonLink(videoId: string, startSeconds: number | null | undefined): string {
  if (!videoId || startSeconds == null || !isFinite(startSeconds) || startSeconds < 0) return '';
  return `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(startSeconds)}s`;
}

// ─── OpenAI: companion generation ────────────────────────────────────────────

const COMPANION_SYSTEM = `You are NOT writing a new devotional.
You are creating a faithful companion to ONE specific sermon.

CLOSED SOURCE RULE:
Use ONLY the supplied sermon transcript.
Do not use outside biblical, theological or general knowledge.
Do not add Scriptures, references, illustrations, examples, applications or claims
not present in the sermon transcript.
Every statement must be traceable to the transcript.
When the transcript does not provide enough content for a section, omit that section or that day entirely.
Never fill gaps with your own knowledge.

PRESCRIPTION RULE:
Never produce instructions like "pray this three times", "write this verse three times",
"write this on a card", "put this in your phone", "make a list of five things",
"read this every hour", or any arbitrary count, frequency, routine or formula.
Do not turn faith into a technique.

SCRIPTURE RULE:
Only include a Scripture reference if the preacher explicitly mentioned, quoted or
preached from it in THIS sermon.
Leave scriptureReference as "" if uncertain.
Never add "supporting verses" or "related passages".
Never quote a verse merely because it fits the theme.

DAYS RULE:
Generate between 1 and 5 days based on the number of distinct ideas the preacher actually preached.
Do not stretch weak material. Do not invent extra days merely to reach 5.
If the sermon has only 2 or 3 clear ideas, generate only 2 or 3 days.

EACH DAY MUST CONTAIN:
- title: derived from what the preacher said, not invented
- sermonIdea: 2–3 sentences that closely restate what the preacher actually said;
  quote or closely paraphrase; no new teaching added
- scriptureReference: ONLY if explicitly used in the sermon; leave "" if uncertain
- reflection: 2–3 paragraphs helping the reader think about what was preached;
  do not add new teaching; stay strictly inside the preacher's own point
- prayer: 3–4 sentences, first person, using only themes from this sermon;
  begin with "Lord," or "Father,"; never "Dear God"
- nextStep: 1 sentence; one gentle, non-formulaic action directly from the
  preacher's emphasis; no counts, no repetition, no cards, no rituals
- sources: at least one object identifying the sermon segment for this day

Return ONLY valid JSON — no markdown, no explanation.

{
  "companionTitle": "...",
  "days": [
    {
      "dayNumber": 1,
      "title": "...",
      "sermonIdea": "...",
      "scriptureReference": "...",
      "reflection": "...",
      "prayer": "...",
      "nextStep": "...",
      "sources": [
        {
          "startSeconds": 0,
          "transcriptEvidence": "..."
        }
      ]
    }
  ]
}`;

async function generateCompanion(context: {
  sermonTitle: string;
  scriptureReference: string;
  summary: string;
  transcript: string;
  mainTheme: string;
  videoId: string;
}): Promise<{
  companionTitle: string;
  days: CompanionEntryDraft[];
}> {
  // Send the full sermon transcript (up to 8 000 words).
  // The old 2 000-word limit forced the model to fill gaps with its own knowledge.
  const transcriptSnippet = context.transcript
    ? `\n\nSermon transcript:\n${context.transcript.split(/\s+/).slice(0, 8000).join(" ")}`
    : "";

  const userMsg = `Confirmed Main Theme: ${context.mainTheme}

Sermon title: ${context.sermonTitle}
Scripture: ${context.scriptureReference}
Summary: ${context.summary}${transcriptSnippet}`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    // Low temperature: extraction and controlled summarisation, not creative generation.
    temperature: 0.2,
    messages: [
      { role: "system", content: COMPANION_SYSTEM },
      { role: "user", content: userMsg },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8000,
  });

  const finishReason = res.choices[0]?.finish_reason;
  const raw = res.choices[0]?.message?.content ?? "{}";
  logger.info({ finishReason, rawLength: raw.length, model: MODEL }, "sermon-generator: OpenAI companion response");

  const parsed = safeParseJson(raw, finishReason) as { companionTitle?: string; days?: unknown[] };

  const days: CompanionEntryDraft[] = [];
  const rawDays = Array.isArray(parsed.days) ? parsed.days : [];

  for (let i = 0; i < rawDays.length && i < 5; i++) {
    const d = (rawDays[i] ?? {}) as Record<string, unknown>;

    // Extract the first source object for the timestamped sermon link.
    const rawSources = Array.isArray(d.sources) ? d.sources : [];
    const firstSource = (rawSources[0] ?? {}) as Record<string, unknown>;
    const startSeconds = typeof firstSource.startSeconds === "number"
      ? firstSource.startSeconds
      : null;
    const sermonLink = buildSermonLink(context.videoId, startSeconds);

    // sermonIdea is stored in the `greeting` field (repurposed from personal greeting).
    const sermonIdea = typeof d.sermonIdea === "string" ? d.sermonIdea : "";

    // Scripture: only accept what the model returned — do NOT fall back to
    // the sermon-level scripture reference, which was the source of invented references.
    const scriptureReference = typeof d.scriptureReference === "string"
      ? d.scriptureReference
      : "";

    const nextStep = typeof d.nextStep === "string" ? d.nextStep : "";

    // Log a warning if the model still produced a prescription pattern.
    if (hasPrescription(nextStep)) {
      logger.warn(
        { dayNumber: i + 1, sample: nextStep.slice(0, 120) },
        "sermon-generator: prescription pattern in nextStep — admin review required",
      );
    }
    if (hasPrescription(typeof d.reflection === "string" ? d.reflection : "")) {
      logger.warn(
        { dayNumber: i + 1 },
        "sermon-generator: prescription pattern in reflection — admin review required",
      );
    }

    days.push({
      dayNumber: i + 1,
      title: typeof d.title === "string" ? d.title : `Day ${i + 1}`,
      scriptureReference,
      greeting: sermonIdea,
      reflection: typeof d.reflection === "string" ? d.reflection : "",
      prayer: typeof d.prayer === "string" ? d.prayer : "",
      nextStep,
      closing: "",  // closing field removed from grounded companion output
      sermonLink,
    });
  }

  const actualDayCount = days.length;
  logger.info(
    { daysGenerated: actualDayCount, videoId: context.videoId },
    "sermon-generator: companion days extracted",
  );

  return {
    companionTitle: typeof parsed.companionTitle === "string"
      ? parsed.companionTitle
      : `${actualDayCount} Days with "${context.sermonTitle}"`,
    days,
  };
}

// ─── Field-level regeneration ─────────────────────────────────────────────────

const FIELD_REGEN_SYSTEM = `You are a pastoral content editor for a church.
Regenerate a single field for a sermon record.
Return ONLY JSON with a single key "value" containing the new text.
Extract ONLY what is grounded in the provided sermon content.`;

export async function regenerateSermonField(
  field: keyof Pick<SermonDraftFields, 'title' | 'speaker' | 'scriptureReference' | 'summary' | 'topics' | 'keywords'>,
  context: {
    currentTitle: string;
    currentSummary: string;
    scriptureReference: string;
    transcript: string;
    description: string;
  }
): Promise<string | string[]> {
  const transcriptSnippet = context.transcript
    ? `\n\nTranscript (first 2000 words):\n${context.transcript.split(/\s+/).slice(0, 2000).join(" ")}`
    : "";

  const fieldInstructions: Record<string, string> = {
    title: 'Return a clean, compelling sermon title (no date or episode numbers). Value should be a string.',
    speaker: 'Return the speaker full name if identifiable from the context, else an empty string.',
    scriptureReference: 'Return the primary scripture reference (e.g. "John 3:1-21"). Single string.',
    summary: 'Return a 2-3 sentence summary of the sermon\'s main message. Single string.',
    topics: 'Return up to 5 lowercase pastoral/theological topics as a JSON array of strings.',
    keywords: 'Return up to 10 lowercase keywords as a JSON array of strings.',
  };

  const userMsg = `Field to regenerate: ${field}
Instruction: ${fieldInstructions[field] ?? 'Regenerate this field.'}

Current title: ${context.currentTitle}
Current summary: ${context.currentSummary}
Scripture: ${context.scriptureReference}
Description: ${context.description.slice(0, 600)}${transcriptSnippet}`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: FIELD_REGEN_SYSTEM },
      { role: "user", content: userMsg },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 400,
  });

  const raw = res.choices[0]?.message?.content ?? '{"value":""}';
  const parsed = JSON.parse(raw) as { value?: unknown };
  const val = parsed.value;

  if (field === 'topics' || field === 'keywords') {
    return Array.isArray(val) ? (val as unknown[]).map(String) : [];
  }
  return typeof val === "string" ? val : "";
}

// ─── Main generation pipeline ─────────────────────────────────────────────────

export interface GenerationOptions {
  /** Pastor-pasted transcript — skips OAuth retrieval when provided */
  providedTranscript?: string;
  /** Pastor-confirmed sermon boundaries (seconds, from timed VTT) */
  sermonStartSec?: number;
  sermonEndSec?: number;
  /** Pastor-confirmed sermon boundaries (word offsets into full transcript) */
  sermonStartWord?: number;
  sermonEndWord?: number;
  /**
   * Pastor-confirmed one-sentence Big Idea.
   * When provided, the theme-confirmation step is skipped and this value
   * is used directly as the companion's unifying thread.
   */
  confirmedTheme?: string;
}

export async function generateFromUrl(youtubeUrl: string, options: GenerationOptions = {}): Promise<GenerationResult> {
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) {
    throw new GenerationError("INVALID_YOUTUBE_URL", "Please enter a valid YouTube video link.");
  }

  // 1. Fetch metadata
  let metaList;
  try {
    metaList = await getVideoMetadata([videoId]);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("403") || msg.includes("API key")) {
      throw new GenerationError("VIDEO_UNAVAILABLE", "Couldn't reach YouTube — check that the YouTube API key is configured.");
    }
    throw new GenerationError("VIDEO_UNAVAILABLE", "We couldn't access this YouTube video. Check that it is public and try again.");
  }

  if (!metaList.length || metaList[0].privacyStatus === "private") {
    throw new GenerationError("VIDEO_UNAVAILABLE", "We couldn't access this YouTube video. Check that it is public and try again.");
  }

  const meta = metaList[0];
  const thumbnailUrl = meta.thumbnailUrl ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // 2. Resolve full transcript — pastor-paste takes priority, then OAuth
  let fullTranscript: string;
  let timedCues: TimedCue[] | undefined;

  if (options.providedTranscript && options.providedTranscript.trim().length > 50) {
    fullTranscript = options.providedTranscript.trim();
    timedCues = undefined;
    logger.info({ videoId, length: fullTranscript.length }, "sermon-generator: using pastor-provided transcript");
  } else {
    const transcriptResult = await fetchTranscript(videoId);
    if (!transcriptResult) {
      logger.info({ videoId }, "sermon-generator: transcript unavailable, returning TRANSCRIPT_REQUIRED");
      throw new GenerationError("TRANSCRIPT_REQUIRED", "We couldn't retrieve a transcript from this video.", {
        youtubeUrl, videoId, title: meta.title, thumbnailUrl,
      });
    }
    fullTranscript = transcriptResult.text;
    timedCues = transcriptResult.timedCues;
    logger.info({ videoId, source: transcriptResult.source, length: fullTranscript.length, cues: timedCues.length },
      "sermon-generator: transcript retrieved");
  }

  // 3. Check AI configuration
  if (!process.env.OPENAI_API_KEY) {
    throw new GenerationError("AI_NOT_CONFIGURED", "Sermon generation is not configured yet.");
  }

  // 4. Extract sermon-only transcript
  const hasBoundaries = options.sermonStartWord !== undefined && options.sermonEndWord !== undefined;
  const hasTimeBoundaries = !hasBoundaries
    && options.sermonStartSec !== undefined && options.sermonEndSec !== undefined;

  let sermonTranscript: string;
  let detectionMethod: "ai-auto" | "ai-confirmed" | "manual" | "none";
  let detectionStartSecs: number | null = null;
  let detectionEndSecs: number | null = null;
  let detectionConfidence: number;
  // Actual word offsets used to slice the sermon transcript — passed back in
  // THEME_CONFIRMATION_REQUIRED so the client can send them on the next call,
  // allowing the server to skip re-detection entirely.
  let actualStartWord: number;
  let actualEndWord: number;

  if (hasBoundaries) {
    // Pastor confirmed AI-detected boundaries (word offsets from detection, reliable)
    const words = fullTranscript.split(/\s+/).filter(Boolean);
    sermonTranscript = words.slice(options.sermonStartWord, options.sermonEndWord).join(" ");
    detectionStartSecs = options.sermonStartSec ?? null;
    detectionEndSecs   = options.sermonEndSec   ?? null;
    detectionConfidence = 1.0;
    detectionMethod = "ai-confirmed";
    actualStartWord = options.sermonStartWord!;
    actualEndWord   = options.sermonEndWord!;
    logger.info({ startWord: options.sermonStartWord, endWord: options.sermonEndWord },
      "sermon-generator: using pastor-confirmed word boundaries");
  } else if (hasTimeBoundaries) {
    // Pastor manually adjusted timestamps — convert to word offsets via cue index
    const words = fullTranscript.split(/\s+/).filter(Boolean);
    const startWord = timeToWordOffset(options.sermonStartSec!, timedCues, words.length);
    const endWord   = timeToWordOffset(options.sermonEndSec!,   timedCues, words.length);
    sermonTranscript = words.slice(startWord, Math.max(startWord + 1, endWord)).join(" ");
    detectionStartSecs = options.sermonStartSec!;
    detectionEndSecs   = options.sermonEndSec!;
    detectionConfidence = 1.0;
    detectionMethod = "ai-confirmed";
    actualStartWord = startWord;
    actualEndWord   = endWord;
    logger.info(
      { startSec: options.sermonStartSec, endSec: options.sermonEndSec, startWord, endWord,
        hasCues: !!(timedCues && timedCues.length) },
      "sermon-generator: using pastor-adjusted time boundaries (server-mapped to words)");
  } else {
    let detection: SermonDetectionResult;
    try {
      detection = await detectSermonSection(fullTranscript, timedCues);
    } catch (err) {
      // Detection failure is non-fatal — fall back to full transcript with low confidence
      logger.warn({ err }, "sermon-generator: sermon detection failed, using full transcript");
      detection = {
        sermonTranscript: fullTranscript,
        startSecs: null, endSecs: null, durationSecs: null,
        startWord: 0, endWord: fullTranscript.split(/\s+/).filter(Boolean).length,
        confidence: 0.4,
        previewText: fullTranscript.split(/\s+/).slice(0, 60).join(" "),
        segmentCount: 0,
      };
    }

    if (detection.confidence < CONFIDENCE_THRESHOLD) {
      // Ask pastor to confirm before generating
      logger.info({ confidence: detection.confidence }, "sermon-generator: low confidence, returning SERMON_CONFIRMATION_REQUIRED");
      throw new GenerationError(
        "SERMON_CONFIRMATION_REQUIRED",
        "Emmaus identified the sermon section below. Please confirm before generating the companion.",
        {
          startSecs: detection.startSecs,
          endSecs: detection.endSecs,
          durationSecs: detection.durationSecs,
          startWord: detection.startWord,
          endWord: detection.endWord,
          confidence: detection.confidence,
          previewText: detection.previewText,
          segmentCount: detection.segmentCount,
          youtubeUrl,
        }
      );
    }

    sermonTranscript = detection.sermonTranscript;
    detectionStartSecs = detection.startSecs;
    detectionEndSecs   = detection.endSecs;
    detectionConfidence = detection.confidence;
    detectionMethod = "ai-auto";
    actualStartWord = detection.startWord;
    actualEndWord   = detection.endWord;
  }

  logger.info({ sermonWords: sermonTranscript.split(/\s+/).length, detectionConfidence, detectionMethod },
    "sermon-generator: sermon transcript extracted");

  // 4.5. Pastoral theme confirmation — pause the pipeline until the pastor
  //      confirms the main theme. When confirmedTheme is already set (second
  //      call after the pastor confirms), skip straight to generation.
  let mainTheme: string;
  if (options.confirmedTheme && options.confirmedTheme.trim()) {
    mainTheme = options.confirmedTheme.trim();
    logger.info({ mainTheme }, "sermon-generator: using pastor-confirmed main theme");
  } else {
    // Generate a theme suggestion and return it to the client for confirmation.
    let suggestedTheme: string;
    try {
      suggestedTheme = await generateMainTheme(sermonTranscript);
    } catch (err) {
      logger.warn({ err }, "sermon-generator: theme generation failed, using fallback");
      suggestedTheme = "The main message of this sermon.";
    }
    logger.info({ suggestedTheme }, "sermon-generator: returning THEME_CONFIRMATION_REQUIRED");
    throw new GenerationError(
      "THEME_CONFIRMATION_REQUIRED",
      "Emmaus identified the main theme below. Please confirm before generating the companion.",
      {
        theme: suggestedTheme,
        // First ~1 500 words of the sermon — sent back by the client if the pastor
        // clicks "Regenerate Theme" so the server can produce an alternative.
        sermonSnippet: sermonTranscript.split(/\s+/).slice(0, 1500).join(" "),
        startSecs: detectionStartSecs,
        endSecs: detectionEndSecs,
        startWord: actualStartWord,
        endWord: actualEndWord,
        detectionConfidence,
        detectionMethod,
      }
    );
  }

  // 5. Generate sermon draft fields from sermon-only transcript
  let draftFields;
  try {
    draftFields = await generateSermonDraft({
      title: meta.title,
      description: meta.description,
      transcript: sermonTranscript,   // ← sermon only, never full service
    });
  } catch (err) {
    logger.error({ err }, "sermon-generator: OpenAI sermon draft failed");
    if (err instanceof GenerationError) throw err;
    throw new GenerationError("GENERATION_FAILED", "We couldn't prepare the sermon draft. Your sermon has not been saved.");
  }

  // Log parsed sermon fields for debugging (Task 1 of the spec)
  logger.info({
    parsedTitle: draftFields.title,
    parsedSpeaker: draftFields.speaker || "(empty)",
    parsedScripture: draftFields.scriptureReference || "(empty)",
    parsedSummaryLength: draftFields.summary?.length ?? 0,
    mainTheme,
  }, "sermon-generator: sermon draft fields parsed");

  // Validate — if AI returned an empty/trivial result, reject rather than saving a false draft.
  // A real sermon summary must have meaningful content. Title is allowed to fall back to the
  // YouTube video title, but summary blank means the AI call failed entirely.
  if (!draftFields.summary || draftFields.summary.trim().length < 30) {
    logger.error({
      title: draftFields.title,
      summaryLength: draftFields.summary?.length ?? 0,
    }, "sermon-generator: AI returned empty sermon summary — rejecting false draft");
    throw new GenerationError(
      "GENERATION_FAILED",
      "Emmaus couldn't generate this Sermon Companion draft. Nothing was published.",
    );
  }

  // 6. Generate companion from sermon-only transcript, anchored to mainTheme.
  //    The model may generate 1–5 days depending on how many distinct ideas
  //    the preacher actually preached. We no longer force exactly 5 days.
  let companionDraft;
  try {
    companionDraft = await generateCompanion({
      sermonTitle: draftFields.title,
      scriptureReference: draftFields.scriptureReference,
      summary: draftFields.summary,
      transcript: sermonTranscript,   // ← sermon only
      mainTheme,
      videoId,                         // ← needed for timestamped sermon links
    });
  } catch (err) {
    logger.error({ err }, "sermon-generator: OpenAI companion generation failed");
    if (err instanceof GenerationError) throw err;
    throw new GenerationError("GENERATION_FAILED", "We couldn't prepare the sermon draft. Your sermon has not been saved.");
  }

  // Log companion output for debugging
  logger.info({
    companionTitle: companionDraft.companionTitle,
    entryCount: companionDraft.days.length,
    sampleReflectionLength: companionDraft.days[0]?.reflection?.length ?? 0,
    sermonLinksGenerated: companionDraft.days.filter(d => d.sermonLink).length,
  }, "sermon-generator: companion draft parsed");

  // Validate companion — must have at least 1 entry with substantive reflection.
  // No longer enforces exactly 5 days: the model generates as many days as the
  // sermon content genuinely supports.
  const emptyEntries = companionDraft.days.filter(
    d => !d.reflection || d.reflection.trim().length < 30,
  );
  if (companionDraft.days.length < 1 || companionDraft.days.length > 5 || emptyEntries.length > 0) {
    logger.error({
      entryCount: companionDraft.days.length,
      emptyEntryCount: emptyEntries.length,
      emptyDayNumbers: emptyEntries.map(d => d.dayNumber),
    }, "sermon-generator: AI returned empty or invalid companion entries — rejecting false draft");
    throw new GenerationError(
      "GENERATION_FAILED",
      "Emmaus couldn't generate the Companion entries. Nothing was published.",
    );
  }

  // 7. Save companion to DB — only reached when both AI outputs passed validation
  const sermonId = randomUUID();
  logger.info({ sermonId }, "sermon-generator: saving companion to DB");
  const savedCompanion = await createCompanion({
    sermonId,
    title: companionDraft.companionTitle,
    numberOfDays: companionDraft.days.length,  // store actual days, not a fixed 5
    entries: companionDraft.days,
  });

  // 7. Build sermon draft record — store both full and sermon-only transcripts
  const sermon: SermonDraftFields = {
    id: sermonId,
    title: draftFields.title,
    speaker: draftFields.speaker,
    sermonDate: meta.publishedAt.split("T")[0],
    series: draftFields.series,
    scriptureReference: draftFields.scriptureReference,
    youtubeUrl: meta.youtubeUrl,
    summary: draftFields.summary,
    topics: draftFields.topics,
    keywords: draftFields.keywords,
    transcript: fullTranscript,
    sermonTranscript,
    sermonStartTime: detectionStartSecs != null ? secsToHHMMSS(detectionStartSecs) : "",
    sermonEndTime:   detectionEndSecs   != null ? secsToHHMMSS(detectionEndSecs)   : "",
    detectionConfidence,
    detectionMethod,
    transcriptStatus: fullTranscript ? "complete" : "none",
    aiIndexStatus: "none",
    companionJourneyId: savedCompanion.id,
    mainTheme,
    status: "draft",
    pastorEdited: false,
    updatedAt: new Date().toISOString(),
  };

  // 7. Persist sermon record server-side.
  //    The companion (step 5) is already in PostgreSQL. If sermon persistence
  //    fails we must delete the companion to avoid an orphaned DB record.
  //    Both records being present is the only valid "draft exists" state.
  logger.info({
    sermonId,
    companionId: savedCompanion.id,
    title: sermon.title,
    speaker: sermon.speaker || "(empty — for pastor review)",
    scriptureReference: sermon.scriptureReference || "(empty — for pastor review)",
    mainTheme: sermon.mainTheme,
    summaryLength: sermon.summary?.length ?? 0,
    companionEntryCount: savedCompanion.entries?.length ?? 0,
  }, "sermon-generator: persisting sermon record");
  try {
    await upsertAdminSermon({ ...sermon, createdAt: sermon.updatedAt });
    logger.info({ sermonId, companionId: savedCompanion.id }, "sermon-generator: sermon record persisted server-side");
  } catch (sermonErr) {
    logger.error({ err: sermonErr, sermonId }, "sermon-generator: sermon persistence failed — rolling back companion");
    try {
      await deleteCompanion(savedCompanion.id);
      logger.info({ companionId: savedCompanion.id }, "sermon-generator: companion rolled back");
    } catch (delErr) {
      logger.error({ err: delErr, companionId: savedCompanion.id }, "sermon-generator: companion rollback also failed");
    }
    throw new Error("Failed to persist sermon draft. Please try again.");
  }

  return {
    sermon,
    companion: {
      id: savedCompanion.id,
      title: savedCompanion.title,
      entries: savedCompanion.entries ?? [],
    },
  };
}
