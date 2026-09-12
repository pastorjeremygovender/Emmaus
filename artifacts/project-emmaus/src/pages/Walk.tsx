/**
 * Walk — "What is Jesus inviting me to continue today?"
 *
 * Visual hierarchy (top → bottom):
 *   1. Today's 10 Minutes with Jesus   (highest priority — always first)
 *   2. Sermon Companions               (this week's sermon + up to two accessed companions)
 *   3. Daily Devotionals               (self-paced series the member has started)
 *   4. Your Journeys                   (started growth journeys)
 *
 * Ask Emmaus is available from its dedicated screen, not as a floating action
 * on Today's Steps.
 */

import { useLocation, Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { UnifiedEmmausInput } from '@/components/UnifiedEmmausInput';
import { dismissBadge, computeUpdatedBadge } from '@/lib/badge-api';
import { motion } from 'framer-motion';
import { CheckCircle2, Compass, X } from 'lucide-react';
import { useEnrollment } from '@/lib/enrollment';
import { getStepLabel, resolveStepPrefix, getDevotionalLabel } from '@/lib/step-label';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { DevModeBanner } from '@/components/DevModeBanner';
import { MemberHeaderActions } from '@/components/MemberHeaderActions';
import { useMemo, useEffect, useState, useCallback } from 'react';
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
import { cn } from '@/lib/utils';
import { ContentBadge } from '@/components/ContentBadge';
import type { ReactNode } from 'react';
import { listCollections, type Collection } from '@/lib/collections-api';
import { projectTodaysJourneys } from '@/lib/todays-journey-projection';
import { resolveDailyRhythmCalendar, publishedDailyRhythmStep } from '@/lib/daily-rhythm-calendar';

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

interface SermonCompanionEngagement {
  id: string;
  title: string;
  numberOfDays: number;
  isCurrentWeek: boolean;
  entries: Array<{ dayNumber: number; title: string }>;
  progress: {
    currentDay: number;
    completedDays: number[];
    status: string;
    hiddenFromToday?: boolean;
  } | null;
  badge: 'UPDATED' | 'NEW' | null;
}

/** Fire-and-forget engagement action (hide / unhide / remove).
 *  Identity is derived server-side from the secure session cookie. */
async function callEngagementAction(
  type: 'journey' | 'devotional' | 'sermon-companion',
  id: string,
  action: 'remove' | 'hide' | 'unhide',
  _userId?: string,
): Promise<void> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    await fetch(
      `${BASE_URL}/api/engagements/${type}/${encodeURIComponent(id)}/${action}`,
      { method: 'POST', credentials: 'include', headers },
    );
  } catch { /* network errors are non-fatal */ }
}

// ─── Walk card dismissal ──────────────────────────────────────────────────────
function WalkDismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onDismiss();
      }}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
      aria-label="Remove from Today's Steps"
      title="Remove from Today's Steps"
    >
      <X size={17} strokeWidth={1.8} />
    </button>
  );
}

// ─── Section color tokens ─────────────────────────────────────────────────────

const SECTION_COLORS = {
  amber:   { bg: 'bg-amber-50/90 border-amber-200/60',    title: 'text-amber-700',   dot: 'bg-amber-500'   },
  violet:  { bg: 'bg-violet-50/90 border-violet-200/60',  title: 'text-violet-700',  dot: 'bg-violet-500'  },
  emerald: { bg: 'bg-emerald-50/90 border-emerald-200/60',title: 'text-emerald-700', dot: 'bg-emerald-500' },
  blue:    { bg: 'bg-blue-50/90 border-blue-200/60',      title: 'text-blue-700',    dot: 'bg-blue-500'    },
  indigo:  { bg: 'bg-indigo-50/90 border-indigo-200/60',  title: 'text-indigo-700',  dot: 'bg-indigo-500'  },
} as const;
type SectionColor = keyof typeof SECTION_COLORS;

