/**
 * badges.ts — Smart Content Indicator badge management routes.
 *
 * POST /badges/dismiss — clears the UPDATED badge for the current user by
 *   setting last_opened_at = NOW() on the relevant progress row.
 *
 * IMPORTANT: this endpoint only UPDATEs existing rows — it never inserts a
 * progress record. For NEW badges (no progress row yet) the UPDATE is a safe
 * no-op. The badge clears naturally when the member starts the content via the
 * normal enrollment/begin flow, which creates the progress row with a correct
 * last_opened_at. This prevents bypassing enrollment limits, Room-start flows,
 * or devotional begin flows by touching a badge indicator.
 */

import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { extractUserId } from "../emmaus/auth.js";
import { logger } from "../lib/logger.js";

export const badgesRouter = Router();

type ContentType = "journey" | "devotional" | "companion";

badgesRouter.post("/badges/dismiss", async (req: Request, res: Response) => {
  const userId = extractUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { contentType, contentId } = req.body as {
    contentType?: string;
    contentId?: string;
  };

  if (!contentType || !contentId) {
    res.status(400).json({ error: "contentType and contentId are required" });
    return;
  }

  const type = contentType as ContentType;

  try {
    // Only UPDATE — never INSERT. If no progress row exists (NEW badge) this is a
    // harmless no-op; the badge clears when the member starts via the normal flow.
    if (type === "journey") {
      await pool.query(
        `UPDATE user_journey_progress
         SET last_opened_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND journey_id = $2`,
        [userId, contentId],
      );
    } else if (type === "devotional") {
      await pool.query(
        `UPDATE devotional_progress
         SET last_opened_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND series_id = $2`,
        [userId, contentId],
      );
    } else if (type === "companion") {
      await pool.query(
        `UPDATE sermon_companion_progress
         SET last_opened_at = NOW(), updated_at = NOW()
         WHERE user_id = $1 AND companion_id = $2`,
        [userId, contentId],
      );
    } else {
      res.status(400).json({ error: "contentType must be journey | devotional | companion" });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err, userId, contentType, contentId }, "badges/dismiss failed");
    res.status(500).json({ error: "Server error" });
  }
});
