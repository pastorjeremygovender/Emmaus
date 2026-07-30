/**
 * WalkCompletePage — dedicated Walk completion celebration screen.
 *
 * Route: /journey/:journeyId/complete
 *
 * Reached after the member completes all numbered lessons in a Walk,
 * or by tapping "Walk Complete" on the Walk overview page (JourneyDetail).
 *
 * Navigation out:
 *   "Back to Walk" → /journeys/:journeyId (Walk overview / JourneyDetail)
 */

import { useParams, useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { EmmausCompletionCard } from '@/components/EmmausCompletionCard';

export default function WalkCompletePage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const [, setLocation] = useLocation();
  const { getJourney, loading } = useJourney();

  const journey = getJourney(journeyId ?? '');

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
      heading="Journey complete."
      subMessage={
        journey?.completionMessage?.trim() ||
        'May the Lord continue His work in your life.'
      }
      returnLabel="Back to Walk"
      onReturn={() => setLocation(journeyId ? `/journeys/${journeyId}` : '/journeys?tab=journeys')}
    />
  );
}
