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
import { logAuditEvent } from "../lib/audit-log.js";
import { isAdmin, getUserRole } from "../lib/user-role-store.js";

export const devotionalsRouter = Router();

// ─── Auth helpers ─────────────────────────────────────────────────────────────
// Role is resolved server-side from user-role-store, never from client headers.

async function guardAdmin(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!(await isAdmin(userId))) {
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
    res.set("Cache-Control", "no-store");
    res.json(series);
  } catch (err) {
    logger.error({ err }, "listPublishedSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: list all series ────────────────────────────────────────────────

devotionalsRouter.get("/admin", async (req: Request, res: Response) => {
  if (!(await guardAdmin(req, res))) return;
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
    res.set("Cache-Control", "no-store");
    res.json(progress);
  } catch (err) {
    logger.error({ err }, "getAllProgress failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: create series ──────────────────────────────────────────────────

devotionalsRouter.post("/", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
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
    await logAuditEvent({
      contentType: "devotional_series",
      contentId: String(series.id),
      action: "create",
      performedBy: adminId,
      previousState: null,
      newState: { id: series.id, title: series.title, status: series.status },
    });
    res.status(201).json(series);
  } catch (err) {
    logger.error({ err }, "createSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Devotional entry groups ─────────────────────────────────────────────────
// These are separate from the cross-content Content Groups feature. They group
// individual entries inside one devotional series (for example, January).

devotionalsRouter.get("/:id/groups", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const seriesId = String(req.params.id);
    const series = await store.getSeriesById(seriesId);
    if (!series) { res.status(404).json({ error: "Series not found" }); return; }
    const adminAccess = req.user?.role === "admin" || req.user?.role === "superAdmin";
    if (!adminAccess && series.status !== "Published") {
      res.status(404).json({ error: "Series not found" });
      return;
    }
    const groups = await store.getEntryGroupsForSeries(seriesId, !adminAccess);
    res.set("Cache-Control", "no-store");
    res.json(groups);
  } catch (err) {
    logger.error({ err }, "get devotional entry groups failed");
    res.status(500).json({ error: "Server error" });
  }
});

devotionalsRouter.post("/:id/groups", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (!title) { res.status(400).json({ error: "title is required" }); return; }
  try {
    const group = await store.createEntryGroup(String(req.params.id), {
      title,
      description: typeof req.body.description === "string" ? req.body.description : "",
      status: req.body.status === "Published" ? "Published" : "Draft",
      displayOrder: Number.isFinite(req.body.displayOrder) ? Number(req.body.displayOrder) : 0,
    });
    res.status(201).json(group);
  } catch (err) {
    logger.error({ err }, "create devotional entry group failed");
    res.status(500).json({ error: "Server error" });
  }
});

devotionalsRouter.patch("/:id/groups/:groupId", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;
  const updateData: Parameters<typeof store.updateEntryGroup>[2] = {};
  if (req.body?.title !== undefined) updateData.title = String(req.body.title).trim();
  if (req.body?.description !== undefined) updateData.description = String(req.body.description);
  if (req.body?.status !== undefined && ["Draft", "Published", "Archived"].includes(req.body.status)) {
    updateData.status = req.body.status;
  }
  if (req.body?.displayOrder !== undefined && Number.isFinite(req.body.displayOrder)) {
    updateData.displayOrder = Number(req.body.displayOrder);
  }
  if (updateData.title === "") { res.status(400).json({ error: "title cannot be empty" }); return; }
  try {
    const group = await store.updateEntryGroup(String(req.params.id), String(req.params.groupId), updateData);
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    res.json(group);
  } catch (err) {
    logger.error({ err }, "update devotional entry group failed");
    res.status(500).json({ error: "Server error" });
  }
});

devotionalsRouter.delete("/:id/groups/:groupId", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;
  try {
    const deleted = await store.deleteEntryGroup(String(req.params.id), String(req.params.groupId));
    if (!deleted) { res.status(404).json({ error: "Group not found" }); return; }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "delete devotional entry group failed");
    res.status(500).json({ error: "Server error" });
  }
});

devotionalsRouter.put("/:id/groups/:groupId/items", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;
  const entryIds = Array.isArray(req.body?.entryIds)
    ? req.body.entryIds.filter((id: unknown): id is string => typeof id === "string")
    : null;
  if (!entryIds) { res.status(400).json({ error: "entryIds must be an array" }); return; }
  try {
    const group = await store.replaceEntryGroupItems(
      String(req.params.id),
      String(req.params.groupId),
      entryIds,
    );
    if (!group) { res.status(404).json({ error: "Group not found" }); return; }
    res.json(group);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Server error";
    if (message.includes("belong to the selected series")) {
      res.status(400).json({ error: message });
      return;
    }
    logger.error({ err }, "replace devotional entry group items failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Get single published series (with entries) ────────────────────────────
// This is intentionally public so a devotional shared through WhatsApp or
// another messaging app can be read before the recipient creates an account.
// Progress and all mutations remain authenticated below.

devotionalsRouter.get("/:id", async (req: Request, res: Response) => {
  try {
    const series = await store.getSeriesById(String(req.params.id));
    if (!series) {
      res.status(404).json({ error: "Series not found" });
      return;
    }

    // Members can only read Published series
    const adminAccess =
      req.user?.role === "admin" || req.user?.role === "superAdmin";
    if (!adminAccess && series.status !== "Published") {
      res.status(404).json({ error: "Series not found" });
      return;
    }

    // Defence-in-depth: strip Draft (and Archived) entries from member responses
    // so unpublished content is never transmitted to the browser.
    // Admins receive the full entry list for authoring purposes.
    if (!adminAccess) {
      series.entries = series.entries.filter(e => e.status === "Published");
    }

    res.json(series);
  } catch (err) {
    logger.error({ err }, "getSeriesById failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: update series ──────────────────────────────────────────────────

devotionalsRouter.patch("/:id", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;
  const { title, description, seriesType, status, notifyMembers } = req.body;
  try {
    // Build update payload with only the fields the caller explicitly sent —
    // omit undefined values so a publish-only PATCH ({ status, notifyMembers })
    // never writes NULL into required fields like title.
    const updateData: Parameters<typeof store.updateSeries>[1] = {};
    if (title !== undefined)         updateData.title = title;
    if (description !== undefined)   updateData.description = description;
    if (seriesType !== undefined)     updateData.seriesType = seriesType;
    if (status !== undefined)        updateData.status = status;
    if (notifyMembers !== undefined)  updateData.notifyMembers = notifyMembers;
    const seriesId = String(req.params.id);
    const seriesBefore = await store.getSeriesById(seriesId);
    const updated = await store.updateSeries(seriesId, updateData);
    if (!updated) { res.status(404).json({ error: "Series not found" }); return; }

    let auditAction: "edit" | "publish" | "unpublish" | "archive" = "edit";
    if (status) {
      if (status === "Published" && seriesBefore?.status !== "Published") auditAction = "publish";
      else if (status === "Draft" && seriesBefore?.status === "Published") auditAction = "unpublish";
      else if (status === "Archived") auditAction = "archive";
    }
    await logAuditEvent({
      contentType: "devotional_series",
      contentId: seriesId,
      action: auditAction,
      performedBy: adminId,
      previousState: seriesBefore ? { id: seriesBefore.id, title: seriesBefore.title, status: seriesBefore.status } : null,
      newState: { id: updated.id, title: updated.title, status: updated.status },
    });

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "updateSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: archive series ────────────────────────────────────────────────

devotionalsRouter.delete("/:id", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;
  const seriesId = String(req.params.id);
  try {
    const seriesBefore = await store.getSeriesById(seriesId);
    await store.deleteSeries(seriesId);
    await logAuditEvent({
      contentType: "devotional_series",
      contentId: seriesId,
      action: "archive",
      performedBy: adminId,
      previousState: seriesBefore ? { id: seriesBefore.id, title: seriesBefore.title, status: seriesBefore.status } : null,
      newState: { status: "Archived" },
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "deleteSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: permanent delete ────────────────────────────────────────────────

devotionalsRouter.delete("/:id/permanent", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;

  // Permanent hard delete — Super Administrators only.
  if ((await getUserRole(adminId)) !== "superAdmin") {
    res.status(403).json({ error: "Super admin access required for permanent deletion" });
    return;
  }

  // Require explicit confirmation before permanently destroying authored content.
  if ((req.body as Record<string, unknown>)?.confirm !== "PERMANENTLY_DELETE") {
    res.status(400).json({
      error: "Permanent deletion requires { \"confirm\": \"PERMANENTLY_DELETE\" } in the request body.",
    });
    return;
  }

  const seriesId = String(req.params.id);
  try {
    const seriesBefore = await store.getSeriesById(seriesId);
    // Atomically writes tombstone + deletes series in a single DB transaction.
    // Throws if either step fails — the series is not deleted without a tombstone.
    await store.permanentDeleteSeries(seriesId, adminId);
    await logAuditEvent({
      contentType: "devotional_series",
      contentId: seriesId,
      action: "permanent_delete",
      performedBy: adminId,
      previousState: seriesBefore ? { id: seriesBefore.id, title: seriesBefore.title, status: seriesBefore.status } : null,
      newState: null,
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "permanentDeleteSeries failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: upsert entry ────────────────────────────────────────────────────

devotionalsRouter.put("/:id/entries/:day", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;
  const seriesId = String(req.params.id);
  const day = parseInt(String(req.params.day), 10);
  if (isNaN(day) || day < 1) {
    res.status(400).json({ error: "Invalid day number" });
    return;
  }
  try {
    const entry = await store.upsertEntry(seriesId, day, req.body);
    await logAuditEvent({
      contentType: "devotional_entry",
      contentId: `${seriesId}:day:${day}`,
      action: "edit",
      performedBy: adminId,
      previousState: null,
      newState: { seriesId, day },
    });
    res.json(entry);
  } catch (err) {
    logger.error({ err }, "upsertEntry failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: delete entry ────────────────────────────────────────────────────

devotionalsRouter.delete("/:id/entries/:day", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;
  const seriesId = String(req.params.id);
  const day = parseInt(String(req.params.day), 10);
  try {
    await store.deleteEntry(seriesId, day);
    await logAuditEvent({
      contentType: "devotional_entry",
      contentId: `${seriesId}:day:${day}`,
      action: "delete",
      performedBy: adminId,
      previousState: { seriesId, day },
      newState: null,
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "deleteEntry failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Admin: bulk-generate display labels for all entries ──────────────────────

devotionalsRouter.post("/:id/entries/bulk-labels", async (req: Request, res: Response) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;

  const seriesId = String(req.params.id);
  const { startDate, format, overwriteExisting } = req.body as {
    startDate: string;
    format: string;
    overwriteExisting?: boolean;
  };
  if (!startDate || !format) {
    res.status(400).json({ error: "startDate and format are required" });
    return;
  }

  const MONTHS_LONG = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  function formatDateLabel(date: Date, fmt: string): string {
    const d = date.getUTCDate();
    const m = date.getUTCMonth();
    const y = date.getUTCFullYear();
    return fmt
      .replace("MMMM", MONTHS_LONG[m])
      .replace("MMM",  MONTHS_SHORT[m])
      .replace("YYYY", String(y))
      .replace("DD",   String(d).padStart(2, "0"))
      .replace("MM",   String(m + 1).padStart(2, "0"))
      .replace("D",    String(d))
      .replace("M",    String(m + 1));
  }

  try {
    const series = await store.getSeriesById(seriesId);
    if (!series) { res.status(404).json({ error: "Series not found" }); return; }

    const ordered = [...series.entries].sort((a, b) => a.dayNumber - b.dayNumber);
    const startTs = new Date(startDate);
    const labels: Array<{ dayNumber: number; displayLabel: string }> = [];

    ordered.forEach((entry, index) => {
      if (!overwriteExisting && entry.displayLabel?.trim()) return;
      const date = new Date(startTs);
      date.setUTCDate(date.getUTCDate() + index);
      labels.push({ dayNumber: entry.dayNumber, displayLabel: formatDateLabel(date, format) });
    });

    const updated = await store.bulkSetEntryDisplayLabels(seriesId, labels);

    await logAuditEvent({
      contentType: "devotional_series",
      contentId: seriesId,
      action: "edit",
      performedBy: adminId,
      previousState: null,
      newState: { action: "bulk-labels", format, startDate, updated },
    });

    res.json({
      updated,
      previewFirst: labels[0]?.displayLabel ?? null,
      previewLast:  labels[labels.length - 1]?.displayLabel ?? null,
    });
  } catch (err) {
    logger.error({ err }, "POST /devotionals/:id/entries/bulk-labels failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Member: get progress ────────────────────────────────────────────────────

devotionalsRouter.get("/:id/progress", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const progress = await store.getProgress(userId, String(req.params.id));
    // Prevent browser caching stale completedDays counts — same as /progress/all.
    res.set("Cache-Control", "no-store");
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
