/**
 * pastoral-store.ts — PostgreSQL access layer for the Pastoral Care module.
 *
 * Covers: pastoral_persons, meeting_types, meeting_sessions,
 *         attendance_records, person_attendance_expectations, pastoral_audit_log.
 *
 * Church/tenant isolation: every query includes church_id = 'icc'.
 * All mutations are audit-logged via logPastoralAudit().
 */

import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";
import { logger } from "./logger.js";
import {
  detectSignals,
  ALL_RULES,
  type SignalCategory,
  type PersonContext,
  type RuleConfigMap,
} from "./care-signals-engine.js";

export const CHURCH_ID = "icc";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PersonType = "emmaus_user" | "pastoral_person";
export type AttendanceStatus = "present" | "visitor" | "apology" | "absent" | "not_expected";
export type SessionStatus = "scheduled" | "completed" | "cancelled";
export type Expectation = "expected" | "not_expected";

export interface PastoralPerson {
  id: string;
  churchId: string;
  fullName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  linkedUserId: string | null;
  personType: "attendance_only" | "visitor";
  notes: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingType {
  id: string;
  churchId: string;
  name: string;
  category: string;
  description: string;
  usualDay: string | null;
  usualTime: string | null;
  responsibleMinistry: string | null;
  isActive: boolean;
  trackAttendance: boolean;
  careSignalEnabled: boolean;
  isSensitive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingSession {
  id: string;
  churchId: string;
  meetingTypeId: string;
  meetingTypeName?: string;
  sessionDate: string;
  startTime: string | null;
  location: string;
  notes: string;
  status: SessionStatus;
  presentCount?: number;
  visitorCount?: number;
  apologyCount?: number;
  absentCount?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  churchId: string;
  sessionId: string;
  personId: string;
  personType: PersonType;
  status: AttendanceStatus;
  recordedBy: string;
  recordedAt: string;
  updatedBy: string | null;
  updatedAt: string;
  // Resolved display info
  personName?: string;
  personEmail?: string | null;
}

export interface AttendanceExpectation {
  id: string;
  churchId: string;
  personId: string;
  personType: PersonType;
  meetingTypeId: string;
  meetingTypeName?: string;
  expectation: Expectation;
  notes: string;
  createdBy: string;
  createdAt: string;
}

/** Unified person record returned by the combined people list */
export interface UnifiedPerson {
  id: string;           // pastoral_persons.id  OR  user_profiles.email (acting as id)
  sourceId: string;     // the raw id in its home table
  personType: PersonType;
  fullName: string;
  email: string | null;
  phone: string | null;
  linkedUserId: string | null;
  isLinked: boolean;
  subType: "emmaus_user" | "attendance_only" | "visitor";
  lastAttendanceDate: string | null;
  lastAttendanceStatus: string | null;
  openSignals?: number;
  churchId: string;
}

// ─── Row mappers ──────────────────────────────────────────────────────────────

function rowToPastoralPerson(r: Record<string, unknown>): PastoralPerson {
  return {
    id:            String(r.id),
    churchId:      String(r.church_id),
    fullName:      String(r.full_name ?? ""),
    displayName:   String(r.display_name ?? ""),
    email:         r.email != null ? String(r.email) : null,
    phone:         r.phone != null ? String(r.phone) : null,
    linkedUserId:  r.linked_user_id != null ? String(r.linked_user_id) : null,
    personType:    String(r.person_type) as PastoralPerson["personType"],
    notes:         String(r.notes ?? ""),
    isActive:      Boolean(r.is_active),
    createdBy:     String(r.created_by ?? ""),
    createdAt:     String(r.created_at),
    updatedAt:     String(r.updated_at),
  };
}

function rowToMeetingType(r: Record<string, unknown>): MeetingType {
  return {
    id:                  String(r.id),
    churchId:            String(r.church_id),
    name:                String(r.name ?? ""),
    category:            String(r.category ?? "general"),
    description:         String(r.description ?? ""),
    usualDay:            r.usual_day != null ? String(r.usual_day) : null,
    usualTime:           r.usual_time != null ? String(r.usual_time) : null,
    responsibleMinistry: r.responsible_ministry != null ? String(r.responsible_ministry) : null,
    isActive:            Boolean(r.is_active),
    trackAttendance:     Boolean(r.track_attendance),
    careSignalEnabled:   Boolean(r.care_signal_enabled),
    isSensitive:         Boolean(r.is_sensitive),
    createdBy:           String(r.created_by ?? ""),
    createdAt:           String(r.created_at),
    updatedAt:           String(r.updated_at),
  };
}

function rowToSession(r: Record<string, unknown>): MeetingSession {
  return {
    id:              String(r.id),
    churchId:        String(r.church_id),
    meetingTypeId:   String(r.meeting_type_id),
    meetingTypeName: r.meeting_type_name != null ? String(r.meeting_type_name) : undefined,
    sessionDate:     String(r.session_date).slice(0, 10),
    startTime:       r.start_time != null ? String(r.start_time) : null,
    location:        String(r.location ?? ""),
    notes:           String(r.notes ?? ""),
    status:          String(r.status) as SessionStatus,
    presentCount:    r.present_count != null ? Number(r.present_count) : undefined,
    visitorCount:    r.visitor_count != null ? Number(r.visitor_count) : undefined,
    apologyCount:    r.apology_count != null ? Number(r.apology_count) : undefined,
    absentCount:     r.absent_count != null ? Number(r.absent_count) : undefined,
    createdBy:       String(r.created_by ?? ""),
    createdAt:       String(r.created_at),
    updatedAt:       String(r.updated_at),
  };
}

function rowToAttendanceRecord(r: Record<string, unknown>): AttendanceRecord {
  return {
    id:          String(r.id),
    churchId:    String(r.church_id),
    sessionId:   String(r.session_id),
    personId:    String(r.person_id),
    personType:  String(r.person_type) as PersonType,
    status:      String(r.status) as AttendanceStatus,
    recordedBy:  String(r.recorded_by ?? ""),
    recordedAt:  String(r.recorded_at),
    updatedBy:   r.updated_by != null ? String(r.updated_by) : null,
    updatedAt:   String(r.updated_at),
    personName:  r.person_name != null ? String(r.person_name) : undefined,
    personEmail: r.person_email != null ? String(r.person_email) : null,
  };
}

// ─── Audit logging ────────────────────────────────────────────────────────────

export async function logPastoralAudit(entry: {
  entityType: string;
  entityId: string;
  action: string;
  personId?: string;
  sessionId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  changedBy: string;
  reason?: string;
}): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO pastoral_audit_log
         (church_id, entity_type, entity_id, action,
          person_id, session_id, previous_value, new_value,
          changed_by, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        CHURCH_ID,
        entry.entityType,
        entry.entityId,
        entry.action,
        entry.personId ?? null,
        entry.sessionId ?? null,
        entry.previousValue != null ? JSON.stringify(entry.previousValue) : null,
        entry.newValue != null ? JSON.stringify(entry.newValue) : null,
        entry.changedBy,
        entry.reason ?? "",
      ]
    );
  } catch (err) {
    logger.warn({ err }, "pastoral-store: audit log write failed (non-fatal)");
  }
}

// ─── Pastoral Persons ─────────────────────────────────────────────────────────

export async function listPastoralPersons(): Promise<PastoralPerson[]> {
  const res = await pool.query(
    `SELECT * FROM pastoral_persons
     WHERE church_id = $1 AND is_active = true
     ORDER BY full_name ASC`,
    [CHURCH_ID]
  );
  return res.rows.map(rowToPastoralPerson);
}

export async function getPastoralPerson(id: string): Promise<PastoralPerson | null> {
  const res = await pool.query(
    `SELECT * FROM pastoral_persons WHERE id = $1 AND church_id = $2`,
    [id, CHURCH_ID]
  );
  return res.rows[0] ? rowToPastoralPerson(res.rows[0]) : null;
}

export async function createPastoralPerson(data: {
  fullName: string;
  displayName?: string;
  email?: string;
  phone?: string;
  personType?: "attendance_only" | "visitor";
  notes?: string;
  createdBy: string;
}): Promise<PastoralPerson> {
  const id = randomUUID();
  const res = await pool.query(
    `INSERT INTO pastoral_persons
       (id, church_id, full_name, display_name, email, phone,
        person_type, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING *`,
    [
      id, CHURCH_ID,
      data.fullName,
      data.displayName ?? data.fullName,
      data.email ?? null,
      data.phone ?? null,
      data.personType ?? "attendance_only",
      data.notes ?? "",
      data.createdBy,
    ]
  );
  return rowToPastoralPerson(res.rows[0]);
}

export async function updatePastoralPerson(
  id: string,
  patch: Partial<{
    fullName: string;
    displayName: string;
    email: string;
    phone: string;
    personType: string;
    notes: string;
    isActive: boolean;
  }>
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  if (patch.fullName    !== undefined) { sets.push(`full_name = $${idx++}`);    vals.push(patch.fullName); }
  if (patch.displayName !== undefined) { sets.push(`display_name = $${idx++}`); vals.push(patch.displayName); }
  if (patch.email       !== undefined) { sets.push(`email = $${idx++}`);        vals.push(patch.email || null); }
  if (patch.phone       !== undefined) { sets.push(`phone = $${idx++}`);        vals.push(patch.phone || null); }
  if (patch.personType  !== undefined) { sets.push(`person_type = $${idx++}`);  vals.push(patch.personType); }
  if (patch.notes       !== undefined) { sets.push(`notes = $${idx++}`);        vals.push(patch.notes); }
  if (patch.isActive    !== undefined) { sets.push(`is_active = $${idx++}`);    vals.push(patch.isActive); }
  if (sets.length === 0) return;
  sets.push(`updated_at = NOW()`);
  vals.push(id, CHURCH_ID);
  await pool.query(
    `UPDATE pastoral_persons SET ${sets.join(", ")} WHERE id = $${idx++} AND church_id = $${idx++}`,
    vals
  );
}

/** Link a pastoral_person to an existing Emmaus user. Prevents double-linking. */
export async function linkPersonToUser(
  pastoralPersonId: string,
  linkedUserId: string,
  changedBy: string
): Promise<{ ok: boolean; error?: string }> {
  // Check no other pastoral_person already links this userId
  const existing = await pool.query(
    `SELECT id FROM pastoral_persons
     WHERE church_id = $1 AND linked_user_id = $2 AND id != $3`,
    [CHURCH_ID, linkedUserId, pastoralPersonId]
  );
  if (existing.rows.length > 0) {
    return { ok: false, error: "Another person record is already linked to this Emmaus account." };
  }
  const before = await getPastoralPerson(pastoralPersonId);
  await pool.query(
    `UPDATE pastoral_persons
     SET linked_user_id = $1, updated_at = NOW()
     WHERE id = $2 AND church_id = $3`,
    [linkedUserId, pastoralPersonId, CHURCH_ID]
  );
  await logPastoralAudit({
    entityType: "pastoral_person",
    entityId: pastoralPersonId,
    action: "link",
    personId: pastoralPersonId,
    previousValue: { linkedUserId: before?.linkedUserId },
    newValue: { linkedUserId },
    changedBy,
  });
  return { ok: true };
}

// ─── Unified People List ──────────────────────────────────────────────────────

