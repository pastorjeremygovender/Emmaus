/**
 * Content Groups routes (Task #614)
 *
 * Base: /api/content-groups
 *
 * ─ GET    /content-groups                          list all groups (admin: all statuses; member: Published only)
 * ─ GET    /content-groups/:id                      group detail with items (optional ?type= filter)
 * ─ POST   /content-groups                          create group (admin)
 * ─ PUT    /content-groups/:id                      update group (admin)
 * ─ DELETE /content-groups/:id                      delete group + memberships only (admin)
 * ─ PUT    /content-groups/:id/items                replace/reorder all items (admin)
 * ─ GET    /content-groups/by-target/:type/:id      groups containing a target (member: Published only)
 *
 * Authentication conventions:
 *   GET endpoints — member-safe (no auth required, but caller may be authenticated)
 *   Mutations (POST/PUT/DELETE) — requireAdmin
 */

import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../emmaus/auth.js";
import {
  listGroups,
  listPublishedGroups,
  getGroup,
  getPublishedGroupWithEligibleItems,
  getGroupsForTarget,
  createGroup,
  updateGroup,
  deleteGroup,
  replaceGroupItems,
  VALID_TARGET_TYPES,
  type TargetType,
} from "../lib/content-groups-store.js";
import { logger } from "../lib/logger.js";
import { extractUserId } from "../emmaus/auth.js";
import { logAuditEvent } from "../lib/audit-log.js";

const router = Router();

// ─── GET /content-groups ──────────────────────────────────────────────────────
// Admin sees all statuses; members (or unauthenticated) see Published only.
router.get("/", async (req: Request, res: Response) => {
  try {
    const isAdmin =
      req.user?.role === "admin" || req.user?.role === "superAdmin";

    const groups = isAdmin ? await listGroups() : await listPublishedGroups();
    res.json({ groups });
  } catch (err) {
    logger.error({ err }, "GET /content-groups failed");
    res.status(500).json({ error: "Failed to fetch content groups" });
  }
});

// ─── GET /content-groups/by-target/:type/:targetId ───────────────────────────
// Must be defined BEFORE /:id to avoid route collision.
router.get(
  "/by-target/:type/:targetId",
  async (req: Request, res: Response) => {
    try {
      const type = String(req.params.type);
      const targetId = String(req.params.targetId);

      if (!VALID_TARGET_TYPES.includes(type as TargetType)) {
        res.status(400).json({
          error: `Invalid type. Must be one of: ${VALID_TARGET_TYPES.join(", ")}`,
        });
        return;
      }

      const isAdmin =
        req.user?.role === "admin" || req.user?.role === "superAdmin";

      const groups = await getGroupsForTarget(
        type as TargetType,
        targetId,
        !isAdmin, // publishedOnly for non-admins
      );
      res.json({ groups });
    } catch (err) {
      logger.error({ err }, "GET /content-groups/by-target failed");
      res.status(500).json({ error: "Failed to fetch groups for target" });
    }
  },
);

// ─── GET /content-groups/:id ──────────────────────────────────────────────────
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const typeFilter = req.query.type ? String(req.query.type) as TargetType : undefined;

    if (typeFilter && !VALID_TARGET_TYPES.includes(typeFilter)) {
      res.status(400).json({
        error: `Invalid type filter. Must be one of: ${VALID_TARGET_TYPES.join(", ")}`,
      });
      return;
    }

    const isAdmin =
      req.user?.role === "admin" || req.user?.role === "superAdmin";

    let group;
    if (isAdmin) {
      // Admin: return full group regardless of status, raw items
      group = await getGroup(id);
      if (!group) {
        res.status(404).json({ error: "Content group not found" });
        return;
      }
      // Apply optional type filter in memory
      if (typeFilter) {
        group = { ...group, items: group.items.filter(i => i.targetType === typeFilter) };
      }
    } else {
      // Member: Published groups + eligible items only
      group = await getPublishedGroupWithEligibleItems(id, typeFilter);
      if (!group) {
        res.status(404).json({ error: "Content group not found" });
        return;
      }
    }

    res.json({ group });
  } catch (err) {
    logger.error({ err }, "GET /content-groups/:id failed");
    res.status(500).json({ error: "Failed to fetch content group" });
  }
});

