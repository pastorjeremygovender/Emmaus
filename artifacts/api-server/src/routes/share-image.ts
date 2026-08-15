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
// 1024×1536 is portrait (2:3). gpt-image-1 supports this natively.
const IMAGE_SIZE = "1024x1536";

// ─── Prompt construction ──────────────────────────────────────────────────────

function buildGenerationPrompt(text: string): string {
  return `Create a beautiful Christian devotional share image.

DISPLAY THIS TEXT EXACTLY in the image — do not change, shorten, paraphrase or omit any word:
"""
${text}
"""

VISUAL STYLE:
- Warm, modern, emotionally resonant
- Soft colour palette: gentle golds, warm creams, subtle blues, or earthy tones
- Clean typography with strong visual hierarchy — the devotional text is the clear focal point
- Uncluttered composition — the text must breathe and be fully legible
- Premium, contemporary aesthetic — NOT generic church clip-art or stock imagery
- Subtle, beautiful background: soft light, gentle nature, or warm abstract art
- The text should be large, readable, and beautifully set
- Portrait orientation (taller than wide)
- Suitable for sharing on WhatsApp, Instagram, and Facebook
- Christian in spirit — warm and intimate, not ornate or clichéd
- Do NOT add any logos, watermarks, app names, church names, or branding of any kind

CRITICAL: Preserve the exact wording above verbatim. Typography should be beautiful and unhurried. Leave the bottom 8% of the image clear — do not place text or key elements there.`;
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
