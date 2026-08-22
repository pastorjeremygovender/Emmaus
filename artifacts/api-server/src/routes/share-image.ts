/**
 * share-image.ts — AI share image generation endpoint
 *
 * Two-stage pipeline:
 *   Stage 1 (art-direction): GPT-4o reads the devotional text and produces a
 *            precise, specific image spec — visual scene, composition, typography
 *            hierarchy, accent colors, emphasis words. This is the step that
 *            makes ChatGPT's native image results so much better: it thinks
 *            before it draws.
 *   Stage 2 (rendering): gpt-image-1 receives the art-directed spec + the exact
 *            devotional text and renders the final image.
 *
 * POST /api/share-images/generate
 *   - First generation / Regenerate: art-direction → images.generate
 *   - Edit Image: images.edit with the previous image as a pixel-level reference
 *   - Returns raw PNG as base64 — attribution footer is composited client-side
 */

import { Router, type Request, type Response } from "express";
import OpenAI, { toFile } from "openai";
import { requireAdmin } from "../emmaus/auth.js";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const IMAGE_MODEL = "gpt-image-2";
const NEW_REASONING_MODEL = "gpt-5.6-sol";
const IMAGE_QUALITY = "high";
// 1024×1024 square (1:1).
const IMAGE_SIZE = "1024x1024";
const NEW_METHOD_PROMPT_VERSION = "share-image-ab-test-v3";

// ─── Stage 1: Art-direction pre-pass ─────────────────────────────────────────

/**
 * Call GPT-4o to produce a detailed, specific image spec from the devotional
 * text. Returns a rich descriptive paragraph ready to pass to gpt-image-1.
 *
 * This is the critical step that was missing. Without it, gpt-image-1 must
 * simultaneously choose a concept, design the typography, place the text, and
 * render — and it collapses under that load. With a dedicated art-direction
 * pass, the image model only has to execute a specific, well-reasoned brief.
 */
async function artDirectImage(text: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: process.env.ART_DIRECTION_MODEL ?? 'gpt-4o',
    max_completion_tokens: 1200,
    messages: [
      {
        role: 'system',
        content: `You are a creative director specialising in premium devotional share images — the kind that stop people mid-scroll on Instagram and WhatsApp. Think the best Christian Instagram accounts: warm, human, premium, emotional.

Your job: read the text and write a single vivid image generation brief. Coherent prose — NOT bullets, NOT JSON, NOT headings. Write it the way a great creative director briefs a photographer and typographer in one paragraph.

Cover all four areas, woven together:

──────────────────────────────────────────────────────────
1. VISUAL SCENE
Choose ONE specific photorealistic scene that emotionally matches the text's theme and mood. Let the text lead the visual — it could be a landscape, an object, a body of water, architecture, a close-up texture, a moment in nature, or a figure. Be precise and specific: name the exact subject, angle, lighting, time of day, texture. Not "peaceful nature" — say "a lone wooden rowing boat resting on still mist-covered water at dawn, soft warm light breaking through low fog, reflections just visible on the glassy surface." Pick what genuinely suits this specific text — never default to the same concept twice.

──────────────────────────────────────────────────────────
2. COMPOSITION
Tell the image model exactly where the text sits and where the visual sits — and ensure the text zone has a naturally clear background (pale sky, mist, out-of-focus depth) for clean contrast. Use layouts like:
- "The figure occupies the right third, walking away from camera; the left two-thirds is a gently blurred golden sky where the text sits in dark navy."
- "Text centered in the upper 60% over a softly lit cream-toned wall; the human subject is in the lower-center, slightly out of focus."
- "Full-bleed atmospheric dusk scene with a central figure; a dark translucent oval vignette centers the text at eye level."

──────────────────────────────────────────────────────────
3. TYPOGRAPHY — this is the most important part
Specify all of these:
a) Hero text treatment — the first sentence or key phrase rendered large, dominant, in a premium bold serif (think New York, Canela, or Freight Display). Dark navy, deep charcoal, or rich off-white depending on the scene.
b) Emotional emphasis — 1–3 specific words from the text that deserve a warm accent: terracotta, amber, warm gold, or burnt sienna. Either italic or slightly larger, or both.
c) Closing / supporting text — if there is a second sentence or paragraph, render it in a lighter italic or script style at roughly half the hero size, same accent color, with a subtle flourish or thin rule separating it from the hero text.
d) Typography must feel designed — not uniformly bold, not all the same size. Hierarchy is what separates premium from generic.

──────────────────────────────────────────────────────────
4. COLOUR PALETTE
Choose a colour palette that naturally matches the devotional text, mood, subject, and lighting. Use warm amber, terracotta, cream, and wheat only when they genuinely support the message. For other themes, use appropriate cool, neutral, fresh, dramatic, or subdued palettes. Avoid defaulting to sunsets or earth tones. Name 3–4 specific colours: the scene's dominant tone, the main text colour, and the typographic accent colour.

──────────────────────────────────────────────────────────
ABSOLUTE CONSTRAINTS:
- No logo, watermark, "Emmaus", church name, or attribution — these are added separately
- Never use the words "Christian" or "devotional" in the brief itself
- Leave the bottom 20% of the image completely clear — no text or key visuals there (a footer is composited programmatically and must not be obscured)
- Text must be legible — high contrast, never translucent, never decorative to the point of being unreadable`,
      },
      {
        role: 'user',
        content: `Write the image generation brief for this text:\n\n"${text}"`,
      },
    ],
  });

  const brief = response.choices[0]?.message?.content?.trim() ?? '';
  if (!brief) throw new Error('Art direction pass returned empty brief');
  return brief;
}

