/**
 * Client for GET /api/next-steps
 *
 * Returns pre-grouped, eligibility-checked content for the three-tab Next Steps page.
 * The server determines all grouping, progress state, and action labels.
 */

import { startSeries } from './devotionals-api';
export { startSeries };

export type MemberProgressState = 'not-started' | 'in-progress' | 'completed';

export type ContentType =
  | 'journey'
  | 'bible-study'
  | 'sermon-devotional'
  | 'daily-devotional';

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
  };
  /** Member-facing route, e.g. /journey/:id/day/:n or /devotional/:id/day/:n */
  route: string;
  primaryActionLabel: string;
}

export interface JourneyCollectionGroup {
  id: string;
  title: string;
  description?: string;
  journeys: NextStepsItem[];
}

export interface NextStepsData {
  dailyDevotionals: NextStepsItem[];
  journeyCollections: JourneyCollectionGroup[];
  standaloneJourneys: NextStepsItem[];
  currentSermonCompanion: NextStepsItem | null;
  previousSermonCompanions: NextStepsItem[];
}

export async function fetchNextSteps(params?: {
  userId?: string;
  currentCompanionId?: string;
}): Promise<NextStepsData> {
  const qs = new URLSearchParams();
  if (params?.userId) qs.set('userId', params.userId);
  if (params?.currentCompanionId) qs.set('currentCompanionId', params.currentCompanionId);

  const url = `/api/next-steps${qs.toString() ? `?${qs}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load Next Steps (${res.status})`);
  return res.json() as Promise<NextStepsData>;
}
