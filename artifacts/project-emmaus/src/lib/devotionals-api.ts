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
  const { userId: _userId, userRole: _userRole, ...fetchOptions } = options ?? {};
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  };

  const res = await fetch(url, {
    credentials: "include",
    cache: "no-store",
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
  /** Set when admin opts-in to notifying members on publish (Smart Content Indicators). */
  notifyPublishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  displayOrder: number;
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
  /** Optional per-entry display label (e.g. "1 January"). Overrides "Day N" when set. */
  displayLabel?: string | null;
  /** Optional share image — object-storage path ("/objects/…"). Members see a "Take this with you" card. */
  shareImageUrl?: string | null;
  status: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  displayOrder: number;
}

export interface DevotionalProgress {
  id: string;
  userId: string;
  seriesId: string;
  currentDay: number;
  completedDays: number[];
  startedAt: string;
  updatedAt: string;
  /** Set when the member opens the content — used for UPDATED badge computation. */
  lastOpenedAt?: string | null;
  /**
   * When true the card is hidden from Today's Steps without losing progress.
   * Set via POST /api/engagements/devotional/:id/hide; cleared automatically
   * when the member opens the content from Next Steps.
   */
  hidden_from_today?: boolean;
}

export interface SeriesWithEntries extends DevotionalSeries {
  entries: DevotionalEntry[];
}

export interface DevotionalEntryGroup {
  id: string;
  seriesId: string;
  title: string;
  description: string | null;
  status: string;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
  items: DevotionalEntry[];
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

export function getSeriesWithEntries(id: string, auth?: AdminAuth | MemberAuth): Promise<SeriesWithEntries> {
  // Read-only route — only userId is needed for requireAuth; userRole is ignored.
  const userRole = auth && 'userRole' in auth ? (auth as AdminAuth).userRole : undefined;
  return request<SeriesWithEntries>(apiUrl(`/${id}`), { userId: auth?.userId, userRole });
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
  data: Partial<Pick<DevotionalSeries, "title" | "description" | "seriesType" | "status" | "displayOrder">> & { notifyMembers?: boolean },
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
  return request<void>(apiUrl(`/${id}/permanent`), {
    method: "DELETE",
    body: JSON.stringify({ confirm: "PERMANENTLY_DELETE" }),
    userId: auth?.userId,
    userRole: auth?.userRole,
  });
}

// ─── Admin: Entries ───────────────────────────────────────────────────────────

export function saveEntry(
  seriesId: string,
  dayNumber: number,
  data: Partial<Pick<DevotionalEntry, "title" | "scriptureReference" | "greeting" | "considerThis" | "prayer" | "nextStep" | "closing" | "displayLabel" | "shareImageUrl" | "status" | "displayOrder">>,
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

export interface BulkLabelsResult {
  updated: number;
  previewFirst: string | null;
  previewLast: string | null;
}

export function bulkGenerateEntryLabels(
  seriesId: string,
  opts: { startDate: string; format: string; overwriteExisting: boolean },
  auth?: AdminAuth
): Promise<BulkLabelsResult> {
  return request<BulkLabelsResult>(apiUrl(`/${seriesId}/entries/bulk-labels`), {
    method: "POST",
    body: JSON.stringify(opts),
    userId: auth?.userId,
    userRole: auth?.userRole,
  });
}

// ─── Entry groups ─────────────────────────────────────────────────────────────

export function listDevotionalEntryGroups(
  seriesId: string,
  auth?: AdminAuth | MemberAuth,
): Promise<DevotionalEntryGroup[]> {
  const userRole = auth && 'userRole' in auth ? auth.userRole : undefined;
  return request<DevotionalEntryGroup[]>(apiUrl(`/${seriesId}/groups`), {
    userId: auth?.userId,
    userRole,
  });
}

export function createDevotionalEntryGroup(
  seriesId: string,
  data: { title: string; description?: string; status?: string; displayOrder?: number },
  auth?: AdminAuth,
): Promise<DevotionalEntryGroup> {
  return request<DevotionalEntryGroup>(apiUrl(`/${seriesId}/groups`), {
    method: "POST",
    body: JSON.stringify(data),
    userId: auth?.userId,
    userRole: auth?.userRole,
  });
}

export function updateDevotionalEntryGroup(
  seriesId: string,
  groupId: string,
  data: Partial<Pick<DevotionalEntryGroup, "title" | "description" | "status" | "displayOrder">>,
  auth?: AdminAuth,
): Promise<DevotionalEntryGroup> {
  return request<DevotionalEntryGroup>(apiUrl(`/${seriesId}/groups/${groupId}`), {
    method: "PATCH",
    body: JSON.stringify(data),
    userId: auth?.userId,
    userRole: auth?.userRole,
  });
}

export function deleteDevotionalEntryGroup(
  seriesId: string,
  groupId: string,
  auth?: AdminAuth,
): Promise<void> {
  return request<void>(apiUrl(`/${seriesId}/groups/${groupId}`), {
    method: "DELETE",
    userId: auth?.userId,
    userRole: auth?.userRole,
  });
}

export function saveDevotionalEntryGroupItems(
  seriesId: string,
  groupId: string,
  entryIds: string[],
  auth?: AdminAuth,
): Promise<DevotionalEntryGroup> {
  return request<DevotionalEntryGroup>(apiUrl(`/${seriesId}/groups/${groupId}/items`), {
    method: "PUT",
    body: JSON.stringify({ entryIds }),
    userId: auth?.userId,
    userRole: auth?.userRole,
  });
}

// ─── Member auth bag ──────────────────────────────────────────────────────────
// Member routes rely on the secure session cookie (set at login) for identity;
// the server derives the user from that cookie via requireAuth().

export interface MemberAuth {
  userId?: string;
}

// ─── Member: Discovery ────────────────────────────────────────────────────────

export function listPublishedSeries(auth?: MemberAuth): Promise<DevotionalSeries[]> {
  return request<DevotionalSeries[]>(apiUrl("/"), { userId: auth?.userId });
}

// ─── Member: Progress ─────────────────────────────────────────────────────────

export function getProgress(seriesId: string, auth?: MemberAuth): Promise<DevotionalProgress | null> {
  return request<DevotionalProgress | null>(apiUrl(`/${seriesId}/progress`), { userId: auth?.userId });
}

export function getAllProgress(auth?: MemberAuth): Promise<DevotionalProgress[]> {
  return request<DevotionalProgress[]>(apiUrl("/progress/all"), { userId: auth?.userId });
}

export function startSeries(seriesId: string, auth?: MemberAuth): Promise<DevotionalProgress> {
  return request<DevotionalProgress>(apiUrl(`/${seriesId}/start`), {
    method: "POST",
    userId: auth?.userId,
  });
}

export function markDayComplete(
  seriesId: string,
  day: number,
  auth?: MemberAuth
): Promise<DevotionalProgress> {
  return request<DevotionalProgress>(apiUrl(`/${seriesId}/progress/complete`), {
    method: "POST",
    body: JSON.stringify({ day }),
    userId: auth?.userId,
  });
}
