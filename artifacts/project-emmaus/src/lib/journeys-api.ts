/**
 * Journeys API client
 * Thin wrappers around the server-side journeys routes.
 *
 * Admin mutation calls accept an optional `userId` for backwards-compatible
 * signatures; identity is derived server-side from the secure session cookie.
 */

import { getApiUrl } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SermonRef = {
  sermonId?: string;
  timestamp?: number;
  topic?: string;
  link?: string;
  contextualSentence?: string;
};

export type Journey = {
  id: string;
  title: string;
  subtitle?: string;
  description: string;
  journeyType: string;
  category?: string;
  difficulty?: string;
  estimatedDuration?: string;
  tags?: string[];
  prerequisites?: string[];
  durationDays: number;
  status: string;
  coverImageUrl?: string;
  churchWide?: boolean;
  startDate?: string;
  endDate?: string;
  linkedSermonId?: string;
  xpReward?: number;
  overloadExempt?: boolean;
  pastorEdited?: boolean;
  publishedAt?: string;
  updatedAt?: string;
  createdAt?: string;
  collectionId?: string;
  displayOrder?: number;
  themeColor?: string;   // hex colour, e.g. '#3B82F6'
  version?: number;      // incremented on each publish; 1-based
  scriptureReference?: string;
  nextJourneyId?: string;
  requiresDailyGate?: boolean;
  introductionContent?: string;
  completionMessage?: string;
  /** Set when admin publishes with "Notify members" ON — drives NEW/UPDATED badges */
  notifyPublishedAt?: string;
  /**
   * Display label prefix for steps. null / undefined = auto-derive from journeyType:
   * 'daily-rhythm' → "Day", everything else → "Step".
   * Override with any string, e.g. "Day", "Step", or a custom prefix.
   */
  stepLabelPrefix?: string | null;
};

export type Step = {
  id?: string;
  journeyId: string;
  day: number;
  title: string;
  status: string;       // "Draft" | "Published"

  // Canonical discipleship fields
  mentorIntro: string;
  scripture: string;
  devotional: string;
  reflectionQuestion: string;
  prayerPrompt: string;
  actionStep: string;
  memoryVerse?: string;
  lookingAhead?: string;

  // Extended
  preferredTranslation?: string;
  estimatedReadingTime?: number;
  xpReward?: number;

  // JSONB arrays
  scriptureReferences?: Array<{ reference: string; translation?: string; verseText?: string }>;
  suggestedSermons?: SermonRef[];
  suggestedFollowUpQuestions?: string[];
  unlockConditions?: Record<string, unknown> | null;

  // Legacy sermon fields (mapped from suggestedSermons[0] on the server)
  sermonTimestampSeconds?: number;
  sermonLink?: string;
  sermonContextualSentence?: string;

  order?: number;
  displayOrder?: number;

  // Daily Rhythm closing text (stored in content.closingText JSONB)
  closingText?: string;
  /** Optional per-step display label (e.g. "1 January"). Overrides prefix+number when set. */
  displayLabel?: string | null;
  /** Optional share image — object-storage path ("/objects/…"). Members see a "Take this with you" card. */
  shareImageUrl?: string | null;
};

export type DailyRhythmGroup = {
  id: string;
  journeyId: string;
  title: string;
  description: string;
  status: string;
  displayOrder: number;
  items: Step[];
};

export async function listDailyRhythmGroups(journeyId: string): Promise<DailyRhythmGroup[]> {
  const res = await fetch(getApiUrl(`/api/journeys/${journeyId}/daily-rhythm-groups`), { credentials: 'include', cache: 'no-store' });
  if (!res.ok) throw new Error('Could not load Daily Rhythm groups');
  return res.json();
}