// ─── POST /content-groups ─────────────────────────────────────────────────────
router.post("/", async (req: Request, res: Response) => {
  const callerId = requireAdmin(req, res);
  if (!callerId) return;

  try {
    const { title, description, coverImageUrl, status, displayOrder } = req.body;

    if (!title?.trim()) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    if (status && !["Draft", "Published", "Archived"].includes(status)) {
      res.status(400).json({ error: "status must be Draft, Published, or Archived" });
      return;
    }

    const group = await createGroup(
      {
        title: String(title).trim(),
        description: description ?? "",
        coverImageUrl: coverImageUrl ?? null,
        status: status ?? "Draft",
        displayOrder: typeof displayOrder === "number" ? displayOrder : 0,
      },
      callerId,
    );

    res.status(201).json({ group });
  } catch (err) {
    logger.error({ err }, "POST /content-groups failed");
    res.status(500).json({ error: "Failed to create content group" });
  }
});

// ─── PUT /content-groups/:id ──────────────────────────────────────────────────
router.put("/:id", async (req: Request, res: Response) => {
  const callerId = requireAdmin(req, res);
  if (!callerId) return;

  try {
    const id = String(req.params.id);
    const { title, description, coverImageUrl, status, displayOrder } = req.body;

    if (title !== undefined && !String(title).trim()) {
      res.status(400).json({ error: "Title cannot be empty" });
      return;
    }

    if (status && !["Draft", "Published", "Archived"].includes(status)) {
      res.status(400).json({ error: "status must be Draft, Published, or Archived" });
      return;
    }

    const patch: Record<string, unknown> = {};
    if (title !== undefined) patch.title = String(title).trim();
    if (description !== undefined) patch.description = description;
    if (coverImageUrl !== undefined) patch.coverImageUrl = coverImageUrl ?? null;
    if (status !== undefined) patch.status = status;
    if (displayOrder !== undefined) patch.displayOrder = Number(displayOrder);

    const group = await updateGroup(id, patch, callerId);
    if (!group) {
      res.status(404).json({ error: "Content group not found" });
      return;
    }

    res.json({ group });
  } catch (err) {
    logger.error({ err }, "PUT /content-groups/:id failed");
    res.status(500).json({ error: "Failed to update content group" });
  }
});

// ─── DELETE /content-groups/:id ───────────────────────────────────────────────
// Deletes the group and its membership rows only. Content and progress untouched.
router.delete("/:id", async (req: Request, res: Response) => {
  const callerId = requireAdmin(req, res);
  if (!callerId) return;

  try {
    const id = String(req.params.id);
    const ok = await deleteGroup(id);
    if (!ok) {
      res.status(404).json({ error: "Content group not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "DELETE /content-groups/:id failed");
    res.status(500).json({ error: "Failed to delete content group" });
  }
});

// ─── PUT /content-groups/:id/items ────────────────────────────────────────────
// Atomically replaces + reorders all items for a group.
// Body: { items: [{ targetType, targetId }, ...] }
router.put("/:id/items", async (req: Request, res: Response) => {
  const callerId = requireAdmin(req, res);
  if (!callerId) return;

  try {
    const id = String(req.params.id);
    const { items } = req.body;

    // Verify the group exists
    const group = await getGroup(id);
    if (!group) {
      res.status(404).json({ error: "Content group not found" });
      return;
    }

    if (!Array.isArray(items)) {
      res.status(400).json({ error: "items must be an array" });
      return;
    }

    for (const item of items) {
      if (!item.targetType || !item.targetId) {
        res.status(400).json({ error: "Each item must have targetType and targetId" });
        return;
      }
      if (!VALID_TARGET_TYPES.includes(item.targetType as TargetType)) {
        res.status(400).json({
          error: `Invalid targetType "${item.targetType}". Must be one of: ${VALID_TARGET_TYPES.join(", ")}`,
        });
        return;
      }
    }

    const previous = group.items.map(item => ({
      targetType: item.targetType,
      targetId: item.targetId,
      displayOrder: item.displayOrder,
    }));
    const result = await replaceGroupItems(id, items);
    const next = result.map(item => ({
      targetType: item.targetType,
      targetId: item.targetId,
      displayOrder: item.displayOrder,
    }));
    if (JSON.stringify(previous) !== JSON.stringify(next)) {
      void logAuditEvent({
        contentType: "content_group",
        contentId: id,
        action: "reorder",
        performedBy: callerId,
        previousState: { items: previous },
        newState: { items: next },
      });
    }
    res.json({ items: result });
  } catch (err: unknown) {
    const typed = err as Error & { status?: number };
    if (typed.status === 400 || typed.status === 404) {
      res.status(typed.status).json({ error: typed.message });
      return;
    }
    logger.error({ err }, "PUT /content-groups/:id/items failed");
    res.status(500).json({ error: "Failed to replace group items" });
  }
});

export default router;