/** Returns merged list of Emmaus users + pastoral_persons with last attendance info. */
export async function listUnifiedPeople(): Promise<UnifiedPerson[]> {
  // Emmaus users (from user_profiles)
  const emmausRes = await pool.query(
    `SELECT
       up.email,
       up.preferred_name,
       ar_latest.session_date  AS last_attendance_date,
       ar_latest.status        AS last_attendance_status,
       COALESCE(sig.open_count, 0) AS open_signals
     FROM user_profiles up
     LEFT JOIN LATERAL (
       SELECT ar.status, ms.session_date
       FROM attendance_records ar
       JOIN meeting_sessions ms ON ms.id = ar.session_id
       WHERE ar.person_id = up.email
         AND ar.person_type = 'emmaus_user'
         AND ar.church_id = $1
       ORDER BY ms.session_date DESC
       LIMIT 1
     ) ar_latest ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS open_count
       FROM care_signals cs
       WHERE cs.person_id = up.email
         AND cs.person_type = 'emmaus_user'
         AND cs.church_id = $1
         AND cs.dismissed_at IS NULL
         AND cs.auto_dismissed = false
     ) sig ON true
     ORDER BY COALESCE(up.preferred_name, up.email) ASC`,
    [CHURCH_ID]
  );

  // Attendance-only pastoral persons
  const pastoralRes = await pool.query(
    `SELECT
       pp.*,
       ar_latest.session_date  AS last_attendance_date,
       ar_latest.status        AS last_attendance_status,
       COALESCE(sig.open_count, 0) AS open_signals
     FROM pastoral_persons pp
     LEFT JOIN LATERAL (
       SELECT ar.status, ms.session_date
       FROM attendance_records ar
       JOIN meeting_sessions ms ON ms.id = ar.session_id
       WHERE ar.person_id = pp.id::text
         AND ar.person_type = 'pastoral_person'
         AND ar.church_id = $1
       ORDER BY ms.session_date DESC
       LIMIT 1
     ) ar_latest ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS open_count
       FROM care_signals cs
       WHERE cs.person_id = pp.id::text
         AND cs.person_type = 'pastoral_person'
         AND cs.church_id = $1
         AND cs.dismissed_at IS NULL
         AND cs.auto_dismissed = false
     ) sig ON true
     WHERE pp.church_id = $1 AND pp.is_active = true
     ORDER BY pp.full_name ASC`,
    [CHURCH_ID]
  );

  const emmausUsers: UnifiedPerson[] = emmausRes.rows.map((r) => ({
    id:                   String(r.email),
    sourceId:             String(r.email),
    personType:           "emmaus_user" as PersonType,
    fullName:             String(r.preferred_name ?? r.email ?? ""),
    email:                String(r.email),
    phone:                null,
    linkedUserId:         String(r.email),
    isLinked:             true,
    subType:              "emmaus_user" as const,
    lastAttendanceDate:   r.last_attendance_date ? String(r.last_attendance_date).slice(0, 10) : null,
    lastAttendanceStatus: r.last_attendance_status ? String(r.last_attendance_status) : null,
    openSignals:          Number(r.open_signals ?? 0),
    churchId:             CHURCH_ID,
  }));

  const pastoralPeople: UnifiedPerson[] = pastoralRes.rows.map((r) => ({
    id:                   String(r.id),
    sourceId:             String(r.id),
    personType:           "pastoral_person" as PersonType,
    fullName:             String(r.full_name ?? ""),
    email:                r.email != null ? String(r.email) : null,
    phone:                r.phone != null ? String(r.phone) : null,
    linkedUserId:         r.linked_user_id != null ? String(r.linked_user_id) : null,
    isLinked:             r.linked_user_id != null,
    subType:              String(r.person_type) as "attendance_only" | "visitor",
    lastAttendanceDate:   r.last_attendance_date ? String(r.last_attendance_date).slice(0, 10) : null,
    lastAttendanceStatus: r.last_attendance_status ? String(r.last_attendance_status) : null,
    openSignals:          Number(r.open_signals ?? 0),
    churchId:             CHURCH_ID,
  }));

  // Merge, de-duplicate linked persons (pastoral person with linked_user_id shadows the Emmaus user entry)
  const linkedUserIds = new Set(
    pastoralPeople
      .filter((p) => p.linkedUserId)
      .map((p) => p.linkedUserId!)
  );
  const dedupedEmmaus = emmausUsers.filter((u) => !linkedUserIds.has(u.sourceId));

  return [...dedupedEmmaus, ...pastoralPeople].sort((a, b) =>
    a.fullName.localeCompare(b.fullName)
  );
}

// ─── Meeting Types ────────────────────────────────────────────────────────────

export async function listMeetingTypes(includeInactive = false): Promise<MeetingType[]> {
  const res = await pool.query(
    `SELECT * FROM meeting_types
     WHERE church_id = $1 ${includeInactive ? "" : "AND is_active = true"}
     ORDER BY name ASC`,
    [CHURCH_ID]
  );
  return res.rows.map(rowToMeetingType);
}

export async function getMeetingType(id: string): Promise<MeetingType | null> {
  const res = await pool.query(
    `SELECT * FROM meeting_types WHERE id = $1 AND church_id = $2`,
    [id, CHURCH_ID]
  );
  return res.rows[0] ? rowToMeetingType(res.rows[0]) : null;
}

export async function createMeetingType(data: {
  name: string;
  category?: string;
  description?: string;
  usualDay?: string;
  usualTime?: string;
  responsibleMinistry?: string;
  trackAttendance?: boolean;
  careSignalEnabled?: boolean;
  isSensitive?: boolean;
  createdBy: string;
}): Promise<MeetingType> {
  const id = randomUUID();
  const res = await pool.query(
    `INSERT INTO meeting_types
       (id, church_id, name, category, description,
        usual_day, usual_time, responsible_ministry,
        track_attendance, care_signal_enabled, is_sensitive, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING *`,
    [
      id, CHURCH_ID,
      data.name,
      data.category ?? "general",
      data.description ?? "",
      data.usualDay ?? null,
      data.usualTime ?? null,
      data.responsibleMinistry ?? null,
      data.trackAttendance ?? true,
      data.careSignalEnabled ?? false,
      data.isSensitive ?? false,
      data.createdBy,
    ]
  );
  return rowToMeetingType(res.rows[0]);
}

export async function updateMeetingType(
  id: string,
  patch: Partial<Omit<MeetingType, "id" | "churchId" | "createdBy" | "createdAt" | "updatedAt">>
): Promise<void> {
  const map: Record<string, string> = {
    name: "name", category: "category", description: "description",
    usualDay: "usual_day", usualTime: "usual_time",
    responsibleMinistry: "responsible_ministry",
    isActive: "is_active", trackAttendance: "track_attendance",
    careSignalEnabled: "care_signal_enabled", isSensitive: "is_sensitive",
  };
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  for (const [k, col] of Object.entries(map)) {
    if ((patch as Record<string, unknown>)[k] !== undefined) {
      sets.push(`${col} = $${idx++}`);
      vals.push((patch as Record<string, unknown>)[k]);
    }
  }
  if (sets.length === 0) return;
  sets.push("updated_at = NOW()");
  vals.push(id, CHURCH_ID);
  await pool.query(
    `UPDATE meeting_types SET ${sets.join(", ")} WHERE id = $${idx++} AND church_id = $${idx++}`,
    vals
  );
}

// ─── Meeting Sessions ─────────────────────────────────────────────────────────

export async function listSessions(opts?: {
  meetingTypeId?: string;
  limit?: number;
}): Promise<MeetingSession[]> {
  const conditions: string[] = ["ms.church_id = $1"];
  const vals: unknown[] = [CHURCH_ID];
  let idx = 2;
  if (opts?.meetingTypeId) {
    conditions.push(`ms.meeting_type_id = $${idx++}`);
    vals.push(opts.meetingTypeId);
  }

  const res = await pool.query(
    `SELECT ms.*,
            mt.name AS meeting_type_name,
            COUNT(ar.id) FILTER (WHERE ar.status = 'present')      AS present_count,
            COUNT(ar.id) FILTER (WHERE ar.status = 'visitor')      AS visitor_count,
            COUNT(ar.id) FILTER (WHERE ar.status = 'apology')      AS apology_count,
            COUNT(ar.id) FILTER (WHERE ar.status = 'absent')       AS absent_count
     FROM meeting_sessions ms
     JOIN meeting_types mt ON mt.id = ms.meeting_type_id
     LEFT JOIN attendance_records ar ON ar.session_id = ms.id
     WHERE ${conditions.join(" AND ")}
     GROUP BY ms.id, mt.name
     ORDER BY ms.session_date DESC
     LIMIT $${idx}`,
    [...vals, opts?.limit ?? 100]
  );
  return res.rows.map(rowToSession);
}

export async function getSession(id: string): Promise<MeetingSession | null> {
  const res = await pool.query(
    `SELECT ms.*, mt.name AS meeting_type_name,
            COUNT(ar.id) FILTER (WHERE ar.status = 'present')  AS present_count,
            COUNT(ar.id) FILTER (WHERE ar.status = 'visitor')  AS visitor_count,
            COUNT(ar.id) FILTER (WHERE ar.status = 'apology')  AS apology_count,
            COUNT(ar.id) FILTER (WHERE ar.status = 'absent')   AS absent_count
     FROM meeting_sessions ms
     JOIN meeting_types mt ON mt.id = ms.meeting_type_id
     LEFT JOIN attendance_records ar ON ar.session_id = ms.id
     WHERE ms.id = $1 AND ms.church_id = $2
     GROUP BY ms.id, mt.name`,
    [id, CHURCH_ID]
  );
  return res.rows[0] ? rowToSession(res.rows[0]) : null;
}

export async function createSession(data: {
  meetingTypeId: string;
  sessionDate: string;
  startTime?: string;
  location?: string;
  notes?: string;
  createdBy: string;
}): Promise<MeetingSession> {
  const id = randomUUID();
  const res = await pool.query(
    `INSERT INTO meeting_sessions
       (id, church_id, meeting_type_id, session_date, start_time, location, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      id, CHURCH_ID,
      data.meetingTypeId,
      data.sessionDate,
      data.startTime ?? null,
      data.location ?? "",
      data.notes ?? "",
      data.createdBy,
    ]
  );
  return rowToSession(res.rows[0]);
}

export async function updateSession(
  id: string,
  patch: Partial<{
    sessionDate: string;
    startTime: string;
    location: string;
    notes: string;
    status: SessionStatus;
  }>
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  if (patch.sessionDate !== undefined) { sets.push(`session_date = $${idx++}`); vals.push(patch.sessionDate); }
  if (patch.startTime   !== undefined) { sets.push(`start_time = $${idx++}`);   vals.push(patch.startTime || null); }
  if (patch.location    !== undefined) { sets.push(`location = $${idx++}`);     vals.push(patch.location); }
  if (patch.notes       !== undefined) { sets.push(`notes = $${idx++}`);        vals.push(patch.notes); }
  if (patch.status      !== undefined) { sets.push(`status = $${idx++}`);       vals.push(patch.status); }
  if (sets.length === 0) return;
  sets.push("updated_at = NOW()");
  vals.push(id, CHURCH_ID);
  await pool.query(
    `UPDATE meeting_sessions SET ${sets.join(", ")} WHERE id = $${idx++} AND church_id = $${idx++}`,
    vals
  );
}

/** Returns the total number of attendance records for a session. */
export async function countAttendanceRecords(sessionId: string): Promise<number> {
  const res = await pool.query(
    `SELECT COUNT(*) AS n FROM attendance_records WHERE session_id = $1 AND church_id = $2`,
    [sessionId, CHURCH_ID]
  );
  return Number(res.rows[0]?.n ?? 0);
}
export async function getRegister(sessionId: string): Promise<AttendanceRecord[]> {
  const res = await pool.query(
    `SELECT ar.*,
            COALESCE(up.preferred_name, ar.person_id) AS person_name,
            up.email                                   AS person_email
     FROM attendance_records ar
     LEFT JOIN user_profiles up
       ON ar.person_type = 'emmaus_user' AND up.email = ar.person_id
     WHERE ar.session_id = $1 AND ar.church_id = $2
     ORDER BY person_name ASC`,
    [sessionId, CHURCH_ID]
  );
  return res.rows.map(rowToAttendanceRecord);
}

/** Upsert a single attendance record. Returns {created, previous}. */
export async function upsertAttendance(data: {
  sessionId: string;
  personId: string;
  personType: PersonType;
  status: AttendanceStatus;
  recordedBy: string;
  reason?: string;
}): Promise<{ created: boolean; previousStatus: string | null }> {
  // Check session is not cancelled
  const sess = await pool.query(
    `SELECT status FROM meeting_sessions WHERE id = $1 AND church_id = $2`,
    [data.sessionId, CHURCH_ID]
  );
  if (sess.rows[0]?.status === "cancelled") {
    throw new Error("Cannot record attendance for a cancelled session.");
  }

  const existing = await pool.query(
    `SELECT id, status FROM attendance_records
     WHERE session_id = $1 AND person_id = $2 AND person_type = $3`,
    [data.sessionId, data.personId, data.personType]
  );

  const previousStatus: string | null = existing.rows[0]?.status ?? null;

  if (existing.rows[0]) {
    // Update
    await pool.query(
      `UPDATE attendance_records
       SET status = $1, updated_by = $2, updated_at = NOW()
       WHERE session_id = $3 AND person_id = $4 AND person_type = $5`,
      [data.status, data.recordedBy, data.sessionId, data.personId, data.personType]
    );
    if (previousStatus !== data.status) {
      await logPastoralAudit({
        entityType: "attendance_record",
        entityId: existing.rows[0].id,
        action: "correct",
        personId: data.personId,
        sessionId: data.sessionId,
        previousValue: { status: previousStatus },
        newValue: { status: data.status },
        changedBy: data.recordedBy,
        reason: data.reason ?? "",
      });
    }
    return { created: false, previousStatus };
  } else {
    // Insert
    const id = randomUUID();
    await pool.query(
      `INSERT INTO attendance_records
         (id, church_id, session_id, person_id, person_type, status, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, CHURCH_ID, data.sessionId, data.personId, data.personType, data.status, data.recordedBy]
    );
    await logPastoralAudit({
      entityType: "attendance_record",
      entityId: id,
      action: "create",
      personId: data.personId,
      sessionId: data.sessionId,
      previousValue: null,
      newValue: { status: data.status },
      changedBy: data.recordedBy,
    });
    return { created: true, previousStatus: null };
  }
}

