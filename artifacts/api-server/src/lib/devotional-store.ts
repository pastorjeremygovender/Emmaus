/**
 * devotional-store.ts — DB operations for Daily Devotionals.
 *
 * Devotional series are completely separate from Journeys — no shared tables,
 * no enrolment counts, no overload logic. Scripture text is never stored here;
 * it is loaded dynamically by the client from the member's chosen translation.
 */

import { eq, and, asc, desc, sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import {
  devotionalSeriesTable,
  devotionalEntriesTable,
  devotionalProgressTable,
} from "@workspace/db/schema";
import type {
  DevotionalSeries,
  DevotionalEntry,
  DevotionalProgress,
} from "@workspace/db/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

export type { DevotionalSeries, DevotionalEntry, DevotionalProgress };

export interface SeriesWithEntries extends DevotionalSeries {
  entries: DevotionalEntry[];
}

export interface SeriesWithProgress extends DevotionalSeries {
  progress: DevotionalProgress | null;
}

// ─── Series CRUD ─────────────────────────────────────────────────────────────

export async function listSeries(): Promise<DevotionalSeries[]> {
  return db
    .select()
    .from(devotionalSeriesTable)
    .where(and())
    .orderBy(desc(devotionalSeriesTable.createdAt));
}

export async function listPublishedSeries(): Promise<DevotionalSeries[]> {
  return db
    .select()
    .from(devotionalSeriesTable)
    .where(eq(devotionalSeriesTable.status, "Published"))
    .orderBy(asc(devotionalSeriesTable.title));
}

export async function getSeriesById(id: string): Promise<SeriesWithEntries | null> {
  const [series] = await db
    .select()
    .from(devotionalSeriesTable)
    .where(eq(devotionalSeriesTable.id, id));
  if (!series) return null;

  const entries = await db
    .select()
    .from(devotionalEntriesTable)
    .where(eq(devotionalEntriesTable.seriesId, id))
    .orderBy(asc(devotionalEntriesTable.dayNumber));

  return { ...series, entries };
}

export async function createSeries(
  data: { title: string; description?: string; seriesType?: string },
  createdBy?: string
): Promise<DevotionalSeries> {
  const [row] = await db
    .insert(devotionalSeriesTable)
    .values({
      title: data.title,
      description: data.description ?? "",
      seriesType: data.seriesType ?? "general",
      status: "Draft",
      createdBy: createdBy ?? null,
    })
    .returning();
  return row;
}

export async function updateSeries(
  id: string,
  data: Partial<Pick<DevotionalSeries, "title" | "description" | "seriesType" | "status">> & { notifyMembers?: boolean },
  updatedBy?: string
): Promise<DevotionalSeries | null> {
  const now = new Date();
  const publishedAt =
    data.status === "Published"
      ? now
      : data.status === "Draft" || data.status === "Archived"
        ? null
        : undefined;

  // notifyMembers=true  → set notify_published_at = now() (opt-in)
  // notifyMembers=false → clear notify_published_at = null (explicit opt-out)
  // notifyMembers absent → leave unchanged (undefined = no change in .set())
  const notifyPublishedAt =
    data.notifyMembers === true && data.status === "Published" ? now
    : data.notifyMembers === false && data.status === "Published" ? null
    : undefined;

  const { notifyMembers: _omit, ...rest } = data;

  const [row] = await db
    .update(devotionalSeriesTable)
    .set({
      ...rest,
      ...(publishedAt !== undefined ? { publishedAt } : {}),
      ...(notifyPublishedAt !== undefined ? { notifyPublishedAt } : {}),
      updatedAt: now,
    })
    .where(eq(devotionalSeriesTable.id, id))
    .returning();
  return row ?? null;
}

export async function deleteSeries(id: string): Promise<void> {
  await db
    .update(devotionalSeriesTable)
    .set({ status: "Archived", updatedAt: new Date() })
    .where(eq(devotionalSeriesTable.id, id));
}

export async function permanentDeleteSeries(id: string): Promise<void> {
  await db
    .delete(devotionalSeriesTable)
    .where(eq(devotionalSeriesTable.id, id));
}

// ─── Entry CRUD ───────────────────────────────────────────────────────────────

export async function upsertEntry(
  seriesId: string,
  dayNumber: number,
  data: Partial<
    Pick<
      DevotionalEntry,
      | "title"
      | "scriptureReference"
      | "greeting"
      | "considerThis"
      | "prayer"
      | "nextStep"
      | "closing"
      | "status"
    >
  >
): Promise<DevotionalEntry> {
  const now = new Date();
  const publishedAt =
    data.status === "Published"
      ? now
      : data.status === "Draft" || data.status === "Archived"
        ? null
        : undefined;

  const [row] = await db
    .insert(devotionalEntriesTable)
    .values({
      seriesId,
      dayNumber,
      title: data.title ?? "",
      scriptureReference: data.scriptureReference ?? "",
      greeting: data.greeting ?? "",
      considerThis: data.considerThis ?? "",
      prayer: data.prayer ?? "",
      nextStep: data.nextStep ?? "",
      closing: data.closing ?? "",
      status: data.status ?? "Draft",
      ...(publishedAt !== undefined ? { publishedAt } : {}),
    })
    .onConflictDoUpdate({
      target: [devotionalEntriesTable.seriesId, devotionalEntriesTable.dayNumber],
      set: {
        ...data,
        ...(publishedAt !== undefined ? { publishedAt } : {}),
        updatedAt: now,
      },
    })
    .returning();
  return row;
}

export async function deleteEntry(seriesId: string, dayNumber: number): Promise<void> {
  await db
    .delete(devotionalEntriesTable)
    .where(
      and(
        eq(devotionalEntriesTable.seriesId, seriesId),
        eq(devotionalEntriesTable.dayNumber, dayNumber)
      )
    );
}

// ─── Progress ─────────────────────────────────────────────────────────────────

export async function getProgress(
  userId: string,
  seriesId: string
): Promise<DevotionalProgress | null> {
  const [row] = await db
    .select()
    .from(devotionalProgressTable)
    .where(
      and(
        eq(devotionalProgressTable.userId, userId),
        eq(devotionalProgressTable.seriesId, seriesId)
      )
    );
  return row ?? null;
}

export async function getAllProgressForUser(userId: string): Promise<DevotionalProgress[]> {
  return db
    .select()
    .from(devotionalProgressTable)
    .where(eq(devotionalProgressTable.userId, userId));
}

export async function startSeries(
  userId: string,
  seriesId: string
): Promise<DevotionalProgress> {
  const now = new Date();
  const [row] = await db
    .insert(devotionalProgressTable)
    .values({
      userId,
      seriesId,
      currentDay: 1,
      completedDays: [],
      // Set lastOpenedAt on creation so the badge is immediately cleared —
      // a member who begins a devotional should not see UPDATED on reload.
      lastOpenedAt: now,
    })
    // On conflict: update lastOpenedAt atomically so any UPDATED badge clears
    // when the reader opens, even for returning members.
    .onConflictDoUpdate({
      target: [devotionalProgressTable.userId, devotionalProgressTable.seriesId],
      set: { lastOpenedAt: now, updatedAt: now },
    })
    .returning();

  return row;
}

// ─── Engagement lifecycle ─────────────────────────────────────────────────────

export async function pauseSeries(userId: string, seriesId: string): Promise<void> {
  await pool.query(
    `UPDATE devotional_progress
     SET status = 'paused', updated_at = NOW()
     WHERE user_id = $1 AND series_id = $2`,
    [userId, seriesId],
  );
}

export async function resumeSeries(userId: string, seriesId: string): Promise<void> {
  await pool.query(
    `UPDATE devotional_progress
     SET status = 'active', updated_at = NOW()
     WHERE user_id = $1 AND series_id = $2`,
    [userId, seriesId],
  );
}

export async function removeSeries(userId: string, seriesId: string): Promise<void> {
  await pool.query(
    `DELETE FROM devotional_progress
     WHERE user_id = $1 AND series_id = $2`,
    [userId, seriesId],
  );
}

export async function markDayComplete(
  userId: string,
  seriesId: string,
  day: number
): Promise<DevotionalProgress> {
  // P2-2: atomic upsert — avoids the read-then-write race where two concurrent
  // device completions of different days overwrite each other.  The SQL CASE
  // expression appends the day only when it is not already present, keeping the
  // operation idempotent.  currentDay is seeded at 1 and never incremented;
  // the available day is derived client-side from startedAt.
  const [row] = await db
    .insert(devotionalProgressTable)
    .values({
      userId,
      seriesId,
      currentDay: 1,
      completedDays: [day],
    })
    .onConflictDoUpdate({
      target: [devotionalProgressTable.userId, devotionalProgressTable.seriesId],
      set: {
        // completed_days is JSONB — use @> (contains) and || (concat) instead of
        // ANY/array_append which only work on native PostgreSQL array types.
        completedDays: sql`
          CASE WHEN NOT (${devotionalProgressTable.completedDays} @> to_jsonb(${day}::int))
          THEN ${devotionalProgressTable.completedDays} || to_jsonb(${day}::int)
          ELSE ${devotionalProgressTable.completedDays}
          END
        `,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}