export async function createDailyRhythmGroup(journeyId: string, data: { title: string; description?: string; displayOrder?: number }) {
  const res = await fetch(getApiUrl(`/api/journeys/${journeyId}/daily-rhythm-groups`), {
    method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Could not create Daily Rhythm group');
  return res.json() as Promise<DailyRhythmGroup>;
}

export async function updateDailyRhythmGroup(journeyId: string, groupId: string, data: Partial<Pick<DailyRhythmGroup, 'title' | 'description' | 'status' | 'displayOrder'>>) {
  const res = await fetch(getApiUrl(`/api/journeys/${journeyId}/daily-rhythm-groups/${groupId}`), {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...data, displayOrder: data.displayOrder }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `Could not update Daily Rhythm group (${res.status})`);
  }
  return res.json() as Promise<DailyRhythmGroup>;
}

export async function deleteDailyRhythmGroup(journeyId: string, groupId: string) {
  const res = await fetch(getApiUrl(`/api/journeys/${journeyId}/daily-rhythm-groups/${groupId}`), { method: 'DELETE', credentials: 'include' });
  if (!res.ok) throw new Error('Could not delete Daily Rhythm group');
}

export async function saveDailyRhythmGroupItems(journeyId: string, groupId: string, stepIds: string[]) {
  const res = await fetch(getApiUrl(`/api/journeys/${journeyId}/daily-rhythm-groups/${groupId}/items`), {
    method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stepIds }),
  });
  if (!res.ok) throw new Error('Could not save Daily Rhythm group days');
  return res.json() as Promise<DailyRhythmGroup>;
}

export type Progress = {
  journeyId: string;
  currentDay: number;
  completedDays: number[];
  startedAt: string;
  lastCompletedAt: string | null;
  dailyRhythmUnlockAt?: string | null;
  dailyRhythmTimezone?: string;
  lastDailyOpenDate?: string | null;
  /** Set when member opens the content — clears UPDATED badge */
  lastOpenedAt?: string | null;
  /** The member-facing surface that originally started this progress. */
  displayOrigin?: JourneyDisplayOrigin | null;
};

export type JourneyDisplayOrigin = 'walk' | 'journey';

/** Parse the optional route-carried origin without trusting arbitrary values. */
export function parseJourneyDisplayOrigin(value: unknown): JourneyDisplayOrigin | null {
  return value === 'walk' || value === 'journey' ? value : null;
}

export function journeyDisplayOriginForSource(
  source: string | null | undefined,
  journeyType?: string,
  explicitOrigin?: unknown,
): JourneyDisplayOrigin {
  const parsedOrigin = parseJourneyDisplayOrigin(explicitOrigin);
  if (parsedOrigin) return parsedOrigin;
  if (source === 'today' || source === 'nextStepsWalks') return 'walk';
  if (source === 'nextStepsJourneys' || source === 'collectionDetail') return 'journey';
  // Shared room study belongs to the Journey surface. Direct/legacy routes
  // preserve the existing content classification while making new starts
  // explicit and server-persisted.
  if (source === 'room') return 'journey';
  return journeyType === 'walk' ? 'walk' : 'journey';
}

export type DailyRhythmStartup = {
  firstOpen: boolean;
  destination: string;
  openingStateMutated: boolean;
  previousLastDailyOpenDate?: string | null;
  journeyId: string | null;
  currentDay: number | null;
  progress: Progress | null;
  state: 'OPENING_REQUIRED' | 'COMPLETED' | 'OPENING_ERROR';
  completedToday: boolean;
  assignedDay: number | null;
  targetStepId: string | null;
  localTimezone: string;
  localDate: string | null;
  reason: string;
  decisionId: string | null;
  launchSessionId: string;
  diagnosticReference?: string;
  timings?: Record<string, number>;
};

function isValidDailyRhythmStartup(
  body: Partial<DailyRhythmStartup> & { error?: string } | null,
): body is DailyRhythmStartup {
  if (!body || (body.state !== 'OPENING_REQUIRED' && body.state !== 'COMPLETED')) {
    return false;
  }
  if (typeof body.destination !== 'string' || !body.destination.startsWith('/')) {
    return false;
  }
  if (!Number.isInteger(body.assignedDay) || Number(body.assignedDay) < 1) {
    return false;
  }
  if (body.state === 'OPENING_REQUIRED') {
    return /^\/daily-rhythm\/day\/\d+$/.test(body.destination);
  }
  return body.destination === '/walk';
}

