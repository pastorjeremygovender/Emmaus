/**
 * pastoral.ts — API routes for the Pastoral Care module (Checkpoint 1).
 *
 * All routes require at minimum admin or pastoral_role access.
 * Church/tenant isolation is enforced in the store layer (CHURCH_ID = 'icc').
 *
 * Routes:
 *   GET    /pastoral/people
 *   POST   /pastoral/people
 *   GET    /pastoral/people/:id
 *   PATCH  /pastoral/people/:id
 *   POST   /pastoral/people/:id/link
 *   GET    /pastoral/meeting-types
 *   POST   /pastoral/meeting-types
 *   PATCH  /pastoral/meeting-types/:id
 *   GET    /pastoral/sessions
 *   POST   /pastoral/sessions
 *   GET    /pastoral/sessions/:id
 *   PATCH  /pastoral/sessions/:id
 *   GET    /pastoral/sessions/:id/register
 *   POST   /pastoral/sessions/:id/register
 *   DELETE /pastoral/sessions/:id/register/:personKey
 *   GET    /pastoral/people/:personKey/expectations
 *   PUT    /pastoral/people/:personKey/expectations
 *   DELETE /pastoral/people/:personKey/expectations/:meetingTypeId
 *   GET    /pastoral/people/:personKey/attendance-history
 *   GET    /pastoral/audit-log
 */

import { Router, type Request, type Response } from "express";
import * as store from "../lib/pastoral-store.js";
import { pool } from "@workspace/db";
import { requireAuth } from "../emmaus/auth.js";
import { logger } from "../lib/logger.js";

export const pastoralRouter = Router();

// ─── Permission helpers ───────────────────────────────────────────────────────

/**
 * Returns userId if the caller has any pastoral access:
 * superAdmin, admin, or pastoral_role IN ('pastor','recorder') via user_profiles.
 */
async function requirePastoralAccess(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;

  const roleClaim = String(req.headers["x-user-role"] ?? "");
  if (roleClaim === "superAdmin" || roleClaim === "admin" || userId === "demo-superadmin-1") {
    return userId;
  }

  // Check pastoral_role in user_profiles
  try {
    const result = await pool.query(
      `SELECT pastoral_role FROM user_profiles WHERE email = $1`,
      [userId]
    );
    const pRole = result.rows[0]?.pastoral_role;
    if (pRole === "pastor" || pRole === "recorder") return userId;
  } catch { /* fall through */ }

  res.status(403).json({ error: "Pastoral access required." });
  return null;
}

/**
 * Recorder + above. Cannot see pastoral notes or sensitive Walk data.
 * This is the minimum for recording attendance.
 */
async function requireRecorderAccess(req: Request, res: Response): Promise<string | null> {
  return requirePastoralAccess(req, res);
}

/**
 * Pastor/admin only — can correct records, view pastoral notes.
 */
async function requirePastorAccess(req: Request, res: Response): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;

  const roleClaim = String(req.headers["x-user-role"] ?? "");
  if (roleClaim === "superAdmin" || roleClaim === "admin" || userId === "demo-superadmin-1") {
    return userId;
  }
  try {
    const result = await pool.query(
      `SELECT pastoral_role FROM user_profiles WHERE email = $1`,
      [userId]
    );
    const pRole = result.rows[0]?.pastoral_role;
    if (pRole === "pastor") return userId;
  } catch { /* fall through */ }

  res.status(403).json({ error: "Pastor or administrator access required." });
  return null;
}

// ─── Person key helpers ───────────────────────────────────────────────────────

function parsePersonKey(key: string): { personId: string; personType: store.PersonType } | null {
  if (key.startsWith("eu-")) {
    return { personId: decodeURIComponent(key.slice(3)), personType: "emmaus_user" };
  }
  if (key.startsWith("pp-")) {
    return { personId: key.slice(3), personType: "pastoral_person" };
  }
  return null;
}

// ─── People ──────────────────────────────────────────────────────────────────

