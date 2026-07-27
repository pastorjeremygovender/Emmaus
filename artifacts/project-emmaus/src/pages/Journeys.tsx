/**
 * Journeys — member-facing landing page.
 *
 * Section order (spec):
 *   1. Continue Your Journeys  (active + paused non-exempt growth journeys)
 *   2. Explore Journeys        (link to /journeys/explore)
 *   3. Saved Journeys          (inline list)
 *   4. Completed Journeys      (inline list)
 *
 * Daily gate: before today's 10 Minutes with Jesus is complete, the
 * Continue button on gated journeys redirects to the core journey instead.
 * Gate clears immediately after completion — no reload required.
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney, MAX_ACTIVE_JOURNEYS } from '@/lib/enrollment';
import { useDailyGate, isGatedByDailyGate } from '@/lib/daily-gate';
import JourneyStartModal from '@/components/JourneyStartModal';
import { useRooms } from '@/contexts/RoomsContext';
import {
  X, Pause, Play, MoreHorizontal, BookmarkCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Journey } from '@/contexts/JourneyContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rhythmLabel(j: Journey): string {
  const dur = (j.estimatedDuration ?? '').toLowerCase();
  if (dur.includes('daily') || dur.includes('per day')) return 'Daily';
  if (dur.includes('weekly') || dur.includes('per week')) return 'Weekly';
  if (dur.includes('guided')) return 'Guided';
  return 'Self-paced';
}

function durationLabel(j: Journey): string | null {
  if (!j.durationDays || j.durationDays <= 0) return null;
  return `${j.durationDays} ${j.durationDays === 1 ? 'Day' : 'Days'}`;
}

function timeLabel(j: Journey): string | null {
  if (!j.estimatedDuration) return null;
  const m = j.estimatedDuration.match(/(\d+)\s*(min|minute|hour)/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  const unit = m[2].toLowerCase().startsWith('h') ? 'hour' : 'minute';
  return `About ${n} ${unit}${n !== 1 ? 's' : ''} per day`;
}

// ─── Cover image ──────────────────────────────────────────────────────────────

function CoverThumb({ url, title, className = '' }: { url?: string; title: string; className?: string }) {
  const [err, setErr] = useState(false);
  const initials = title.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  if (!url || err) {
    return (
      <div className={`bg-primary/8 flex items-center justify-center ${className}`}>
        <span className="text-primary/30 text-[18px] font-medium select-none">{initials}</span>
      </div>
    );
  }
  return <img src={url} alt="" className={`object-cover ${className}`} onError={() => setErr(true)} />;
}

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3 animate-pulse">
      <div className="h-3 w-20 rounded bg-muted" />
      <div className="h-5 w-2/3 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
      <div className="h-10 rounded-xl bg-muted mt-1" />
    </div>
  );
}

// ─── Pause confirmation dialog ────────────────────────────────────────────────

function PauseDialog({ journeyTitle, onPause, onCancel }: {
  journeyTitle: string; onPause: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-medium text-foreground leading-snug pr-3">Pause {journeyTitle}?</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close"><X size={18} /></button>
        </div>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Your progress and responses will be kept exactly as they are. You can resume whenever you're ready.
        </p>
        <div className="flex gap-3">
          <Button className="flex-1 h-11 rounded-xl" onClick={onPause}>Pause Journey</Button>
          <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={onCancel}>Not now</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Five-Journey limit dialog ────────────────────────────────────────────────

function JourneyLimitDialog({ onManage, onCancel }: {
  onManage: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-medium text-foreground leading-snug pr-3">
            You're already walking through five journeys.
          </h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X size={18} /></button>
        </div>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          To begin another one, pause or complete one of your current journeys.
        </p>
        <div className="flex flex-col gap-2.5">
          <Button className="w-full h-11 rounded-xl" onClick={onManage}>Manage My Journeys</Button>
          <Button variant="ghost" className="w-full h-11 rounded-xl text-muted-foreground" onClick={onCancel}>Cancel</Button>
        </div>
      </div>
    </div>
  );
}

// ─── More actions menu ────────────────────────────────────────────────────────

function MoreMenu({ onPause, onDetails }: { onPause: () => void; onDetails: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreHorizontal size={17} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-9 z-30 bg-background border border-border rounded-xl shadow-lg py-1 w-48"
            role="menu"
          >
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onPause(); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2"
            >
              <Pause size={14} className="text-muted-foreground" /> Pause Journey
            </button>
            <button
              role="menuitem"
              onClick={() => { setOpen(false); onDetails(); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors"
            >
              View Journey Details
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Active Journey card ──────────────────────────────────────────────────────

function ActiveJourneyCard({ journey, prog, onContinue, onGate, onPause, onDetails, isGated }: {
  journey: Journey;
  prog: { currentDay: number; completedDays: number[] };
  onContinue: () => void;
  onGate: () => void;
  onPause: () => void;
  onDetails: () => void;
  isGated: boolean;
}) {
  const rhythm = rhythmLabel(journey);
  const dur    = durationLabel(journey);
  const time   = timeLabel(journey);
  const pct    = Math.round((prog.completedDays.length / (journey.durationDays || 1)) * 100);

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex">
        <div className="w-16 shrink-0 min-h-[80px]">
          <CoverThumb url={journey.coverImageUrl} title={journey.title} className="w-full h-full rounded-l-2xl" />
        </div>
        <div className="flex-1 min-w-0 px-4 pt-4 pb-3 space-y-0.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-primary uppercase tracking-widest leading-none mb-1">
                Step {prog.currentDay} of {journey.durationDays}
              </p>
              <h3 className="text-[16px] font-medium text-foreground leading-snug truncate">{journey.title}</h3>
            </div>
            <MoreMenu onPause={onPause} onDetails={onDetails} />
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted-foreground">
            <span>{rhythm}</span>
            {dur && <><span className="opacity-30">·</span><span>{dur}</span></>}
            {time && <><span className="opacity-30">·</span><span>{time}</span></>}
          </div>
        </div>
      </div>

      {pct > 0 && (
        <div className="mx-4 mb-0 mt-1">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="px-4 pb-4 pt-3 space-y-2">
        {isGated ? (
          <>
            <Button
              className="w-full h-11 rounded-xl text-[14px]"
              variant="outline"
              onClick={onGate}
            >
              Complete today's 10 Minutes with Jesus
            </Button>
            <p className="text-[12px] text-muted-foreground text-center leading-snug">
              Begin with today's time with Jesus. Your Journey will be ready afterwards.
            </p>
          </>
        ) : (
          <Button className="w-full h-11 rounded-xl text-[15px]" onClick={onContinue}>Continue</Button>
        )}
      </div>
    </div>
  );
}

// ─── Paused Journey row ───────────────────────────────────────────────────────

function PausedJourneyRow({ journey, prog, onResume }: {
  journey: Journey;
  prog: { currentDay: number; durationDays: number };
  onResume: () => void;
}) {
  return (
    <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-foreground truncate">{journey.title}</p>
        <p className="text-[12px] text-muted-foreground">Step {prog.currentDay} of {journey.durationDays} · Paused</p>
      </div>
      <Button variant="outline" size="sm" className="h-9 rounded-xl text-[13px] flex items-center gap-1.5 shrink-0" onClick={onResume}>
        <Play size={12} /> Resume
      </Button>
    </div>
  );
}

// ─── Saved Journey row ────────────────────────────────────────────────────────

function SavedJourneyRow({ journey, onBegin, onUnsave }: {
  journey: Journey; onBegin: () => void; onUnsave: () => void;
}) {
  return (
    <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-foreground truncate">{journey.title}</p>
        {journey.durationDays > 0 && (
          <p className="text-[12px] text-muted-foreground">{journey.durationDays} Days</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button onClick={onUnsave} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Remove from saved">
          <BookmarkCheck size={16} className="text-primary" />
        </button>
        <Button variant="outline" size="sm" className="h-9 rounded-xl text-[13px]" onClick={onBegin}>Begin</Button>
      </div>
    </div>
  );
}

// ─── Completed Journey row ────────────────────────────────────────────────────

function CompletedJourneyRow({ journey, onReview }: { journey: Journey; onReview: () => void }) {
  return (
    <div className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-medium text-foreground truncate">{journey.title}</p>
        <p className="text-[12px] text-muted-foreground">{journey.durationDays} steps · Complete</p>
      </div>
      <Button variant="ghost" size="sm" className="h-9 rounded-xl text-[13px] shrink-0" onClick={onReview}>Review</Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Journeys() {
  const { journeys, progress, startJourney, loading } = useJourney();
  const { user } = useAuth();
  const { startSharedJourney } = useRooms();
  const [, setLocation] = useLocation();
  const {
    getState, pauseJourney, resumeJourney, saveForLater, canActivateMore, activeGrowthCount,
  } = useEnrollment();
  const { gateClear, coreJourney } = useDailyGate();

  const [pendingJourneyId, setPendingJourneyId] = useState<string | null>(null);
  const [pauseTargetId, setPauseTargetId]       = useState<string | null>(null);
  const [showLimitDialog, setShowLimitDialog]   = useState(false);
  const [blockedJourneyId, setBlockedJourneyId] = useState<string | null>(null);

  const publishedJourneys = useMemo(
    () => journeys.filter(j => j.status === 'Published'),
    [journeys]
  );

  const startedIds = useMemo(() => new Set(Object.keys(progress)), [progress]);

  const growthJourneys = useMemo(
    () => publishedJourneys.filter(j => !isExemptJourney(j)),
    [publishedJourneys]
  );

  const activeGrowth = useMemo(
    () => growthJourneys.filter(j => startedIds.has(j.id) && getState(j.id) === 'active'),
    [growthJourneys, startedIds, getState]
  );

  const pausedGrowth = useMemo(
    () => growthJourneys.filter(j => startedIds.has(j.id) && getState(j.id) === 'paused'),
    [growthJourneys, startedIds, getState]
  );

  const completedGrowth = useMemo(
    () => growthJourneys.filter(j => {
      const p = progress[j.id];
      return p && p.completedDays.length >= j.durationDays && j.durationDays > 0;
    }),
    [growthJourneys, progress]
  );

  const savedGrowth = useMemo(
    () => growthJourneys.filter(j => !startedIds.has(j.id) && getState(j.id) === 'saved'),
    [growthJourneys, startedIds, getState]
  );

  const activeCount = activeGrowthCount(journeys, startedIds);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleStartJourney(journeyId: string, alreadyStarted: boolean) {
    const j = journeys.find(x => x.id === journeyId);
    if (!j) return;
    if (alreadyStarted) {
      setLocation(`/journey/${journeyId}/day/${progress[journeyId]?.currentDay ?? 1}`);
      return;
    }
    if (!isExemptJourney(j) && !canActivateMore(journeys, startedIds)) {
      setBlockedJourneyId(journeyId);
      setShowLimitDialog(true);
      return;
    }
    setPendingJourneyId(journeyId);
  }

  function handleGateClick() {
    if (coreJourney) {
      if (!progress[coreJourney.id]) startJourney(coreJourney.id);
      const p = progress[coreJourney.id];
      setLocation(`/journey/${coreJourney.id}/day/${p?.currentDay ?? 1}`);
    } else {
      setLocation('/walk');
    }
  }

  function handleStartAlone() {
    if (!pendingJourneyId) return;
    startJourney(pendingJourneyId);
    setLocation(`/journey/${pendingJourneyId}/day/1`);
    setPendingJourneyId(null);
  }

  function handleStartWithRoom(roomId: string) {
    if (!pendingJourneyId || !user) return;
    startJourney(pendingJourneyId);
    startSharedJourney(roomId, pendingJourneyId, user.id);
    setLocation(`/journey/${pendingJourneyId}/day/1`);
    setPendingJourneyId(null);
  }

  function handleResume(id: string) {
    if (canActivateMore(journeys, startedIds)) {
      resumeJourney(id);
    } else {
      setBlockedJourneyId(id);
      setShowLimitDialog(true);
    }
  }

  const pendingJourney = pendingJourneyId ? journeys.find(j => j.id === pendingJourneyId) : null;
  const pauseTarget    = pauseTargetId    ? journeys.find(j => j.id === pauseTargetId)    : null;

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-24">
        <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-8">
          <div className="space-y-1.5">
            <div className="h-8 w-32 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
          </div>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </main>
        <BottomNav />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-10">

        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <header className="space-y-1">
          <h1 className="text-[28px] font-sans font-medium tracking-tight text-foreground">Next Steps</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">Grow through guided discipleship.</p>
          {activeCount > 0 && (
            <p className="text-[12px] text-muted-foreground pt-0.5">
              You're currently walking through {activeCount} {activeCount === 1 ? 'journey' : 'journeys'}.
            </p>
          )}
        </header>

        {/* ── 1. Continue Your Journeys ──────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Continue Your Journeys
          </h2>

          {activeGrowth.length === 0 && pausedGrowth.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="rounded-2xl border border-dashed border-border p-8 text-center space-y-3"
            >
              <p className="text-[16px] font-medium text-foreground">Ready to begin a Journey?</p>
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                Every Journey helps you grow in a different area of your walk with Jesus.
              </p>
              <Button
                variant="outline"
                className="h-11 rounded-xl px-6 text-[14px] mt-1"
                onClick={() => setLocation('/journeys/explore')}
              >
                Explore Journeys
              </Button>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {activeGrowth.map(j => {
                const prog = progress[j.id]!;
                const isGated = !gateClear && isGatedByDailyGate(j);
                return (
                  <ActiveJourneyCard
                    key={j.id}
                    journey={j}
                    prog={prog}
                    onContinue={() => handleStartJourney(j.id, true)}
                    onGate={handleGateClick}
                    onPause={() => setPauseTargetId(j.id)}
                    onDetails={() => setLocation(`/journeys/${j.id}`)}
                    isGated={isGated}
                  />
                );
              })}

              {/* Paused journeys inline */}
              {pausedGrowth.length > 0 && (
                <div className="space-y-2">
                  {pausedGrowth.map(j => (
                    <PausedJourneyRow
                      key={j.id}
                      journey={j}
                      prog={{ currentDay: progress[j.id]?.currentDay ?? 1, durationDays: j.durationDays }}
                      onResume={() => handleResume(j.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── 2. Saved Journeys ──────────────────────────────────────────────── */}
        {savedGrowth.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Saved</h2>
            <div className="space-y-2">
              {savedGrowth.map(j => (
                <SavedJourneyRow
                  key={j.id}
                  journey={j}
                  onBegin={() => handleStartJourney(j.id, false)}
                  onUnsave={() => resumeJourney(j.id)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── 3. Completed Journeys ──────────────────────────────────────────── */}
        {completedGrowth.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Completed</h2>
            <div className="space-y-2">
              {completedGrowth.map(j => (
                <CompletedJourneyRow
                  key={j.id}
                  journey={j}
                  onReview={() => setLocation(`/journey/${j.id}/day/1`)}
                />
              ))}
            </div>
          </section>
        )}

      </main>

      <BottomNav />

      {pendingJourneyId && pendingJourney && (
        <JourneyStartModal
          journeyId={pendingJourneyId}
          journeyTitle={pendingJourney.title}
          onClose={() => setPendingJourneyId(null)}
          onStartAlone={handleStartAlone}
          onStartWithRoom={handleStartWithRoom}
        />
      )}

      {pauseTargetId && pauseTarget && (
        <PauseDialog
          journeyTitle={pauseTarget.title}
          onPause={() => { pauseJourney(pauseTargetId); setPauseTargetId(null); }}
          onCancel={() => setPauseTargetId(null)}
        />
      )}

      {showLimitDialog && (
        <JourneyLimitDialog
          onManage={() => { setShowLimitDialog(false); setBlockedJourneyId(null); }}
          onCancel={() => { setShowLimitDialog(false); setBlockedJourneyId(null); }}
        />
      )}
    </div>
  );
}
