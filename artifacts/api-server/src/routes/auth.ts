/**
 * auth.ts — Session management endpoints.
 *
 * POST /api/auth/session
 *   Issues a signed HMAC session cookie binding this browser to a userId.
 *   In dev/demo mode: accepts userId directly from the request body.
 *   Production upgrade path: replace body-userId acceptance with validated
 *   credentials (password hash check, OAuth token verify, etc.) before issuing.
 *
 * This endpoint is the bridge between the frontend localStorage demo identity
 * and the server-side signed cookie that guards privileged routes.
 * Clients (admin login, signInDemo) must call this to obtain a cookie before
 * making any admin API request — especially in production where X-User-Id is
 * not accepted as a fallback.
 */

import { Router, type Request, type Response } from "express";
import { setUserCookie } from "../emmaus/auth.js";
import { getUserRole } from "../lib/user-role-store.js";
import { logger } from "../lib/logger.js";
import { pool } from "@workspace/db";

export const authRouter = Router();

// ── User profile endpoints ────────────────────────────────────────────────────
// These are intentionally unauthenticated (demo system) — email is the key.

/** GET /api/users/profile?email=... — look up a member's saved name */
authRouter.get("/users/profile", async (req: Request, res: Response) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : null;
  if (!email) { res.status(400).json({ error: "email query param is required" }); return; }
  try {
    const result = await pool.query<{ preferred_name: string }>(
      `SELECT preferred_name FROM user_profiles WHERE email = $1`,
      [email]
    );
    res.json({ preferredName: result.rows[0]?.preferred_name ?? "" });
  } catch (err) {
    logger.warn({ err }, "users/profile GET: db error");
    res.json({ preferredName: "" }); // non-fatal — return empty so client falls back gracefully
  }
});

/** POST /api/users/profile — upsert a member's saved name */
authRouter.post("/users/profile", async (req: Request, res: Response) => {
  const { email, preferredName } = req.body as { email?: string; preferredName?: string };
  const emailClean = email?.trim().toLowerCase();
  if (!emailClean) { res.status(400).json({ error: "email is required" }); return; }
  const name = (preferredName ?? "").trim();
  try {
    await pool.query(
      `INSERT INTO user_profiles (email, preferred_name)
       VALUES ($1, $2)
       ON CONFLICT (email) DO UPDATE SET preferred_name = EXCLUDED.preferred_name`,
      [emailClean, name]
    );
    res.json({ ok: true });
  } catch (err) {
    logger.warn({ err }, "users/profile POST: db error");
    res.status(500).json({ error: "Profile save failed" });
  }
});

// ── Session endpoint ──────────────────────────────────────────────────────────

authRouter.post("/auth/session", async (req: Request, res: Response) => {
  // This demo-mode endpoint accepts a bare userId from the request body.
  // Production upgrade path: replace body-userId acceptance with verified
  // credentials (Firebase ID token, password hash, OAuth, etc.) before going live.
  // See emmaus/auth.ts for the verified-cookie extraction path.
  const { userId } = req.body as { userId?: string };

  if (!userId || typeof userId !== "string" || !userId.trim()) {
    res.status(400).json({ error: "userId is required" });
    return;
  }

  const uid = userId.trim();

  try {
    setUserCookie(res as Parameters<typeof setUserCookie>[0], uid);
    const role = await getUserRole(uid);
    logger.info({ userId: uid, role }, "auth/session: cookie issued");
    res.json({ ok: true, userId: uid, role });
  } catch (err) {
    logger.error({ err }, "auth/session: failed to issue cookie");
    res.status(500).json({ error: "Session creation failed" });
  }
});
