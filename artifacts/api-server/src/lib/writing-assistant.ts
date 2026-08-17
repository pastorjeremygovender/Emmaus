/**
 * writing-assistant.ts — Emmaus Writing Assistant: pastoral content generation
 *
 * Generates Daily Rhythm draft content for authorised pastors and content editors.
 * Never publishes. Never auto-approves. All output is Draft.
 *
 * Follows the Emmaus source order: Scripture → ICC sermon (optional) → Synthesis.
 * The Scripture passage text is used in the prompt for context but is NEVER stored
 * in the output — only the validated reference is stored.
 */

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

// ─── Types ────────────────────────────────────────────────────────────────────

export type WritingStyle =
  | "emmaus-standard"
  | "pastor-jeremy"
  | "new-believer"
  | "bible-study"
  | "youth";

export type DraftField =
  | "mentorIntro"
  | "devotional"
  | "prayerPrompt"
  | "actionStep"
  | "closingText";

export interface SermonContext {
  sermonId: string;
  sermonTitle: string;
  timestamp?: number;
  snippet?: string;
}

export interface PreviousDayContext {
  day: number;
  title: string;
  scripture: string;
  reflection: string;
  nextStep: string;
}

export interface GenerationInputs {
  dayNumber: number;
  title: string;
  scriptureRef: string;
  passageText: string; // retrieved from Bible system — used in prompt only, never stored
  centralTruth: string;
  connectionToPrevious?: string;
  desiredNextStep?: string;
  additionalDirection?: string;
  writingStyle: WritingStyle;
  sermonContext?: SermonContext;
  previousDayContext?: PreviousDayContext;
  // Which field to regenerate (omit to generate all five)
  targetField?: DraftField;
}

export interface DraftResult {
  mentorIntro: string;
  devotional: string;
  prayerPrompt: string;
  actionStep: string;
  closingText: string;
  review: {
    scriptureUsed: string;
    centralTruth: string;
    sermonSource: string | null;
    warnings: string[];
  };
}

export interface RefineContext {
  scripture: string;
  dayTitle: string;
  centralTruth?: string;
  fieldLabel: string;
}

export type RefineAction =
  | "warmer"
  | "clearer"
  | "shorter"
  | "paragraph-flow"
  | "new-believer"
  | "jesus-central"
  | "another-prayer"
  | "another-next-step"
  | "check-repetition";

// ─── Style guidance ───────────────────────────────────────────────────────────

const STYLE_INSTRUCTIONS: Record<WritingStyle, string> = {
  "emmaus-standard": `
Write in the Emmaus standard voice: warm, pastoral, Scripture-rooted.
Clear language, natural tone. Suitable for any ICC member.
Reflect the depth of the passage without overcomplicating it.
`,
  "pastor-jeremy": `
Write in the pastoral voice used throughout the Emmaus programme — warm, direct and Christ-centred.
This voice has the following characteristics (draw on them without inventing quotes or personal stories):
- Speaks directly to the reader as an individual, not a crowd
- Explains Scripture in everyday language without watering it down
- Acknowledges real life honestly — hurt, doubt, tiredness — but always points to Jesus
- Practical application is grounded in grace, never guilt
- Hope is not performance-based or achievement-based; it comes from who Jesus is
- South African English (use standard South African spelling and idiom where natural)
- Natural paragraphs, conversational rhythm, never preachy

Do not impersonate the pastor. Do not fabricate personal stories, ministry experiences or direct quotations.
Write as an expression of this tone, not as the pastor's voice.
`,
  "new-believer": `
Write for someone who may be brand new to faith or still exploring.
Assume no church background. Explain terms gently.
Every point must be accessible, reassuring and grace-filled.
The tone is welcoming and never condescending.
`,
  "bible-study": `
Write with slightly more depth and textual engagement.
Reference the structure and context of the passage naturally.
Encourage careful reading and reflection on specific verses.
Still warm and pastoral — not academic.
`,
  youth: `
Write for young people (secondary school and young adults, 14–25).
Honest, real and warm. Acknowledges their world.
Avoid condescension. Engage with how faith connects to real daily life.
Language is contemporary without being forced or slang-heavy.
Still Christ-centred and Scripture-rooted.
`,
};

// ─── System prompt ────────────────────────────────────────────────────────────

