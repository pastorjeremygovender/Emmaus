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

/** Structured error that carries a machine-readable code from the server */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly source?: Record<string, unknown> | null
  ) {
    super(message);
    this.name = "ApiError";
  }
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

  const text = await res.text();
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(text); } catch { parsed = {}; }

  // 200 OK with success:false — structured "needs input" (e.g. TRANSCRIPT_REQUIRED)
  if (res.ok && parsed.success === false && typeof parsed.code === "string") {
    throw new ApiError(
      parsed.code as string,
      (parsed.message ?? parsed.error ?? `Response code ${parsed.code}`) as string,
      (parsed.source ?? null) as Record<string, unknown> | null
    );
  }

  if (!res.ok) {
    const code = typeof parsed.code === "string" ? parsed.code : `HTTP_${res.status}`;
    const msg = (parsed.message ?? parsed.error ?? text) as string;
    // Preserve `source` even on non-ok responses — the server may return HTTP 5xx
    // for structured "needs confirmation" codes if httpStatusForCode mapping is ever
    // mis-configured. Without source, the frontend cannot pass sermon boundaries back.
    const source = (parsed.source ?? null) as Record<string, unknown> | null;
    throw new ApiError(code, msg.startsWith("<") ? `HTTP ${res.status}` : msg || `HTTP ${res.status}`, source);
  }

  return parsed as T;
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
  /** Stores the "From the Sermon" idea — what the preacher actually said. */
  greeting: string;
  reflection: string;
  prayer: string;
  nextStep: string;
  closing: string;
  /** Timestamped YouTube URL linking to the relevant sermon segment. */
  sermonLink: string;
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
  isCurrentWeek?: boolean;
  entries?: CompanionEntry[];
}

// ─── Generation ───────────────────────────────────────────────────────────────

/** Metadata returned with a SERMON_CONFIRMATION_REQUIRED error */
export interface SermonDetectionSource {
  startSecs: number | null;
  endSecs: number | null;
  durationSecs: number | null;
  startWord: number;
  endWord: number;
  confidence: number;
  previewText: string;
  segmentCount: number;
  youtubeUrl: string;
}

/**
 * Metadata returned with a THEME_CONFIRMATION_REQUIRED error.
 * Contains the AI-generated theme suggestion and the sermon boundaries so the
 * client can pass them back when the pastor confirms, skipping re-detection.
 */
export interface ThemeConfirmationSource {
  theme: string;
  /** First ~1 500 words of the sermon — used for the "Regenerate Theme" call */
  sermonSnippet: string;
  startSecs: number | null;
  endSecs: number | null;
  startWord: number;
  endWord: number;
  detectionConfidence: number;
  detectionMethod: string;
}

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
    sermonTranscript: string;
    sermonStartTime: string;
    sermonEndTime: string;
    detectionConfidence: number;
    detectionMethod: 'ai-auto' | 'ai-confirmed' | 'manual' | 'none';
    transcriptStatus: 'none' | 'complete';
    aiIndexStatus: 'none';
    companionJourneyId: string;
    mainTheme: string;
    status: 'draft';
    pastorEdited: boolean;
    updatedAt: string;
  };
  companion: {
    id: string;
    title: string;
    isCurrentWeek?: boolean;
    entries: CompanionEntry[];
  };
}

export async function generateSermonDraft(
  youtubeUrl: string,
  auth: AuthHeaders,
  opts?: {
    transcript?: string;
    videoId?: string;
    sermonStartSec?: number;
    sermonEndSec?: number;
    sermonStartWord?: number;
    sermonEndWord?: number;
    /** Pastor-confirmed one-sentence Big Idea — skips theme confirmation step */
    confirmedTheme?: string;
  }
): Promise<SermonDraftResult> {
  const body: Record<string, unknown> = { youtubeUrl };
  if (opts?.transcript)         body.transcript        = opts.transcript;
  if (opts?.videoId)            body.videoId           = opts.videoId;
  if (opts?.sermonStartSec   != null) body.sermonStartSec   = opts.sermonStartSec;
  if (opts?.sermonEndSec     != null) body.sermonEndSec     = opts.sermonEndSec;
  if (opts?.sermonStartWord  != null) body.sermonStartWord  = opts.sermonStartWord;
  if (opts?.sermonEndWord    != null) body.sermonEndWord    = opts.sermonEndWord;
  if (opts?.confirmedTheme)           body.confirmedTheme   = opts.confirmedTheme;
  const raw = await post<{ _full?: SermonDraftResult; sermon?: unknown; companion?: unknown } & SermonDraftResult>(
    "/sermon-generator/generate", body, auth
  );
  return raw._full ?? raw;
}

