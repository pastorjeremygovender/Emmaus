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

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const IMAGE_MODEL = "gpt-image-1";
// 1024×1024 square (1:1). gpt-image-1 supports this natively.
const IMAGE_SIZE = "1024x1024";

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
        content: `You are a creative director specialising in premium Christian devotional share images — the kind that stop people scrolling on Instagram and WhatsApp.

Your job: read the devotional text and write a single, detailed, vivid image generation brief. This will be passed directly to an AI image model, so it must be a coherent narrative description — NOT a bulleted list, NOT JSON, NOT headings. Write it the way a creative director briefs a photographer and typographer in one paragraph.

Cover all four areas, woven together:

──────────────────────────────────────────────────────────
1. VISUAL SCENE
Choose ONE specific photorealistic scene that emotionally matches the text's theme and mood. Be precise: name the subject, angle, lighting, time of day, location, texture. Not "peaceful nature" — say "a low-angle close-up of worn leather hiking boots mid-stride on a dusty stone path, warm late-afternoon golden-hour light, rocky hills softly out of focus in the background." Choose from real-world photographic subjects: close-up objects, architectural interiors, natural landscapes, human hands or silhouettes, water reflections, pathways, everyday moments, or Scripture-era objects (oil lamp, clay vessel, parchment). Pick what genuinely matches the text — do not default to the same concept every call.

──────────────────────────────────────────────────────────
2. COMPOSITION
Tell the image model exactly where the text block sits and where the visual element sits — and critically, ensure the text zone has a clear, light (or dark) background area so the text contrasts cleanly. Examples:
- "Text occupies the left 55% of the image in an airy, naturally light zone. The visual element fills the right half and bleeds into the background."
- "Text is centered in the upper two-thirds over a deliberately pale sky or out-of-focus background. The foreground visual element anchors the bottom third."
- "A full-bleed dark atmospheric scene with text set in bright cream or white, centered, with a subtle dark vignette behind the text zone."

──────────────────────────────────────────────────────────
3. TYPOGRAPHY — this is the most important part
Specify all of these:
a) Main body text style — e.g., "dark navy bold serif, large and clean"
b) Which 1–3 specific words or short phrases from the text deserve typographic emphasis (the most emotionally charged words — "question", "first step", "leading you")
c) How those words are rendered — larger size, warm accent color (terracotta, amber, gold, or rich brown), italic weight, or decorative script
d) If there is a closing phrase or final sentence, render it in flowing italic or script style in the accent color with a subtle decorative underline or flourish
e) If the text has two distinct paragraphs, add a thin decorative horizontal line or small ornament as a separator

──────────────────────────────────────────────────────────
4. COLOUR PALETTE
Name 3–4 specific colors: the main text color, the typographic accent color, and 1–2 dominant scene colors. Make them work together harmoniously.

──────────────────────────────────────────────────────────
ABSOLUTE CONSTRAINTS:
- No logo, watermark, "Emmaus", church name, or attribution — these are added separately
- Never use the words "Christian" or "devotional" in the brief itself
- Leave the bottom 12% of the image completely clear — no text or key visuals there (a footer is added programmatically)
- The text must be rendered in full and legibly — never decorative to the point of being unreadable`,
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
  return `A premium devotional share image, square format (1:1 aspect ratio).

DISPLAY THIS TEXT EXACTLY — every word verbatim, no changes, no omissions, no paraphrasing, no shortening:
"""
${text}
"""

FOLLOW THIS ART DIRECTION PRECISELY:
${artDirection}

NON-NEGOTIABLE RULES:
- The text block above must appear in full, exactly as written, and be completely legible — high contrast, never faded, never translucent, never washed out
- Square canvas (1:1 aspect ratio)
- The bottom 12% of the canvas must be completely clear — no text, no key visual elements there
- No logos, watermarks, app names, church names, or branding of any kind
- No generic stock-photo clichés, no overlapping religious symbols (rays + cross + dove), no soft-focus blur with no subject`;
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

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/share-images/generate", async (req: Request, res: Response) => {
  // Admin-only
  const userRole = req.headers["x-user-role"] as string | undefined;
  if (!userRole || !["admin", "superAdmin"].includes(userRole)) {
    return res.status(403).json({ error: "Admin access required" });
  }

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
        const b64 = genRes.data[0]?.b64_json;
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
      const b64 = genRes.data[0]?.b64_json;
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
