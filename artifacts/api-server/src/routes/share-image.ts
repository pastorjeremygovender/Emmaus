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
// 1024×1024 square (1:1). gpt-image-1 supports this natively.
const IMAGE_SIZE = "1024x1024";
const NEW_METHOD_PROMPT_VERSION = "share-image-ab-test-v1";

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

/**
 * Temporary A/B-test prompt. This deliberately bypasses artDirectImage() and
 * lets GPT Image 2 interpret the quote, scene, and typography as one design.
 */
function buildNewMethodPrompt(text: string): string {
  return `Create a premium square shareable image for the exact devotional quote below.

EXACT QUOTE — the wording must appear in the artwork exactly as supplied:
"""
${text}
"""

First understand the spiritual meaning and emotional centre of the quote. Then identify ONE strong visual metaphor or scene that communicates that meaning. Make the image and typography work together as one professionally art-directed composition.

Allow substantial creative freedom. Do not force a fixed layout, fixed text position, fixed hero phrase, fixed font hierarchy, landscape, cross, sunlight, mountains, paths, hands, people, or any recurring Christian visual cliché. Use those elements only when they genuinely communicate this specific quote.

Typography is part of the design: preserve the exact wording, but determine the emphasis, font scale, line breaks, placement, contrast, and hierarchy that best serve the quote. Prioritise excellent typography, strong visual hierarchy, emotional resonance, sophisticated composition, phone readability, premium editorial quality, meaningful imagery, generous negative space, and restraint.

Avoid a generic motivational poster, excessive decorative flourishes, clutter, random Christian symbols, repetitive backgrounds, stock-photo appearance, automatic crosses, and automatic golden-hour landscapes.

Choose a colour palette that naturally matches the text, mood, subject, and lighting. Do not default to sunsets or earth tones.

Use a square 1:1 canvas at 1024×1024. Keep the bottom 20% clear for a footer that will be added programmatically. Do not generate any logo, watermark, Emmaus branding, church name, or attribution. Do not omit, paraphrase, repeat, or invent any words from the exact quote.`;
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
    const prompt = buildNewMethodPrompt(text.trim());
    const genRes = await openai.images.generate({
      model: IMAGE_MODEL,
      prompt,
      size: IMAGE_SIZE as Parameters<typeof openai.images.generate>[0]["size"],
      n: 1,
    });
    const imageBase64 = genRes.data?.[0]?.b64_json;
    if (!imageBase64) throw new Error("No image returned from New Method generation");

    req.log.info({
      userId,
      method: NEW_METHOD_PROMPT_VERSION,
      model: IMAGE_MODEL,
      size: IMAGE_SIZE,
      quality: "not specified",
      reasoningStep: "No separate reasoning call; GPT Image 2 interprets the quote directly from the New Method prompt",
    }, "Share image New Method generated");

    return res.json({
      imageBase64,
      experiment: {
        method: NEW_METHOD_PROMPT_VERSION,
        model: IMAGE_MODEL,
        size: IMAGE_SIZE,
        quality: null,
        reasoningStep: "No separate reasoning call; GPT Image 2 interprets the quote directly from the New Method prompt",
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
