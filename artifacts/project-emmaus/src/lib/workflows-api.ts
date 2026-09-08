/**
 * workflows-api.ts — typed client for the Pastoral Workflows API (CP7).
 * Mirrors the endpoints in /api/workflows.
 */

const BASE = `${import.meta.env.BASE_URL}api/workflows`.replace(/\/+/g, "/").replace(":/", "://");

export interface AuthHeaders {
  "x-user-id": string;
  "x-user-role": string;
}

async function apiFetch<T>(
  path: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  _auth: AuthHeaders,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus =
  | "new" | "assigned" | "in_progress" | "waiting" | "completed" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskSource =
  | "care_signal" | "manual" | "attendance" | "walk" | "prayer_request";

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface MinistryTask {
  id: string;
  churchId: string;
  title: string;
  reason: string;
  personId: string | null;
  personType: string | null;
  source: TaskSource;
  priority: TaskPriority;
  assignedTo: string | null;
  dueDate: string | null;
  status: TaskStatus;
  notes: string;
  team: string;
  checklist: ChecklistItem[];
  signalId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface TaskTemplate {
  id: string;
  name: string;
  category: string;
  defaultTitle: string;
  suggestedQuestions: string[];
  bibleRef: string;
  prayerReminder: string;
  checklist: { id: string; label: string }[];
  isSystem: boolean;
  createdBy: string;
  createdAt: string;
}

export interface WorkflowNote {
  id: string;
  personId: string | null;
  personType: string | null;
  taskId: string | null;
  content: string;
  isConfidential: boolean;
  authorId: string;
  createdAt: string;
}

export interface TaskSuggestion {
  signalId: string;
  personId: string;
  personType: string;
  category: string;
  description: string;
  suggestedTitle: string;
  suggestedPriority: TaskPriority;
}

export interface LeaderView {
  myTasks: MinistryTask[];
  overdue: MinistryTask[];
  dueToday: MinistryTask[];
  dueTomorrow: MinistryTask[];
  upcoming: MinistryTask[];
}

export interface PastorView {
  unassigned: MinistryTask[];
  overdue: MinistryTask[];
  allActive: MinistryTask[];
  recentlyCompleted: MinistryTask[];
  workloadByLeader: { leader: string; count: number }[];
  workloadByTeam: { team: string; count: number }[];
  stats: {
    totalActive: number;
    totalOverdue: number;
    totalUnassigned: number;
    completedThisWeek: number;
  };
}

export interface SearchResult {
  kind: "task" | "note";
  id: string;
  title: string;
  excerpt: string;
  personId: string | null;
  personType: string | null;
  status?: string;
  createdAt: string;
}

export interface WorkflowReports {
  totalCompleted: number;
  completedThisWeek: number;
  completedThisMonth: number;
  avgDaysToComplete: number | null;
  outstanding: number;
  overdueCount: number;
  bySource: { source: string; count: number }[];
  byTeam: { team: string; count: number }[];
  byLeader: { leader: string; completed: number; active: number }[];
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  priority: TaskPriority;
  status: TaskStatus;
  assignedTo: string | null;
  personId: string | null;
  personType: string | null;
  team: string;
}

// ─── Task API ─────────────────────────────────────────────────────────────────

export const listTasks = (
  auth: AuthHeaders,
  params?: {
    status?: TaskStatus | "active";
    assignedTo?: string;
    personId?: string;
    personType?: string;
    team?: string;
    includeArchived?: boolean;
    overdueOnly?: boolean;
  },
) => {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.assignedTo) qs.set("assignedTo", params.assignedTo);
  if (params?.personId) qs.set("personId", params.personId);
  if (params?.personType) qs.set("personType", params.personType);
  if (params?.team) qs.set("team", params.team);
  if (params?.includeArchived) qs.set("includeArchived", "true");
  if (params?.overdueOnly) qs.set("overdueOnly", "true");
  const q = qs.toString();
  return apiFetch<MinistryTask[]>(`/tasks${q ? `?${q}` : ""}`, "GET", auth);
};

export const createTask = (
  auth: AuthHeaders,
  body: Omit<Partial<MinistryTask>, "id" | "churchId" | "createdAt" | "updatedAt" | "archivedAt"> & { title: string },
) => apiFetch<MinistryTask>("/tasks", "POST", auth, body);

export const getLeaderView = (auth: AuthHeaders) =>
  apiFetch<LeaderView>("/tasks/leader", "GET", auth);

export const getPastorView = (auth: AuthHeaders) =>
  apiFetch<PastorView>("/tasks/pastor", "GET", auth);

export const getTask = (auth: AuthHeaders, id: string) =>
  apiFetch<MinistryTask>(`/tasks/${id}`, "GET", auth);

export const updateTask = (auth: AuthHeaders, id: string, body: Partial<MinistryTask>) =>
  apiFetch<MinistryTask>(`/tasks/${id}`, "PATCH", auth, body);

export const archiveTask = (auth: AuthHeaders, id: string) =>
  apiFetch<{ ok: boolean }>(`/tasks/${id}`, "DELETE", auth);

// ─── Suggestions ──────────────────────────────────────────────────────────────

export const getSignalSuggestions = (auth: AuthHeaders) =>
  apiFetch<TaskSuggestion[]>("/suggestions", "GET", auth);

export const createTaskFromSignal = (
  auth: AuthHeaders,
  signalId: string,
  body: Partial<MinistryTask> & { title: string },
) => apiFetch<MinistryTask>(`/suggestions/${signalId}/create-task`, "POST", auth, body);

// ─── Templates ────────────────────────────────────────────────────────────────

export const listTemplates = (auth: AuthHeaders) =>
  apiFetch<TaskTemplate[]>("/templates", "GET", auth);

export const createTemplate = (auth: AuthHeaders, body: Partial<TaskTemplate> & { name: string }) =>
  apiFetch<TaskTemplate>("/templates", "POST", auth, body);

export const updateTemplate = (auth: AuthHeaders, id: string, body: Partial<TaskTemplate>) =>
  apiFetch<TaskTemplate>(`/templates/${id}`, "PATCH", auth, body);

export const deleteTemplate = (auth: AuthHeaders, id: string) =>
  apiFetch<{ ok: boolean }>(`/templates/${id}`, "DELETE", auth);

// ─── Notes ────────────────────────────────────────────────────────────────────

export const listNotes = (
  auth: AuthHeaders,
  params?: { personId?: string; personType?: string; taskId?: string; includeConfidential?: boolean },
) => {
  const qs = new URLSearchParams();
  if (params?.personId) qs.set("personId", params.personId);
  if (params?.personType) qs.set("personType", params.personType);
  if (params?.taskId) qs.set("taskId", params.taskId);
  if (params?.includeConfidential) qs.set("includeConfidential", "true");
  const q = qs.toString();
  return apiFetch<WorkflowNote[]>(`/notes${q ? `?${q}` : ""}`, "GET", auth);
};

export const createNote = (
  auth: AuthHeaders,
  body: { personId?: string; personType?: string; taskId?: string; content: string; isConfidential?: boolean },
) => apiFetch<WorkflowNote>("/notes", "POST", auth, body);

// ─── Search ───────────────────────────────────────────────────────────────────

export const searchWorkflows = (auth: AuthHeaders, q: string) =>
  apiFetch<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`, "GET", auth);

// ─── Reports ──────────────────────────────────────────────────────────────────

export const getWorkflowReports = (auth: AuthHeaders) =>
  apiFetch<WorkflowReports>("/reports", "GET", auth);

// ─── Calendar ─────────────────────────────────────────────────────────────────

export const getCalendarEvents = (auth: AuthHeaders, from?: string, to?: string) => {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  const q = qs.toString();
  return apiFetch<CalendarEvent[]>(`/calendar${q ? `?${q}` : ""}`, "GET", auth);
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const TEAMS = [
  "Pastors", "Elders", "Deacons", "Youth Leaders", "Small Group Leaders",
  "Women's Ministry", "Men's Ministry", "Volunteer Coordinators", "Made Free Leaders",
  "Attendance",
] as const;

export const SOURCE_LABELS: Record<TaskSource, string> = {
  care_signal: "Care Signal",
  manual: "Manual",
  attendance: "Attendance",
  walk: "Walk",
  prayer_request: "Prayer Request",
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  new: "New",
  assigned: "Assigned",
  in_progress: "In Progress",
  waiting: "Waiting",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};
