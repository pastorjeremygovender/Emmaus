/**
 * Walk — "What is Jesus inviting me to continue today?"
 *
 * Visual hierarchy (top → bottom):
 *   1. Today's 10 Minutes with Jesus  (highest priority — always first)
 *   2. Your Journeys                  (started journeys; "Explore Journeys →" if none)
 *   3. This Week's Sermon Devotional  (companion journey, only when active)
 *
 * Ask Emmaus floats above the nav — not part of this hierarchy.
 */

import { useLocation, Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { EmmausContentCard } from '@/components/EmmausContentCard';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, MoreHorizontal, Pause, Trash2, X } from 'lucide-react';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { isCompletedToday, isNextDayAvailable } from '@/lib/daily-lock';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { DevModeBanner } from '@/components/DevModeBanner';
import { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import {
  getAllProgress,
  listPublishedSeries,
  getSeriesWithEntries,
  startSeries,
  type DevotionalSeries,
  type DevotionalProgress,
  type DevotionalEntry,
} from '@/lib/devotionals-api';
import { calcAvailableDaySelfPaced } from '@/lib/devotional-calendar';

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Fire-and-forget engagement action (pause / remove). */
async function callEngagementAction(
  type: 'devotional' | 'sermon-companion',
  id: string,
  action: 'pause' | 'remove',
): Promise<void> {
  try {
    await fetch(
      `${BASE_URL}/api/engagements/${type}/${encodeURIComponent(id)}/${action}`,
      { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } },
    );
  } catch { /* network errors are non-fatal */ }
}

// ─── Walk-specific MoreMenu ────────────────────────────────────────────────────

