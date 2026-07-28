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
import { generateFromUrl, regenerateSermonField, GenerationError } from "../lib/sermon-generator.js";
import { requireAuth } from "../emmaus/auth.js";
import { isAdmin } from "../lib/user-role-store.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function guardAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ success: false, code: "FORBIDDEN", error: "You don't have permission to generate sermon drafts." });
    return null;
  }
  return userId;
}

// ─── Error code → HTTP status ─────────────────────────────────────────────────

function httpStatusForCode(code: string): number {
  switch (code) {
    case "INVALID_YOUTUBE_URL": return 400;
    case "TRANSCRIPT_REQUIRED":  return 200;  // structured "needs input", not a server error
    case "AI_NOT_CONFIGURED":    return 503;
    case "VIDEO_UNAVAILABLE":    return 422;
    case "GENERATION_TIMEOUT":   return 504;
    default:                     return 500;
  }
}

// ─── POST /api/sermon-generator/generate ─────────────────────────────────────
//
// Body: { youtubeUrl, transcript?, videoId?, companionDays? }
//   - transcript + videoId: pastor-pasted fallback (skips OAuth retrieval)

router.post("/sermon-generator/generate", async (req: Request, res: Response) => {
  const userId = await guardAdmin(req, res);
  if (!userId) return;

  const { youtubeUrl, transcript: providedTranscript } = req.body as {
    youtubeUrl?: string;
    transcript?: string;
  };

  if (!youtubeUrl?.trim()) {
    res.status(400).json({ success: false, code: "INVALID_YOUTUBE_URL", error: "youtubeUrl is required" });
    return;
  }

  logger.info({ youtubeUrl, userId, hasProvidedTranscript: !!providedTranscript }, "sermon-generator: starting generation");

  try {
    const result = await generateFromUrl(youtubeUrl.trim(), { providedTranscript });
    logger.info({
      sermonId: result.sermon.id,
      companionId: result.companion.id,
      userId,
    }, "sermon-generator: generation complete");

    res.json({
      success: true,
      sermon: result.sermon,
      companion: {
        ...result.companion,
        status: "draft",
        entryCount: result.companion.entries?.length ?? 0,
      },
      source: {
        videoId: result.sermon.youtubeUrl,
        transcriptStatus: result.sermon.transcriptStatus,
      },
      // Keep full result for frontend backward compat
      _full: result,
    });
  } catch (err) {
    if (err instanceof GenerationError) {
      const status = httpStatusForCode(err.code);
      logger.info({ code: err.code, message: err.message }, "sermon-generator: structured generation result");
      res.status(status).json({
        success: false,
        code: err.code,
        message: err.message,
        source: err.source ?? null,
      });
      return;
    }
    // Unexpected errors — never expose internals
    const safe = (err instanceof Error ? err.message : "An unexpected error occurred")
      .replace(/sk-[a-zA-Z0-9]+/g, "[redacted]");
    logger.error({ err }, "sermon-generator: unexpected generation error");
    res.status(500).json({ success: false, code: "GENERATION_FAILED", error: safe });
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
