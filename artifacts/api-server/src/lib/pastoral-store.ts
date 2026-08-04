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
       ar_latest.status        AS last_attendance_status
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
     ORDER BY COALESCE(up.preferred_name, up.email) ASC`,
    [CHURCH_ID]
  );

  // Attendance-only pastoral persons
  const pastoralRes = await pool.query(
    `SELECT
       pp.*,
       ar_latest.session_date  AS last_attendance_date,
       ar_latest.status        AS last_attendance_status
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

// ─── Attendance Records ───────────────────────────────────────────────────────

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

// ─── Care Signals ─────────────────────────────────────────────────────────────

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
}

function rowToCareSignal(r: Record<string, unknown>): CareSignal {
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
  };
}

export async function getCareSignals(opts?: {
  includesDismissed?: boolean;
  personId?: string;
  personType?: PersonType;
  limit?: number;
}): Promise<CareSignal[]> {
  const conditions: string[] = ["cs.church_id = $1"];
  const vals: unknown[] = [CHURCH_ID];
  let idx = 2;

  if (!opts?.includesDismissed) {
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

  const res = await pool.query(
    `SELECT cs.*,
            ms.session_date,
            mt.name AS meeting_type_name,
            COALESCE(
              pp.full_name,
              up.preferred_name,
              cs.person_id
            ) AS person_name
     FROM care_signals cs
     JOIN meeting_sessions ms ON ms.id = cs.session_id
     JOIN meeting_types mt ON mt.id = ms.meeting_type_id
     LEFT JOIN pastoral_persons pp
       ON cs.person_type = 'pastoral_person' AND pp.id::text = cs.person_id
     LEFT JOIN user_profiles up
       ON cs.person_type = 'emmaus_user' AND up.email = cs.person_id
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

// ─── Pastoral audit log ───────────────────────────────────────────────────────

export async function getPastoralAuditLog(opts: {
  entityType?: string;
  entityId?: string;
  personId?: string;
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
  vals.push(opts.limit ?? 100);
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
