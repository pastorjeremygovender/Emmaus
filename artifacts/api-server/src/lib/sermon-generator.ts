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
  transcript: string;
  transcriptStatus: 'none' | 'pending' | 'complete';
  aiIndexStatus: 'none' | 'pending' | 'indexed';
  companionJourneyId: string;
  status: 'draft';
  pastorEdited: boolean;
  updatedAt: string;
}

export interface CompanionEntryDraft {
  dayNumber: number;
  title: string;
  scriptureReference: string;
  greeting: string;
  reflection: string;
  prayer: string;
  nextStep: string;
  closing: string;
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

// ─── VTT transcript parser ─────────────────────────────────────────────────────

function parseVtt(vtt: string): string {
  // Remove WEBVTT header and cue metadata, keep only text lines
  return vtt
    .split("\n")
    .filter(line => {
      const t = line.trim();
      if (!t) return false;
      if (t.startsWith("WEBVTT")) return false;
      if (/^\d+$/.test(t)) return false;               // cue number
      if (/^\d{2}:\d{2}/.test(t)) return false;        // timestamp
      if (t.startsWith("NOTE")) return false;
      if (t.startsWith("STYLE")) return false;
      return true;
    })
    .map(line => line.replace(/<[^>]+>/g, "").trim())   // strip inline tags
    .filter(Boolean)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// ─── Transcript retrieval ─────────────────────────────────────────────────────

async function fetchTranscript(videoId: string): Promise<{ text: string; source: string } | null> {
  try {
    const accessToken = await getValidAccessToken();
    if (!accessToken) return null;

    const tracks = await listCaptionTracks(videoId, accessToken);
    if (!tracks.length) return null;

    // Prefer: manual (standard) English > any standard > auto-generated (asr)
    const ranked = [...tracks].sort((a, b) => {
      const score = (t: typeof a) =>
        (t.language.startsWith("en") ? 10 : 0) +
        (t.trackKind === "standard" ? 5 : 0) +
        (t.isDraft ? -2 : 0);
      return score(b) - score(a);
    });

    const best = ranked[0];
    const vtt = await downloadCaptionTrack(best.id, accessToken);
    const text = parseVtt(vtt);
    return { text, source: best.trackKind === "asr" ? "youtube-auto" : "youtube-manual" };
  } catch (err) {
    logger.warn({ err: String(err) }, "sermon-generator: transcript retrieval failed (non-fatal)");
    return null;
  }
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

// ─── OpenAI: companion generation ────────────────────────────────────────────

const COMPANION_SYSTEM = `You are a pastoral content writer for a church.
Generate a 5-day devotional companion to a sermon.
Each day should flow naturally from the sermon and deepen the listener's engagement with its message.

Return ONLY JSON — no markdown, no explanation.

JSON shape:
{
  "companionTitle": "...",   // A short title for the whole companion series (e.g. "Walking in Grace: 5 Days from Sunday")
  "days": [
    {
      "dayNumber": 1,
      "title": "...",              // Day title (e.g. "When You Are Running on Empty")
      "scriptureReference": "...", // 1 scripture reference for the day (may differ from sermon's main text)
      "greeting": "...",           // 2-3 sentences. Warm, personal opening. Use [name] for the member.
      "reflection": "...",         // 3-4 paragraphs. Devotional reflection grounded in the scripture and sermon theme.
      "prayer": "...",             // 4-6 sentences. Written in first person for the member to pray aloud.
      "nextStep": "...",           // 1 sentence. One concrete, doable action for today.
      "closing": "..."             // 1 sentence. Warm send-off.
    },
    ... (days 2-5)
  ]
}

Guidelines:
- Each day builds on the previous day's theme
- Prayers begin "Lord," or "Father," — never "Dear God"
- Reflections never repeat the same illustration twice
- [name] placeholder is used in greeting only
- All content is gentle, encouraging, and pastoral in tone`;

async function generateCompanion(context: {
  sermonTitle: string;
  scriptureReference: string;
  summary: string;
  transcript: string;
}): Promise<{
  companionTitle: string;
  days: CompanionEntryDraft[];
}> {
  const transcriptSnippet = context.transcript
    ? `\n\nSermon transcript (first 2000 words):\n${context.transcript.split(/\s+/).slice(0, 2000).join(" ")}`
    : "";

  const userMsg = `Sermon title: ${context.sermonTitle}
Scripture: ${context.scriptureReference}
Summary: ${context.summary}${transcriptSnippet}`;

  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: COMPANION_SYSTEM },
      { role: "user", content: userMsg },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 6000,
  });

  const finishReason = res.choices[0]?.finish_reason;
  const raw = res.choices[0]?.message?.content ?? "{}";
  logger.info({ finishReason, rawLength: raw.length, model: MODEL }, "sermon-generator: OpenAI companion response");

  const parsed = safeParseJson(raw, finishReason) as { companionTitle?: string; days?: unknown[] };

  const days: CompanionEntryDraft[] = [];
  const rawDays = Array.isArray(parsed.days) ? parsed.days : [];

