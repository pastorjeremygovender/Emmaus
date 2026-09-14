/**
 * PreviousDays — Previous Days list for 10 Minutes with Jesus.
 *
 * Route: /daily-rhythm/previous
 *
 * Thin page: loads Daily Rhythm data from JourneyContext and
 * renders the shared PreviousDaysScreen component.
 *
 * Back navigation uses ?source= (standard return-context convention).
 * Steps opened from this screen receive ?source=dailyRhythmPrevious so the
 * completion card shows "Back to Previous Steps".
 */

import { useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { PreviousDaysScreen, type PreviousDayEntry } from '@/components/PreviousDaysScreen';
import { goBackOrFallback, resolveReturn } from '@/lib/return-context';
import { getStepLabel } from '@/lib/step-label';
import { resolveDailyRhythmCalendar } from '@/lib/daily-rhythm-calendar';

export default function PreviousDays() {
  const [, setLocation] = useLocation();
  const { journeys, getStepsForJourney, progress, loading, dailyRhythmState } = useJourney();
  const qs       = new URLSearchParams(window.location.search);
  // Accept both ?source= (current) and legacy ?from= so old links and bookmarks keep working.
  const source   = qs.get('source') ?? qs.get('from');
  const sourceId = qs.get('sourceId');
  // Daily Rhythm is Walk-first content — default to /walk when no ?source= param
  const { path: backPath, label: backLabel } = resolveReturn(source, sourceId, '/walk');

  const coreJourney = journeys.find(
    j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
  );
  const journeyId   = coreJourney?.id ?? '';
  const prog        = journeyId ? (dailyRhythmState?.progress ?? progress[journeyId]) : undefined;
  const resolution = resolveDailyRhythmCalendar(undefined, dailyRhythmState);
  const currentDay  = resolution?.currentDay ?? prog?.currentDay ?? 1;
  const completedSet = new Set(prog?.completedDays ?? []);

  const publishedSteps = coreJourney
    ? getStepsForJourney(coreJourney.id).filter(s => s.status === 'Published' && !s.isCompletionStep)
    : [];
  const assignedDay = resolution?.assignedDay ?? currentDay;
  const entries: PreviousDayEntry[] = coreJourney
    ? publishedSteps
        .filter(step => !step.isCompletionStep)
        .sort((a, b) => b.day - a.day)
        .map(s => {
          const completed = completedSet.has(s.day);
          return {
            dayNumber: s.day,
            label: s.day === assignedDay ? 'Today' : getStepLabel(s, coreJourney),
            title: s.title,
            status: completed ? 'completed' : 'available',
            statusLabel: completed ? 'Completed' : 'Open',
          };
        })
    : [];

  return (
    <PreviousDaysScreen
      contentTitle="10 Minutes with Jesus"
      entries={entries}
      loading={loading}
      onBack={() => goBackOrFallback(backPath, setLocation)}
      onReviewDay={(day) => setLocation(`/daily-rhythm/day/${day}?source=dailyRhythmPrevious`)}
      backLabel={backLabel}
      emptyMessage="No previous days are available yet."
    />
  );
}
