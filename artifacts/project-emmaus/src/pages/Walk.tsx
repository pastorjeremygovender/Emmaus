/**
 * Walk — "What is Jesus inviting me to continue today?"
 *
 * Visual hierarchy (top → bottom):
 *   1. Today's 10 Minutes with Jesus   (highest priority — always first)
 *   2. This Week's Sermon              (permanent card — always visible; empty state when no companion)
 *   3. Daily Devotionals               (self-paced series the member has started)
 *   4. Your Journeys                   (started growth journeys)
 *   5. Sermon Companions               (other in-progress companions beyond the current week)
 *
 * Ask Emmaus floats above the nav — not part of this hierarchy.
 */

import { useLocation, Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { UnifiedEmmausInput } from '@/components/UnifiedEmmausInput';
import { Button } from '@/components/ui/button';
import { EmmausContentCard } from '@/components/EmmausContentCard';
import { dismissBadge, computeUpdatedBadge } from '@/lib/badge-api';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, ChevronRight, Compass, EyeOff, MoreHorizontal, Pause, X } from 'lucide-react';
import { useEnrollment } from '@/lib/enrollment';
import { isCompletedToday } from '@/lib/daily-lock';
import { getStepLabel, resolveStepPrefix, getDevotionalLabel } from '@/lib/step-label';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { DevModeBanner } from '@/components/DevModeBanner';
import { ShareEmmausButton } from '@/components/ShareEmmausButton';
import { getDailyRhythmStartup } from '@/lib/journeys-api';
import { isStartupRoutingComplete, markStartupRoutingComplete } from '@/lib/startup-routing';
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
import { cn } from '@/lib/utils';
import { ContentBadge } from '@/components/ContentBadge';
import type { ReactNode } from 'react';
import { listCollections, type Collection } from '@/lib/collections-api';

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Fire-and-forget engagement action (pause / hide / unhide / remove).
 *  Identity is derived server-side from the secure session cookie. */