function buildSystemPrompt(style: WritingStyle): string {
  return `
You are the Emmaus Writing Assistant — a pastoral writing tool used exclusively by authorised pastors and content editors at ICC (International Christian Centre) to prepare Daily Rhythm devotional content.

Your sole purpose: generate Scripture-centred daily devotional drafts for the "10 Minutes with Jesus" programme.

You are not a chatbot. You do not hold conversations. You generate structured pastoral content.

─────────────────────────────────────────
SOURCE ORDER (Emmaus Constitution)
─────────────────────────────────────────
Always follow this order:
1. Scripture — primary; always begin here
2. Approved ICC sermon material — only when explicitly provided and requested
3. Emmaus synthesis

The passage has been retrieved from the Emmaus Bible system and will be provided to you. Use it accurately. Do not modify or paraphrase Scripture text in a way that misrepresents its meaning.

Do not invent Scripture text. Do not invent sermon quotes, timestamps or minister statements.

─────────────────────────────────────────
WRITING STANDARDS
─────────────────────────────────────────
Every draft must:
- Begin from the provided Scripture
- Help people see Jesus clearly — this is the central goal
- Sound warm, pastoral and natural — one person speaking gently to another
- Use clear, accessible language
- Avoid theological jargon where possible
- Avoid shame, guilt-based motivation or emotional manipulation
- Avoid self-help language detached from Christ
- Give one next step only
- Finish with hope
- Leave room for the reader to respond

─────────────────────────────────────────
PARAGRAPH STANDARD
─────────────────────────────────────────
- One complete thought per paragraph
- Most paragraphs: two to four sentences
- Single-sentence paragraphs only for deliberate emphasis
- Never produce a blank line after every sentence
- Never produce bullet-point fragments or PowerPoint-style one-liners
- Never produce large unbroken walls of text

─────────────────────────────────────────
SECTION RULES
─────────────────────────────────────────
GREETING (mentorIntro):
- Begin with a short warm welcome: "Good morning." or "I'm glad you're here."
- Do NOT insert any person's name. The system personalises the greeting automatically.
- Do not use {name}, [Name] or any template placeholder.
- Brief: two to four sentences.

REFLECTION (devotional):
- Answer: What does this passage reveal about Jesus?
- May connect the passage to the reader's life — but Jesus remains central.
- Not a sermon. Not a Bible commentary. Not a motivation talk.
- Suitable for ten minutes of quiet, thoughtful reading.
- Natural paragraphs with complete thoughts.

PRAYER (prayerPrompt):
- Brief, honest, Christ-centred.
- Connected to the passage.
- Suitable for someone brand new to faith — no complex theological language.
- Natural when spoken aloud.
- Do not promise outcomes Scripture does not promise.

YOUR NEXT STEP (actionStep):
- One practical response only — not a checklist, not multiple tasks.
- Flows directly from the passage.
- Achievable today.
- Encourages prayer, obedience, reflection, service or Scripture engagement.

CLOSING (closingText):
- Default: "Tomorrow we'll continue walking together."
- The pastor may edit this.
- Do not generate congratulations, streak language, badges, marketing slogans or "Walk with Jesus" forced sign-offs.

─────────────────────────────────────────
STYLE GUIDANCE
─────────────────────────────────────────
${STYLE_INSTRUCTIONS[style].trim()}

─────────────────────────────────────────
OUTPUT FORMAT — IMPORTANT
─────────────────────────────────────────
Return ONLY valid JSON matching this exact schema. No markdown fences. No extra keys.

{
  "mentorIntro": "string",
  "devotional": "string",
  "prayerPrompt": "string",
  "actionStep": "string",
  "closingText": "string",
  "review": {
    "scriptureUsed": "string (the reference provided)",
    "centralTruth": "string (the central truth from the input)",
    "sermonSource": null or "string (sermon title if used)",
    "warnings": [] or ["string"]
  }
}

Use \\n\\n to separate paragraphs within a field. Do not use markdown in the field text.
  `.trim();
}

// ─── User prompt builder ──────────────────────────────────────────────────────

function buildUserPrompt(inputs: GenerationInputs): string {
  const lines: string[] = [
    `DAY ${inputs.dayNumber}: ${inputs.title}`,
    "",
    `SCRIPTURE REFERENCE: ${inputs.scriptureRef}`,
    "",
    "PASSAGE TEXT (retrieved from Emmaus Bible system — use accurately):",
    inputs.passageText || "[Passage text not available — use only the reference]",
    "",
    `CENTRAL TRUTH ABOUT JESUS: ${inputs.centralTruth}`,
  ];

  if (inputs.connectionToPrevious?.trim()) {
    lines.push("", `CONNECTION TO PREVIOUS DAY: ${inputs.connectionToPrevious.trim()}`);
  }

  if (inputs.desiredNextStep?.trim()) {
    lines.push("", `DESIRED NEXT STEP: ${inputs.desiredNextStep.trim()}`);
  }

  if (inputs.additionalDirection?.trim()) {
    lines.push("", `ADDITIONAL PASTORAL DIRECTION: ${inputs.additionalDirection.trim()}`);
  }

  if (inputs.sermonContext) {
    const s = inputs.sermonContext;
    lines.push(
      "",
      "APPROVED ICC SERMON SOURCE (use as supporting context only — do not copy, invent quotes or fabricate):",
      `  Sermon: "${s.sermonTitle}"`,
      s.timestamp !== undefined ? `  Timestamp: ${Math.floor(s.timestamp / 60)}:${String(s.timestamp % 60).padStart(2, "0")}` : "",
      s.snippet ? `  Excerpt: "${s.snippet}"` : "",
    );
  }

  if (inputs.previousDayContext) {
    const p = inputs.previousDayContext;
    lines.push(
      "",
      `PREVIOUS DAY CONTEXT (Day ${p.day} — use only to maintain continuity and avoid repetition):`,
      `  Title: ${p.title}`,
      `  Scripture: ${p.scripture}`,
      `  Next Step used: ${p.nextStep}`,
    );
  }

  if (inputs.targetField) {
    lines.push(
      "",
      `TASK: Regenerate ONLY the "${inputs.targetField}" field.`,
      "Return the full JSON schema but only update this field — copy the existing values for all other fields.",
      "If you do not have existing values for other fields, use empty strings.",
    );
  } else {
    lines.push("", "TASK: Generate all five content fields (mentorIntro, devotional, prayerPrompt, actionStep, closingText).");
  }

  return lines.filter(l => l !== undefined).join("\n");
}