export type DailyRhythmState = {
  journeyId: string;
  progress: Progress | null;
  currentStepId: string | null;
  currentDayNumber: number;
  currentStepTitle: string | null;
  currentStepCompleted: boolean;
  completedStepIds: string[];
  availableStepIds: string[];
  reviewableStepIds: string[];
  nextStepLocked: boolean;
  nextEligibleUnlockDate: string | null;
};

export async function getDailyRhythmState(): Promise<DailyRhythmState | null> {
  return apiFetch<DailyRhythmState | null>('/api/journeys/daily-rhythm/state');
}

export async function getDailyRhythmStartup(options?: { signal?: AbortSignal }): Promise<DailyRhythmStartup> {
  const key = 'emmaus_daily_startup_session_v1';
  let startupSession = sessionStorage.getItem(key);
  if (!startupSession) {
    startupSession = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    sessionStorage.setItem(key, startupSession);
  }
  console.debug('[DailyOpen]', {
    phase: 'startup-request',
    startupSession: startupSession.slice(0, 12),
    path: '/api/journeys/daily-rhythm/startup',
  });
  const requestStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
  let clientTimezone = 'Africa/Johannesburg';
  try {
    clientTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || clientTimezone;
  } catch {
    // The server validates this hint and uses the saved account timezone first.
  }
  const res = await fetch(getApiUrl('/api/journeys/daily-rhythm/startup'), {
    credentials: 'include',
    cache: 'no-store',
    headers: {
      'X-Emmaus-Startup-Session': startupSession,
      'X-Emmaus-Timezone': clientTimezone,
    },
    signal: options?.signal,
  });
  const body = await res.json().catch(() => null) as Partial<DailyRhythmStartup> & { error?: string };
  const requestDurationMs = Math.round(
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - requestStartedAt,
  );
  console.debug('[DailyOpen]', {
    phase: 'startup-response',
    startupSession: startupSession.slice(0, 12),
    durationMs: requestDurationMs,
    state: body?.state,
    timings: body?.timings,
  });
  if (!res.ok || body?.state === 'OPENING_ERROR') {
    const error = new Error(body?.error || 'Could not resolve Daily Rhythm startup') as Error & {
      code?: string;
      diagnosticReference?: string;
    };
    error.code = body?.state;
    error.diagnosticReference = body?.diagnosticReference;
    throw error;
  }
  if (!isValidDailyRhythmStartup(body)) {
    const error = new Error('Could not safely resolve Daily Rhythm startup') as Error & {
      code?: string;
      diagnosticReference?: string;
    };
    error.code = 'OPENING_RESPONSE_INVALID';
    error.diagnosticReference = body?.diagnosticReference;
    throw error;
  }
  return body as DailyRhythmStartup;
}

export type CompleteStepResponse = {
  progress: Progress;
  dailyRhythmStartup?: DailyRhythmStartup | null;
  dailyRhythmState?: DailyRhythmState | null;
};

export type SearchResult = {
  journeys: Journey[];
  stepMatches: Array<{
    journeyId: string;
    day: number;
    title: string;
    matchedField: string;
    excerpt: string;
  }>;
};

export type ImportResult = {
  imported: number;
  journeyIds: string[];
  warnings: Array<{ row: number; column: string; message: string }>;
  totalRows: number;
};

export type ImportValidationError = {
  row: number;
  column: string;
  message: string;
};

// ─── AI Builder types ─────────────────────────────────────────────────────────

export type ValidatedScripture = {
  reference: string;
  bookId: string;
  chapter: number;
  verseText?: string;
};

export type ApprovedSermon = {
  sermonId: string;
  title: string;
  date: string;
  timestamp?: number;
  scriptureReference?: string;
};

