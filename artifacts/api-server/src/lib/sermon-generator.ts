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
    if (v) return v;
    // https://youtu.be/ID
    if (u.hostname === "youtu.be") return u.pathname.slice(1).split("?")[0] || null;
    // https://www.youtube.com/embed/ID
    const parts = u.pathname.split("/");
    const embedIdx = parts.indexOf("embed");
    if (embedIdx >= 0 && parts[embedIdx + 1]) return parts[embedIdx + 1];
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
    max_completion_tokens: 600,
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as Record<string, unknown>;

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
    max_completion_tokens: 4000,
  });

  const raw = res.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { companionTitle?: string; days?: unknown[] };

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

export async function generateFromUrl(youtubeUrl: string): Promise<GenerationResult> {
  const videoId = extractVideoId(youtubeUrl);
  if (!videoId) {
    throw new Error("That doesn't look like a valid YouTube URL. Please use a link like https://www.youtube.com/watch?v=...");
  }

  // 1. Fetch metadata
  let metaList;
  try {
    metaList = await getVideoMetadata([videoId]);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("403") || msg.includes("API key")) {
      throw new Error("Couldn't reach YouTube — check that the YouTube API key is configured.");
    }
    throw new Error("Couldn't fetch video details from YouTube. Please check the URL and try again.");
  }

  if (!metaList.length) {
    throw new Error("No video found for that URL. The video may be private or deleted.");
  }

  const meta = metaList[0];
  if (meta.privacyStatus === "private") {
    throw new Error("This video is private and cannot be accessed.");
  }

  // 2. Attempt transcript retrieval (non-fatal)
  const transcriptResult = await fetchTranscript(videoId);
  const transcriptText = transcriptResult?.text ?? "";
  const transcriptSource = transcriptResult?.source ?? null;

  // 3. Generate sermon draft fields
  let draftFields;
  if (!process.env.OPENAI_API_KEY) {
    draftFields = {
      title: meta.title,
      speaker: "",
      series: "",
      scriptureReference: "",
      summary: meta.description.slice(0, 200),
      topics: [],
      keywords: [],
    };
  } else {
    try {
      draftFields = await generateSermonDraft({
        title: meta.title,
        description: meta.description,
        transcript: transcriptText,
      });
    } catch (err) {
      logger.error({ err }, "sermon-generator: OpenAI sermon draft failed");
      throw new Error("We couldn't generate the sermon draft. Please try again in a moment.");
    }
  }

  // 4. Generate 5-day companion
  let companionDraft;
  if (!process.env.OPENAI_API_KEY) {
    companionDraft = {
      companionTitle: `5 Days with "${draftFields.title}"`,
      days: Array.from({ length: 5 }, (_, i) => ({
        dayNumber: i + 1,
        title: `Day ${i + 1} — [Draft title]`,
        scriptureReference: draftFields.scriptureReference,
        greeting: "[Greeting — pastoral review required]",
        reflection: "[Devotional reflection — pastoral review required]",
        prayer: "[Prayer — pastoral review required]",
        nextStep: "[Next step — pastoral review required]",
        closing: "[Closing — pastoral review required]",
      })),
    };
  } else {
    try {
      companionDraft = await generateCompanion({
        sermonTitle: draftFields.title,
        scriptureReference: draftFields.scriptureReference,
        summary: draftFields.summary,
        transcript: transcriptText,
      });
    } catch (err) {
      logger.error({ err }, "sermon-generator: OpenAI companion generation failed");
      throw new Error("Sermon draft was created but the companion generation failed. Please try again.");
    }
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
