import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../emmaus/auth.js";

const router = Router();

// GET /api/history — list user's recently viewed content (deduped, newest first)
router.get("/history", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const limit = Math.min(
    parseInt(String(req.query.limit ?? "50"), 10),
    100,
  );
  try {
    // DISTINCT ON keeps the most recent view per content item
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (content_type, content_id)
         id, content_type, content_id, content_title, content_route, viewed_at
       FROM user_history
       WHERE user_id = $1
       ORDER BY content_type, content_id, viewed_at DESC`,
      [userId],
    );
    // Re-sort by most-recent-view after DISTINCT ON
    rows.sort(
      (a: { viewed_at: string }, b: { viewed_at: string }) =>
        new Date(b.viewed_at).getTime() - new Date(a.viewed_at).getTime(),
    );
    res.json({ history: rows.slice(0, limit) });
  } catch {
    res.status(500).json({ error: "Failed to load history" });
  }
});

// POST /api/history — record that the user viewed a piece of content
router.post("/history", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const {
    contentType,
    contentId,
    contentTitle = "",
    contentRoute = "",
  } = req.body as {
    contentType?: string;
    contentId?: string;
    contentTitle?: string;
    contentRoute?: string;
  };
  if (!contentType || !contentId) {
    res.status(400).json({ error: "contentType and contentId are required" });
    return;
  }
  try {
    await pool.query(
      `INSERT INTO user_history (user_id, content_type, content_id, content_title, content_route)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, contentType, contentId, contentTitle, contentRoute],
    );
    // Prune to keep only the 300 most recent rows per user
    await pool.query(
      `DELETE FROM user_history WHERE id IN (
         SELECT id FROM user_history WHERE user_id = $1
         ORDER BY viewed_at DESC OFFSET 300
       )`,
      [userId],
    );
    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to record history" });
  }
});

export { router as historyRouter };