export async function deleteAttendanceRecord(
  sessionId: string,
  personId: string,
  personType: PersonType,
  deletedBy: string
): Promise<void> {
  const existing = await pool.query(
    `SELECT id, status FROM attendance_records
     WHERE session_id = $1 AND person_id = $2 AND person_type = $3`,
    [sessionId, personId, personType]
  );
  if (!existing.rows[0]) return;
  await pool.query(
    `DELETE FROM attendance_records
     WHERE session_id = $1 AND person_id = $2 AND person_type = $3`,
    [sessionId, personId, personType]
  );
  await logPastoralAudit({
    entityType: "attendance_record",
    entityId: existing.rows[0].id,
    action: "delete",
    personId,
    sessionId,
    previousValue: { status: existing.rows[0].status },
    newValue: null,
    changedBy: deletedBy,
  });
}

// ─── Attendance Expectations ──────────────────────────────────────────────────

export async function getExpectations(
  personId: string,
  personType: PersonType
): Promise<AttendanceExpectation[]> {
  const res = await pool.query(
    `SELECT ae.*, mt.name AS meeting_type_name
     FROM person_attendance_expectations ae
     JOIN meeting_types mt ON mt.id = ae.meeting_type_id
     WHERE ae.person_id = $1 AND ae.person_type = $2 AND ae.church_id = $3`,
    [personId, personType, CHURCH_ID]
  );
  return res.rows.map((r) => ({
    id:             String(r.id),
    churchId:       String(r.church_id),
    personId:       String(r.person_id),
    personType:     String(r.person_type) as PersonType,
    meetingTypeId:  String(r.meeting_type_id),
    meetingTypeName: r.meeting_type_name ? String(r.meeting_type_name) : undefined,
    expectation:    String(r.expectation) as Expectation,
    notes:          String(r.notes ?? ""),
    createdBy:      String(r.created_by ?? ""),
    createdAt:      String(r.created_at),
  }));
}

