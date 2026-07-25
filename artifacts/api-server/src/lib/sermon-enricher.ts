/**
 * Sermon Enricher
 *
 * Uses OpenAI as an offline indexing assistant to extract candidate metadata
 * from transcript segments. All AI-derived metadata is stored separately from
 * verified metadata and flagged as AI-generated.
 *
 * The LLM is used for:
 *   - Primary and secondary themes
 *   - Bible books and Scripture references mentioned
 *   - Pastoral needs addressed
 *   - Short segment summary
 *   - Keywords
 *
 * It may NOT fabricate content not present in the transcript.
 * All extracted data requires admin review before appearing in search.
 */

import OpenAI from "openai";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SegmentEnrichment {
  themes: string[];
  scriptureRefs: string[];
  keywords: string[];
  summary: string;
}

export interface SermonEnrichment {
  aiThemes: string[];
  aiScriptureRefs: string[];
  aiKeywords: string[];
  aiSummary: string;
}

// ─── Client ───────────────────────────────────────────────────────────────────

function getOpenAI(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) return null;
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ─── Segment enrichment ───────────────────────────────────────────────────────

const SEGMENT_PROMPT = `You are an indexing assistant for a church sermon archive.
Given a transcript segment, extract structured metadata as JSON.
Extract ONLY what is genuinely present in the text — do not invent content.

Return JSON with these fields:
{
  "themes": [...],        // up to 3 lowercase pastoral/theological themes (e.g. "faith", "forgiveness", "prayer")
  "scriptureRefs": [...], // Bible references mentioned verbatim, e.g. ["John 3:16", "Romans 8:28"]
  "keywords": [...],       // up to 8 lowercase keywords or short phrases useful for search
  "summary": "..."         // 1-2 sentence summary grounded only in what was said
}

If a field has no applicable content, return an empty array or empty string.
Return only the JSON object, no explanation.`;

export async function enrichSegment(
  text: string,
): Promise<SegmentEnrichment> {
  const openai = getOpenAI();
  if (!openai) {
    return { themes: [], scriptureRefs: [], keywords: [], summary: "" };
  }

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SEGMENT_PROMPT },
        { role: "user", content: `Segment text:\n\n${text.slice(0, 2000)}` },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 400,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as Partial<SegmentEnrichment>;

    return {
      themes: Array.isArray(parsed.themes) ? parsed.themes.map(String).map(s => s.toLowerCase()).slice(0, 5) : [],
      scriptureRefs: Array.isArray(parsed.scriptureRefs) ? parsed.scriptureRefs.map(String).slice(0, 10) : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String).map(s => s.toLowerCase()).slice(0, 10) : [],
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 300) : "",
    };
  } catch (err) {
    logger.warn({ err: String(err) }, "Segment enrichment failed");
    return { themes: [], scriptureRefs: [], keywords: [], summary: "" };
  }
}

// ─── Whole-sermon enrichment ──────────────────────────────────────────────────

const SERMON_PROMPT = `You are an indexing assistant for a church sermon archive.
Given an excerpt of a sermon transcript (may be truncated), extract structured metadata.
Extract ONLY what is present in the text — do not invent content.

Return JSON:
{
  "themes": [...],        // up to 5 lowercase pastoral/theological themes
  "scriptureRefs": [...], // Bible references explicitly mentioned
  "keywords": [...],      // up to 15 lowercase keywords or short phrases
  "summary": "..."         // 2-3 sentence summary of the sermon's main message
}

Return only the JSON object.`;

export async function enrichSermon(
  transcript: string,
): Promise<SermonEnrichment> {
  const openai = getOpenAI();
  if (!openai) {
    return { aiThemes: [], aiScriptureRefs: [], aiKeywords: [], aiSummary: "" };
  }

  // Use the first ~3000 words of the transcript for sermon-level enrichment
  const excerpt = transcript.split(/\s+/).slice(0, 800).join(" ");

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      messages: [
        { role: "system", content: SERMON_PROMPT },
        { role: "user", content: `Sermon transcript excerpt:\n\n${excerpt}` },
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 600,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw) as {
      themes?: unknown;
      scriptureRefs?: unknown;
      keywords?: unknown;
      summary?: unknown;
    };

    return {
      aiThemes: Array.isArray(parsed.themes) ? parsed.themes.map(String).map(s => s.toLowerCase()) : [],
      aiScriptureRefs: Array.isArray(parsed.scriptureRefs) ? parsed.scriptureRefs.map(String) : [],
      aiKeywords: Array.isArray(parsed.keywords) ? parsed.keywords.map(String).map(s => s.toLowerCase()) : [],
      aiSummary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 500) : "",
    };
  } catch (err) {
    logger.warn({ err: String(err) }, "Sermon enrichment failed");
    return { aiThemes: [], aiScriptureRefs: [], aiKeywords: [], aiSummary: "" };
  }
}

// ─── Batch helper ─────────────────────────────────────────────────────────────

/**
 * Enrich all segments for a sermon, rate-limited to avoid API quota issues.
 * Returns the enrichments in the same order as the input segments.
 */
export async function enrichSegments(
  segments: Array<{ cleanedText: string }>,
  options: { concurrency?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<SegmentEnrichment[]> {
  const { concurrency = 3, onProgress } = options;
  const results: SegmentEnrichment[] = new Array(segments.length).fill(null);

  for (let i = 0; i < segments.length; i += concurrency) {
    const batch = segments.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((s) => enrichSegment(s.cleanedText))
    );
    for (let j = 0; j < batchResults.length; j++) {
      results[i + j] = batchResults[j];
    }
    onProgress?.(Math.min(i + concurrency, segments.length), segments.length);

    // Brief pause between batches to avoid rate limiting
    if (i + concurrency < segments.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  return results;
}
