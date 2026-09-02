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

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { PreviousDaysScreen, type PreviousDayEntry } from '@/components/PreviousDaysScreen';
import { goBackOrFallback, resolveReturn } from '@/lib/return-context';
import { getStepLabel } from '@/lib/step-label';
import { dailyRhythmHistoryStatus, resolveDailyRhythmCalendar } from '@/lib/daily-rhythm-calendar';
import { getDailyRhythmHistory, type DailyRhythmHistory } from '@/lib/journeys-api';

export default function PreviousDays() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { journeys, getStepsForJourney, progress, loading, dailyRhythmState } = useJourney();
  const [history, setHistory] = useState<DailyRhythmHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDailyRhythmHistory()
      .then(result => { if (!cancelled) setHistory(result); })
      .catch(() => { if (!cancelled) setHistory(null); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, []);

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
  const prog        = journeyId ? (dailyRhythmState?.progress ?? progress[journeyId]) : undefined;
  const resolution = resolveDailyRhythmCalendar(undefined, dailyRhythmState);
  const currentDay  = resolution?.currentDay ?? prog?.currentDay ?? 1;
  const completedSet = new Set(prog?.completedDays ?? []);

  const publishedSteps = coreJourney
    ? getStepsForJourney(coreJourney.id).filter(s => s.status === 'Published')
    : [];
  const serverEntries = history?.entries
    .filter(entry => devMode || entry.localDate < (history.localDate || '9999-12-31'))
    .map(entry => {
      const step = publishedSteps.find(candidate => candidate.day === entry.assignedDay);
      if (!step) return null;
      return {
        dayNumber: step.day,
        label: getStepLabel(step, coreJourney!),
        title: step.title,
        status: entry.state === 'Completed' ? 'completed' : 'available',
        statusLabel: entry.state,
      } as PreviousDayEntry;
    })
    .filter((entry): entry is PreviousDayEntry => Boolean(entry));
  const entries: PreviousDayEntry[] = serverEntries?.length
    ? serverEntries.sort((a, b) => b.dayNumber - a.dayNumber)
    : coreJourney
      ? publishedSteps
          .filter(s => devMode || s.day < currentDay)
          .sort((a, b) => b.day - a.day)
          .map(s => ({
            dayNumber: s.day,
            label: getStepLabel(s, coreJourney),
            title: s.title,
            status: completedSet.has(s.day) ? 'completed' : 'available',
            statusLabel: resolution
              ? dailyRhythmHistoryStatus(s.day, resolution)
              : (completedSet.has(s.day) ? 'Completed' : 'Open'),
          }))
      : [];

  return (
    <PreviousDaysScreen
      contentTitle="10 Minutes with Jesus"
      entries={entries}
      loading={loading || historyLoading}
      onBack={() => goBackOrFallback(backPath, setLocation)}
      onReviewDay={(day) => setLocation(`/daily-rhythm/day/${day}?source=dailyRhythmPrevious`)}
      backLabel={backLabel}
      emptyMessage="No previous days are available yet."
    />
  );
}