export type BuilderPayload = {
  contentType: string;
  title: string;
  purpose: string;
  desiredOutcome: string;
  audience: string[];
  customAudience?: string;
  collectionId?: string;
  rhythm: string;
  length: number;
  estimatedTime: string;
  scriptureRefs: ValidatedScripture[];
  sermonSources: ApprovedSermon[];
  components: string[];
  requiresDailyGate: boolean;
  writingStyle: string;
  specialInstructions?: string;
};

export type BuildResult = {
  journeyId: string;
  title: string;
  stepCount: number;
  sourcesSummary: {
    scriptureReferences: string[];
    sermonsUsed: Array<{ title: string; date: string }>;
    generatedSections: string[];
  };
};

export type SermonSearchHit = {
  sermonId: string;
  title: string;
  date: string;
  scriptureReference?: string;
  excerpt?: string;
  timestamp?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit & { userId?: string }
): Promise<T> {
  const { userId: _userId, ...fetchOptions } = options ?? {};
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(getApiUrl(path), {
    ...fetchOptions,
    // Journey catalogue and progress are account-specific. Do not let the
    // browser turn a valid response into a bare 304 that this JSON client
    // cannot rehydrate.
    cache: 'no-store',
    credentials: 'include',   // always send the signed emmaus_uid session cookie; cannot be overridden
    headers,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ─── Journey endpoints ────────────────────────────────────────────────────────

export async function listJourneys(): Promise<Journey[]> {
  const data = await apiFetch<{ journeys: Journey[] }>('/api/journeys');
  return data.journeys;
}

export async function listPublishedJourneys(): Promise<Journey[]> {
  const data = await apiFetch<{ journeys: Journey[] }>('/api/journeys/published');
  return data.journeys;
}

export async function getJourney(id: string): Promise<Journey> {
  return apiFetch<Journey>(`/api/journeys/${encodeURIComponent(id)}`);
}

export async function createJourney(
  data: Omit<Journey, 'id' | 'durationDays'> & { id?: string; durationDays?: number },
  userId?: string
): Promise<Journey> {
  return apiFetch<Journey>('/api/journeys', {
    method: 'POST',
    body: JSON.stringify(data),
    userId,
  });
}

export async function updateJourney(
  id: string,
  data: Partial<Journey>,
  userId?: string
): Promise<Journey> {
  return apiFetch<Journey>(`/api/journeys/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
    userId,
  });
}

export async function deleteJourney(id: string, userId?: string): Promise<void> {
  await apiFetch<void>(`/api/journeys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    userId,
  });
}

/**
 * Permanently deletes a Journey and all associated records.
 * Requires the caller to be a Super Administrator (identity and role are
 * derived server-side from the secure session cookie).
 */
export async function permanentDeleteJourney(
  id: string,
  userId?: string,
  userEmail?: string
): Promise<{ stepCount: number; blockCount: number; progressCount: number; reflectionCount: number }> {
  return apiFetch(`/api/journeys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    userId,
    body: JSON.stringify({ confirm: 'PERMANENTLY_DELETE' }),
    headers: {
    },
  });
}

export async function publishJourney(id: string, userId?: string): Promise<Journey> {
  return apiFetch<Journey>(`/api/journeys/${encodeURIComponent(id)}/publish`, {
    method: 'POST',
    userId,
  });
}

export async function archiveJourney(id: string, userId?: string): Promise<Journey> {
  return apiFetch<Journey>(`/api/journeys/${encodeURIComponent(id)}/archive`, {
    method: 'POST',
    userId,
  });
}

export async function duplicateJourney(id: string, userId?: string): Promise<Journey> {
  return apiFetch<Journey>(`/api/journeys/${encodeURIComponent(id)}/duplicate`, {
    method: 'POST',
    userId,
  });
}

// ─── Step endpoints ───────────────────────────────────────────────────────────

export async function listSteps(journeyId: string): Promise<Step[]> {
  const data = await apiFetch<{ steps: Step[] }>(
    `/api/journeys/${encodeURIComponent(journeyId)}/steps`
  );
  return data.steps;
}

export async function createStep(
  journeyId: string,
  data: Partial<Step> & { day: number },
  userId?: string
): Promise<Step> {
  return apiFetch<Step>(`/api/journeys/${encodeURIComponent(journeyId)}/steps`, {
    method: 'POST',
    body: JSON.stringify(data),
    userId,
  });
}

export async function updateStep(
  journeyId: string,
  day: number,
  data: Partial<Step>,
  userId?: string
): Promise<Step> {
  return apiFetch<Step>(
    `/api/journeys/${encodeURIComponent(journeyId)}/steps/${day}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
      userId,
    }
  );
}

export async function deleteStep(
  journeyId: string,
  day: number,
  userId?: string
): Promise<void> {
  await apiFetch<void>(
    `/api/journeys/${encodeURIComponent(journeyId)}/steps/${day}`,
    { method: 'DELETE', userId }
  );
}

export interface BulkLabelsResult {
  updated: number;
  previewFirst: string | null;
  previewLast: string | null;
}

export async function bulkGenerateStepLabels(
  journeyId: string,
  opts: { startDate: string; format: string; overwriteExisting: boolean },
  userId?: string
): Promise<BulkLabelsResult> {
  return apiFetch<BulkLabelsResult>(
    `/api/journeys/${encodeURIComponent(journeyId)}/steps/bulk-labels`,
    { method: 'POST', body: JSON.stringify(opts), userId }
  );
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchJourneys(q: string, tags?: string[]): Promise<SearchResult> {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (tags?.length) params.set('tags', tags.join(','));
  return apiFetch<SearchResult>(`/api/journeys/search?${params.toString()}`);
}

// ─── CSV Import / Export ──────────────────────────────────────────────────────

export async function validateImportCsv(
  csv: string,
  _userId?: string
): Promise<{ errors: ImportValidationError[]; journeys: never[]; imported: 0 } | ImportResult> {
  const res = await fetch(getApiUrl('/api/journeys/import'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ csv, dryRun: true }),
  });
  return res.json() as Promise<ImportResult>;
}

