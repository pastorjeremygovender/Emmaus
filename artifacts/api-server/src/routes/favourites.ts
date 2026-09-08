import { Router } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../emmaus/auth.js";

const router = Router();

// GET /api/favourites — list user's favourites (newest first)
router.get("/favourites", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const { rows } = await pool.query(
      `SELECT id, content_type, content_id, content_title, content_subtitle, content_route, created_at
       FROM user_favourites WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId],
    );
    res.json({ favourites: rows });
  } catch {
    res.status(500).json({ error: "Failed to load favourites" });
  }
});

// GET /api/favourites/check/:contentType/:contentId — is this item favourited?
router.get("/favourites/check/:contentType/:contentId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { contentType, contentId } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM user_favourites WHERE user_id = $1 AND content_type = $2 AND content_id = $3`,
      [userId, String(contentType), String(contentId)],
    );
    res.json({ favourited: rows.length > 0 });
  } catch {
    res.status(500).json({ error: "Failed to check favourite" });
  }
});

// POST /api/favourites — add a favourite
router.post("/favourites", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const {
    contentType,
    contentId,
    contentTitle = "",
    contentSubtitle = "",
    contentRoute = "",
  } = req.body as {
    contentType?: string;
    contentId?: string;
    contentTitle?: string;
    contentSubtitle?: string;
    contentRoute?: string;
  };
  if (!contentType || !contentId) {
    res.status(400).json({ error: "contentType and contentId are required" });
    return;
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO user_favourites
         (user_id, content_type, content_id, content_title, content_subtitle, content_route)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, content_type, content_id) DO UPDATE SET
         content_title    = EXCLUDED.content_title,
         content_subtitle = EXCLUDED.content_subtitle,
         content_route    = EXCLUDED.content_route,
         created_at       = NOW()
       RETURNING *`,
      [userId, contentType, contentId, contentTitle, contentSubtitle, contentRoute],
    );
    res.status(201).json({ favourite: rows[0] });
  } catch {
    res.status(500).json({ error: "Failed to save favourite" });
  }
});

// DELETE /api/favourites/:contentType/:contentId — remove a favourite
router.delete("/favourites/:contentType/:contentId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { contentType, contentId } = req.params;
  try {
    await pool.query(
      `DELETE FROM user_favourites WHERE user_id = $1 AND content_type = $2 AND content_id = $3`,
      [userId, String(contentType), String(contentId)],
    );
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove favourite" });
  }
});

export { router as favouritesRouter };
