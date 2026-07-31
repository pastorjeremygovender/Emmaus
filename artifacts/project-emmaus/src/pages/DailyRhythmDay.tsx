/**
 * DailyRhythmDay — dedicated reader for 10 Minutes with Jesus.
 *
 * Canonical route: /daily-rhythm/day/:dayNumber
 *
 * Completion behaviour (spec §1):
 *   Tapping Continue immediately saves progress and returns the user to Today's Steps.
 *   A brief JourneyCompletionPanel is shown in-page and auto-navigates (replace) after
 *   2 s so the member never has to tap a second time and Back does not return to the
 *   just-completed active flow.
 *
 * Modes:
 *   Live    — day === member's current day; shows Continue button; marks complete on tap,
 *             then auto-returns (replace) to Today's Steps via JourneyCompletionPanel.
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
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check } from 'lucide-react';
import { DailyRhythmReading, resolveDisplayName } from '@/components/DailyRhythmReading';
import { extractFirstSentence } from '@/lib/share';
import { buildReturnScrollKey } from '@/components/EmbeddedScripture';
import { EmmausCompletionCard } from '@/components/EmmausCompletionCard';
import { BottomNav } from '@/components/BottomNav';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { DevModeBanner } from '@/components/DevModeBanner';

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
  const { journeys, progress, getStepsForJourney, completeStep } = useJourney();

  // Resolve the daily-rhythm journey dynamically so any slug works in production.
  // Falls back to the known seed ID so existing deep-links don't break.
  const journeyId = journeys.find(j => j.journeyType === 'daily-rhythm')?.id ?? '15-minutes-with-jesus';
  const day = parseInt(dayNumber ?? '1', 10);
  const devMode = isDevelopmentMode(user);

  // When navigating from Walk's Review button, ?from=walk is set.
  // Back arrow and completion card return to Today's Steps in that case;
  // otherwise (accessed from Previous Days) they stay in the previous-days flow.
  const fromWalk = new URLSearchParams(location.split('?')[1] ?? '').get('from') === 'walk';

  const journey = journeys.find(j => j.id === journeyId);
  const prog = progress[journeyId];
  const currentDay = prog?.currentDay ?? 1;
  const steps = getStepsForJourney(journeyId);

  // Whether this day has already been completed in a prior session
  const alreadyCompleted = (prog?.completedDays ?? []).includes(day);

  // Live reading completed in the current session (in-page state)
  const [justCompleted, setJustCompleted] = useState(false);

  useEffect(() => {
    setJustCompleted(false); // reset on day change
  }, [day]);

  // Auto-return to Today's Steps 2 s after the completion panel appears (spec §1).
  // Uses replace semantics so Back does not return to the just-completed reading.
  useEffect(() => {
    if (!justCompleted) return;
    const timer = setTimeout(() => setLocation('/walk', { replace: true }), 2000);
    return () => clearTimeout(timer);
  }, [justCompleted, setLocation]);

  // Preserve scroll position for EmbeddedScripture deep-links
  useEffect(() => {
    const key = buildReturnScrollKey(`/daily-rhythm/day/${day}`);
    sessionStorage.removeItem(key);
  }, [day]);

  const goBack = () => setLocation('/walk');
  const goToPreviousDays = () => setLocation('/daily-rhythm/previous?from=walk');

  const hasPreviousDays =
    currentDay > 1 &&
    steps.some(s => s.status === 'Published' && s.day < currentDay);

  // Resolve the step
  const step = steps.find(s => s.day === day && s.status === 'Published');
  const isAhead = day > currentDay && !devMode;

  // ── Loading guard ─────────────────────────────────────────────────────────
  if (!journey || (!prog && day > 1)) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
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
  //   - Replay via Review button (?from=walk) → Today's Steps
  //   - Replay via Previous Days → Previous Days
  const handleBack = isReplay
    ? (fromWalk ? goBack : goToPreviousDays)
    : goBack;

  const handleComplete = () => {
    completeStep(journeyId, day, '');
    setJustCompleted(true);
    // Auto-navigation is handled by the useEffect above (2 s replace).
    // EmmausCompletionCard gives an immediate tap-to-return option.
  };

  // ── Action button / footer ────────────────────────────────────────────────

  let actionButton: React.ReactNode;

  if (justCompleted) {
    // Just completed this session — auto-returns in 2 s (see useEffect above)
    actionButton = (
      <EmmausCompletionCard
        heading={`Day ${day} complete.`}
        subMessage="We'll continue walking together tomorrow."
        returnLabel="Back to Today's Steps"
        onReturn={() => setLocation('/walk', { replace: true })}
        onPreviousDays={hasPreviousDays ? goToPreviousDays : undefined}
      />
    );
  } else if (isReplay) {
    // Review from Today's Steps (?from=walk) → return to Today's Steps.
    // Review from Previous Days → return to Previous Days.
    actionButton = (
      <EmmausCompletionCard
        heading={`Day ${day} complete.`}
        subMessage="May the Lord continue His work in your heart today."
        returnLabel={fromWalk ? "Back to Today's Steps" : "Back to Previous Days"}
        onReturn={fromWalk ? goBack : goToPreviousDays}
      />
    );
  } else {
    // Live — first reading of today's step
    actionButton = (
      <Button
        size="lg"
        className="w-full h-14 text-[17px] rounded-2xl"
        onClick={handleComplete}
        data-testid="button-complete-today"
      >
        Continue
      </Button>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">

      {/* Dev mode indicator — shown only to authorised admins with dev mode on */}
      <DevModeBanner />

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
          <div className="min-w-[44px]" />
        </div>
      </header>

      <DailyRhythmReading
        day={day}
        title={step.title}
        mentorIntro={step.mentorIntro}
        memberName={resolveDisplayName(user?.preferredName)}
        scripture={step.scripture}
        devotional={step.devotional}
        prayerPrompt={step.prayerPrompt}
        actionStep={step.actionStep}
        closingText={(step as any).closingText}
        returnPath={`/daily-rhythm/day/${day}`}
        actionButton={actionButton}
        sharePayload={{
          contentTitle: '10 Minutes with Jesus',
          dayTitle: step.title,
          scripture: step.scripture,
          keyThought: extractFirstSentence((step as any).closingText || step.devotional),
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
