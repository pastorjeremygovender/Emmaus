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

import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { EmmausCompletionCard } from '@/components/EmmausCompletionCard';
import { RoomPickerSheet } from '@/components/RoomPickerSheet';
import { goBackOrFallback } from '@/lib/return-context';
import { apiLinkJourney } from '@/lib/rooms-api';
import { Users } from 'lucide-react';

export default function WalkCompletePage() {
  const { journeyId } = useParams<{ journeyId: string }>();
  const [, setLocation] = useLocation();
  const { getJourney, loading } = useJourney();
  const { user } = useAuth();
  const { getMyRooms, loadRoomDetail, getRoomDetail } = useRooms();
  const [showRoomPicker, setShowRoomPicker] = useState(false);

  const journey = getJourney(journeyId ?? '');

  // WJ-1: honour the source/sourceId query params so members land back where
  // they came from (Walk, Bible, Sermon) rather than always on the journey overview.
  const source   = new URLSearchParams(window.location.search).get('source');
  const sourceId = new URLSearchParams(window.location.search).get('sourceId');
  // Always return to the Walk's own detail page — that's the natural parent context
  // regardless of where the member came from.
  const returnPath     = journeyId ? `/journeys/${journeyId}` : '/journeys?tab=walks';
  const walkReturnLabel = 'View Walk Contents';

  // Suppress unused-variable warnings — source/sourceId were used previously.
  void source; void sourceId;

  // Rooms — show "Add to Room" CTA when user has rooms and walk isn't already linked
  const myRooms = user ? getMyRooms() : [];
  const alreadyLinked = (() => {
    if (!journeyId || myRooms.length === 0) return false;
    for (const room of myRooms) {
      const detail = getRoomDetail(room.id);
      if (detail?.linkedJourneys.some(lj => lj.journeyId === journeyId)) return true;
    }
    return false;
  })();

  async function handleLinkToRoom(roomId: string) {
    if (!journeyId || !user) throw new Error('Not available');
    await apiLinkJourney(user.id, roomId, journeyId);
    await loadRoomDetail(roomId);
  }

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
    <>
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6">
        <div className="w-full max-w-[360px] space-y-4">
          <EmmausCompletionCard
            heading="Walk complete."
            subMessage={
              journey?.completionMessage?.trim() ||
              "You've completed this Walk."
            }
            returnLabel={walkReturnLabel}
            onReturn={() => goBackOrFallback(returnPath, setLocation)}
            {...(showNextWalk && nextJourney
              ? {
                  continueLabel: `Start ${nextJourney.title}`,
                  onContinue: () => setLocation(`/journeys/${nextJourneyId}`),
                }
              : {})}
            onPreviousDays={journeyId ? () => setLocation(`/journey/${journeyId}/previous?source=nextStepsWalks`) : undefined}
            previousDaysLabel="View Previous Steps →"
          />

          {/* Add to Room — shown when the member has Rooms and this Walk isn't already linked */}
          {myRooms.length > 0 && !alreadyLinked && (
            <button
              onClick={() => setShowRoomPicker(true)}
              className="w-full flex items-center justify-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <Users size={13} />
              Continue this Walk with others in a Group
            </button>
          )}
        </div>
      </div>

      {showRoomPicker && (
        <RoomPickerSheet
          rooms={myRooms}
          onSelect={handleLinkToRoom}
          onClose={() => setShowRoomPicker(false)}
          title="Add Walk to a Room"
        />
      )}
    </>
  );
}
