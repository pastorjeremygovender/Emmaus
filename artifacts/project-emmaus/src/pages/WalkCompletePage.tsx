/**
 * WalkCompletePage — dedicated Walk completion celebration screen.
 *
 * Route: /journey/:journeyId/complete
 *
 * Reached after the member completes all numbered lessons in a Walk,
 * or by tapping "Walk Complete" on the Walk overview page (JourneyDetail).
 *
 * Navigation out:
 *   "Start [Next Walk]" → /journeys/:nextJourneyId  (when nextJourneyId is set)
 *   "Back to Walk"      → /journeys/:journeyId       (always available as secondary)
 */

import { useParams, useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { EmmausCompletionCard } from '@/components/EmmausCompletionCard';
import { resolveReturn } from '@/lib/return-context';

export default function WalkCompletePage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const [, setLocation] = useLocation();
  const { getJourney, loading } = useJourney();

  const journey = getJourney(journeyId ?? '');

  // WJ-1: honour the source/sourceId query params so members land back where
  // they came from (Walk, Bible, Sermon) rather than always on the journey overview.
  const source   = new URLSearchParams(window.location.search).get('source');
  const sourceId = new URLSearchParams(window.location.search).get('sourceId');
  const returnPath = resolveReturn(
    source,
    sourceId,
    journeyId ? `/journeys/${journeyId}` : '/journeys?tab=journeys'
  ).path;

  // Resolve recommended next Walk — must be a known, published Walk
  const nextJourneyId = journey?.nextJourneyId?.trim() || undefined;
  const nextJourney = nextJourneyId ? getJourney(nextJourneyId) : undefined;
  // Only surface the CTA when the next journey exists and is published
  const showNextWalk = !!nextJourney && nextJourney.status === 'Published';

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <EmmausCompletionCard
      fullScreen
      heading="Walk complete."
      subMessage={
        journey?.completionMessage?.trim() ||
        "You've completed this Walk."
      }
      returnLabel="Back to Next Steps"
      onReturn={() => setLocation(returnPath)}
      {...(showNextWalk && nextJourney
        ? {
            continueLabel: `Start ${nextJourney.title}`,
            onContinue: () => setLocation(`/journeys/${nextJourneyId}`),
          }
        : {
            continueLabel: 'View Walk Summary',
            onContinue: () => setLocation(journeyId ? `/journeys/${journeyId}` : '/journeys?tab=journeys'),
          })}
    />
  );
}
