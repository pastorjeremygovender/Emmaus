/**
 * pastoral-api.ts — typed client for the Pastoral Care API.
 *
 * All fetch calls include credentials and X-User-Id / X-User-Role headers
 * sourced from the AuthContext pattern used elsewhere in the app.
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

function headers(auth: AuthHeaders): HeadersInit {
  return {
    "Content-Type":  "application/json",
    "X-User-Id":     auth.userId,
    "X-User-Role":   auth.userRole,
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
  churchId: string;
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
  patch: Partial<Pick<MeetingSession, "sessionDate" | "startTime" | "location" | "notes" | "status">>
) => apiFetch<{ ok: boolean }>(`/sessions/${id}`, "PATCH", auth, patch);

// ─── Attendance ───────────────────────────────────────────────────────────────

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

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const getPastoralAuditLog = (auth: AuthHeaders, opts?: { personId?: string; entityType?: string; limit?: number }) => {
  const p = new URLSearchParams();
  if (opts?.personId)   p.set("personId",   opts.personId);
  if (opts?.entityType) p.set("entityType", opts.entityType);
  if (opts?.limit)      p.set("limit",      String(opts.limit));
  return apiFetch<PastoralAuditEntry[]>(`/audit-log${p.toString() ? `?${p}` : ""}`, "GET", auth);
};
