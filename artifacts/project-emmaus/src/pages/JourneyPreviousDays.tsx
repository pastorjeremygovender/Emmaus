/**
 * JourneyPreviousDays — Previous Days list for a Walk (Journey).
 *
 * Route: /journey/:journeyId/previous
 *
 * Thin page: loads journey data from JourneyContext and renders the shared
 * PreviousDaysScreen component, matching the pattern used by Daily Rhythm,
 * Devotionals, and Sermon Companions.
 *
 * Back navigation:
 *   ?from=walk  → /walk     (Today's Steps)
 *   default     → /journeys (Next Steps)
 */

import { useParams, useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { resolveReturn } from '@/lib/return-context';
import { PreviousDaysScreen, type PreviousDayEntry } from '@/components/PreviousDaysScreen';

export default function JourneyPreviousDays() {
  const params = useParams<{ journeyId: string }>();
  const [, setLocation] = useLocation();
  const { journeys, getStepsForJourney, progress, loading } = useJourney();

  const journeyId = params.journeyId;
  const from = new URLSearchParams(window.location.search).get('from');
  const { path: backPath, label: backLabel } = resolveReturn(from, null, '/journeys?tab=walks');

  const journey = journeys.find(j => j.id === journeyId);
  const prog = journeyId ? progress[journeyId] : undefined;
  const currentDay = prog?.currentDay ?? 1;
  const completedSet = new Set(prog?.completedDays ?? []);

  const entries: PreviousDayEntry[] = journey
    ? getStepsForJourney(journey.id)
        .filter(s => s.status === 'Published' && s.day < currentDay)
        .sort((a, b) => b.day - a.day)
        .map(s => ({
          dayNumber: s.day,
          title: s.title,
          subtitle: s.scripture || undefined,
          status: completedSet.has(s.day) ? 'completed' : 'current',
        }))
    : [];

  return (
    <PreviousDaysScreen
      contentTitle={journey?.title ?? 'Walk'}
      entries={entries}
      loading={loading}
      onBack={() => setLocation(backPath)}
      onReviewDay={(day) => setLocation(`/journey/${journeyId}/day/${day}?from=previous`)}
      backLabel={backLabel}
      emptyMessage="No previous days are available yet."
    />
  );
}
