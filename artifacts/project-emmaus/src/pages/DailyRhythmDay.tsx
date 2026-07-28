/**
 * DailyRhythmDay — dedicated reader for 10 Minutes with Jesus.
 *
 * Canonical route: /daily-rhythm/day/:dayNumber
 *
 * Modes:
 *   Live    — day === member's current day; shows Continue button; marks complete on tap,
 *             then shows ReadingCompletionFooter in-page before returning to Today's Steps.
 *   Replay  — day <  member's current day; read-only; shows ReadingCompletionFooter only.
 *             Never writes progress.
 *
 * Previous Days remains accessible via the secondary link on the Walk card,
 * not from the bottom of this reading screen.
 *
 * Access enforcement (data-layer):
 *   day > currentDay  →  blocked; renders ahead-of-rhythm screen.
 *   step not Published →  blocked; renders ahead-of-rhythm screen (content not ready yet).
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
import { buildReturnScrollKey } from '@/components/EmbeddedScripture';
import { ReadingCompletionFooter } from '@/components/ReadingCompletionFooter';
import { BottomNav } from '@/components/BottomNav';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { DevModeBanner } from '@/components/DevModeBanner';

// ─── Ahead-of-rhythm screen ───────────────────────────────────────────────────
// Shared by two cases: (a) day > currentDay, (b) current day not yet published.

function AheadOfRhythm({
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
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { journeys, progress, getStepsForJourney, completeStep } = useJourney();

  const journeyId = '15-minutes-with-jesus';
  const day = parseInt(dayNumber ?? '1', 10);
  const devMode = isDevelopmentMode(user);

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

  // Preserve scroll position for EmbeddedScripture deep-links
  useEffect(() => {
    const key = buildReturnScrollKey(`/daily-rhythm/day/${day}`);
    sessionStorage.removeItem(key);
  }, [day]);

  const goBack = () => setLocation('/walk');
  const goToPreviousDays = () => setLocation('/daily-rhythm/previous');

  const hasPreviousDays =
    currentDay > 1 &&
    steps.some(s => s.status === 'Published' && s.day < currentDay);

  // Resolve the step — blocked when ahead of the rhythm or not yet published
  const step = steps.find(s => s.day === day && s.status === 'Published');
  const isAhead = day > currentDay && !devMode;

  if (!journey || !prog && day > 1) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (isAhead || !step) {
    return (
      <AheadOfRhythm
        hasPreviousDays={hasPreviousDays}
        onBack={goBack}
        onViewPrevious={goToPreviousDays}
      />
    );
  }

  // ── Reader ────────────────────────────────────────────────────────────────
  // Replay: day already completed in a prior session (read-only).
  // Dev mode: future days (day > currentDay) are still readable without blocking.
  const isReplay = day < currentDay || alreadyCompleted;

  // Header back arrow: replay goes back to Previous Days; live goes back to Today's Steps.
  const handleBack = isReplay ? goToPreviousDays : goBack;

  const handleComplete = () => {
    completeStep(journeyId, day, '');
    setJustCompleted(true);
  };

  // ── Action button / footer ────────────────────────────────────────────────

  let actionButton: React.ReactNode;

  if (justCompleted || (isReplay && alreadyCompleted)) {
    // Just completed this session, or returning to a completed day
    actionButton = (
      <ReadingCompletionFooter
        completedToday={justCompleted || isReplay}
        onReturn={goBack}
      />
    );
  } else if (isReplay) {
    // Replay of an earlier day (older than today's progress) — not yet marked complete
    actionButton = (
      <ReadingCompletionFooter completedToday={false} onReturn={goBack} />
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
    <div className="min-h-[100dvh] bg-background pb-32">

      {/* Dev mode indicator — shown only to authorised admins with dev mode on */}
      <DevModeBanner />

      {/* Sticky nav bar — back arrow only; identity shown in reading content below */}
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
          {/* Balance spacer */}
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
      />

      <BottomNav />
    </div>
  );
}
