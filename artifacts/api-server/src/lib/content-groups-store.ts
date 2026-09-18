/**
 * content-groups-store.ts — DB operations for Content Groups (Task #614).
 *
 * Content groups are a separate layer alongside Journey Collections. They support
 * many-to-many memberships for three target types:
 *   'journey'          – a Journey with journey_type ≠ 'daily-rhythm'
 *   'daily-rhythm'     – a Journey with journey_type = 'daily-rhythm'
 *   'daily-devotional' – a DevotionalSeries
 *
 * Delete a group removes only the group + membership rows — never content or progress.
 */

import { eq, and, asc, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  contentGroupsTable,
  contentGroupItemsTable,
  journeysTable,
  devotionalSeriesTable,
  devotionalEntriesTable,
} from "@workspace/db/schema";
import type {
  ContentGroup,
  ContentGroupItem,
  InsertContentGroup,
} from "@workspace/db/schema";

export type { ContentGroup, ContentGroupItem };

export const VALID_TARGET_TYPES = ["journey", "daily-rhythm", "daily-devotional"] as const;
export type TargetType = typeof VALID_TARGET_TYPES[number];

// ─── Public shapes ────────────────────────────────────────────────────────────

export interface ContentGroupSummary {
  id: string;
  title: string;
  description: string;
  coverImageUrl?: string;
  status: string;
  displayOrder: number;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentGroupItemRow {
  id: string;
  groupId: string;
  targetType: TargetType;
  targetId: string;
  displayOrder: number;
  createdAt: string;
}

export interface ContentGroupDetail extends ContentGroupSummary {
  items: ContentGroupItemRow[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toSummary(row: ContentGroup, itemCount = 0): ContentGroupSummary {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    coverImageUrl: row.coverImageUrl ?? undefined,
    status: row.status,
    displayOrder: row.displayOrder,
    itemCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toItemRow(row: ContentGroupItem): ContentGroupItemRow {
  return {
    id: row.id,
    groupId: row.groupId,
    targetType: row.targetType as TargetType,
    targetId: row.targetId,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

// ─── Target validation ────────────────────────────────────────────────────────

/**
 * Validate that a target exists and matches the declared type.
 * Throws a typed error with .status 400 or 404 when validation fails.
 */
export async function validateTarget(
  targetType: TargetType,
  targetId: string,
): Promise<void> {
  if (!VALID_TARGET_TYPES.includes(targetType)) {
    const e = new Error(
      `Invalid targetType "${targetType}". Must be one of: ${VALID_TARGET_TYPES.join(", ")}`,
    ) as Error & { status: number };
    e.status = 400;
    throw e;
  }

  if (targetType === "journey" || targetType === "daily-rhythm") {
    const rows = await db
      .select({
        id: journeysTable.id,
        journeyType: journeysTable.journeyType,
        status: journeysTable.status,
        deletedAt: journeysTable.deletedAt,
      })
      .from(journeysTable)
      .where(eq(journeysTable.id, targetId));

    if (!rows[0]) {
      const e = new Error(`Journey "${targetId}" not found`) as Error & { status: number };
      e.status = 404;
      throw e;
    }
    if (rows[0].status === "Archived" || rows[0].deletedAt) {
      const e = new Error(`Journey "${targetId}" is archived or deleted`) as Error & { status: number };
      e.status = 400;
      throw e;
    }

    const isDailyRhythm = rows[0].journeyType === "daily-rhythm";
    if (targetType === "daily-rhythm" && !isDailyRhythm) {
      const e = new Error(
        `Journey "${targetId}" has journeyType "${rows[0].journeyType}", not "daily-rhythm"`,
      ) as Error & { status: number };
      e.status = 400;
      throw e;
    }
    if (targetType === "journey" && isDailyRhythm) {
      const e = new Error(
        `Journey "${targetId}" is a daily-rhythm; use targetType "daily-rhythm" instead`,
      ) as Error & { status: number };
      e.status = 400;
      throw e;
    }
  } else {
    // daily-devotional
    const rows = await db
      .select({ id: devotionalSeriesTable.id, status: devotionalSeriesTable.status })
      .from(devotionalSeriesTable)
      .where(eq(devotionalSeriesTable.id, targetId));

    if (!rows[0]) {
      const e = new Error(`DevotionalSeries "${targetId}" not found`) as Error & { status: number };
      e.status = 404;
      throw e;
    }
    if (rows[0].status === "Archived") {
      const e = new Error(`DevotionalSeries "${targetId}" is archived`) as Error & { status: number };
      e.status = 400;
      throw e;
    }
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function listGroups(): Promise<ContentGroupSummary[]> {
  const groups = await db
    .select()
    .from(contentGroupsTable)
    .orderBy(asc(contentGroupsTable.displayOrder), asc(contentGroupsTable.createdAt));

  if (groups.length === 0) return [];

  const items = await db
    .select({ groupId: contentGroupItemsTable.groupId })
    .from(contentGroupItemsTable)
    .where(inArray(contentGroupItemsTable.groupId, groups.map(g => g.id)));

  const countMap: Record<string, number> = {};
  for (const item of items) {
    countMap[item.groupId] = (countMap[item.groupId] ?? 0) + 1;
  }

  return groups.map(g => toSummary(g, countMap[g.id] ?? 0));
}

export async function listPublishedGroups(): Promise<ContentGroupSummary[]> {
  const groups = await db
    .select()
    .from(contentGroupsTable)
    .where(eq(contentGroupsTable.status, "Published"))
    .orderBy(asc(contentGroupsTable.displayOrder), asc(contentGroupsTable.createdAt));

  if (groups.length === 0) return [];

  const items = await db
    .select({ groupId: contentGroupItemsTable.groupId })
    .from(contentGroupItemsTable)
    .where(inArray(contentGroupItemsTable.groupId, groups.map(g => g.id)));

  const countMap: Record<string, number> = {};
  for (const item of items) {
    countMap[item.groupId] = (countMap[item.groupId] ?? 0) + 1;
  }

  return groups.map(g => toSummary(g, countMap[g.id] ?? 0));
}

export async function getGroup(id: string): Promise<ContentGroupDetail | null> {
  const rows = await db
    .select()
    .from(contentGroupsTable)
    .where(eq(contentGroupsTable.id, id));

  if (!rows[0]) return null;

  const items = await db
    .select()
    .from(contentGroupItemsTable)
    .where(eq(contentGroupItemsTable.groupId, id))
    .orderBy(asc(contentGroupItemsTable.displayOrder), asc(contentGroupItemsTable.createdAt));

  return {
    ...toSummary(rows[0], items.length),
    items: items.map(toItemRow),
  };
}

/**
 * Member-safe read: returns only a Published group with eligible items.
 * Eligibility per type:
 *   journey / daily-rhythm  – journey.status = 'Published' (and not soft-deleted)
 *   daily-devotional        – series.status = 'Published' AND ≥1 published entry
 *
 * Optionally filters to a single targetType.
 */
export async function getPublishedGroupWithEligibleItems(
  id: string,
  typeFilter?: TargetType,
): Promise<ContentGroupDetail | null> {
  const rows = await db
    .select()
    .from(contentGroupsTable)
    .where(and(
      eq(contentGroupsTable.id, id),
      eq(contentGroupsTable.status, "Published"),
    ));

  if (!rows[0]) return null;

  let itemsQuery = db
    .select()
    .from(contentGroupItemsTable)
    .where(
      typeFilter
        ? and(
            eq(contentGroupItemsTable.groupId, id),
            eq(contentGroupItemsTable.targetType, typeFilter),
          )
        : eq(contentGroupItemsTable.groupId, id),
    )
    .orderBy(asc(contentGroupItemsTable.displayOrder), asc(contentGroupItemsTable.createdAt));

  const rawItems = await itemsQuery;

  // Filter to eligible items
  const eligible = await filterEligibleItems(rawItems);

  return {
    ...toSummary(rows[0], eligible.length),
    items: eligible.map(toItemRow),
  };
}

/**
 * Retrieve all groups a given content target belongs to.
 * Member-safe version: returns only Published groups.
 */
export async function getGroupsForTarget(
  targetType: TargetType,
  targetId: string,
  publishedOnly = false,
): Promise<ContentGroupSummary[]> {
  const memberships = await db
    .select({ groupId: contentGroupItemsTable.groupId })
    .from(contentGroupItemsTable)
    .where(and(
      eq(contentGroupItemsTable.targetType, targetType),
      eq(contentGroupItemsTable.targetId, targetId),
    ));

  if (memberships.length === 0) return [];

  const groupIds = memberships.map(m => m.groupId);
  const groupRows = await db
    .select()
    .from(contentGroupsTable)
    .where(
      and(
        inArray(contentGroupsTable.id, groupIds),
        ...(publishedOnly ? [eq(contentGroupsTable.status, "Published")] : []),
      ),
    )
    .orderBy(asc(contentGroupsTable.displayOrder), asc(contentGroupsTable.createdAt));

  return groupRows.map(g => toSummary(g));
}

// ─── Eligibility filter ───────────────────────────────────────────────────────

async function filterEligibleItems(items: ContentGroupItem[]): Promise<ContentGroupItem[]> {
  if (items.length === 0) return [];

  const journeyIds = items
    .filter(i => i.targetType === "journey" || i.targetType === "daily-rhythm")
    .map(i => i.targetId);
  const devotionalIds = items
    .filter(i => i.targetType === "daily-devotional")
    .map(i => i.targetId);

  const publishedJourneyIds = new Set<string>();
  if (journeyIds.length > 0) {
    const rows = await db
      .select({ id: journeysTable.id })
      .from(journeysTable)
      .where(and(
        inArray(journeysTable.id, journeyIds),
        eq(journeysTable.status, "Published"),
      ));
    rows.forEach(r => publishedJourneyIds.add(r.id));
  }

  const eligibleDevotionalIds = new Set<string>();
  if (devotionalIds.length > 0) {
    const publishedSeries = await db
      .select({ id: devotionalSeriesTable.id })
      .from(devotionalSeriesTable)
      .where(and(
        inArray(devotionalSeriesTable.id, devotionalIds),
        eq(devotionalSeriesTable.status, "Published"),
      ));

    // For each published series, check it has ≥1 published entry
    for (const s of publishedSeries) {
      const entries = await db
        .select({ id: devotionalEntriesTable.id })
        .from(devotionalEntriesTable)
        .where(and(
          eq(devotionalEntriesTable.seriesId, s.id),
          eq(devotionalEntriesTable.status, "Published"),
        ))
        .limit(1);
      if (entries.length > 0) eligibleDevotionalIds.add(s.id);
    }
  }

  return items.filter(item => {
    if (item.targetType === "journey" || item.targetType === "daily-rhythm") {
      return publishedJourneyIds.has(item.targetId);
    }
    if (item.targetType === "daily-devotional") {
      return eligibleDevotionalIds.has(item.targetId);
    }
    return false;
  });
}

// ─── Write ────────────────────────────────────────────────────────────────────

export async function createGroup(
  data: Pick<InsertContentGroup, "title" | "description" | "coverImageUrl" | "status" | "displayOrder">,
  userId?: string,
): Promise<ContentGroupSummary> {
  const rows = await db
    .insert(contentGroupsTable)
    .values({
      title: data.title,
      description: data.description ?? "",
      coverImageUrl: data.coverImageUrl ?? null,
      status: data.status ?? "Draft",
      displayOrder: data.displayOrder ?? 0,
      createdBy: userId ?? null,
      updatedBy: userId ?? null,
    })
    .returning();
  return toSummary(rows[0]);
}

export async function updateGroup(
  id: string,
  data: Partial<Pick<InsertContentGroup, "title" | "description" | "coverImageUrl" | "status" | "displayOrder">>,
  userId?: string,
): Promise<ContentGroupSummary | null> {
  const setValues: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedBy: userId ?? null,
  };
  if (data.title !== undefined) setValues.title = data.title;
  if (data.description !== undefined) setValues.description = data.description;
  if (data.coverImageUrl !== undefined) setValues.coverImageUrl = data.coverImageUrl ?? null;
  if (data.status !== undefined) setValues.status = data.status;
  if (data.displayOrder !== undefined) setValues.displayOrder = data.displayOrder;

  const rows = await db
    .update(contentGroupsTable)
    .set(setValues)
    .where(eq(contentGroupsTable.id, id))
    .returning();

  if (!rows[0]) return null;

  const items = await db
    .select({ groupId: contentGroupItemsTable.groupId })
    .from(contentGroupItemsTable)
    .where(eq(contentGroupItemsTable.groupId, id));

  return toSummary(rows[0], items.length);
}

export async function deleteGroup(id: string): Promise<boolean> {
  // Cascade delete via FK removes content_group_items automatically.
  // Content and progress are NEVER touched.
  const result = await db
    .delete(contentGroupsTable)
    .where(eq(contentGroupsTable.id, id))
    .returning();
  return result.length > 0;
}

// ─── Membership management ────────────────────────────────────────────────────

/**
 * Replace all memberships for a group in one atomic operation.
 * Each item must pass target validation before anything is written.
 * Items are ordered by their position in the supplied array (0-based displayOrder).
 */
export async function replaceGroupItems(
  groupId: string,
  items: Array<{ targetType: TargetType; targetId: string }>,
): Promise<ContentGroupItemRow[]> {
  if (new Set(items.map(item => `${item.targetType}:${item.targetId}`)).size !== items.length) {
    const e = new Error("A content item may appear only once in a group") as Error & { status: number };
    e.status = 400;
    throw e;
  }

  // Validate all targets before touching the DB
  for (const item of items) {
    await validateTarget(item.targetType, item.targetId);
  }

  const inserted = await db.transaction(async (tx) => {
    await tx
      .delete(contentGroupItemsTable)
      .where(eq(contentGroupItemsTable.groupId, groupId));

    if (items.length === 0) return [];

    const values = items.map((item, idx) => ({
      groupId,
      targetType: item.targetType,
      targetId: item.targetId,
      displayOrder: idx,
    }));

    return tx.insert(contentGroupItemsTable).values(values).returning();
  });

  return inserted
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map(toItemRow);
}

/**
 * Add a single item to a group (idempotent: updates displayOrder if already exists).
 */
export async function addGroupItem(
  groupId: string,
  targetType: TargetType,
  targetId: string,
  displayOrder?: number,
): Promise<ContentGroupItemRow> {
  await validateTarget(targetType, targetId);

  // Compute next displayOrder if not supplied
  let order = displayOrder;
  if (order === undefined) {
    const existing = await db
      .select({ displayOrder: contentGroupItemsTable.displayOrder })
      .from(contentGroupItemsTable)
      .where(eq(contentGroupItemsTable.groupId, groupId))
      .orderBy(asc(contentGroupItemsTable.displayOrder));
    order = existing.length > 0
      ? (existing[existing.length - 1]?.displayOrder ?? 0) + 1
      : 0;
  }

  const [row] = await db
    .insert(contentGroupItemsTable)
    .values({ groupId, targetType, targetId, displayOrder: order })
    .onConflictDoUpdate({
      target: [
        contentGroupItemsTable.groupId,
        contentGroupItemsTable.targetType,
        contentGroupItemsTable.targetId,
      ],
      set: { displayOrder: order },
    })
    .returning();

  return toItemRow(row);
}

/**
 * Remove a single item from a group.
 */
export async function removeGroupItem(
  groupId: string,
  targetType: TargetType,
  targetId: string,
): Promise<boolean> {
  const result = await db
    .delete(contentGroupItemsTable)
    .where(and(
      eq(contentGroupItemsTable.groupId, groupId),
      eq(contentGroupItemsTable.targetType, targetType),
      eq(contentGroupItemsTable.targetId, targetId),
    ))
    .returning();
  return result.length > 0;
}
