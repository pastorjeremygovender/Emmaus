/**
 * Client for GET /api/next-steps
 *
 * Returns pre-grouped, eligibility-checked content for the three-tab Next Steps page.
 * The server determines all grouping, progress state, and action labels.
 */

import { startSeries } from './devotionals-api';
export { startSeries };

export type MemberProgressState = 'not-started' | 'in-progress' | 'completed' | 'paused';

export type ContentType =
  | 'journey'
  | 'daily-rhythm'
  | 'bible-study'
  | 'sermon-devotional'
  | 'daily-devotional';

export type Badge = 'NEW' | 'UPDATED' | null;

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
    subtitle?: string;
    /** For daily-devotional items: the member's current day (next to complete). */
    currentDay?: number;
  };
  /** Member-facing route, e.g. /journey/:id/day/:n or /devotional/:id/day/:n */
  route: string;
  /**
   * Label for the primary action button.
   * null means the content is fully complete — no primary action should be shown.
   */
  primaryActionLabel: string | null;
  /** Smart Content Indicator badge — 'NEW' | 'UPDATED' | null */
  badge?: Badge;
}

export interface JourneyCollectionGroup {
  id: string;
  title: string;
  description?: string;
  journeys: NextStepsItem[];
}

/** A published, member-visible manual group with personalised content items. */
export interface ContentGroupEntry {
  id: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  displayOrder: number;
  items: NextStepsItem[];
}

export interface NextStepsData {
  dailyDevotionals: NextStepsItem[];
  journeyCollections: JourneyCollectionGroup[];
  standaloneJourneys: NextStepsItem[];
  currentSermonCompanion: NextStepsItem | null;
  previousSermonCompanions: NextStepsItem[];
  contentGroups: ContentGroupEntry[];
}

export async function resumeEngagement(
  type: 'devotional' | 'sermon-companion',
  id: string,
): Promise<void> {
  const res = await fetch(`/api/engagements/${type}/${id}/resume`, { method: 'POST' });
  if (!res.ok) throw new Error(`Resume failed (${res.status})`);
}

export async function fetchNextSteps(params?: {
  currentCompanionId?: string;
}): Promise<NextStepsData> {
  const qs = new URLSearchParams();
  if (params?.currentCompanionId) qs.set('currentCompanionId', params.currentCompanionId);

  const url = `/api/next-steps${qs.toString() ? `?${qs}` : ''}`;
  // credentials:'include' sends the session cookie so the server can resolve
  // user identity via extractUserId() and return personalised progress + badges.
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error(`Failed to load Next Steps (${res.status})`);
  return res.json() as Promise<NextStepsData>;
}