export async function importJourneys(csv: string, userId?: string): Promise<ImportResult> {
  return apiFetch<ImportResult>('/api/journeys/import', {
    method: 'POST',
    body: JSON.stringify({ csv }),
    userId,
  });
}

export async function exportJourneysAsCsv(ids?: string[], _userId?: string): Promise<string> {
  const params = ids?.length ? `?ids=${ids.join(',')}` : '';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const res = await fetch(getApiUrl(`/api/journeys/export${params}`), { headers });
  if (!res.ok) throw new Error(`Export failed: ${res.status}`);
  return res.text();
}

// ─── Legacy AI Journey Generator ─────────────────────────────────────────────

export async function generateJourneyWithAI(
  prompt: string,
  userId?: string
): Promise<{ journeyId: string; title: string; stepCount: number }> {
  return apiFetch('/api/journeys/generate', {
    method: 'POST',
    body: JSON.stringify({ prompt }),
    userId,
  });
}

// ─── AI Journey Builder ───────────────────────────────────────────────────────

export async function buildJourneyWithAI(
  payload: BuilderPayload,
  userId?: string
): Promise<BuildResult> {
  return apiFetch('/api/journeys/ai-build', {
    method: 'POST',
    body: JSON.stringify(payload),
    userId,
  });
}

export async function validateScriptureRef(
  reference: string
): Promise<{ valid: boolean; reference?: string; bookId?: string; chapter?: number; verseCount?: number; verseText?: string }> {
  const params = new URLSearchParams({ ref: reference });
  return apiFetch(`/api/bible/validate-ref?${params.toString()}`);
}

