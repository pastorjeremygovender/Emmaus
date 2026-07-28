/**
 * devotionals-api.ts — frontend client for Daily Devotionals endpoints.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api/devotionals${path}`;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `HTTP ${res.status}`);
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

export function listAllSeries(): Promise<DevotionalSeries[]> {
  return request<DevotionalSeries[]>(apiUrl("/admin"));
}

export function getSeriesWithEntries(id: string): Promise<SeriesWithEntries> {
  return request<SeriesWithEntries>(apiUrl(`/${id}`));
}

export function createSeries(data: {
  title: string;
  description?: string;
  seriesType?: string;
}): Promise<DevotionalSeries> {
  return request<DevotionalSeries>(apiUrl("/"), {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateSeries(
  id: string,
  data: Partial<Pick<DevotionalSeries, "title" | "description" | "seriesType" | "status">>
): Promise<DevotionalSeries> {
  return request<DevotionalSeries>(apiUrl(`/${id}`), {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function archiveSeries(id: string): Promise<void> {
  return request<void>(apiUrl(`/${id}`), { method: "DELETE" });
}

export function permanentDeleteSeries(id: string): Promise<void> {
  return request<void>(apiUrl(`/${id}/permanent`), { method: "DELETE" });
}

// ─── Admin: Entries ───────────────────────────────────────────────────────────

export function saveEntry(
  seriesId: string,
  dayNumber: number,
  data: Partial<Pick<DevotionalEntry, "title" | "scriptureReference" | "greeting" | "considerThis" | "prayer" | "nextStep" | "closing" | "status">>
): Promise<DevotionalEntry> {
  return request<DevotionalEntry>(apiUrl(`/${seriesId}/entries/${dayNumber}`), {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export function deleteEntry(seriesId: string, dayNumber: number): Promise<void> {
  return request<void>(apiUrl(`/${seriesId}/entries/${dayNumber}`), { method: "DELETE" });
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