export async function setExpectation(data: {
  personId: string;
  personType: PersonType;
  meetingTypeId: string;
  expectation: Expectation;
  notes?: string;
  createdBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO person_attendance_expectations
       (church_id, person_id, person_type, meeting_type_id, expectation, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (person_id, person_type, meeting_type_id)
     DO UPDATE SET expectation = EXCLUDED.expectation,
                   notes = EXCLUDED.notes`,
    [CHURCH_ID, data.personId, data.personType, data.meetingTypeId,
     data.expectation, data.notes ?? "", data.createdBy]
  );
}

export async function removeExpectation(
  personId: string,
  personType: PersonType,
  meetingTypeId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM person_attendance_expectations
     WHERE person_id = $1 AND person_type = $2 AND meeting_type_id = $3 AND church_id = $4`,
    [personId, personType, meetingTypeId, CHURCH_ID]
  );
}

// ─── Person attendance history ────────────────────────────────────────────────

export async function getPersonAttendanceHistory(
  personId: string,
  personType: PersonType,
  limit = 50
): Promise<Array<{
  sessionId: string;
  sessionDate: string;
  meetingTypeName: string;
  status: AttendanceStatus;
  recordedAt: string;
  updatedAt: string;
}>> {
  const res = await pool.query(
    `SELECT ar.id, ar.status, ar.recorded_at, ar.updated_at,
            ms.id AS session_id, ms.session_date,
            mt.name AS meeting_type_name
     FROM attendance_records ar
     JOIN meeting_sessions ms ON ms.id = ar.session_id
     JOIN meeting_types mt ON mt.id = ms.meeting_type_id
     WHERE ar.person_id = $1
       AND ar.person_type = $2
       AND ar.church_id = $3
       AND ms.status != 'cancelled'
     ORDER BY ms.session_date DESC
     LIMIT $4`,
    [personId, personType, CHURCH_ID, limit]
  );
  return res.rows.map((r) => ({
    sessionId:       String(r.session_id),
    sessionDate:     String(r.session_date).slice(0, 10),
    meetingTypeName: String(r.meeting_type_name),
    status:          String(r.status) as AttendanceStatus,
    recordedAt:      String(r.recorded_at),
    updatedAt:       String(r.updated_at),
  }));
}
/**
 * Called when a session is marked 'completed'.
 *
 * For every person who has expectation='expected' for the session's meeting
 * type and whose attendance record is missing or shows 'absent', an
 * 'absence_alert' entry is written to pastoral_audit_log.
 *
 * No alert is generated when:
 *   • The meeting type has care_signal_enabled = false
 *   • The person's attendance record status is 'apology'
 *   • The person's attendance record status is 'not_expected'
 *   • The person's attendance record status is 'present' or 'visitor'
 *
 * Returns the list of personIds for whom an alert was generated.
 */
export async function generateAbsenceAlerts(
  sessionId: string,
  triggeredBy = "system"
): Promise<string[]> {
  // 1. Load the session + meeting type
  const sessRow = await pool.query(
    `SELECT ms.id, ms.meeting_type_id, mt.care_signal_enabled
     FROM meeting_sessions ms
     JOIN meeting_types mt ON mt.id = ms.meeting_type_id
     WHERE ms.id = $1 AND ms.church_id = $2`,
    [sessionId, CHURCH_ID]
  );
  if (!sessRow.rows[0]) return [];

  const { meeting_type_id: meetingTypeId, care_signal_enabled } = sessRow.rows[0] as {
    meeting_type_id: string;
    care_signal_enabled: boolean;
  };

  if (!care_signal_enabled) return [];

  // 2. Find all people expected at this meeting type
  const expRows = await pool.query(
    `SELECT person_id, person_type
     FROM person_attendance_expectations
     WHERE meeting_type_id = $1
       AND church_id = $2
       AND expectation = 'expected'`,
    [meetingTypeId, CHURCH_ID]
  );

  if (expRows.rows.length === 0) return [];

  // 3. Load all attendance records for this session in one query
  const arRows = await pool.query(
    `SELECT person_id, person_type, status
     FROM attendance_records
     WHERE session_id = $1 AND church_id = $2`,
    [sessionId, CHURCH_ID]
  );

  // Build a lookup keyed by "personId|personType"
  const attendanceMap = new Map<string, string>();
  for (const row of arRows.rows as { person_id: string; person_type: string; status: string }[]) {
    attendanceMap.set(`${row.person_id}|${row.person_type}`, row.status);
  }

  // 4. Determine who needs an alert
  const alerted: string[] = [];
  for (const exp of expRows.rows as { person_id: string; person_type: string }[]) {
    const key = `${exp.person_id}|${exp.person_type}`;
    const status = attendanceMap.get(key);

    // No alert for apologies or explicit 'not_expected' overrides
    if (status === "apology" || status === "not_expected" || status === "present" || status === "visitor") {
      continue;
    }

    // Alert: either absent record or no record at all
    const alertReason = status === "absent" ? "absent" : "no_record";

    await logPastoralAudit({
      entityType: "session",
      entityId: sessionId,
      action: "absence_alert",
      personId: exp.person_id,
      sessionId,
      previousValue: null,
      newValue: { reason: alertReason, personType: exp.person_type },
      changedBy: triggeredBy,
    });

    alerted.push(exp.person_id);
  }

  return alerted;
}
export type CareSignalTrigger = "missed_session";

export interface CareSignal {
  id: string;
  churchId: string;
  personId: string;
  personType: PersonType;
  personName?: string;
  trigger: CareSignalTrigger;
  sessionId: string;
  sessionDate?: string;
  meetingTypeName?: string;
  autoDismissed: boolean;
  dismissedAt: string | null;
  dismissedBy: string | null;
  createdAt: string;
  // Visit info (populated when a visit was scheduled and/or completed)
  visitDate?: string;
  visitReason?: string;
  visitScheduledAt?: string;
  visitCompleted: boolean;
  visitNote?: string;
  visitCompletedAt?: string | null;
}

function rowToCareSignal(r: Record<string, unknown>): CareSignal {
  // Parse JSON blobs written by scheduleVisit and completeVisit
  let visitDate: string | undefined;
  let visitReason: string | undefined;
  if (r.visit_scheduled_value != null) {
    try {
      const v = typeof r.visit_scheduled_value === "string"
        ? JSON.parse(r.visit_scheduled_value)
        : r.visit_scheduled_value;
      visitDate   = v?.visitDate  ?? undefined;
      visitReason = v?.reason     ?? undefined;
    } catch { /* non-fatal */ }
  }
  let visitNote: string | undefined;
  if (r.visit_completed_value != null) {
    try {
      const v = typeof r.visit_completed_value === "string"
        ? JSON.parse(r.visit_completed_value)
        : r.visit_completed_value;
      visitNote = v?.note ?? undefined;
    } catch { /* non-fatal */ }
  }

  return {
    id:              String(r.id),
    churchId:        String(r.church_id),
    personId:        String(r.person_id),
    personType:      String(r.person_type) as PersonType,
    personName:      r.person_name != null ? String(r.person_name) : undefined,
    trigger:         String(r.trigger) as CareSignalTrigger,
    sessionId:       String(r.session_id),
    sessionDate:     r.session_date != null ? String(r.session_date).slice(0, 10) : undefined,
    meetingTypeName: r.meeting_type_name != null ? String(r.meeting_type_name) : undefined,
    autoDismissed:   Boolean(r.auto_dismissed),
    dismissedAt:     r.dismissed_at != null ? String(r.dismissed_at) : null,
    dismissedBy:     r.dismissed_by != null ? String(r.dismissed_by) : null,
    createdAt:       String(r.created_at),
    visitDate,
    visitReason,
    visitScheduledAt: r.visit_scheduled_at != null ? String(r.visit_scheduled_at) : undefined,
    visitCompleted:   r.visit_completed_at != null,
    visitNote,
    visitCompletedAt: r.visit_completed_at != null ? String(r.visit_completed_at) : null,
  };
}

export async function getCareSignals(opts?: {
  includesDismissed?: boolean;
  withVisit?: boolean;
  personId?: string;
  personType?: PersonType;
  limit?: number;
}): Promise<CareSignal[]> {
  const conditions: string[] = ["cs.church_id = $1"];
  const vals: unknown[] = [CHURCH_ID];
  let idx = 2;

  if (opts?.withVisit) {
    // Show dismissed signals that have a completed visit record
    conditions.push("cs.dismissed_at IS NOT NULL");
    conditions.push("pal_done.id IS NOT NULL");
  } else if (!opts?.includesDismissed) {
    conditions.push("cs.dismissed_at IS NULL");
  }
  if (opts?.personId) {
    conditions.push(`cs.person_id = $${idx++}`);
    vals.push(opts.personId);
  }
  if (opts?.personType) {
    conditions.push(`cs.person_type = $${idx++}`);
    vals.push(opts.personType);
  }

  // Visit audit joins are only included for the withVisit (pastor-only) path.
  // This ensures visit notes are never fetched or serialized for recorder-accessible queries.
  const visitJoins = opts?.withVisit
    ? `LEFT JOIN pastoral_audit_log pal_sched
         ON pal_sched.entity_type = 'care_signal'
        AND pal_sched.action      = 'visit_scheduled'
        AND pal_sched.entity_id   = cs.id
        AND pal_sched.church_id   = $1
       LEFT JOIN pastoral_audit_log pal_done
         ON pal_done.entity_type = 'pastoral_visit'
        AND pal_done.action      = 'visit_completed'
        AND pal_done.entity_id   = pal_sched.id
        AND pal_done.church_id   = $1`
    : "";

  const visitColumns = opts?.withVisit
    ? `,
            pal_sched.new_value  AS visit_scheduled_value,
            pal_sched.changed_at AS visit_scheduled_at,
            pal_done.new_value   AS visit_completed_value,
            pal_done.changed_at  AS visit_completed_at`
    : "";

  const res = await pool.query(
    `SELECT cs.*,
            ms.session_date,
            mt.name AS meeting_type_name,
            COALESCE(
              pp.full_name,
              up.preferred_name,
              cs.person_id
            ) AS person_name${visitColumns}
     FROM care_signals cs
     JOIN meeting_sessions ms ON ms.id = cs.session_id
     JOIN meeting_types mt ON mt.id = ms.meeting_type_id
     LEFT JOIN pastoral_persons pp
       ON cs.person_type = 'pastoral_person' AND pp.id::text = cs.person_id
     LEFT JOIN user_profiles up
       ON cs.person_type = 'emmaus_user' AND up.email = cs.person_id
     ${visitJoins}
     WHERE ${conditions.join(" AND ")}
     ORDER BY ms.session_date DESC, person_name ASC
     LIMIT $${idx}`,
    [...vals, opts?.limit ?? 200]
  );
  return res.rows.map(rowToCareSignal);
}

/** Insert a care signal. Silently ignores duplicate (person+session). */
export async function createCareSignal(data: {
  personId: string;
  personType: PersonType;
  sessionId: string;
  trigger?: CareSignalTrigger;
}): Promise<CareSignal | null> {
  const id = randomUUID();
  const res = await pool.query(
    `INSERT INTO care_signals
       (id, church_id, person_id, person_type, trigger, session_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (person_id, person_type, session_id) DO NOTHING
     RETURNING id`,
    [
      id, CHURCH_ID,
      data.personId, data.personType,
      data.trigger ?? "missed_session",
      data.sessionId,
    ]
  );
  if (res.rows.length === 0) return null; // duplicate — no-op
  const created = await pool.query(
    `SELECT cs.*, ms.session_date, mt.name AS meeting_type_name
     FROM care_signals cs
     JOIN meeting_sessions ms ON ms.id = cs.session_id
     JOIN meeting_types mt ON mt.id = ms.meeting_type_id
     WHERE cs.id = $1`,
    [id]
  );
  return created.rows[0] ? rowToCareSignal(created.rows[0]) : null;
}

export async function dismissCareSignal(
  id: string,
  dismissedBy: string
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE care_signals
     SET dismissed_at = NOW(), dismissed_by = $1
     WHERE id = $2 AND church_id = $3 AND dismissed_at IS NULL
     RETURNING id`,
    [dismissedBy, id, CHURCH_ID]
  );
  if (res.rows.length > 0) {
    await logPastoralAudit({
      entityType: "care_signal",
      entityId: id,
      action: "dismiss",
      changedBy: dismissedBy,
    });
  }
  return res.rows.length > 0;
}

/**
 * Atomically transitions a session from 'scheduled' to 'completed'.
 *
 * Uses a conditional UPDATE (WHERE status = 'scheduled') so that only one
 * concurrent request can win the transition.  Returns `true` when this call
 * performed the transition; `false` when the session was already in any other
 * state (including 'completed' or 'cancelled').
 *
 * Callers should generate care signals only when `true` is returned.
 */
export async function tryCompleteSession(id: string): Promise<boolean> {
  const res = await pool.query(
    `UPDATE meeting_sessions
     SET status = 'completed', updated_at = NOW()
     WHERE id = $1 AND church_id = $2 AND status = 'scheduled'`,
    [id, CHURCH_ID]
  );
  return (res.rowCount ?? 0) > 0;
}
/**
 * For a single completed session, find every person with an 'expected' expectation
 * for that meeting type and no 'present', 'visitor', or 'apology' attendance record.
 * Creates one care_signal per missing person (skips duplicates and cancelled sessions).
 * Returns the count of newly-created signals.
 */
export async function generateCareSignals(sessionId: string): Promise<number> {
  // Validate session: must be completed, not cancelled, and care_signal_enabled on its type
  const sessRes = await pool.query(
    `SELECT ms.id, ms.status, ms.meeting_type_id, mt.care_signal_enabled
     FROM meeting_sessions ms
     JOIN meeting_types mt ON mt.id = ms.meeting_type_id
     WHERE ms.id = $1 AND ms.church_id = $2`,
    [sessionId, CHURCH_ID]
  );
  const sess = sessRes.rows[0];
  if (!sess) throw new Error("Session not found.");
  if (sess.status === "cancelled") return 0;
  if (!sess.care_signal_enabled) return 0;
  if (sess.status !== "completed") return 0;

  // Find everyone expected at this meeting type who has no present/visitor/apology record
  const expectedRes = await pool.query(
    `SELECT ae.person_id, ae.person_type
     FROM person_attendance_expectations ae
     WHERE ae.church_id = $1
       AND ae.meeting_type_id = $2
       AND ae.expectation = 'expected'
       AND NOT EXISTS (
         SELECT 1 FROM attendance_records ar
         WHERE ar.session_id = $3
           AND ar.person_id = ae.person_id
           AND ar.person_type = ae.person_type
           AND ar.status IN ('present','visitor','apology')
       )`,
    [CHURCH_ID, sess.meeting_type_id, sessionId]
  );

  let created = 0;
  for (const row of expectedRes.rows) {
    const signal = await createCareSignal({
      personId:   String(row.person_id),
      personType: String(row.person_type) as PersonType,
      sessionId,
    });
    if (signal !== null) created++;
  }
  return created;
}

/**
 * Schedule a follow-up visit for a care signal.
 *
 * Atomically claims the signal (single UPDATE … WHERE dismissed_at IS NULL RETURNING)
 * and writes the visit_scheduled audit entry inside one transaction, so concurrent
 * dismiss or double-schedule requests cannot produce duplicate or conflicting records.
 *
 * Returns false if the signal was not found or already dismissed.
 * Throws if visitDate is not a valid ISO calendar date (YYYY-MM-DD).
 */
export type ScheduleVisitOutcome = "ok" | "already_scheduled" | "not_found";
export async function scheduleVisit(data: {
  signalId: string;
  visitDate: string;   // must be YYYY-MM-DD
  reason: string;
  scheduledBy: string;
}): Promise<ScheduleVisitOutcome> {
  // Server-side date validation — must be a real YYYY-MM-DD calendar date.
  // We parse into UTC components and round-trip them back to catch overflow
  // dates like 2024-02-31 (which JS normalises to 2024-03-02 rather than throwing).
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.visitDate)) {
    throw new Error("visitDate must be a valid ISO calendar date (YYYY-MM-DD).");
  }
  const [yStr, mStr, dStr] = data.visitDate.split("-");
  const inputYear  = parseInt(yStr, 10);
  const inputMonth = parseInt(mStr, 10);
  const inputDay   = parseInt(dStr, 10);
  const utc = new Date(Date.UTC(inputYear, inputMonth - 1, inputDay));
  if (
    utc.getUTCFullYear()     !== inputYear  ||
    utc.getUTCMonth() + 1    !== inputMonth ||
    utc.getUTCDate()         !== inputDay
  ) {
    throw new Error("visitDate is not a valid calendar date.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Atomically dismiss the signal only if it is still open.
    // The WHERE dismissed_at IS NULL clause acts as the guard;
    // RETURNING gives us the person/session context without a prior SELECT.
    const claim = await client.query(
      `UPDATE care_signals
       SET dismissed_at = NOW(), dismissed_by = $1
       WHERE id = $2 AND church_id = $3 AND dismissed_at IS NULL
       RETURNING id, person_id, session_id`,
      [data.scheduledBy, data.signalId, CHURCH_ID]
    );

    if (claim.rows.length === 0) {
      await client.query("ROLLBACK");
      // Distinguish "already visit-scheduled" (idempotent double-submit) from
      // "not found or dismissed for another reason" by checking the audit log.
      const prior = await pool.query(
        `SELECT id FROM pastoral_audit_log
         WHERE entity_type = 'care_signal' AND entity_id = $1 AND action = 'visit_scheduled'
         LIMIT 1`,
        [data.signalId]
      );
      return prior.rows.length > 0 ? "already_scheduled" : "not_found";
    }

    const { person_id, session_id } = claim.rows[0] as Record<string, unknown>;

    // Write audit entry in the same transaction
    await client.query(
      `INSERT INTO pastoral_audit_log
         (church_id, entity_type, entity_id, action,
          person_id, session_id, previous_value, new_value,
          changed_by, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        CHURCH_ID,
        "care_signal",
        data.signalId,
        "visit_scheduled",
        String(person_id),
        String(session_id),
        null,
        JSON.stringify({ visitDate: data.visitDate, reason: data.reason }),
        data.scheduledBy,
        data.reason,
      ]
    );

    await client.query("COMMIT");
    return "ok";
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface VisitHistoryEntry {
  id:            string;
  visitDate:     string;
  reason:        string;
  scheduledBy:   string;
  scheduledAt:   string;
  isCompleted:   boolean;
  completedNote: string;
  completedAt:   string | null;
}
/**
 * Record that a previously-scheduled visit has taken place.
 *
 * Transactional: verifies the target audit entry exists for this church/person
 * with action='visit_scheduled', and has not already been completed.
 * Propagates any database write failure — does NOT swallow errors.
 *
 * Returns { ok: false, error } for business-rule violations (4xx) so the
 * caller can distinguish them from unexpected server errors (5xx).
 */
export async function completeVisit(data: {
  visitAuditEntryId: string;
  personId: string;
  note: string;
  completedBy: string;
}): Promise<{ ok: boolean; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1. Verify the target is a real visit_scheduled entry scoped to this church + person.
    const target = await client.query(
      `SELECT id FROM pastoral_audit_log
       WHERE id        = $1
         AND church_id = $2
         AND action    = 'visit_scheduled'
         AND person_id = $3`,
      [data.visitAuditEntryId, CHURCH_ID, data.personId]
    );
    if (target.rows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "Visit not found or does not belong to this person." };
    }

    // 2. Prevent duplicate completions.
    const already = await client.query(
      `SELECT id FROM pastoral_audit_log
       WHERE entity_id = $1
         AND church_id = $2
         AND action    = 'visit_completed'`,
      [data.visitAuditEntryId, CHURCH_ID]
    );
    if (already.rows.length > 0) {
      await client.query("ROLLBACK");
      return { ok: false, error: "This visit has already been marked as done." };
    }

    // 3. Write the completion entry — any DB failure throws and rolls back.
    await client.query(
      `INSERT INTO pastoral_audit_log
         (church_id, entity_type, entity_id, action,
          person_id, session_id, previous_value, new_value,
          changed_by, reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        CHURCH_ID,
        "pastoral_visit",
        data.visitAuditEntryId,
        "visit_completed",
        data.personId,
        null,
        null,
        JSON.stringify({ note: data.note }),
        data.completedBy,
        data.note,
      ]
    );

    await client.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
export async function getPastoralAuditLog(opts: {
  entityType?: string;
  entityId?: string;
  personId?: string;
  sessionId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}): Promise<Array<{
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  personId: string | null;
  sessionId: string | null;
  previousValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedAt: string;
  reason: string;
}>> {
  const conditions: string[] = ["church_id = $1"];
  const vals: unknown[] = [CHURCH_ID];
  let idx = 2;
  if (opts.entityType) { conditions.push(`entity_type = $${idx++}`); vals.push(opts.entityType); }
  if (opts.entityId)   { conditions.push(`entity_id = $${idx++}`);   vals.push(opts.entityId); }
  if (opts.personId)   { conditions.push(`person_id = $${idx++}`);   vals.push(opts.personId); }
  if (opts.sessionId)  { conditions.push(`session_id = $${idx++}`);  vals.push(opts.sessionId); }
  if (opts.dateFrom)   { conditions.push(`changed_at >= $${idx++}`); vals.push(opts.dateFrom); }
  if (opts.dateTo)     { conditions.push(`changed_at < $${idx++}`);  vals.push(opts.dateTo); }
  vals.push(opts.limit ?? 200);
  const res = await pool.query(
    `SELECT * FROM pastoral_audit_log WHERE ${conditions.join(" AND ")}
     ORDER BY changed_at DESC LIMIT $${idx}`,
    vals
  );
  return res.rows.map((r) => ({
    id:             String(r.id),
    entityType:     String(r.entity_type),
    entityId:       String(r.entity_id),
    action:         String(r.action),
    personId:       r.person_id ? String(r.person_id) : null,
    sessionId:      r.session_id ? String(r.session_id) : null,
    previousValue:  r.previous_value ?? null,
    newValue:       r.new_value ?? null,
    changedBy:      String(r.changed_by),
    changedAt:      String(r.changed_at),
    reason:         String(r.reason ?? ""),
  }));
}

// ─── Shared helper: resolve Emmaus user ID ────────────────────────────────────

async function resolveEmmausId(personId: string, personType: PersonType): Promise<string | null> {
  if (personType === "emmaus_user") return personId;
  const r = await pool.query<{ linked_user_id: string | null }>(
    `SELECT linked_user_id FROM pastoral_persons WHERE id = $1 AND church_id = $2`,
    [personId, CHURCH_ID]
  );
  return r.rows[0]?.linked_user_id ?? null;
}

// ─── Person Profile Summary ───────────────────────────────────────────────────

export interface PersonProfileSummary {
  /** Computed engagement status based on attendance, Emmaus activity, and open alerts. */
  engagementStatus: "active" | "fading" | "needs_care" | "unknown";
  lastAttendanceDate: string | null;          // ISO date (YYYY-MM-DD)
  daysSinceLastAttendance: number | null;
  openCareSignalCount: number;
  activeWalkTitle: string | null;
  activeWalkProgress: string | null;          // e.g. "Day 12 of 30"
  lastEmmausActivityDate: string | null;      // ISO date
  /** Rule-based pastoral summary sentence. */
  pastoralSummary: string;
  attendanceTrend: "consistent" | "improving" | "declining" | "new" | "unknown";
  activeWalkCount: number;
  completedWalkCount: number;
  activeDevotionalCount: number;
  roomCount: number;
}

/** Builds a single-sentence rule-based pastoral assessment. No invented data. */
function buildPastoralSummary(data: {
  firstName: string;
  attendanceTrend: PersonProfileSummary["attendanceTrend"];
  daysSinceLastAttendance: number | null;
  openCareSignalCount: number;
  activeWalkCount: number;
  completedWalkCount: number;
  activeDevotionalCount: number;
  roomCount: number;
}): string {
  const { firstName: fn, attendanceTrend: trend, daysSinceLastAttendance: days } = data;
  const parts: string[] = [];

  // Attendance statement (always first)
  if (trend === "consistent")       parts.push(`${fn} has been attending consistently`);
  else if (trend === "improving")   parts.push(`${fn}'s attendance has been improving`);
  else if (trend === "declining")   parts.push(`Attendance has declined after previous engagement`);
  else if (trend === "new")         parts.push(`${fn} is a new attendee`);
  else if (days !== null) {
    const label = days === 0 ? "today" : days === 1 ? "yesterday"
      : days < 7 ? `${days} days ago`
      : days < 14 ? "last week"
      : days < 30 ? `${Math.floor(days / 7)} weeks ago`
      : `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
    parts.push(`${fn} last attended ${label}`);
  } else {
    parts.push(`No attendance has been recorded for ${fn}`);
  }

  // Discipleship activity
  if (data.activeWalkCount > 0) {
    parts.push(`is progressing through ${data.activeWalkCount === 1 ? "a Walk" : `${data.activeWalkCount} Walks`}`);
  } else if (data.completedWalkCount > 0) {
    parts.push(`has completed ${data.completedWalkCount === 1 ? "a Walk" : `${data.completedWalkCount} Walks`}`);
  }
  if (data.activeDevotionalCount > 0) parts.push(`is engaged with Daily Rhythm`);
  if (data.roomCount > 0) {
    parts.push(`is part of ${data.roomCount === 1 ? "a Room" : `${data.roomCount} Rooms`}`);
  }

  // Care signal conclusion
  if (data.openCareSignalCount > 0) {
    parts.push(`and a pastoral follow-up may be appropriate`);
  } else if (trend === "consistent" || trend === "improving") {
    parts.push(`currently has no open care signals`);
  }

  if (parts.length === 0) return `No data is currently available for ${fn}.`;
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + ".";
  const last = parts.pop()!;
  const body = parts.join(", ");
  return (body.charAt(0).toUpperCase() + body.slice(1)) + ", " + last + ".";
}

/**
 * Returns a holistic spiritual-health snapshot for a person.
 * Answers: "How is this person doing, and should someone follow up?"
 *
 * Engagement status logic:
 *   needs_care  — one or more open care alerts
 *   active      — attended or engaged with Emmaus tools in the last 14 days
 *   fading      — last activity 15–90 days ago
 *   unknown     — no data or last activity > 90 days ago
 */
export async function getPersonProfileSummary(
  personId: string,
  personType: PersonType,
): Promise<PersonProfileSummary> {
  // 1. Last attended date + open signal count (one round-trip)
  const statsRes = await pool.query<{
    last_att: string | null;
    open_signals: string;
    recent_att: string;
    prev_att: string;
    total_att: string;
  }>(
    `SELECT
       (SELECT MAX(ms.session_date)::text
        FROM   attendance_records ar
        JOIN   meeting_sessions ms ON ms.id = ar.session_id
        WHERE  ar.person_id = $1
          AND  ar.church_id = $2
          AND  ar.status    IN ('present', 'visitor')
          AND  ms.status    = 'completed')                    AS last_att,
       (SELECT COUNT(*)::int
        FROM   care_signals
        WHERE  person_id    = $1
          AND  church_id    = $2
          AND  dismissed_at IS NULL)                          AS open_signals,
       (SELECT COUNT(*)::int
        FROM   attendance_records ar2
        JOIN   meeting_sessions ms2 ON ms2.id = ar2.session_id
        WHERE  ar2.person_id = $1 AND ar2.church_id = $2
          AND  ar2.status IN ('present','visitor')
          AND  ms2.status = 'completed'
          AND  ms2.session_date >= NOW() - INTERVAL '8 weeks') AS recent_att,
       (SELECT COUNT(*)::int
        FROM   attendance_records ar3
        JOIN   meeting_sessions ms3 ON ms3.id = ar3.session_id
        WHERE  ar3.person_id = $1 AND ar3.church_id = $2
          AND  ar3.status IN ('present','visitor')
          AND  ms3.status = 'completed'
          AND  ms3.session_date <  NOW() - INTERVAL  '8 weeks'
          AND  ms3.session_date >= NOW() - INTERVAL '16 weeks') AS prev_att,
       (SELECT COUNT(*)::int
        FROM   attendance_records ar4
        JOIN   meeting_sessions ms4 ON ms4.id = ar4.session_id
        WHERE  ar4.person_id = $1 AND ar4.church_id = $2
          AND  ar4.status IN ('present','visitor')
          AND  ms4.status = 'completed')                      AS total_att`,
    [personId, CHURCH_ID]
  );

  const row       = statsRes.rows[0] ?? {};
  const lastAttDate  = row.last_att ?? null;
  const openCount    = parseInt(String(row.open_signals ?? "0"), 10) || 0;
  const daysSince    = lastAttDate
    ? Math.floor((Date.now() - new Date(lastAttDate + "T12:00:00Z").getTime()) / 86_400_000)
    : null;
  const recentAtt    = parseInt(String(row.recent_att ?? "0"), 10) || 0;
  const prevAtt      = parseInt(String(row.prev_att    ?? "0"), 10) || 0;
  const totalAtt     = parseInt(String(row.total_att   ?? "0"), 10) || 0;

  let attendanceTrend: PersonProfileSummary["attendanceTrend"];
  if (totalAtt === 0)                                   attendanceTrend = "unknown";
  else if (totalAtt <= 3)                               attendanceTrend = "new";
  else if (prevAtt === 0 && recentAtt > 0)              attendanceTrend = "improving";
  else if (recentAtt === 0 && prevAtt > 0)              attendanceTrend = "declining";
  else if (recentAtt > prevAtt * 1.25)                  attendanceTrend = "improving";
  else if (recentAtt < prevAtt * 0.75 && prevAtt > 1)  attendanceTrend = "declining";
  else if (recentAtt > 0 && prevAtt > 0)                attendanceTrend = "consistent";
  else                                                  attendanceTrend = "unknown";

  // 2. Resolve Emmaus userId for activity queries
  let emmausUserId: string | null = null;
  if (personType === "emmaus_user") {
    emmausUserId = personId;
  } else {
    const linkRow = await pool.query<{ linked_user_id: string | null }>(
      `SELECT linked_user_id FROM pastoral_persons WHERE id = $1 AND church_id = $2`,
      [personId, CHURCH_ID]
    );
    emmausUserId = linkRow.rows[0]?.linked_user_id ?? null;
  }

  // 3. Emmaus activity (only when linked)
  let activeWalkTitle: string | null = null;
  let activeWalkProgress: string | null = null;
  let lastEmmausActivityDate: string | null = null;
  let activeWalkCount = 0;
  let completedWalkCount = 0;
  let activeDevotionalCount = 0;
  let roomCount = 0;

  if (emmausUserId) {
    const [walkRes, activityRes, walkCountRes, devotionalRes, roomRes] = await Promise.all([
      pool.query<{ title: string; current_day: number; duration_days: number }>(
        `SELECT j.title, ujp.current_day, j.duration_days
         FROM   user_journey_progress ujp
         JOIN   journeys j ON j.id = ujp.journey_id
         WHERE  ujp.user_id = $1
           AND  ujp.status NOT IN ('completed', 'paused')
         ORDER  BY ujp.updated_at DESC NULLS LAST
         LIMIT  1`,
        [emmausUserId]
      ),
      pool.query<{ last_activity: string | null }>(
        `SELECT GREATEST(
           (SELECT MAX(updated_at) FROM user_journey_progress    WHERE user_id = $1),
           (SELECT MAX(joined_at)  FROM room_members             WHERE user_id = $1),
           (SELECT MAX(updated_at) FROM devotional_progress      WHERE user_id = $1),
           (SELECT MAX(updated_at) FROM sermon_companion_progress WHERE user_id = $1)
         )::text AS last_activity`,
        [emmausUserId]
      ),
      pool.query<{ active_walks: string; completed_walks: string }>(
        `SELECT
           COUNT(*) FILTER (WHERE status NOT IN ('completed','paused'))::int AS active_walks,
           COUNT(*) FILTER (WHERE status = 'completed')::int                AS completed_walks
         FROM user_journey_progress WHERE user_id = $1`,
        [emmausUserId]
      ),
      pool.query<{ active_devotionals: string }>(
        `SELECT COUNT(*) FILTER (WHERE status <> 'completed')::int AS active_devotionals
         FROM devotional_progress WHERE user_id = $1`,
        [emmausUserId]
      ),
      pool.query<{ room_count: string }>(
        `SELECT COUNT(*)::int AS room_count FROM room_members WHERE user_id = $1`,
        [emmausUserId]
      ),
    ]);

    const walk = walkRes.rows[0];
    if (walk) {
      activeWalkTitle    = walk.title;
      activeWalkProgress = walk.duration_days > 0
        ? `Day ${walk.current_day} of ${walk.duration_days}`
        : `Day ${walk.current_day}`;
    }
    const lastAct = activityRes.rows[0]?.last_activity ?? null;
    lastEmmausActivityDate   = lastAct ? lastAct.slice(0, 10) : null;
    activeWalkCount          = parseInt(String(walkCountRes.rows[0]?.active_walks    ?? "0"), 10) || 0;
    completedWalkCount       = parseInt(String(walkCountRes.rows[0]?.completed_walks ?? "0"), 10) || 0;
    activeDevotionalCount    = parseInt(String(devotionalRes.rows[0]?.active_devotionals ?? "0"), 10) || 0;
    roomCount                = parseInt(String(roomRes.rows[0]?.room_count ?? "0"), 10) || 0;
  }

  // 4. Compute engagement status
  const now    = Date.now();
  const D14    = 14  * 86_400_000;
  const D90    = 90  * 86_400_000;
  const attMs  = lastAttDate           ? new Date(lastAttDate           + "T12:00:00Z").getTime() : 0;
  const emmMs  = lastEmmausActivityDate ? new Date(lastEmmausActivityDate + "T12:00:00Z").getTime() : 0;
  const recent = Math.max(attMs, emmMs);

  let engagementStatus: PersonProfileSummary["engagementStatus"];
  if (openCount > 0)                             engagementStatus = "needs_care";
  else if (recent > 0 && now - recent <= D14)    engagementStatus = "active";
  else if (recent > 0 && now - recent <= D90)    engagementStatus = "fading";
  else                                            engagementStatus = "unknown";

  // 5. Rule-based pastoral summary
  const firstName   = (personType === "emmaus_user"
    ? personId.split("@")[0]
    : personId).replace(/[-_.]/g, " ").split(" ")[0];
  const pastoralSummary = buildPastoralSummary({
    firstName:              firstName || "This person",
    attendanceTrend,
    daysSinceLastAttendance: daysSince,
    openCareSignalCount:    openCount,
    activeWalkCount,
    completedWalkCount,
    activeDevotionalCount,
    roomCount,
  });

  return {
    engagementStatus,
    lastAttendanceDate:       lastAttDate,
    daysSinceLastAttendance:  daysSince,
    openCareSignalCount:      openCount,
    activeWalkTitle,
    activeWalkProgress,
    lastEmmausActivityDate,
    pastoralSummary,
    attendanceTrend,
    activeWalkCount,
    completedWalkCount,
    activeDevotionalCount,
    roomCount,
  };
}

// ─── Life Milestones ──────────────────────────────────────────────────────────

export interface MilestoneItem {
  id: string;
  milestoneType: string;
  title: string;
  milestoneDate: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
}

export async function getPastoralMilestones(
  personId: string,
  personType: PersonType,
): Promise<MilestoneItem[]> {
  const rows = await pool.query<{
    id: string; milestone_type: string; title: string;
    milestone_date: string | null; notes: string | null;
    created_by: string; created_at: string;
  }>(
    `SELECT id::text, milestone_type, title, milestone_date::text, notes, created_by, created_at::text
     FROM pastoral_milestones
     WHERE person_id = $1 AND church_id = $2 AND is_active = true
     ORDER BY COALESCE(milestone_date, '1900-01-01') ASC, created_at ASC`,
    [personId, CHURCH_ID]
  );
  return rows.rows.map(r => ({
    id: r.id, milestoneType: r.milestone_type, title: r.title,
    milestoneDate: r.milestone_date ?? null, notes: r.notes ?? null,
    createdBy: r.created_by, createdAt: r.created_at,
  }));
}

export async function createPastoralMilestone(data: {
  personId: string; personType: PersonType; milestoneType: string;
  title: string; milestoneDate: string | null; notes: string | null; createdBy: string;
}): Promise<MilestoneItem> {
  const row = await pool.query<{
    id: string; milestone_type: string; title: string;
    milestone_date: string | null; notes: string | null;
    created_by: string; created_at: string;
  }>(
    `INSERT INTO pastoral_milestones
       (church_id, person_id, person_type, milestone_type, title, milestone_date, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id::text, milestone_type, title, milestone_date::text, notes, created_by, created_at::text`,
    [CHURCH_ID, data.personId, data.personType, data.milestoneType,
     data.title, data.milestoneDate || null, data.notes || null, data.createdBy]
  );
  const r = row.rows[0];
  return {
    id: r.id, milestoneType: r.milestone_type, title: r.title,
    milestoneDate: r.milestone_date ?? null, notes: r.notes ?? null,
    createdBy: r.created_by, createdAt: r.created_at,
  };
}

export async function deletePastoralMilestone(id: string, churchId: string): Promise<void> {
  await pool.query(
    `UPDATE pastoral_milestones SET is_active = false, updated_at = NOW()
     WHERE id = $1 AND church_id = $2`,
    [id, churchId]
  );
}

// ─── Journey Timeline ─────────────────────────────────────────────────────────

export type TimelineEventType =
  | "attendance"
  | "walk_started" | "walk_completed"
  | "devotional_started" | "devotional_completed"
  | "room_joined"
  | "sermon_companion_started"
  | "milestone"
  | "care_alert"
  | "visit_scheduled";

export interface TimelineEvent {
  id: string;
  date: string;              // ISO datetime
  eventType: TimelineEventType;
  title: string;
  subtitle?: string;
}

export async function getJourneyTimeline(
  personId: string,
  personType: PersonType,
): Promise<TimelineEvent[]> {
  const events: TimelineEvent[] = [];
  const emmausUserId = await resolveEmmausId(personId, personType);

  // 1. Attendance events
  const attRows = await pool.query<{
    id: string; session_date: string; meeting_type: string; status: string;
  }>(
    `SELECT ar.id::text, ms.session_date::text, mt.name AS meeting_type, ar.status
     FROM attendance_records ar
     JOIN meeting_sessions ms ON ms.id = ar.session_id
     JOIN meeting_types mt    ON mt.id = ms.meeting_type_id
     WHERE ar.person_id = $1 AND ar.church_id = $2
       AND ar.status IN ('present','visitor') AND ms.status = 'completed'
     ORDER BY ms.session_date DESC LIMIT 50`,
    [personId, CHURCH_ID]
  );
  for (const r of attRows.rows) {
    events.push({
      id: `att-${r.id}`, date: r.session_date + "T12:00:00",
      eventType: "attendance", title: `Attended ${r.meeting_type}`,
      subtitle: r.status === "visitor" ? "Visitor" : undefined,
    });
  }

  // 2. Pastoral milestones
  const milRows = await pool.query<{
    id: string; title: string; milestone_date: string | null; notes: string | null;
  }>(
    `SELECT id::text, title, milestone_date::text, notes
     FROM pastoral_milestones
     WHERE person_id = $1 AND church_id = $2 AND is_active = true`,
    [personId, CHURCH_ID]
  );
  for (const r of milRows.rows) {
    events.push({
      id: `mil-${r.id}`,
      date: r.milestone_date ? r.milestone_date + "T12:00:00" : new Date(0).toISOString(),
      eventType: "milestone", title: r.title,
      subtitle: r.notes ?? undefined,
    });
  }

  // 3. Emmaus events (only when account is linked)
  if (emmausUserId) {
    const [walkRows, devRows, roomRows, scRows] = await Promise.all([
      pool.query<{
        journey_id: string; title: string; started_at: string | null;
        updated_at: string; last_completed_at: string | null; status: string;
      }>(
        `SELECT ujp.journey_id, j.title, ujp.started_at::text, ujp.updated_at::text,
                ujp.last_completed_at::text, ujp.status
         FROM user_journey_progress ujp
         JOIN journeys j ON j.id = ujp.journey_id
         WHERE ujp.user_id = $1`,
        [emmausUserId]
      ),
      pool.query<{
        series_id: string; title: string; started_at: string | null;
        updated_at: string; status: string;
      }>(
        `SELECT dp.series_id::text, ds.title, dp.started_at::text, dp.updated_at::text, dp.status
         FROM devotional_progress dp
         JOIN devotional_series ds ON ds.id = dp.series_id
         WHERE dp.user_id = $1`,
        [emmausUserId]
      ),
      pool.query<{ room_id: string; room_name: string; joined_at: string | null; role: string }>(
        `SELECT rm.room_id::text, r.name AS room_name, rm.joined_at::text, rm.role
         FROM room_members rm JOIN rooms r ON r.id = rm.room_id
         WHERE rm.user_id = $1`,
        [emmausUserId]
      ),
      pool.query<{
        companion_id: string; title: string; started_at: string | null; updated_at: string; status: string;
      }>(
        `SELECT scp.companion_id::text, sc.title, scp.started_at::text, scp.updated_at::text, scp.status
         FROM sermon_companion_progress scp
         JOIN sermon_companion sc ON sc.id = scp.companion_id
         WHERE scp.user_id = $1`,
        [emmausUserId]
      ),
    ]);

    for (const w of walkRows.rows) {
      if (w.started_at) events.push({ id: `walk-start-${w.journey_id}`, date: w.started_at, eventType: "walk_started", title: `Started ${w.title}` });
      if (w.status === "completed") events.push({ id: `walk-done-${w.journey_id}`, date: w.last_completed_at ?? w.updated_at, eventType: "walk_completed", title: `Completed ${w.title}` });
    }
    for (const d of devRows.rows) {
      if (d.started_at) events.push({ id: `dev-start-${d.series_id}`, date: d.started_at, eventType: "devotional_started", title: `Started ${d.title}` });
      if (d.status === "completed") events.push({ id: `dev-done-${d.series_id}`, date: d.updated_at, eventType: "devotional_completed", title: `Completed ${d.title}` });
    }
    for (const r of roomRows.rows) {
      if (r.joined_at) events.push({ id: `room-${r.room_id}`, date: r.joined_at, eventType: "room_joined", title: `Joined ${r.room_name}`, subtitle: r.role === "admin" ? "Room Leader" : undefined });
    }
    for (const sc of scRows.rows) {
      if (sc.started_at) events.push({ id: `sc-${sc.companion_id}`, date: sc.started_at, eventType: "sermon_companion_started", title: `Started ${sc.title}` });
    }
  }

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return events.slice(0, 120);
}

// ─── Spiritual Rhythm ─────────────────────────────────────────────────────────

export interface RhythmDay {
  date: string;            // YYYY-MM-DD
  level: 0 | 1 | 2 | 3;   // 0 = no activity, 3 = very active
}

export async function getSpiritualRhythm(
  personId: string,
  personType: PersonType,
): Promise<RhythmDay[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 181);
  const startStr = startDate.toISOString().slice(0, 10);

  const activityMap = new Map<string, number>();
  const emmausUserId = await resolveEmmausId(personId, personType);

  // Attendance dates (church presence)
  const attRows = await pool.query<{ d: string }>(
    `SELECT DISTINCT ms.session_date::text AS d
     FROM attendance_records ar
     JOIN meeting_sessions ms ON ms.id = ar.session_id
     WHERE ar.person_id = $1 AND ar.church_id = $2
       AND ar.status IN ('present','visitor') AND ms.status = 'completed'
       AND ms.session_date >= $3`,
    [personId, CHURCH_ID, startStr]
  );
  for (const r of attRows.rows) activityMap.set(r.d, (activityMap.get(r.d) ?? 0) + 1);

  if (emmausUserId) {
    const [wDates, dDates, scDates] = await Promise.all([
      pool.query<{ d: string }>(`SELECT DISTINCT DATE(updated_at)::text AS d FROM user_journey_progress WHERE user_id = $1 AND updated_at >= $2`, [emmausUserId, startStr]),
      pool.query<{ d: string }>(`SELECT DISTINCT DATE(updated_at)::text AS d FROM devotional_progress WHERE user_id = $1 AND updated_at >= $2`, [emmausUserId, startStr]),
      pool.query<{ d: string }>(`SELECT DISTINCT DATE(updated_at)::text AS d FROM sermon_companion_progress WHERE user_id = $1 AND updated_at >= $2`, [emmausUserId, startStr]),
    ]);
    for (const r of [...wDates.rows, ...dDates.rows, ...scDates.rows]) {
      activityMap.set(r.d, (activityMap.get(r.d) ?? 0) + 1);
    }
  }

  const days: RhythmDay[] = [];
  for (let i = 0; i < 182; i++) {
    const d = new Date(startDate); d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    const count = activityMap.get(dateStr) ?? 0;
    days.push({ date: dateStr, level: (count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : 3) as 0|1|2|3 });
  }
  return days;
}

// ─── Attendance Rhythm ────────────────────────────────────────────────────────

export interface MonthlyAttendance {
  month: string;       // "Jan 2026"
  yearMonth: string;   // "2026-01"
  attended: number;
  totalMarked: number;
  absent: number;
}

export async function getAttendanceRhythm(
  personId: string,
  _personType: PersonType,
): Promise<MonthlyAttendance[]> {
  const rows = await pool.query<{
    year_month: string; month_key: string;
    attended: string; total_marked: string; absent: string;
  }>(
    `SELECT
       TO_CHAR(DATE_TRUNC('month', ms.session_date::date), 'Mon YYYY') AS year_month,
       TO_CHAR(DATE_TRUNC('month', ms.session_date::date), 'YYYY-MM')  AS month_key,
       COUNT(*) FILTER (WHERE ar.status IN ('present','visitor'))::int  AS attended,
       COUNT(*)::int                                                    AS total_marked,
       COUNT(*) FILTER (WHERE ar.status = 'absent')::int               AS absent
     FROM attendance_records ar
     JOIN meeting_sessions ms ON ms.id = ar.session_id
     WHERE ar.person_id = $1 AND ar.church_id = $2
       AND ms.session_date >= NOW() - INTERVAL '12 months'
       AND ms.status = 'completed'
     GROUP BY DATE_TRUNC('month', ms.session_date::date)
     ORDER BY DATE_TRUNC('month', ms.session_date::date) ASC`,
    [personId, CHURCH_ID]
  );
  return rows.rows.map(r => ({
    month:       r.year_month,
    yearMonth:   r.month_key,
    attended:    parseInt(r.attended,      10),
    totalMarked: parseInt(r.total_marked,  10),
    absent:      parseInt(r.absent,        10),
  }));
}

/**
 * Server-side join: returns every scheduled visit for a person together with
 * its completion status.  No pagination cap — all visits are returned so
 * older records are never silently omitted as the audit log grows.
 */
export async function getVisitHistoryForPerson(
  personId: string
): Promise<VisitHistoryEntry[]> {
  const res = await pool.query(
    `SELECT
       s.id,
       s.new_value  AS schedule_nv,
       s.changed_by AS scheduled_by,
       s.changed_at AS scheduled_at,
       c.new_value  AS completion_nv,
       c.changed_at AS completed_at
     FROM pastoral_audit_log s
     LEFT JOIN pastoral_audit_log c
       ON  c.entity_id = s.id::text
       AND c.church_id = $2
       AND c.action    = 'visit_completed'
     WHERE s.church_id = $2
       AND s.person_id = $1
       AND s.action    = 'visit_scheduled'
     ORDER BY s.changed_at DESC`,
    [personId, CHURCH_ID]
  );

  return res.rows.map((r) => {
    const snv = (r.schedule_nv   ?? {}) as Record<string, unknown>;
    const cnv = (r.completion_nv ?? {}) as Record<string, unknown>;
    return {
      id:            String(r.id),
      visitDate:     String(snv.visitDate ?? ""),
      reason:        String(snv.reason ?? ""),
      scheduledBy:   String(r.scheduled_by),
      scheduledAt:   String(r.scheduled_at),
      isCompleted:   r.completed_at != null,
      completedNote: r.completed_at != null ? String(cnv.note ?? "") : "",
      completedAt:   r.completed_at != null ? String(r.completed_at) : null,
    };
  });
}

// ─── Discipleship Signals ─────────────────────────────────────────────────────

export { type SignalCategory };
export type SignalStatus =
  | "new"
  | "acknowledged"
  | "following_up"
  | "resolved"
  | "dismissed";

export interface DiscipleshipSignal {
  id: string;
  churchId: string;
  personId: string;
  personType: PersonType;
  personName?: string;
  category: SignalCategory;
  signalType: string;
  title: string;
  explanation: string;
  evidence: Record<string, unknown>;
  status: SignalStatus;
  assignedTo: string | null;
  pastoralNote: string | null;
  detectedAt: string;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function rowToDiscipleshipSignal(r: Record<string, unknown>): DiscipleshipSignal {
  return {
    id:           String(r.id),
    churchId:     String(r.church_id),
    personId:     String(r.person_id),
    personType:   String(r.person_type) as PersonType,
    personName:   r.person_name != null ? String(r.person_name) : undefined,
    category:     String(r.category) as SignalCategory,
    signalType:   String(r.signal_type),
    title:        String(r.title),
    explanation:  String(r.explanation),
    evidence:     typeof r.evidence === "object" && r.evidence !== null
                    ? (r.evidence as Record<string, unknown>)
                    : {},
    status:       String(r.status) as SignalStatus,
    assignedTo:   r.assigned_to != null ? String(r.assigned_to) : null,
    pastoralNote: r.pastoral_note != null ? String(r.pastoral_note) : null,
    detectedAt:   String(r.detected_at),
    resolvedAt:   r.resolved_at != null ? String(r.resolved_at) : null,
    createdAt:    String(r.created_at),
    updatedAt:    String(r.updated_at),
  };
}

export async function listDiscipleshipSignals(opts?: {
  category?: SignalCategory;
  status?: SignalStatus | SignalStatus[];
  excludeStatus?: SignalStatus[];
  personId?: string;
  personType?: PersonType;
  limit?: number;
}): Promise<DiscipleshipSignal[]> {
  const conditions: string[] = ["ds.church_id = $1"];
  const vals: unknown[] = [CHURCH_ID];
  let idx = 2;

  if (opts?.category) {
    conditions.push(`ds.category = $${idx++}`);
    vals.push(opts.category);
  }
  if (opts?.status) {
    const ss = Array.isArray(opts.status) ? opts.status : [opts.status];
    conditions.push(`ds.status = ANY($${idx++}::text[])`);
    vals.push(ss);
  }
  if (opts?.excludeStatus?.length) {
    conditions.push(`ds.status != ALL($${idx++}::text[])`);
    vals.push(opts.excludeStatus);
  }
  if (opts?.personId) {
    conditions.push(`ds.person_id = $${idx++}`);
    vals.push(opts.personId);
  }
  if (opts?.personType) {
    conditions.push(`ds.person_type = $${idx++}`);
    vals.push(opts.personType);
  }

  const res = await pool.query(
    `SELECT ds.*,
            COALESCE(pp.full_name, up.preferred_name, ds.person_id) AS person_name
     FROM discipleship_signals ds
     LEFT JOIN pastoral_persons pp
       ON ds.person_type = 'pastoral_person' AND pp.id::text = ds.person_id
     LEFT JOIN user_profiles up
       ON ds.person_type = 'emmaus_user' AND up.email = ds.person_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY ds.detected_at DESC
     LIMIT $${idx}`,
    [...vals, opts?.limit ?? 500],
  );
  return res.rows.map(rowToDiscipleshipSignal);
}

export interface DiscipleshipSignalCountRow {
  personId: string;
  personType: PersonType;
  significant: number;
  followUp: number;
  attention: number;
  growth: number;
  celebration: number;
  total: number;
}
export async function updateSignalStatus(
  id: string,
  status: SignalStatus,
  updatedBy: string,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE discipleship_signals
     SET status      = $1,
         resolved_at = CASE WHEN $1 = 'resolved' THEN NOW() ELSE resolved_at END,
         updated_at  = NOW()
     WHERE id = $2 AND church_id = $3
     RETURNING id`,
    [status, id, CHURCH_ID],
  );
  if (res.rows.length > 0) {
    await logPastoralAudit({
      entityType: "discipleship_signal",
      entityId:   id,
      action:     `status_${status}`,
      changedBy:  updatedBy,
    });
  }
  return res.rows.length > 0;
}

export async function updateSignalNote(
  id: string,
  note: string,
  updatedBy: string,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE discipleship_signals
     SET pastoral_note = $1, updated_at = NOW()
     WHERE id = $2 AND church_id = $3
     RETURNING id`,
    [note || null, id, CHURCH_ID],
  );
  return res.rows.length > 0;
}

export async function assignSignal(
  id: string,
  assignTo: string | null,
  updatedBy: string,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE discipleship_signals
     SET assigned_to = $1, updated_at = NOW()
     WHERE id = $2 AND church_id = $3
     RETURNING id`,
    [assignTo || null, id, CHURCH_ID],
  );
  if (res.rows.length > 0) {
    await logPastoralAudit({
      entityType: "discipleship_signal",
      entityId:   id,
      action:     assignTo ? `assigned_to_${assignTo}` : "unassigned",
      changedBy:  updatedBy,
    });
  }
  return res.rows.length > 0;
}

// ─── Engine context gathering ─────────────────────────────────────────────────

async function gatherPersonContext(
  personId: string,
  personType: PersonType,
): Promise<PersonContext> {
  const emmausUserId = await resolveEmmausId(personId, personType);

  const attRows = await pool.query<{
    session_date: string; status: string; meeting_type_name: string;
  }>(
    `SELECT ms.session_date::text, ar.status, mt.name AS meeting_type_name
     FROM attendance_records ar
     JOIN meeting_sessions ms ON ms.id = ar.session_id
     JOIN meeting_types mt    ON mt.id = ms.meeting_type_id
     WHERE ar.person_id = $1 AND ar.church_id = $2 AND ms.status = 'completed'
     ORDER BY ms.session_date DESC LIMIT 16`,
    [personId, CHURCH_ID],
  );

  let walks: PersonContext["walks"] = [];
  let devotionals: PersonContext["devotionals"] = [];
  let rooms: PersonContext["rooms"] = [];

  if (emmausUserId) {
    const [walkRows, devRows, roomRows] = await Promise.all([
      pool.query<{
        id: string; title: string; started_at: string | null;
        updated_at: string; status: string; last_completed_at: string | null;
      }>(
        `SELECT ujp.journey_id AS id, j.title,
                ujp.started_at::text, ujp.updated_at::text,
                ujp.status, ujp.last_completed_at::text
         FROM user_journey_progress ujp JOIN journeys j ON j.id = ujp.journey_id
         WHERE ujp.user_id = $1`,
        [emmausUserId],
      ),
      pool.query<{
        id: string; title: string; started_at: string | null;
        updated_at: string; status: string;
      }>(
        `SELECT dp.series_id::text AS id, ds.title,
                dp.started_at::text, dp.updated_at::text, dp.status
         FROM devotional_progress dp JOIN devotional_series ds ON ds.id = dp.series_id
         WHERE dp.user_id = $1`,
        [emmausUserId],
      ),
      pool.query<{ id: string; name: string; joined_at: string | null }>(
        `SELECT rm.room_id::text AS id, r.name, rm.joined_at::text
         FROM room_members rm JOIN rooms r ON r.id = rm.room_id
         WHERE rm.user_id = $1`,
        [emmausUserId],
      ),
    ]);

    walks = walkRows.rows.map((r) => ({
      id: r.id, title: r.title, startedAt: r.started_at,
      updatedAt: r.updated_at, status: r.status, lastCompletedAt: r.last_completed_at,
    }));
    devotionals = devRows.rows.map((r) => ({
      id: r.id, title: r.title, startedAt: r.started_at,
      updatedAt: r.updated_at, status: r.status,
    }));
    rooms = roomRows.rows.map((r) => ({
      id: r.id, name: r.name, joinedAt: r.joined_at,
    }));
  }

  const milRows = await pool.query<{
    type: string; title: string; milestone_date: string | null; created_at: string;
  }>(
    `SELECT milestone_type AS type, title, milestone_date::text, created_at::text
     FROM pastoral_milestones
     WHERE person_id = $1 AND church_id = $2 AND is_active = true`,
    [personId, CHURCH_ID],
  );

  return {
    personId,
    personType,
    emmausUserId,
    attendanceRecords: attRows.rows.map((r) => ({
      sessionDate: r.session_date, status: r.status, meetingTypeName: r.meeting_type_name,
    })),
    walks,
    devotionals,
    rooms,
    milestones: milRows.rows.map((r) => ({
      type: r.type, title: r.title, date: r.milestone_date, createdAt: r.created_at,
    })),
  };
}

/** Upsert a signal. Returns 'created', 'updated', or 'no-change'. */
async function upsertDiscipleshipSignal(data: {
  personId: string; personType: PersonType;
} & import("./care-signals-engine.js").SignalDetected): Promise<"created" | "updated" | "no-change"> {
  const id = randomUUID();
  const res = await pool.query<{ xmax: string }>(
    `INSERT INTO discipleship_signals
       (id, church_id, person_id, person_type, category, signal_type, title, explanation, evidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (church_id, person_id, person_type, signal_type) DO UPDATE SET
       title       = EXCLUDED.title,
       explanation = EXCLUDED.explanation,
       evidence    = EXCLUDED.evidence,
       detected_at = CASE
         WHEN discipleship_signals.status IN ('resolved','dismissed') THEN NOW()
         ELSE discipleship_signals.detected_at
       END,
       status      = CASE
         WHEN discipleship_signals.status IN ('resolved','dismissed') THEN 'new'
         ELSE discipleship_signals.status
       END,
       updated_at  = NOW()
     RETURNING xmax::text`,
    [
      id, CHURCH_ID, data.personId, data.personType,
      data.category, data.signalType,
      data.title, data.explanation, JSON.stringify(data.evidence),
    ],
  );
  if (res.rows.length === 0) return "no-change";
  return res.rows[0].xmax === "0" ? "created" : "updated";
}

export interface SignalRuleConfig {
  ruleId: string;
  enabled: boolean;
  thresholds: Record<string, number>;
  updatedBy: string;
  updatedAt: string;
}
export interface EngineRunRecord {
  id: number;
  churchId: string;
  triggeredBy: "scheduler" | "manual";
  processed: number;
  created: number;
  updated: number;
  resolved: number;
  ranAt: string;
}

/** Record a completed engine run. Non-fatal on failure. */
export async function logEngineRun(
  result: { processed: number; created: number; updated: number; resolved: number },
  triggeredBy: "scheduler" | "manual" = "manual"
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO signal_engine_runs (church_id, triggered_by, processed, created, updated, resolved)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [CHURCH_ID, triggeredBy, result.processed, result.created, result.updated, result.resolved]
    );
  } catch (err) {
    logger.warn({ err }, "pastoral-store: logEngineRun failed (non-fatal)");
  }
}

