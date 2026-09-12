/**
 * DailyRhythmDay — dedicated reader for 10 Minutes with Jesus.
 *
 * Canonical route: /daily-rhythm/day/:dayNumber
 *
 * Completion behaviour (spec §1):
 *   Tapping Continue saves progress and shows a completion decision card.
 *   The member explicitly chooses whether to review previous days or return to
 *   Today's Steps.
 *
 * Modes:
 *   Live    — day === member's current day; shows Continue button; marks complete on tap,
 *             then waits on the completion decision card for an explicit choice.
 *   Replay  — day <  member's current day; read-only; shows ReadingCompletionFooter only.
 *             Never writes progress.
 *
 * Future-day guard (spec Task 7):
 *   If a normal (non-dev-mode) member lands on a day that is ahead of their current
 *   rhythm or whose step is not yet published, they are immediately redirected to
 *   Today's Steps via replace semantics. The "You're ahead of the rhythm" screen is
 *   preserved ONLY as a Development Mode diagnostic.
 *
 * Previous Days remains accessible via the secondary link on the Walk card,
 * not from the bottom of this reading screen.
 *
 * Legacy redirect: /journey/15-minutes-with-jesus/day/:day is handled in App.tsx.
 */

import { useEffect, useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useJourney, type Progress } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check } from 'lucide-react';
import { HearEmmausButton } from '@/components/emmaus/HearEmmausButton';
import { DailyRhythmReading, resolveDisplayName } from '@/components/DailyRhythmReading';
import { getStepLabel } from '@/lib/step-label';
import { buildReturnScrollKey } from '@/components/EmbeddedScripture';
import { EmmausCompletionCard } from '@/components/EmmausCompletionCard';
import { BottomNav } from '@/components/BottomNav';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { DevModeBanner } from '@/components/DevModeBanner';
import { goBackOrFallback } from '@/lib/return-context';
import { getDailyRhythmState } from '@/lib/journeys-api';
import { consumeOpeningDestination } from '@/lib/opening-destination';
import { resolveDailyRhythmCalendar } from '@/lib/daily-rhythm-calendar';
import { acknowledgeNativeDailyRhythmDeepLink } from '@/lib/native-daily-rhythm-deep-link';

// ─── Ahead-of-rhythm screen (Dev Mode only) ───────────────────────────────────
// Shown ONLY in Development Mode so admins/testers can diagnose future-day access.
// Normal members are silently redirected to /walk instead (see guard below).