// ─── Stage 2: Build the final image prompt from art direction + text ──────────

function buildImagePrompt(text: string, artDirection: string): string {
  // Split into the first sentence (hero) and remainder (supporting), if there are multiple sentences.
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  const heroText = sentences.length > 1 ? sentences[0]?.trim() ?? text.trim() : text.trim();
  const supportingText = sentences.length > 1 ? sentences.slice(1).join(' ').trim() : '';

  const textInstruction = supportingText
    ? `TYPOGRAPHIC HIERARCHY (mandatory):
- HERO TEXT — render this in a large, bold premium serif font (the dominant visual element): "${heroText}"
- SUPPORTING TEXT — render this directly below at roughly 55% of the hero size, same color family but lighter weight: "${supportingText}"
- Every word from both blocks must be legible — no omissions, no paraphrasing`
    : `TEXT (render in full, legibly): "${heroText}"`;

  return `A premium devotional share image, square format (1:1 aspect ratio).

${textInstruction}

FOLLOW THIS ART DIRECTION PRECISELY:
${artDirection}

NON-NEGOTIABLE RULES:
- All text must be completely legible — high contrast, never faded, never translucent
- Hero text must be the typographically dominant element on the canvas
- Square canvas (1:1 aspect ratio)
- The bottom 20% of the canvas must be completely clear — no text, no key visual elements there (a footer is composited programmatically and must not be obscured)
- No logos, watermarks, app names, church names, or branding of any kind
- No generic stock-photo clichés, no overlapping religious symbols (rays + cross + dove), no soft-focus blur with no subject`;
}

type NewMethodReasoning = {
  emotionalCentre: string;
  visualMetaphor: string;
  composition: string;
  heroText: string;
  mood: string;
  avoid: string[];
};

function parseNewMethodReasoning(raw: string): NewMethodReasoning {
  const parsed = JSON.parse(raw) as Partial<NewMethodReasoning>;
  if (
    typeof parsed.emotionalCentre !== "string" ||
    typeof parsed.visualMetaphor !== "string" ||
    typeof parsed.composition !== "string" ||
    typeof parsed.heroText !== "string" ||
    typeof parsed.mood !== "string" ||
    !Array.isArray(parsed.avoid) ||
    !parsed.avoid.every(item => typeof item === "string")
  ) {
    throw new Error("New Method reasoning returned invalid structured data");
  }
  return parsed as NewMethodReasoning;
}

