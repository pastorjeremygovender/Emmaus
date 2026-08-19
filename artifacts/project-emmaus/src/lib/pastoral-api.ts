/**
 * pastoral-api.ts — typed client for the Pastoral Care API.
 *
 * All fetch calls include credentials; identity and role are derived
 * server-side from the secure session cookie.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = `${BASE}/api/pastoral`;

export type PersonType    = "emmaus_user" | "pastoral_person";
export type AttendanceStatus = "present" | "visitor" | "apology" | "absent" | "not_expected";
export type SessionStatus = "scheduled" | "completed" | "cancelled";
export type Expectation   = "expected" | "not_expected";

export interface AuthHeaders {
  userId: string;
  userRole: string;
}

function headers(_auth: AuthHeaders): HeadersInit {
  return {
    "Content-Type":  "application/json",
  };
}

async function apiFetch<T>(
  path: string,
  method: string,
  auth: AuthHeaders,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: headers(auth),
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as { error: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UnifiedPerson {
  id: string;
  sourceId: string;
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

export interface EmmausAccount {
  id: string;
  email: string;
  preferredName: string;
  role: "user" | "admin" | "superAdmin";
  joinedAt: string;
  lastActiveAt: string;
  currentJourneyId: string | null;
  currentJourneyTitle: string | null;
  currentDay: number | null;
  daysWalking: number;
  completedJourneys: string[];
  reflectionCount: number;
}

export interface PastoralPerson {
  id: string;
  fullName: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  linkedUserId: string | null;
  personType: "attendance_only" | "visitor";
  notes: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MeetingType {
  id: string;
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
  createdAt: string;
}

export interface MeetingSession {
  id: string;
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
  createdAt: string;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  personId: string;
  personType: PersonType;
  status: AttendanceStatus;
  recordedBy: string;
  recordedAt: string;
  updatedBy: string | null;
  updatedAt: string;
  personName?: string;
  personEmail?: string | null;
}

export interface AttendanceExpectation {
  id: string;
  personId: string;
  personType: PersonType;
  meetingTypeId: string;
  meetingTypeName?: string;
  expectation: Expectation;
  notes: string;
}

export interface AttendanceHistoryItem {
  sessionId: string;
  sessionDate: string;
  meetingTypeName: string;
  status: AttendanceStatus;
  recordedAt: string;
  updatedAt: string;
}

export interface PastoralAuditEntry {
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
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Encode a person as a URL-safe key for routes expecting :personKey */
export function personKey(personId: string, personType: PersonType): string {
  if (personType === "emmaus_user") return `eu-${encodeURIComponent(personId)}`;
  return `pp-${personId}`;
}

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present:      "Present",
  visitor:      "Visitor",
  apology:      "Apology",
  absent:       "Absent",
  not_expected: "Not Expected",
};

export const STATUS_COLOURS: Record<AttendanceStatus, string> = {
  present:      "bg-green-100 text-green-800",
  visitor:      "bg-blue-100 text-blue-800",
  apology:      "bg-yellow-100 text-yellow-800",
  absent:       "bg-red-100 text-red-800",
  not_expected: "bg-gray-100 text-gray-500",
};

// ─── People ──────────────────────────────────────────────────────────────────

export const listEmmausAccounts = (auth: AuthHeaders) =>
  apiFetch<EmmausAccount[]>("/accounts", "GET", auth);

export const listPeople = (auth: AuthHeaders) =>
  apiFetch<UnifiedPerson[]>("/people", "GET", auth);

export const createPastoralPerson = (
  auth: AuthHeaders,
  data: { fullName: string; displayName?: string; email?: string; phone?: string; personType?: string; notes?: string }
) => apiFetch<PastoralPerson>("/people", "POST", auth, data);

export const getPastoralPerson = (auth: AuthHeaders, id: string) =>
  apiFetch<PastoralPerson>(`/people/${id}`, "GET", auth);

