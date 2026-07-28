/**
 * sermon-generator-api.ts — frontend client for sermon generation endpoints.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

interface AuthHeaders {
  userId: string;
  userRole: string;
}

async function post<T>(path: string, body: Record<string, unknown>, auth: AuthHeaders): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": auth.userId,
      "X-User-Role": auth.userRole,
    },
    body: JSON.stringify({ ...body, userId: auth.userId, userRole: auth.userRole }),
  });

  if (!res.ok) {
    const body = await res.text();
    let msg: string;
    try {
      msg = (JSON.parse(body) as { error?: string }).error ?? `HTTP ${res.status}`;
    } catch {
      msg = body.startsWith("<") ? `HTTP ${res.status}` : body || `HTTP ${res.status}`;
    }
    throw new Error(msg);
  }

  return res.json();
}

async function patch<T>(path: string, body: Record<string, unknown>, auth: AuthHeaders): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": auth.userId,
      "X-User-Role": auth.userRole,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const b = await res.text();
    let msg: string;
    try {
      msg = (JSON.parse(b) as { error?: string }).error ?? `HTTP ${res.status}`;
    } catch {
      msg = b.startsWith("<") ? `HTTP ${res.status}` : b || `HTTP ${res.status}`;
    }
    throw new Error(msg);
  }

  return res.json();
}

async function getJson<T>(path: string, auth: AuthHeaders): Promise<T> {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: {
      "X-User-Id": auth.userId,
      "X-User-Role": auth.userRole,
    },
  });

  if (!res.ok) {
    const b = await res.text();
    let msg: string;
    try {
      msg = (JSON.parse(b) as { error?: string }).error ?? `HTTP ${res.status}`;
    } catch {
      msg = b.startsWith("<") ? `HTTP ${res.status}` : b || `HTTP ${res.status}`;
    }
    throw new Error(msg);
  }

  return res.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CompanionEntry {
  id: string;
  companionId: string;
  dayNumber: number;
  title: string;
  scriptureReference: string;
  greeting: string;
  reflection: string;
  prayer: string;
  nextStep: string;
  closing: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface Companion {
  id: string;
  sermonId: string;
  title: string;
  numberOfDays: number;
  status: string;
  entries?: CompanionEntry[];
}

// ─── Generation ───────────────────────────────────────────────────────────────

export interface SermonDraftResult {
  sermon: {
    id: string;
    title: string;
    speaker: string;
    sermonDate: string;
    series: string;
    scriptureReference: string;
    youtubeUrl: string;
    summary: string;
    topics: string[];
    keywords: string[];
    transcript: string;
    transcriptStatus: 'none' | 'complete';
    aiIndexStatus: 'none';
    companionJourneyId: string;
    status: 'draft';
    pastorEdited: boolean;
    updatedAt: string;
  };
  companion: {
    id: string;
    title: string;
    entries: CompanionEntry[];
  };
}

export async function generateSermonDraft(
  youtubeUrl: string,
  auth: AuthHeaders,
): Promise<SermonDraftResult> {
  return post<SermonDraftResult>("/sermon-generator/generate", { youtubeUrl }, auth);
}

export async function regenerateField(
  sermonId: string,
  field: string,
  context: {
    currentTitle: string;
    currentSummary: string;
    scriptureReference: string;
    transcript: string;
    description: string;
  },
  auth: AuthHeaders,
): Promise<{ value: string | string[] }> {
  return post<{ value: string | string[] }>(
    `/sermon-generator/${sermonId}/regenerate-field`,
    { field, context },
    auth,
  );
}

// ─── Admin sermon persistence ─────────────────────────────────────────────────

export interface AdminSermonRecord {
  id: string;
  title: string;
  speaker: string;
  sermonDate: string;
  series?: string;
  scriptureReference: string;
  youtubeUrl: string;
  summary?: string;
  topics: string[];
  keywords: string[];
  transcript?: string;
  transcriptStatus: 'none' | 'pending' | 'complete';
  aiIndexStatus: 'none' | 'pending' | 'indexed';
  companionJourneyId?: string;
  status: 'draft' | 'review' | 'published';
  pastorEdited: boolean;
  updatedAt: string;
  createdAt: string;
}

export async function listServerSermons(auth: AuthHeaders): Promise<AdminSermonRecord[]> {
  return getJson<AdminSermonRecord[]>("/admin-sermons", auth);
}

export async function saveServerSermon(
  sermon: AdminSermonRecord,
  auth: AuthHeaders,
): Promise<AdminSermonRecord> {
  const res = await fetch(apiUrl("/admin-sermons"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": auth.userId,
      "X-User-Role": auth.userRole,
    },
    body: JSON.stringify(sermon),
  });
  if (!res.ok) {
    const b = await res.text();
    throw new Error(b || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function patchServerSermon(
  id: string,
  fields: Partial<AdminSermonRecord>,
  auth: AuthHeaders,
): Promise<AdminSermonRecord> {
  return patch<AdminSermonRecord>(`/admin-sermons/${id}`, fields as Record<string, unknown>, auth);
}

// ─── Companion CRUD ───────────────────────────────────────────────────────────

export async function getCompanion(companionId: string, auth: AuthHeaders): Promise<Companion> {
  return getJson<Companion>(`/sermon-companions/${companionId}`, auth);
}

export async function getCompanionBySermon(sermonId: string, auth: AuthHeaders): Promise<Companion> {
  return getJson<Companion>(`/sermon-companions/by-sermon/${sermonId}`, auth);
}

export async function saveCompanionEntry(
  companionId: string,
  day: number,
  fields: Partial<Omit<CompanionEntry, 'id' | 'companionId' | 'dayNumber' | 'createdAt' | 'updatedAt'>>,
  auth: AuthHeaders,
): Promise<CompanionEntry> {
  return patch<CompanionEntry>(`/sermon-companions/${companionId}/entries/${day}`, fields, auth);
}
