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
import { motion } from 'framer-motion';
import { CheckCircle2, BookHeart, ChevronRight } from 'lucide-react';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { isCompletedToday, isNextDayAvailable } from '@/lib/daily-lock';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { DevModeBanner } from '@/components/DevModeBanner';
import { useMemo, useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import {
  getAllProgress,
  listPublishedSeries,
  getSeriesWithEntries,
  startSeries,
  type DevotionalSeries,
  type DevotionalProgress,
} from '@/lib/devotionals-api';

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
function DevotionalCard({
  series,
  progress,
  entryTitle,
  onContinue,
  onViewPreviousDays,
}: {
  series: DevotionalSeries;
  progress: DevotionalProgress;
  entryTitle?: string;
  onContinue: () => void;
  onViewPreviousDays?: () => void;
}) {
  const day = progress.currentDay;
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-center gap-2">
        <BookHeart size={14} className="text-primary" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          Daily Devotional
        </span>
      </div>
      <p className="text-[18px] font-semibold text-foreground leading-snug">
        {series.title}
      </p>
      <p className="text-[14px] text-muted-foreground">
        Day {day}{entryTitle ? ` · ${entryTitle}` : ''}
      </p>
      <Button className="w-full h-12 text-[15px] font-semibold rounded-xl" onClick={onContinue}>
        Begin Today
      </Button>
      {onViewPreviousDays && (
        <button
          onClick={onViewPreviousDays}
          className="w-full flex items-center justify-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors py-0.5"
        >
          View Previous Days <ChevronRight size={13} />
        </button>
      )}
    </div>
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
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-center gap-2">
        <BookHeart size={14} className="text-primary" />
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
          Daily Devotional
        </span>
      </div>
      <p className="text-[18px] font-semibold text-foreground leading-snug">
        {series.title}
      </p>
      <p className="text-[14px] text-muted-foreground">
        A new devotional series is available
      </p>
      <Button
        className="w-full h-12 text-[15px] font-semibold rounded-xl"
        onClick={onBegin}
        disabled={starting}
      >
        {starting
          ? <Loader2 size={16} className="animate-spin" />
          : 'Begin Devotional'}
      </Button>
    </div>
  );
}