/** Return the most recent engine run for the church, or null if none. */
export async function getLastEngineRun(): Promise<EngineRunRecord | null> {
  try {
    const res = await pool.query(
      `SELECT * FROM signal_engine_runs
       WHERE church_id = $1
       ORDER BY ran_at DESC
       LIMIT 1`,
      [CHURCH_ID]
    );
    if (!res.rows[0]) return null;
    const r = res.rows[0];
    return {
      id:          Number(r.id),
      churchId:    String(r.church_id),
      triggeredBy: String(r.triggered_by) as EngineRunRecord["triggeredBy"],
      processed:   Number(r.processed),
      created:     Number(r.created),
      updated:     Number(r.updated),
      resolved:    Number(r.resolved),
      ranAt:       String(r.ran_at),
    };
  } catch (err) {
    logger.warn({ err }, "pastoral-store: getLastEngineRun failed (non-fatal)");
    return null;
  }
}

/**
 * Bulk-resolve all open (non-resolved, non-dismissed) signals of a given
 * signal_type for this church.  Called when a rule is disabled so that
 * existing alerts don't linger in pastor triage indefinitely.
 *
 * Returns the number of rows updated.
 */
export async function resolveOpenSignalsByType(
  signalType: string,
  resolvedBy: string,
): Promise<number> {
  const res = await pool.query<{ id: string }>(
    `UPDATE discipleship_signals
        SET status      = 'resolved',
            resolved_at = NOW(),
            updated_at  = NOW()
      WHERE church_id   = $1
        AND signal_type = $2
        AND status NOT IN ('resolved', 'dismissed')
      RETURNING id`,
    [CHURCH_ID, signalType],
  );
  const count = res.rowCount ?? 0;
  if (count > 0) {
    logger.info(
      { signalType, resolvedBy, count },
      "pastoral-store: resolveOpenSignalsByType — rule disabled; existing signals resolved",
    );
  }
  return count;
}

