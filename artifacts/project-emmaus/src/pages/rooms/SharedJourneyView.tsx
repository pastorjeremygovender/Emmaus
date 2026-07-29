import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { useJourney } from '@/contexts/JourneyContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle2, Clock, Minus, MessageSquare } from 'lucide-react';
import { DEMO_USER_2 } from '@/lib/rooms-demo-data';
import type { RoomJourneyInvitation } from '@/lib/rooms-types';

const DEMO_NAMES: Record<string, string> = {
  'demo-user-1': 'Member',
  'demo-user-2': DEMO_USER_2.preferredName,
  'demo-admin-1': 'Jeremy',
};

function displayName(userId: string) {
  return DEMO_NAMES[userId] || 'Member';
}

export default function SharedJourneyView() {
  const { roomId, journeyId } = useParams<{ roomId: string; journeyId: string }>();
  const { user } = useAuth();
  const { getRoom, getRoomMembers, getJourneyInvitations, getParticipants, joinJourneyInvitation, declineJourneyInvitation, getMyParticipation } = useRooms();
  const { getJourney, getStepsForJourney, progress } = useJourney();
  const [, setLocation] = useLocation();

  if (!user || !roomId || !journeyId) return null;

  const room = getRoom(roomId);
  const journey = getJourney(journeyId);
  if (!room || !journey) {
    return <div className="p-6 text-center mt-20 text-muted-foreground">Journey not found.</div>;
  }

  const members = getRoomMembers(roomId);
  const invitation = getJourneyInvitations(roomId).find(ji => ji.journeyId === journeyId && ji.status === 'open');
  const participants = invitation ? getParticipants(invitation.id) : [];
  const myParticipation = invitation ? getMyParticipation(invitation.id, user.id) : undefined;

  const steps = getStepsForJourney(journeyId);
  const myProgress = progress[journeyId];

  // Completion milestone
  const joinedParticipants = participants.filter(p => p.participationStatus === 'joined');
  const allCompleted = joinedParticipants.length > 0 && joinedParticipants.every(p => {
    // For demo: check if progress exists and completedDays === journey duration
    return myProgress && myProgress.completedDays.length >= journey.durationDays;
  });

  const getMemberStatus = (userId: string): 'completed' | 'active' | 'not-participating' => {
    const part = participants.find(p => p.userId === userId);
    if (!part || part.participationStatus !== 'joined') return 'not-participating';
    // In demo mode, only check own progress
    if (userId === user.id && myProgress) {
      const today = new Date().toDateString();
      const lastCompleted = myProgress.lastCompletedAt ? new Date(myProgress.lastCompletedAt).toDateString() : null;
      if (lastCompleted === today) return 'completed';
    }
    return 'active';
  };

  const isJoined = myParticipation?.participationStatus === 'joined';

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => setLocation(`/rooms/${roomId}`)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0 text-center px-3">
            <div className="font-medium text-sm truncate">{journey.title}</div>
            <div className="text-[12px] text-muted-foreground">{room.name}</div>
          </div>
          <div className="w-10" />
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-10">

        {/* Completion milestone */}
        {allCompleted && (
          <div className="p-7 bg-primary/5 border border-primary/20 rounded-2xl text-center space-y-3">
            <h2 className="text-[22px] font-sans font-semibold text-foreground">Congratulations!</h2>
            <p className="text-[15px] text-muted-foreground">Your Room completed:</p>
            <p className="text-[18px] font-sans font-medium text-foreground">{journey.title}</p>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => setLocation('/journeys')}>
                Browse another journey
              </Button>
              <Button size="sm" className="flex-1 rounded-xl" onClick={() => setLocation(`/rooms/${roomId}`)}>
                Return to Room
              </Button>
            </div>
          </div>
        )}

        {/* Not joined yet */}
        {invitation && !isJoined && (
          <div className="p-5 bg-primary/5 border border-primary/20 rounded-2xl space-y-4">
            <p className="text-[15px] text-muted-foreground">You haven't joined this shared journey yet.</p>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 rounded-xl" onClick={() => joinJourneyInvitation(invitation.id, user.id)}>
                Join Journey
              </Button>
              <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => declineJourneyInvitation(invitation.id, user.id)}>
                Maybe Later
              </Button>
            </div>
          </div>
        )}

        {/* Member Progress */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Who's Walking
          </h2>
          <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
            {members.map(m => {
              const memberStatus = getMemberStatus(m.userId);
              const name = m.userId === user.id ? `${displayName(m.userId)} (you)` : displayName(m.userId);
              return (
                <div key={m.id} className="flex items-center gap-3.5 px-5 py-4">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-[13px] font-semibold flex items-center justify-center shrink-0">
                    {name.replace(' (you)', '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-foreground truncate">{name}</div>
                  </div>
                  <div className="shrink-0">
                    {memberStatus === 'completed' && (
                      <div className="flex items-center gap-1.5 text-[13px] text-primary">
                        <CheckCircle2 size={15} />
                        <span>Completed today</span>
                      </div>
                    )}
                    {memberStatus === 'active' && (
                      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
                        <Clock size={15} />
                        <span>Not yet</span>
                      </div>
                    )}
                    {memberStatus === 'not-participating' && (
                      <div className="flex items-center gap-1.5 text-[13px] text-muted-foreground opacity-60">
                        <Minus size={15} />
                        <span>Not participating</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[12px] text-muted-foreground text-center">
            Private reflections and prayer requests are never visible to other members.
          </p>
        </section>

        {/* Days / Discussion */}
        {isJoined && steps.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Daily Discussion
            </h2>
            <div className="space-y-2.5">
              {steps.map(step => {
                const isCompleted = myProgress?.completedDays.includes(step.day);
                return (
                  <button
                    key={step.day}
                    onClick={() => setLocation(`/rooms/${roomId}/journey/${journeyId}/day/${step.day}/discussion`)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex items-center gap-3 ${
                      isCompleted ? 'border-primary/20 bg-primary/5' : 'border-border bg-card hover:border-primary/30'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold shrink-0 ${
                      isCompleted ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    }`}>
                      {step.day}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[14px] font-medium text-foreground truncate">{step.title}</div>
                    </div>
                    <MessageSquare size={15} className="text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Go to Journey */}
        {isJoined && (
          <Button
            className="w-full h-12 rounded-2xl"
            onClick={() => {
              const day = myProgress?.currentDay ?? 1;
              setLocation(`/journey/${journeyId}/day/${day}`);
            }}
          >
            Continue
          </Button>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