// ─── 10 Minutes with Jesus card ───────────────────────────────────────────────
// Highest-priority card. Always first.
// For daily-rhythm journeys: never shows "of X" total or any "complete" language.
// onViewPreviousDays — when provided, a "View Previous Days →" text link is shown
// beneath the primary action. Only supply when the member actually has previous days.
function FifteenMinutesCard({
  journey,
  prog,
  onContinue,
  onViewPreviousDays,
  devMode = false,
}: {
  journey: import('@/contexts/JourneyContext').Journey;
  prog: import('@/contexts/JourneyContext').Progress | undefined;
  onContinue: () => void;
  onViewPreviousDays?: () => void;
  /** When true (admin / super-admin), the daily release schedule is bypassed. */
  devMode?: boolean;
}) {
  // In dev mode the calendar lock is lifted: treat every day as immediately
  // available so Continue advances freely without waiting for tomorrow.
  const completedToday  = devMode ? false : isCompletedToday(prog?.lastCompletedAt);
  const nextDayAvail    = devMode ? true  : isNextDayAvailable(prog?.lastCompletedAt);
  const currentDay      = prog?.currentDay ?? 1;
  const started         = !!prog;
  const isDailyRhythm   = journey.journeyType === 'daily-rhythm';

  let state: 'start' | 'ready' | 'complete' | 'tomorrow';
  if (!started)                             state = 'start';
  else if (completedToday && !nextDayAvail) state = 'complete';
  else if (completedToday)                  state = 'tomorrow';
  else                                      state = 'ready';

  const cfg = {
    start:    { label: 'Begin Day 1',        variant: 'default'  as const, disabled: false },
    ready:    {
      label:   prog && prog.completedDays.length > 0
                 ? `Continue Day ${currentDay}`
                 : 'Begin today',
      variant: 'default' as const,
      disabled: false,
    },
    complete: { label: 'Review today',       variant: 'outline'  as const, disabled: false },
    tomorrow: { label: 'Available tomorrow', variant: 'outline'  as const, disabled: true  },
  }[state];

  // Title line — never shows "of Y" for daily-rhythm; shows day number only.
  const titleLine = (() => {
    if (state === 'start') return 'Begin your daily walk';
    const doneDay = currentDay - 1 > 0 ? currentDay - 1 : currentDay;
    if (state === 'complete' || state === 'tomorrow') {
      return isDailyRhythm ? `Day ${doneDay} — done for today` : `Day ${doneDay} — Complete`;
    }
    return isDailyRhythm
      ? `Day ${currentDay}`
      : `Day ${currentDay} of ${journey.durationDays}`;
  })();

  return (
    <div
      className={[
        'rounded-2xl p-6 space-y-4 border',
        state === 'complete' || state === 'tomorrow'
          ? 'bg-card border-border'
          : 'bg-primary/5 border-primary/20',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-primary uppercase tracking-widest">
            10 Minutes with Jesus
          </p>
          <p className="text-[22px] font-medium text-foreground leading-snug">
            {titleLine}
          </p>
        </div>
        {(state === 'complete' || state === 'tomorrow') && (
          <CheckCircle2 size={22} className="text-primary mt-1 shrink-0" />
        )}
      </div>

      {/* Completion message */}
      {(state === 'complete' || state === 'tomorrow') && (
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          {isDailyRhythm
            ? "Today's time with Jesus is complete. Come back tomorrow."
            : "Today's time with Jesus is complete. Come back tomorrow for the next step."}
        </p>
      )}

      {/* Primary action */}
      <Button
        className="w-full h-12 rounded-xl text-[16px] font-medium"
        variant={cfg.variant}
        onClick={onContinue}
        disabled={cfg.disabled}
      >
        {cfg.label}
      </Button>

      {/* Secondary — View Previous Days text link, only when previous days exist */}
      {onViewPreviousDays && (
        <button
          onClick={onViewPreviousDays}
          className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors pt-1"
        >
          View Previous Days →
        </button>
      )}
    </div>
  );
}

// ─── This Week's Sermon Devotional card ──────────────────────────────────────
function SermonDevotionalCard({
  journey,
  prog,
  onContinue,
}: {
  journey: import('@/contexts/JourneyContext').Journey;
  prog: import('@/contexts/JourneyContext').Progress | undefined;
  onContinue: () => void;
}) {
  const started = prog && prog.completedDays.length > 0;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="space-y-0.5">
        <p className="text-[11px] font-semibold text-primary uppercase tracking-widest">
          This Week's Sermon Devotional
        </p>
        <p className="text-[17px] font-medium text-foreground leading-snug">
          {journey.sermon?.title ?? journey.title}
        </p>
        {started && prog && (
          <p className="text-[13px] text-muted-foreground pt-0.5">
            Day {prog.currentDay} of {journey.durationDays}
          </p>
        )}
      </div>
      <Button
        className="w-full h-11 rounded-xl text-[15px]"
        variant={started ? 'default' : 'outline'}
        onClick={onContinue}
      >
        Continue
      </Button>
    </div>
  );
}

// ─── Your Journeys section ────────────────────────────────────────────────────
// Lists journeys the member has already started.
// Empty state: an "Explore Journeys →" invitation leading to Next Steps.
function YourJourneysSection({
  startedJourneys,
  onSelect,
  onExplore,
}: {
  startedJourneys: Array<{
    journey: import('@/contexts/JourneyContext').Journey;
    prog: import('@/contexts/JourneyContext').Progress;
  }>;
  onSelect: (journeyId: string, prog: import('@/contexts/JourneyContext').Progress) => void;
  onExplore: () => void;
}) {
  return (
    <section className="space-y-2">
      <SectionLabel>Your Journeys</SectionLabel>

      {startedJourneys.length === 0 ? (
        /* Empty state — no card, just a quiet invitation */
        <button
          onClick={onExplore}
          className="text-[15px] text-primary hover:text-primary/80 transition-colors py-1"
        >
          Explore Journeys →
        </button>
      ) : (
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
      )}
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
    entryTitle: string;
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
      // Fetch entries so we can show the current day's title on the card
      const withEntries = await getSeriesWithEntries(started.series.id, auth)
        .catch(() => null);
      const currentEntry = withEntries?.entries.find(
        e => e.dayNumber === started.progress!.currentDay
      );
      setActiveDevotional({
        series: started.series,
        progress: started.progress,
        entryTitle: currentEntry?.title ?? '',
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

  // Does the member have any published previous days to revisit?
  const coreCurrentDay    = coreProg?.currentDay ?? 1;
  const devMode           = isDevelopmentMode(user);
  // In dev mode the calendar lock is lifted, so "completed today" is always
  // false — Continue navigates to the next day rather than "Review today".
  const coreCompletedToday = !devMode && isCompletedToday(coreProg?.lastCompletedAt);
  // The day the member just finished — one behind currentDay after completeStep runs.
  const coreCompletedDay  = Math.max(1, coreCurrentDay - 1);
  const hasPreviousDays =
    !!coreJourney &&
    coreCurrentDay > 1 &&
    getStepsForJourney(coreJourney.id).some(
      s => s.status === 'Published' && s.day < coreCurrentDay
    );

  // 2. Companion — This Week's Sermon Devotional
  const companionJourney = publishedJourneys.find(j => j.journeyType === 'companion');
  const companionProg    = companionJourney ? progress[companionJourney.id] : undefined;

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
              devMode={devMode}
              onContinue={() =>
                // "Review today" must reopen the completed day, never advance to the next.
                // In dev mode coreCompletedToday is always false so this always continues.
                goToDailyRhythmDay(coreCompletedToday ? coreCompletedDay : coreCurrentDay)
              }
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
        {activeDevotional ? (
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.09 }}
          >
            <DevotionalCard
              series={activeDevotional.series}
              progress={activeDevotional.progress}
              entryTitle={activeDevotional.entryTitle}
              onContinue={() =>
                setLocation(
                  `/devotional/${activeDevotional.series.id}/day/${activeDevotional.progress.currentDay}`
                )
              }
              onViewPreviousDays={
                activeDevotional.progress.currentDay > 1
                  ? () => setLocation(`/devotional/${activeDevotional.series.id}/previous`)
                  : undefined
              }
            />
          </motion.section>
        ) : unstartedSeries.length > 0 ? (
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
            onExplore={() => setLocation('/journeys')}
          />
        </motion.div>

        {/* ── 3. This Week's Sermon Devotional ───────────────────────────────── */}
        {companionJourney && (
          <motion.section
            className="space-y-3"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <SermonDevotionalCard
              journey={companionJourney}
              prog={companionProg}
              onContinue={() => goToJourney(companionJourney.id, companionProg ?? { currentDay: 1 })}
            />
          </motion.section>
        )}

      </main>

      <BottomNav />
    </div>
  );
}
