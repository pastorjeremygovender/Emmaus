/**
 * admin-reset.ts — Admin-only progress reset routes for testing.
 *
 * All routes require the caller to be an authenticated admin or superAdmin.
 * Resets affect ONLY the requesting user's own progress rows.
 *
 * Routes:
 *   GET  /api/admin-reset/content-list          — lists all resettable content
 *   POST /api/admin-reset/daily-rhythm           — reset Daily Rhythm to Day 1
 *   POST /api/admin-reset/journey/:id?kind=...   — reset one journey/devotional/companion
 *   POST /api/admin-reset/everything             — wipe all progress for this user
 */

import { Router, type Request, type Response } from "express";
import { requireAuth } from "../emmaus/auth.js";
import { isAdmin } from "../lib/user-role-store.js";
import * as journeyStore from "../lib/journey-store.js";
import * as devotionalStore from "../lib/devotional-store.js";
import * as companionStore from "../lib/sermon-companion-store.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Auth guard ───────────────────────────────────────────────────────────────

async function guardAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

// ─── GET /api/admin-reset/content-list ───────────────────────────────────────
// Returns all published content across journeys, devotionals, and companions so
// the Testing page can build the "Reset Individual Journey" list without
// needing three separate fetches.

router.get("/admin-reset/content-list", async (req: Request, res: Response) => {
  const userId = await guardAdmin(req, res);
  if (!userId) return;

  try {
    const [journeys, devotionals, companions] = await Promise.all([
      journeyStore.listPublishedJourneys(),
      devotionalStore.listPublishedSeries(),
      companionStore.listPublishedSermonCompanions(),
    ]);

    res.json({
      journeys: journeys.map(j => ({
        id: j.id,
        title: j.title,
        journeyType: j.journeyType,
      })),
      devotionals: devotionals.map(d => ({
        id: d.id,
        title: d.title,
      })),
      companions: companions.map(c => ({
        id: c.id,
        title: c.title,
      })),
    });
  } catch (err) {
    logger.error({ err }, "admin-reset: content-list failed");
    res.status(500).json({ error: "Could not load content list" });
  }
});

// ─── POST /api/admin-reset/daily-rhythm ───────────────────────────────────────
// Finds the Daily Rhythm journey and resets the calling user's progress to Day 1.
// The user remains enrolled — Day 1 becomes available immediately.

router.post("/admin-reset/daily-rhythm", async (req: Request, res: Response) => {
  const userId = await guardAdmin(req, res);
  if (!userId) return;

  try {
    const journeys = await journeyStore.listPublishedJourneys();
    const dailyRhythm = journeys.find(
      j => j.journeyType === "daily-rhythm" || j.journeyType === "core"
    );
    if (!dailyRhythm) {
      res.status(404).json({ error: "Daily Rhythm journey not found" });
      return;
    }

    await journeyStore.resetProgress(userId, dailyRhythm.id);
    logger.info({ userId, journeyId: dailyRhythm.id }, "admin-reset: daily-rhythm reset");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin-reset: daily-rhythm failed");
    res.status(500).json({ error: "Reset failed" });
  }
});

// ─── POST /api/admin-reset/journey/:id ────────────────────────────────────────
// Resets a single piece of content.  ?kind= selects the content type:
//   journey   (default) → resetProgress (Day 1, keep enrolled)
//   devotional          → removeSeries (remove progress row)
//   companion           → removeCompanion (remove progress row)

router.post("/admin-reset/journey/:id", async (req: Request, res: Response) => {
  const userId = await guardAdmin(req, res);
  if (!userId) return;

  const id = String(req.params["id"]);
  const kind = String(req.query["kind"] ?? "journey");

  try {
    switch (kind) {
      case "devotional":
        await devotionalStore.removeSeries(userId, id);
        break;
      case "companion":
        await companionStore.removeCompanion(userId, id);
        break;
      default:
        // For regular journeys (including Daily Rhythm): reset to Day 1, keep enrolled
        await journeyStore.resetProgress(userId, id);
        break;
    }
    logger.info({ userId, id, kind }, "admin-reset: individual journey reset");
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err, id, kind }, "admin-reset: individual journey reset failed");
    res.status(500).json({ error: "Reset failed" });
  }
});

// ─── POST /api/admin-reset/everything ────────────────────────────────────────
// Removes ALL progress for the requesting user across every content type.
// The user account, profile, and settings are not touched.

router.post("/admin-reset/everything", async (req: Request, res: Response) => {
  const userId = await guardAdmin(req, res);
  if (!userId) return;

  try {
    // 1. All journey progress rows
    const allJourneyProgress = await journeyStore.getAllProgress(userId);
    await Promise.all(
      Object.keys(allJourneyProgress).map(journeyId =>
        journeyStore.removeJourneyProgress(userId, journeyId)
      )
    );

    // 2. All devotional progress rows
    const allDevotionalProgress = await devotionalStore.getAllProgressForUser(userId);
    await Promise.all(
      allDevotionalProgress.map(p => devotionalStore.removeSeries(userId, p.seriesId))
    );

    // 3. All sermon companion progress rows
    const allCompanionProgress = await companionStore.getAllSermonCompanionProgress(userId);
    await Promise.all(
      Object.keys(allCompanionProgress).map(companionId =>
        companionStore.removeCompanion(userId, companionId)
      )
    );

    logger.info(
      {
        userId,
        journeyCount: Object.keys(allJourneyProgress).length,
        devotionalCount: allDevotionalProgress.length,
        companionCount: Object.keys(allCompanionProgress).length,
      },
      "admin-reset: everything reset"
    );

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "admin-reset: everything failed");
    res.status(500).json({ error: "Reset failed" });
  }
});

export default router;
