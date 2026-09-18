import { Router, type Request, type Response } from "express";
import { pool } from "@workspace/db";
import { requireAuth } from "../emmaus/auth.js";
import { isAdmin } from "../lib/user-role-store.js";
import { logAuditEvent, type AuditContentType } from "../lib/audit-log.js";
import { logger } from "../lib/logger.js";

type ResourceType =
  | "sermon"
  | "collection"
  | "journey"
  | "devotional-series"
  | "devotional-entry"
  | "devotional-entry-group";

type ResourceConfig = {
  table: string;
  idType: "uuid" | "text";
  contentType: AuditContentType;
  scope: "none" | "series" | "collection" | "standalone" | "library";
  where: string;
};

const CONFIGS: Record<ResourceType, ResourceConfig> = {
  sermon: {
    table: "sermons",
    idType: "uuid",
    contentType: "sermon",
    scope: "none",
    where: "status <> 'Archived'",
  },
  collection: {
    table: "collections",
    idType: "uuid",
    contentType: "journey_collection",
    scope: "none",
    where: "status <> 'Archived'",
  },
  journey: {
    table: "journeys",
    idType: "text",
    contentType: "journey",
    scope: "library",
    where: "journey_type NOT IN ('daily-rhythm', 'companion') AND deleted_at IS NULL AND status <> 'Archived'",
  },
  "devotional-series": {
    table: "devotional_series",
    idType: "uuid",
    contentType: "devotional_series",
    scope: "none",
    where: "status <> 'Archived'",
  },
  "devotional-entry": {
    table: "devotional_entries",
    idType: "uuid",
    contentType: "devotional_entry",
    scope: "series",
    where: "status <> 'Archived'",
  },
  "devotional-entry-group": {
    table: "devotional_entry_groups",
    idType: "uuid",
    contentType: "devotional_entry_group",
    scope: "series",
    where: "status <> 'Archived'",
  },
};

function isResourceType(value: unknown): value is ResourceType {
  return typeof value === "string" && value in CONFIGS;
}

function parseIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 500) return null;
  const ids = value.map(id => typeof id === "string" ? id.trim() : "");
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) return null;
  return ids;
}

function idCast(config: ResourceConfig): string {
  return config.idType === "uuid" ? "::uuid" : "";
}

/**
 * All Content Studio order changes go through this route. The caller supplies
 * the complete order for one authoritative list; the server locks that list,
 * verifies scope and membership, normalizes positions to 0..n-1, and commits
 * the whole change in one transaction.
 */
const router = Router();

router.post("/admin/reorder", async (req: Request, res: Response) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  const resourceType = req.body?.resourceType;
  const orderedIds = parseIds(req.body?.orderedIds);
  const parentId = typeof req.body?.parentId === "string" ? req.body.parentId.trim() : undefined;
  const scope = req.body?.scope;
  if (!isResourceType(resourceType) || !orderedIds) {
    res.status(400).json({ error: "resourceType and a unique orderedIds array are required" });
    return;
  }

  const config = CONFIGS[resourceType];
  if (config.scope === "series" && !parentId) {
    res.status(400).json({ error: "parentId is required for this resource" });
    return;
  }
  if (resourceType === "journey" && scope !== "library" && scope !== "collection" && scope !== "standalone") {
    res.status(400).json({ error: "journey scope must be library, collection, or standalone" });
    return;
  }
  if (resourceType === "journey" && scope === "collection" && !parentId) {
    res.status(400).json({ error: "parentId is required for a collection journey list" });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const params: unknown[] = [];
    let where = config.where;
    if (config.scope === "series") {
      params.push(parentId);
      where += ` AND series_id = $${params.length}`;
    } else if (resourceType === "journey" && scope === "collection") {
      params.push(parentId);
      where += ` AND collection_id = $${params.length}`;
    } else if (resourceType === "journey" && scope === "standalone") {
      where += " AND collection_id IS NULL";
    }

    const rowsResult = await client.query(
      `SELECT id::text AS id, display_order AS "displayOrder"
         FROM ${config.table}
        WHERE ${where}
        ORDER BY display_order ASC NULLS LAST, id ASC
        FOR UPDATE`,
      params,
    );
    const currentIds = rowsResult.rows.map(row => String(row.id));
    const currentSet = new Set(currentIds);
    if (currentIds.length !== orderedIds.length || orderedIds.some(id => !currentSet.has(id))) {
      await client.query("ROLLBACK");
      res.status(409).json({
        error: "The list changed while you were editing. Refresh and try again.",
      });
      return;
    }

    const previousById = new Map(
      rowsResult.rows.map((row, index) => [String(row.id), {
        displayOrder: Number(row.displayOrder ?? 0),
        position: index,
      }]),
    );
    const changed = orderedIds.some((id, index) => previousById.get(id)?.position !== index);

    if (changed) {
      for (const [position, id] of orderedIds.entries()) {
        await client.query(
          `UPDATE ${config.table}
              SET display_order = $1, updated_at = NOW()
            WHERE id = $2${idCast(config)}`,
          [position, id],
        );
      }
    }

    await client.query("COMMIT");

    if (changed) {
      await Promise.all(orderedIds.map((id, position) => {
        const previous = previousById.get(id);
        if (!previous || previous.position === position) return Promise.resolve();
        return logAuditEvent({
          contentType: config.contentType,
          contentId: id,
          action: "reorder",
          performedBy: userId,
          previousState: {
            parentId: parentId ?? null,
            listScope: scope ?? config.scope,
            position: previous.position,
            displayOrder: previous.displayOrder,
          },
          newState: {
            parentId: parentId ?? null,
            listScope: scope ?? config.scope,
            position,
            displayOrder: position,
          },
        });
      }));
    }

    res.json({ orderedIds, changed });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    logger.error({ error, resourceType }, "content reorder failed");
    res.status(500).json({ error: "Could not save the order" });
  } finally {
    client.release();
  }
});

export default router;