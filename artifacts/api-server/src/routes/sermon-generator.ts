/**
 * sermon-generator.ts — Routes for URL-first sermon draft generation.
 *
 * POST /api/sermon-generator/generate
 *   Body: { youtubeUrl, userId, userRole }
 *   Returns: { sermon, companion }
 *
 * POST /api/sermon-generator/:sermonId/regenerate-field
 *   Body: { field, context: { currentTitle, currentSummary, scriptureReference, transcript, description }, userId, userRole }
 *   Returns: { value }  — proposed new value for admin to approve before applying
 */

import { Router, type Request, type Response } from "express";
import { generateFromUrl, regenerateSermonField } from "../lib/sermon-generator.js";
import { requireAuth } from "../emmaus/auth.js";
import { isAdmin } from "../lib/user-role-store.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Auth helper ──────────────────────────────────────────────────────────────
// Identity from signed session cookie / X-User-Id header via requireAuth.
// Role validated against the server-side user-role-store — never from request
// headers or body (which are caller-controlled and cannot be trusted).

async function guardAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

// ─── POST /api/sermon-generator/generate ─────────────────────────────────────

router.post("/sermon-generator/generate", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;

  const { youtubeUrl } = req.body as { youtubeUrl?: string };
  if (!youtubeUrl?.trim()) {
    res.status(400).json({ error: "youtubeUrl is required" });
    return;
  }

  logger.info({ youtubeUrl }, "sermon-generator: starting generation");

  try {
    const result = await generateFromUrl(youtubeUrl.trim());
    logger.info({ sermonId: result.sermon.id, companionId: result.companion.id }, "sermon-generator: generation complete");
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    // Never expose stack traces or API keys
    const safe = message.replace(/sk-[a-zA-Z0-9]+/g, "[redacted]");
    logger.error({ err }, "sermon-generator: generation failed");
    res.status(500).json({ error: safe });
  }
});

// ─── POST /api/sermon-generator/:sermonId/regenerate-field ───────────────────

router.post("/sermon-generator/:sermonId/regenerate-field", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;

  const { field, context } = req.body as {
    field?: string;
    context?: {
      currentTitle?: string;
      currentSummary?: string;
      scriptureReference?: string;
      transcript?: string;
      description?: string;
    };
  };

  const allowedFields = ['title', 'speaker', 'scriptureReference', 'summary', 'topics', 'keywords'] as const;
  type AllowedField = typeof allowedFields[number];

  if (!field || !allowedFields.includes(field as AllowedField)) {
    res.status(400).json({ error: `field must be one of: ${allowedFields.join(', ')}` });
    return;
  }

  if (!context) {
    res.status(400).json({ error: "context is required" });
    return;
  }

  try {
    const value = await regenerateSermonField(field as AllowedField, {
      currentTitle: context.currentTitle ?? "",
      currentSummary: context.currentSummary ?? "",
      scriptureReference: context.scriptureReference ?? "",
      transcript: context.transcript ?? "",
      description: context.description ?? "",
    });

    res.json({ value });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regeneration failed";
    logger.error({ err, field }, "sermon-generator: field regen failed");
    res.status(500).json({ error: message.replace(/sk-[a-zA-Z0-9]+/g, "[redacted]") });
  }
});

export default router;
