/**
 * JourneyPreviousDays — Walk Contents screen for a Journey.
 *
 * Route: /journey/:journeyId/previous
 *
 * Shows the complete story of the Walk from beginning to end:
 *   WELCOME (Walk Introduction, day 0)  — if the journey has a day-0 step
 *   STEP 1 … STEP N                     — all published steps, ascending
 *   WALK COMPLETE                        — synthetic entry based on completion state
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
  const { path: backPath, label: backLabel } = resolveReturn(from, fromId, '/journeys?tab=journeys');

  const journey      = getJourney(journeyId ?? '');
  const prog         = journeyId ? progress[journeyId] : undefined;
  const currentDay   = prog?.currentDay ?? 1;
  const completedSet = new Set(prog?.completedDays ?? []);
  const durationDays = journey?.durationDays ?? 0;

  // All published steps for this journey, sorted ascending.
  const allSteps = getStepsForJourney(journeyId ?? '')
    .filter(s => s.status === 'Published')
    .sort((a, b) => a.day - b.day);

  const introStep  = allSteps.find(s => s.day === 0);
  // Exclude completion steps — they are surfaced via the Walk Complete sentinel below,
  // not as numbered STEP entries. Without this filter the completion step would appear
  // twice: once as "STEP N Journey Complete" and again as "WALK COMPLETE".
  const mainSteps  = allSteps.filter(s => s.day > 0 && !s.isCompletionStep);
  const lastStep   = mainSteps[mainSteps.length - 1];

  // ── Build entry list ───────────────────────────────────────────────────────

  const entries: PreviousDayEntry[] = [];

  // 1 — Walk Introduction (day 0), only if a published day-0 step exists.
  if (introStep) {
    entries.push({
      dayNumber: 0,
      title:     introStep.title,
      label:     'WELCOME',
      status:    completedSet.has(0) ? 'completed' : 'current',
    });
  }

  // 2 — Steps (days 1 … N), numbered by position in the published list.
  mainSteps.forEach((s, idx) => {
    let status: PreviousDayEntry['status'];
    if (completedSet.has(s.day)) {
      status = 'completed';
    } else if (s.day <= currentDay) {
      status = 'current';
    } else {
      status = 'locked';
    }
    entries.push({
      dayNumber: s.day,
      title:     s.title,
      label:     `STEP ${idx + 1}`,
      status,
    });
  });

  // 3 — Walk Complete (synthetic sentinel, dayNumber = -1).
  //     Shown only when there are published steps and durationDays is known.
  //     Accessible (Review) only once all numbered lessons are completed.
  if (durationDays > 0 && mainSteps.length > 0) {
    const allStepsComplete = completedSet.size >= durationDays;
    entries.push({
      dayNumber: -1,
      title:     journey?.completionMessage?.trim() || 'Well Done',
      label:     'WALK COMPLETE',
      status:    allStepsComplete ? 'completed' : 'locked',
    });
  }

  // ── Shared navigation helpers ──────────────────────────────────────────────

  /** Build the URL to open a numbered step, carrying the current source context. */
  function stepUrl(day: number): string {
    const src = from ?? 'nextStepsJourneys';
    const qs  = fromId
      ? `${encodeSource(src, fromId)}`
      : encodeSource(src);
    return `/journey/${journeyId}/day/${day}${qs}`;
  }

  /** Build the URL for the dedicated Walk Complete page. */
  function walkCompletePageUrl(): string {
    const src = from ?? 'nextStepsJourneys';
    const qs  = fromId
      ? `?source=${encodeURIComponent(src)}&sourceId=${encodeURIComponent(fromId)}`
      : `?source=${encodeURIComponent(src)}`;
    return `/journey/${journeyId}/complete${qs}`;
  }

  /**
   * Handle "Review →" — opens the step/page in read-only/review mode.
   * Walk Complete (dayNumber = -1) opens the dedicated Walk Complete page.
   */
  function handleReview(dayNumber: number) {
    if (dayNumber === -1) { setLocation(walkCompletePageUrl()); return; }
    setLocation(stepUrl(dayNumber));
  }

  /**
   * Handle "Continue →" — resumes the current in-progress step.
   * Walk Complete (dayNumber = -1) opens the dedicated Walk Complete page.
   */
  function handleContinue(dayNumber: number) {
    if (dayNumber === -1) { setLocation(walkCompletePageUrl()); return; }
    setLocation(stepUrl(dayNumber));
  }

  return (
    <PreviousDaysScreen
      contentTitle={journey?.title ?? 'Journey'}
      screenTitle="Walk Contents"
      entries={entries}
      loading={loading}
      onBack={() => setLocation(backPath)}
      onReviewDay={handleReview}
      onContinueDay={handleContinue}
      backLabel={backLabel}
      emptyMessage="No steps are available yet."
    />
  );
}