export async function runSignalsEngine(opts?: {
  personId?: string;
  personType?: PersonType;
}): Promise<{ processed: number; created: number; updated: number; resolved: number }> {
  // Load per-church rule config from DB so the engine respects admin overrides.
  const ruleConfig = await getSignalRuleConfigMap();

  const allPeople = await listUnifiedPeople();
  const targets = opts?.personId
    ? allPeople.filter(
        (p) =>
          p.id === opts.personId &&
          (!opts.personType || p.personType === opts.personType),
      )
    : allPeople;

  let created = 0, updated = 0, resolved = 0;

  // Sweep: resolve any open signals belonging to rules that are now disabled.
  // This handles the gap between when a rule was disabled and the next engine run.
  // Only applies when running the full engine (not a targeted per-person run).
  if (!opts?.personId) {
    for (const rule of ALL_RULES) {
      const cfg = ruleConfig.get(rule.id);
      if (cfg?.enabled === false) {
        const n = await resolveOpenSignalsByType(rule.id, "engine:rule_disabled_sweep");
        resolved += n;
      }
    }
  }

  // IDs of all state-based rules that are currently enabled (can be auto-resolved)
  const stateBasedIds = new Set(
    ALL_RULES
      .filter((r) => r.isStateBased)
      .filter((r) => {
        const cfg = ruleConfig.get(r.id);
        return cfg?.enabled !== undefined ? cfg.enabled : r.enabled;
      })
      .map((r) => r.id),
  );

  for (const person of targets) {
    try {
      const ctx = await gatherPersonContext(
        person.id,
        person.personType as PersonType,
      );
      const detected    = detectSignals(ctx, ruleConfig);
      const detectedSet = new Set(detected.map((s) => s.signalType));

      for (const signal of detected) {
        const outcome = await upsertDiscipleshipSignal({
          personId: person.id,
          personType: person.personType as PersonType,
          ...signal,
        });
        if (outcome === "created") created++;
        else if (outcome === "updated") updated++;
      }

      // Auto-resolve state-based signals whose condition no longer holds
      const existing = await pool.query<{ id: string; signal_type: string }>(
        `SELECT id, signal_type
         FROM discipleship_signals
         WHERE church_id = $1 AND person_id = $2 AND person_type = $3
           AND status NOT IN ('resolved','dismissed')`,
        [CHURCH_ID, person.id, person.personType],
      );
      for (const row of existing.rows) {
        const st = row.signal_type;
        if (stateBasedIds.has(st) && !detectedSet.has(st)) {
          await pool.query(
            `UPDATE discipleship_signals
             SET status = 'resolved', resolved_at = NOW(), updated_at = NOW()
             WHERE id = $1`,
            [row.id],
          );
          resolved++;
        }
      }
    } catch {
      // Per-person failures are non-fatal — engine continues.
    }
  }

  return { processed: targets.length, created, updated, resolved };
}

