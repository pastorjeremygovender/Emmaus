/**
 * journey-ai.ts — AI Journey Generator using OpenAI
 *
 * Two generators:
 *   generateJourney()           — legacy: raw prompt → GeneratedJourney (used by /journeys/generate)
 *   generateStructuredJourney() — new:    structured BuilderPayload → Block arrays per step
 *
 * All generated content is Draft. Nothing publishes automatically.
 */

import OpenAI from "openai";

function slugify(str: string): string {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ─── Legacy types (kept for /journeys/generate) ───────────────────────────────

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

// ─── Structured builder types ─────────────────────────────────────────────────

export interface BuilderPayload {
  contentType: string;          // Q1
  title: string;                // Q2
  purpose: string;              // Q3
  desiredOutcome: string;       // Q4
  audience: string[];           // Q5
  customAudience?: string;
  collectionId?: string;        // Q6
  rhythm: string;               // Q7  daily | self-paced | weekly | guided
  length: number;               // Q8  number of steps
  estimatedTime: string;        // Q9  e.g. "About 15 minutes"
  scriptureRefs: ValidatedScripture[]; // Q10  validated
  sermonSources: ApprovedSermon[];     // Q11
  components: string[];         // Q12  which block types to include
  requiresDailyGate: boolean;   // Q13
  writingStyle: string;         // Q14
  specialInstructions?: string; // Q15
}

export interface ValidatedScripture {
  reference: string;            // e.g. "John 15"
  bookId: string;
  chapter: number;
  verseText?: string;           // retrieved from Bible API
}

export interface ApprovedSermon {
  sermonId: string;
  title: string;
  date: string;
  timestamp?: number;
  scriptureReference?: string;
}

export interface GeneratedBlock {
  type: string;
  content: Record<string, unknown>;
}

export interface GeneratedStructuredStep {
  day: number;
  title: string;
  blocks: GeneratedBlock[];
  // canonical fields extracted for backward-compat
  scripture?: string;
  devotional?: string;
  reflectionQuestion?: string;
  prayerPrompt?: string;
  actionStep?: string;
  mentorIntro?: string;
  memoryVerse?: string;
}

export interface GeneratedStructuredJourney {
  title: string;
  description: string;
  subtitle?: string;
  tags: string[];
  steps: GeneratedStructuredStep[];
  sourcesSummary: {
    scriptureReferences: string[];
    sermonsUsed: Array<{ title: string; date: string }>;
    generatedSections: string[];
  };
}

// ─── Legacy generator (unchanged) ────────────────────────────────────────────

const LEGACY_SYSTEM_PROMPT = `You are a discipleship content author helping a church create spiritual growth journeys for their congregation.

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

export async function generateJourney(prompt: string): Promise<{
  journey: GeneratedJourney;
  id: string;
  rawPrompt: string;
}> {
  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: LEGACY_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 16000,
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

// ─── Structured generator ─────────────────────────────────────────────────────

function buildStructuredSystemPrompt(payload: BuilderPayload): string {
  const styleGuide: Record<string, string> = {
    "Emmaus Standard": "Write in a warm, clear, pastoral, Scripture-centred tone. Accessible to any believer.",
    "Pastor Jeremy Style": "Write with a natural, direct, encouraging tone grounded in ICC preaching. Practical, warm, Jesus-centred, avoids academic or corporate language.",
    "New Believer": "Use simple, clear language. Explain terms. Do not assume prior Bible knowledge.",
    "Bible Study": "Include observation, interpretation, and application. More detailed than a devotional.",
    "Small Group": "Frame content for group discussion. Include prompts for sharing.",
    "Youth": "Clear, current, age-appropriate. Avoid forced slang but stay accessible to teenagers.",
    "Children": "Very simple language. Short sentences. Suitable for younger readers.",
  };

  const style = styleGuide[payload.writingStyle] ?? styleGuide["Emmaus Standard"];

  const componentGuide = payload.components.map(c => {
    const map: Record<string, string> = {
      scripture: '"scripture" block — use the verified Scripture text provided, do not invent text',
      reflection: '"reflection" block — one deep personal question',
      prayer: '"prayer" block — 3-5 sentence first-person guided prayer',
      action: '"action" block — one concrete practical step',
      "opening-thought": '"paragraph" block — warm 2-3 sentence opener (mentor perspective)',
      "journal-prompt": '"question" block — journaling question',
      "discussion-question": '"question" block — small group discussion question',
      "memory-verse": '"memory-verse" block — short verse with reference',
      "sermon-clip": '"sermon-clip" block — only if a verified sermon source is provided',
      "closing-encouragement": '"callout" block — brief closing encouragement',
      "completion-prompt": '"completion" block — completion marker with affirming message',
    };
    return map[c] || c;
  }).join("\n  - ");

  return `You are a discipleship content author for Emmaus, a church discipleship application.

WRITING STYLE: ${style}

JOURNEY CONTEXT:
- Title: ${payload.title}
- Content type: ${payload.contentType}
- Purpose: ${payload.purpose}
- Desired outcome: ${payload.desiredOutcome}
- Audience: ${[...payload.audience, payload.customAudience].filter(Boolean).join(", ")}
- Rhythm: ${payload.rhythm}
- Total steps: ${payload.length}
- Time per step: ${payload.estimatedTime}
${payload.specialInstructions ? `- Special instructions: ${payload.specialInstructions}` : ""}

CONTENT CONSTITUTION (non-negotiable):
- Scripture is the primary authority. Never invent Bible verses.
- Scripture text provided in the prompt is REAL and VERIFIED — use it exactly as given.
- Do not fabricate sermon quotations or timestamps.
- Never claim spiritual transformation is guaranteed.
- Never use guilt-based language.
- Distinguish clearly between Bible text and reflection/commentary.
- Every step must contribute toward the desired outcome.
- Create a clear beginning, developing middle, and purposeful conclusion across all steps.

BLOCK TYPES TO USE PER STEP:
  - ${componentGuide}

The standard progression within each step is:
  Scripture → Reflection → Prayer → Practical response

Return ONLY valid JSON (no markdown, no explanation) in this exact structure:
{
  "title": "Journey title — use the provided title unless it needs minor refinement",
  "description": "2-3 sentence journey description",
  "subtitle": "short subtitle (optional)",
  "tags": ["tag1", "tag2"],
  "steps": [
    {
      "day": 1,
      "title": "Step title — thematic phrase, never 'Day 1' or 'Step 1'",
      "blocks": [
        {
          "type": "paragraph",
          "content": { "text": "Warm mentor-style opening (2-3 sentences, first person welcoming tone)" }
        },
        {
          "type": "scripture",
          "content": {
            "reference": "Book Chapter:Verse",
            "text": "Use the exact verified text provided. If not provided, leave text empty and write only the reference.",
            "translation": "NIV"
          }
        },
        {
          "type": "paragraph",
          "content": { "text": "150-250 word reflection/teaching on this scripture" }
        },
        {
          "type": "reflection",
          "content": { "question": "One deep personal reflection question" }
        },
        {
          "type": "prayer",
          "content": { "text": "3-5 sentence first-person guided prayer" }
        },
        {
          "type": "action",
          "content": { "text": "One concrete, specific action step for today" }
        },
        {
          "type": "completion",
          "content": { "message": "Brief warm completion message (1-2 sentences)" }
        }
      ]
    }
  ]
}

VALIDATION RULES:
- Produce exactly ${payload.length} steps. No more, no less.
- Every step must have a unique title.
- Every step must have at least one scripture reference.
- The final step must connect clearly to the desired outcome.
- No step may be empty.
- Vary reflection questions across steps — never repeat wording.
- Vary prayers across steps — never repeat wording.`;
}

export async function generateStructuredJourney(
  payload: BuilderPayload
): Promise<GeneratedStructuredJourney> {
  // Build the user message with verified Scripture embedded
  const scriptureSection = payload.scriptureRefs.length > 0
    ? `\n\nVERIFIED SCRIPTURE (use these references and text exactly as provided):\n${
        payload.scriptureRefs.map(s =>
          `${s.reference}${s.verseText ? `: "${s.verseText}"` : " (reference only — do not invent text)"}`
        ).join("\n")
      }`
    : "";

  const sermonSection = payload.sermonSources.length > 0
    ? `\n\nAPPROVED SERMON SOURCES (you may reference these, never fabricate quotes):\n${
        payload.sermonSources.map(s =>
          `- "${s.title}" (${s.date})${s.scriptureReference ? ` — ${s.scriptureReference}` : ""}${s.timestamp ? ` — timestamp ${s.timestamp}s` : ""} — ID: ${s.sermonId}`
        ).join("\n")
      }`
    : "";

  const userMessage = `Create a ${payload.length}-step discipleship Journey titled "${payload.title}".

Journey purpose: ${payload.purpose}
Desired outcome: ${payload.desiredOutcome}${scriptureSection}${sermonSection}

Generate all ${payload.length} steps now. Ensure each step advances toward the desired outcome.`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: buildStructuredSystemPrompt(payload) },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 20000,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  let parsed: { title: string; description: string; subtitle?: string; tags?: string[]; steps: Array<{ day: number; title: string; blocks: GeneratedBlock[] }> };

  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("We couldn't create the Journey draft. Your setup has been saved. Please try again.");
  }

  if (!parsed.title || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
    throw new Error("We couldn't create the Journey draft. Your setup has been saved. Please try again.");
  }

  // Validate step count
  if (parsed.steps.length !== payload.length) {
    // Trim or warn but don't fail
    parsed.steps = parsed.steps.slice(0, payload.length);
  }

  // Build source summary
  const sourcesSummary = {
    scriptureReferences: payload.scriptureRefs.map(s => s.reference),
    sermonsUsed: payload.sermonSources.map(s => ({ title: s.title, date: s.date })),
    generatedSections: [
      payload.components.includes("reflection") ? "Reflection drafts" : null,
      payload.components.includes("prayer") ? "Prayer prompts" : null,
      payload.components.includes("action") ? "Action Steps" : null,
      payload.components.includes("opening-thought") ? "Opening thoughts" : null,
    ].filter(Boolean) as string[],
  };

  return {
    title: parsed.title,
    description: parsed.description,
    subtitle: parsed.subtitle,
    tags: parsed.tags ?? [],
    steps: parsed.steps.map((s, i) => ({
      day: i + 1,
      title: s.title,
      blocks: s.blocks ?? [],
      // Extract canonical fields for backward compat
      scripture: extractText(s.blocks, "scripture", "reference"),
      devotional: extractParagraph(s.blocks, 1),
      mentorIntro: extractParagraph(s.blocks, 0),
      reflectionQuestion: extractText(s.blocks, "reflection", "question"),
      prayerPrompt: extractText(s.blocks, "prayer", "text"),
      actionStep: extractText(s.blocks, "action", "text"),
      memoryVerse: extractText(s.blocks, "memory-verse", "text"),
    })),
    sourcesSummary,
  };
}

function extractText(blocks: GeneratedBlock[], type: string, field: string): string {
  const b = blocks.find(bl => bl.type === type);
  return (b?.content?.[field] as string) ?? "";
}

function extractParagraph(blocks: GeneratedBlock[], index: number): string {
  const paras = blocks.filter(b => b.type === "paragraph");
  return (paras[index]?.content?.["text"] as string) ?? "";
}

// ─── Block AI action ──────────────────────────────────────────────────────────

export async function aiBlockAction(
  action: string,
  blockType: string,
  currentContent: Record<string, unknown>,
  journeyContext: string,
): Promise<Record<string, unknown>> {
  const actionPrompts: Record<string, string> = {
    rewrite: "Rewrite this content in a warm, pastoral, Scripture-centred style. Preserve the meaning but improve clarity and warmth.",
    shorten: "Shorten this content by about 40%. Keep the most important sentence or two. Preserve the tone.",
    expand: "Expand this content with 1-2 more sentences of pastoral depth. Stay warm, clear, and Scripture-centred.",
    "make-warmer": "Rewrite this to feel warmer and more personal, as though a trusted pastor is speaking.",
    "make-clearer": "Rewrite this for clarity. Use shorter sentences. Avoid jargon.",
    "new-believer": "Rewrite this for someone who is brand new to faith. Explain any terms. Use simple language.",
    "suggest-prayer": "Write a new guided prayer in first person (3-5 sentences). Warm, honest, Scripture-rooted. No guilt language.",
    "suggest-action": "Suggest a single concrete, practical action step a person could take today. One sentence, specific and doable.",
    "find-scripture": "Suggest ONE relevant Scripture reference (Book Chapter:Verse) that fits this content. Return only the reference as the text field.",
    regenerate: "Completely regenerate this content. Keep the same block type and purpose but write fresh content.",
  };

  const instruction = actionPrompts[action] ?? actionPrompts.rewrite;

  const systemPrompt = `You are a pastoral content editor for Emmaus, a church discipleship app.

Journey context: ${journeyContext}

RULES:
- Treat Scripture as primary authority. Never invent Bible verses.
- Keep language warm, pastoral, and accessible.
- Do not use guilt-based language.
- Return ONLY valid JSON with the same field structure as the input.
- Do not add new fields. Only update the content values.`;

  const userMessage = `${instruction}

Block type: ${blockType}
Current content:
${JSON.stringify(currentContent, null, 2)}

Return the updated content object only (same structure, no extra wrapper).`;

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 1200,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("We couldn't complete that action. Please try again.");
  }
}
