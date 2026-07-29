/**
 * admin-sermons.ts — Server-side persistence for admin sermon draft records.
 *
 * GET    /api/admin-sermons           — list all server-persisted sermon drafts
 * GET    /api/admin-sermons/:id       — get one by id
 * POST   /api/admin-sermons           — create / upsert
 * PATCH  /api/admin-sermons/:id       — update fields
 * DELETE /api/admin-sermons/:id       — delete sermon + companion cascade
 *
 * All endpoints require admin or superAdmin role.
 */

import { Router, type Request, type Response } from "express";
import {
  getAllAdminSermons,
  getAdminSermonById,
  upsertAdminSermon,
  updateAdminSermon,
  deleteAdminSermon,
} from "../lib/admin-sermon-store.js";
import { deleteSermonCompanionContent } from "../lib/sermon-companion-store.js";
import { requireAuth } from "../emmaus/auth.js";
import { isAdmin } from "../lib/user-role-store.js";
import { logger } from "../lib/logger.js";

export const adminSermonsRouter = Router();

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

// ─── GET / ────────────────────────────────────────────────────────────────────

adminSermonsRouter.get("/", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  try {
    const sermons = await getAllAdminSermons();
    res.json(sermons);
  } catch (err) {
    logger.error({ err }, "admin-sermons: list failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

adminSermonsRouter.get("/:id", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  try {
    const sermon = await getAdminSermonById(String(req.params.id));
    if (!sermon) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    res.json(sermon);
  } catch (err) {
    logger.error({ err }, "admin-sermons: get failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST / ───────────────────────────────────────────────────────────────────

const ALLOWED_SERMON_STATUSES = ["draft", "review", "published"];

adminSermonsRouter.post("/", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const body = req.body as Record<string, unknown>;
  if (!body?.id || typeof body.id !== "string") {
    res.status(400).json({ error: "id is required" });
    return;
  }
  if (body.status !== undefined && !ALLOWED_SERMON_STATUSES.includes(String(body.status))) {
    res.status(400).json({ error: `status must be one of: ${ALLOWED_SERMON_STATUSES.join(", ")}` });
    return;
  }
  try {
    const sermon = await upsertAdminSermon(body as Parameters<typeof upsertAdminSermon>[0]);
    res.status(201).json(sermon);
  } catch (err) {
    logger.error({ err }, "admin-sermons: upsert failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── DELETE /:id ──────────────────────────────────────────────────────────────
// Canonical delete: handles both legacy (journeys table, slug ID) and current
// (sermon_companion table, UUID) storage models.
//
// Body may include: { companionJourneyId?: string }
// This is required for legacy sermons that have no admin-sermon JSON record —
// the frontend knows the companionJourneyId from its local Sermon object.

adminSermonsRouter.delete("/:id", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const id = String(req.params.id);

  // Optional hint from frontend — needed when no JSON record exists (legacy sermons)
  const bodyCompanionId =
    req.body && typeof req.body.companionJourneyId === "string"
      ? req.body.companionJourneyId
      : null;

  try {
    // Try admin-sermon JSON store first (current model)
    const sermon = await getAdminSermonById(id);
    const companionJourneyId = sermon?.companionJourneyId ?? bodyCompanionId;

    if (!sermon && !bodyCompanionId) {
      // Neither a known JSON record nor a companion hint — nothing to delete
      res.status(404).json({
        success: false,
        code: "NOT_FOUND",
        message: "Sermon Companion not found.",
      });
      return;
    }

    logger.info(
      { sermonId: id, companionJourneyId, fromJsonRecord: !!sermon },
      "admin-sermons: beginning delete",
    );

    const result = await deleteSermonCompanionContent({
      sermonId: id,
      companionJourneyId: companionJourneyId ?? null,
    });

    logger.info(result, "admin-sermons: delete complete");

    res.status(200).json({
      success: true,
      deleted: result,
    });
  } catch (err) {
    logger.error({ err, sermonId: id }, "admin-sermons: delete failed");
    res.status(500).json({
      success: false,
      code: "DELETE_FAILED",
      message: "We couldn't delete this Sermon Companion. Nothing was removed. Please try again.",
    });
  }
});

// ─── PATCH /:id ───────────────────────────────────────────────────────────────

adminSermonsRouter.patch("/:id", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
  const ALLOWED_STATUSES = ["draft", "review", "published"];
  const body = req.body as Record<string, unknown>;

  if (body.status !== undefined && !ALLOWED_STATUSES.includes(String(body.status))) {
    res.status(400).json({ error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` });
    return;
  }

  try {
    const updated = await updateAdminSermon(String(req.params.id), body);
    if (!updated) {
      res.status(404).json({ error: "Sermon not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "admin-sermons: update failed");
    res.status(500).json({ error: "Server error" });
  }
});
