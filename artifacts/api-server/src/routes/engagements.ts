/**
 * engagements.ts — Active Engagement Platform Rule
 *
 * GET  /api/engagements          — unified cross-content engagement list for the signed-in user
 * POST /api/engagements/:type/:id/pause   — pause an engagement
 * POST /api/engagements/:type/:id/resume  — resume a paused engagement
 * POST /api/engagements/:type/:id/remove  — remove/drop an engagement record
 *
 * contentType values: "journey" | "devotional" | "sermon-companion"
 *
 * All endpoints require authentication (session cookie or X-User-Id header).
 */

import { Router, type Request, type Response } from "express";
import { requireAuth } from "../emmaus/auth.js";
import { pool } from "@workspace/db";
import * as journeyStore from "../lib/journey-store.js";
import * as devotionalStore from "../lib/devotional-store.js";
import * as scStore from "../lib/sermon-companion-store.js";
import { logger } from "../lib/logger.js";

export const engagementsRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

export type EngagementContentType = "journey" | "devotional" | "sermon-companion";

export interface EngagementItem {
  contentType: EngagementContentType;
  contentId: string;
  status: string;                   // active | paused
  currentDay: number;
  completedDays: number[];
  startedAt: string;
  updatedAt: string;
  title: string;
  route: string;
  metadata: {
    durationDays?: number;
    numberOfDays?: number;
    scriptureReference?: string;
    coverImageUrl?: string;
  };
}

// ─── GET /api/engagements ─────────────────────────────────────────────────────
// Returns all engagements for the signed-in user across all content types.
// ?status=all   → include paused records (default: only active)
// ?status=paused → only paused
// Excludes Daily Rhythm (journeyType = 'daily-rhythm' | 'core') — that has its own fetch path.
// Excludes content whose parent record is no longer Published (guard without deleting).

