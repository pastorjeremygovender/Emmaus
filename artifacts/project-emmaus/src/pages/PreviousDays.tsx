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
import { useAuth } from '@/contexts/AuthContext';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { PreviousDaysScreen, type PreviousDayEntry } from '@/components/PreviousDaysScreen';
import { resolveReturn } from '@/lib/return-context';
import { getStepLabel } from '@/lib/step-label';

export default function PreviousDays() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { journeys, getStepsForJourney, progress, loading } = useJourney();

  const qs       = new URLSearchParams(window.location.search);
  // Accept both ?source= (current) and legacy ?from= so old links and bookmarks keep working.
  const source   = qs.get('source') ?? qs.get('from');
  const sourceId = qs.get('sourceId');
  // Daily Rhythm is Walk-first content — default to /walk when no ?source= param
  const { path: backPath, label: backLabel } = resolveReturn(source, sourceId, '/walk');

  const devMode = isDevelopmentMode(user);

  const coreJourney = journeys.find(
    j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
  );
  const journeyId   = coreJourney?.id ?? '';
  const prog        = journeyId ? progress[journeyId] : undefined;
  const currentDay  = prog?.currentDay ?? 1;
  const completedSet = new Set(prog?.completedDays ?? []);

  const entries: PreviousDayEntry[] = coreJourney
    ? getStepsForJourney(coreJourney.id)
        .filter(s => s.status === 'Published' && (devMode || s.day < currentDay))
        .sort((a, b) => b.day - a.day)
        .map(s => ({
          dayNumber: s.day,
          label: getStepLabel(s, coreJourney),
          title: s.title,
          status: completedSet.has(s.day) ? 'completed' : 'current',
        }))
    : [];

  return (
    <PreviousDaysScreen
      contentTitle="10 Minutes with Jesus"
      entries={entries}
      loading={loading}
      onBack={() => { if (window.history.length > 1) window.history.back(); else setLocation(backPath); }}
      onReviewDay={(day) => setLocation(`/daily-rhythm/day/${day}?source=dailyRhythmPrevious`)}
      backLabel={backLabel}
      emptyMessage="No previous days are available yet."
    />
  );
}
