/**
 * devotional-store.ts — DB operations for Daily Devotionals.
 *
 * Devotional series are completely separate from Journeys — no shared tables,
 * no enrolment counts, no overload logic. Scripture text is never stored here;
 * it is loaded dynamically by the client from the member's chosen translation.
 */

import { eq, and, asc, desc } from "drizzle-orm";
import { db } from "@workspace/db";
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
  data: Partial<Pick<DevotionalSeries, "title" | "description" | "seriesType" | "status">>,
  updatedBy?: string
): Promise<DevotionalSeries | null> {
  const now = new Date();
  const publishedAt =
    data.status === "Published"
      ? now
      : data.status === "Draft" || data.status === "Archived"
        ? null
        : undefined;

  const [row] = await db
    .update(devotionalSeriesTable)
    .set({
      ...data,
      ...(publishedAt !== undefined ? { publishedAt } : {}),
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
  const [row] = await db
    .insert(devotionalProgressTable)
    .values({
      userId,
      seriesId,
      currentDay: 1,
      completedDays: [],
    })
    .onConflictDoNothing()
    .returning();

  if (row) return row;

  // Already started — return existing progress
  const existing = await getProgress(userId, seriesId);
  return existing!;
}

export async function markDayComplete(
  userId: string,
  seriesId: string,
  day: number
): Promise<DevotionalProgress> {
  const existing = await getProgress(userId, seriesId);
  const completed = existing?.completedDays ?? [];
  const newCompleted = completed.includes(day) ? completed : [...completed, day];
  const newCurrentDay = day + 1;

  const [row] = await db
    .insert(devotionalProgressTable)
    .values({
      userId,
      seriesId,
      currentDay: newCurrentDay,
      completedDays: newCompleted,
    })
    .onConflictDoUpdate({
      target: [devotionalProgressTable.userId, devotionalProgressTable.seriesId],
      set: {
        currentDay: newCurrentDay,
        completedDays: newCompleted,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}