engagementsRouter.get("/", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const statusFilter = (req.query.status as string) || "active";

  try {
    const items: EngagementItem[] = [];

    // ── 1. Journey engagements ─────────────────────────────────────────────────
    // Exclude daily-rhythm / core (shown separately on Walk.tsx via JourneyContext)
    // Exclude companion (journeyType = 'companion') — those are legacy
    const journeyResult = await pool.query(
      `SELECT ujp.journey_id,
              COALESCE(ujp.status, 'active') AS status,
              ujp.current_day,
              ujp.completed_days,
              ujp.started_at,
              ujp.updated_at,
              j.title,
              j.status AS content_status,
              j.journey_type,
              j.duration_days,
              j.cover_image_url,
              j.metadata
       FROM   user_journey_progress ujp
       JOIN   journeys j ON j.id = ujp.journey_id
       WHERE  ujp.user_id = $1
         AND  j.journey_type NOT IN ('daily-rhythm', 'core', 'companion', 'devotional')
         AND  j.status = 'Published'
       ORDER BY ujp.updated_at DESC`,
      [userId],
    );

    for (const row of journeyResult.rows) {
      const rowStatus = row.status as string;
      if (statusFilter === "active" && rowStatus !== "active") continue;
      if (statusFilter === "paused" && rowStatus !== "paused") continue;

      const meta = (row.metadata ?? {}) as Record<string, unknown>;
      items.push({
        contentType: "journey",
        contentId: String(row.journey_id),
        status: rowStatus,
        currentDay: Number(row.current_day ?? 1),
        completedDays: Array.isArray(row.completed_days) ? row.completed_days : [],
        startedAt: row.started_at ? new Date(row.started_at).toISOString() : "",
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
        title: String(row.title ?? ""),
        route: `/journey/${row.journey_id}/day/${row.current_day ?? 1}`,
        metadata: {
          durationDays: Number(row.duration_days ?? 0) || undefined,
          scriptureReference: (meta.scriptureReference as string) || undefined,
          coverImageUrl: String(row.cover_image_url ?? "") || undefined,
        },
      });
    }

    // ── 2. Devotional engagements ──────────────────────────────────────────────
    // COALESCE(dp.status, 'active') handles rows created before the status column was added.
    const devotionalResult = await pool.query(
      `SELECT dp.series_id,
              COALESCE(dp.status, 'active') AS status,
              dp.current_day,
              dp.completed_days,
              dp.started_at,
              dp.updated_at,
              ds.title,
              ds.status AS content_status
       FROM   devotional_progress dp
       JOIN   devotional_series ds ON ds.id = dp.series_id
       WHERE  dp.user_id = $1
         AND  ds.status = 'Published'
       ORDER BY dp.updated_at DESC`,
      [userId],
    );

    for (const row of devotionalResult.rows) {
      const rowStatus = row.status as string;
      if (statusFilter === "active" && rowStatus !== "active") continue;
      if (statusFilter === "paused" && rowStatus !== "paused") continue;

      items.push({
        contentType: "devotional",
        contentId: String(row.series_id),
        status: rowStatus,
        currentDay: Number(row.current_day ?? 1),
        completedDays: Array.isArray(row.completed_days) ? row.completed_days : [],
        startedAt: row.started_at ? new Date(row.started_at).toISOString() : "",
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
        title: String(row.title ?? ""),
        route: `/devotional/${row.series_id}/day/${row.current_day ?? 1}`,
        metadata: {},
      });
    }

    // ── 3. Sermon Companion engagements ───────────────────────────────────────
    const scResult = await pool.query(
      `SELECT scp.companion_id,
              COALESCE(scp.status, 'active') AS status,
              scp.current_day,
              scp.completed_days,
              scp.started_at,
              scp.updated_at,
              sc.title,
              sc.status AS content_status,
              sc.number_of_days
       FROM   sermon_companion_progress scp
       JOIN   sermon_companion sc ON sc.id = scp.companion_id
       WHERE  scp.user_id = $1
         AND  sc.status = 'Published'
       ORDER BY scp.updated_at DESC`,
      [userId],
    );

    for (const row of scResult.rows) {
      const rowStatus = row.status as string;
      if (statusFilter === "active" && rowStatus !== "active") continue;
      if (statusFilter === "paused" && rowStatus !== "paused") continue;

      items.push({
        contentType: "sermon-companion",
        contentId: String(row.companion_id),
        status: rowStatus,
        currentDay: Number(row.current_day ?? 1),
        completedDays: Array.isArray(row.completed_days) ? row.completed_days : [],
        startedAt: row.started_at ? new Date(row.started_at).toISOString() : "",
        updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : "",
        title: String(row.title ?? ""),
        route: `/sermon-companion/${row.companion_id}/day/${row.current_day ?? 1}`,
        metadata: {
          numberOfDays: Number(row.number_of_days ?? 5) || undefined,
        },
      });
    }

    // Sort by most recently updated
    items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    res.set("Cache-Control", "no-store");
    res.json(items);
  } catch (err) {
    logger.error({ err }, "engagements: GET / failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/engagements/:type/:id/pause ────────────────────────────────────

engagementsRouter.post("/:contentType/:contentId/pause", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const contentType = String(req.params.contentType) as EngagementContentType;
  const contentId = String(req.params.contentId);

  try {
    switch (contentType) {
      case "journey":
        await journeyStore.pauseJourney(userId, contentId);
        break;
      case "devotional":
        await devotionalStore.pauseSeries(userId, contentId);
        break;
      case "sermon-companion":
        await scStore.pauseCompanion(userId, contentId);
        break;
      default:
        res.status(400).json({ error: `Unknown content type: ${contentType}` });
        return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, contentType, contentId }, "engagements: pause failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/engagements/:type/:id/resume ───────────────────────────────────

engagementsRouter.post("/:contentType/:contentId/resume", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const contentType = String(req.params.contentType) as EngagementContentType;
  const contentId = String(req.params.contentId);

  try {
    switch (contentType) {
      case "journey":
        await journeyStore.resumeJourney(userId, contentId);
        break;
      case "devotional":
        await devotionalStore.resumeSeries(userId, contentId);
        break;
      case "sermon-companion":
        await scStore.resumeCompanion(userId, contentId);
        break;
      default:
        res.status(400).json({ error: `Unknown content type: ${contentType}` });
        return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, contentType, contentId }, "engagements: resume failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/engagements/:type/:id/hide ────────────────────────────────────
// Non-destructive hide: removes the card from My Emmaus WITHOUT deleting
// progress, completed history, or position. The member can restore it by
// opening the content from Next Steps (which calls /unhide automatically).

engagementsRouter.post("/:contentType/:contentId/hide", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const contentType = String(req.params.contentType) as EngagementContentType;
  const contentId   = String(req.params.contentId);

  try {
    if (contentType === "journey") {
      await pool.query(
        `UPDATE user_journey_progress SET hidden_from_today = TRUE WHERE user_id = $1 AND journey_id = $2`,
        [userId, contentId],
      );
    } else if (contentType === "devotional") {
      await pool.query(
        `UPDATE devotional_progress SET hidden_from_today = TRUE WHERE user_id = $1 AND series_id = $2`,
        [userId, contentId],
      );
    } else if (contentType === "sermon-companion") {
      await pool.query(
        `UPDATE sermon_companion_progress SET hidden_from_today = TRUE WHERE user_id = $1 AND companion_id = $2`,
        [userId, contentId],
      );
    } else {
      res.status(400).json({ error: `hide is not supported for content type: ${contentType}` });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, contentType, contentId }, "engagements: hide failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/engagements/:type/:id/unhide ──────────────────────────────────
// Restores hidden content to My Emmaus. Called automatically when the
// member opens the content from Next Steps. Idempotent — safe to call even
// when the content is not currently hidden.

engagementsRouter.post("/:contentType/:contentId/unhide", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const contentType = String(req.params.contentType) as EngagementContentType;
  const contentId   = String(req.params.contentId);

  try {
    if (contentType === "journey") {
      await pool.query(
        `UPDATE user_journey_progress SET hidden_from_today = FALSE WHERE user_id = $1 AND journey_id = $2`,
        [userId, contentId],
      );
    } else if (contentType === "devotional") {
      await pool.query(
        `UPDATE devotional_progress SET hidden_from_today = FALSE WHERE user_id = $1 AND series_id = $2`,
        [userId, contentId],
      );
    } else if (contentType === "sermon-companion") {
      await pool.query(
        `UPDATE sermon_companion_progress SET hidden_from_today = FALSE WHERE user_id = $1 AND companion_id = $2`,
        [userId, contentId],
      );
    } else {
      res.status(400).json({ error: `unhide is not supported for content type: ${contentType}` });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, contentType, contentId }, "engagements: unhide failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /api/engagements/:type/:id/remove ───────────────────────────────────

engagementsRouter.post("/:contentType/:contentId/remove", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const contentType = String(req.params.contentType) as EngagementContentType;
  const contentId = String(req.params.contentId);

  try {
    switch (contentType) {
      case "journey":
        await journeyStore.removeJourneyProgress(userId, contentId);
        break;
      case "devotional":
        await devotionalStore.removeSeries(userId, contentId);
        break;
      case "sermon-companion":
        await scStore.removeCompanion(userId, contentId);
        break;
      default:
        res.status(400).json({ error: `Unknown content type: ${contentType}` });
        return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, contentType, contentId }, "engagements: remove failed");
    res.status(500).json({ error: "Server error" });
  }
});
