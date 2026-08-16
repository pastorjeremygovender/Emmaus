/**
 * analytics-api.ts — Types and API helpers for the Emmaus Analytics Centre.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API  = `${BASE}/api/analytics`;

export interface AuthHeaders {
  userId: string;
  userRole: string;
}

function headers(auth: AuthHeaders): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-User-Id":    auth.userId,
    "X-User-Role":  auth.userRole,
  };
}

async function apiFetch<T>(
  path: string,
  method: string,
  auth: AuthHeaders,
  body?: unknown,
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

export interface ChurchHealthKpis {
  totalMembers: number;
  activeThisWeek: number;
  attendancePct: number;
  dailyRhythmPct: number;
  walkCompletionPct: number;
  roomParticipationPct: number;
  openPrayerRequests: number;
  newBelievers: number;
  serving: number;
  baptisms: number;
}

export interface AttendanceDataPoint {
  date: string;
  present: number;
  expected: number;
  visitors: number;
  meetingType?: string;
}

export interface AttendanceTrends {
  weekly: AttendanceDataPoint[];
  monthly: AttendanceDataPoint[];
  byMeeting: { meetingType: string; avgPresent: number; sessionCount: number }[];
  visitorBreakdown: { firstTime: number; returning: number; periodLabel: string }[];
  retentionPct: number;
}

export interface WalkStat {
  journeyId: string;
  title: string;
  starts: number;
  completions: number;
  avgCompletionPct: number;
  avgDaysToComplete: number | null;
}

export interface DiscipleshipAnalytics {
  walkStats: WalkStat[];
  totalWalkStarts: number;
  totalWalkCompletions: number;
  overallAvgCompletionPct: number;
  mostAbandoned: { title: string; abandonPct: number } | null;
  mostCompleted: { title: string; completionPct: number } | null;
  dailyRhythmEnrollments: number;
  dailyRhythmCompletions: number;
  devotionalEngagements: number;
  /** Average % through a devotional series across all enrolled members (server-authoritative). */
  devotionalAvgCompletionPct: number;
  companionEngagements: number;
  weeklyWalkStarts: { week: string; count: number }[];
  weeklyWalkCompletions: { week: string; count: number }[];
}

export interface FunnelStage {
  label: string;
  count: number;
  pct: number;
}

export interface SpiritualGrowthData {
  growing: number;
  plateauing: number;
  disengaging: number;
  avgAttendanceConsistency: number;
  signalTrend: { week: string; growth: number; attention: number }[];
}

export interface RoomStat {
  id: string;
  name: string;
  memberCount: number;
  messageCount: number;
  walksCompleted: number;
  isActive: boolean;
  createdAt: string;
}

export interface RoomAnalytics {
  rooms: RoomStat[];
  totalRooms: number;
  activeRooms: number;
  avgMembersPerRoom: number;
  totalMessages: number;
  walksCompletedInRooms: number;
}

export interface CompanionStat {
  id: string;
  title: string;
  starts: number;
  completions: number;
  avgCompletionPct: number;
}

export interface SermonAnalytics {
  companions: CompanionStat[];
  totalCompanionStarts: number;
  totalCompanionCompletions: number;
  overallAvgCompletionPct: number;
}

export interface BibleAnalytics {
  usersWithData: number;
  topAnnotatedBooks: { bookId: string; annotationCount: number }[];
}

export interface SignalBreakdown {
  category: string;
  open: number;
  resolved: number;
}

export interface PastoralCareAnalytics {
  openSignals: number;
  resolvedSignals: number;
  totalSignals: number;
  avgDaysToAcknowledge: number | null;
  byCategory: SignalBreakdown[];
}

export interface PredictiveInsight {
  id: string;
  type: "positive" | "warning" | "neutral";
  title: string;
  body: string;
  metric?: string;
  change?: number;
}

export interface SavedReport {
  id: string;
  name: string;
  description: string;
  config: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
}

// ─── API functions ────────────────────────────────────────────────────────────

export const getHealthKpis = (auth: AuthHeaders) =>
  apiFetch<ChurchHealthKpis>("/health-kpis", "GET", auth);

export const getAttendanceTrends = (auth: AuthHeaders) =>
  apiFetch<AttendanceTrends>("/attendance-trends", "GET", auth);

export const getDiscipleshipAnalytics = (auth: AuthHeaders) =>
  apiFetch<DiscipleshipAnalytics>("/discipleship", "GET", auth);

export const getRetentionFunnel = (auth: AuthHeaders) =>
  apiFetch<FunnelStage[]>("/retention-funnel", "GET", auth);

export const getSpiritualGrowth = (auth: AuthHeaders) =>
  apiFetch<SpiritualGrowthData>("/spiritual-growth", "GET", auth);

export const getRoomAnalytics = (auth: AuthHeaders) =>
  apiFetch<RoomAnalytics>("/rooms", "GET", auth);

export const getSermonAnalytics = (auth: AuthHeaders) =>
  apiFetch<SermonAnalytics>("/sermons", "GET", auth);

export const getBibleAnalytics = (auth: AuthHeaders) =>
  apiFetch<BibleAnalytics>("/bible", "GET", auth);

export const getPastoralCareAnalytics = (auth: AuthHeaders) =>
  apiFetch<PastoralCareAnalytics>("/pastoral-care", "GET", auth);

export const getInsights = (auth: AuthHeaders) =>
  apiFetch<PredictiveInsight[]>("/insights", "GET", auth);

export const listSavedReports = (auth: AuthHeaders) =>
  apiFetch<SavedReport[]>("/saved-reports", "GET", auth);

export const createSavedReport = (
  auth: AuthHeaders,
  body: { name: string; description?: string; config?: Record<string, unknown> },
) => apiFetch<SavedReport>("/saved-reports", "POST", auth, body);

export const deleteSavedReport = (auth: AuthHeaders, id: string) =>
  apiFetch<{ ok: boolean }>(`/saved-reports/${id}`, "DELETE", auth);