async function reasonAboutNewMethod(text: string): Promise<NewMethodReasoning> {
  const response = await openai.chat.completions.create({
    model: NEW_REASONING_MODEL,
    max_completion_tokens: 1200,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: `You are an exceptional visual art director for premium Christian devotional share images.
Interpret each devotional independently. Return JSON only with exactly these keys:
{
  "emotionalCentre": "the deepest spiritual idea",
  "visualMetaphor": "one specific scene or metaphor that adds meaning",
  "composition": "the relationship between image, negative space, typography, focal point, light and balance",
  "heroText": "the exact phrase from the quote that deserves the most emphasis",
  "mood": "the emotional atmosphere",
  "avoid": ["specific clichés or generic choices to avoid for this quote"]
}

Do not write an image-generation prompt. Do not rewrite the quote. Do not automatically choose sunsets, crosses, paths, lanterns, mountains, open Bibles, praying hands, horizons, golden-hour landscapes, plants, seedlings, leaves, vines, or other growth imagery. Botanical or growth imagery is allowed only when the quote specifically and meaningfully calls for it; it must never be the default symbol for hope, renewal, faith, or change. Choose one meaningful visual language for this quote and explain the typography hierarchy without prescribing a rigid template. Deliberately vary the subject category between images: consider an object, architecture, a room or doorway, a body of water, a human moment, light and shadow, weather, landscape, or abstract material texture—not just living plants. Deliberately vary the tonal range between images: consider bright high-key daylight, airy pale backgrounds, fresh natural colour, soft pastel, clean neutral, and luminous sunlit treatments as seriously as subdued or dramatic ones. Do not default to dark, low-key, blue-black, stormy, or night lighting unless the quote clearly requires it.`,
      },
      {
        role: "user",
        content: `Interpret this exact devotional quote:\n\n"""\n${text}\n"""`,
      },
    ],
  });
  const raw = response.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error("New Method reasoning returned an empty response");
  return parseNewMethodReasoning(raw);
}

function buildNewMethodPrompt(text: string, reasoning: NewMethodReasoning): string {
  return `Create a premium editorial Christian devotional share image in a square 1:1 format. Visualise this concept: ${reasoning.visualMetaphor}; the emotional atmosphere is ${reasoning.mood}, with ${reasoning.composition}. Give intelligent typographic emphasis to the exact phrase "${reasoning.heroText}" while preserving every word of the complete quote exactly as supplied, using meaningful hierarchy, contrast and negative space rather than a fixed template. Use a distinctive, contemporary editorial type treatment chosen to suit this specific message — do not default to Times New Roman, generic book serif typography, or a repetitive traditional devotional look. Choose lighting and colour with range rather than habit: bright high-key daylight, airy pale backgrounds, fresh natural colour, soft pastel, clean neutral, or luminous sunlit treatments are welcome when they suit the message; do not default to dark, low-key, blue-black, stormy, or night imagery unless the quote clearly calls for it. Do not turn the concept into a generic plant, seedling, leaf, vine, garden, or “something growing” image unless the quote explicitly depends on that idea. Prefer a non-botanical subject when the text does not clearly require growth imagery. Render this exact devotional text verbatim: """${text}""". Use sophisticated editorial visual storytelling. Keep the bottom 20% visually quiet and free of text or important subject matter for the Emmaus footer, but continue the same scene, texture, lighting and colour treatment naturally through the entire canvas. Do not create a footer panel, blank strip, horizontal divider, border, hard edge, separate lower section, or solid colour block. Generate no logos, watermarks, church names, signatures or attribution. Avoid: ${reasoning.avoid.join("; ")}.`;
}

// ─── Edit prompt — no art-direction pass, preserve existing composition ───────

