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
import {
  generateFromUrl, regenerateSermonField, redetectSermon, GenerationError,
  generateMainTheme, suggestAlternativeTheme, hasPrescription, buildSermonLink,
} from "../lib/sermon-generator.js";
import { getAdminSermonById, upsertAdminSermon, getAllAdminSermons } from "../lib/admin-sermon-store.js";
import { getCompanionBySermonId } from "../lib/sermon-companion-store.js";
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
    case "INVALID_YOUTUBE_URL":          return 400;
    case "TRANSCRIPT_REQUIRED":          return 200;  // structured "needs input"
    case "SERMON_CONFIRMATION_REQUIRED": return 200;  // structured "needs confirmation"
    case "THEME_CONFIRMATION_REQUIRED":  return 200;  // structured "needs confirmation"
    case "AI_NOT_CONFIGURED":            return 503;
    case "VIDEO_UNAVAILABLE":            return 422;
    case "GENERATION_TIMEOUT":           return 504;
    default:                             return 500;
  }
}

// ─── POST /api/sermon-generator/generate ─────────────────────────────────────
//
// Body: { youtubeUrl, transcript?, sermonStartSec?, sermonEndSec?, sermonStartWord?, sermonEndWord? }
//   - transcript: pastor-pasted fallback (skips OAuth retrieval)
//   - sermon*: pastor-confirmed boundaries (skips detection or applies adjusted result)

router.post("/sermon-generator/generate", async (req: Request, res: Response) => {
  const userId = await guardAdmin(req, res);
  if (!userId) return;

  const {
    youtubeUrl,
    transcript: providedTranscript,
    sermonStartSec,
    sermonEndSec,
    sermonStartWord,
    sermonEndWord,
    confirmedTheme,
  } = req.body as {
    youtubeUrl?: string;
    transcript?: string;
    sermonStartSec?: number;
    sermonEndSec?: number;
    sermonStartWord?: number;
    sermonEndWord?: number;
    confirmedTheme?: string;
  };

  if (!youtubeUrl?.trim()) {
    res.status(400).json({ success: false, code: "INVALID_YOUTUBE_URL", error: "youtubeUrl is required" });
    return;
  }

  logger.info({
    youtubeUrl, userId,
    hasProvidedTranscript: !!providedTranscript,
    hasBoundaries: sermonStartWord !== undefined,
    hasConfirmedTheme: !!confirmedTheme,
  }, "sermon-generator: starting generation");

  try {
    const result = await generateFromUrl(youtubeUrl.trim(), {
      providedTranscript,
      sermonStartSec:  typeof sermonStartSec  === "number" ? sermonStartSec  : undefined,
      sermonEndSec:    typeof sermonEndSec    === "number" ? sermonEndSec    : undefined,
      sermonStartWord: typeof sermonStartWord === "number" ? sermonStartWord : undefined,
      sermonEndWord:   typeof sermonEndWord   === "number" ? sermonEndWord   : undefined,
      confirmedTheme:  typeof confirmedTheme  === "string" ? confirmedTheme  : undefined,
    });

    logger.info({ sermonId: result.sermon.id, companionId: result.companion.id, userId },
      "sermon-generator: generation complete");

    res.json({
      success: true,
      sermon: result.sermon,
      companion: { ...result.companion, status: "draft", entryCount: result.companion.entries?.length ?? 0 },
      source: { videoId: result.sermon.youtubeUrl, transcriptStatus: result.sermon.transcriptStatus },
      _full: result,
    });
  } catch (err) {
    if (err instanceof GenerationError) {
      const status = httpStatusForCode(err.code);
      logger.info({ code: err.code, message: err.message }, "sermon-generator: structured generation result");
      res.status(status).json({ success: false, code: err.code, message: err.message, source: err.source ?? null });
      return;
    }
    const safe = (err instanceof Error ? err.message : "An unexpected error occurred")
      .replace(/sk-[a-zA-Z0-9]+/g, "[redacted]");
    logger.error({ err }, "sermon-generator: unexpected generation error");
    res.status(500).json({ success: false, code: "GENERATION_FAILED", error: safe });
  }
});

// ─── POST /api/sermon-generator/:sermonId/redetect ────────────────────────────
//
// Re-runs sermon boundary detection on the stored full transcript and updates
// the sermon record in place. Used by the "Re-detect Sermon" button in the editor.