export async function searchSermonsForBuilder(
  query: string,
  userId?: string
): Promise<SermonSearchHit[]> {
  const res = await apiFetch<{ results: Array<{
    sermonId?: string;
    videoId?: string;
    videoTitle?: string;
    sermonDate?: string;
    scriptureReference?: string;
    text?: string;
    startTime?: number;
  }> }>('/api/youtube-archive/search', {
    method: 'POST',
    body: JSON.stringify({ query, limit: 8 }),
    userId,
  });
  return (res.results ?? []).map(r => ({
    sermonId: r.sermonId ?? r.videoId ?? '',
    title: r.videoTitle ?? query,
    date: r.sermonDate ?? '',
    scriptureReference: r.scriptureReference,
    excerpt: r.text,
    timestamp: r.startTime,
  }));
}

export async function aiBlockAction(
  action: string,
  blockType: string,
  currentContent: Record<string, unknown>,
  journeyContext: string,
  userId?: string
): Promise<Record<string, unknown>> {
  const res = await apiFetch<{ content: Record<string, unknown> }>('/api/journeys/ai-block-action', {
    method: 'POST',
    body: JSON.stringify({ action, blockType, currentContent, journeyContext }),
    userId,
  });
  // Unwrap the { content: {...} } envelope the backend returns
  return res.content;
}

// ─── Intro-step check ─────────────────────────────────────────────────────────

/**
 * Returns the subset of the supplied journey IDs that have a Walk Introduction
 * step (day = 0). Used by CollectionPage to route not-started walks to day/0
 * instead of always starting at day/1.
 */
export async function checkJourneysHaveIntro(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const params = new URLSearchParams({ ids: ids.join(',') });
  const data = await apiFetch<{ journeyIdsWithIntro: string[] }>(
    `/api/journeys/check-intro?${params.toString()}`
  );
  return new Set(data.journeyIdsWithIntro);
}

// ─── Progress endpoints ───────────────────────────────────────────────────────

export async function getAllProgress(): Promise<Record<string, Progress>> {
  const data = await apiFetch<{ progress: Record<string, Progress> }>(
    '/api/journeys/progress'
  );
  return data.progress;
}

export async function startJourney(
  journeyId: string,
  displayOrigin?: JourneyDisplayOrigin,
): Promise<Progress> {
  return apiFetch<Progress>(
    `/api/journeys/${encodeURIComponent(journeyId)}/progress/start`,
    {
      method: 'POST',
      body: displayOrigin ? JSON.stringify({ displayOrigin }) : undefined,
      headers: displayOrigin ? { 'Content-Type': 'application/json' } : undefined,
    }
  );
}

export async function completeStep(
  journeyId: string,
  day: number,
  reflectionText?: string
): Promise<CompleteStepResponse> {
  const startupSession = sessionStorage.getItem('emmaus_daily_startup_session_v1');
  return apiFetch<CompleteStepResponse>(
    `/api/journeys/${encodeURIComponent(journeyId)}/progress/complete-step`,
    {
      method: 'POST',
      body: JSON.stringify({ day, reflectionText }),
      headers: startupSession
        ? { 'X-Emmaus-Startup-Session': startupSession }
        : undefined,
    }
  );
}

export async function getReflections(journeyId: string): Promise<Record<string, string>> {
  const data = await apiFetch<{ reflections: Record<string, string> }>(
    `/api/journeys/${encodeURIComponent(journeyId)}/progress/reflections`
  );
  return data.reflections;
}

// ─── Development-mode progress tools ─────────────────────────────────────────
// These functions affect only the requesting user's own progress.

export async function resetProgress(journeyId: string): Promise<Progress> {
  return apiFetch<Progress>(
    `/api/journeys/${encodeURIComponent(journeyId)}/progress/reset`,
    { method: 'POST' }
  );
}

export async function markStepIncomplete(
  journeyId: string,
  day: number
): Promise<Progress> {
  return apiFetch<Progress>(
    `/api/journeys/${encodeURIComponent(journeyId)}/progress/mark-step-incomplete`,
    { method: 'POST', body: JSON.stringify({ day }) }
  );
}
