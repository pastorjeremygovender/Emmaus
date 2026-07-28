/**
 * next-steps-api.ts — client for the canonical /api/next-steps endpoint.
 *
 * The server determines eligibility, grouping, and memberProgressState.
 * No complex publication rules live on the client.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api${path}`;
}

// ─── Types (mirrored from backend) ────────────────────────────────────────────

export type MemberProgressState = "not-started" | "in-progress" | "completed";

export type ContentType =
  | "journey"
  | "bible-study"
  | "sermon-devotional"
  | "daily-devotional";

export interface NextStepsItem {
  id: string;
  contentType: ContentType;
  title: string;
  description?: string;
  memberProgressState: MemberProgressState;
  metadata: {
    durationDays?: number;
    difficulty?: string;
    scriptureReference?: string;
    coverImageUrl?: string;
    collectionId?: string;
    publishedAt?: string;
  };
  /** Member-facing route, e.g. /journey/:id/day/1 */
  route: string;
  primaryActionLabel: string;
}

export interface NextStepsData {
  recommended: NextStepsItem[];
  dailyDevotionals: NextStepsItem[];
  currentSermonDevotional: NextStepsItem | null;
  previousSermonDevotionals: NextStepsItem[];
  journeys: NextStepsItem[];
  bibleStudies: NextStepsItem[];
  recentlyAdded: NextStepsItem[];
}

// ─── Fetch ────────────────────────────────────────────────────────────────────

export async function fetchNextSteps(opts?: {
  userId?: string;
  currentCompanionId?: string;
}): Promise<NextStepsData> {
  const params = new URLSearchParams();
  if (opts?.userId) params.set("userId", opts.userId);
  if (opts?.currentCompanionId) params.set("currentCompanionId", opts.currentCompanionId);

  const qs = params.toString();
  const url = apiUrl(`/next-steps${qs ? `?${qs}` : ""}`);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts?.userId) headers["X-User-Id"] = opts.userId;

  const res = await fetch(url, { credentials: "include", headers });
  if (!res.ok) {
    const body = await res.text();
    const msg = body.startsWith("<") || body.startsWith("Cannot") ? `HTTP ${res.status}` : body;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Re-export startSeries for convenience ────────────────────────────────────
// The page still calls the devotionals endpoint to start a series.
export { startSeries } from "./devotionals-api";