export const updatePastoralPerson = (
  auth: AuthHeaders,
  id: string,
  patch: Partial<Pick<PastoralPerson, "fullName" | "displayName" | "email" | "phone" | "notes" | "isActive">>
) => apiFetch<{ ok: boolean }>(`/people/${id}`, "PATCH", auth, patch);

export const linkPersonToUser = (auth: AuthHeaders, id: string, linkedUserId: string) =>
  apiFetch<{ ok: boolean }>(`/people/${id}/link`, "POST", auth, { linkedUserId });

// ─── Meeting Types ────────────────────────────────────────────────────────────

export const listMeetingTypes = (auth: AuthHeaders, includeInactive = false) =>
  apiFetch<MeetingType[]>(`/meeting-types${includeInactive ? "?includeInactive=true" : ""}`, "GET", auth);

export const createMeetingType = (
  auth: AuthHeaders,
  data: Partial<Omit<MeetingType, "id" | "createdAt">> & { name: string }
) => apiFetch<MeetingType>("/meeting-types", "POST", auth, data);

export const updateMeetingType = (
  auth: AuthHeaders,
  id: string,
  patch: Partial<Omit<MeetingType, "id" | "createdAt">>
) => apiFetch<{ ok: boolean }>(`/meeting-types/${id}`, "PATCH", auth, patch);

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const listSessions = (auth: AuthHeaders, opts?: { meetingTypeId?: string; limit?: number }) => {
  const params = new URLSearchParams();
  if (opts?.meetingTypeId) params.set("meetingTypeId", opts.meetingTypeId);
  if (opts?.limit)         params.set("limit", String(opts.limit));
  const q = params.toString();
  return apiFetch<MeetingSession[]>(`/sessions${q ? `?${q}` : ""}`, "GET", auth);
};

export const createSession = (
  auth: AuthHeaders,
  data: { meetingTypeId: string; sessionDate: string; startTime?: string; location?: string; notes?: string }
) => apiFetch<MeetingSession>("/sessions", "POST", auth, data);

export const getSession = (auth: AuthHeaders, id: string) =>
  apiFetch<MeetingSession>(`/sessions/${id}`, "GET", auth);

export const updateSession = (
  auth: AuthHeaders,
  id: string,
  patch: Partial<Pick<MeetingSession, "sessionDate" | "startTime" | "location" | "notes" | "status">> & { force?: boolean }
) => apiFetch<{ ok: boolean }>(`/sessions/${id}`, "PATCH", auth, patch);

/** Cancel a session. Returns { requiresConfirmation, attendanceCount } if the session
 *  has existing attendance records and force is not set. */
