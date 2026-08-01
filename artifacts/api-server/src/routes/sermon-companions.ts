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
import { logAuditEvent } from "../lib/audit-log.js";

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

// ─── GET /current-week/member ─────────────────────────────────────────────────
// Must be registered before GET /:companionId to prevent path-param capture.
// Any authenticated member. Returns the Published companion marked is_current_week=true
// with the caller's progress. 404 when no companion is currently marked.

sermonCompanionsRouter.get("/current-week/member", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const companion = await store.getCurrentWeekPublicCompanion();
    if (!companion) {
      res.status(404).json({ error: "No current week sermon companion" });
      return;
    }
    const progress = await store.getProgressForUser(userId, companion.id);
    res.json({ ...companion, progress: progress ?? null });
  } catch (err) {
    logger.error({ err }, "sermon-companions: getCurrentWeekMember failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /:companionId/set-current-week ──────────────────────────────────────
// Admin only. Atomically marks this companion as This Week's Sermon and clears
// the flag on all others.

sermonCompanionsRouter.post("/:companionId/set-current-week", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;

  try {
    await store.setCurrentWeekCompanion(String(req.params.companionId));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "sermon-companions: setCurrentWeek failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /member/engagements ──────────────────────────────────────────────────
// Must be registered before GET /:companionId to prevent path-param capture.
// Any authenticated member. Returns ALL Published companions with the caller's
// progress attached. Walk.tsx uses this to surface every in-progress companion
// on Today's Steps, not just the current-week one.

sermonCompanionsRouter.get("/member/engagements", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const [companions, progressMap] = await Promise.all([
      store.listPublishedSermonCompanions(),
      store.getAllSermonCompanionProgress(userId),
    ]);

    // Only fetch entries for companions the user has ACTIVE progress on — paused
    // companions are excluded so they don't reappear on Today's Steps after reload.
    const startedIds = companions
      .filter(c => progressMap[c.id] && progressMap[c.id].status !== "paused")
      .map(c => c.id);
    const entriesByCompanion = Object.fromEntries(
      await Promise.all(
        startedIds.map(async id => {
          const entries = await store.getEntriesForCompanion(id);
          return [id, entries.filter(e => e.status === "Published").map(e => ({
            dayNumber: e.dayNumber,
            title: e.title,
          }))];
        }),
      ),
    );

    const { computeBadge } = await import("../lib/badge.js");
    const result = companions.map(c => {
      const progress = progressMap[c.id] ?? null;
      // Null out progress for paused companions — Walk.tsx filters on `progress !== null`
      // so this naturally hides paused companions without client-side status checks.
      // Hidden companions keep their progress so Next Steps can still surface them as
      // "in progress"; Walk.tsx filters them separately via hiddenFromToday.
      const activeProgress = progress && progress.status !== "paused" ? progress : null;
      const badge = computeBadge(
        c.notifyPublishedAt ?? null,
        progress?.lastOpenedAt ?? null,
        progress !== null,
      );
      const progressRow = activeProgress as (typeof activeProgress & { hidden_from_today?: boolean }) | null;
      return {
        id: c.id,
        title: c.title,
        numberOfDays: c.publishedEntryCount,
        isCurrentWeek: (c as unknown as Record<string, unknown>).isCurrentWeek ?? false,
        entries: entriesByCompanion[c.id] ?? [],
        progress: progressRow
          ? {
              currentDay: progressRow.currentDay,
              completedDays: progressRow.completedDays,
              status: progressRow.status,
              hiddenFromToday: progressRow.hidden_from_today ?? false,
            }
          : null,
        badge,
      };
    });

    res.json(result);
  } catch (err) {
    logger.error({ err }, "sermon-companions: member/engagements failed");
    res.status(500).json({ error: "Server error" });
  }
});

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

  const companionId = String(req.params.companionId);
  try {
    await store.updateCompanion(companionId, { title, status: status as CompanionStatus | undefined });
    await logAuditEvent({
      contentType: "sermon_companion",
      contentId: companionId,
      action: "edit",
      performedBy: adminId,
      previousState: null,
      newState: { title, status },
    });
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
    await logAuditEvent({
      contentType: "sermon_companion_entry",
      contentId: `${companionId}:day:${day}`,
      action: "edit",
      performedBy: adminId,
      previousState: null,
      newState: { companionId, day, title, status },
    });
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

// ─── POST /:companionId/publish ───────────────────────────────────────────────
// Admin only. Publishes the companion header AND all its entries atomically
// so members always see a fully readable companion without a gap between
// companion status and entry status.

sermonCompanionsRouter.post("/:companionId/publish", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;

  try {
    const id = String(req.params.companionId);
    const notifyMembers = req.body?.notifyMembers === true;
    // P2-12: use atomic helper so companion header + entries publish in a single transaction
    await store.publishCompanionAtomic(id, notifyMembers);
    await logAuditEvent({
      contentType: "sermon_companion",
      contentId: id,
      action: "publish",
      performedBy: adminId,
      previousState: null,
      newState: { status: "Published" },
    });
    res.json({ ok: true, status: "Published" });
  } catch (err) {
    logger.error({ err }, "sermon-companions: publish failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── POST /:companionId/unpublish ─────────────────────────────────────────────

sermonCompanionsRouter.post("/:companionId/unpublish", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;

  try {
    const id = String(req.params.companionId);
    await store.updateCompanion(id, { status: "Draft" });
    await logAuditEvent({
      contentType: "sermon_companion",
      contentId: id,
      action: "unpublish",
      performedBy: adminId,
      previousState: null,
      newState: { status: "Draft" },
    });
    res.json({ ok: true, status: "Draft" });
  } catch (err) {
    logger.error({ err }, "sermon-companions: unpublish failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── GET /:companionId/member ─────────────────────────────────────────────────
// Any authenticated member. Returns a Published companion with only its
// Published entries, plus the caller's progress record. Returns 404 for Draft
// companions so members can never reach unpublished content via a guessed URL.

sermonCompanionsRouter.get("/:companionId/member", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const companion = await store.getPublicCompanionById(String(req.params.companionId));
    if (!companion) {
      res.status(404).json({ error: "Companion not found or not published" });
      return;
    }
    const progress = await store.getProgressForUser(userId, companion.id);
    res.json({ ...companion, progress: progress ?? null });
  } catch (err) {
    logger.error({ err }, "sermon-companions: getMember failed");
    res.status(500).json({ error: "Server error" });
  }
});
