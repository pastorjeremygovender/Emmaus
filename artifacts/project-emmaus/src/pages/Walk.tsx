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
import { motion } from 'framer-motion';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { isCompletedToday, isNextDayAvailable } from '@/lib/daily-lock';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { DevModeBanner } from '@/components/DevModeBanner';
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
import { calcAvailableDay } from '@/lib/devotional-calendar';

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
// States:
//   complete  — today's available day has already been marked done
//   ready     — today's day is unlocked and unread
//
// Day availability is calendar-derived (see devotional-calendar.ts).
// currentDay stored in the progress record is intentionally ignored here.
function DevotionalCard({
  series,
  availableDay,
  entryTitle,
  completedToday,
  onBeginToday,
  onReviewToday,
  onViewPreviousDays,
}: {
  series: DevotionalSeries;
  /** Calendar-derived day the member has access to today. */
  availableDay: number;
  entryTitle?: string;
  /** True when the member has already completed today's available day. */
  completedToday: boolean;
  onBeginToday: () => void;
  onReviewToday: () => void;
  onViewPreviousDays?: () => void;
}) {
  const description = completedToday
    ? 'Completed for today.'
    : entryTitle
      ? `Day ${availableDay} · ${entryTitle}`
      : `Day ${availableDay}`;

  return (
    <EmmausContentCard
      label="DAILY DEVOTIONAL"
      title={series.title}
      description={description}
      primaryActionLabel={completedToday ? 'Review' : "Open Today's Time"}
      onAction={completedToday ? onReviewToday : onBeginToday}
      headerTrailing={
        completedToday
          ? <CheckCircle2 size={18} className="text-primary shrink-0 mt-0.5" />
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
      primaryActionLabel="Open Devotional"
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
      primaryActionLabel={cfg[state].label}
      onAction={onContinue}
      disabled={cfg[state].disabled}
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
// Lists journeys the member has already started.
// Returns null when there are no started journeys — no heading, no empty state.
function YourJourneysSection({
  startedJourneys,
  onSelect,
}: {
  startedJourneys: Array<{
    journey: import('@/contexts/JourneyContext').Journey;
    prog: import('@/contexts/JourneyContext').Progress;
  }>;
  onSelect: (journeyId: string, prog: import('@/contexts/JourneyContext').Progress) => void;
}) {
  if (startedJourneys.length === 0) return null;

  return (
    <section>
      <div className="space-y-1">
        {startedJourneys.map(({ journey, prog }) => (
          <button
            key={journey.id}
            onClick={() => onSelect(journey.id, prog)}
            className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl hover:bg-muted/50 active:bg-muted transition-colors text-left"
          >
            <span className="text-[15px] font-medium text-foreground truncate">
              {journey.title}
            </span>
            <span className="text-[13px] text-primary shrink-0 ml-3">
              Continue →
            </span>
          </button>
        ))}
      </div>
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
      setLocation(`/devotional/${seriesId}/day/1`);
    } catch {
      // ignore — user can retry
    } finally {
      setStartingId(null);
    }
  }, [user, reloadDevotionals, setLocation]);

  // ── Sermon Companion (from sermon_companion table via API) ───────────────────
  // currentWeeklySermonCompanionId is set by the admin in Media Studio and stored
  // in localStorage. Loading it here (before early returns) satisfies Rules of Hooks.
  const [scCompanion, setScCompanion] = useState<{
    id: string;
    title: string;
    numberOfDays: number;
    currentDay: number;
    isStarted: boolean;
  } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let companionId: string | null = null;
    try {
      const raw = localStorage.getItem('emmaus_admin_settings');
      companionId = raw ? (JSON.parse(raw)?.currentWeeklySermonCompanionId ?? null) : null;
    } catch { /* ignore */ }
    if (!companionId) { setScCompanion(null); return; }

    const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(`${BASE_URL}/api/sermon-companions/${companionId}/member`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: { id: string; title: string; numberOfDays: number; progress: { currentDay: number } | null } | null) => {
        if (!data) { setScCompanion(null); return; }
        setScCompanion({
          id: data.id,
          title: data.title,
          numberOfDays: data.numberOfDays,
          currentDay: data.progress?.currentDay ?? 1,
          isStarted: !!data.progress,
        });
      })
      .catch(() => setScCompanion(null));
  }, [user?.id]);

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-24">
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

  // "View Previous Days →" appears when at least one earlier published day exists.
  const hasPreviousDays =
    !!coreJourney &&
    effectiveCoreDay > 1 &&
    coreSteps.some(s => s.day < effectiveCoreDay);

  // 3. Your Journeys — journeys the member has already started.
  //    Includes: active growth journeys + started daily devotional.
  //    Excludes: Daily Rhythm (shown above), Companion (shown below).
  const activeGrowthJourneys = publishedJourneys
    .filter(j => !isExemptJourney(j) && progress[j.id] && getState(j.id) === 'active')
    .map(j => ({ journey: j, prog: progress[j.id]! }));

  const devotionalJourney = publishedJourneys.find(j => j.journeyType === 'devotional');
  const devotionalProg    = devotionalJourney ? progress[devotionalJourney.id] : undefined;
  const devotionalEntry   =
    devotionalJourney && devotionalProg
      ? [{ journey: devotionalJourney, prog: devotionalProg }]
      : [];

  const startedJourneys = [...activeGrowthJourneys, ...devotionalEntry];

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function goToDailyRhythmDay(day: number) {
    setLocation(`/daily-rhythm/day/${day}`);
  }

  function goToJourney(journeyId: string, prog: { currentDay: number }) {
    const day = prog.currentDay ?? 1;
    if (!progress[journeyId]) startJourney(journeyId);
    setLocation(`/journey/${journeyId}/day/${day}`);
  }

  // ── Greeting ─────────────────────────────────────────────────────────────────

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
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
            {greeting}, {user.preferredName}.
          </motion.h1>
        </header>

        {/* ── 1. 10 Minutes with Jesus ───────────────────────────────────────── */}
        {coreJourney ? (
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <FifteenMinutesCard
              journey={coreJourney}
              prog={coreProg}
              currentEntry={coreCurrentEntry}
              caughtUp={coreCaughtUp}
              devMode={devMode}
              onContinue={() => {
                // Route to the validated effective day — never a phantom arithmetic day.
                // Caught up or completed today → review the real last published entry.
                // Otherwise → open today's available entry directly.
                if (coreCaughtUp || coreCompletedToday) {
                  goToDailyRhythmDay(coreMaxPublishedDay > 0 ? coreMaxPublishedDay : effectiveCoreDay);
                } else {
                  goToDailyRhythmDay(effectiveCoreDay);
                }
              }}
              onViewPreviousDays={
                hasPreviousDays ? () => setLocation('/daily-rhythm/previous') : undefined
              }
            />
          </motion.section>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-[15px] text-muted-foreground">
              We couldn't load this step. Please try again.
            </p>
          </div>
        )}

        {/* ── 2. Daily Devotional ────────────────────────────────────────────── */}
        {activeDevotional ? (() => {
          const publishedEntries = activeDevotional.entries.filter(e => e.status === 'Published');
          const maxPublishedDay  = publishedEntries.length > 0
            ? Math.max(...publishedEntries.map(e => e.dayNumber))
            : 1;
          const availableDay    = calcAvailableDay(
            activeDevotional.progress.startedAt,
            maxPublishedDay,
            devMode,
          );
          const availableEntry  = activeDevotional.entries.find(
            e => e.dayNumber === availableDay && e.status === 'Published',
          );
          const completedToday  = (activeDevotional.progress.completedDays ?? []).includes(availableDay);
          // Show "View Previous Days" once the member has completed at least one day
          const hasPrevDevotionalDays = (activeDevotional.progress.completedDays ?? []).length > 0;

          return (
            <motion.section
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.09 }}
            >
              <DevotionalCard
                series={activeDevotional.series}
                availableDay={availableDay}
                entryTitle={availableEntry?.title}
                completedToday={completedToday}
                onBeginToday={() =>
                  setLocation(`/devotional/${activeDevotional.series.id}/day/${availableDay}?source=today`)
                }
                onReviewToday={() =>
                  setLocation(`/devotional/${activeDevotional.series.id}/day/${availableDay}?source=today`)
                }
                onViewPreviousDays={
                  hasPrevDevotionalDays
                    ? () => setLocation(`/devotional/${activeDevotional.series.id}/previous?from=walk`)
                    : undefined
                }
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
              description="Five short weekday devotionals based on Sunday's sermon."
              metadata={`${scCompanion.numberOfDays} Days`}
              primaryActionLabel={scCompanion.isStarted ? 'Continue' : 'Open Companion'}
              onAction={() =>
                setLocation(
                  `/sermon-companion/${scCompanion.id}/day/${scCompanion.currentDay}?source=today`
                )
              }
              secondaryAction={
                scCompanion.isStarted && scCompanion.currentDay > 1
                  ? {
                      label: 'View Previous Days →',
                      onPress: () => setLocation(`/sermon-companion/${scCompanion.id}/previous?from=walk`),
                    }
                  : undefined
              }
            />
          </motion.section>
        )}

      </main>

      <BottomNav />
    </div>
  );
}
