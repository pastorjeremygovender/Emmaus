/**
 * devotionals-api.ts — frontend client for Daily Devotionals endpoints.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api/devotionals${path}`;
}

interface RequestOptions extends RequestInit {
  userId?: string;
  userRole?: string;
}

async function request<T>(url: string, options?: RequestOptions): Promise<T> {
  const { userId, userRole, ...fetchOptions } = options ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  };
  if (userId) headers["X-User-Id"] = userId;
  if (userRole) headers["X-User-Role"] = userRole;

  const res = await fetch(url, {
    credentials: "include",
    ...fetchOptions,
    headers,
  });
  if (!res.ok) {
    const body = await res.text();
    // Never surface raw HTML or "Cannot POST" strings — extract a clean message
    const clean = body.startsWith("<") || body.startsWith("Cannot")
      ? `HTTP ${res.status}`
      : body;
    throw new Error(clean || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DevotionalSeries {
  id: string;
  title: string;
  description: string | null;
  seriesType: string;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

export interface DevotionalEntry {
  id: string;
  seriesId: string;
  dayNumber: number;
  title: string;
  scriptureReference: string | null;
  greeting: string | null;
  considerThis: string | null;
  prayer: string | null;
  nextStep: string | null;
  closing: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DevotionalProgress {
  id: string;
  userId: string;
  seriesId: string;
  currentDay: number;
  completedDays: number[];
  startedAt: string;
  updatedAt: string;
}

export interface SeriesWithEntries extends DevotionalSeries {
  entries: DevotionalEntry[];
}

// ─── Admin: Series ────────────────────────────────────────────────────────────

// ─── Auth context helper ──────────────────────────────────────────────────────
// All admin mutations accept an optional auth bag so the component can forward
// the current user's ID and role without coupling this file to AuthContext.

export interface AdminAuth {
  userId: string;
  userRole: string;
}

// ─── Admin: Series ────────────────────────────────────────────────────────────

export function listAllSeries(auth?: AdminAuth): Promise<DevotionalSeries[]> {
  return request<DevotionalSeries[]>(apiUrl("/admin"), { userId: auth?.userId, userRole: auth?.userRole });
}

export function getSeriesWithEntries(id: string, auth?: AdminAuth): Promise<SeriesWithEntries> {
  return request<SeriesWithEntries>(apiUrl(`/${id}`), { userId: auth?.userId, userRole: auth?.userRole });
}

export function createSeries(
  data: { title: string; description?: string; seriesType?: string },
  auth?: AdminAuth
): Promise<DevotionalSeries> {
  return request<DevotionalSeries>(apiUrl("/"), {
    method: "POST",
    body: JSON.stringify(data),
    userId: auth?.userId,
    userRole: auth?.userRole,
  });
}

export function updateSeries(
  id: string,
  data: Partial<Pick<DevotionalSeries, "title" | "description" | "seriesType" | "status">>,
  auth?: AdminAuth
): Promise<DevotionalSeries> {
  return request<DevotionalSeries>(apiUrl(`/${id}`), {
    method: "PATCH",
    body: JSON.stringify(data),
    userId: auth?.userId,
    userRole: auth?.userRole,
  });
}

export function archiveSeries(id: string, auth?: AdminAuth): Promise<void> {
  return request<void>(apiUrl(`/${id}`), { method: "DELETE", userId: auth?.userId, userRole: auth?.userRole });
}

export function permanentDeleteSeries(id: string, auth?: AdminAuth): Promise<void> {
  return request<void>(apiUrl(`/${id}/permanent`), { method: "DELETE", userId: auth?.userId, userRole: auth?.userRole });
}

// ─── Admin: Entries ───────────────────────────────────────────────────────────

export function saveEntry(
  seriesId: string,
  dayNumber: number,
  data: Partial<Pick<DevotionalEntry, "title" | "scriptureReference" | "greeting" | "considerThis" | "prayer" | "nextStep" | "closing" | "status">>,
  auth?: AdminAuth
): Promise<DevotionalEntry> {
  return request<DevotionalEntry>(apiUrl(`/${seriesId}/entries/${dayNumber}`), {
    method: "PUT",
    body: JSON.stringify(data),
    userId: auth?.userId,
    userRole: auth?.userRole,
  });
}

export function deleteEntry(seriesId: string, dayNumber: number, auth?: AdminAuth): Promise<void> {
  return request<void>(apiUrl(`/${seriesId}/entries/${dayNumber}`), {
    method: "DELETE",
    userId: auth?.userId,
    userRole: auth?.userRole,
  });
}

// ─── Member: Discovery ────────────────────────────────────────────────────────

export function listPublishedSeries(): Promise<DevotionalSeries[]> {
  return request<DevotionalSeries[]>(apiUrl("/"));
}

// ─── Member: Progress ─────────────────────────────────────────────────────────

export function getProgress(seriesId: string): Promise<DevotionalProgress | null> {
  return request<DevotionalProgress | null>(apiUrl(`/${seriesId}/progress`));
}

export function getAllProgress(): Promise<DevotionalProgress[]> {
  return request<DevotionalProgress[]>(apiUrl("/progress/all"));
}

export function startSeries(seriesId: string): Promise<DevotionalProgress> {
  return request<DevotionalProgress>(apiUrl(`/${seriesId}/start`), { method: "POST" });
}

export function markDayComplete(
  seriesId: string,
  day: number
): Promise<DevotionalProgress> {
  return request<DevotionalProgress>(apiUrl(`/${seriesId}/progress/complete`), {
    method: "POST",
    body: JSON.stringify({ day }),
  });
}
