/**
 * JourneyPreviousDays — Previous Days list for a Journey.
 *
 * Route: /journey/:journeyId/previous
 *
 * Thin page: loads journey steps from JourneyContext and renders the shared
 * PreviousDaysScreen component.
 *
 * Back navigation:
 *   Always returns to Next Steps (/journeys).
 *   Pass ?from=walk to return to Today's Steps instead.
 */

import { useParams, useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { PreviousDaysScreen, type PreviousDayEntry } from '@/components/PreviousDaysScreen';
import { resolveReturn, encodeSource } from '@/lib/return-context';

export default function JourneyPreviousDays() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const [, setLocation] = useLocation();
  const { getStepsForJourney, getJourney, progress, loading } = useJourney();

  const params2   = new URLSearchParams(window.location.search);
  const from      = params2.get('from');
  const fromId    = params2.get('fromId');
  // resolveReturn needs sourceId for 'journeyDetail' to reconstruct the exact detail page URL.
  const { path: backPath, label: backLabel } = resolveReturn(from, fromId, '/journeys?tab=journeys');

  const journey   = getJourney(journeyId ?? '');
  const prog      = journeyId ? progress[journeyId] : undefined;
  const currentDay = prog?.currentDay ?? 1;
  const completedSet = new Set(prog?.completedDays ?? []);

  const steps = getStepsForJourney(journeyId ?? '');

  const entries: PreviousDayEntry[] = steps
    .filter(s => s.status === 'Published' && s.day < currentDay)
    .sort((a, b) => b.day - a.day)
    .map(s => ({
      dayNumber: s.day,
      title: s.title,
      status: completedSet.has(s.day) ? 'completed' : 'current',
    }));

  return (
    <PreviousDaysScreen
      contentTitle={journey?.title ?? 'Journey'}
      entries={entries}
      loading={loading}
      onBack={() => setLocation(backPath)}
      onReviewDay={(day) => {
        // Carry the full source context into the reviewed day so its back arrow
        // also returns to the originating screen (e.g. Journey Detail).
        const src = from ?? 'nextStepsJourneys';
        const qs  = fromId ? `${encodeSource(src, fromId)}` : encodeSource(src);
        setLocation(`/journey/${journeyId}/day/${day}${qs}`);
      }}
      backLabel={backLabel}
      emptyMessage="No previous steps are available yet."
    />
  );
}
