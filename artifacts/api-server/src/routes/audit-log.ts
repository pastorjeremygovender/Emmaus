/**
 * audit-log.ts — Admin endpoint for reading the content audit log.
 *
 * GET /api/admin/audit-log
 *   Returns the 200 most recent content_audit_log rows ordered by performed_at DESC.
 *   Optional query params:
 *     ?contentType=journey              filter by content type
 *     ?contentId=my-journey-id         filter by content ID
 *   Requires admin or superAdmin role.
 */

import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../emmaus/auth.js";
import { isAdmin } from "../lib/user-role-store.js";
import { logger } from "../lib/logger.js";

export const auditLogRouter = Router();

/**
 * Trusted admin guard — role is resolved server-side from user-role-store,
 * never from client-supplied request headers.
 */
async function guardAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

auditLogRouter.get("/admin/audit-log", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;

  const contentType = req.query.contentType ? String(req.query.contentType) : null;
  const contentId   = req.query.contentId   ? String(req.query.contentId)   : null;

  try {
    const vals: unknown[] = [];
    let idx = 1;
    let where = "1=1";

    if (contentType) {
      where += ` AND content_type = $${idx++}`;
      vals.push(contentType);
    }
    if (contentId) {
      where += ` AND content_id = $${idx++}`;
      vals.push(contentId);
    }

    const result = await pool.query(
      `SELECT id, content_type, content_id, action, performed_by, performed_at,
              previous_state, new_state
         FROM content_audit_log
        WHERE ${where}
        ORDER BY performed_at DESC
        LIMIT 200`,
      vals,
    );

    res.json({ entries: result.rows });
  } catch (err) {
    logger.error({ err }, "audit-log: GET /admin/audit-log failed");
    res.status(500).json({ error: "Server error" });
  }
});