async function callEngagementAction(
  type: 'journey' | 'devotional' | 'sermon-companion',
  id: string,
  action: 'pause' | 'remove' | 'hide' | 'unhide',
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
    // Stop ALL clicks inside this component from reaching the card's onClick.
    // Every interactive element below also calls stopPropagation for defence-in-depth.
    <div
      ref={ref}
      className="relative"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Three-dot trigger ──────────────────────────────────────────────── */}
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(p => !p); }}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="More actions"
      >
        <MoreHorizontal size={17} />
      </button>

      {/* ── Dropdown panel ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-9 z-30 bg-background border border-border rounded-xl shadow-lg py-1 w-44"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Pause — remove from Today's Steps, preserve progress, stay on page */}
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(false); onPause(); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2"
            >
              <Pause size={13} className="text-muted-foreground" /> Pause
            </button>

            {/* Hide — remove card from Today's Steps, preserve progress, stay on page */}
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(false); onHide(); }}
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
          Your progress will be kept exactly as it is. Pausing stops your daily rhythm until you choose to resume from the Discover tab.
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
}: {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onAction?: () => void;
  done?: boolean;
  badge?: 'UPDATED' | 'NEW' | null;
  trailing?: ReactNode;
}) {
  const clickable = !!onAction;
  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-border/50 px-3.5 py-2.5 select-none',
        clickable && 'cursor-pointer hover:border-primary/25 active:opacity-75 transition-colors',
      )}
      onClick={clickable ? onAction : undefined}
    >
      <div className="flex items-center gap-2 min-w-0">
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
        {onAction && !done && !trailing && (
          <ChevronRight size={15} className="shrink-0 text-muted-foreground/40" aria-hidden="true" />
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
  const { journeys, progress, loading, getStepsForJourney } = useJourney();
  const { getState } = useEnrollment();
  const { getMyRooms, loadRooms } = useRooms();
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

  // Collections — used to look up the parent collection title for journey cards
  const [collections, setCollections] = useState<Collection[]>([]);
  useEffect(() => { listCollections().then(setCollections).catch(() => {}); }, []);
  const collectionMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of collections) m.set(c.id, c.title);
    return m;
  }, [collections]);

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

  // handleBeginCompanion removed — the permanent This Week's Sermon card routes
  // directly to /sermon-companion/:id/overview which handles starting the companion.

  // ── Pause / Remove dialog state ──────────────────────────────────────────────
  // Tracks which card is showing the confirm-pause dialog.
  const [pauseTarget, setPauseTarget] = useState<
    { type: 'journey'; id: string; title: string }
    | { type: 'devotional'; id: string; title: string }
    | null
  >(null);

  // ── Journey hide state — optimistic local removal ────────────────────────────
  // Journey progress is loaded from JourneyContext (not a local fetch like
  // devotionals), so we track hidden IDs in a local Set for instant UI updates
  // rather than mutating the shared context.
  const [hiddenJourneyIds, setHiddenJourneyIds] = useState<Set<string>>(new Set());

  // ── This Week's Sermon — permanent card (section 2) ─────────────────────────
  // Always rendered. null = loading, 'none' = no current companion published.
  // Fetched from the dedicated current-week endpoint (is_current_week flag in DB).
  const [thisWeekCompanion, setThisWeekCompanion] = useState<
    | null
    | 'none'
    | {
        id: string;
        title: string;
        /** Number of published entries — the definitive day count. */
        publishedDayCount: number;
        progress: {
          currentDay: number;
          completedDays: number[];
          status: string;
        } | null;
      }
  >(null);

  const reloadThisWeekCompanion = useCallback((userId: string) => {
    fetch(`${BASE_URL}/api/sermon-companions/current-week/member`, { credentials: 'include' })
      .then(r => {
        if (r.status === 404) return null;
        if (!r.ok) return null;
        return r.json();
      })
      .then((data: {
        id: string;
        title: string;
        entries: { id: string; dayNumber: number }[];
        progress: { currentDay: number; completedDays: number[]; status: string } | null;
      } | null) => {
        if (!data) { setThisWeekCompanion('none'); return; }
        setThisWeekCompanion({
          id: data.id,
          title: data.title,
          publishedDayCount: data.entries.length,
          progress: data.progress ?? null,
        });
      })
      .catch(() => setThisWeekCompanion('none'));
    // userId is referenced via closure so the server always receives the correct
    // session identity; the param is accepted so callers can pass it explicitly.
    void userId;
  }, []);

  // Initial fetch — runs once when the user is known.
  useEffect(() => {
    if (!user?.id) return;
    reloadThisWeekCompanion(user.id);
    loadRooms().catch(() => {/* rooms are supplementary */});
  }, [user?.id, reloadThisWeekCompanion, loadRooms]);

  // Visibility-change refresh — refreshes the This Week's Sermon card whenever
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
        reloadThisWeekCompanion(userId);
        reloadDevotionals(userId).catch(() => {/* non-fatal */});
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [user?.id, reloadThisWeekCompanion, reloadDevotionals]);

  // ── First-daily-open redirect ─────────────────────────────────────────────
  // This is a server decision, not a browser-date/localStorage decision.
  const dailyOpenCheckedRef = useRef(false);
  const [dailyOpenRetry, setDailyOpenRetry] = useState(0);
  useEffect(() => {
    // Walk can remount during ordinary SPA navigation. Once bootstrap has
    // resolved, it must never re-run the automatic Daily Rhythm redirect.
    if (isStartupRoutingComplete()) return;
    if (loading) return;                          // wait for real data
    if (!user || user.role === 'admin' || user.role === 'superAdmin') return;
    // On a cold /walk load, auth can resolve before JourneyContext has begun
    // its authenticated fetch. Do not consume the one-shot guard against the
    // initial empty context; retry when the published journey list arrives.
    if (journeys.length === 0) return;
    if (dailyOpenCheckedRef.current) return;      // only run once per mount
    dailyOpenCheckedRef.current = true;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    void getDailyRhythmStartup()
      .then(startup => {
        if (cancelled) return;
        markStartupRoutingComplete();
        if (startup.firstOpen) {
          setLocation(startup.destination);
        }
      })
      .catch(err => {
        // A failed request must not consume this mount's one chance to retry.
        // Welcome normally owns cold-start routing, but this fallback covers
        // retained /walk launches and transient auth/network failures.
        dailyOpenCheckedRef.current = false;
        console.error('[DailyOpen] startup decision failed; will retry:', err);
        retryTimer = setTimeout(() => {
          if (!cancelled) setDailyOpenRetry(attempt => attempt + 1);
        }, 1000);
      });
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [loading, user, journeys, setLocation, dailyOpenRetry]);

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
  // Calendar-day gating keeps the next day closed until tomorrow.
  const coreCompletedToday  = !devMode && isCompletedToday(coreProg?.lastCompletedAt);
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
  const coreCurrentEntry    = coreSteps.find(s => s.day === effectiveCoreDay) ?? null;

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

  // Split started journeys into walks (quick) vs longer studies.
  // A walk remains visible in Today's Steps after it is started, regardless of
  // whether it was discovered standalone or through a collection. Collection
  // membership controls discovery/browsing, not whether the member's active
  // progress is surfaced here.
  const startedWalks          = startedJourneys.filter(({ journey }) => {
    if (journey.journeyType !== 'walk') return false;
    // Older Sermon Companion journeys were incorrectly migrated to "walk".
    // Keep them out of Walks even if the stored journey type is still wrong.
    const category = journey.category?.trim().toLowerCase();
    const tags = (journey.tags ?? []).map(tag => tag.trim().toLowerCase());
    return category !== 'companion' && !tags.includes('companion');
  });
  const startedLongerJourneys = startedJourneys.filter(({ journey }) => journey.journeyType !== 'walk');

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
      {user.role === 'admin' && !devMode && (
        <div className="bg-primary text-primary-foreground text-xs py-1.5 text-center font-medium">
          Admin mode —{' '}
          <Link href="/admin" className="underline">Go to Admin</Link>
        </div>
      )}

      <main className="px-4 pt-8 pb-4 max-w-[480px] mx-auto space-y-3.5">

        <div className="-mt-3 flex justify-end">
          <ShareEmmausButton />
        </div>

        {/* ── Greeting ─────────────────────────────────────────────────────── */}
        <header className="px-1 pb-0.5">
          <motion.h1
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="text-[26px] font-sans font-medium tracking-tight leading-tight text-foreground"
            data-testid="text-greeting"
          >
            {greetingFirstName ? `${greeting}, ${greetingFirstName}.` : `${greeting}.`}
          </motion.h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">Here's your day.</p>
        </header>

        {/* ── Ask Emmaus / Search ───────────────────────────────────────────── */}
        <UnifiedEmmausInput launchOnly />

        {/* ── 1. Start Here — Daily Rhythm + This Week's Sermon ─────────────── */}
        {coreJourney ? (
          <SectionWrapper color="amber" label="Start Here" delay={0.05}>

            {/* Daily Rhythm */}
            <CompactCard
              title={coreJourney.title}
              subtitle={drSubtitle}
              ctaLabel={drCtaLabel}
              onAction={handleDrAction}
              done={drState === 'uptodate'}
            />

            {/* This Week's Sermon */}
            {thisWeekCompanion === null ? (
              <SkeletonCard />
            ) : thisWeekCompanion === 'none' ? (
              <div className="bg-card/70 rounded-xl border border-border/40 px-3.5 py-2.5">
                <p className="text-[12px] text-muted-foreground leading-snug">
                  This week's sermon companion will appear here when published.
                </p>
              </div>
            ) : (() => {
              const { id, title, publishedDayCount, progress: scProg } = thisWeekCompanion;
              const completedCount = scProg?.completedDays.length ?? 0;
              const currentDay     = scProg?.currentDay ?? 1;
              const allComplete    = publishedDayCount > 0 && currentDay > publishedDayCount;
              const hasStarted     = scProg !== null;
              const displayTitle   = title.includes(': ') ? title.split(': ')[0].trim() : title;
              return (
                <CompactCard
                  title={displayTitle}
                  subtitle="This week's sermon"
                  ctaLabel={!hasStarted ? 'Start' : allComplete ? 'Review' : 'Continue'}
                  onAction={() => setLocation(`/sermon-companion/${id}/overview?source=today`)}
                  done={allComplete}
                />
              );
            })()}

          </SectionWrapper>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-5 text-center">
            <p className="text-[14px] text-muted-foreground">
              We couldn't load your daily reading. Please try again.
            </p>
          </div>
        )}

        {/* ── 2. Daily Devotionals — always visible ────────────────────────── */}
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
                    <WalkMoreMenu
                      onPause={() => setPauseTarget({ type: 'devotional', id: ad.series.id, title: ad.series.title })}
                      onHide={() => {
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
                    <WalkMoreMenu
                      onPause={() => setPauseTarget({ type: 'journey', id: journey.id, title: journey.title })}
                      onHide={() => {
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
          {startedLongerJourneys.map(({ journey, prog, currentStep, totalPublishedSteps }) => {
            const completedCount  = prog.completedDays.length;
            const isCompleted     = totalPublishedSteps > 0 && completedCount >= totalPublishedSteps;
            const journeySubtitle = isCompleted ? 'Walk Complete' : (currentStep?.title || undefined);
            const badge = computeUpdatedBadge(
              journey.notifyPublishedAt ?? null,
              prog.lastOpenedAt ?? null,
              true,
            );
            // If this journey belongs to a collection, show the collection name as the
            // card title and prefix the subtitle with the journey name.
            const collectionTitle = journey.collectionId ? collectionMap.get(journey.collectionId) : undefined;
            const cardTitle    = collectionTitle ?? journey.title;
            const cardSubtitle = collectionTitle && journeySubtitle
              ? `${journey.title} · ${journeySubtitle}`
              : collectionTitle
                ? journey.title
                : journeySubtitle;
            return (
              <CompactCard
                key={journey.id}
                title={cardTitle}
                subtitle={cardSubtitle}
                ctaLabel={isCompleted ? undefined : 'Continue'}
                onAction={() => {
                  void dismissBadge('journey', journey.id);
                  goToJourney(journey.id, prog);
                }}
                done={isCompleted}
                badge={badge}
                trailing={
                  !isCompleted ? (
                    <WalkMoreMenu
                      onPause={() => setPauseTarget({ type: 'journey', id: journey.id, title: journey.title })}
                      onHide={() => {
                        setHiddenJourneyIds(prev => new Set([...prev, journey.id]));
                        void callEngagementAction('journey', journey.id, 'hide', user?.id);
                      }}
                    />
                  ) : undefined
                }
              />
            );
          })}
          <AddMoreRow label="Add a Journey" onClick={() => navigateToDiscover('journeys')} />
        </SectionWrapper>

        {/* ── 5. My Groups — always visible ─────────────────────────────────── */}
        {(() => {
          const myRooms = getMyRooms(user.id);
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
                />
              ))}
              <AddMoreRow label="Add a Group" onClick={() => setLocation('/rooms/create')} />
            </SectionWrapper>
          );
        })()}

        {/* ── Discover More ─────────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.13 }}
          className="pb-1"
        >
          <button
            onClick={() => setLocation('/journeys')}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all text-[14px] font-medium text-muted-foreground hover:text-foreground"
          >
            <Compass size={15} className="text-primary" strokeWidth={1.8} />
            Discover More Content
          </button>
        </motion.div>

      </main>

      <BottomNav />

      {/* ── Pause confirmation dialog ───────────────────────────────────────── */}
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
            }
          }}
        />
      )}
    </div>
  );
}
