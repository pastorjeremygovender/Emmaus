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

export const authRouter = Router();

authRouter.post("/auth/session", async (req: Request, res: Response) => {
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