function buildEditPrompt(text: string, instruction: string): string {
  return `You are refining a Christian devotional share image.

The devotional text displayed in the image is:
"""
${text}
"""
Keep this text exactly as-is.

The administrator wants this specific change:
"""
${instruction}
"""

IMPORTANT:
- Preserve the original devotional text verbatim — same wording, same emphasis
- Apply the requested change while keeping the warm, clean, premium devotional aesthetic
- Retain as much of the existing composition as is consistent with the change requested
- If the change conflicts with showing the text clearly, text legibility always wins
- Maintain the square (1:1) canvas format — do not alter the aspect ratio
- Do NOT add any logos, watermarks, app names, church names, or branding of any kind`;
}

// ─── Auto-generate: phrase extraction + full pipeline ─────────────────────────
//
// Called by the content editors when new content is created without a share image.
// Steps:
//   1. GPT-4o reads the full step content and picks the best short shareable phrase
//   2. Art-direction pass turns that phrase into a detailed visual brief
//   3. gpt-image-1 renders the final image
// Returns { phrase, imageBase64 }

async function extractBestPhrase(content: string): Promise<string> {
  const response = await openai.chat.completions.create({
    model: process.env.ART_DIRECTION_MODEL ?? 'gpt-4o',
    max_completion_tokens: 80,
    messages: [
      {
        role: 'system',
        content: `You are a skilled devotional content curator. Your only job is to extract the single most powerful, emotionally resonant, shareable phrase or sentence from the devotional content provided.

Rules:
- Pick ONE phrase that would stop someone scrolling on Instagram or WhatsApp
- Prefer scripture quotes, key turning-point sentences, or the heart of the teaching
- Maximum 18 words — shorter is better (6–14 words is ideal)
- Output ONLY the phrase itself — no quotes, no explanation, no punctuation changes beyond what's in the original
- Never invent words that aren't in the content`,
      },
      {
        role: 'user',
        content: `Extract the single best shareable phrase from this devotional content:\n\n${content.slice(0, 3000)}`,
      },
    ],
  });

  const phrase = response.choices[0]?.message?.content?.trim() ?? '';
  if (!phrase) throw new Error('Phrase extraction returned empty result');
  return phrase;
}

router.post("/share-images/auto-generate", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;

  const { content, phrase: customPhrase } = req.body as { content?: string; phrase?: string };
  if (!customPhrase && (!content?.trim() || content.trim().length < 20)) {
    return res.status(400).json({ error: "Content is required (at least 20 characters)" });
  }

  try {
    // Step 1: Use the admin's custom phrase if provided; otherwise extract from content.
    const phrase = customPhrase?.trim()
      ? customPhrase.trim()
      : await extractBestPhrase(content!.trim());
    req.log.info({ userId }, "Share image phrase extracted");

    // Step 2 + 3: Art-direction + image generation (same pipeline as manual)
    const artDirection = await artDirectImage(phrase);
    req.log.debug({ userId }, "Share image art direction created");

    const finalPrompt = buildImagePrompt(phrase, artDirection);
    const genRes = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt: finalPrompt,
      size: IMAGE_SIZE as Parameters<typeof openai.images.generate>[0]["size"],
      n: 1,
    });

    const imageBase64 = genRes.data?.[0]?.b64_json;
    if (!imageBase64) throw new Error("No image returned from generation");

    return res.json({ phrase, imageBase64 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Auto-generation failed";
    req.log.error({ userId, error: message }, "Share image auto-generation failed");
    return res.status(500).json({ error: message });
  }
});

