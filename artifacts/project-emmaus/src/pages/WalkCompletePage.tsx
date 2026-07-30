/**
 * WalkCompletePage — dedicated Walk completion celebration screen.
 *
 * Route: /journey/:journeyId/complete
 *
 * Reached after the member completes all numbered lessons in a Walk.
 * Renders the standard EmmausCompletionCard full-screen with "Journey complete."
 * heading and the journey's completionMessage as the sub-message.
 *
 * Navigation out:
 *   "Back to Next Steps"  → /journeys?tab=journeys (Next Steps tab)
 *   "View Walk Contents →" → /journey/:id/previous
 */

import { useParams, useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { EmmausCompletionCard } from '@/components/EmmausCompletionCard';

export default function WalkCompletePage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const [, setLocation] = useLocation();
  const { getJourney, loading } = useJourney();

  const journey = getJourney(journeyId ?? '');

  // "View Walk Contents →" — always points back to this walk's contents list.
  // Pass journeyDetail as the source so Walk Contents' back arrow returns to
  // the Walk overview (JourneyDetail).
  const walkContentsUrl = journeyId
    ? `/journey/${journeyId}/previous?from=journeyDetail&fromId=${encodeURIComponent(journeyId)}`
    : undefined;

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
      returnLabel="Back to Next Steps"
      onReturn={() => setLocation('/journeys?tab=journeys')}
      previousDaysLabel="View Walk Contents →"
      onPreviousDays={walkContentsUrl ? () => setLocation(walkContentsUrl) : undefined}
    />
  );
}