// ─── Generation function ──────────────────────────────────────────────────────

export async function generateDailyRhythmDraft(
  inputs: GenerationInputs
): Promise<DraftResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const systemPrompt = buildSystemPrompt(inputs.writingStyle);
  const userPrompt = buildUserPrompt(inputs);

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user",   content: userPrompt },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 2000,
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";

  let parsed: Partial<DraftResult>;
  try {
    parsed = JSON.parse(raw) as Partial<DraftResult>;
  } catch {
    throw new Error("Failed to parse AI response as JSON");
  }

  return {
    mentorIntro:  parsed.mentorIntro  ?? "",
    devotional:   parsed.devotional   ?? "",
    prayerPrompt: parsed.prayerPrompt ?? "",
    actionStep:   parsed.actionStep   ?? "",
    closingText:  parsed.closingText  ?? "Tomorrow we'll continue walking together.",
    review: {
      scriptureUsed: parsed.review?.scriptureUsed ?? inputs.scriptureRef,
      centralTruth:  parsed.review?.centralTruth  ?? inputs.centralTruth,
      sermonSource:  parsed.review?.sermonSource  ?? (inputs.sermonContext?.sermonTitle ?? null),
      warnings:      parsed.review?.warnings      ?? [],
    },
  };
}

// ─── Focused editing refine ───────────────────────────────────────────────────

const REFINE_ACTION_INSTRUCTIONS: Record<RefineAction, string> = {
  "warmer":           "Rewrite this to feel warmer and more personally inviting. Keep the meaning. Do not add a name.",
  "clearer":          "Rewrite this to be clearer and easier to understand. Simplify without losing substance.",
  "shorter":          "Shorten this significantly while preserving the core meaning. Remove repetition and filler.",
  "paragraph-flow":   "Improve the paragraph flow. Ensure each paragraph contains one complete thought. Use 2–4 sentences per paragraph naturally.",
  "new-believer":     "Rewrite this to be accessible for someone brand new to faith. Assume no church background. Explain terms gently.",
  "jesus-central":    "Rewrite this to keep Jesus more clearly at the centre. Ensure the focus returns to who Jesus is and what he has done.",
  "another-prayer":   "Write a fresh version of this prayer. Brief, honest, Christ-centred and connected to the passage. Suitable for a new believer.",
  "another-next-step":"Suggest a different practical next step. One response only. Flows from the Scripture. Achievable today.",
  "check-repetition": "Identify any phrases, ideas or next steps that may be repetitive with the previous day context provided, and suggest a revised version that avoids them.",
};

export async function refineContent(
  action: RefineAction,
  content: string,
  context: RefineContext,
): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key not configured");
  }

  const instruction = REFINE_ACTION_INSTRUCTIONS[action];

  const system = `
You are a pastoral writing editor for the Emmaus Daily Rhythm programme.
Your task: refine a specific piece of devotional content.

Writing standards:
- Warm, pastoral and natural
- Scripture-centred; Jesus remains central
- Clear language, no jargon
- Avoid shame, guilt or emotional manipulation
- Natural paragraphs (2–4 sentences each normally)
- No person's name in greetings
- Use \\n\\n to separate paragraphs; no markdown

Return ONLY the refined text — no JSON, no markdown, no explanation.
  `.trim();

  const user = [
    `FIELD: ${context.fieldLabel}`,
    `SCRIPTURE: ${context.scripture}`,
    `DAY TITLE: ${context.dayTitle}`,
    context.centralTruth ? `CENTRAL TRUTH: ${context.centralTruth}` : "",
    "",
    `CURRENT CONTENT:`,
    content,
    "",
    `INSTRUCTION: ${instruction}`,
  ].filter(Boolean).join("\n");

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user",   content: user },
    ],
    max_completion_tokens: 600,
  });

  return (completion.choices[0]?.message?.content ?? "").trim();
}
