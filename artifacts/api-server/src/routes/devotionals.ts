/**
 * devotionals.ts — Daily Devotionals API routes.
 *
 * All endpoints require authentication.
 * Admin endpoints additionally require role = admin | superAdmin.
 */

import { Router, type Request, type Response } from "express";
import * as store from "../lib/devotional-store.js";
import { logger } from "../lib/logger.js";
import { requireAuth } from "../emmaus/auth.js";

export const devotionalsRouter = Router();

// ─── Auth helpers ─────────────────────────────────────────────────────────────
// Role is passed via X-User-Role header (same approach as requireSuperAdmin in auth.ts).

function isAdminRole(req: Request): boolean {
  const role = req.headers["x-user-role"];
  return role === "admin" || role === "superAdmin";
}

function guardAdmin(req: Request, res: Response): string | null {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!isAdminRole(req)) {
    res.status(403).json({ error: "Admin access required" });
    return null;
  }
  return userId;
}

// ─── Member: list published series ──────────────────────────────────────────

devotionalsRouter.get("/", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const series = await store.listPublishedSeries();
    res.json(series);
  } catch (err) {
    logger.error({ err }, "listPublishedSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: list all series ────────────────────────────────────────────────

devotionalsRouter.get("/admin", async (req: Request, res: Response) => {
  if (!guardAdmin(req, res)) return;
  try {
    const series = await store.listSeries();
    res.json(series);
  } catch (err) {
    logger.error({ err }, "listSeries (admin) failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Member: progress for all series ─────────────────────────────────────────

devotionalsRouter.get("/progress/all", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const progress = await store.getAllProgressForUser(userId);
    res.json(progress);
  } catch (err) {
    logger.error({ err }, "getAllProgress failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: create series ──────────────────────────────────────────────────

devotionalsRouter.post("/", async (req: Request, res: Response) => {
  const adminId = guardAdmin(req, res);
  if (!adminId) return;
  const { title, description, seriesType } = req.body;
  if (!title?.trim()) {
    res.status(400).json({ error: "title is required" });
    return;
  }
  try {
    const series = await store.createSeries(
      { title: title.trim(), description, seriesType },
      adminId
    );
    res.status(201).json(series);
  } catch (err) {
    logger.error({ err }, "createSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get single series (with entries) ─────────────────────────────────────

devotionalsRouter.get("/:id", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const series = await store.getSeriesById(String(req.params.id));
    if (!series) {
      res.status(404).json({ error: "Series not found" });
      return;
    }

    // Members can only read Published series
    const role = req.headers["x-user-role"];
    const adminAccess = role === "admin" || role === "superAdmin";
    if (!adminAccess && series.status !== "Published") {
      res.status(404).json({ error: "Series not found" });
      return;
    }

    res.json(series);
  } catch (err) {
    logger.error({ err }, "getSeriesById failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: update series ──────────────────────────────────────────────────

devotionalsRouter.patch("/:id", async (req: Request, res: Response) => {
  if (!guardAdmin(req, res)) return;
  const { title, description, seriesType, status } = req.body;
  try {
    const updated = await store.updateSeries(
      String(req.params.id),
      { title, description, seriesType, status }
    );
    if (!updated) { res.status(404).json({ error: "Series not found" }); return; }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "updateSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: archive series ────────────────────────────────────────────────

devotionalsRouter.delete("/:id", async (req: Request, res: Response) => {
  if (!guardAdmin(req, res)) return;
  try {
    await store.deleteSeries(String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "deleteSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: permanent delete ────────────────────────────────────────────────

devotionalsRouter.delete("/:id/permanent", async (req: Request, res: Response) => {
  if (!guardAdmin(req, res)) return;
  try {
    await store.permanentDeleteSeries(String(req.params.id));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "permanentDeleteSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: upsert entry ────────────────────────────────────────────────────

devotionalsRouter.put("/:id/entries/:day", async (req: Request, res: Response) => {
  if (!guardAdmin(req, res)) return;
  const seriesId = String(req.params.id);
  const day = parseInt(String(req.params.day), 10);
  if (isNaN(day) || day < 1) {
    res.status(400).json({ error: "Invalid day number" });
    return;
  }
  try {
    const entry = await store.upsertEntry(seriesId, day, req.body);
    res.json(entry);
  } catch (err) {
    logger.error({ err }, "upsertEntry failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: delete entry ────────────────────────────────────────────────────

devotionalsRouter.delete("/:id/entries/:day", async (req: Request, res: Response) => {
  if (!guardAdmin(req, res)) return;
  const seriesId = String(req.params.id);
  const day = parseInt(String(req.params.day), 10);
  try {
    await store.deleteEntry(seriesId, day);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "deleteEntry failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Member: get progress ────────────────────────────────────────────────────

devotionalsRouter.get("/:id/progress", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const progress = await store.getProgress(userId, String(req.params.id));
    res.json(progress ?? null);
  } catch (err) {
    logger.error({ err }, "getProgress failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Member: start a series ──────────────────────────────────────────────────

devotionalsRouter.post("/:id/start", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const progress = await store.startSeries(userId, String(req.params.id));
    res.json(progress);
  } catch (err) {
    logger.error({ err }, "startSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Member: mark day complete ───────────────────────────────────────────────

devotionalsRouter.post("/:id/progress/complete", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const day = parseInt(String(req.body.day), 10);
  if (isNaN(day)) { res.status(400).json({ error: "day required" }); return; }
  try {
    const progress = await store.markDayComplete(
      userId,
      String(req.params.id),
      day
    );
    res.json(progress);
  } catch (err) {
    logger.error({ err }, "markDayComplete failed");
    res.status(500).json({ error: "Server error" });
  }
});
