/**
 * Journeys — member-facing landing page.
 *
 * Fixed section order:
 *   1. Continue Your Journeys  (active non-exempt growth journeys)
 *   2. Suggested for You       (up to 5 curated unstarted journeys)
 *   3. Manage Journeys         (paused / completed / saved — collapsible)
 *
 * Discovery lives at /journeys/explore, not on this page.
 *
 * Not on this page:
 *   - 15 Minutes with Jesus (handled on Walk)
 *   - This Week's Sermon Devotional (handled on Walk)
 *   - Daily Devotional (handled on Walk)
 *   - My Rooms / Walk with others
 *   - Ask Emmaus card (floating button handles it globally)
 */

import { useState, useMemo, useRef, useEffect } from 'react';
import { useLocation } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import JourneyStartModal from '@/components/JourneyStartModal';
import { useRooms } from '@/contexts/RoomsContext';
import {
  X, Pause, Play, MoreHorizontal, Bookmark, BookmarkCheck,
  ChevronDown, ChevronUp,
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

function CoverThumb({
  url, title, className = '',
}: { url?: string; title: string; className?: string }) {
  const [err, setErr] = useState(false);
  const initials = title.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  if (!url || err) {
    return (
      <div className={`bg-primary/8 flex items-center justify-center ${className}`}>
        <span className="text-primary/30 text-[18px] font-medium select-none">{initials}</span>
      </div>
    );
  }
  return (
    <img src={url} alt="" className={`object-cover ${className}`} onError={() => setErr(true)} />
  );
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

function PauseDialog({
  journeyTitle, onPause, onCancel,
}: { journeyTitle: string; onPause: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-medium text-foreground leading-snug pr-3">
            Pause {journeyTitle}?
          </h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Close">
            <X size={18} />
          </button>
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

// ─── Two-Journey limit dialog ─────────────────────────────────────────────────

function JourneyLimitDialog({
  activeJourneys, onPause, onCancel,
}: {
  activeJourneys: Array<{ id: string; title: string; currentDay: number; durationDays: number }>;
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
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          To help you focus and finish well, pause one before beginning another.
        </p>
        <div className="space-y-2.5">
          {activeJourneys.map(j => (
            <div key={j.id} className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-foreground truncate">{j.title}</p>
                <p className="text-[12px] text-muted-foreground">Step {j.currentDay} of {j.durationDays}</p>
              </div>
              <Button
                variant="outline" size="sm"
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

// ─── More actions menu ────────────────────────────────────────────────────────

function MoreMenu({
  onPause, onDetails,
}: { onPause: () => void; onDetails: () => void }) {
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

function ActiveJourneyCard({
  journey, prog, onContinue, onPause, onDetails,
}: {
  journey: Journey;
  prog: { currentDay: number; completedDays: number[] };
  onContinue: () => void;
  onPause: () => void;
  onDetails: () => void;
}) {
  const rhythm = rhythmLabel(journey);
  const dur    = durationLabel(journey);
  const time   = timeLabel(journey);

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
              <h3 className="text-[16px] font-medium text-foreground leading-snug truncate">
                {journey.title}
              </h3>
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

      {/* Progress bar */}
      {prog.completedDays.length > 0 && (
        <div className="mx-4 mb-0 mt-1">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((prog.completedDays.length / (journey.durationDays || 1)) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="px-4 pb-4 pt-3">
        <Button className="w-full h-11 rounded-xl text-[15px]" onClick={onContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// ─── Suggested Journey card ───────────────────────────────────────────────────

function SuggestedCard({
  journey, isSaved, onStart, onSave, onDetails,
}: {
  journey: Journey;
  isSaved: boolean;
  onStart: () => void;
  onSave: () => void;
  onDetails: () => void;
}) {
  const dur    = durationLabel(journey);
  const rhythm = rhythmLabel(journey);
  const time   = timeLabel(journey);

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex">
        <div className="w-16 shrink-0 min-h-[88px]">
          <CoverThumb url={journey.coverImageUrl} title={journey.title} className="w-full h-full rounded-l-2xl" />
        </div>
        <div className="flex-1 min-w-0 px-4 py-4 space-y-1">
          <button onClick={onDetails} className="text-left w-full">
            <h3 className="text-[16px] font-medium text-foreground leading-snug line-clamp-2">
              {journey.title}
            </h3>
          </button>
          {journey.description && (
            <p className="text-[12px] text-muted-foreground leading-snug line-clamp-2">
              {journey.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
            {dur && <span>{dur}</span>}
            {rhythm && <><span className="opacity-30">·</span><span>{rhythm}</span></>}
            {time && <><span className="opacity-30">·</span><span>{time}</span></>}
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 pt-1 flex gap-2">
        <Button
          className="flex-1 h-10 rounded-xl text-[14px]"
          variant="outline"
          onClick={onStart}
        >
          Start Journey
        </Button>
        <button
          onClick={onSave}
          className="h-10 w-10 flex items-center justify-center rounded-xl border border-border hover:border-primary/30 transition-colors text-muted-foreground hover:text-primary shrink-0"
          aria-label={isSaved ? 'Remove from saved' : 'Save for later'}
        >
          {isSaved
            ? <BookmarkCheck size={16} className="text-primary" />
            : <Bookmark size={16} />}
        </button>
      </div>
    </div>
  );
}


// ─── Manage section (paused / completed / saved) ──────────────────────────────

function ManageSection({
  pausedJourneys, completedJourneys, savedJourneys, progress, journeys: allJourneys,
  onResume, onReview, onBegin, onPauseTarget,
  canActivateMore, startedIds,
}: {
  pausedJourneys: Journey[];
  completedJourneys: Journey[];
  savedJourneys: Journey[];
  progress: Record<string, import('@/contexts/JourneyContext').Progress>;
  journeys: Journey[];
  onResume: (id: string) => void;
  onReview: (id: string) => void;
  onBegin: (j: Journey) => void;
  onPauseTarget: (id: string) => void;
  canActivateMore: (j: Journey[], s: Set<string>) => boolean;
  startedIds: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const total = pausedJourneys.length + completedJourneys.length + savedJourneys.length;
  if (total === 0) return null;

  return (
    <section className="space-y-3">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between text-[11px] font-semibold text-muted-foreground uppercase tracking-widest hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <span>Manage Journeys</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden space-y-6"
          >
            {/* Paused */}
            {pausedJourneys.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Paused</p>
                {pausedJourneys.map(j => {
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
                        variant="outline" size="sm"
                        className="h-9 rounded-xl text-[13px] flex items-center gap-1.5 shrink-0"
                        onClick={() => onResume(j.id)}
                      >
                        <Play size={12} /> Resume
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Completed */}
            {completedJourneys.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Completed</p>
                {completedJourneys.map(j => (
                  <div key={j.id} className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-foreground truncate">{j.title}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {j.durationDays} steps · Complete
                      </p>
                    </div>
                    <Button
                      variant="ghost" size="sm"
                      className="h-9 rounded-xl text-[13px] shrink-0"
                      onClick={() => onReview(j.id)}
                    >
                      Review
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Saved */}
            {savedJourneys.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Saved</p>
                {savedJourneys.map(j => (
                  <div key={j.id} className="p-4 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-foreground truncate">{j.title}</p>
                      {j.durationDays > 0 && (
                        <p className="text-[12px] text-muted-foreground">{j.durationDays} Days</p>
                      )}
                    </div>
                    <Button
                      variant="outline" size="sm"
                      className="h-9 rounded-xl text-[13px] shrink-0"
                      onClick={() => onBegin(j)}
                    >
                      Begin
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Journeys() {
  const { journeys, progress, startJourney, loading } = useJourney();
  const { user } = useAuth();
  const { startSharedJourney } = useRooms();
  const [, setLocation] = useLocation();
  const {
    enrollment, getState, pauseJourney, resumeJourney,
    saveForLater, canActivateMore, activeGrowthCount,
  } = useEnrollment();

  // Dialogs
  const [pendingJourneyId, setPendingJourneyId] = useState<string | null>(null);
  const [pauseTargetId, setPauseTargetId]       = useState<string | null>(null);
  const [showLimitDialog, setShowLimitDialog]   = useState(false);
  const [blockedJourneyId, setBlockedJourneyId] = useState<string | null>(null);

  // ── Derived data ───────────────────────────────────────────────────────────

  const publishedJourneys = useMemo(
    () => journeys.filter(j => j.status === 'Published'),
    [journeys]
  );

  const startedIds = useMemo(() => new Set(Object.keys(progress)), [progress]);

  const growthJourneys = useMemo(
    () => publishedJourneys.filter(j => !isExemptJourney(j)),
    [publishedJourneys]
  );

  // 1. Active non-exempt growth journeys
  const activeGrowth = useMemo(
    () => growthJourneys.filter(j => startedIds.has(j.id) && getState(j.id) === 'active'),
    [growthJourneys, startedIds, getState]
  );

  // Secondary states (for Manage section)
  const pausedGrowth = useMemo(
    () => growthJourneys.filter(j => startedIds.has(j.id) && getState(j.id) === 'paused'),
    [growthJourneys, startedIds, getState]
  );
  const completedGrowth = useMemo(
    () => growthJourneys.filter(j => {
      const p = progress[j.id];
      return p && p.completedDays.length >= j.durationDays;
    }),
    [growthJourneys, progress]
  );
  const savedGrowth = useMemo(
    () => growthJourneys.filter(j => !startedIds.has(j.id) && getState(j.id) === 'saved'),
    [growthJourneys, startedIds, getState]
  );

  // 2. Suggested for You — up to 5; churchWide first; filter out active/paused/completed/saved
  const suggested = useMemo(() => {
    const notInProgress = growthJourneys.filter(j => {
      if (startedIds.has(j.id)) return false;
      if (getState(j.id) === 'saved') return false;
      return true;
    });
    const churchWide = notInProgress.filter(j => j.churchWide);
    const rest       = notInProgress.filter(j => !j.churchWide);
    return [...churchWide, ...rest].slice(0, 5);
  }, [growthJourneys, startedIds, getState]);

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

  function handlePauseFromLimit(id: string) {
    pauseJourney(id);
    setShowLimitDialog(false);
    if (blockedJourneyId) {
      setPendingJourneyId(blockedJourneyId);
      setBlockedJourneyId(null);
    }
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

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-24">
        <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-8">
          <div className="space-y-1.5">
            <div className="h-8 w-32 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-48 rounded bg-muted animate-pulse" />
          </div>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
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
          <h1 className="text-[28px] font-sans font-medium tracking-tight text-foreground">
            Journeys
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Grow through guided discipleship.
          </p>
          {activeGrowth.length > 0 && (
            <p className="text-[12px] text-muted-foreground pt-0.5">
              {activeCount} of 2 active {activeCount === 1 ? 'Journey' : 'Journeys'}
            </p>
          )}
        </header>

        {/* ── 1. Continue Your Journeys ──────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Continue Your Journeys
          </h2>

          {activeGrowth.length === 0 ? (
            /* Warm empty state */
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
                return (
                  <ActiveJourneyCard
                    key={j.id}
                    journey={j}
                    prog={prog}
                    onContinue={() => handleStartJourney(j.id, true)}
                    onPause={() => setPauseTargetId(j.id)}
                    onDetails={() => setLocation(`/journeys/${j.id}`)}
                  />
                );
              })}
            </div>
          )}
        </section>

        {/* ── 2. Suggested for You ───────────────────────────────────────────── */}
        {suggested.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Suggested for You
            </h2>
            <div className="space-y-3">
              {suggested.map(j => (
                <SuggestedCard
                  key={j.id}
                  journey={j}
                  isSaved={getState(j.id) === 'saved'}
                  onStart={() => handleStartJourney(j.id, false)}
                  onSave={() => {
                    if (getState(j.id) === 'saved') resumeJourney(j.id);
                    else saveForLater(j.id);
                  }}
                  onDetails={() => setLocation(`/journeys/${j.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── 3. Manage Journeys (secondary — paused / completed / saved) ────── */}
        <ManageSection
          pausedJourneys={pausedGrowth}
          completedJourneys={completedGrowth}
          savedJourneys={savedGrowth}
          progress={progress}
          journeys={journeys}
          onResume={handleResume}
          onReview={(id) => setLocation(`/journey/${id}/day/1`)}
          onBegin={(j) => handleStartJourney(j.id, false)}
          onPauseTarget={(id) => setPauseTargetId(id)}
          canActivateMore={canActivateMore}
          startedIds={startedIds}
        />

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
          onPause={() => { pauseJourney(pauseTargetId); setPauseTargetId(null); }}
          onCancel={() => setPauseTargetId(null)}
        />
      )}

      {/* Two-Journey limit dialog */}
      {showLimitDialog && (
        <JourneyLimitDialog
          activeJourneys={activeGrowth.map(j => ({
            id: j.id,
            title: j.title,
            currentDay: progress[j.id]?.currentDay ?? 1,
            durationDays: j.durationDays,
          }))}
          onPause={handlePauseFromLimit}
          onCancel={() => { setShowLimitDialog(false); setBlockedJourneyId(null); }}
        />
      )}
    </div>
  );
}
