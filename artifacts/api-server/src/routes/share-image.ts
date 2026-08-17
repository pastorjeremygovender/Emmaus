/**
 * share-image.ts — AI share image generation endpoint
 *
 * POST /api/share-images/generate
 *   - First generation:  uses OpenAI images.generate (gpt-image-1)
 *   - Conversational edit: uses OpenAI images.edit with the previous image as reference
 *   - Returns raw PNG as base64 — attribution is composited client-side via Canvas
 *
 * The Emmaus design direction and full prompt construction happen here.
 * Admins supply only their devotional text and an optional edit instruction.
 */

import { Router, type Request, type Response } from "express";
import OpenAI, { toFile } from "openai";

const router = Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const IMAGE_MODEL = "gpt-image-1";
// 1024×1024 square (1:1). gpt-image-1 supports this natively.
const IMAGE_SIZE = "1024x1024";

// ─── Prompt construction ──────────────────────────────────────────────────────

function buildGenerationPrompt(text: string): string {
  return `Create a beautiful Christian devotional share image.

DISPLAY THIS TEXT EXACTLY in the image — do not change, shorten, paraphrase or omit any word:
"""
${text}
"""

VISUAL IDENTITY:
Emmaus visual language: warm, calm, modern, uncluttered, premium, reflective, and highly readable.
Colour palette: gentle golds, warm creams, deep muted blues, soft greys, earthy terracottas, or cool stone whites — chosen to suit the specific visual concept below.
Typography: large, beautiful, unhurried. The text is always the clear focal point with strong contrast.
Aesthetic: premium contemporary — NOT generic church clip-art, stock sunsets, or clichéd stained glass.
Do NOT add logos, watermarks, app names, church names, or branding of any kind.

CHOOSE ONE VISUAL CONCEPT — read the devotional text above and pick whichever of the following fits it most naturally and honestly. Do not default to the same type every time:

A. Natural landscape — a wide field, mountain range, forest, desert plain, or open sky. Must feel specific and painterly, not a generic blur.
B. Close-up symbolic object — a single candle, an open book, worn hands holding something, a seed, bread, water in a cup. Shot with intimate macro depth.
C. Architecture — the interior of a stone chapel, a doorway of light, old wooden beams, a quiet courtyard, ancient steps. Atmosphere over grandeur.
D. Road or pathway — a narrow dirt path through a field, a stone stairway, a corridor of trees. Something that evokes journey or direction.
E. Water — still lake reflection, a single raindrop on glass, a stream over rocks, ocean at dawn. Serene and meditative.
F. Hands — two hands clasped in prayer, a hand holding a worn Bible, hands open and receiving, aged hands and young hands together. Human and intimate.
G. Silhouette — a single figure standing before vast sky or light, arms raised or head bowed. Minimalist and reverent.
H. Abstract light and texture — soft rays through a window, light through leaves onto stone, bokeh of warm gold on linen. Purely atmospheric.
I. Everyday human moment — someone reading quietly, a shared meal, a lone person on a bench, walking in the rain. Grounded and real.
J. Minimal graphic composition — a single geometric element (circle, line, cross) with negative space and a rich colour field. Graphic and modern.
K. Scripture-era imagery — an oil lamp, a clay vessel, rolled parchment, ancient stone, a vineyard, wheat sheaves. Evocative, not theatrical.

After choosing the concept, commit to it fully and specifically. Describe the scene in detail so it feels original, not generic.

FORBIDDEN DEFAULTS — do not produce:
- A blurred golden hill or rolling pastoral landscape with warm-beige sky
- A generic sunset or sunrise as the sole background element
- A soft bokeh blur with no discernible subject
- Any repeated warm-beige gradient background
- Overlapping clichéd religious symbols (rays + cross + dove)

COMPOSITION:
- Square format (1:1 aspect ratio)
- Text breathes — surround it with visual calm, never clutter
- Leave the bottom 10% of the canvas clear — an attribution footer will be added programmatically
- Suitable for WhatsApp, Instagram, and Facebook sharing

CRITICAL: Preserve the exact devotional wording verbatim. If regenerating text you have seen before, intentionally choose a substantially different visual concept from any previous generation.`;
}

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
      // ── Conversational edit via images.edit (gpt-image-1 retains composition) ──
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
      } catch (editErr) {
        // Graceful fallback: regenerate with the edit instruction folded into the prompt
        const augmented = `${buildGenerationPrompt(text.trim())}\n\nAdditional requirement from the content editor: ${editInstruction!.trim()}`;
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
      // ── Initial generation ─────────────────────────────────────────────────
      const genRes = await openai.images.generate({
        model: IMAGE_MODEL,
        prompt: buildGenerationPrompt(text.trim()),
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