/** Returns all 18 rules merged with any per-church overrides from DB. */
export async function listSignalRulesWithConfig(): Promise<SignalRuleWithConfig[]> {
  const configMap = await getSignalRuleConfigMap();
  return ALL_RULES.map((rule) => {
    const cfg = configMap.get(rule.id);
    return {
      id:             rule.id,
      category:       rule.category,
      title:          rule.title,
      description:    rule.description,
      isStateBased:   rule.isStateBased,
      defaultEnabled: rule.enabled,
      enabled:        cfg?.enabled !== undefined ? cfg.enabled : rule.enabled,
      thresholds:     cfg?.thresholds ?? {},
      thresholdDefs:  rule.thresholdDefs,
    };
  });
}

/** Returns open discipleship-signal counts grouped by person and category. */
export async function getDiscipleshipSignalCounts(): Promise<DiscipleshipSignalCountRow[]> {
  const res = await pool.query(
    `SELECT
       person_id,
       person_type,
       COUNT(*) FILTER (WHERE category = 'significant')::int  AS significant,
       COUNT(*) FILTER (WHERE category = 'follow_up')::int    AS follow_up,
       COUNT(*) FILTER (WHERE category = 'attention')::int    AS attention,
       COUNT(*) FILTER (WHERE category = 'growth')::int       AS growth,
       COUNT(*) FILTER (WHERE category = 'celebration')::int  AS celebration,
       COUNT(*)::int                                          AS total
     FROM discipleship_signals
     WHERE church_id = $1
       AND status NOT IN ('resolved', 'dismissed')
     GROUP BY person_id, person_type`,
    [CHURCH_ID],
  );
  return res.rows.map((r) => ({
    personId:    String(r.person_id),
    personType:  String(r.person_type) as PersonType,
    significant: Number(r.significant ?? 0),
    followUp:    Number(r.follow_up ?? 0),
    attention:   Number(r.attention ?? 0),
    growth:      Number(r.growth ?? 0),
    celebration: Number(r.celebration ?? 0),
    total:       Number(r.total ?? 0),
  }));
}