  for (let i = 0; i < 5; i++) {
    const d = (rawDays[i] ?? {}) as Record<string, unknown>;
    days.push({
      dayNumber: i + 1,
      title: typeof d.title === "string" ? d.title : `Day ${i + 1}`,
      scriptureReference: typeof d.scriptureReference === "string" ? d.scriptureReference : context.scriptureReference,
      greeting: typeof d.greeting === "string" ? d.greeting : "",
      reflection: typeof d.reflection === "string" ? d.reflection : "",
      prayer: typeof d.prayer === "string" ? d.prayer : "",
      nextStep: typeof d.nextStep === "string" ? d.nextStep : "",
      closing: typeof d.closing === "string" ? d.closing : "",
    });
  }

  return {
    companionTitle: typeof parsed.companionTitle === "string"
      ? parsed.companionTitle
      : `5 Days with "${context.sermonTitle}"`,
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
}

export async function generateFromUrl(youtubeUrl: string, options: GenerationOptions = {}): Promise<GenerationResult> {
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) {
    throw new GenerationError(
      "INVALID_YOUTUBE_URL",
      "Please enter a valid YouTube video link."
    );
  }

  // 1. Fetch metadata
  let metaList;
  try {
    metaList = await getVideoMetadata([videoId]);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("403") || msg.includes("API key")) {
      throw new GenerationError(
        "VIDEO_UNAVAILABLE",
        "Couldn't reach YouTube — check that the YouTube API key is configured."
      );
    }
    throw new GenerationError(
      "VIDEO_UNAVAILABLE",
      "We couldn't access this YouTube video. Check that it is public and try again."
    );
  }

  if (!metaList.length) {
    throw new GenerationError(
      "VIDEO_UNAVAILABLE",
      "We couldn't access this YouTube video. Check that it is public and try again."
    );
  }

  const meta = metaList[0];
  if (meta.privacyStatus === "private") {
    throw new GenerationError(
      "VIDEO_UNAVAILABLE",
      "We couldn't access this YouTube video. Check that it is public and try again."
    );
  }

  const thumbnailUrl = meta.thumbnailUrl ?? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

  // 2. Resolve transcript — pastor-paste takes priority, then OAuth retrieval
  let transcriptText: string;
  let transcriptStatus: "none" | "pending" | "complete";

  if (options.providedTranscript && options.providedTranscript.trim().length > 50) {
    // Pastor pasted the transcript — use it directly
    transcriptText = options.providedTranscript.trim();
    transcriptStatus = "complete";
    logger.info({ videoId, length: transcriptText.length }, "sermon-generator: using pastor-provided transcript");
  } else {
    // Attempt OAuth transcript retrieval
    const transcriptResult = await fetchTranscript(videoId);
    if (!transcriptResult) {
      // No transcript available — ask the pastor to paste it
      logger.info({ videoId }, "sermon-generator: transcript unavailable, returning TRANSCRIPT_REQUIRED");
      throw new GenerationError(
        "TRANSCRIPT_REQUIRED",
        "We couldn't retrieve a transcript from this video.",
        {
          youtubeUrl,
          videoId,
          title: meta.title,
          thumbnailUrl,
        }
      );
    }
    transcriptText = transcriptResult.text;
    transcriptStatus = "complete";
    logger.info({ videoId, source: transcriptResult.source, length: transcriptText.length }, "sermon-generator: transcript retrieved");
  }

  // 3. Check AI configuration
  if (!process.env.OPENAI_API_KEY) {
    throw new GenerationError(
      "AI_NOT_CONFIGURED",
      "Sermon generation is not configured yet."
    );
  }

  // 4. Generate sermon draft fields
  let draftFields;
  try {
    draftFields = await generateSermonDraft({
      title: meta.title,
      description: meta.description,
      transcript: transcriptText,
    });
  } catch (err) {
    logger.error({ err }, "sermon-generator: OpenAI sermon draft failed");
    if (err instanceof GenerationError) throw err;
    throw new GenerationError(
      "GENERATION_FAILED",
      "We couldn't prepare the sermon draft. Your sermon has not been saved."
    );
  }

  // 5. Generate 5-day companion
  let companionDraft;
  try {
    companionDraft = await generateCompanion({
      sermonTitle: draftFields.title,
      scriptureReference: draftFields.scriptureReference,
      summary: draftFields.summary,
      transcript: transcriptText,
    });
  } catch (err) {
    logger.error({ err }, "sermon-generator: OpenAI companion generation failed");
    if (err instanceof GenerationError) throw err;
    throw new GenerationError(
      "GENERATION_FAILED",
      "We couldn't prepare the sermon draft. Your sermon has not been saved."
    );
  }

  // 5. Save companion to DB
  const sermonId = randomUUID();
  const savedCompanion = await createCompanion({
    sermonId,
    title: companionDraft.companionTitle,
    numberOfDays: 5,
    entries: companionDraft.days,
  });

  // 6. Build sermon draft record
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
    transcript: transcriptText,
    transcriptStatus: transcriptText ? 'complete' : 'none',
    aiIndexStatus: 'none',
    companionJourneyId: savedCompanion.id,  // DB UUID of the companion record
    status: 'draft',
    pastorEdited: false,
    updatedAt: new Date().toISOString(),
  };

  // 7. Persist sermon record server-side.
  //    The companion (step 5) is already in PostgreSQL. If sermon persistence
  //    fails we must delete the companion to avoid an orphaned DB record.
  //    Both records being present is the only valid "draft exists" state.
  try {
    await upsertAdminSermon({ ...sermon, createdAt: sermon.updatedAt });
    logger.info({ sermonId }, "sermon-generator: sermon record persisted server-side");
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
