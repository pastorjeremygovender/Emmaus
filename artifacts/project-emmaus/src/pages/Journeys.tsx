import { useState } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { useJourney } from '@/contexts/JourneyContext';
import { useRooms } from '@/contexts/RoomsContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { Users, ChevronRight } from 'lucide-react';
import JourneyStartModal from '@/components/JourneyStartModal';

export default function Journeys() {
  const { journeys, progress, startJourney, loading } = useJourney();
  const { user } = useAuth();
  const { getMyRooms, getJourneyInvitations, startSharedJourney } = useRooms();
  const [, setLocation] = useLocation();

  // Journey start modal state — only shown for new starts, not continue
  const [pendingJourneyId, setPendingJourneyId] = useState<string | null>(null);

  const coreJourneys = journeys.filter((j) => j.journeyType === 'core');
  const companionJourneys = journeys.filter((j) => j.journeyType === 'companion' && j.status === 'Published');

  const upcoming = [
    { title: 'Prayer Basics', desc: 'A 14-day guide to building a quiet time.' },
    { title: 'Foundations', desc: 'Understanding the core tenets of faith.' },
    { title: 'Serving', desc: 'Discovering your gifts for the body.' },
  ];

  const myRooms = user ? getMyRooms(user.id) : [];

  const handleStartJourney = (journeyId: string, alreadyStarted: boolean) => {
    if (alreadyStarted) {
      // Continuing — go straight in, no modal
      const day = progress[journeyId]?.currentDay ?? 1;
      setLocation(`/journey/${journeyId}/day/${day}`);
    } else {
      // New journey — show the choice modal
      setPendingJourneyId(journeyId);
    }
  };

  const handleStartAlone = () => {
    if (!pendingJourneyId) return;
    startJourney(pendingJourneyId);
    setLocation(`/journey/${pendingJourneyId}/day/1`);
    setPendingJourneyId(null);
  };

  const handleStartWithRoom = (roomId: string) => {
    if (!pendingJourneyId || !user) return;
    startJourney(pendingJourneyId);
    startSharedJourney(roomId, pendingJourneyId, user.id);
    setLocation(`/journey/${pendingJourneyId}/day/1`);
    setPendingJourneyId(null);
  };

  const pendingJourney = pendingJourneyId ? journeys.find(j => j.id === pendingJourneyId) : null;

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-[14px]">Loading journeys…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-5 pt-12 max-w-[480px] mx-auto space-y-10">

        <header className="space-y-1.5">
          <h1 className="text-[30px] font-serif font-medium tracking-tight">Next Steps</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Discover new Journeys, continue active ones, and review completed walks.
          </p>
        </header>

        {/* My Rooms — compact section at top */}
        {myRooms.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                My Rooms
              </h2>
              <button
                onClick={() => setLocation('/rooms')}
                className="text-[13px] text-primary font-medium hover:underline flex items-center gap-1"
              >
                View all <ChevronRight size={14} />
              </button>
            </div>
            <div className="space-y-2">
              {myRooms.slice(0, 2).map(room => {
                const activeJourneys = getJourneyInvitations(room.id).filter(ji => ji.status === 'open').length;
                return (
                  <button
                    key={room.id}
                    onClick={() => setLocation(`/rooms/${room.id}`)}
                    className="w-full text-left p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Users size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-medium text-foreground truncate">{room.name}</div>
                      <div className="text-[12px] text-muted-foreground">
                        {room.type}{activeJourneys > 0 ? ` · ${activeJourneys} active journey${activeJourneys !== 1 ? 's' : ''}` : ''}
                      </div>
                    </div>
                    <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Active Journey — visually prominent */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Active Journey
          </h2>
          {coreJourneys.map((j) => {
            const prog = progress[j.id];
            const currentDay = prog ? prog.currentDay : 1;
            const completedCount = prog ? prog.completedDays.length : 0;
            const alreadyStarted = !!prog;
            return (
              <Card key={j.id} className="border-border bg-card shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <div>
                    {prog && (
                      <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1.5">
                        Day {currentDay} of {j.durationDays}
                      </div>
                    )}
                    <h3 className="text-[22px] font-serif font-semibold leading-snug">{j.title}</h3>
                    <p className="text-[15px] text-muted-foreground mt-1.5 leading-relaxed">
                      {j.description}
                    </p>
                    {completedCount > 0 && (
                      <p className="text-[13px] text-muted-foreground mt-1">
                        {completedCount} day{completedCount !== 1 ? 's' : ''} completed
                      </p>
                    )}
                  </div>
                  <Button
                    className="w-full h-11 rounded-xl text-base"
                    onClick={() => handleStartJourney(j.id, alreadyStarted)}
                    data-testid={`button-journey-${j.id}`}
                  >
                    {prog ? 'Continue Journey' : 'Start Journey'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* This Week — Companion */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            This Week
          </h2>
          {companionJourneys.map((j) => {
            const prog = progress[j.id];
            const currentDay = prog ? prog.currentDay : 1;
            const started = prog && prog.completedDays.length > 0;
            const alreadyStarted = !!prog;
            return (
              <Card key={j.id} className="border border-primary/15 bg-background shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1.5 block">
                      Sermon Companion
                    </span>
                    <h3 className="text-[20px] font-serif font-medium leading-snug">{j.title}</h3>
                    <p className="text-[14px] text-muted-foreground mt-1.5 leading-relaxed">
                      {j.description}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full h-11 rounded-xl text-base"
                    onClick={() => handleStartJourney(j.id, alreadyStarted)}
                    data-testid={`button-companion-${j.id}`}
                  >
                    {started ? 'Continue' : 'Start Monday'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Available Soon */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Available Journeys
          </h2>
          <div className="space-y-2.5">
            {upcoming.map((u, i) => (
              <div
                key={i}
                className="p-4 rounded-xl border border-border bg-background flex items-center justify-between opacity-55"
                aria-disabled="true"
              >
                <div>
                  <h4 className="font-medium text-[16px] text-foreground">{u.title}</h4>
                  <p className="text-[13px] text-muted-foreground mt-0.5">{u.desc}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-semibold bg-muted text-muted-foreground px-2.5 py-1 rounded-full ml-3 shrink-0">
                  Coming soon
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* My Rooms — full entry point if user has none yet */}
        {myRooms.length === 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              My Rooms
            </h2>
            <button
              onClick={() => setLocation('/rooms')}
              className="w-full text-left p-5 rounded-2xl border border-dashed border-border bg-background hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Users size={19} className="text-muted-foreground" />
                </div>
                <div>
                  <div className="text-[15px] font-medium text-foreground">Walk with others</div>
                  <div className="text-[13px] text-muted-foreground mt-0.5">
                    Create or join a Room to do journeys together.
                  </div>
                </div>
              </div>
            </button>
          </section>
        )}

        {/* Completed */}
        <section className="space-y-3 pb-4">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Completed Journeys
          </h2>
          <div className="p-8 border border-dashed border-border rounded-2xl text-center">
            <p className="text-[15px] text-muted-foreground">
              Completed journeys will appear here.
            </p>
          </div>
        </section>

      </main>
      <BottomNav />

      {/* Journey Start Modal */}
      {pendingJourneyId && pendingJourney && (
        <JourneyStartModal
          journeyId={pendingJourneyId}
          journeyTitle={pendingJourney.title}
          onClose={() => setPendingJourneyId(null)}
          onStartAlone={handleStartAlone}
          onStartWithRoom={handleStartWithRoom}
        />
      )}
    </div>
  );
}