function AheadOfRhythmDevOnly({
  hasPreviousDays,
  onBack,
  onViewPrevious,
}: {
  hasPreviousDays: boolean;
  onBack: () => void;
  onViewPrevious: () => void;
}) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
      <div className="text-center space-y-4 max-w-[320px]">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Check size={28} className="text-primary" />
        </div>
        <h2 className="text-[22px] font-serif font-medium">You're ahead of the rhythm.</h2>
        <p className="text-[15px] text-muted-foreground leading-relaxed">
          Today's 10 Minutes with Jesus will be ready soon. Check back later.
        </p>
        {hasPreviousDays && (
          <button
            onClick={onViewPrevious}
            className="text-[15px] text-primary font-medium hover:underline"
          >
            View Previous Days →
          </button>
        )}
        <button
          onClick={onBack}
          className="block mx-auto text-[14px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Back to Today's Steps
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function DailyRhythmDay() {
  const { dayNumber } = useParams<{ dayNumber: string }>();
  const [location, setLocation] = useLocation();
  const { user } = useAuth();
  const { journeys, progress, getStepsForJourney, completeStep, dailyRhythmState } = useJourney();

  // Resolve the daily-rhythm journey dynamically so any slug works in production.
  // Falls back to the known seed ID so existing deep-links don't break.
  const journeyId = journeys.find(j => j.journeyType === 'daily-rhythm')?.id ?? '15-minutes-with-jesus';
  const day = parseInt(dayNumber ?? '1', 10);
  const devMode = isDevelopmentMode(user);
  const [dailyProgress, setDailyProgress] = useState<Progress | null>(null);
  const [dailyProgressLoading, setDailyProgressLoading] = useState(true);

  // Determine return context.
  // ?source=dailyRhythmPrevious → opened from Previous Days list → return to Previous Days.
  // ?source=walk|today or legacy ?from=walk → opened from Today's Steps (Walk review button).
  // NOTE: wouter's useLocation() returns pathname only — search params must come from window.location.search.
  const qs = new URLSearchParams(window.location.search);
  const source = qs.get('source');
  const widgetJourneyId = source === 'widget' ? qs.get('journeyId') : null;
  const widgetStepId = source === 'widget' ? qs.get('stepId') : null;
  const widgetFallback = source === 'widget' && qs.get('widgetFallback') === 'unavailable';
  const legacyFrom = qs.get('from');
  const fromWalk = source === 'walk' || source === 'today' || legacyFrom === 'walk';
  const fromPreviousDays = source === 'dailyRhythmPrevious';

  const journey = journeys.find(j => j.id === journeyId);
  const isDailyRhythmJourney = journey?.journeyType === 'daily-rhythm';
  const prog = dailyProgress ?? dailyRhythmState?.progress ?? progress[journeyId];
  const resolution = resolveDailyRhythmCalendar(undefined, dailyRhythmState);
  const currentDay = resolution?.currentDay ?? prog?.currentDay ?? 1;
  const steps = getStepsForJourney(journeyId);

  // Startup can advance Daily Rhythm immediately before this page mounts,
  // while JourneyContext may still hold the progress snapshot fetched a
  // moment earlier. Refresh the authoritative state before applying the
  // future-day guard, or the newly unlocked lesson is sent back to /walk.
  useEffect(() => {
    if (!journey || journey.journeyType !== 'daily-rhythm' || !user?.id) {
      setDailyProgressLoading(false);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      setDailyProgressLoading(true);
      // Hold the page while resolving; falling back to the old context snapshot
      // here would briefly apply yesterday's future-day guard after a resume.
      setDailyProgress(null);
      void getDailyRhythmState()
        .then(state => {
          if (!cancelled) setDailyProgress(state?.progress ?? null);
        })
        .catch(error => {
          if (!cancelled) console.warn('[Daily Rhythm] fresh route state unavailable', error);
        })
        .finally(() => {
          if (!cancelled) setDailyProgressLoading(false);
        });
    };
    refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [journey?.id, journey?.journeyType, user?.id]);

  // Whether this day has already been completed in a prior session
  const alreadyCompleted = (prog?.completedDays ?? []).includes(day);

  // Live reading completed in the current session (in-page state)
  const [justCompleted, setJustCompleted] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [postCompletionDestination, setPostCompletionDestination] = useState('/walk');

  useEffect(() => {
    setJustCompleted(false); // reset on day change
  }, [day]);

  // Preserve scroll position for EmbeddedScripture deep-links
  useEffect(() => {
    const key = buildReturnScrollKey(`/daily-rhythm/day/${day}`);
    sessionStorage.removeItem(key);
  }, [day]);

  const goBack = () => goBackOrFallback('/walk', setLocation);
  // Back to Previous Days — pops history so the Previous Days page itself can still
  // go back naturally. Falls back to forward navigation only when there is no history.
  const goToPreviousDays = () => goBackOrFallback('/daily-rhythm/previous?source=walk', setLocation);
  // Forward navigation to Previous Days — used for the "See Previous Days →" secondary
  // link when the user arrived from Today's Steps (not from Previous Days).
  const openPreviousDays = () => setLocation('/daily-rhythm/previous?source=walk');

  const hasPreviousDays =
    currentDay > 1 &&
    steps.some(s => s.status === 'Published' && s.day < currentDay);

  // Resolve the step. A widget carries the exact step ID it displayed so a
  // stale day number can never silently open a different authored entry.
  const stepForDay = steps.find(s => s.day === day && s.status === 'Published');
  const widgetStep = widgetStepId
    ? steps.find(s => (s as { id?: string }).id === widgetStepId && s.status === 'Published')
    : null;
  const widgetJourneyMismatch = Boolean(widgetJourneyId) && widgetJourneyId !== journeyId;
  const widgetStepUnavailable = Boolean(widgetStepId) && !widgetStep || widgetJourneyMismatch;
  const step = widgetStep ?? stepForDay;
  const isAhead = day > currentDay && !devMode;

  useEffect(() => {
    if (
      source !== 'widget' ||
      !user ||
      dailyProgressLoading ||
      !step ||
      (widgetStepUnavailable && !widgetFallback)
    ) {
      return;
    }
    // The native route is acknowledged only after this page has accepted the
    // referenced step, or rendered the explicit stale-entry fallback.
    acknowledgeNativeDailyRhythmDeepLink();
  }, [
    source,
    user,
    dailyProgressLoading,
    step?.day,
    widgetStepUnavailable,
    widgetFallback,
  ]);

  // ── Loading guard ─────────────────────────────────────────────────────────
  if (!journey || (!prog && day > 1)) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (isDailyRhythmJourney && dailyProgressLoading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (widgetStepUnavailable && !widgetFallback) {
    return (
      <RedirectToDailyRhythmCurrent
        day={currentDay}
        setLocation={setLocation}
      />
    );
  }

  // ── Future-day guard (spec Task 6 + 7) ───────────────────────────────────
  // Dev mode: show the diagnostic screen so admins can see the state.
  // Normal members: redirect silently to Today's Steps — never dead-end here.
  if (isAhead || !step) {
    if (devMode) {
      return (
        <AheadOfRhythmDevOnly
          hasPreviousDays={hasPreviousDays}
          onBack={goBack}
          onViewPrevious={goToPreviousDays}
        />
      );
    }
    // Normal member — redirect immediately with replace so Back does not loop.
    // Use a component-level effect to ensure this runs after render.
    return <RedirectToWalk setLocation={setLocation} />;
  }

  // ── Reader ────────────────────────────────────────────────────────────────
  // Replay: day already completed in a prior session (read-only).
  const isReplay = day < currentDay || alreadyCompleted;

  // Header back arrow:
  //   - Live (not yet completed) → Today's Steps
  //   - Replay via Review button (?source=walk, or legacy ?from=walk) → Today's Steps
  //   - Replay via Previous Days (?source=dailyRhythmPrevious) → Previous Days
  const handleBack = isReplay
    ? (fromWalk ? goBack : goToPreviousDays)
    : goBack;

  const handleComplete = async () => {
    if (completing) return;
    setCompleting(true);
    try {
      const completion = await completeStep(journeyId, day, '');
      setPostCompletionDestination(consumeOpeningDestination('/walk'));
      setJustCompleted(true);
      if (completion.dailyRhythmStartup?.state === 'COMPLETED') {
        window.dispatchEvent(new CustomEvent('emmaus:opening-completed', {
          detail: { decision: completion.dailyRhythmStartup },
        }));
      }
    } finally {
      setCompleting(false);
    }
  };

  // ── Action button / footer ────────────────────────────────────────────────

  let actionButton: React.ReactNode;

  if (justCompleted) {
    actionButton = (
      <EmmausCompletionCard
        heading={`${getStepLabel(step, journey)} complete.`}
        subMessage="Continue when you’re ready."
        returnLabel="Back to Today's Steps"
        onReturn={() => goBackOrFallback(postCompletionDestination, setLocation)}
        onPreviousDays={hasPreviousDays ? openPreviousDays : undefined}
      />
    );
  } else if (isReplay) {
    // Review from Today's Steps (?source=walk / legacy ?from=walk) → return to Today's Steps.
    // Review from Previous Days (?source=dailyRhythmPrevious) → return to Previous Steps.
    const replayReturnLabel = fromWalk
      ? "Back to Today's Steps"
      : fromPreviousDays
        ? "Back to Previous Steps"
        : "Back to Previous Days";
    actionButton = (
      <EmmausCompletionCard
        heading={`${getStepLabel(step, journey)} complete.`}
        subMessage="May the Lord continue His work in your heart today."
        returnLabel={replayReturnLabel}
        onReturn={fromWalk ? goBack : goToPreviousDays}
        onPreviousDays={hasPreviousDays && fromWalk ? openPreviousDays : undefined}
        previousDaysLabel="See Previous Days →"
      />
    );
  } else {
    // Live — first reading of today's step
    actionButton = (
      <Button
        size="lg"
        className="w-full h-14 text-[17px] rounded-2xl"
        onClick={handleComplete}
        disabled={completing}
        data-testid="button-complete-today"
      >
        {completing ? 'Saving…' : 'Continue'}
      </Button>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">

      {/* Dev mode indicator — shown only to authorised admins with dev mode on */}
      <DevModeBanner />

      {widgetFallback && (
        <div
          role="status"
          className="mx-auto max-w-[480px] px-5 pt-4 text-sm text-muted-foreground"
        >
          The entry shown on the widget is no longer available, so today’s current
          10 Minutes with Jesus is open instead.
        </div>
      )}

      {/* Sticky nav bar */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={isReplay ? 'Back to Previous Days' : "Back to Today's Steps"}
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1" />
        </div>
      </header>

      <DailyRhythmReading
        day={day}
        displayLabel={getStepLabel(step, journey)}
        title={step.title}
        mentorIntro={step.mentorIntro}
        memberName={resolveDisplayName(user?.preferredName)}
        scripture={step.scripture}
        devotional={step.devotional}
        prayerPrompt={step.prayerPrompt}
        actionStep={step.actionStep}
        closingText={(step as any).closingText}
        shareImageUrl={step.shareImageUrl}
        returnPath={`/daily-rhythm/day/${day}`}
        actionButton={actionButton}
        sharePayload={{
          title: '10 Minutes with Jesus',
          dayTitle: step.title,
          scripture: step.scripture ?? undefined,
          greeting: step.mentorIntro ?? undefined,
          reflection: step.devotional ?? undefined,
          prayer: step.prayerPrompt ?? undefined,
          nextStep: step.actionStep ?? undefined,
          closing: (step as any).closingText ?? undefined,
        }}
      />

      <BottomNav />
    </div>
  );
}

// ─── RedirectToWalk helper ────────────────────────────────────────────────────
// A tiny component that fires a replace-navigation effect after mount.
// Using a component rather than an inline useEffect lets React satisfy
// the hooks-before-early-returns rule while still navigating immediately.

function RedirectToWalk({ setLocation }: { setLocation: (to: string, opts?: { replace?: boolean }) => void }) {
  useEffect(() => {
    setLocation('/walk', { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Loading…</p>
    </div>
  );
}

function RedirectToDailyRhythmCurrent({
  day,
  setLocation,
}: {
  day: number;
  setLocation: (to: string, opts?: { replace?: boolean }) => void;
}) {
  useEffect(() => {
    const fallback = Math.max(1, day);
    setLocation(
      `/daily-rhythm/day/${fallback}?source=widget&widgetFallback=unavailable`,
      { replace: true },
    );
  }, [day, setLocation]);

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center">
      <p className="text-muted-foreground text-sm">Opening today’s rhythm…</p>
    </div>
  );
}
