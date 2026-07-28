/**
 * Next Steps — unified member discovery experience.
 *
 * Section order:
 *   1. Recommended for You
 *   2. Daily Devotionals
 *   3. This Week's Sermon (+ Browse Previous Sermons)
 *   4. Journeys
 *   5. Bible Studies
 *   6. Recently Added
 *
 * Route: /journeys
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { useDailyGate, isGatedByDailyGate } from '@/lib/daily-gate';
import JourneyStartModal from '@/components/JourneyStartModal';
import { useRooms } from '@/contexts/RoomsContext';
import {
  BookHeart, X, Pause, MoreHorizontal,
  ChevronDown, ChevronUp, Loader2, Mic2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Journey } from '@/contexts/JourneyContext';
import {
  getAllProgress,
  listPublishedSeries,
  startSeries,
  type DevotionalSeries,
  type DevotionalProgress,
} from '@/lib/devotionals-api';

// ─── Types ────────────────────────────────────────────────────────────────────

type MemberStatus = 'not-started' | 'in-progress' | 'completed';

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
      {children}
    </h2>
  );
}

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: MemberStatus }) {
  if (status === 'not-started') return null;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
      status === 'completed'
        ? 'bg-primary/10 text-primary'
        : 'bg-amber-50 text-amber-700 border border-amber-200'
    }`}>
      {status === 'completed' ? 'Completed' : 'In Progress'}
    </span>
  );
}

// ─── Cover thumbnail ──────────────────────────────────────────────────────────

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

// ─── Pause dialog ─────────────────────────────────────────────────────────────

function PauseDialog({ journeyTitle, onPause, onCancel }: {
  journeyTitle: string; onPause: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-medium text-foreground leading-snug pr-3">Pause {journeyTitle}?</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Close"><X size={18} /></button>
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

// ─── Journey limit dialog ─────────────────────────────────────────────────────

function JourneyLimitDialog({ onCancel }: { onCancel: () => void }) {
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
        <Button variant="ghost" className="w-full h-11 rounded-xl text-muted-foreground" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

// ─── Switch devotional dialog ─────────────────────────────────────────────────

function SwitchDevotionalDialog({ currentTitle, newTitle, onKeep, onSwitch }: {
  currentTitle: string; newTitle: string; onKeep: () => void; onSwitch: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-4 shadow-xl">
        <h2 className="text-[18px] font-medium text-foreground leading-snug">
          You're currently reading {currentTitle}.
        </h2>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Would you like to make <strong>{newTitle}</strong> your current Daily Devotional instead?
          Your progress in {currentTitle} will be kept.
        </p>
        <div className="flex flex-col gap-2.5">
          <Button variant="outline" className="w-full h-11 rounded-xl" onClick={onKeep}>
            Keep {currentTitle}
          </Button>
          <Button className="w-full h-11 rounded-xl" onClick={onSwitch}>
            Start {newTitle}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── More menu ────────────────────────────────────────────────────────────────

function MoreMenu({ onPause, onDetails }: { onPause: () => void; onDetails: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="More actions"
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
          >
            <button
              onClick={() => { setOpen(false); onPause(); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2"
            >
              <Pause size={14} className="text-muted-foreground" /> Pause Journey
            </button>
            <button
              onClick={() => { setOpen(false); onDetails(); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors"
            >
              View Details
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Journey discovery card ───────────────────────────────────────────────────

function JourneyDiscoveryCard({
  journey, status, onAction, onPause, onDetails, isGated, onGate, enrollmentState,
}: {
  journey: Journey & { _completedCount?: number };
  status: MemberStatus;
  onAction: () => void;
  onPause?: () => void;
  onDetails?: () => void;
  isGated?: boolean;
  onGate?: () => void;
  enrollmentState?: string | null;
}) {
  const dur = journey.durationDays > 0 ? `${journey.durationDays} ${journey.durationDays === 1 ? 'Day' : 'Days'}` : null;
  const pct = status === 'in-progress' && journey.durationDays > 0
    ? Math.round(((journey._completedCount ?? 0) / journey.durationDays) * 100)
    : 0;
  const typeLabel = journey.journeyType === 'bible-study' ? 'Bible Study' : 'Journey';

  const actionLabel = status === 'completed'
    ? 'Review Journey'
    : status === 'in-progress'
      ? (enrollmentState === 'paused' ? 'Resume Journey' : 'Continue Journey')
      : 'Begin Journey';

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex">
        <div className="w-14 shrink-0 min-h-[68px]">
          <CoverThumb url={journey.coverImageUrl} title={journey.title} className="w-full h-full rounded-l-2xl" />
        </div>
        <div className="flex-1 min-w-0 px-4 pt-3.5 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">{typeLabel}</span>
                <StatusPill status={status} />
              </div>
              <h3 className="text-[15px] font-medium text-foreground leading-snug">{journey.title}</h3>
              <div className="flex items-center gap-x-2 text-[12px] text-muted-foreground flex-wrap">
                {dur && <span>{dur}</span>}
                {journey.difficulty && <><span className="opacity-30">·</span><span>{journey.difficulty}</span></>}
              </div>
            </div>
            {status === 'in-progress' && onPause && onDetails && (
              <MoreMenu onPause={onPause} onDetails={onDetails} />
            )}
          </div>
        </div>
      </div>

      {pct > 0 && (
        <div className="mx-4 mt-0.5">
          <div className="h-1 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="px-4 pb-4 pt-3">
        {isGated && status === 'in-progress' ? (
          <Button variant="outline" className="w-full h-10 rounded-xl text-[13px]" onClick={onGate}>
            Complete today's 10 Minutes with Jesus first
          </Button>
        ) : (
          <Button
            className="w-full h-10 rounded-xl text-[14px]"
            variant={status === 'not-started' ? 'outline' : 'default'}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Daily Devotional discovery card ─────────────────────────────────────────

function DevotionalDiscoveryCard({
  series, isActive, onAction, starting,
}: {
  series: DevotionalSeries;
  isActive: boolean;
  onAction: () => void;
  starting: boolean;
}) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <BookHeart size={12} className="text-primary shrink-0" />
            <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">Daily Devotional</span>
          </div>
          {isActive && <StatusPill status="in-progress" />}
        </div>
        <p className="text-[16px] font-medium text-foreground leading-snug">{series.title}</p>
        {series.description && (
          <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2">{series.description}</p>
        )}
      </div>
      <Button
        className="w-full h-10 rounded-xl text-[14px]"
        variant={isActive ? 'default' : 'outline'}
        onClick={onAction}
        disabled={starting}
      >
        {starting
          ? <Loader2 size={14} className="animate-spin" />
          : isActive ? 'Continue Devotional' : 'Begin Devotional'}
      </Button>
    </div>
  );
}

// ─── Sermon companion card ────────────────────────────────────────────────────

function SermonCompanionCard({
  journey, memberProgress, onBegin,
}: {
  journey: Journey;
  memberProgress?: { currentDay: number; completedDays: number[] };
  onBegin: () => void;
}) {
  const started = memberProgress && memberProgress.completedDays.length > 0;
  const dur = journey.durationDays > 0 ? `${journey.durationDays} Days` : null;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Mic2 size={12} className="text-primary shrink-0" />
          <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">Sermon Devotional</span>
        </div>
        <p className="text-[17px] font-medium text-foreground leading-snug">
          {(journey as any).sermon?.title ?? journey.title}
        </p>
        {(journey as any).sermon?.speaker && (
          <p className="text-[13px] text-muted-foreground">{(journey as any).sermon.speaker}</p>
        )}
        <div className="flex items-center gap-x-2 text-[12px] text-muted-foreground flex-wrap">
          {dur && <span>{dur}</span>}
          {started && memberProgress && (
            <><span className="opacity-30">·</span><span>Day {memberProgress.currentDay} of {journey.durationDays}</span></>
          )}
        </div>
        {journey.description && (
          <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2">{journey.description}</p>
        )}
      </div>
      <Button className="w-full h-10 rounded-xl text-[14px]" onClick={onBegin}>
        {started ? 'Continue Sermon Devotional' : 'Begin Sermon Devotional'}
      </Button>
    </div>
  );
}

// ─── Previous sermon row ──────────────────────────────────────────────────────

function PreviousSermonRow({
  journey, status, onBegin,
}: {
  journey: Journey;
  status: MemberStatus;
  onBegin: () => void;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-foreground truncate">
          {(journey as any).sermon?.title ?? journey.title}
        </p>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground flex-wrap">
          {(journey as any).sermon?.speaker && <span>{(journey as any).sermon.speaker}</span>}
          {journey.durationDays > 0 && (
            <><span className="opacity-30">·</span><span>{journey.durationDays} Days</span></>
          )}
          {status !== 'not-started' && (
            <><span className="opacity-30">·</span><StatusPill status={status} /></>
          )}
        </div>
      </div>
      <Button variant="outline" size="sm" className="h-9 rounded-xl text-[13px] shrink-0" onClick={onBegin}>
        {status === 'completed' ? 'Review' : status === 'in-progress' ? 'Continue' : 'Begin'}
      </Button>
    </div>
  );
}

// ─── Compact row for Recently Added ──────────────────────────────────────────

function RecentRow({
  typeLabel, title, actionLabel, onAction,
}: {
  typeLabel: string; title: string; actionLabel: string; onAction: () => void;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">{typeLabel}</span>
        <p className="text-[14px] font-medium text-foreground truncate">{title}</p>
      </div>
      <Button variant="outline" size="sm" className="h-9 rounded-xl text-[13px] shrink-0" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Journeys() {
  const { journeys, progress, startJourney, loading } = useJourney();
  const { user } = useAuth();
  const { startSharedJourney } = useRooms();

  // Read the admin-set "current weekly sermon" ID from localStorage.
  // AdminContext is not available on member pages — read directly from storage.
  const currentWeeklySermonCompanionId = useMemo<string | undefined>(() => {
    try {
      const raw = localStorage.getItem('emmaus_admin_settings');
      if (!raw) return undefined;
      return JSON.parse(raw)?.currentWeeklySermonCompanionId ?? undefined;
    } catch {
      return undefined;
    }
  }, []);
  const [, setLocation] = useLocation();
  const { getState, pauseJourney, canActivateMore } = useEnrollment();
  const { gateClear } = useDailyGate();

  // Journey dialog state
  const [pendingJourneyId, setPendingJourneyId] = useState<string | null>(null);
  const [pauseTargetId,    setPauseTargetId]    = useState<string | null>(null);
  const [showLimitDialog,  setShowLimitDialog]  = useState(false);

  // Daily Devotionals state
  const [devSeries,      setDevSeries]      = useState<DevotionalSeries[]>([]);
  const [devProgress,    setDevProgress]    = useState<DevotionalProgress[]>([]);
  const [devLoading,     setDevLoading]     = useState(true);
  const [startingDevId,  setStartingDevId]  = useState<string | null>(null);
  const [switchTarget,   setSwitchTarget]   = useState<DevotionalSeries | null>(null);

  // Sermon section
  const [showPreviousSermons, setShowPreviousSermons] = useState(false);

  const startedIds = useMemo(() => new Set(Object.keys(progress)), [progress]);

  // ── Fetch devotionals ────────────────────────────────────────────────────

  const reloadDevotionals = useCallback(async (userId?: string) => {
    const auth = userId ? { userId } : undefined;
    try {
      const [series, prog] = await Promise.all([
        listPublishedSeries(auth),
        getAllProgress(auth),
      ]);
      setDevSeries(series);
      setDevProgress(prog);
    } catch {
      // non-fatal — devotionals are supplementary
    } finally {
      setDevLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadDevotionals(user?.id).catch(() => {});
  }, [user?.id, reloadDevotionals]);

  // ── Content filtering ────────────────────────────────────────────────────

  const publishedJourneys = useMemo(
    () => journeys.filter(j => j.status === 'Published'),
    [journeys],
  );

  const companions = useMemo(
    () => publishedJourneys.filter(j => j.journeyType === 'companion'),
    [publishedJourneys],
  );

  // The "current" companion is the explicitly-set one, or the most recently published.
  const currentCompanion = useMemo<Journey | null>(() => {
    if (currentWeeklySermonCompanionId) {
      const explicit = companions.find(j => j.id === currentWeeklySermonCompanionId);
      if (explicit) return explicit;
    }
    return companions.reduce<Journey | null>((best, j) => {
      if (!best) return j;
      const bDate = (best.publishedAt ?? best.updatedAt ?? '');
      const jDate = (j.publishedAt ?? j.updatedAt ?? '');
      return jDate > bDate ? j : best;
    }, null);
  }, [companions, currentWeeklySermonCompanionId]);

  const previousCompanions = useMemo(
    () => companions.filter(j => j.id !== currentCompanion?.id),
    [companions, currentCompanion],
  );

  const regularJourneys = useMemo(
    () => publishedJourneys.filter(j =>
      !isExemptJourney(j) &&
      j.journeyType !== 'bible-study' &&
      j.journeyType !== 'companion',
    ),
    [publishedJourneys],
  );

  const bibleStudies = useMemo(
    () => publishedJourneys.filter(j => j.journeyType === 'bible-study'),
    [publishedJourneys],
  );

  // ── Devotional helpers ───────────────────────────────────────────────────

  const activeDevotional = useMemo(
    () => devSeries.find(s => devProgress.some(p => p.seriesId === s.id)) ?? null,
    [devSeries, devProgress],
  );

  // ── Member status helpers ────────────────────────────────────────────────

  function journeyMemberStatus(j: Journey): MemberStatus {
    const p = progress[j.id];
    if (!p) return 'not-started';
    if (j.durationDays > 0 && p.completedDays.length >= j.durationDays) return 'completed';
    return 'in-progress';
  }

  // ── Recommended section ──────────────────────────────────────────────────

  const activeGrowth = useMemo(
    () => regularJourneys.filter(j => startedIds.has(j.id) && getState(j.id) === 'active'),
    [regularJourneys, startedIds, getState],
  );

  type RecItem =
    | { kind: 'companion';   journey: Journey }
    | { kind: 'devotional';  series:  DevotionalSeries }
    | { kind: 'journey';     journey: Journey };

  const recommended = useMemo<RecItem[]>(() => {
    const items: RecItem[] = [];
    // Companion always has its own "This Week's Sermon" section — skip here to avoid duplication.
    if (!activeDevotional && devSeries.length > 0) {
      items.push({ kind: 'devotional', series: devSeries[0] });
    }
    if (activeGrowth.length === 0) {
      const starter =
        regularJourneys.find(j =>
          !startedIds.has(j.id) &&
          (j.difficulty?.toLowerCase().includes('beginner') ||
           j.difficulty?.toLowerCase().includes('introductory'))
        ) ?? regularJourneys.find(j => !startedIds.has(j.id));
      if (starter) items.push({ kind: 'journey', journey: starter });
    }
    return items.slice(0, 3);
  }, [currentCompanion, progress, activeDevotional, devSeries, activeGrowth, regularJourneys, startedIds]);

  // ── Recently Added ───────────────────────────────────────────────────────

  type RecentItem =
    | { kind: 'companion';  journey: Journey;        date: string }
    | { kind: 'devotional'; series:  DevotionalSeries; date: string }
    | { kind: 'journey';    journey: Journey;        date: string };

  const recentlyAdded = useMemo<RecentItem[]>(() => {
    // Exclude items already prominently shown in dedicated sections above.
    const recIds = new Set([
      ...recommended.map(r => r.kind === 'devotional' ? r.series.id : r.journey.id),
      ...(currentCompanion ? [currentCompanion.id] : []),
    ]);
    const items: RecentItem[] = [];
    for (const j of companions) {
      if (!recIds.has(j.id))
        items.push({ kind: 'companion', journey: j, date: j.publishedAt ?? j.updatedAt ?? '' });
    }
    for (const s of devSeries) {
      if (!recIds.has(s.id))
        items.push({ kind: 'devotional', series: s, date: s.publishedAt ?? s.updatedAt ?? '' });
    }
    for (const j of [...regularJourneys, ...bibleStudies]) {
      if (!recIds.has(j.id))
        items.push({ kind: 'journey', journey: j, date: j.publishedAt ?? j.updatedAt ?? '' });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  }, [recommended, companions, devSeries, regularJourneys, bibleStudies]);

  // ── Journey handlers ─────────────────────────────────────────────────────

  function handleStartJourney(journeyId: string) {
    const j = journeys.find(x => x.id === journeyId);
    if (!j) return;
    if (startedIds.has(journeyId)) {
      setLocation(`/journey/${journeyId}/day/${progress[journeyId]?.currentDay ?? 1}`);
      return;
    }
    if (!isExemptJourney(j) && !canActivateMore(journeys, startedIds)) {
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

  // ── Devotional handlers ──────────────────────────────────────────────────

  async function handleBeginDevotional(series: DevotionalSeries) {
    if (!user) return;
    if (activeDevotional && activeDevotional.id !== series.id) {
      setSwitchTarget(series);
      return;
    }
    if (activeDevotional?.id === series.id) {
      const prog = devProgress.find(p => p.seriesId === series.id);
      setLocation(`/devotional/${series.id}/day/${prog?.currentDay ?? 1}`);
      return;
    }
    await doStartDevotional(series);
  }

  async function doStartDevotional(series: DevotionalSeries) {
    if (!user) return;
    setStartingDevId(series.id);
    try {
      await startSeries(series.id, { userId: user.id });
      await reloadDevotionals(user.id);
      setLocation(`/devotional/${series.id}/day/1`);
    } catch {
      // non-fatal — member can retry
    } finally {
      setStartingDevId(null);
      setSwitchTarget(null);
    }
  }

  // ── Derived dialog state ─────────────────────────────────────────────────

  const pendingJourney = pendingJourneyId ? journeys.find(j => j.id === pendingJourneyId) : null;
  const pauseTarget    = pauseTargetId    ? journeys.find(j => j.id === pauseTargetId)    : null;

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-24">
        <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-8">
          <div className="space-y-1.5">
            <div className="h-8 w-32 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-64 rounded bg-muted animate-pulse" />
          </div>
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </main>
        <BottomNav />
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-10">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="space-y-1">
          <h1 className="text-[28px] font-sans font-medium tracking-tight text-foreground">
            Next Steps
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Choose something that will help you take your next step with Jesus.
          </p>
        </header>

        {/* ── 1. Recommended for You ──────────────────────────────────────── */}
        {recommended.length > 0 && (
          <section className="space-y-3">
            <SectionLabel>Recommended for You</SectionLabel>
            <div className="space-y-3">
              {recommended.map(item => {
                if (item.kind === 'companion') {
                  return (
                    <SermonCompanionCard
                      key={item.journey.id}
                      journey={item.journey}
                      memberProgress={progress[item.journey.id]}
                      onBegin={() => handleStartJourney(item.journey.id)}
                    />
                  );
                }
                if (item.kind === 'devotional') {
                  return (
                    <DevotionalDiscoveryCard
                      key={item.series.id}
                      series={item.series}
                      isActive={false}
                      onAction={() => handleBeginDevotional(item.series)}
                      starting={startingDevId === item.series.id}
                    />
                  );
                }
                // journey
                const p = progress[item.journey.id];
                const isGated = !gateClear && isGatedByDailyGate(item.journey) && getState(item.journey.id) === 'active';
                return (
                  <JourneyDiscoveryCard
                    key={item.journey.id}
                    journey={{ ...item.journey, _completedCount: p?.completedDays.length ?? 0 }}
                    status={journeyMemberStatus(item.journey)}
                    onAction={() => handleStartJourney(item.journey.id)}
                    onPause={() => setPauseTargetId(item.journey.id)}
                    onDetails={() => setLocation(`/journeys/${item.journey.id}`)}
                    isGated={isGated}
                    onGate={() => setLocation('/walk')}
                    enrollmentState={getState(item.journey.id)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* ── 2. Daily Devotionals ────────────────────────────────────────── */}
        {!devLoading && (
          <section className="space-y-3">
            <SectionLabel>Daily Devotionals</SectionLabel>
            {devSeries.length > 0 ? (
              <div className="space-y-3">
                {devSeries.map(s => (
                  <DevotionalDiscoveryCard
                    key={s.id}
                    series={s}
                    isActive={s.id === activeDevotional?.id}
                    onAction={() => handleBeginDevotional(s)}
                    starting={startingDevId === s.id}
                  />
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-muted-foreground">No Daily Devotionals are available yet.</p>
            )}
          </section>
        )}

        {/* ── 3. This Week's Sermon ────────────────────────────────────────── */}
        <section className="space-y-3">
          <SectionLabel>This Week's Sermon</SectionLabel>
          {currentCompanion ? (
            <>
              <SermonCompanionCard
                journey={currentCompanion}
                memberProgress={progress[currentCompanion.id]}
                onBegin={() => handleStartJourney(currentCompanion.id)}
              />

              {previousCompanions.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowPreviousSermons(p => !p)}
                    className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors py-1"
                  >
                    Browse Previous Sermons
                    {showPreviousSermons ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <AnimatePresence>
                    {showPreviousSermons && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden mt-2 space-y-2"
                      >
                        {previousCompanions.map(j => (
                          <PreviousSermonRow
                            key={j.id}
                            journey={j}
                            status={journeyMemberStatus(j)}
                            onBegin={() => handleStartJourney(j.id)}
                          />
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}
            </>
          ) : (
            <p className="text-[14px] text-muted-foreground">
              This week's Sermon Devotional will appear here when it is ready.
            </p>
          )}
        </section>

        {/* ── 4. Journeys ─────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <SectionLabel>Journeys</SectionLabel>
          {regularJourneys.length > 0 ? (
            <div className="space-y-3">
              {regularJourneys.map(j => {
                const p = progress[j.id];
                const isGated = !gateClear && isGatedByDailyGate(j) && getState(j.id) === 'active';
                return (
                  <JourneyDiscoveryCard
                    key={j.id}
                    journey={{ ...j, _completedCount: p?.completedDays.length ?? 0 }}
                    status={journeyMemberStatus(j)}
                    onAction={() => handleStartJourney(j.id)}
                    onPause={() => setPauseTargetId(j.id)}
                    onDetails={() => setLocation(`/journeys/${j.id}`)}
                    isGated={isGated}
                    onGate={() => setLocation('/walk')}
                    enrollmentState={getState(j.id)}
                  />
                );
              })}
            </div>
          ) : (
            <p className="text-[14px] text-muted-foreground">New Journeys will appear here as they are published.</p>
          )}
        </section>

        {/* ── 5. Bible Studies ────────────────────────────────────────────── */}
        {bibleStudies.length > 0 && (
          <section className="space-y-3">
            <SectionLabel>Bible Studies</SectionLabel>
            <div className="space-y-3">
              {bibleStudies.map(j => {
                const p = progress[j.id];
                return (
                  <JourneyDiscoveryCard
                    key={j.id}
                    journey={{ ...j, _completedCount: p?.completedDays.length ?? 0 }}
                    status={journeyMemberStatus(j)}
                    onAction={() => handleStartJourney(j.id)}
                    onPause={() => setPauseTargetId(j.id)}
                    onDetails={() => setLocation(`/journeys/${j.id}`)}
                    enrollmentState={getState(j.id)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* ── 6. Recently Added ───────────────────────────────────────────── */}
        {recentlyAdded.length > 0 && (
          <section className="space-y-3">
            <SectionLabel>Recently Added</SectionLabel>
            <div className="space-y-2">
              {recentlyAdded.map(item => {
                if (item.kind === 'devotional') {
                  const isActive = item.series.id === activeDevotional?.id;
                  return (
                    <RecentRow
                      key={item.series.id}
                      typeLabel="Daily Devotional"
                      title={item.series.title}
                      actionLabel={isActive ? 'Continue' : 'Begin'}
                      onAction={() => handleBeginDevotional(item.series)}
                    />
                  );
                }
                const typeLabel =
                  item.journey.journeyType === 'companion' ? 'Sermon Devotional' :
                  item.journey.journeyType === 'bible-study' ? 'Bible Study' : 'Journey';
                const st = journeyMemberStatus(item.journey);
                return (
                  <RecentRow
                    key={item.journey.id}
                    typeLabel={typeLabel}
                    title={(item.journey as any).sermon?.title ?? item.journey.title}
                    actionLabel={st === 'in-progress' ? 'Continue' : st === 'completed' ? 'Review' : 'Begin'}
                    onAction={() => handleStartJourney(item.journey.id)}
                  />
                );
              })}
            </div>
          </section>
        )}

      </main>

      <BottomNav />

      {/* Journey start modal */}
      {pendingJourneyId && pendingJourney && (
        <JourneyStartModal
          journeyId={pendingJourneyId}
          journeyTitle={pendingJourney.title}
          onClose={() => setPendingJourneyId(null)}
          onStartAlone={handleStartAlone}
          onStartWithRoom={handleStartWithRoom}
        />
      )}

      {/* Pause dialog */}
      {pauseTargetId && pauseTarget && (
        <PauseDialog
          journeyTitle={pauseTarget.title}
          onPause={() => { pauseJourney(pauseTargetId); setPauseTargetId(null); }}
          onCancel={() => setPauseTargetId(null)}
        />
      )}

      {/* Journey limit dialog */}
      {showLimitDialog && (
        <JourneyLimitDialog onCancel={() => setShowLimitDialog(false)} />
      )}

      {/* Switch devotional dialog */}
      {switchTarget && activeDevotional && (
        <SwitchDevotionalDialog
          currentTitle={activeDevotional.title}
          newTitle={switchTarget.title}
          onKeep={() => setSwitchTarget(null)}
          onSwitch={() => doStartDevotional(switchTarget)}
        />
      )}
    </div>
  );
}