router.post("/sermon-generator/:sermonId/redetect", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const sermonId = String(req.params.sermonId);

  const existing = await getAdminSermonById(sermonId);
  if (!existing) {
    res.status(404).json({ error: "Sermon not found" });
    return;
  }
  if (!existing.transcript) {
    res.status(422).json({ error: "This sermon has no stored transcript to analyse." });
    return;
  }

  try {
    const detection = await redetectSermon(existing.transcript);
    await upsertAdminSermon({ ...existing, ...detection });
    logger.info({ sermonId, confidence: detection.detectionConfidence }, "sermon-generator: re-detection complete");
    res.json({ success: true, detection });
  } catch (err) {
    logger.error({ err, sermonId }, "sermon-generator: re-detection failed");
    res.status(500).json({ error: "Re-detection failed. Please try again." });
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

// ─── POST /api/sermon-generator/suggest-theme ────────────────────────────────
//
// Generate an alternative one-sentence theme during the pastoral confirmation
// step — no sermon ID exists yet so we accept the snippet inline.
// Body: { sermonSnippet, previousTheme }

router.post("/sermon-generator/suggest-theme", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;

  const { sermonSnippet, previousTheme } = req.body as {
    sermonSnippet?: string;
    previousTheme?: string;
  };

  if (!sermonSnippet?.trim()) {
    res.status(400).json({ error: "sermonSnippet is required" });
    return;
  }

  try {
    const theme = await suggestAlternativeTheme(sermonSnippet, previousTheme ?? "");
    res.json({ theme });
  } catch (err) {
    logger.error({ err }, "sermon-generator: suggest-theme failed");
    res.status(500).json({ error: "Theme suggestion failed. Please try again." });
  }
});

// ─── POST /api/sermon-generator/:sermonId/regenerate-theme ───────────────────
//
// Regenerate the main theme for an existing sermon (from the Sermon Editor).
// Uses the stored sermonTranscript so the client doesn't need to send content.

router.post("/sermon-generator/:sermonId/regenerate-theme", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const sermonId = String(req.params.sermonId);

  const existing = await getAdminSermonById(sermonId);
  if (!existing) {
    res.status(404).json({ error: "Sermon not found" });
    return;
  }

  const source = existing.sermonTranscript ?? existing.transcript;
  if (!source) {
    res.status(422).json({ error: "This sermon has no stored transcript to analyse." });
    return;
  }

  try {
    const theme = await generateMainTheme(source);
    logger.info({ sermonId, theme }, "sermon-generator: theme regenerated");
    res.json({ theme });
  } catch (err) {
    logger.error({ err, sermonId }, "sermon-generator: regenerate-theme failed");
    res.status(500).json({ error: "Theme regeneration failed. Please try again." });
  }
});

// ─── GET /api/sermon-generator/audit ──────────────────────────────────────────
//
// Returns a grounding audit report for all sermon companions.
// Flags entries that contain prescription patterns or were generated
// before the grounding rules were introduced (sermon_link is empty).
//
// Response: { flags: Array<{ sermonId, companionTitle, dayNumber, title, field, text, reason }> }

router.get("/sermon-generator/audit", async (req: Request, res: Response) => {
  const userId = await guardAdmin(req, res);
  if (!userId) return;

  try {
    const sermons = await getAllAdminSermons();
    const flags: Array<{
      sermonId: string;
      companionTitle: string;
      companionId: string;
      dayNumber: number;
      dayTitle: string;
      field: string;
      text: string;
      reason: string;
    }> = [];

    for (const sermon of sermons) {
      if (!sermon.companionJourneyId) continue;
      const companion = await getCompanionBySermonId(sermon.id);
      if (!companion) continue;

      for (const entry of companion.entries ?? []) {
        const fields: Array<{ key: string; value: string }> = [
          { key: 'nextStep',  value: entry.nextStep  },
          { key: 'reflection', value: entry.reflection },
          { key: 'prayer',    value: entry.prayer    },
        ];

        for (const { key, value } of fields) {
          if (value && hasPrescription(value)) {
            flags.push({
              sermonId: sermon.id,
              companionTitle: companion.title,
              companionId: companion.id,
              dayNumber: entry.dayNumber,
              dayTitle: entry.title,
              field: key,
              text: value.slice(0, 200),
              reason: 'prescription_pattern',
            });
          }
        }

        // Flag entries generated before grounding rules (no sermon link)
        if (!entry.sermonLink) {
          flags.push({
            sermonId: sermon.id,
            companionTitle: companion.title,
            companionId: companion.id,
            dayNumber: entry.dayNumber,
            dayTitle: entry.title,
            field: 'sermonLink',
            text: '',
            reason: 'pre_grounding_rules_no_sermon_link',
          });
        }
      }
    }

    logger.info({ flagCount: flags.length }, "sermon-generator: audit completed");
    res.json({ flags, sermonCount: sermons.length });
  } catch (err) {
    logger.error({ err }, "sermon-generator: audit failed");
    res.status(500).json({ error: "Audit failed. Please try again." });
  }
});

export default router;