pastoralRouter.get("/people", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  try {
    const people = await store.listUnifiedPeople();
    res.json(people);
  } catch (err) {
    logger.error({ err }, "pastoral: listUnifiedPeople failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.post("/people", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const { fullName, displayName, email, phone, personType, notes } =
    req.body as Record<string, string>;
  if (!fullName?.trim()) {
    res.status(400).json({ error: "fullName is required." });
    return;
  }
  try {
    const person = await store.createPastoralPerson({
      fullName: fullName.trim(),
      displayName: displayName?.trim(),
      email: email?.trim(),
      phone: phone?.trim(),
      personType: personType === "visitor" ? "visitor" : "attendance_only",
      notes: notes?.trim(),
      createdBy: userId,
    });
    res.status(201).json(person);
  } catch (err) {
    logger.error({ err }, "pastoral: createPastoralPerson failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.get("/people/:id", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  try {
    const person = await store.getPastoralPerson(id);
    if (!person) {
      res.status(404).json({ error: "Person not found." });
      return;
    }
    res.json(person);
  } catch (err) {
    logger.error({ err }, "pastoral: getPastoralPerson failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.patch("/people/:id", async (req: Request, res: Response) => {
  const userId = await requirePastorAccess(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  const { fullName, displayName, email, phone, personType, notes, isActive } =
    req.body as Record<string, unknown>;
  try {
    const person = await store.getPastoralPerson(id);
    if (!person) { res.status(404).json({ error: "Person not found." }); return; }
    await store.updatePastoralPerson(id, {
      fullName:    fullName    != null ? String(fullName).trim()    : undefined,
      displayName: displayName != null ? String(displayName).trim() : undefined,
      email:       email       != null ? String(email).trim()       : undefined,
      phone:       phone       != null ? String(phone).trim()       : undefined,
      personType:  personType  != null ? String(personType)          : undefined,
      notes:       notes       != null ? String(notes)               : undefined,
      isActive:    isActive    != null ? Boolean(isActive)            : undefined,
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "pastoral: updatePastoralPerson failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.post("/people/:id/link", async (req: Request, res: Response) => {
  const userId = await requirePastorAccess(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  const { linkedUserId } = req.body as { linkedUserId: string };
  if (!linkedUserId?.trim()) {
    res.status(400).json({ error: "linkedUserId is required." });
    return;
  }
  try {
    // Verify the Emmaus user exists
    const userCheck = await pool.query(
      `SELECT email FROM user_profiles WHERE email = $1`,
      [linkedUserId.trim()]
    );
    if (userCheck.rows.length === 0) {
      res.status(404).json({ error: "Emmaus user not found." });
      return;
    }
    const result = await store.linkPersonToUser(id, linkedUserId.trim(), userId);
    if (!result.ok) {
      res.status(409).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "pastoral: linkPersonToUser failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Meeting Types ────────────────────────────────────────────────────────────

pastoralRouter.get("/meeting-types", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  try {
    const includeInactive = req.query.includeInactive === "true";
    const types = await store.listMeetingTypes(includeInactive);
    res.json(types);
  } catch (err) {
    logger.error({ err }, "pastoral: listMeetingTypes failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.post("/meeting-types", async (req: Request, res: Response) => {
  const userId = await requirePastorAccess(req, res);
  if (!userId) return;
  const { name, category, description, usualDay, usualTime, responsibleMinistry,
          trackAttendance, careSignalEnabled, isSensitive } =
    req.body as Record<string, unknown>;
  if (!String(name ?? "").trim()) {
    res.status(400).json({ error: "name is required." });
    return;
  }
  try {
    const mt = await store.createMeetingType({
      name: String(name).trim(),
      category:            category != null ? String(category) : undefined,
      description:         description != null ? String(description) : undefined,
      usualDay:            usualDay != null ? String(usualDay) : undefined,
      usualTime:           usualTime != null ? String(usualTime) : undefined,
      responsibleMinistry: responsibleMinistry != null ? String(responsibleMinistry) : undefined,
      trackAttendance:     trackAttendance != null ? Boolean(trackAttendance) : undefined,
      careSignalEnabled:   careSignalEnabled != null ? Boolean(careSignalEnabled) : undefined,
      isSensitive:         isSensitive != null ? Boolean(isSensitive) : undefined,
      createdBy: userId,
    });
    res.status(201).json(mt);
  } catch (err) {
    logger.error({ err }, "pastoral: createMeetingType failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.patch("/meeting-types/:id", async (req: Request, res: Response) => {
  const userId = await requirePastorAccess(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  try {
    await store.updateMeetingType(id, req.body as Parameters<typeof store.updateMeetingType>[1]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "pastoral: updateMeetingType failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Sessions ─────────────────────────────────────────────────────────────────

pastoralRouter.get("/sessions", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  try {
    const sessions = await store.listSessions({
      meetingTypeId: req.query.meetingTypeId ? String(req.query.meetingTypeId) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 50,
    });
    res.json(sessions);
  } catch (err) {
    logger.error({ err }, "pastoral: listSessions failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.post("/sessions", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const { meetingTypeId, sessionDate, startTime, location, notes } =
    req.body as Record<string, string>;
  if (!meetingTypeId || !sessionDate) {
    res.status(400).json({ error: "meetingTypeId and sessionDate are required." });
    return;
  }
  try {
    const session = await store.createSession({
      meetingTypeId, sessionDate, startTime, location, notes, createdBy: userId,
    });
    res.status(201).json(session);
  } catch (err) {
    logger.error({ err }, "pastoral: createSession failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.get("/sessions/:id", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  try {
    const session = await store.getSession(id);
    if (!session) { res.status(404).json({ error: "Session not found." }); return; }
    res.json(session);
  } catch (err) {
    logger.error({ err }, "pastoral: getSession failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.patch("/sessions/:id", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const id = String(req.params.id);
  try {
    await store.updateSession(id, req.body as Parameters<typeof store.updateSession>[1]);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "pastoral: updateSession failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Attendance Register ──────────────────────────────────────────────────────

pastoralRouter.get("/sessions/:id/register", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const sessionId = String(req.params.id);
  try {
    const records = await store.getRegister(sessionId);
    res.json(records);
  } catch (err) {
    logger.error({ err }, "pastoral: getRegister failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.post("/sessions/:id/register", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const sessionId = String(req.params.id);
  const { personId, personType, status, reason } =
    req.body as {
      personId: string;
      personType: store.PersonType;
      status: store.AttendanceStatus;
      reason?: string;
    };
  const VALID_STATUSES: store.AttendanceStatus[] = [
    "present", "visitor", "apology", "absent", "not_expected",
  ];
  if (!personId || !personType || !VALID_STATUSES.includes(status)) {
    res.status(400).json({
      error: "personId, personType, and valid status are required.",
    });
    return;
  }
  try {
    const result = await store.upsertAttendance({
      sessionId, personId, personType, status, recordedBy: userId, reason,
    });
    res.json({ ok: true, ...result });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("cancelled")) {
      res.status(409).json({ error: err.message });
      return;
    }
    logger.error({ err }, "pastoral: upsertAttendance failed");
    res.status(500).json({ error: "Server error" });
  }
});

/** DELETE removes a single attendance record (correcting an accidental entry). */
pastoralRouter.delete("/sessions/:id/register/:personKey", async (req: Request, res: Response) => {
  const userId = await requirePastorAccess(req, res);
  if (!userId) return;
  const sessionId = String(req.params.id);
  const parsed = parsePersonKey(String(req.params.personKey));
  if (!parsed) { res.status(400).json({ error: "Invalid personKey format." }); return; }
  try {
    await store.deleteAttendanceRecord(sessionId, parsed.personId, parsed.personType, userId);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "pastoral: deleteAttendanceRecord failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Expectations ─────────────────────────────────────────────────────────────

pastoralRouter.get("/people/:personKey/expectations", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const parsed = parsePersonKey(String(req.params.personKey));
  if (!parsed) { res.status(400).json({ error: "Invalid personKey." }); return; }
  try {
    const exps = await store.getExpectations(parsed.personId, parsed.personType);
    res.json(exps);
  } catch (err) {
    logger.error({ err }, "pastoral: getExpectations failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.put("/people/:personKey/expectations", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const parsed = parsePersonKey(String(req.params.personKey));
  if (!parsed) { res.status(400).json({ error: "Invalid personKey." }); return; }
  const { meetingTypeId, expectation, notes } = req.body as {
    meetingTypeId: string;
    expectation: store.Expectation;
    notes?: string;
  };
  if (!meetingTypeId || !expectation) {
    res.status(400).json({ error: "meetingTypeId and expectation are required." });
    return;
  }
  try {
    await store.setExpectation({
      personId: parsed.personId, personType: parsed.personType,
      meetingTypeId, expectation, notes, createdBy: userId,
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "pastoral: setExpectation failed");
    res.status(500).json({ error: "Server error" });
  }
});

pastoralRouter.delete("/people/:personKey/expectations/:meetingTypeId", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const parsed = parsePersonKey(String(req.params.personKey));
  if (!parsed) { res.status(400).json({ error: "Invalid personKey." }); return; }
  const meetingTypeId = String(req.params.meetingTypeId);
  try {
    await store.removeExpectation(parsed.personId, parsed.personType, meetingTypeId);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "pastoral: removeExpectation failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Person attendance history ────────────────────────────────────────────────

pastoralRouter.get("/people/:personKey/attendance-history", async (req: Request, res: Response) => {
  const userId = await requireRecorderAccess(req, res);
  if (!userId) return;
  const parsed = parsePersonKey(String(req.params.personKey));
  if (!parsed) { res.status(400).json({ error: "Invalid personKey." }); return; }
  try {
    const history = await store.getPersonAttendanceHistory(
      parsed.personId, parsed.personType, Number(req.query.limit ?? 50)
    );
    res.json(history);
  } catch (err) {
    logger.error({ err }, "pastoral: getPersonAttendanceHistory failed");
    res.status(500).json({ error: "Server error" });
  }
});

// ─── Audit log ────────────────────────────────────────────────────────────────

pastoralRouter.get("/audit-log", async (req: Request, res: Response) => {
  const userId = await requirePastorAccess(req, res);
  if (!userId) return;
  try {
    const log = await store.getPastoralAuditLog({
      entityType: req.query.entityType ? String(req.query.entityType) : undefined,
      entityId:   req.query.entityId   ? String(req.query.entityId)   : undefined,
      personId:   req.query.personId   ? String(req.query.personId)   : undefined,
      limit:      req.query.limit      ? Number(req.query.limit)      : 100,
    });
    res.json(log);
  } catch (err) {
    logger.error({ err }, "pastoral: getPastoralAuditLog failed");
    res.status(500).json({ error: "Server error" });
  }
});
