/**
 * PreviousDays — Previous Days list for 10 Minutes with Jesus.
 *
 * Route: /daily-rhythm/previous
 *
 * Thin page: loads Daily Rhythm data from JourneyContext and
 * renders the shared PreviousDaysScreen component.
 *
 * Back navigation always returns to Today's Steps (/walk).
 */

import { useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { PreviousDaysScreen, type PreviousDayEntry } from '@/components/PreviousDaysScreen';

export default function PreviousDays() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { journeys, getStepsForJourney, progress, loading } = useJourney();

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
          title: s.title,
          status: completedSet.has(s.day) ? 'completed' : 'current',
        }))
    : [];

  return (
    <PreviousDaysScreen
      contentTitle="10 Minutes with Jesus"
      entries={entries}
      loading={loading}
      onBack={() => setLocation('/walk')}
      onReviewDay={(day) => setLocation(`/daily-rhythm/day/${day}`)}
      backLabel="Today's Steps"
      emptyMessage="No previous days are available yet."
    />
  );
}
