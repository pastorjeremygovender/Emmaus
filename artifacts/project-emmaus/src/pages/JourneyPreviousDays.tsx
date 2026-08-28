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
import { goBackOrFallback, resolveReturn } from '@/lib/return-context';
import { PreviousDaysScreen, type PreviousDayEntry } from '@/components/PreviousDaysScreen';
import { getStepLabel } from '@/lib/step-label';

export default function JourneyPreviousDays() {
  const params = useParams<{ journeyId: string }>();
  const [, setLocation] = useLocation();
  const { journeys, getStepsForJourney, progress, loading } = useJourney();

  const journeyId = params.journeyId;
  const qs = new URLSearchParams(window.location.search);
  // Accept both ?source= (current) and legacy ?from= so old links and bookmarks keep working.
  const from     = qs.get('source') ?? qs.get('from');
  const displayOrigin = qs.get('displayOrigin');
  const displayOriginSuffix =
    displayOrigin === 'walk' || displayOrigin === 'journey'
      ? `&displayOrigin=${encodeURIComponent(displayOrigin)}`
      : '';
  const sourceId = qs.get('sourceId');
  const { path: backPath, label: backLabel } = resolveReturn(from, sourceId, '/journeys?tab=walks');

  const journey = journeys.find(j => j.id === journeyId);
  const prog = journeyId ? progress[journeyId] : undefined;
  const currentDay = prog?.currentDay ?? 1;
  const completedSet = new Set(prog?.completedDays ?? []);

  // Show ALL published steps — nothing locked or restricted.
  // Members can access any step at any time.
  const entries: PreviousDayEntry[] = journey
      ? getStepsForJourney(journey.id)
        .filter(s => s.status === 'Published' && !s.isCompletionStep && s.day < currentDay)
        .sort((a, b) => a.day - b.day)
        .map(s => ({
          dayNumber: s.day,
          label: getStepLabel(s, journey),
          title: s.title,
          subtitle: s.scripture || undefined,
          status: completedSet.has(s.day) ? 'completed' : (s.day === currentDay ? 'current' : 'upcoming'),
        }))
    : [];

  return (
    <PreviousDaysScreen
      contentTitle={journey?.title ?? 'Walk'}
      entries={entries}
      loading={loading}
      onBack={() => goBackOrFallback(backPath, setLocation)}
      onReviewDay={(day) => setLocation(`/journey/${journeyId}/day/${day}?source=journeyPrevious&sourceId=${journeyId}${displayOriginSuffix}`)}
      backLabel={backLabel}
      emptyMessage="No previous days are available yet."
    />
  );
}