export async function cancelSession(
  _auth: AuthHeaders,
  id: string,
  force = false
): Promise<{ ok: true } | { requiresConfirmation: true; attendanceCount: number; error: string }> {
  const res = await fetch(`${API}/sessions/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status: "cancelled", force }),
  });
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as Record<string, unknown>;
  if (res.status === 409 && data.requiresConfirmation) {
    return {
      requiresConfirmation: true,
      attendanceCount: Number(data.attendanceCount ?? 0),
      error: String(data.error ?? ""),
    };
  }
  if (!res.ok) throw new Error(String(data.error ?? `HTTP ${res.status}`));
  return { ok: true };
}
export const getRegister = (auth: AuthHeaders, sessionId: string) =>
  apiFetch<AttendanceRecord[]>(`/sessions/${sessionId}/register`, "GET", auth);

export const recordAttendance = (
  auth: AuthHeaders,
  sessionId: string,
  personId: string,
  personType: PersonType,
  status: AttendanceStatus,
  reason?: string
) =>
  apiFetch<{ ok: boolean; created: boolean; previousStatus: string | null }>(
    `/sessions/${sessionId}/register`,
    "POST",
    auth,
    { personId, personType, status, reason }
  );

export const deleteAttendanceRecord = (
  auth: AuthHeaders,
  sessionId: string,
  personId: string,
  personType: PersonType
) =>
  apiFetch<{ ok: boolean }>(
    `/sessions/${sessionId}/register/${personKey(personId, personType)}`,
    "DELETE",
    auth
  );

// ─── Expectations ─────────────────────────────────────────────────────────────

export const getExpectations = (auth: AuthHeaders, pid: string, pType: PersonType) =>
  apiFetch<AttendanceExpectation[]>(`/people/${personKey(pid, pType)}/expectations`, "GET", auth);

export const setExpectation = (
  auth: AuthHeaders,
  pid: string,
  pType: PersonType,
  meetingTypeId: string,
  expectation: Expectation,
  notes?: string
) =>
  apiFetch<{ ok: boolean }>(
    `/people/${personKey(pid, pType)}/expectations`,
    "PUT",
    auth,
    { meetingTypeId, expectation, notes }
  );

export const removeExpectation = (
  auth: AuthHeaders,
  pid: string,
  pType: PersonType,
  meetingTypeId: string
) =>
  apiFetch<{ ok: boolean }>(
    `/people/${personKey(pid, pType)}/expectations/${meetingTypeId}`,
    "DELETE",
    auth
  );

// ─── Attendance History ───────────────────────────────────────────────────────

export const getAttendanceHistory = (auth: AuthHeaders, pid: string, pType: PersonType, limit = 50) =>
  apiFetch<AttendanceHistoryItem[]>(
    `/people/${personKey(pid, pType)}/attendance-history?limit=${limit}`,
    "GET",
    auth
  );

export interface DiscipleshipJourney {
  journeyId: string;
  title: string;
  journeyType: string;
  currentDay: number;
  totalDays: number;
  completedDays: number;
  status: string;
  startedAt: string | null;
  updatedAt: string | null;
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
  // Visit info
  visitDate?: string;
  visitReason?: string;
  visitScheduledAt?: string;
  visitCompleted: boolean;
  visitNote?: string;
  visitCompletedAt?: string | null;
}

export const listCareSignals = (
  auth: AuthHeaders,
  opts?: { includesDismissed?: boolean; withVisit?: boolean; personId?: string; limit?: number }
) => {
  const p = new URLSearchParams();
  if (opts?.includesDismissed) p.set("includesDismissed", "true");
  if (opts?.withVisit)         p.set("withVisit", "true");
  if (opts?.personId)          p.set("personId", opts.personId);
  if (opts?.limit)             p.set("limit", String(opts.limit));
  return apiFetch<CareSignal[]>(`/care-signals${p.toString() ? `?${p}` : ""}`, "GET", auth);
};

export const generateCareSignals = (auth: AuthHeaders, sessionId?: string) =>
  apiFetch<{ ok: boolean; created: number; sessionsScanned?: number }>(
    "/care-signals/generate",
    "POST",
    auth,
    sessionId ? { sessionId } : {}
  );

export const dismissCareSignal = (auth: AuthHeaders, id: string) =>
  apiFetch<{ ok: boolean }>(`/care-signals/${id}/dismiss`, "PATCH", auth);

export const scheduleVisit = (
  auth: AuthHeaders,
  id: string,
  visitDate: string,
  reason: string
) =>
  apiFetch<{ ok: boolean }>(
    `/care-signals/${id}/schedule-visit`,
    "PATCH",
    auth,
    { visitDate, reason }
  );

export interface VisitHistoryItem {
  id: string;
  visitDate: string;
  reason: string;
  scheduledBy: string;
  scheduledAt: string;
  isCompleted: boolean;
  completedNote: string;
  completedAt: string | null;
}

export const completeVisit = (
  auth: AuthHeaders,
  visitEntryId: string,
  personId: string,
  note: string
) =>
  apiFetch<{ ok: boolean }>(
    `/visits/${visitEntryId}/complete`,
    "PATCH",
    auth,
    { personId, note }
  );
export const getPastoralAuditLog = (auth: AuthHeaders, opts?: {
  personId?: string;
  sessionId?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}) => {
  const p = new URLSearchParams();
  if (opts?.personId)   p.set("personId",   opts.personId);
  if (opts?.sessionId)  p.set("sessionId",  opts.sessionId);
  if (opts?.entityType) p.set("entityType", opts.entityType);
  if (opts?.dateFrom)   p.set("dateFrom",   opts.dateFrom);
  if (opts?.dateTo)     p.set("dateTo",     opts.dateTo);
  if (opts?.limit)      p.set("limit",      String(opts.limit));
  return apiFetch<PastoralAuditEntry[]>(`/audit-log${p.toString() ? `?${p}` : ""}`, "GET", auth);
};

/** Restore a cancelled session back to completed. */
export const restoreSession = (auth: AuthHeaders, id: string) =>
  apiFetch<{ ok: boolean }>(`/sessions/${id}`, "PATCH", auth, { status: "completed" });

export type DiscipleshipSummary =
  | { available: false; reason?: string }
  | {
      available: true;
      userId: string;
      journeys: DiscipleshipJourney[];
      rooms: DiscipleshipRoom[];
      devotionals: DiscipleshipDevotional[];
      sermonCompanions: DiscipleshipSermonCompanion[];
    };

export interface DiscipleshipDevotional {
  seriesId: string;
  title: string;
  currentDay: number;
  completedCount: number;
  status: string;
  startedAt: string | null;
  updatedAt: string | null;
}

export interface DiscipleshipRoom {
  roomId: string;
  roomName: string;
  role: string;
  joinedAt: string | null;
}

export const getDiscipleshipSummary = (auth: AuthHeaders, pid: string, pType: PersonType) =>
  apiFetch<DiscipleshipSummary>(
    `/people/${personKey(pid, pType)}/discipleship-summary`,
    "GET",
    auth
  );

export interface DiscipleshipSermonCompanion {
  companionId: string;
  title: string;
  currentDay: number;
  totalDays: number;
  completedCount: number;
  startedAt: string | null;
  updatedAt: string | null;
}

// ─── Person Profile Summary ───────────────────────────────────────────────────

export interface PersonProfileSummary {
  engagementStatus: "active" | "fading" | "needs_care" | "unknown";
  lastAttendanceDate: string | null;
  daysSinceLastAttendance: number | null;
  openCareSignalCount: number;
  activeWalkTitle: string | null;
  activeWalkProgress: string | null;
  lastEmmausActivityDate: string | null;
  pastoralSummary: string;
  attendanceTrend: "consistent" | "improving" | "declining" | "new" | "unknown";
  activeWalkCount: number;
  completedWalkCount: number;
  activeDevotionalCount: number;
  roomCount: number;
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
  date: string;          // ISO datetime
  eventType: TimelineEventType;
  title: string;
  subtitle?: string;
}

export const getJourneyTimeline = (auth: AuthHeaders, personId: string, personType: PersonType) =>
  apiFetch<TimelineEvent[]>(`/people/${personKey(personId, personType)}/journey-timeline`, "GET", auth);

// ─── Spiritual Rhythm ─────────────────────────────────────────────────────────

export interface RhythmDay {
  date: string;          // YYYY-MM-DD
  level: 0 | 1 | 2 | 3; // 0 = none, 3 = very active
}

export const getSpiritualRhythm = (auth: AuthHeaders, personId: string, personType: PersonType) =>
  apiFetch<RhythmDay[]>(`/people/${personKey(personId, personType)}/spiritual-rhythm`, "GET", auth);

// ─── Attendance Rhythm ────────────────────────────────────────────────────────

export interface MonthlyAttendance {
  month: string;        // "Jan 2026"
  yearMonth: string;    // "2026-01"
  attended: number;
  totalMarked: number;
  absent: number;
}

export const getAttendanceRhythm = (auth: AuthHeaders, personId: string, personType: PersonType) =>
  apiFetch<MonthlyAttendance[]>(`/people/${personKey(personId, personType)}/attendance-rhythm`, "GET", auth);

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

export const listMilestones = (auth: AuthHeaders, personId: string, personType: PersonType) =>
  apiFetch<MilestoneItem[]>(`/people/${personKey(personId, personType)}/milestones`, "GET", auth);

export const createMilestone = (
  auth: AuthHeaders,
  personId: string,
  personType: PersonType,
  body: { milestoneType: string; title: string; milestoneDate?: string; notes?: string },
) => apiFetch<MilestoneItem>(`/people/${personKey(personId, personType)}/milestones`, "POST", auth, body);

export const deleteMilestone = (
  auth: AuthHeaders,
  personId: string,
  personType: PersonType,
  milestoneId: string,
) => apiFetch<{ ok: boolean }>(`/people/${personKey(personId, personType)}/milestones/${milestoneId}`, "DELETE", auth);

/**
 * Returns the holistic spiritual-health snapshot for a person.
 * Primary answer to: "How is this person doing, and should someone follow up?"
 */
export const getProfileSummary = (
  auth: AuthHeaders,
  personId: string,
  personType: PersonType,
): Promise<PersonProfileSummary> => {
  const key = personKey(personId, personType);
  return apiFetch<PersonProfileSummary>(`/people/${key}/profile-summary`, "GET", auth);
};

/**
 * Returns all visits for a person (scheduled + completion status) via the
 * server-side join endpoint.  Pass the full personKey (e.g. "pp-uuid" or
 * "eu-email%40example.com") so the route can scope the query correctly.
 */
export const getVisitHistory = (
  auth: AuthHeaders,
  pKey: string
): Promise<VisitHistoryItem[]> =>
  apiFetch<VisitHistoryItem[]>(`/people/${pKey}/visits`, "GET", auth);

// ─── Discipleship Signals ─────────────────────────────────────────────────────

export type SignalCategory =
  | "celebration"
  | "growth"
  | "attention"
  | "follow_up"
  | "significant";

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

export interface PersonSignalCounts {
  personId: string;
  personType: PersonType;
  significant: number;
  followUp: number;
  attention: number;
  growth: number;
  celebration: number;
  total: number;
}
export const listDiscipleshipSignals = (
  auth: AuthHeaders,
  opts?: {
    category?: SignalCategory;
    status?: SignalStatus | SignalStatus[];
    personId?: string;
    personType?: PersonType;
    limit?: number;
  }
): Promise<DiscipleshipSignal[]> => {
  const p = new URLSearchParams();
  if (opts?.category) p.set("category", opts.category);
  if (opts?.status) {
    const ss = Array.isArray(opts.status) ? opts.status : [opts.status];
    p.set("status", ss.join(","));
  }
  if (opts?.personId)   p.set("personId",   opts.personId);
  if (opts?.personType) p.set("personType", opts.personType);
  if (opts?.limit)      p.set("limit",      String(opts.limit));
  return apiFetch<DiscipleshipSignal[]>(
    `/discipleship-signals${p.toString() ? `?${p}` : ""}`,
    "GET",
    auth,
  );
};

export interface EngineRunRecord {
  id: number;
  churchId: string;
  triggeredBy: 'scheduler' | 'manual';
  processed: number;
  created: number;
  updated: number;
  resolved: number;
  ranAt: string;
}

export const getEngineStatus = (auth: AuthHeaders) =>
  apiFetch<{ ok: boolean; lastRun: EngineRunRecord | null }>(
    "/discipleship-signals/engine-status",
    "GET",
    auth,
  );

export const runSignalsEngine = (
  auth: AuthHeaders,
  opts?: { personId?: string; personType?: PersonType }
) =>
  apiFetch<{ ok: boolean; processed: number; created: number; updated: number; resolved: number }>(
    "/discipleship-signals/run-engine",
    "POST",
    auth,
    opts ?? {},
  );

export const updateSignalStatus = (
  auth: AuthHeaders,
  id: string,
  status: SignalStatus
) =>
  apiFetch<{ ok: boolean }>(`/discipleship-signals/${id}/status`, "PATCH", auth, { status });

export const updateSignalNote = (auth: AuthHeaders, id: string, note: string) =>
  apiFetch<{ ok: boolean }>(`/discipleship-signals/${id}/note`, "PATCH", auth, { note });

export const assignSignal = (
  auth: AuthHeaders,
  id: string,
  assignTo: string | null
) =>
  apiFetch<{ ok: boolean }>(`/discipleship-signals/${id}/assign`, "PATCH", auth, { assignTo });

export interface ThresholdDef {
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
}
export interface DashTodayStats {
  attendance: { present: number; expected: number; sessionCount: number };
  activeWalks: number;
  activeDevotionals: number;
  devotionalActivityToday: number;
  newPeopleThisWeek: { pastoralPersons: number; emmausAccounts: number };
  followUpSignalCount: number;
}

export interface DashMovementCard {
  id: string;
  label: string;
  count: number;
  sublabel?: string;
}

export interface DashAttendancePoint {
  date: string;
  present: number;
  expected: number;
  meetingType: string;
}

export interface DashTimePoint { date: string; count: number; }

export interface DashEngagementData {
  attendanceLast12: DashAttendancePoint[];
  devotionalLast30: DashTimePoint[];
  walkStartsLast90: DashTimePoint[];
  walkCompletionsLast90: DashTimePoint[];
  roomJoinsLast90: DashTimePoint[];
}

export interface DashNewBeliever {
  userId: string;
  personName: string;
  journeyTitle: string;
  completedAt: string;
  hasBaptism: boolean;
  hasRoom: boolean;
}

export interface DashActivityItem {
  id: string;
  type: string;
  personName: string;
  detail: string;
  eventAt: string;
}

const dashFetch = <T>(path: string, auth: AuthHeaders): Promise<T> =>
  apiFetch<T>(`/dashboard${path}`, "GET", auth);

export const getDashTodayStats    = (auth: AuthHeaders) => dashFetch<DashTodayStats>("/today-stats", auth);
export const getDashMovement      = (auth: AuthHeaders) => dashFetch<DashMovementCard[]>("/movement", auth);
export const getDashEngagement    = (auth: AuthHeaders) => dashFetch<DashEngagementData>("/engagement", auth);
export const getDashNewBelievers  = (auth: AuthHeaders) => dashFetch<DashNewBeliever[]>("/new-believers", auth);
export const getDashActivity      = (auth: AuthHeaders) => dashFetch<DashActivityItem[]>("/activity", auth);

export const listSignalRuleConfig = (auth: AuthHeaders): Promise<SignalRuleWithConfig[]> =>
  apiFetch<SignalRuleWithConfig[]>("/signal-rule-config", "GET", auth);

/** Returns open discipleship-signal counts grouped by person and category. */
export const getDiscipleshipSignalCounts = (auth: AuthHeaders) =>
  apiFetch<PersonSignalCounts[]>("/discipleship-signals/counts", "GET", auth);

export const updateSignalRuleConfig = (
  auth: AuthHeaders,
  ruleId: string,
  patch: { enabled: boolean; thresholds?: Record<string, number> }
): Promise<{ ok: boolean }> =>
  apiFetch<{ ok: boolean }>(`/signal-rule-config/${ruleId}`, "PATCH", auth, patch);

export interface SignalRuleWithConfig {
  id: string;
  category: SignalCategory;
  title: string;
  description: string;
  isStateBased: boolean;
  defaultEnabled: boolean;
  enabled: boolean;
  thresholds: Record<string, number>;
  thresholdDefs?: ThresholdDef[];
}
