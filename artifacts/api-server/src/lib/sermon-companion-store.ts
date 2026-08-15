/**
 * sermon-companion-store.ts — PostgreSQL CRUD for sermon companion tables.
 *
 * Sermon companions are AI-generated 5-day devotionals linked to a sermon.
 * All new records start as Draft; publishing requires admin action.
 */

import { db, pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanionEntry {
  id: string;
  companionId: string;
  dayNumber: number;
  title: string;
  scriptureReference: string;
  /** Stores the "From the Sermon" idea (what the preacher actually said). */
  greeting: string;
  reflection: string;
  prayer: string;
  nextStep: string;
  closing: string;
  /** Timestamped YouTube URL linking to the relevant sermon segment. */
  sermonLink: string;
  /** Optional share image — object-storage path ("/objects/…"). Members see a "Take this with you" card. */
  shareImageUrl?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Companion {
  id: string;
  sermonId: string;
  /** Canonical sermon UUID (sermons.id) — null when companion was created before the sermons table existed. */
  sermonUuid?: string | null;
  title: string;
  /** Admin-authored companion-level introduction shown at the top of the member overview. */
  description: string;
  numberOfDays: number;
  status: string;
  isCurrentWeek: boolean;
  publishedAt: string | null;
  /** Set when admin opts-in to notifying members on publish (Smart Content Indicators). */
  notifyPublishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  entries?: CompanionEntry[];
}

export interface CompanionProgress {
  id: string;
  userId: string;
  companionId: string;
  currentDay: number;
  completedDays: number[];
  startedAt: string;
  updatedAt: string;
  /** Engagement lifecycle status — active | paused */
  status: string;
  /** Set when the member opens the content — used for UPDATED badge computation. */
  lastOpenedAt?: string | null;
}

// ─── Companion CRUD ───────────────────────────────────────────────────────────

export async function createCompanion(data: {
  sermonId: string;
  /** Optional canonical UUID FK — set to link companion.sermon_uuid to sermons.id */
  sermonUuid?: string;
  title: string;
  numberOfDays?: number;
  entries: Array<Omit<CompanionEntry, 'id' | 'companionId' | 'createdAt' | 'updatedAt' | 'status'> & { status?: string }>;
}): Promise<Companion & { entries: CompanionEntry[] }> {
  const id = randomUUID();
  const now = new Date().toISOString();
  const entryRows: CompanionEntry[] = [];

  // Use a single transaction so companion header + all entries succeed or fail together.
  // An orphan companion header (entries missing) or partial entries list would corrupt
  // the reading experience and is impossible to recover without manual intervention.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `INSERT INTO sermon_companion (id, sermon_id, sermon_uuid, title, number_of_days, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Draft', NOW(), NOW())`,
      [id, data.sermonId, data.sermonUuid ?? null, data.title, data.numberOfDays ?? 5]
    );

    for (const entry of data.entries) {
      const eid = randomUUID();
      await client.query(
        `INSERT INTO sermon_companion_entry
           (id, companion_id, day_number, title, scripture_reference, greeting, reflection, prayer, next_step, closing, sermon_link, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'Draft',NOW(),NOW())`,
        [eid, id, entry.dayNumber, entry.title, entry.scriptureReference ?? '',
         entry.greeting ?? '', entry.reflection ?? '', entry.prayer ?? '',
         entry.nextStep ?? '', entry.closing ?? '', entry.sermonLink ?? '']
      );
      entryRows.push({
        id: eid,
        companionId: id,
        dayNumber: entry.dayNumber,
        title: entry.title,
        scriptureReference: entry.scriptureReference ?? '',
        greeting: entry.greeting ?? '',
        reflection: entry.reflection ?? '',
        prayer: entry.prayer ?? '',
        nextStep: entry.nextStep ?? '',
        closing: entry.closing ?? '',
        sermonLink: entry.sermonLink ?? '',
        status: 'Draft',
        createdAt: now,
        updatedAt: now,
      });
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  return {
    id,
    sermonId: data.sermonId,
    title: data.title,
    description: '',
    numberOfDays: data.numberOfDays ?? 5,
    status: 'Draft',
    isCurrentWeek: false,
    publishedAt: null,
    createdAt: now,
    updatedAt: now,
    entries: entryRows,
  };
}

/**
 * Hard-delete a companion and all its entries (cascade).
 * Used as a compensating transaction when sermon persistence fails after companion creation.
 */
export async function deleteCompanion(companionId: string): Promise<void> {
  // Entries reference companion via foreign key — delete them first to avoid
  // constraint violations on DBs without ON DELETE CASCADE configured.
  await pool.query(`DELETE FROM sermon_companion_entry WHERE companion_id = $1`, [companionId]);
  await pool.query(`DELETE FROM sermon_companion WHERE id = $1`, [companionId]);
}

// ─── UUID helpers ─────────────────────────────────────────────────────────────

function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

// ─── Canonical delete service ─────────────────────────────────────────────────

export type CompanionStorageType = "legacy" | "current" | "sermon-only";

export interface DeleteSermonCompanionResult {
  storageType: CompanionStorageType;
  sermonId: string | null;
  companionId: string | null;
  legacyJourneyId: string | null;
}

/**
 * Delete a sermon companion and all associated data.
 *
 * Handles two storage models:
 *   - "legacy"  — companion is a Journey record (journeys table, slug ID, journeyType='companion')
 *   - "current" — companion is a Sermon Companion record (sermon_companion table, UUID)
 *
 * The admin-sermon JSON record is deleted best-effort (may not exist for legacy sermons).
 * PostgreSQL deletes are wrapped in a transaction; the JSON delete is outside it.
 *
 * Throws on unrecoverable DB errors so callers can roll back and surface a clean error.
 */
export async function deleteSermonCompanionContent({
  sermonId,
  companionJourneyId,
}: {
  sermonId: string | null;
  companionJourneyId: string | null;
}): Promise<DeleteSermonCompanionResult> {
  // ── Legacy model: companion is a journey record (slug, not UUID) ─────────────
  if (companionJourneyId && !isUUID(companionJourneyId)) {
    logger.info(
      { sermonId, legacyJourneyId: companionJourneyId },
      "delete-sermon-companion: legacy path — deleting from journeys table",
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // step_reflections has no FK cascade on journey_id — must be removed first
      await client.query(
        "DELETE FROM step_reflections WHERE journey_id = $1",
        [companionJourneyId],
      );

      // journeys DELETE cascades to journey_steps and user_journey_progress
      const result = await client.query(
        "DELETE FROM journeys WHERE id = $1 AND journey_type = 'companion' RETURNING id",
        [companionJourneyId],
      );

      if (result.rowCount === 0) {
        // Journey already gone — not a hard error; the companion was never there
        // or was already cleaned up. Log a warning and commit the empty transaction.
        logger.warn(
          { legacyJourneyId: companionJourneyId },
          "delete-sermon-companion: legacy journey not found (already absent) — treating as success",
        );
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    // Delete admin-sermon JSON record — best-effort, may not exist for legacy sermons
    if (sermonId) {
      const { deleteAdminSermon } = await import("./admin-sermon-store.js");
      await deleteAdminSermon(sermonId).catch(e =>
        logger.warn({ err: e, sermonId }, "delete-sermon-companion: admin-sermon JSON delete skipped (not found)"),
      );
    }

    return {
      storageType: "legacy",
      sermonId,
      companionId: null,
      legacyJourneyId: companionJourneyId,
    };
  }

  // ── Current model: companion is in sermon_companion table (UUID) ──────────────
  if (companionJourneyId && isUUID(companionJourneyId)) {
    logger.info(
      { sermonId, companionId: companionJourneyId },
      "delete-sermon-companion: current path — deleting from sermon_companion table",
    );

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      // Progress has no FK cascade — must be explicitly removed first
      await client.query(
        "DELETE FROM sermon_companion_progress WHERE companion_id = $1",
        [companionJourneyId],
      );
      await client.query(
        "DELETE FROM sermon_companion_entry WHERE companion_id = $1",
        [companionJourneyId],
      );
      await client.query(
        "DELETE FROM sermon_companion WHERE id = $1",
        [companionJourneyId],
      );
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }

    if (sermonId) {
      const { deleteAdminSermon } = await import("./admin-sermon-store.js");
      await deleteAdminSermon(sermonId);
    }

    return {
      storageType: "current",
      sermonId,
      companionId: companionJourneyId,
      legacyJourneyId: null,
    };
  }

  // ── No companion — just delete the sermon JSON record ─────────────────────────
  if (sermonId) {
    const { deleteAdminSermon } = await import("./admin-sermon-store.js");
    await deleteAdminSermon(sermonId);
  }

  return {
    storageType: "sermon-only",
    sermonId,
    companionId: null,
    legacyJourneyId: null,
  };
}

export async function getCompanionBySermonId(sermonId: string): Promise<(Companion & { entries: CompanionEntry[] }) | null> {
  const res = await pool.query(
    `SELECT * FROM sermon_companion WHERE sermon_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [sermonId]
  );
  if (!res.rows[0]) return null;
  const companion = rowToCompanion(res.rows[0]);
  const entries = await getEntriesForCompanion(companion.id);
  return { ...companion, entries };
}

export async function getCompanionById(id: string): Promise<(Companion & { entries: CompanionEntry[] }) | null> {
  const res = await pool.query(`SELECT * FROM sermon_companion WHERE id = $1`, [id]);
  if (!res.rows[0]) return null;
  const companion = rowToCompanion(res.rows[0]);
  const entries = await getEntriesForCompanion(companion.id);
  return { ...companion, entries };
}

const ALLOWED_COMPANION_STATUSES = ["Draft", "Published", "Archived"] as const;
type CompanionStatus = typeof ALLOWED_COMPANION_STATUSES[number];

export async function updateCompanion(
  id: string,
  patch: { title?: string; description?: string; status?: CompanionStatus }
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  if (patch.title !== undefined) { sets.push(`title = $${idx++}`); vals.push(patch.title); }
  if (patch.description !== undefined) { sets.push(`description = $${idx++}`); vals.push(patch.description); }
  if (patch.status !== undefined) {
    if (!ALLOWED_COMPANION_STATUSES.includes(patch.status)) {
      throw new Error(`Invalid status: ${patch.status}`);
    }
    sets.push(`status = $${idx++}`);
    vals.push(patch.status);
    // Set published_at the first time the companion is published; never clear it on unpublish.
    if (patch.status === 'Published') {
      sets.push(`published_at = COALESCE(published_at, NOW())`);
    }
  }
  if (!sets.length) return;
  sets.push(`updated_at = NOW()`);
  vals.push(id);
  await pool.query(`UPDATE sermon_companion SET ${sets.join(', ')} WHERE id = $${idx}`, vals);
}

// ─── Entry CRUD ───────────────────────────────────────────────────────────────

export async function getEntriesForCompanion(companionId: string): Promise<CompanionEntry[]> {
  const res = await pool.query(
    `SELECT * FROM sermon_companion_entry WHERE companion_id = $1 ORDER BY day_number ASC`,
    [companionId]
  );
  return res.rows.map(rowToEntry);
}

const ALLOWED_ENTRY_STATUSES = ["Draft", "Published", "Archived"] as const;

export async function updateEntry(
  companionId: string,
  dayNumber: number,
  patch: Partial<Omit<CompanionEntry, 'id' | 'companionId' | 'dayNumber' | 'createdAt' | 'updatedAt'>>
): Promise<CompanionEntry | null> {
  // Validate status allowlist before touching the DB
  if (patch.status !== undefined && !ALLOWED_ENTRY_STATUSES.includes(patch.status as typeof ALLOWED_ENTRY_STATUSES[number])) {
    throw new Error(`Invalid entry status: ${patch.status}. Must be one of: ${ALLOWED_ENTRY_STATUSES.join(", ")}`);
  }

  const fields: Record<string, unknown> = {};
  const colMap: Record<string, string> = {
    title: 'title',
    scriptureReference: 'scripture_reference',
    greeting: 'greeting',
    reflection: 'reflection',
    prayer: 'prayer',
    nextStep: 'next_step',
    closing: 'closing',
    sermonLink: 'sermon_link',
    shareImageUrl: 'share_image_url',
    status: 'status',
  };

  for (const [k, col] of Object.entries(colMap)) {
    // Only include fields that are explicitly set (skip undefined — an
    // undefined value means the client didn't send that field, and updating
    // the column to NULL would violate the NOT NULL constraint on status).
    const val = (patch as Record<string, unknown>)[k];
    if (k in patch && val !== undefined) fields[col] = val;
  }

  if (!Object.keys(fields).length) return null;

  const sets = Object.keys(fields).map((col, i) => `${col} = $${i + 1}`);
  sets.push(`updated_at = NOW()`);
  const vals = [...Object.values(fields), companionId, dayNumber];

  const res = await pool.query(
    `UPDATE sermon_companion_entry SET ${sets.join(', ')}
     WHERE companion_id = $${vals.length - 1} AND day_number = $${vals.length}
     RETURNING *`,
    vals
  );
  return res.rows[0] ? rowToEntry(res.rows[0]) : null;
}

// ─── Progress CRUD ────────────────────────────────────────────────────────────

export async function getProgressForUser(userId: string, companionId: string): Promise<CompanionProgress | null> {
  const res = await pool.query(
    `SELECT * FROM sermon_companion_progress WHERE user_id = $1 AND companion_id = $2`,
    [userId, companionId]
  );
  return res.rows[0] ? rowToProgress(res.rows[0]) : null;
}

export async function startCompanion(userId: string, companionId: string): Promise<CompanionProgress> {
  const res = await pool.query(
    // Include last_opened_at on creation so the badge is immediately cleared —
    // a member who begins a companion should not see UPDATED on reload.
    // On first visit: INSERT with last_opened_at = NOW() so no UPDATED badge fires.
    // On conflict (returning member): also update last_opened_at so the UPDATED badge
    // clears atomically when the reader loads, without relying on the fire-and-forget
    // dismissBadge call winning the race against /member/engagements.
    `INSERT INTO sermon_companion_progress
       (id, user_id, companion_id, current_day, completed_days, last_opened_at, started_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 1, '[]', NOW(), NOW(), NOW())
     ON CONFLICT (user_id, companion_id) DO UPDATE SET last_opened_at = NOW(), updated_at = NOW()
     RETURNING *`,
    [userId, companionId]
  );
  return rowToProgress(res.rows[0]);
}

export async function markDayComplete(userId: string, companionId: string, dayNumber: number): Promise<CompanionProgress | null> {
  const prog = await getProgressForUser(userId, companionId);
  if (!prog) return null;

  const completedDays = Array.from(new Set([...prog.completedDays, dayNumber]));
  const nextDay = dayNumber + 1;

  const res = await pool.query(
    `UPDATE sermon_companion_progress
     SET completed_days = $1::jsonb, current_day = $2, updated_at = NOW()
     WHERE user_id = $3 AND companion_id = $4
     RETURNING *`,
    [JSON.stringify(completedDays), nextDay, userId, companionId]
  );
  return res.rows[0] ? rowToProgress(res.rows[0]) : null;
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToCompanion(row: Record<string, unknown>): Companion {
  return {
    id: String(row.id),
    sermonId: String(row.sermon_id),
    sermonUuid: row.sermon_uuid != null ? String(row.sermon_uuid) : null,
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    numberOfDays: Number(row.number_of_days ?? 5),
    status: String(row.status ?? 'Draft'),
    isCurrentWeek: row.is_current_week === true || row.is_current_week === 'true',
    publishedAt: row.published_at ? String(row.published_at) : null,
    notifyPublishedAt: row.notify_published_at ? String(row.notify_published_at) : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

// ─── Batch publish helpers ─────────────────────────────────────────────────────

/**
 * Publish all entries belonging to a companion in a single UPDATE.
 * Called atomically from the publish endpoint so the companion and its entries
 * become visible to members at the same time.
 */
export async function publishAllEntries(companionId: string): Promise<void> {
  await pool.query(
    `UPDATE sermon_companion_entry
     SET status = 'Published', updated_at = NOW()
     WHERE companion_id = $1`,
    [companionId],
  );
}

/**
 * P2-12: Atomically publish the companion header AND all its entries in a single
 * transaction. Prevents the non-atomic two-call race where the header publishes
 * but the entry UPDATE fails, leaving members with a broken reading experience.
 */
export async function publishCompanionAtomic(id: string, notifyMembers = false): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE sermon_companion
       SET status = 'Published',
           published_at = COALESCE(published_at, NOW()),
           notify_published_at = CASE WHEN $2 THEN NOW() ELSE NULL END,
           updated_at = NOW()
       WHERE id = $1`,
      [id, notifyMembers],
    );
    await client.query(
      `UPDATE sermon_companion_entry
       SET status = 'Published', updated_at = NOW()
       WHERE companion_id = $1`,
      [id],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// ─── Member discovery ──────────────────────────────────────────────────────────

/**
 * Returns all Published companions that have at least one Published entry,
 * ordered by publication date descending (most-recent first).
 * Used by the member Next Steps endpoint.
 */
export async function listPublishedSermonCompanions(): Promise<
  Array<Companion & { publishedEntryCount: number }>
> {
  const res = await pool.query(`
    SELECT sc.*,
           COUNT(sce.id) FILTER (WHERE sce.status = 'Published') AS published_entry_count
    FROM   sermon_companion sc
    LEFT JOIN sermon_companion_entry sce ON sce.companion_id = sc.id
    WHERE  sc.status = 'Published'
    GROUP  BY sc.id
    HAVING COUNT(sce.id) FILTER (WHERE sce.status = 'Published') > 0
    ORDER  BY COALESCE(sc.published_at, sc.updated_at) DESC
  `);
  return res.rows.map(row => ({
    ...rowToCompanion(row),
    publishedEntryCount: Number(row.published_entry_count ?? 0),
  }));
}

/**
 * Atomically mark one companion as This Week's Sermon.
 * Clears is_current_week on all others in the same transaction.
 */
export async function setCurrentWeekCompanion(id: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE sermon_companion SET is_current_week = false, updated_at = NOW()
       WHERE is_current_week = true AND id != $1`,
      [id],
    );
    await client.query(
      `UPDATE sermon_companion SET is_current_week = true, updated_at = NOW()
       WHERE id = $1`,
      [id],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Return the single Published companion marked as This Week's Sermon,
 * with only its Published entries.
 *
 * Falls back to the most-recently-published companion when:
 *   • no companion has is_current_week = true (flag not yet set), OR
 *   • the is_current_week column does not yet exist in the DB (PostgreSQL
 *     error 42703: undefined_column — occurs before the startup migration runs).
 *
 * Returns null only when no Published companion exists at all.
 */
export async function getCurrentWeekPublicCompanion(): Promise<
  (Companion & { entries: CompanionEntry[] }) | null
> {
  // Try the canonical flag-based query first.
  try {
    const cRes = await pool.query(
      `SELECT * FROM sermon_companion
       WHERE is_current_week = true AND status = 'Published'
       LIMIT 1`,
    );
    if (cRes.rows[0]) {
      const companion = rowToCompanion(cRes.rows[0]);
      const eRes = await pool.query(
        `SELECT * FROM sermon_companion_entry
         WHERE companion_id = $1 AND status = 'Published'
         ORDER BY day_number ASC`,
        [companion.id],
      );
      return { ...companion, entries: eRes.rows.map(rowToEntry) };
    }
    // No companion explicitly flagged — fall through to most-recently-published.
  } catch (err: unknown) {
    const pg = err as { code?: string };
    if (pg?.code !== '42703') throw err; // unexpected error — re-throw
    // 42703 = undefined_column: is_current_week not yet added — fall through.
  }

  // Fallback: return the most recently published companion.
  const cRes = await pool.query(
    `SELECT * FROM sermon_companion
     WHERE status = 'Published'
     ORDER BY COALESCE(published_at, updated_at) DESC
     LIMIT 1`,
  );
  if (!cRes.rows[0]) return null;
  const companion = rowToCompanion(cRes.rows[0]);
  const eRes = await pool.query(
    `SELECT * FROM sermon_companion_entry
     WHERE companion_id = $1 AND status = 'Published'
     ORDER BY day_number ASC`,
    [companion.id],
  );
  return { ...companion, entries: eRes.rows.map(rowToEntry) };
}

/**
 * Fetch a single Published companion with only its Published entries.
 * Used by the member reading route — returns null when the companion is Draft
 * so unpublished content is never exposed to members.
 */
export async function getPublicCompanionById(
  id: string,
): Promise<(Companion & { entries: CompanionEntry[] }) | null> {
  const cRes = await pool.query(
    `SELECT * FROM sermon_companion WHERE id = $1 AND status = 'Published'`,
    [id],
  );
  if (!cRes.rows[0]) return null;
  const companion = rowToCompanion(cRes.rows[0]);
  const eRes = await pool.query(
    `SELECT * FROM sermon_companion_entry
     WHERE companion_id = $1 AND status = 'Published'
     ORDER BY day_number ASC`,
    [id],
  );
  return { ...companion, entries: eRes.rows.map(rowToEntry) };
}

/**
 * Return all sermon_companion_progress rows for a user, keyed by companionId.
 * Used to personalise the Next Steps response in bulk instead of N individual queries.
 */
export async function getAllSermonCompanionProgress(
  userId: string,
): Promise<Record<string, CompanionProgress>> {
  const res = await pool.query(
    `SELECT * FROM sermon_companion_progress WHERE user_id = $1`,
    [userId],
  );
  const result: Record<string, CompanionProgress> = {};
  for (const row of res.rows) {
    const p = rowToProgress(row);
    result[p.companionId] = p;
  }
  return result;
}

function rowToEntry(row: Record<string, unknown>): CompanionEntry {
  return {
    id: String(row.id),
    companionId: String(row.companion_id),
    dayNumber: Number(row.day_number),
    title: String(row.title ?? ''),
    scriptureReference: String(row.scripture_reference ?? ''),
    greeting: String(row.greeting ?? ''),
    reflection: String(row.reflection ?? ''),
    prayer: String(row.prayer ?? ''),
    nextStep: String(row.next_step ?? ''),
    closing: String(row.closing ?? ''),
    sermonLink: String(row.sermon_link ?? ''),
    shareImageUrl: row.share_image_url != null ? String(row.share_image_url) : null,
    status: String(row.status ?? 'Draft'),
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
  };
}

function rowToProgress(row: Record<string, unknown>): CompanionProgress {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    companionId: String(row.companion_id),
    currentDay: Number(row.current_day ?? 1),
    completedDays: Array.isArray(row.completed_days) ? row.completed_days as number[] : [],
    startedAt: String(row.started_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    status: String(row.status ?? 'active'),
    lastOpenedAt: row.last_opened_at ? String(row.last_opened_at) : null,
    // hidden_from_today is added via startup migration and must be mapped here
    // so the member/engagements route can correctly return hiddenFromToday.
    hidden_from_today: row.hidden_from_today === true || row.hidden_from_today === 'true',
  } as CompanionProgress & { hidden_from_today: boolean };
}

// ─── Engagement lifecycle ─────────────────────────────────────────────────────

export async function pauseCompanion(userId: string, companionId: string): Promise<void> {
  await pool.query(
    `UPDATE sermon_companion_progress
     SET status = 'paused', updated_at = NOW()
     WHERE user_id = $1 AND companion_id = $2`,
    [userId, companionId],
  );
}

export async function resumeCompanion(userId: string, companionId: string): Promise<void> {
  await pool.query(
    `UPDATE sermon_companion_progress
     SET status = 'active', updated_at = NOW()
     WHERE user_id = $1 AND companion_id = $2`,
    [userId, companionId],
  );
}

export async function removeCompanion(userId: string, companionId: string): Promise<void> {
  await pool.query(
    `DELETE FROM sermon_companion_progress
     WHERE user_id = $1 AND companion_id = $2`,
    [userId, companionId],
  );
}
