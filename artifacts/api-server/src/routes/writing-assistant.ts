/**
 * Writing Assistant Routes
 *
 * These endpoints are for authorised pastors and content editors only.
 * They are NOT accessible to normal members.
 *
 * Identity: X-User-Id header (dev/demo mode).
 * Permission: caller must supply userRole; 'admin' or 'superAdmin' required.
 *
 * POST /api/writing-assistant/generate  — generate or regenerate draft fields
 * POST /api/writing-assistant/refine    — focused single-field editing action
 */

import { Router, type Request, type Response } from "express";
import {
  generateDailyRhythmDraft,
  refineContent,
  type GenerationInputs,
  type RefineAction,
  type RefineContext,
  type WritingStyle,
} from "../lib/writing-assistant.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Auth helper ──────────────────────────────────────────────────────────────

function resolveWritingAssistantAuth(req: Request, res: Response): string | null {
  const userId = String(req.body?.userId ?? req.headers["x-user-id"] ?? "").trim();
  if (!userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  const role = String(req.body?.userRole ?? "").trim();
  if (role !== "admin" && role !== "superAdmin") {
    res.status(403).json({ error: "The Writing Assistant is only available to authorised editors." });
    return null;
  }

  return userId;
}

// ─── POST /api/writing-assistant/generate ─────────────────────────────────────
//
// Body: {
//   userId: string,
//   userRole: 'admin' | 'superAdmin',
//   inputs: GenerationInputs,
// }
//
// Returns: DraftResult

router.post("/writing-assistant/generate", async (req: Request, res: Response) => {
  const userId = resolveWritingAssistantAuth(req, res);
  if (!userId) return;

  const inputs = req.body?.inputs as GenerationInputs | undefined;

  if (!inputs?.scriptureRef?.trim()) {
    res.status(400).json({ error: "scriptureRef is required" });
    return;
  }
  if (!inputs?.centralTruth?.trim()) {
    res.status(400).json({ error: "centralTruth is required" });
    return;
  }
  if (!inputs?.passageText?.trim()) {
    res.status(400).json({ error: "passageText is required (retrieve the passage before generating)" });
    return;
  }

  const validStyles: WritingStyle[] = [
    "emmaus-standard", "pastor-jeremy", "new-believer", "bible-study", "youth",
  ];
  if (!validStyles.includes(inputs.writingStyle)) {
    inputs.writingStyle = "pastor-jeremy";
  }

  try {
    logger.info({ userId, day: inputs.dayNumber, style: inputs.writingStyle, field: inputs.targetField },
      "writing-assistant: generate");

    const result = await generateDailyRhythmDraft(inputs);
    res.json(result);
  } catch (err) {
    logger.error({ err, userId }, "writing-assistant: generate failed");
    res.status(500).json({
      error: "We couldn't create this draft. Your current content has been preserved. Please try again.",
    });
  }
});

// ─── POST /api/writing-assistant/refine ───────────────────────────────────────
//
// Body: {
//   userId: string,
//   userRole: 'admin' | 'superAdmin',
//   action: RefineAction,
//   content: string,
//   context: RefineContext,
// }
//
// Returns: { suggestion: string }

router.post("/writing-assistant/refine", async (req: Request, res: Response) => {
  const userId = resolveWritingAssistantAuth(req, res);
  if (!userId) return;

  const { action, content, context } = req.body as {
    action?: RefineAction;
    content?: string;
    context?: RefineContext;
  };

  if (!action || !content?.trim() || !context?.scripture) {
    res.status(400).json({ error: "action, content and context.scripture are required" });
    return;
  }

  const validActions: RefineAction[] = [
    "warmer", "clearer", "shorter", "paragraph-flow", "new-believer",
    "jesus-central", "another-prayer", "another-next-step", "check-repetition",
  ];
  if (!validActions.includes(action)) {
    res.status(400).json({ error: `Unknown action: ${action}` });
    return;
  }

  try {
    logger.info({ userId, action, field: context.fieldLabel }, "writing-assistant: refine");

    const suggestion = await refineContent(action, content, context);
    res.json({ suggestion });
  } catch (err) {
    logger.error({ err, userId, action }, "writing-assistant: refine failed");
    res.status(500).json({
      error: "We couldn't refine this content. Your current content has been preserved.",
    });
  }
});

export default router;