function WalkMoreMenu({ onPause, onRemove }: { onPause: () => void; onRemove: () => void }) {
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
            className="absolute right-0 top-9 z-30 bg-background border border-border rounded-xl shadow-lg py-1 w-44"
          >
            <button
              onClick={() => { setOpen(false); onPause(); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2"
            >
              <Pause size={13} className="text-muted-foreground" /> Pause
            </button>
            <button
              onClick={() => { setOpen(false); onRemove(); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2"
            >
              <Trash2 size={13} className="text-destructive/70" /> Remove
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Walk-specific PauseDialog ────────────────────────────────────────────────

function WalkPauseDialog({
  title,
  onPause,
  onCancel,
}: { title: string; onPause: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-medium text-foreground leading-snug pr-3">Pause {title}?</h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Your progress will be kept exactly as it is. You can resume from the Next Steps tab whenever you're ready.
        </p>
        <div className="flex gap-3">
          <Button className="flex-1 h-11 rounded-xl" onClick={onPause}>Pause</Button>
          <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={onCancel}>Not now</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 space-y-3 animate-pulse">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-6 w-3/4 rounded bg-muted" />
      {Array.from({ length: lines - 2 }).map((_, i) => (
        <div key={i} className="h-4 w-full rounded bg-muted" />
      ))}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
      {children}
    </h2>
  );
}

// ─── Daily Devotional card — active (member has started) ─────────────────────
//
// Daily Devotionals are SELF-PACED — members advance by completing entries,
// not by waiting for the next calendar day.
// States:
//   not-started — no entries completed yet
//   in-progress — some entries completed, more available
//   complete    — all published entries completed
function DevotionalCard({
  series,
  completedCount,
  totalPublished,
  nextDay,
  nextEntryTitle,
  allComplete,
  onOpen,
  onViewPreviousEntries,
  onPause,
  onRemove,
}: {
  series: DevotionalSeries;
  /** Number of entries the member has completed. */
  completedCount: number;
  /** Total number of published entries in the series. */
  totalPublished: number;
  /** Next available day number (self-paced: last completed + 1). */
  nextDay: number;
  /** Title of the next entry to read, if available. */
  nextEntryTitle?: string;
  /** True when all published entries have been completed. */
  allComplete: boolean;
  /** Navigate to the next available entry. */
  onOpen: () => void;
  onViewPreviousEntries?: () => void;
  onPause?: () => void;
  onRemove?: () => void;
}) {
  const description = allComplete
    ? `${totalPublished} of ${totalPublished} completed`
    : completedCount > 0
      ? nextEntryTitle
        ? `Day ${nextDay} of ${totalPublished} · ${nextEntryTitle}`
        : `Day ${nextDay} of ${totalPublished}`
      : totalPublished > 0
        ? `Day 1 of ${totalPublished}`
        : 'Day 1';

  return (
    <EmmausContentCard
      label="DAILY DEVOTIONAL"
      title={series.title}
      description={description}
      primaryActionLabel="Continue"
      onAction={onOpen}
      headerTrailing={
        allComplete
          ? <CheckCircle2 size={18} className="text-primary shrink-0 mt-0.5" />
          : (onPause && onRemove)
            ? <WalkMoreMenu onPause={onPause} onRemove={onRemove} />
            : undefined
      }
      secondaryAction={
        onViewPreviousEntries
          ? { label: 'View Previous Entries →', onPress: onViewPreviousEntries }
          : undefined
      }
    />
  );
}

// ─── Daily Devotional discovery card — not yet started ───────────────────────
function DevotionalDiscoveryCard({
  series,
  onBegin,
  starting,
}: {
  series: DevotionalSeries;
  onBegin: () => void;
  starting: boolean;
}) {
  return (
    <EmmausContentCard
      label="DAILY DEVOTIONAL"
      title={series.title}
      description="A new devotional series is available."
      primaryActionLabel="Continue"
      onAction={onBegin}
      loading={starting}
    />
  );
}

// ─── 10 Minutes with Jesus card ───────────────────────────────────────────────
// Highest-priority card. Always first.
// CRITICAL: must never reference a day that has no published entry.
//   currentEntry — the actual published step the member should open today
//                  (null = all published content is already complete)
//   caughtUp     — true when progress.currentDay exceeds the highest published day;
//                  the member has finished all available content and must wait for
//                  new entries to be published before continuing.
//   onViewPreviousDays — when provided, a "View Previous Days →" text link is shown.
function FifteenMinutesCard({
  journey,
  prog,
  currentEntry,
  caughtUp = false,
  onContinue,
  onViewPreviousDays,
  devMode = false,
}: {
  journey: import('@/contexts/JourneyContext').Journey;
  prog: import('@/contexts/JourneyContext').Progress | undefined;
  /**
   * The real published entry the card should reference.
   * Null means all published content is done and the member is waiting for more.
   */
  currentEntry: { day: number; title: string } | null;
  /**
   * True when the member's arithmetic currentDay exceeds the highest published day.
   * Walk.tsx computes this and must clamp all routing before passing it here.
   */
  caughtUp?: boolean;
  onContinue: () => void;
  onViewPreviousDays?: () => void;
  /** When true (admin / super-admin), the daily release schedule is bypassed. */
  devMode?: boolean;
}) {
  // In dev mode the calendar lock is lifted: treat every day as immediately
  // available so devs can advance freely without waiting for tomorrow.
  const completedToday = devMode ? false : isCompletedToday(prog?.lastCompletedAt);
  const nextDayAvail   = devMode ? true  : isNextDayAvailable(prog?.lastCompletedAt);
  const started        = !!prog;

  /**
   * State machine — exhaustive:
   *   start      — member has never started
   *   ready      — today's entry is available and unread
   *   complete   — completed today; next day is coming soon
   *   tomorrow   — completed today; next day is not yet available (normal end-of-day)
   *   uptodate   — not completed today but caught up to end of published content
   *   waitlatest — completed today AND caught up (nothing more published yet)
   *
   * "waitlatest" is treated identically to "tomorrow" in the UI — both show
   * the done state with a "Review" action — but the description differs slightly.
   */
  type CardState = 'start' | 'ready' | 'complete' | 'tomorrow' | 'uptodate' | 'waitlatest';

  let state: CardState;
  if (!started)                              state = 'start';
  else if (caughtUp && completedToday)       state = 'waitlatest';
  else if (caughtUp && !completedToday)      state = 'uptodate';
  else if (completedToday && !nextDayAvail)  state = 'tomorrow';
  else if (completedToday)                   state = 'complete';
  else                                       state = 'ready';

  const cfg: Record<CardState, { label: string; variant: 'default'; disabled: boolean }> = {
    start:      { label: "Open Today's Time",      variant: 'default', disabled: false },
    ready:      {
      label:   prog && prog.completedDays.length > 0
                 ? "Return to Today's Time"
                 : "Open Today's Time",
      variant: 'default',
      disabled: false,
    },
    complete:   { label: 'Review',                 variant: 'default', disabled: false },
    tomorrow:   { label: 'Review',                 variant: 'default', disabled: false },
    uptodate:   { label: 'Review Latest Reading',  variant: 'default', disabled: false },
    waitlatest: { label: 'Review',                 variant: 'default', disabled: false },
  };

  const done =
    state === 'complete' ||
    state === 'tomorrow' ||
    state === 'uptodate' ||
    state === 'waitlatest';

  // ── Title line ──
  // Always references the real published entry — never a phantom day number.
  const titleLine = (() => {
    if (state === 'start') return "Today's time with Jesus is ready.";
    if (state === 'uptodate') {
      // Show the last published entry the member has completed
      return currentEntry
        ? `Day ${currentEntry.day} — ${currentEntry.title}`
        : "You're up to date.";
    }
    if (done) {
      // Completed state: show the entry the member just read
      return currentEntry
        ? `Day ${currentEntry.day} — done for today`
        : "Today's time with Jesus is complete.";
    }
    // ready — show the entry they are about to open
    return currentEntry
      ? `Day ${currentEntry.day} — ${currentEntry.title}`
      : "Today's time with Jesus is ready.";
  })();

  // ── Description line ──
  const descriptionLine = (() => {
    if (state === 'uptodate') return "You're up to date. The next reading will appear when it is ready.";
    if (state === 'waitlatest') return "Today's time with Jesus is complete. New content will appear when it is ready.";
    if (state === 'tomorrow' || state === 'complete') return "Today's time with Jesus is complete. Come back tomorrow.";
    return undefined;
  })();

  return (
    <EmmausContentCard
      label="DAILY RHYTHM"
      title={journey.title}
      description={done ? descriptionLine : titleLine}
      // When done, suppress the primary button — only the secondary link remains.
      primaryActionLabel={done ? undefined : cfg[state].label}
      onAction={done ? undefined : onContinue}
      disabled={done ? undefined : cfg[state].disabled}
      variant={done ? 'default' : 'featured'}
      headerTrailing={
        done
          ? <CheckCircle2 size={20} className="text-primary shrink-0" />
          : undefined
      }
      secondaryAction={
        onViewPreviousDays
          ? { label: 'View Previous Days →', onPress: onViewPreviousDays }
          : undefined
      }
    />
  );
}

// SermonDevotionalCard removed — Walk.tsx now uses the shared SermonCompanionCard component.

// ─── Your Journeys section ────────────────────────────────────────────────────
// Lists journeys the member has already started as full EmmausContentCards,
// mirroring the card style used by Devotionals and Sermon Companions.
// Returns null when there are no started journeys — no heading, no empty state.
function YourJourneysSection({
  startedJourneys,
  onSelect,
}: {
  startedJourneys: Array<{
    journey: import('@/contexts/JourneyContext').Journey;
    prog: import('@/contexts/JourneyContext').Progress;
    currentStep: import('@/contexts/JourneyContext').Step | null;
    totalPublishedSteps: number;
  }>;
  onSelect: (journeyId: string, prog: import('@/contexts/JourneyContext').Progress) => void;
}) {
  if (startedJourneys.length === 0) return null;

  return (
    <section className="space-y-4">
      {startedJourneys.map(({ journey, prog, currentStep, totalPublishedSteps }) => {
        const completedCount = prog.completedDays.length;
        const isCompleted =
          totalPublishedSteps > 0 && completedCount >= totalPublishedSteps;

        // Mirror the description formula used by Devotionals and Next Steps so
        // every surface always shows the same progress string for the same walk.
        const description = isCompleted
          ? `${totalPublishedSteps} of ${totalPublishedSteps} completed`
          : completedCount > 0
            ? currentStep?.title
              ? `Day ${prog.currentDay} of ${totalPublishedSteps} · ${currentStep.title}`
              : `Day ${prog.currentDay} of ${totalPublishedSteps}`
            : totalPublishedSteps > 0
              ? `Day 1 of ${totalPublishedSteps}`
              : undefined;

        return (
          <EmmausContentCard
            key={journey.id}
            label="WALK"
            title={journey.title}
            description={description}
            primaryActionLabel={isCompleted ? undefined : 'Continue'}
            onAction={isCompleted ? undefined : () => onSelect(journey.id, prog)}
            headerTrailing={
              isCompleted
                ? <CheckCircle2 size={18} className="text-primary shrink-0 mt-0.5" />
                : undefined
            }
          />
        );
      })}
    </section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Walk() {
  const { user } = useAuth();
  const { journeys, progress, loading, startJourney, getStepsForJourney } = useJourney();
  const { getState } = useEnrollment();
  const [, setLocation] = useLocation();

  // Hooks must all be called before early returns.
  const publishedJourneys = useMemo(
    () => journeys.filter(j => j.status === 'Published'),
    [journeys]
  );

  // Daily Devotionals — active (started) series and discovery (unstarted) series
  const [activeDevotional, setActiveDevotional] = useState<{
    series: DevotionalSeries;
    progress: DevotionalProgress;
    entries: DevotionalEntry[];
  } | null>(null);
  const [unstartedSeries, setUnstartedSeries] = useState<DevotionalSeries[]>([]);
  const [startingId, setStartingId] = useState<string | null>(null);

  const reloadDevotionals = useCallback(async (userId?: string) => {
    const auth = userId ? { userId } : undefined;
    const [seriesList, progressList] = await Promise.all([
      listPublishedSeries(auth),
      getAllProgress(auth),
    ]);

    const withProg = seriesList.map(s => ({
      series: s,
      progress: progressList.find(p => p.seriesId === s.id) ?? null,
    }));

    const started = withProg.find(x => x.progress !== null);
    if (started && started.progress) {
      // Fetch entries so we can compute available day and show the entry title
      const withEntries = await getSeriesWithEntries(started.series.id, auth)
        .catch(() => null);
      setActiveDevotional({
        series: started.series,
        progress: started.progress,
        entries: withEntries?.entries ?? [],
      });
      setUnstartedSeries([]);
    } else {
      setActiveDevotional(null);
      setUnstartedSeries(seriesList);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    reloadDevotionals(user.id).catch(() => {/* devotionals are supplementary */});
  }, [user?.id, reloadDevotionals]);

  const handleBeginDevotional = useCallback(async (seriesId: string) => {
    if (!user) return;
    setStartingId(seriesId);
    try {
      await startSeries(seriesId, { userId: user.id });
      await reloadDevotionals(user.id);
      setLocation(`/devotional/${seriesId}/day/1?source=today`);
    } catch {
      // ignore — user can retry
    } finally {
      setStartingId(null);
    }
  }, [user, reloadDevotionals, setLocation]);

  // ── Pause / Remove dialog state ──────────────────────────────────────────────
  // Tracks which card is showing the confirm-pause dialog.
  const [pauseTarget, setPauseTarget] = useState<
    { type: 'devotional'; id: string; title: string }
    | { type: 'sermon-companion'; id: string; title: string }
    | null
  >(null);

  // ── Sermon Companion (from sermon_companion table via API) ───────────────────
  // currentWeeklySermonCompanionId is set by the admin in Media Studio and stored
  // in localStorage. Loading it here (before early returns) satisfies Rules of Hooks.
  const [scCompanion, setScCompanion] = useState<{
    id: string;
    title: string;
    numberOfDays: number;
    currentDay: number;
    completedDays: number[];
    /** Title of the entry at currentDay, if available. */
    nextEntryTitle?: string;
    isStarted: boolean;
  } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`${BASE_URL}/api/sermon-companions/current-week/member`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: {
        id: string;
        title: string;
        numberOfDays: number;
        entries?: { dayNumber: number; title: string }[];
        progress: { currentDay: number; completedDays: number[] } | null;
      } | null) => {
        if (!data) { setScCompanion(null); return; }
        const currentDay = data.progress?.currentDay ?? 1;
        const completedDays = data.progress?.completedDays ?? [];
        const nextEntryTitle = data.entries?.find(e => e.dayNumber === currentDay)?.title;
        setScCompanion({
          id: data.id,
          title: data.title,
          numberOfDays: data.numberOfDays,
          currentDay,
          completedDays,
          nextEntryTitle,
          isStarted: !!data.progress,
        });
      })
      .catch(() => setScCompanion(null));
  }, [user?.id]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-page-safe">
        <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-8">
          <div className="space-y-1.5 pt-2">
            <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
          </div>
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </main>
      </div>
    );
  }

  // ── Content resolution ───────────────────────────────────────────────────────

  // 1. Daily Rhythm — 10 Minutes with Jesus
  const coreJourney = publishedJourneys.find(
    j => j.journeyType === 'daily-rhythm' || j.journeyType === 'core'
  );
  const coreProg = coreJourney ? progress[coreJourney.id] : undefined;

  const devMode = isDevelopmentMode(user);

  // ── Daily Rhythm published-entry resolution ───────────────────────────────
  // RULE: the card must only ever reference a real published entry.
  //   1. Load all published steps for the Daily Rhythm journey.
  //   2. Determine the highest published day (maxPublishedDay).
  //   3. Clamp progress.currentDay to maxPublishedDay — "caughtUp" when rawCurrentDay exceeds it.
  //   4. Find the concrete entry for the effective day.
  //   5. All routing uses the validated effectiveCoreDay — never the raw arithmetic value.
  const coreSteps = coreJourney
    ? getStepsForJourney(coreJourney.id).filter(s => s.status === 'Published')
    : [];
  const coreMaxPublishedDay = coreSteps.length > 0
    ? Math.max(...coreSteps.map(s => s.day))
    : 0;
  const rawCoreCurrentDay   = coreProg?.currentDay ?? 1;
  // "Caught up" = the member's progress has advanced past all published content.
  const coreCaughtUp        = coreMaxPublishedDay > 0 && rawCoreCurrentDay > coreMaxPublishedDay;
  // The day we actually show and route to — clamped to real published content.
  const effectiveCoreDay    = coreCaughtUp ? coreMaxPublishedDay : rawCoreCurrentDay;
  // The concrete published entry for effectiveCoreDay (null if no entries loaded yet).
  const coreCurrentEntry    = coreSteps.find(s => s.day === effectiveCoreDay) ?? null;

  // In dev mode the calendar lock is lifted, so "completed today" is always false —
  // the card advances freely without waiting for tomorrow.
  const coreCompletedToday  = !devMode && isCompletedToday(coreProg?.lastCompletedAt);

  // True when the member has nothing left to act on today — used to suppress
  // the heartbeat animation so it only pulses when there is something to open.
  const coreDone = coreCompletedToday || coreCaughtUp;

  // "View Previous Days →" appears when at least one earlier published day exists.
  const hasPreviousDays =
    !!coreJourney &&
    effectiveCoreDay > 1 &&
    coreSteps.some(s => s.day < effectiveCoreDay);

  // 3. Your Journeys — journeys the member has already started.
  //    Includes: active growth journeys + started daily devotional.
  //    Excludes: Daily Rhythm (shown above), Companion (shown below).
  //    Status check: prefer server-backed progress[j.id]?.status; fall back to
  //    localStorage (enrollment.ts optimistic cache) for instant UI updates.
  const activeGrowthJourneys = publishedJourneys
    .filter(j => {
      if (!progress[j.id]) return false;
      if (isExemptJourney(j)) return false;
      // Server status wins when present; optimistic localStorage cache as fallback.
      const serverStatus = progress[j.id]?.status;
      if (serverStatus) return serverStatus === 'active';
      return getState(j.id) === 'active';
    })
    .map(j => ({ journey: j, prog: progress[j.id]! }));

  const devotionalJourney = publishedJourneys.find(j => j.journeyType === 'devotional');
  const devotionalProg    = devotionalJourney ? progress[devotionalJourney.id] : undefined;
  const devotionalEntry   =
    devotionalJourney && devotionalProg
      ? [{ journey: devotionalJourney, prog: devotionalProg }]
      : [];

  // Enrich each started journey with its current step title and total published
  // step count so YourJourneysSection can render a progress-aware description.
  const startedJourneys = [...activeGrowthJourneys, ...devotionalEntry].map(
    ({ journey, prog }) => {
      const steps = getStepsForJourney(journey.id).filter(
        s => s.status === 'Published' && !s.isCompletionStep,
      );
      const currentStep = steps.find(s => s.day === prog.currentDay) ?? null;
      return { journey, prog, currentStep, totalPublishedSteps: steps.length };
    },
  );

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function goToDailyRhythmDay(day: number) {
    setLocation(`/daily-rhythm/day/${day}`);
  }

  function goToJourney(journeyId: string, prog: { currentDay: number }) {
    // progress[journeyId] is always present here — goToJourney is only called from
    // "Your Journeys" cards which filter on progress[j.id] existence. The
    // startJourney guard that was previously here was dead code and has been removed.
    const day = prog.currentDay ?? 1;
    setLocation(`/journey/${journeyId}/day/${day}?source=walk`);
  }

  // ── Greeting ─────────────────────────────────────────────────────────────────

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // Derive a safe first name — never show 'Friend' or empty strings.
  const rawPreferredName = user.preferredName?.trim();
  const greetingFirstName =
    rawPreferredName && !rawPreferredName.includes('@')
      ? rawPreferredName.split(' ')[0]
      : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      {/* Dev mode indicator — shown only to authorised admins with dev mode on */}
      {devMode && <DevModeBanner />}
      {/* Admin quick-link (shown to admins regardless of dev mode) */}
      {user.role === 'admin' && !devMode && (
        <div className="bg-primary text-primary-foreground text-xs py-1.5 text-center font-medium">
          Admin mode —{' '}
          <Link href="/admin" className="underline">
            Go to Admin
          </Link>
        </div>
      )}

      <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-8">

        {/* ── Greeting ───────────────────────────────────────────────────────── */}
        <header>
          <motion.h1
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="text-[30px] font-sans font-medium tracking-tight leading-tight text-foreground"
            data-testid="text-greeting"
          >
            {greetingFirstName ? `${greeting}, ${greetingFirstName}.` : `${greeting}.`}
          </motion.h1>
        </header>

        {/* ── 1. 10 Minutes with Jesus ───────────────────────────────────────── */}
        {coreJourney ? (
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            {/* Heartbeat wrapper — animates as a single unit when actionable.
                Separate from motion.section so scale never conflicts with the
                entrance translateY. Suppressed once the member has read today. */}
            <div className={coreDone ? undefined : 'emmaus-heartbeat'}>
            <FifteenMinutesCard
              journey={coreJourney}
              prog={coreProg}
              currentEntry={coreCurrentEntry}
              caughtUp={coreCaughtUp}
              devMode={devMode}
              onContinue={() => {
                if (coreCaughtUp) {
                  // Caught up past all published content → review the last published entry.
                  // ?from=walk keeps the back arrow pointing to Today's Steps (not Previous Days).
                  const reviewDay = coreMaxPublishedDay > 0 ? coreMaxPublishedDay : effectiveCoreDay;
                  setLocation(`/daily-rhythm/day/${reviewDay}?from=walk`);
                } else if (coreCompletedToday) {
                  // Completed today's entry. After completeStep runs, currentDay advances by 1,
                  // so the day just finished is rawCoreCurrentDay - 1.
                  // ?from=walk keeps the back arrow pointing to Today's Steps.
                  const reviewDay = Math.max(1, rawCoreCurrentDay - 1);
                  setLocation(`/daily-rhythm/day/${reviewDay}?from=walk`);
                } else {
                  goToDailyRhythmDay(effectiveCoreDay);
                }
              }}
              onViewPreviousDays={
                hasPreviousDays ? () => setLocation('/daily-rhythm/previous?from=walk') : undefined
              }
            />
            </div>
          </motion.section>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-[15px] text-muted-foreground">
              We couldn't load this step. Please try again.
            </p>
          </div>
        )}

        {/* ── 2. Daily Devotional — self-paced ──────────────────────────────── */}
        {activeDevotional ? (() => {
          const publishedEntries = activeDevotional.entries.filter(e => e.status === 'Published');
          const maxPublishedDay  = publishedEntries.length > 0
            ? Math.max(...publishedEntries.map(e => e.dayNumber))
            : 1;
          const completedDays   = activeDevotional.progress.completedDays ?? [];
          // Self-paced: next available day is derived from completions, not calendar.
          const nextDay         = calcAvailableDaySelfPaced(completedDays, maxPublishedDay, devMode);
          const nextEntry       = activeDevotional.entries.find(
            e => e.dayNumber === nextDay && e.status === 'Published',
          );
          const completedCount  = completedDays.length;
          const allComplete     = completedCount >= publishedEntries.length && publishedEntries.length > 0;
          // For review when all complete, navigate to the highest completed day.
          const openDay         = allComplete
            ? Math.max(...completedDays)
            : nextDay;
          // Show "View Previous Entries" once the member has completed at least one.
          const hasPrevEntries  = completedCount > 0;

          return (
            <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.09 }}
            >
              <DevotionalCard
                series={activeDevotional.series}
                completedCount={completedCount}
                totalPublished={publishedEntries.length}
                nextDay={nextDay}
                nextEntryTitle={nextEntry?.title}
                allComplete={allComplete}
                onOpen={() =>
                  setLocation(`/devotional/${activeDevotional.series.id}/day/${openDay}?source=today`)
                }
                onViewPreviousEntries={
                  hasPrevEntries
                    ? () => setLocation(`/devotional/${activeDevotional.series.id}/previous?from=walk`)
                    : undefined
                }
                onPause={() => setPauseTarget({
                  type: 'devotional',
                  id: activeDevotional.series.id,
                  title: activeDevotional.series.title,
                })}
                onRemove={() => {
                  // Optimistic: hide the card immediately
                  setActiveDevotional(null);
                  // Fire-and-forget
                  void callEngagementAction('devotional', activeDevotional.series.id, 'remove');
                }}
              />
            </motion.section>
          );
        })() : unstartedSeries.length > 0 ? (
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.09 }}
          >
            <DevotionalDiscoveryCard
              series={unstartedSeries[0]}
              onBegin={() => handleBeginDevotional(unstartedSeries[0].id)}
              starting={startingId === unstartedSeries[0].id}
            />
          </motion.section>
        ) : null}

        {/* ── 3. Your Journeys ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.10 }}
        >
          <YourJourneysSection
            startedJourneys={startedJourneys}
            onSelect={goToJourney}
          />
        </motion.div>

        {/* ── 3. This Week's Sermon Companion ────────────────────────────────── */}
        {scCompanion && (
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <EmmausContentCard
              label="SERMON COMPANION"
              title={scCompanion.title}
              description={(() => {
                // Mirror the formula in buildCompanionItem (next-steps.ts) and
                // buildDevotionalItem so Today's Steps and Next Steps always agree.
                const completedCount = scCompanion.completedDays.length;
                const total = scCompanion.numberOfDays;
                const allComplete = total > 0 && completedCount >= total;
                if (allComplete) return `${total} of ${total} completed`;
                if (completedCount > 0) {
                  return scCompanion.nextEntryTitle
                    ? `Day ${scCompanion.currentDay} of ${total} · ${scCompanion.nextEntryTitle}`
                    : `Day ${scCompanion.currentDay} of ${total}`;
                }
                return total > 0 ? `Day 1 of ${total}` : 'Day 1';
              })()}
              metadata={`${scCompanion.numberOfDays} Days`}
              // Hide Continue when all days are complete — currentDay advances
              // beyond numberOfDays after the final day is marked complete.
              primaryActionLabel={
                scCompanion.isStarted && scCompanion.currentDay > scCompanion.numberOfDays
                  ? undefined
                  : "Continue"
              }
              onAction={
                scCompanion.isStarted && scCompanion.currentDay > scCompanion.numberOfDays
                  ? undefined
                  : () => setLocation(
                      `/sermon-companion/${scCompanion.id}/day/${scCompanion.currentDay}?source=today`
                    )
              }
              headerTrailing={
                scCompanion.isStarted
                  ? (
                    <WalkMoreMenu
                      onPause={() => setPauseTarget({
                        type: 'sermon-companion',
                        id: scCompanion.id,
                        title: scCompanion.title,
                      })}
                      onRemove={() => {
                        // Optimistic: hide the card immediately
                        setScCompanion(null);
                        // Fire-and-forget
                        void callEngagementAction('sermon-companion', scCompanion.id, 'remove');
                      }}
                    />
                  )
                  : undefined
              }
              secondaryAction={
                scCompanion.isStarted && scCompanion.currentDay > 1
                  ? {
                      label: 'View Previous Reflections →',
                      onPress: () => setLocation(`/sermon-companion/${scCompanion.id}/previous?from=walk`),
                    }
                  : undefined
              }
            />
          </motion.section>
        )}

      </main>

      <BottomNav />

      {/* ── Pause confirmation dialog ─────────────────────────────────────────── */}
      {pauseTarget && (
        <WalkPauseDialog
          title={pauseTarget.title}
          onCancel={() => setPauseTarget(null)}
          onPause={() => {
            const target = pauseTarget;
            setPauseTarget(null);
            if (target.type === 'devotional') {
              // Optimistic: hide card
              setActiveDevotional(null);
              void callEngagementAction('devotional', target.id, 'pause');
            } else {
              // Optimistic: hide card
              setScCompanion(null);
              void callEngagementAction('sermon-companion', target.id, 'pause');
            }
          }}
        />
      )}
    </div>
  );
}
