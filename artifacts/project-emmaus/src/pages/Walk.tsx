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
import { dismissBadge, computeUpdatedBadge } from '@/lib/badge-api';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, EyeOff, MoreHorizontal, Pause, X } from 'lucide-react';
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

/** Fire-and-forget engagement action (pause / hide / unhide / remove).
 *  userId must be supplied so the X-User-Id header is always sent — the signed
 *  session cookie alone is not reliable in all deployment environments. */
async function callEngagementAction(
  type: 'journey' | 'devotional' | 'sermon-companion',
  id: string,
  action: 'pause' | 'remove' | 'hide' | 'unhide',
  userId?: string,
): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (userId) headers['X-User-Id'] = userId;
    await fetch(
      `${BASE_URL}/api/engagements/${type}/${encodeURIComponent(id)}/${action}`,
      { method: 'POST', credentials: 'include', headers },
    );
  } catch { /* network errors are non-fatal */ }
}

// ─── Walk-specific MoreMenu ────────────────────────────────────────────────────

function WalkMoreMenu({ onPause, onHide }: { onPause: () => void; onHide: () => void }) {
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
              onClick={() => { setOpen(false); onHide(); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2"
            >
              <EyeOff size={13} className="text-muted-foreground" /> Hide from Today's Steps
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
          Your progress will be kept exactly as it is. Pausing stops your daily rhythm until you choose to resume from the Next Steps tab.
        </p>
        <p className="text-[13px] text-muted-foreground/70 leading-relaxed -mt-2">
          To simply remove this card from Today's Steps without pausing, use <span className="font-medium text-muted-foreground">Hide from Today's Steps</span> instead.
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
  badge,
  onOpen,
  onViewPreviousEntries,
  onPause,
  onHide,
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
  /** Smart Content Indicator — UPDATED only on Today's Steps */
  badge?: 'UPDATED' | null;
  /** Navigate to the next available entry. */
  onOpen: () => void;
  onViewPreviousEntries?: () => void;
  onPause?: () => void;
  /** Non-destructive hide: removes from Today's Steps, preserves all progress. */
  onHide?: () => void;
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
      badge={badge ?? null}
      onAction={onOpen}
      headerTrailing={
        allComplete
          ? <CheckCircle2 size={18} className="text-primary shrink-0 mt-0.5" />
          : (onPause && onHide)
            ? <WalkMoreMenu onPause={onPause} onHide={onHide} />
            : undefined
      }
      secondaryAction={
        onViewPreviousEntries
          ? { label: 'View Previous →', onPress: onViewPreviousEntries }
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
          ? { label: 'View Previous →', onPress: onViewPreviousDays }
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
  onViewPrevious,
  onHide,
  onPause,
}: {
  startedJourneys: Array<{
    journey: import('@/contexts/JourneyContext').Journey;
    prog: import('@/contexts/JourneyContext').Progress;
    currentStep: import('@/contexts/JourneyContext').Step | null;
    totalPublishedSteps: number;
  }>;
  onSelect: (journeyId: string, prog: import('@/contexts/JourneyContext').Progress) => void;
  onViewPrevious: (journeyId: string) => void;
  onHide: (journeyId: string) => void;
  onPause: (journeyId: string, title: string) => void;
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

        // Today's Steps shows UPDATED only — never NEW.
        // Any journey in startedJourneys has a progress record (hasProgress = true).
        const badge = computeUpdatedBadge(
          journey.notifyPublishedAt ?? null,
          prog.lastOpenedAt ?? null,
          true,
        );

        return (
          <EmmausContentCard
            key={journey.id}
            label="WALK"
            title={journey.title}
            description={description}
            badge={badge}
            primaryActionLabel={isCompleted ? undefined : 'Continue'}
            onAction={isCompleted ? undefined : () => {
              void dismissBadge('journey', journey.id);
              onSelect(journey.id, prog);
            }}
            headerTrailing={
              isCompleted
                ? <CheckCircle2 size={18} className="text-primary shrink-0 mt-0.5" />
                : <WalkMoreMenu
                    onPause={() => onPause(journey.id, journey.title)}
                    onHide={() => onHide(journey.id)}
                  />
            }
            secondaryAction={
              completedCount > 0
                ? { label: 'View Previous →', onPress: () => onViewPrevious(journey.id) }
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

  // Daily Devotionals — ALL active (started) series and discovery (unstarted) series
  const [activeDevotionals, setActiveDevotionals] = useState<Array<{
    series: DevotionalSeries;
    progress: DevotionalProgress;
    entries: DevotionalEntry[];
  }>>([]);
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

    // Show ALL started, non-hidden series on Today's Steps.
    const allStarted = withProg.filter(x => x.progress !== null && !x.progress.hidden_from_today);
    if (allStarted.length > 0) {
      // Load entries in parallel so every card can show its entry title.
      const withEntries = await Promise.all(
        allStarted.map(async ({ series, progress }) => {
          const data = await getSeriesWithEntries(series.id, auth).catch(() => null);
          return { series, progress: progress!, entries: data?.entries ?? [] };
        }),
      );
      setActiveDevotionals(withEntries);
      setUnstartedSeries([]);
    } else {
      setActiveDevotionals([]);
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

  const handleBeginCompanion = useCallback(async (companionId: string) => {
    if (!user) return;
    setStartingCompanionId(companionId);
    try {
      await fetch(`${BASE_URL}/api/sermon-companions/${companionId}/progress/start`, {
        method: 'POST',
        credentials: 'include',
      });
      // Dismiss any NEW badge — progress now exists; opening it clears the indicator.
      void dismissBadge('companion', companionId);
      setUnstartedCurrentWeekCompanion(null);
      setLocation(`/sermon-companion/${companionId}/day/1?source=today`);
    } catch {
      // ignore — user can retry
    } finally {
      setStartingCompanionId(null);
    }
  }, [user, setLocation]);

  // ── Pause / Remove dialog state ──────────────────────────────────────────────
  // Tracks which card is showing the confirm-pause dialog.
  const [pauseTarget, setPauseTarget] = useState<
    { type: 'journey'; id: string; title: string }
    | { type: 'devotional'; id: string; title: string }
    | { type: 'sermon-companion'; id: string; title: string }
    | null
  >(null);

  // ── Journey hide state — optimistic local removal ────────────────────────────
  // Journey progress is loaded from JourneyContext (not a local fetch like
  // devotionals), so we track hidden IDs in a local Set for instant UI updates
  // rather than mutating the shared context.
  const [hiddenJourneyIds, setHiddenJourneyIds] = useState<Set<string>>(new Set());

  // ── Sermon Companion (from sermon_companion table via API) ───────────────────
  // currentWeeklySermonCompanionId is set by the admin in Media Studio and stored
  // in localStorage. Loading it here (before early returns) satisfies Rules of Hooks.
  // All in-progress sermon companions — not just the current-week one.
  const [scCompanions, setScCompanions] = useState<Array<{
    id: string;
    title: string;
    numberOfDays: number;
    currentDay: number;
    completedDays: number[];
    /** Title of the entry at currentDay, if available. */
    nextEntryTitle?: string;
    isCurrentWeek: boolean;
    /** Smart Content Indicator — UPDATED only on Today's Steps */
    badge?: 'UPDATED' | null;
  }>>([]);
  /** Current-week companion the member hasn't started yet — shown as a discovery card. */
  const [unstartedCurrentWeekCompanion, setUnstartedCurrentWeekCompanion] = useState<{
    id: string; title: string; numberOfDays: number;
  } | null>(null);
  const [startingCompanionId, setStartingCompanionId] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    fetch(`${BASE_URL}/api/sermon-companions/member/engagements`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((data: Array<{
        id: string;
        title: string;
        numberOfDays: number;
        isCurrentWeek: boolean;
        entries: { dayNumber: number; title: string }[];
        progress: { currentDay: number; completedDays: number[]; status: string } | null;
        badge?: 'NEW' | 'UPDATED' | null;
      }>) => {
        // Show only companions the member has started, not paused, and not hidden.
        const started = data
          .filter(c => c.progress !== null && c.progress.status !== 'paused' && !(c.progress as { hiddenFromToday?: boolean }).hiddenFromToday)
          .sort((a, b) => (b.isCurrentWeek ? 1 : 0) - (a.isCurrentWeek ? 1 : 0));
        setScCompanions(started.map(c => {
          const currentDay = c.progress!.currentDay;
          const nextEntryTitle = c.entries.find(e => e.dayNumber === currentDay)?.title;
          return {
            id: c.id,
            title: c.title,
            numberOfDays: c.numberOfDays,
            currentDay,
            completedDays: c.progress!.completedDays,
            nextEntryTitle,
            isCurrentWeek: c.isCurrentWeek,
            // Today's Steps only shows UPDATED — never NEW
            badge: c.badge === 'UPDATED' ? 'UPDATED' : null,
          };
        }));
        // Surface the current-week companion as a discovery card for members who
        // haven't started any companion yet (progress === null).
        const unstartedCW = data.find(c => c.progress === null && c.isCurrentWeek);
        setUnstartedCurrentWeekCompanion(
          unstartedCW
            ? { id: unstartedCW.id, title: unstartedCW.title, numberOfDays: unstartedCW.numberOfDays }
            : null,
        );
      })
      .catch(() => { setScCompanions([]); setUnstartedCurrentWeekCompanion(null); });
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
  // Only match 'daily-rhythm': the startup migration already promoted the actual
  // Daily Rhythm journey from 'core' → 'daily-rhythm', so any remaining 'core'
  // journey is an admin-created growth journey and must NOT be shown here.
  const coreJourney = publishedJourneys.find(j => j.journeyType === 'daily-rhythm');
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
  //    Excludes: hidden journeys (optimistic local set OR server flag).
  //    Status check: prefer server-backed progress[j.id]?.status; fall back to
  //    localStorage (enrollment.ts optimistic cache) for instant UI updates.
  const activeGrowthJourneys = publishedJourneys
    .filter(j => {
      if (!progress[j.id]) return false;
      if (isExemptJourney(j)) return false;
      // Hide: optimistic local set (instant) OR server flag (after page reload).
      if (hiddenJourneyIds.has(j.id)) return false;
      if (progress[j.id]?.hiddenFromToday) return false;
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

        {/* ── 2. Daily Devotionals — self-paced (all active series) ─────────── */}
        {activeDevotionals.length > 0
          ? activeDevotionals.map(activeDevotional => {
              const publishedEntries = activeDevotional.entries.filter(e => e.status === 'Published');
              const maxPublishedDay  = publishedEntries.length > 0
                ? Math.max(...publishedEntries.map(e => e.dayNumber))
                : 1;
              const completedDays   = activeDevotional.progress.completedDays ?? [];
              const nextDay         = calcAvailableDaySelfPaced(completedDays, maxPublishedDay, devMode);
              const nextEntry       = activeDevotional.entries.find(
                e => e.dayNumber === nextDay && e.status === 'Published',
              );
              const completedCount  = completedDays.length;
              const allComplete     = completedCount >= publishedEntries.length && publishedEntries.length > 0;
              const openDay         = allComplete ? Math.max(...completedDays) : nextDay;
              const hasPrevEntries  = completedCount > 0;

              return (
                <motion.section
                  key={activeDevotional.series.id}
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
                    badge={computeUpdatedBadge(
                      activeDevotional.series.notifyPublishedAt ?? null,
                      activeDevotional.progress.lastOpenedAt ?? null,
                      // hasProgress: any devotional in activeDevotionals has a progress
                      // record (started), so this is always true here.
                      true,
                    )}
                    onOpen={() => {
                      void dismissBadge('devotional', activeDevotional.series.id);
                      setLocation(`/devotional/${activeDevotional.series.id}/day/${openDay}?source=today`);
                    }}
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
                    onHide={() => {
                      setActiveDevotionals(prev => prev.filter(d => d.series.id !== activeDevotional.series.id));
                      void callEngagementAction('devotional', activeDevotional.series.id, 'hide', user?.id);
                    }}
                  />
                </motion.section>
              );
            })
          : null
        }

        {/* ── 3. Your Journeys ───────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.10 }}
        >
          <YourJourneysSection
            startedJourneys={startedJourneys}
            onSelect={goToJourney}
            onViewPrevious={(id) => setLocation(`/journey/${id}/previous?from=walk`)}
            onHide={(journeyId) => {
              setHiddenJourneyIds(prev => new Set([...prev, journeyId]));
              void callEngagementAction('journey', journeyId, 'hide', user?.id);
            }}
            onPause={(journeyId, title) => setPauseTarget({ type: 'journey', id: journeyId, title })}
          />
        </motion.div>

        {/* ── 4. Sermon Companions — all in-progress ─────────────────────────── */}
        {scCompanions.map(sc => {
          const completedCount = sc.completedDays.length;
          const total = sc.numberOfDays;
          const allComplete = total > 0 && completedCount >= total;
          const description = allComplete
            ? `${total} of ${total} completed`
            : completedCount > 0
              ? sc.nextEntryTitle
                ? `Day ${sc.currentDay} of ${total} · ${sc.nextEntryTitle}`
                : `Day ${sc.currentDay} of ${total}`
              : total > 0 ? `Day 1 of ${total}` : 'Day 1';

          return (
            <motion.section
              key={sc.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              <EmmausContentCard
                label="SERMON COMPANION"
                title={sc.title}
                description={description}
                metadata={`${sc.numberOfDays} Days`}
                // Hide Continue when all days are complete.
                primaryActionLabel={sc.currentDay > sc.numberOfDays ? undefined : 'Continue'}
                badge={sc.badge ?? null}
                onAction={
                  sc.currentDay > sc.numberOfDays
                    ? undefined
                    : () => {
                        void dismissBadge('companion', sc.id);
                        setLocation(`/sermon-companion/${sc.id}/day/${sc.currentDay}?source=today`);
                      }
                }
                headerTrailing={
                  <WalkMoreMenu
                    onPause={() => setPauseTarget({
                      type: 'sermon-companion',
                      id: sc.id,
                      title: sc.title,
                    })}
                    onHide={() => {
                      setScCompanions(prev => prev.filter(c => c.id !== sc.id));
                      void callEngagementAction('sermon-companion', sc.id, 'hide', user?.id);
                    }}
                  />
                }
                secondaryAction={
                  sc.currentDay > 1
                    ? {
                        label: 'View Previous →',
                        onPress: () => setLocation(`/sermon-companion/${sc.id}/previous?from=walk`),
                      }
                    : undefined
                }
              />
            </motion.section>
          );
        })}

        {/* Discovery cards for optional content have been removed from Today's Steps.
            Optional content (Devotionals, Companions, Walks) begins life in Next Steps
            and only appears here after the member intentionally starts it. */}


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
            if (target.type === 'journey') {
              setHiddenJourneyIds(prev => new Set([...prev, target.id]));
              void callEngagementAction('journey', target.id, 'pause', user?.id);
            } else if (target.type === 'devotional') {
              setActiveDevotionals(prev => prev.filter(d => d.series.id !== target.id));
              void callEngagementAction('devotional', target.id, 'pause', user?.id);
            } else {
              setScCompanions(prev => prev.filter(c => c.id !== target.id));
              void callEngagementAction('sermon-companion', target.id, 'pause', user?.id);
            }
          }}
        />
      )}
    </div>
  );
}