// ─── Temporary A/B-test method ────────────────────────────────────────────────
// This route intentionally bypasses the existing GPT-4o art-direction pass.
router.post("/share-images/generate-new-method", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;

  const { text } = req.body as { text?: string };
  if (!text?.trim()) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    const reasoning = await reasonAboutNewMethod(text.trim());
    const prompt = buildNewMethodPrompt(text.trim(), reasoning);
    const genRes = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      quality: IMAGE_QUALITY,
      size: IMAGE_SIZE as Parameters<typeof openai.images.generate>[0]["size"],
      n: 1,
    });
    const imageBase64 = genRes.data?.[0]?.b64_json;
    if (!imageBase64) throw new Error("No image returned from New Method generation");

    req.log.info({
      userId,
      method: NEW_METHOD_PROMPT_VERSION,
      reasoningModel: NEW_REASONING_MODEL,
      model: IMAGE_MODEL,
      size: IMAGE_SIZE,
      quality: IMAGE_QUALITY,
    }, "Share image New Method generated");

    return res.json({
      imageBase64,
      experiment: {
        method: NEW_METHOD_PROMPT_VERSION,
        reasoningModel: NEW_REASONING_MODEL,
        model: IMAGE_MODEL,
        size: IMAGE_SIZE,
        quality: IMAGE_QUALITY,
        reasoning,
        prompt,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "New Method image generation failed";
    req.log.error({ userId, error: message }, "Share image New Method failed");
    return res.status(500).json({ error: message });
  }
});

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/share-images/generate", async (req: Request, res: Response) => {
  const userId = requireAdmin(req, res);
  if (!userId) return;

  const { text, editInstruction, referenceImageBase64 } = req.body as {
    text?: string;
    editInstruction?: string;
    referenceImageBase64?: string;
  };

  if (!text?.trim()) {
    return res.status(400).json({ error: "Text is required" });
  }

  try {
    let imageBase64: string;
    const isEdit = !!(editInstruction?.trim() && referenceImageBase64);

    if (isEdit) {
      // ── Conversational edit via images.edit ───────────────────────────────
      // The previous image is sent as a pixel-level reference so gpt-image-1
      // can preserve the existing composition and only apply the change.
      try {
        const buffer = Buffer.from(referenceImageBase64!, "base64");
        const imageFile = await toFile(buffer, "reference.png", { type: "image/png" });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const editRes = await (openai.images as any).edit({
          model: IMAGE_MODEL,
          image: imageFile,
          prompt: buildEditPrompt(text.trim(), editInstruction!.trim()),
          size: IMAGE_SIZE,
          n: 1,
        }) as { data: Array<{ b64_json?: string; url?: string }> };

        const b64 = editRes.data[0]?.b64_json;
        if (!b64) throw new Error("No b64_json in edit response");
        imageBase64 = b64;
      } catch {
        // Graceful fallback: art-direct + regenerate with edit instruction folded in
        const artDirection = await artDirectImage(text.trim());
        const basePrompt = buildImagePrompt(text.trim(), artDirection);
        const augmented = `${basePrompt}\n\nAdditional change requested: ${editInstruction!.trim()}`;
        const genRes = await openai.images.generate({
          model: IMAGE_MODEL,
          prompt: augmented,
          size: IMAGE_SIZE as Parameters<typeof openai.images.generate>[0]["size"],
          n: 1,
        });
        const b64 = genRes.data?.[0]?.b64_json;
        if (!b64) throw new Error("No b64_json in fallback generation response");
        imageBase64 = b64;
      }
    } else {
      // ── Two-stage: art-direction → image generation ───────────────────────
      // Stage 1: GPT-4o reads the text and produces a precise, specific brief.
      // Stage 2: gpt-image-1 executes the brief alongside the exact text.
      const artDirection = await artDirectImage(text.trim());
      console.log('[share-image] art direction brief:', artDirection.slice(0, 400));

      const finalPrompt = buildImagePrompt(text.trim(), artDirection);

      const genRes = await openai.images.generate({
        model: IMAGE_MODEL,
        prompt: finalPrompt,
        size: IMAGE_SIZE as Parameters<typeof openai.images.generate>[0]["size"],
        n: 1,
      });
      const b64 = genRes.data?.[0]?.b64_json;
      if (!b64) throw new Error("No b64_json in generation response");
      imageBase64 = b64;
    }

    return res.json({ imageBase64 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Image generation failed";
    console.error("[share-image] generation error:", message);
    return res.status(500).json({ error: message });
  }
});

export default router;