/** Load per-church rule config from DB as a quick-lookup map. */
export async function getSignalRuleConfigMap(): Promise<RuleConfigMap> {
  try {
    const res = await pool.query<{ rule_id: string; enabled: boolean; thresholds: unknown }>(
      `SELECT rule_id, enabled, thresholds FROM signal_rule_config WHERE church_id = $1`,
      [CHURCH_ID],
    );
    const map: RuleConfigMap = new Map();
    for (const r of res.rows) {
      map.set(r.rule_id, {
        enabled:    Boolean(r.enabled),
        thresholds: typeof r.thresholds === "object" && r.thresholds !== null
          ? (r.thresholds as Record<string, number>)
          : {},
      });
    }
    return map;
  } catch {
    return new Map(); // table may not exist yet on first boot
  }
}

/** Upsert one rule's config override (enabled flag + optional thresholds). */
export async function upsertSignalRuleConfig(data: {
  ruleId: string;
  enabled: boolean;
  thresholds: Record<string, number>;
  updatedBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO signal_rule_config (church_id, rule_id, enabled, thresholds, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (church_id, rule_id) DO UPDATE SET
       enabled    = EXCLUDED.enabled,
       thresholds = EXCLUDED.thresholds,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [CHURCH_ID, data.ruleId, data.enabled, JSON.stringify(data.thresholds), data.updatedBy],
  );
}

export interface SignalRuleWithConfig {
  id: string;
  category: SignalCategory;
  title: string;
  description: string;
  isStateBased: boolean;
  defaultEnabled: boolean;
  enabled: boolean;
  thresholds: Record<string, number>;
  thresholdDefs?: { key: string; label: string; default: number; min: number; max: number }[];
}
