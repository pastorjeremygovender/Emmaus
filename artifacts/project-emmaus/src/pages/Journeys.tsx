import { useState, useMemo } from 'react';
import { BottomNav } from '@/components/BottomNav';
import { useJourney } from '@/contexts/JourneyContext';
import { useRooms } from '@/contexts/RoomsContext';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { Users, ChevronRight, BookOpen, Pause, Play, X } from 'lucide-react';
import JourneyStartModal from '@/components/JourneyStartModal';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';

// ─── Pause confirmation dialog ────────────────────────────────────────────────
function PauseDialog({
  journeyTitle,
  onPause,
  onCancel,
}: {
  journeyTitle: string;
  onPause: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-medium text-foreground leading-snug pr-3">
            Pause {journeyTitle}?
          </h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Your progress and responses will be kept exactly as they are. You can resume whenever you're ready.
        </p>
        <div className="flex gap-3">
          <Button className="flex-1 h-11 rounded-xl" onClick={onPause}>
            Pause Journey
          </Button>
          <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={onCancel}>
            Not now
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Third-Journey limit dialog ───────────────────────────────────────────────
function JourneyLimitDialog({
  activeJourneys,
  onPause,
  onCancel,
}: {
  activeJourneys: Array<{ id: string; title: string; progress: number }>;
  onPause: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-medium text-foreground leading-snug pr-3">
            You already have two Journeys underway.
          </h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          To help you focus and finish well, pause one before beginning another.
        </p>
        <div className="space-y-2.5">
          {activeJourneys.map(j => (
            <div
              key={j.id}
              className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-foreground truncate">{j.title}</p>
                <p className="text-[12px] text-muted-foreground">{j.progress}% complete</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-9 rounded-xl text-[13px] shrink-0 flex items-center gap-1.5"
                onClick={() => onPause(j.id)}
              >
                <Pause size={13} /> Pause
              </Button>
            </div>
          ))}
        </div>
        <Button variant="ghost" className="w-full h-11 text-muted-foreground" onClick={onCancel}>
          Not now
        </Button>
      </div>
    </div>
  );
}

export default function Journeys() {
  const { journeys, progress, startJourney, loading } = useJourney();
  const { user } = useAuth();
  const { getMyRooms, getJourneyInvitations, startSharedJourney } = useRooms();
  const [, setLocation] = useLocation();
  const { getState, pauseJourney, resumeJourney, canActivateMore, activeGrowthCount } = useEnrollment();

  // Journey start modal state
  const [pendingJourneyId, setPendingJourneyId] = useState<string | null>(null);
  // Pause confirmation
  const [pauseTargetId, setPauseTargetId] = useState<string | null>(null);
  // Limit dialog
  const [showLimitDialog, setShowLimitDialog] = useState(false);
  const [blockedJourneyId, setBlockedJourneyId] = useState<string | null>(null);

  const publishedJourneys = journeys.filter(j => j.status === 'Published');

  const startedIds = useMemo(() => new Set(Object.keys(progress)), [progress]);

  const coreJourneys = publishedJourneys.filter(j => j.journeyType === 'core');
  const companionJourneys = publishedJourneys.filter(j => j.journeyType === 'companion');

  // Growth journeys by enrollment state
  const growthJourneys = publishedJourneys.filter(j => !isExemptJourney(j));
  const activeGrowth = growthJourneys.filter(j => startedIds.has(j.id) && getState(j.id) === 'active');
  const pausedGrowth = growthJourneys.filter(j => startedIds.has(j.id) && getState(j.id) === 'paused');
  const savedGrowth = growthJourneys.filter(j => !startedIds.has(j.id) && getState(j.id) === 'saved');
  const completedGrowth = growthJourneys.filter(j => {
    const p = progress[j.id];
    return p && p.completedDays.length >= j.durationDays;
  });

  // Available to browse (not started, not saved, not completed)
  const browseable = growthJourneys.filter(
    j => !startedIds.has(j.id) && getState(j.id) !== 'saved'
  );

  const myRooms = user ? getMyRooms(user.id) : [];
  const activeCount = activeGrowthCount(journeys, startedIds);

  const handleStartJourney = (journeyId: string, alreadyStarted: boolean) => {
    const j = journeys.find(x => x.id === journeyId);
    if (!j) return;

    if (alreadyStarted) {
      const day = progress[journeyId]?.currentDay ?? 1;
      setLocation(`/journey/${journeyId}/day/${day}`);
      return;
    }

    // Non-exempt journey — check 2-active limit
    if (!isExemptJourney(j) && !canActivateMore(journeys, startedIds)) {
      setBlockedJourneyId(journeyId);
      setShowLimitDialog(true);
      return;
    }

    setPendingJourneyId(journeyId);
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

  const handlePauseFromLimit = (id: string) => {
    pauseJourney(id);
    setShowLimitDialog(false);
    if (blockedJourneyId) {
      // Now the user has capacity — open the start modal
      setPendingJourneyId(blockedJourneyId);
      setBlockedJourneyId(null);
    }
  };

  const pendingJourney = pendingJourneyId ? journeys.find(j => j.id === pendingJourneyId) : null;
  const pauseTarget = pauseTargetId ? journeys.find(j => j.id === pauseTargetId) : null;

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
      <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-10">

        <header className="space-y-1.5">
          <h1 className="text-[28px] font-sans font-medium tracking-tight text-foreground">Journeys</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Continue active walks, revisit completed ones, and explore what's next.
          </p>
          {activeGrowth.length > 0 && (
            <p className="text-[12px] text-muted-foreground">
              {activeCount} of 2 active Journeys
            </p>
          )}
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

        {/* Core (15 Min) */}
        {coreJourneys.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              15 Minutes with Jesus
            </h2>
            {coreJourneys.map(j => {
              const prog = progress[j.id];
              const currentDay = prog?.currentDay ?? 1;
              const completedCount = prog?.completedDays.length ?? 0;
              return (
                <Card key={j.id} className="border-border bg-card shadow-sm">
                  <CardContent className="p-6 space-y-4">
                    <div>
                      {prog && (
                        <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1.5">
                          Day {currentDay} of {j.durationDays}
                        </div>
                      )}
                      <h3 className="text-[20px] font-sans font-medium leading-snug">{j.title}</h3>
                      <p className="text-[14px] text-muted-foreground mt-1.5 leading-relaxed">{j.description}</p>
                      {completedCount > 0 && (
                        <p className="text-[13px] text-muted-foreground mt-1">
                          {completedCount} day{completedCount !== 1 ? 's' : ''} completed
                        </p>
                      )}
                    </div>
                    <Button
                      className="w-full h-11 rounded-xl"
                      onClick={() => handleStartJourney(j.id, !!prog)}
                    >
                      {prog ? 'Continue Journey' : 'Start Journey'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        )}

        {/* Companion (Sermon) */}
        {companionJourneys.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              This Week
            </h2>
            {companionJourneys.map(j => {
              const prog = progress[j.id];
              const currentDay = prog?.currentDay ?? 1;
              const started = prog && prog.completedDays.length > 0;
              return (
                <Card key={j.id} className="border border-primary/15 bg-background shadow-sm">
                  <CardContent className="p-6 space-y-4">
                    <div>
                      <span className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1.5 block">
                        Sermon Companion
                      </span>
                      <h3 className="text-[20px] font-sans font-medium leading-snug">{j.title}</h3>
                      <p className="text-[14px] text-muted-foreground mt-1.5 leading-relaxed">{j.description}</p>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full h-11 rounded-xl"
                      onClick={() => handleStartJourney(j.id, !!prog)}
                    >
                      {started ? 'Continue' : 'Start Monday'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        )}

        {/* Active growth journeys */}
        {activeGrowth.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Active Journeys
            </h2>
            {activeGrowth.map(j => {
              const prog = progress[j.id]!;
              const pct = Math.round((prog.completedDays.length / (j.durationDays || 1)) * 100);
              return (
                <Card key={j.id} className="border-border bg-card shadow-sm">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1">
                          Step {prog.currentDay} of {j.durationDays}
                        </div>
                        <h3 className="text-[18px] font-sans font-medium leading-snug">{j.title}</h3>
                        {pct > 0 && (
                          <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => setPauseTargetId(j.id)}
                        className="text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1 flex items-center gap-1"
                      >
                        <Pause size={12} /> Pause
                      </button>
                    </div>
                    <Button
                      className="w-full h-11 rounded-xl"
                      onClick={() => handleStartJourney(j.id, true)}
                    >
                      Continue
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </section>
        )}

        {/* Paused journeys */}
        {pausedGrowth.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Paused
            </h2>
            {pausedGrowth.map(j => {
              const prog = progress[j.id]!;
              return (
                <div key={j.id} className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-foreground truncate">{j.title}</p>
                    <p className="text-[12px] text-muted-foreground">
                      Step {prog.currentDay} of {j.durationDays} · Paused
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl text-[13px] flex items-center gap-1.5"
                    onClick={() => {
                      if (canActivateMore(journeys, startedIds)) {
                        resumeJourney(j.id);
                      } else {
                        setBlockedJourneyId(j.id);
                        setShowLimitDialog(true);
                      }
                    }}
                  >
                    <Play size={13} /> Resume
                  </Button>
                </div>
              );
            })}
          </section>
        )}

        {/* Completed journeys */}
        {completedGrowth.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Completed Journeys
            </h2>
            {completedGrowth.map(j => (
              <div key={j.id} className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-foreground truncate">{j.title}</p>
                  <p className="text-[12px] text-muted-foreground">Completed · {j.durationDays} days</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 rounded-xl text-[13px]"
                  onClick={() => setLocation(`/journey/${j.id}/day/1`)}
                >
                  Review
                </Button>
              </div>
            ))}
          </section>
        )}

        {/* Saved for later */}
        {savedGrowth.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Saved for Later
            </h2>
            {savedGrowth.map(j => (
              <div key={j.id} className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-foreground truncate">{j.title}</p>
                  <p className="text-[12px] text-muted-foreground">{j.durationDays} days</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl text-[13px]"
                  onClick={() => handleStartJourney(j.id, false)}
                >
                  Begin
                </Button>
              </div>
            ))}
          </section>
        )}

        {/* Browse Journeys */}
        {browseable.length > 0 && (
          <section className="space-y-3 pb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Browse Journeys
              </h2>
            </div>
            <div className="space-y-2.5">
              {browseable.map(j => (
                <button
                  key={j.id}
                  onClick={() => handleStartJourney(j.id, false)}
                  className="w-full text-left p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-3.5"
                >
                  <div className="w-9 h-9 rounded-full bg-primary/8 text-primary flex items-center justify-center shrink-0">
                    <BookOpen size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-foreground truncate">{j.title}</p>
                    <p className="text-[12px] text-muted-foreground">{j.durationDays} days</p>
                  </div>
                  <ChevronRight size={16} className="text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Empty if no active, no browseable */}
        {activeGrowth.length === 0 && browseable.length === 0 && growthJourneys.length === 0 && (
          <div className="p-8 border border-dashed border-border rounded-2xl text-center">
            <p className="text-[15px] font-medium text-foreground mb-1">No active Journeys</p>
            <p className="text-[14px] text-muted-foreground">
              You don't have another Journey underway right now.
            </p>
          </div>
        )}

        {/* Rooms entry if no rooms */}
        {myRooms.length === 0 && (
          <section className="space-y-3 pb-4">
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

      {/* Pause confirmation */}
      {pauseTargetId && pauseTarget && (
        <PauseDialog
          journeyTitle={pauseTarget.title}
          onPause={() => {
            pauseJourney(pauseTargetId);
            setPauseTargetId(null);
          }}
          onCancel={() => setPauseTargetId(null)}
        />
      )}

      {/* Two-Journey limit dialog */}
      {showLimitDialog && (
        <JourneyLimitDialog
          activeJourneys={activeGrowth.map(j => ({
            id: j.id,
            title: j.title,
            progress: Math.round((progress[j.id]?.completedDays.length ?? 0) / (j.durationDays || 1) * 100),
          }))}
          onPause={handlePauseFromLimit}
          onCancel={() => { setShowLimitDialog(false); setBlockedJourneyId(null); }}
        />
      )}
    </div>
  );
}
