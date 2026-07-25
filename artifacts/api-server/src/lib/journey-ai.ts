/**
 * journey-ai.ts — AI Journey Generator using OpenAI
 *
 * Generates a complete discipleship journey (title, description, steps) from
 * a natural-language prompt. All generated content is returned as Draft —
 * nothing publishes automatically.
 */

import OpenAI from "openai";
function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GeneratedStep {
  day: number;
  title: string;
  mentorIntro: string;
  scripture: string;
  teaching: string;
  reflectionQuestion: string;
  prayer: string;
  todaysResponse: string;
  memoryVerse?: string;
  suggestedSermonTopic?: string;
  askEmmausPrompt?: string;
  completionText?: string;
}

export interface GeneratedJourney {
  title: string;
  description: string;
  steps: GeneratedStep[];
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a discipleship content author helping a church create spiritual growth journeys for their congregation.

Generate a complete journey based on the user's request. The journey should be practical, scripturally grounded, and accessible to everyday Christians.

Return ONLY valid JSON (no markdown, no explanation) in this exact structure:
{
  "title": "string — compelling journey title",
  "description": "string — 2-3 sentence description of the journey",
  "steps": [
    {
      "day": 1,
      "title": "string — step title (theme phrase, not 'Day 1')",
      "mentorIntro": "string — warm, personal 2-3 sentence opener from a mentor's perspective (first person, welcoming)",
      "scripture": "string — primary scripture reference e.g. 'John 15:5'",
      "teaching": "string — 150-300 word devotional exploring the scripture and theme",
      "reflectionQuestion": "string — one deep, personal reflection question",
      "prayer": "string — 3-5 sentence guided prayer in first person",
      "todaysResponse": "string — one concrete, specific action to take today",
      "memoryVerse": "string — short verse text with reference (optional, can be empty string)",
      "suggestedSermonTopic": "string — brief topic that a sermon reference might address (optional)",
      "askEmmausPrompt": "string — one follow-up question a user might ask about this passage (optional)",
      "completionText": "string — brief encouraging completion message (1-2 sentences, optional)"
    }
  ]
}

Rules:
- Number steps starting from 1
- Never generate more steps than requested
- Teaching content must be substantive (150-300 words per step)
- Keep language warm, pastoral, and accessible — avoid academic tone
- Base all content on sound biblical interpretation
- Every scripture reference must be real and accurate`;

// ─── Generator ────────────────────────────────────────────────────────────────

export async function generateJourney(prompt: string): Promise<{
  journey: GeneratedJourney;
  id: string;
  rawPrompt: string;
}> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 16000,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: GeneratedJourney;

  try {
    parsed = JSON.parse(raw) as GeneratedJourney;
  } catch {
    throw new Error("AI returned invalid JSON — please try again");
  }

  if (!parsed.title || !Array.isArray(parsed.steps)) {
    throw new Error("AI response missing required fields — please try again");
  }

  const id = slugify(parsed.title) + "-ai-" + Date.now();

  return { journey: parsed, id, rawPrompt: prompt };
}
