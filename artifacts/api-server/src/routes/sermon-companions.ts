/**
 * sermon-companions.ts — CRUD routes for sermon companion records and entries.
 *
 * GET  /api/sermon-companions/by-sermon/:sermonId     — get companion for a sermon
 * GET  /api/sermon-companions/:companionId            — get companion by id
 * PATCH /api/sermon-companions/:companionId           — update title/status
 * PATCH /api/sermon-companions/:companionId/entries/:day — update one entry
 *
 * Member progress:
 * POST /api/sermon-companions/:companionId/progress/start
 * POST /api/sermon-companions/:companionId/progress/complete-day
 * GET  /api/sermon-companions/:companionId/progress   — get my progress
 */

import { Router, type Request, type Response } from "express";
import * as store from "../lib/sermon-companion-store.js";
import { requireAuth } from "../emmaus/auth.js";
import { isAdmin } from "../lib/user-role-store.js";
import { logger } from "../lib/logger.js";

export const sermonCompanionsRouter = Router();

// ─── Auth helpers ─────────────────────────────────────────────────────────────
// Role validated from server-side store — never from request headers.

async function guardAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

// ─── GET /by-sermon/:sermonId ─────────────────────────────────────────────────

sermonCompanionsRouter.get("/by-sermon/:sermonId", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;

  try {
    const companion = await store.getCompanionBySermonId(String(req.params.sermonId));
    if (!companion) {
      res.status(404).json({ error: "No companion found for this sermon" });
      return;
    }
    res.json(companion);
  } catch (err) {
    logger.error({ err }, "sermon-companions: getBySermonId failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /:companionId ────────────────────────────────────────────────────────

sermonCompanionsRouter.get("/:companionId", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;

  try {
    const companion = await store.getCompanionById(String(req.params.companionId));
    if (!companion) {
      res.status(404).json({ error: "Companion not found" });
      return;
    }
    res.json(companion);
  } catch (err) {
    logger.error({ err }, "sermon-companions: getById failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PATCH /:companionId ──────────────────────────────────────────────────────

const ALLOWED_COMPANION_STATUSES = ["Draft", "Published", "Archived"] as const;
type CompanionStatus = typeof ALLOWED_COMPANION_STATUSES[number];

sermonCompanionsRouter.patch("/:companionId", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;

  const { title, status } = req.body as { title?: string; status?: string };

  if (status !== undefined && !ALLOWED_COMPANION_STATUSES.includes(status as CompanionStatus)) {
    res.status(400).json({ error: `status must be one of: ${ALLOWED_COMPANION_STATUSES.join(", ")}` });
    return;
  }

  try {
    await store.updateCompanion(String(req.params.companionId), { title, status: status as CompanionStatus | undefined });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "sermon-companions: updateCompanion failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── PATCH /:companionId/entries/:day ─────────────────────────────────────────

sermonCompanionsRouter.patch("/:companionId/entries/:day", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;

  const companionId = String(req.params.companionId);
  const day = parseInt(String(req.params.day), 10);

  if (isNaN(day) || day < 1) {
    res.status(400).json({ error: "Invalid day number" });
    return;
  }

  const { title, scriptureReference, greeting, reflection, prayer, nextStep, closing, status } = req.body as Record<string, string | undefined>;

  try {
    const updated = await store.updateEntry(companionId, day, {
      title, scriptureReference, greeting, reflection, prayer, nextStep, closing, status,
    });
    if (!updated) {
      res.status(404).json({ error: "Entry not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "sermon-companions: updateEntry failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Member progress endpoints ────────────────────────────────────────────────

sermonCompanionsRouter.get("/:companionId/progress", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const prog = await store.getProgressForUser(userId, String(req.params.companionId));
    if (!prog) {
      res.status(404).json({ error: "No progress found" });
      return;
    }
    res.json(prog);
  } catch (err) {
    logger.error({ err }, "sermon-companions: getProgress failed");
    res.status(500).json({ error: "Server error" });
  }
});

sermonCompanionsRouter.post("/:companionId/progress/start", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const prog = await store.startCompanion(userId, String(req.params.companionId));
    res.json(prog);
  } catch (err) {
    logger.error({ err }, "sermon-companions: startCompanion failed");
    res.status(500).json({ error: "Server error" });
  }
});

sermonCompanionsRouter.post("/:companionId/progress/complete-day", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { dayNumber } = req.body as { dayNumber?: number };
  if (!dayNumber || typeof dayNumber !== "number") {
    res.status(400).json({ error: "dayNumber is required" });
    return;
  }

  try {
    const prog = await store.markDayComplete(userId, String(req.params.companionId), dayNumber);
    if (!prog) {
      res.status(404).json({ error: "Progress record not found" });
      return;
    }
    res.json(prog);
  } catch (err) {
    logger.error({ err }, "sermon-companions: markDayComplete failed");
    res.status(500).json({ error: "Server error" });
  }
});
