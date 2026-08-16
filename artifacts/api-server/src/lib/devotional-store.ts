/**
 * devotional-store.ts — DB operations for Daily Devotionals.
 *
 * Devotional series are completely separate from Journeys — no shared tables,
 * no enrolment counts, no overload logic. Scripture text is never stored here;
 * it is loaded dynamically by the client from the member's chosen translation.
 */

import { eq, and, asc, desc, sql, isNotNull } from "drizzle-orm";
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

// ─── Date-label inference ─────────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/** Parse "D Month" (e.g. "16 January") into a Date. Returns null if unrecognised. */
function parseDateLabel(label: string): Date | null {
  const parts = label.trim().split(/\s+/);
  if (parts.length < 2) return null;
  const day  = parseInt(parts[0], 10);
  const mIdx = MONTHS.indexOf(parts[1]);
  if (isNaN(day) || mIdx === -1) return null;
  // Year doesn't matter for offset arithmetic — use a fixed leap year.
  return new Date(2000, mIdx, day);
}

/** Format a Date as "D Month" (e.g. "16 January"). */
function formatDateLabel(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/**
 * If the series already has entries with date-format display labels, compute
 * and return the label for `dayNumber` by extrapolating from a reference entry.
 * Returns null when the series doesn't use date labels or the pattern is unrecognised.
 */
async function inferDisplayLabel(seriesId: string, dayNumber: number): Promise<string | null> {
  const [ref] = await db
    .select({
      dayNumber:    devotionalEntriesTable.dayNumber,
      displayLabel: devotionalEntriesTable.displayLabel,
    })
    .from(devotionalEntriesTable)
    .where(and(
      eq(devotionalEntriesTable.seriesId, seriesId),
      isNotNull(devotionalEntriesTable.displayLabel),
    ))
    .limit(1);

  if (!ref?.displayLabel) return null;
  const refDate = parseDateLabel(ref.displayLabel);
  if (!refDate) return null;

  const newDate = new Date(refDate);
  newDate.setDate(refDate.getDate() + (dayNumber - ref.dayNumber));
  return formatDateLabel(newDate);
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
      | "displayLabel"
      | "shareImageUrl"
      | "status"
    >
  >
): Promise<DevotionalEntry> {
  // Auto-infer a date label when the caller hasn't set one explicitly and the
  // series already uses date labels on other entries.
  if (data.displayLabel === undefined) {
    const inferred = await inferDisplayLabel(seriesId, dayNumber);
    if (inferred) data = { ...data, displayLabel: inferred };
  }

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
      ...(data.displayLabel !== undefined ? { displayLabel: data.displayLabel || null } : {}),
      ...(data.shareImageUrl !== undefined ? { shareImageUrl: data.shareImageUrl || null } : {}),
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

/**
 * Bulk-set display_label on multiple entries in one series.
 * Each entry in `labels` is { dayNumber, displayLabel } — pass null to clear.
 * Returns the number of entries that were actually updated.
 */
export async function bulkSetEntryDisplayLabels(
  seriesId: string,
  labels: Array<{ dayNumber: number; displayLabel: string | null }>
): Promise<number> {
  if (labels.length === 0) return 0;
  const now = new Date();
  let count = 0;
  for (const { dayNumber, displayLabel } of labels) {
    await db
      .update(devotionalEntriesTable)
      .set({ displayLabel: displayLabel ?? null, updatedAt: now })
      .where(
        and(
          eq(devotionalEntriesTable.seriesId, seriesId),
          eq(devotionalEntriesTable.dayNumber, dayNumber),
        )
      );
    count++;
  }
  if (count > 0) {
    await db.update(devotionalSeriesTable).set({ updatedAt: now }).where(eq(devotionalSeriesTable.id, seriesId));
  }
  return count;
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
  // Use raw SQL so hidden_from_today (added via startup migration) is included
  // in the result. Drizzle select() only returns schema-defined columns, and
  // hidden_from_today is not in the Drizzle schema yet to avoid a camelCase
  // vs snake_case naming conflict with the existing API contract.
  const res = await pool.query(
    `SELECT * FROM devotional_progress WHERE user_id = $1`,
    [userId],
  );
  // Map DB snake_case columns to the DevotionalProgress shape.
  // hidden_from_today passes through as-is (snake_case) because the client
  // and Walk.tsx both access it as progress.hidden_from_today.
  return res.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id),
    seriesId: String(row.series_id),
    currentDay: Number(row.current_day ?? 1),
    completedDays: Array.isArray(row.completed_days) ? row.completed_days : [],
    status: String(row.status ?? "active"),
    startedAt: row.started_at ? new Date(row.started_at) : new Date(),
    updatedAt: row.updated_at ? new Date(row.updated_at) : new Date(),
    lastOpenedAt: row.last_opened_at ? new Date(row.last_opened_at) : null,
    // Include the startup-migration column so Walk.tsx can filter hidden cards.
    hidden_from_today: row.hidden_from_today ?? false,
  })) as unknown as DevotionalProgress[];
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
  // operation idempotent.
  await db
    .insert(devotionalProgressTable)
    .values({
      userId,
      seriesId,
      currentDay: day,
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
    });

  // After completing a day, advance current_day to the next uncompleted
  // published entry so that server-side reads (analytics, pastoral signals,
  // admin views) always reflect the member's true position.
  // The subquery picks the lowest published day_number not already in
  // completed_days; COALESCE keeps the existing value when all days are done.
  const result = await pool.query<{
    id: string;
    user_id: string;
    series_id: string;
    current_day: number;
    completed_days: number[];
    status: string;
    started_at: Date;
    updated_at: Date;
    last_opened_at: Date | null;
  }>(
    `UPDATE devotional_progress dp
     SET current_day = COALESCE(
       (
         SELECT de.day_number
         FROM devotional_entries de
         WHERE de.series_id = $1
           AND de.status = 'Published'
           AND NOT (dp.completed_days @> to_jsonb(de.day_number::int))
         ORDER BY de.day_number ASC
         LIMIT 1
       ),
       dp.current_day
     ),
     updated_at = NOW()
     WHERE dp.user_id = $2 AND dp.series_id = $1
     RETURNING *`,
    [seriesId, userId],
  );

  const r = result.rows[0];
  // Map raw DB columns back to the DevotionalProgress shape.
  return {
    id: String(r.id),
    userId: String(r.user_id),
    seriesId: String(r.series_id),
    currentDay: Number(r.current_day),
    completedDays: Array.isArray(r.completed_days) ? r.completed_days : [],
    status: String(r.status ?? "active"),
    startedAt: r.started_at ? new Date(r.started_at) : new Date(),
    updatedAt: r.updated_at ? new Date(r.updated_at) : new Date(),
    lastOpenedAt: r.last_opened_at ? new Date(r.last_opened_at) : null,
  } as DevotionalProgress;
}