// ─── Section wrapper with soft color highlight ────────────────────────────────
function SectionWrapper({
  color,
  label,
  children,
  delay = 0,
}: {
  color: SectionColor;
  label: string;
  children: ReactNode;
  delay?: number;
}) {
  const c = SECTION_COLORS[color];
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={cn('rounded-2xl border px-4 pt-3 pb-3.5 space-y-2', c.bg)}
    >
      <div className="flex items-center gap-1.5">
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', c.dot)} />
        <h2 className={cn('text-[10px] font-bold uppercase tracking-[0.14em]', c.title)}>
          {label}
        </h2>
      </div>
      {children}
    </motion.section>
  );
}

// ─── Skeleton loader (compact) ────────────────────────────────────────────────
function SkeletonCard({ lines: _lines }: { lines?: number } = {}) {
  return (
    <div className="bg-card rounded-xl border border-border/50 px-3.5 py-3 space-y-1.5 animate-pulse">
      <div className="flex items-center justify-between gap-3">
        <div className="h-3.5 flex-1 rounded bg-muted" />
        <div className="h-3 w-10 rounded bg-muted" />
      </div>
      <div className="h-2.5 w-3/5 rounded bg-muted" />
    </div>
  );
}

// ─── Compact content card (used inside SectionWrapper) ───────────────────────
//
// A compact two-line card: title + CTA on row 1, subtitle on row 2.
// ~52 px tall — 3–4× shorter than EmmausContentCard, enabling 4–6 items
// on screen without scrolling.
function CompactCard({
  title,
  subtitle,
  ctaLabel,
  onAction,
  done = false,
  badge,
  trailing,
  imageUrl,
  showActionIcon = true,
  className,
}: {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onAction?: () => void;
  done?: boolean;
  badge?: 'UPDATED' | 'NEW' | null;
  trailing?: ReactNode;
  imageUrl?: string;
  showActionIcon?: boolean;
  className?: string;
}) {
  const clickable = !!onAction;
  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-border/50 px-3.5 py-2.5 select-none',
        clickable && 'cursor-pointer hover:border-primary/25 active:opacity-75 transition-colors',
        className,
      )}
      onClick={clickable ? onAction : undefined}
    >
      <div className="flex items-center gap-2 min-w-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="h-9 w-9 shrink-0 rounded-lg object-cover"
            loading="lazy"
          />
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[14px] font-semibold text-foreground leading-snug truncate flex-1">
              {title}
            </p>
            {badge && <ContentBadge badge={badge} />}
            {done && <CheckCircle2 size={13} className="text-primary shrink-0" />}
          </div>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug line-clamp-1">
              {subtitle}
            </p>
          )}
        </div>
        {onAction && !done && !trailing && showActionIcon && (
          <X size={15} className="shrink-0 text-muted-foreground/40" aria-hidden="true" />
        )}
        {trailing && (
          <div className="shrink-0 -mr-0.5" onClick={(e) => e.stopPropagation()}>
            {trailing}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add-more row (used at the bottom of every always-visible section) ─────────
function AddMoreRow({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed border-border/60 text-[12px] text-muted-foreground hover:text-foreground hover:border-primary/30 active:opacity-60 transition-colors"
    >
      <span className="text-[15px] font-light leading-none">+</span>
      {label}
    </button>
  );
}

// (DevotionalCard, DevotionalDiscoveryCard, FifteenMinutesCard and YourJourneysSection
//  have been replaced by CompactCard + inline logic in the SectionWrapper render below.)

// ─── Main component ───────────────────────────────────────────────────────────
export default function Walk() {
  const { user } = useAuth();
  const { journeys, progress, loading, getStepsForJourney, dailyRhythmState } = useJourney();
  const { getState } = useEnrollment();
  const { getMyRooms, loadRooms } = useRooms();
  const [, setLocation] = useLocation();
  const [discoverMoreAtBottom, setDiscoverMoreAtBottom] = useState(false);
  const [askKeyboardOpen, setAskKeyboardOpen] = useState(false);

  useEffect(() => {
    const updateBottomState = () => {
      const distanceFromBottom =
        document.documentElement.scrollHeight - (window.scrollY + window.innerHeight);
      setDiscoverMoreAtBottom(distanceFromBottom <= 8);
    };

    updateBottomState();
    window.addEventListener('scroll', updateBottomState, { passive: true });
    window.addEventListener('resize', updateBottomState);

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(updateBottomState)
      : null;
    resizeObserver?.observe(document.documentElement);

    return () => {
      window.removeEventListener('scroll', updateBottomState);
      window.removeEventListener('resize', updateBottomState);
      resizeObserver?.disconnect();
    };
  }, []);

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

  // Collections — used to look up the parent collection title for journey cards
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionsReady, setCollectionsReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    listCollections()
      .then(nextCollections => {
        if (!cancelled) setCollections(nextCollections);
      })
      .catch(() => {
        // Keep the section usable if the supplementary catalogue is unavailable.
        // Collection-backed cards remain in the Journeys section; they only use
        // the child title when there is no parent title to display.
      })
      .finally(() => {
        if (!cancelled) setCollectionsReady(true);
      });
    return () => { cancelled = true; };
  }, []);
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

  // ── Journey hide state — optimistic local removal ────────────────────────────
  // Journey progress is loaded from JourneyContext (not a local fetch like
  // devotionals), so we track hidden IDs in a local Set for instant UI updates
  // rather than mutating the shared context.
  const [hiddenJourneyIds, setHiddenJourneyIds] = useState<Set<string>>(new Set());
  // Groups do not have engagement-progress rows, so keep their Today's Steps
  // dismissal local to this Walk screen rather than treating dismissal as
  // leaving the group.
  const [hiddenRoomIds, setHiddenRoomIds] = useState<Set<string>>(new Set());

  // ── Sermon Companions — this week first, then accessed companions ───────────
  const [sermonCompanionEngagements, setSermonCompanionEngagements] =
    useState<SermonCompanionEngagement[] | null>(null);
  const [hiddenSermonCompanionIds, setHiddenSermonCompanionIds] =
    useState<Set<string>>(new Set());

  const reloadSermonCompanions = useCallback(() => {
    fetch(`${BASE_URL}/api/sermon-companions/member/engagements`, {
      credentials: 'include',
      cache: 'no-store',
    })
      .then(r => {
        if (!r.ok) throw new Error(`Could not load sermon companions (${r.status})`);
        return r.json() as Promise<SermonCompanionEngagement[]>;
      })
      .then(setSermonCompanionEngagements)
      .catch(() => setSermonCompanionEngagements([]));
  }, []);

  // Initial fetch — runs once when the user is known.
  useEffect(() => {
    if (!user?.id) return;
    reloadSermonCompanions();
    loadRooms().catch(() => {/* rooms are supplementary */});
    const refreshTimer = window.setInterval(reloadSermonCompanions, 60_000);
    return () => window.clearInterval(refreshTimer);
  }, [user?.id, reloadSermonCompanions, loadRooms]);

  // Visibility-change refresh — refreshes the Sermon Companions card whenever
  // the member returns to this tab.
  // Critical for Sunday mornings: admin marks a new companion as This Week's
  // Sermon while the member has Today's Steps open; when they switch back to the
  // app the card updates immediately without requiring a manual reload.
  //
  // Devotionals are also refreshed here so that after a member completes an entry
  // in the reader and taps Back, the Walk card immediately shows the updated
  // position (next uncompleted entry) rather than the stale completedDays snapshot
  // from the previous mount.
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        reloadSermonCompanions();
        reloadDevotionals(userId).catch(() => {/* non-fatal */});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, reloadSermonCompanions, reloadDevotionals]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-page-safe">
        <main className="px-4 pt-8 max-w-[480px] mx-auto space-y-3.5">
          <div className="px-1 space-y-1.5 animate-pulse">
            <div className="h-7 w-44 rounded-lg bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
          </div>
          <div className="h-11 rounded-full bg-muted animate-pulse" />
          <div className="rounded-2xl border bg-amber-50/60 border-amber-200/40 p-4 space-y-2 animate-pulse">
            <div className="h-2 w-16 rounded bg-amber-200/60" />
            <SkeletonCard />
          </div>
          <div className="rounded-2xl border bg-blue-50/60 border-blue-200/40 p-4 space-y-2 animate-pulse">
            <div className="h-2 w-24 rounded bg-blue-200/60" />
            <SkeletonCard />
          </div>
          <div className="rounded-2xl border bg-violet-50/60 border-violet-200/40 p-4 space-y-2 animate-pulse">
            <div className="h-2 w-20 rounded bg-violet-200/60" />
            <SkeletonCard />
          </div>
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
  const coreProg = coreJourney ? (dailyRhythmState?.progress ?? progress[coreJourney.id]) : undefined;
  const rhythmResolution = resolveDailyRhythmCalendar(undefined, dailyRhythmState);

  const visibleSermonCompanions = (() => {
    const companions = sermonCompanionEngagements ?? [];
    const current = companions.find(companion =>
      companion.isCurrentWeek &&
      !companion.progress?.hiddenFromToday &&
      !hiddenSermonCompanionIds.has(companion.id)
    );
    const accessed = companions.filter(companion =>
      companion.id !== current?.id &&
      companion.progress !== null &&
      companion.progress.status !== 'paused' &&
      !companion.progress.hiddenFromToday &&
      !hiddenSermonCompanionIds.has(companion.id)
    );
    return [...(current ? [current] : []), ...accessed].slice(0, 3);
  })();

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
  const rawCoreCurrentDay   = rhythmResolution?.currentDay ?? coreProg?.currentDay ?? 1;
  // "Caught up" = the member's progress has advanced past all published content.
  const coreCaughtUp        = coreMaxPublishedDay > 0 && rawCoreCurrentDay > coreMaxPublishedDay;
  // Calendar-day gating keeps the next day closed until tomorrow.
  // Calendar gating is server-owned. Do not derive it from a timestamp or the
  // device clock (which can be stale after a PWA resume).
  const coreCompletedToday  = !devMode && Boolean(rhythmResolution?.completedToday || rhythmResolution?.currentStepCompleted);
  // The day we actually show and route to — clamped to real published content.
  const lastCompletedCoreDay = coreProg?.completedDays?.length
    ? Math.max(...coreProg.completedDays)
    : 0;
  const effectiveCoreDay = coreCompletedToday
    ? Math.max(1, lastCompletedCoreDay || rawCoreCurrentDay - 1)
    : coreCaughtUp
      ? coreMaxPublishedDay
      : rawCoreCurrentDay;
  // The concrete published entry for effectiveCoreDay (null if no entries loaded yet).
  const coreCurrentEntry    = publishedDailyRhythmStep(coreSteps, effectiveCoreDay);

  // True when the member has nothing left to act on today — used to suppress
  // the heartbeat animation so it only pulses when there is something to open.
  const coreDone = coreCompletedToday || coreCaughtUp;

  // "View Previous Days →" appears when at least one earlier published day exists.
  const hasPreviousDays =
    !!coreJourney &&
    effectiveCoreDay > 1 &&
    coreSteps.some(s => s.day < effectiveCoreDay);

  // 3. Your Journeys — journeys the member has already started.
  //    Includes: every published journey progress record that is not owned by
  //    one of the dedicated sections below.
  //    Excludes: Daily Rhythm (shown above), Companion (shown below).
  //    Excludes: hidden journeys (optimistic local set OR server flag).
  //    Status check: prefer server-backed progress[j.id]?.status; fall back to
  //    localStorage (enrollment.ts optimistic cache) for instant UI updates.
  //    IMPORTANT: overloadExempt only controls the active-enrollment limit. It
  //    must never make started content disappear from Today's Steps.
  const activeMemberJourneys = publishedJourneys
    .filter(j => {
      if (!progress[j.id]) return false;
      // These content types have their own canonical Today's Steps sections.
      // Do not use isExemptJourney here: it also includes the independent
      // overloadExempt flag, which is not a visibility decision.
      if (j.journeyType === 'daily-rhythm' || j.journeyType === 'companion') {
        return false;
      }
      // Hide: optimistic local set (instant) OR server flag (after page reload).
      if (hiddenJourneyIds.has(j.id)) return false;
      if (progress[j.id]?.hiddenFromToday) return false;
      // Server status wins when present; optimistic localStorage cache as fallback.
      const serverStatus = progress[j.id]?.status;
      if (serverStatus) return serverStatus === 'active';
      return getState(j.id) === 'active';
    })
    .map(j => ({ journey: j, prog: progress[j.id]! }));

  // Enrich each started journey with its current step title and total published
  // step count so YourJourneysSection can render a progress-aware description.
  const startedJourneys = activeMemberJourneys.map(
    ({ journey, prog }) => {
      const steps = getStepsForJourney(journey.id).filter(
        s => s.status === 'Published' && !s.isCompletionStep,
      );
      const currentStep = steps.find(s => s.day === prog.currentDay) ?? null;
      return { journey, prog, currentStep, totalPublishedSteps: steps.length };
    },
  );

  const visibleStartedJourneys = startedJourneys.filter(({ journey }) => {
    const category = journey.category?.trim().toLowerCase();
    const tags = (journey.tags ?? []).map(tag => tag.trim().toLowerCase());
    return category !== 'companion' && !tags.includes('companion');
  });
  const {
    standaloneWalks: startedWalks,
    standaloneJourneys: startedLongerJourneys,
    collectionCards,
  } = projectTodaysJourneys(visibleStartedJourneys, collections);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Navigate to the Discover (Journeys) page with a pre-selected tab. */
  function navigateToDiscover(tab: 'walks' | 'journeys' | 'devotionals' | 'sermons') {
    try { sessionStorage.setItem('emmaus_discover_tab', tab); } catch { /* ignore */ }
    setLocation('/journeys');
  }

  function goToDailyRhythmDay(_day: number) {
    // Navigate to the step navigator so the member can choose Previous / Current / Next
    // rather than being dropped straight into the reading.
    setLocation('/daily-rhythm/navigate');
  }

  function goToJourney(journeyId: string, _prog: { currentDay: number }) {
    // progress[journeyId] is always present here — goToJourney is only called from
    // "Your Journeys" cards which filter on progress[j.id] existence.
    // All Walk entry points must use the same overview/list experience.
    setLocation(`/journeys/${journeyId}?source=today`);
  }

  // ── Greeting ─────────────────────────────────────────────────────────────────

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const rawPreferredName = user.preferredName?.trim();
  const greetingFirstName =
    rawPreferredName && !rawPreferredName.includes('@')
      ? rawPreferredName.split(' ')[0]
      : null;

  // ── Daily Rhythm compact card — state machine ──
  // One-step-per-day gate removed: members can continue to the next day immediately.
  type DrState = 'start' | 'ready' | 'uptodate';
  const drStarted = !!coreProg;
  let drState: DrState;
  if (!drStarted)    drState = 'start';
  else if (coreCompletedToday || coreCaughtUp) drState = 'uptodate';
  else               drState = 'ready';

  const drSubtitle = (() => {
    if (drState === 'start') return 'Your daily time with Jesus is ready';
    if (drState === 'uptodate') {
      return coreCurrentEntry
        ? `${getStepLabel(coreCurrentEntry, coreJourney!)} — you're up to date`
        : "You're up to date";
    }
    return coreCurrentEntry?.title || 'Ready to continue';
  })();

  const drCtaLabel = drState === 'start'
    ? "Open today's reading"
    : drState === 'ready'
      ? ((coreProg?.completedDays.length ?? 0) > 0 ? "Continue" : "Open today's reading")
      : 'Review';

  function handleDrAction() {
    if (coreCaughtUp) {
      const reviewDay = coreMaxPublishedDay > 0 ? coreMaxPublishedDay : effectiveCoreDay;
      setLocation(`/daily-rhythm/day/${reviewDay}?from=walk`);
    } else {
      goToDailyRhythmDay(effectiveCoreDay);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      {devMode && <DevModeBanner />}
      {(user.role === 'admin' || user.role === 'superAdmin') && !devMode && (
        <div className="bg-primary text-primary-foreground text-xs py-1.5 text-center font-medium">
          Admin mode —{' '}
          <Link href="/admin" className="underline">Go to Admin</Link>
        </div>
      )}

      <main className="relative px-4 pt-10 pb-4 max-w-[480px] mx-auto space-y-3.5">

        {/* ── Today's Steps header ──────────────────────────────────────────── */}
        <header className="px-1 pb-1">
          <div className="mb-3 flex justify-end">
            <MemberHeaderActions compact />
          </div>
          <h1 className="text-[28px] font-semibold tracking-tight text-foreground">
            Today's Steps
          </h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            Continue what you've started or discover something new.
          </p>
        </header>

        {/* ── Ask Emmaus / Search ───────────────────────────────────────────── */}
        <UnifiedEmmausInput
          conversationOnly
          onKeyboardStateChange={setAskKeyboardOpen}
        />

        {/* ── 1. Start Here — Daily Rhythm only ─────────────────────────────── */}
        {coreJourney ? (
          <SectionWrapper color="amber" label="Start Here" delay={0.05}>
            <CompactCard
              title={coreJourney.title}
              subtitle={drSubtitle}
              ctaLabel={drCtaLabel}
              onAction={handleDrAction}
              done={drState === 'uptodate'}
              showActionIcon={false}
              className={drState !== 'uptodate' ? 'daily-rhythm-actionable-card' : undefined}
            />
          </SectionWrapper>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-5 text-center">
            <p className="text-[14px] text-muted-foreground">
              We couldn't load your daily reading. Please try again.
            </p>
          </div>
        )}

        {/* ── 2. Sermon Companions — current week + accessed, maximum three ──── */}
        <SectionWrapper color="blue" label="Sermon Companions" delay={0.06}>
          {sermonCompanionEngagements === null ? (
            <SkeletonCard />
          ) : visibleSermonCompanions.length === 0 ? (
            <div className="bg-card/70 rounded-xl border border-border/40 px-3.5 py-2.5">
              <p className="text-[12px] text-muted-foreground leading-snug">
                Sermon Companions you start from Discover will appear here.
              </p>
            </div>
          ) : (
            visibleSermonCompanions.map(companion => {
              const entryCount = companion.entries.length || companion.numberOfDays;
              const completedCount = companion.progress?.completedDays.length ?? 0;
              const allComplete = entryCount > 0 && completedCount >= entryCount;
              const currentDay = companion.progress?.currentDay ?? 1;
              const nextEntry = companion.entries.find(entry => entry.dayNumber === currentDay);
              const displayTitle = companion.title.includes(': ')
                ? companion.title.split(': ')[0].trim()
                : companion.title;
              const subtitle = companion.isCurrentWeek
                ? "This week's sermon"
                : allComplete
                  ? 'Companion complete'
                  : nextEntry?.title ?? `Step ${currentDay} of ${entryCount}`;
              return (
                <CompactCard
                  key={companion.id}
                  title={displayTitle}
                  subtitle={subtitle}
                  ctaLabel={!companion.progress ? 'Start' : allComplete ? 'Review' : 'Continue'}
                  onAction={() => {
                    void dismissBadge('companion', companion.id);
                    setLocation(`/sermon-companion/${companion.id}/overview?source=today`);
                  }}
                  done={allComplete}
                  badge={companion.badge}
                  trailing={
                    <WalkDismissButton
                      onDismiss={() => {
                        setHiddenSermonCompanionIds(prev => new Set([...prev, companion.id]));
                        void callEngagementAction('sermon-companion', companion.id, 'hide', user?.id);
                      }}
                    />
                  }
                />
              );
            })
          )}
          <AddMoreRow
            label="Add a Sermon Companion"
            onClick={() => navigateToDiscover('sermons')}
          />
        </SectionWrapper>

        {/* ── 3. Daily Devotionals — always visible ────────────────────────── */}
        <SectionWrapper color="violet" label="Daily Devotionals" delay={0.07}>
          {activeDevotionals.map(ad => {
            const published      = ad.entries.filter(e => e.status === 'Published');
            const sortedPub      = [...published].sort((a, b) => a.dayNumber - b.dayNumber);
            const maxDay         = sortedPub.length > 0 ? Math.max(...sortedPub.map(e => e.dayNumber)) : 1;
            const completedDays  = ad.progress.completedDays ?? [];
            const nextDay        = calcAvailableDaySelfPaced(completedDays, maxDay, devMode, sortedPub.map(e => e.dayNumber));
            const nextEntry      = sortedPub.find(e => e.dayNumber === nextDay);
            const completedCount = completedDays.length;
            const allComplete    = completedCount >= published.length && published.length > 0;
            const openDay        = allComplete ? Math.max(...completedDays) : nextDay;
            // Use position within sorted published entries (not raw dayNumber) so that
            // non-sequential dayNumbers (e.g. day 16 in a 14-entry series) never produce
            // a confusing "16 of 14" counter.
            const nextEntryPos   = nextEntry ? (sortedPub.findIndex(e => e.dayNumber === nextEntry.dayNumber) + 1) : null;
            const nextLabel      = getDevotionalLabel({ dayNumber: nextDay, displayLabel: nextEntry?.displayLabel });
            const devSubtitle    = allComplete
              ? 'Complete'
              : nextEntry?.title || undefined;
            const badge = computeUpdatedBadge(
              ad.series.notifyPublishedAt ?? null,
              ad.progress.lastOpenedAt ?? null,
              true,
            );
            return (
              <CompactCard
                key={ad.series.id}
                title={ad.series.title}
                subtitle={devSubtitle}
                ctaLabel={allComplete ? undefined : 'Continue'}
                onAction={() => {
                  void dismissBadge('devotional', ad.series.id);
                  setLocation(`/devotional/${ad.series.id}/navigate`);
                }}
                done={allComplete}
                badge={badge}
                trailing={
                  !allComplete ? (
                    <WalkDismissButton
                      onDismiss={() => {
                        setActiveDevotionals(prev => prev.filter(d => d.series.id !== ad.series.id));
                        void callEngagementAction('devotional', ad.series.id, 'hide', user?.id);
                      }}
                    />
                  ) : undefined
                }
              />
            );
          })}
          <AddMoreRow label="Add a devotional" onClick={() => navigateToDiscover('devotionals')} />
        </SectionWrapper>

        {/* ── 3. Walks (Quick Studies) — always visible ─────────────────────── */}
        <SectionWrapper color="emerald" label="Walks (Quick Studies)" delay={0.09}>
          {startedWalks.map(({ journey, prog, currentStep, totalPublishedSteps }) => {
            const completedCount = prog.completedDays.length;
            const isCompleted    = totalPublishedSteps > 0 && completedCount >= totalPublishedSteps;
            const walkSubtitle   = isCompleted ? 'Walk Complete' : (currentStep?.title || undefined);
            const badge = computeUpdatedBadge(
              journey.notifyPublishedAt ?? null,
              prog.lastOpenedAt ?? null,
              true,
            );
            return (
              <CompactCard
                key={journey.id}
                title={journey.title}
                subtitle={walkSubtitle}
                ctaLabel={isCompleted ? undefined : 'Continue'}
                onAction={() => {
                  void dismissBadge('journey', journey.id);
                  goToJourney(journey.id, prog);
                }}
                done={isCompleted}
                badge={badge}
                trailing={
                  !isCompleted ? (
                    <WalkDismissButton
                      onDismiss={() => {
                        setHiddenJourneyIds(prev => new Set([...prev, journey.id]));
                        void callEngagementAction('journey', journey.id, 'hide', user?.id);
                      }}
                    />
                  ) : undefined
                }
              />
            );
          })}
          <AddMoreRow label="Add a Walk" onClick={() => navigateToDiscover('walks')} />
        </SectionWrapper>

        {/* ── 4. Journeys (Longer Studies) — always visible ─────────────────── */}
        <SectionWrapper color="indigo" label="Journeys (Longer Studies)" delay={0.11}>
          {!collectionsReady && visibleStartedJourneys.some(({ journey }) => journey.collectionId) ? (
            <SkeletonCard />
          ) : <>
          {collectionCards.map(({ collection, active, children }) => {
            const { journey, prog, currentStep } = active;
            const allComplete = children.every(child =>
              child.totalPublishedSteps > 0 &&
              child.prog.completedDays.length >= child.totalPublishedSteps
            );
            const journeySubtitle = allComplete
              ? 'Journey Complete'
              : `${journey.title}${currentStep?.title ? ` · ${currentStep.title}` : ''}`;
            return (
              <CompactCard
                key={collection.id}
                title={collection.title}
                subtitle={journeySubtitle}
                ctaLabel={allComplete ? undefined : 'View & Continue'}
                imageUrl={collection.coverImageUrl}
                onAction={() => {
                  void dismissBadge('journey', journey.id);
                  setLocation(`/journeys/collections/${collection.id}?source=today&resume=${encodeURIComponent(journey.id)}`);
                }}
                done={allComplete}
                trailing={
                  !allComplete ? (
                    <WalkDismissButton
                      onDismiss={() => {
                        const ids = children.map(child => child.journey.id);
                        setHiddenJourneyIds(prev => new Set([...prev, ...ids]));
                        ids.forEach(id => {
                          void callEngagementAction('journey', id, 'hide', user?.id);
                        });
                      }}
                    />
                  ) : undefined
                }
              />
            );
          })}
          {startedLongerJourneys.map(({ journey, prog, currentStep, totalPublishedSteps }) => {
            const completedCount  = prog.completedDays.length;
            const isCompleted     = totalPublishedSteps > 0 && completedCount >= totalPublishedSteps;
            const journeySubtitle = isCompleted ? 'Walk Complete' : (currentStep?.title || undefined);
            const badge = computeUpdatedBadge(
              journey.notifyPublishedAt ?? null,
              prog.lastOpenedAt ?? null,
              true,
            );
            return (
              <CompactCard
                key={journey.id}
                title={journey.title}
                subtitle={journeySubtitle}
                ctaLabel={isCompleted ? undefined : 'Continue'}
                onAction={() => {
                  void dismissBadge('journey', journey.id);
                  goToJourney(journey.id, prog);
                }}
                done={isCompleted}
                badge={badge}
                trailing={
                  !isCompleted ? (
                    <WalkDismissButton
                      onDismiss={() => {
                        setHiddenJourneyIds(prev => new Set([...prev, journey.id]));
                        void callEngagementAction('journey', journey.id, 'hide', user?.id);
                      }}
                    />
                  ) : undefined
                }
              />
            );
          })}</>}
          <AddMoreRow label="Add a Journey" onClick={() => navigateToDiscover('journeys')} />
        </SectionWrapper>

        {/* ── 5. My Groups — always visible ─────────────────────────────────── */}
        {(() => {
          const myRooms = getMyRooms(user.id).filter(room => !hiddenRoomIds.has(room.id));
          return (
            <SectionWrapper color="blue" label="My Groups" delay={0.13}>
              {myRooms.map(room => (
                <CompactCard
                  key={room.id}
                  title={room.name}
                  subtitle={
                    room.leaderNote
                      ? room.leaderNote
                      : `${room.memberCount} ${room.memberCount === 1 ? 'member' : 'members'}${room.adminName ? ` · Led by ${room.adminName}` : ''}`
                  }
                  ctaLabel="Open"
                  onAction={() => setLocation(`/rooms/${room.id}`)}
                  trailing={
                    <WalkDismissButton
                      onDismiss={() => {
                        setHiddenRoomIds(prev => new Set([...prev, room.id]));
                      }}
                    />
                  }
                />
              ))}
              <AddMoreRow label="Add a Group" onClick={() => setLocation('/rooms?chooser=1')} />
            </SectionWrapper>
          );
        })()}

        {/* ── Discover More ─────────────────────────────────────────────────── */}
        {!askKeyboardOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.13 }}
            className="relative h-16"
          >
            <button
              type="button"
              onClick={() => setLocation('/journeys')}
              className={cn(
                'flex items-center justify-center gap-2.5 rounded-full border border-border bg-card px-4 py-3 text-[14px] text-muted-foreground/50 shadow-sm transition-all hover:border-primary/25 hover:shadow-md',
                discoverMoreAtBottom
                  ? 'absolute inset-x-0 top-0 w-full'
                  : 'fixed bottom-[calc(4rem+env(safe-area-inset-bottom)+0.75rem)] left-1/2 z-40 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2',
              )}
              aria-label="Discover More"
            >
              <Compass size={15} className="shrink-0 text-muted-foreground/50" strokeWidth={1.8} />
              Discover More
            </button>
          </motion.div>
        )}

      </main>

      {!askKeyboardOpen && <BottomNav />}

    </div>
  );
}