/**
 * Generate an alternative theme suggestion during the confirmation step.
 * Used by the "Regenerate Theme" link on the ConfirmThemePhase screen.
 */
export async function suggestAlternativeTheme(
  sermonSnippet: string,
  previousTheme: string,
  auth: AuthHeaders,
): Promise<string> {
  const res = await post<{ theme: string }>(
    "/sermon-generator/suggest-theme",
    { sermonSnippet, previousTheme },
    auth,
  );
  return res.theme;
}

/**
 * Regenerate the main theme for an existing sermon (from the Sermon Editor).
 * The server uses the stored sermonTranscript — no content sent from client.
 */
export async function regenerateSermonTheme(
  sermonId: string,
  auth: AuthHeaders,
): Promise<string> {
  const res = await post<{ theme: string }>(
    `/sermon-generator/${sermonId}/regenerate-theme`,
    {},
    auth,
  );
  return res.theme;
}

export async function redetectSermon(
  sermonId: string,
  auth: AuthHeaders,
): Promise<{
  sermonTranscript: string;
  sermonStartTime: string;
  sermonEndTime: string;
  detectionConfidence: number;
  detectionMethod: 'ai-auto';
}> {
  const res = await post<{
    success: boolean;
    detection: {
      sermonTranscript: string;
      sermonStartTime: string;
      sermonEndTime: string;
      detectionConfidence: number;
      detectionMethod: 'ai-auto';
    };
  }>(`/sermon-generator/${sermonId}/redetect`, {}, auth);
  return res.detection;
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
  sermonTranscript?: string;
  sermonStartTime?: string;
  sermonEndTime?: string;
  detectionConfidence?: number;
  detectionMethod?: 'ai-auto' | 'ai-confirmed' | 'manual' | 'none';
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

export async function deleteServerSermon(
  id: string,
  auth: AuthHeaders,
  opts?: { companionJourneyId?: string },
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (opts?.companionJourneyId) body.companionJourneyId = opts.companionJourneyId;

  const res = await fetch(apiUrl(`/admin-sermons/${id}`), {
    method: "DELETE",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": auth.userId,
      "X-User-Role": auth.userRole,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(text); } catch { /* ignore */ }

  if (!res.ok || parsed.success === false) {
    const msg = (parsed.message ?? parsed.error ?? text) as string;
    throw new Error(msg.startsWith("<") ? `HTTP ${res.status}` : msg || `HTTP ${res.status}`);
  }
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

/**
 * Publish a sermon companion and ALL its entries atomically.
 * The companion moves from Draft → Published and all 5 days become visible
 * to members in a single request.
 * @param notifyMembers When true, sets notify_published_at so members see a badge.
 */
export async function publishSermonCompanion(
  companionId: string,
  auth: AuthHeaders,
  notifyMembers = false,
): Promise<void> {
  await post<{ ok: boolean }>(`/sermon-companions/${companionId}/publish`, { notifyMembers }, auth);
}

/**
 * Unpublish a sermon companion (revert to Draft).
 * Entries are left in their current Published state so the pastor's edits
 * are preserved when they republish.
 */
export async function unpublishSermonCompanion(
  companionId: string,
  auth: AuthHeaders,
): Promise<void> {
  await post<{ ok: boolean }>(`/sermon-companions/${companionId}/unpublish`, {}, auth);
}

/**
 * Mark this companion as This Week's Sermon in the database.
 * Atomically clears the flag on all other companions.
 */
export async function setCurrentWeekCompanion(
  companionId: string,
  auth: AuthHeaders,
): Promise<void> {
  await post<{ ok: boolean }>(`/sermon-companions/${companionId}/set-current-week`, {}, auth);
}
