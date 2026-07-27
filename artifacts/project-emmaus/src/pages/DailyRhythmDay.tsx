/**
 * DailyRhythmDay — dedicated reader for 10 Minutes with Jesus.
 *
 * Canonical route: /daily-rhythm/day/:dayNumber
 *
 * Modes:
 *   Live    — day === member's current day; shows Continue button; marks complete on tap.
 *   Replay  — day <  member's current day; read-only; shows Back to Today's Steps; never writes progress.
 *
 * Access enforcement (data-layer):
 *   day > currentDay  →  blocked; renders ahead-of-rhythm screen.
 *   step not Published →  blocked; renders ahead-of-rhythm screen (content not ready yet).
 *
 * Legacy redirect: /journey/15-minutes-with-jesus/day/:day is handled in App.tsx.
 */

import { useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Check } from 'lucide-react';
import { DailyRhythmReading, resolveDisplayName } from '@/components/DailyRhythmReading';
import { buildReturnScrollKey } from '@/components/EmbeddedScripture';
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
        <div className="pt-4 flex flex-col gap-3">
          <Button variant="outline" className="rounded-xl px-8" onClick={onBack}>
            Back to Today's Steps
          </Button>
          {hasPreviousDays && (
            <button
              onClick={onViewPrevious}
              className="text-[14px] text-muted-foreground hover:text-foreground transition-colors py-2"
            >
              View Previous Days
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DailyRhythmDay() {
  const { dayNumber: dayStr } = useParams<{ dayNumber: string }>();
  const day = parseInt(dayStr || '1', 10);
  const [, setLocation] = useLocation();

  const {
    journeys,
    getStep,
    completeStep,
    startJourney,
    loading,
    progress,
  } = useJourney();
  const { user } = useAuth();

  // Resolve the published Daily Rhythm journey (supports both legacy 'core' type and new 'daily-rhythm').
  const coreJourney = journeys.find(
    j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
  );
  const journeyId       = coreJourney?.id;
  const journeyProgress = journeyId ? progress[journeyId] : undefined;
  const currentDay      = journeyProgress?.currentDay ?? 1;

  // Enroll in the journey on first visit (idempotent — no-ops if already enrolled).
  useEffect(() => {
    if (journeyId) startJourney(journeyId);
  }, [journeyId]);

  // Scroll restore — on mount, restore position if returning from My Bible;
  // otherwise start at the top. Save position on unmount for the return trip.
  const returnScrollKey = buildReturnScrollKey(`/daily-rhythm/day/${day}`);
  useEffect(() => {
    const saved = sessionStorage.getItem(returnScrollKey);
    if (saved) {
      sessionStorage.removeItem(returnScrollKey);
      requestAnimationFrame(() => window.scrollTo(0, parseInt(saved, 10)));
    } else {
      window.scrollTo(0, 0);
    }
    // No cleanup needed — EmbeddedScripture saves the key before navigating away.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          <span className="text-[14px]">Loading…</span>
        </div>
      </div>
    );
  }

  // ── Journey not published ──────────────────────────────────────────────────
  if (!coreJourney || !journeyId) {
    return (
      <div className="p-6 text-center mt-20 text-[15px] text-muted-foreground">
        10 Minutes with Jesus is not available right now.
      </div>
    );
  }

  const hasPreviousDays   = currentDay > 1;
  const goBack            = () => setLocation('/walk');
  const goToPreviousDays  = () => setLocation('/daily-rhythm/previous');

  const devMode = isDevelopmentMode(user);

  // ── Access enforcement: future days are blocked (production members only) ──
  // Dev mode (admin / super-admin) skips this gate entirely so every published
  // day is immediately accessible during development and content review.
  if (!devMode && day > currentDay) {
    return (
      <AheadOfRhythm
        hasPreviousDays={hasPreviousDays}
        onBack={goBack}
        onViewPrevious={goToPreviousDays}
      />
    );
  }

  // Fetch the step (members only see Published steps via JourneyContext filtering).
  const step = getStep(journeyId, day);

  // ── Step not published / not authored yet ──────────────────────────────────
  // In dev mode still show a calm gate if the content has not been authored —
  // bypassing the calendar lock does not bypass unpublished drafts for members,
  // but for admins the Content Studio is the right place to author the day.
  if (!step) {
    return (
      <AheadOfRhythm
        hasPreviousDays={hasPreviousDays}
        onBack={goBack}
        onViewPrevious={goToPreviousDays}
      />
    );
  }

  // ── Reader ────────────────────────────────────────────────────────────────
  // Normal mode:  day < currentDay → replay (read-only).
  // Dev mode:     any day < currentDay is still replay (already completed).
  //               future days (day > currentDay) are treated as live so the
  //               admin can read and Continue through them freely.
  const isReplay = day < currentDay;

  // Replay returns to Previous Days; live mode returns to Today's Steps.
  const handleBack = isReplay ? goToPreviousDays : goBack;

  const handleComplete = () => {
    completeStep(journeyId, day, '');
    setLocation('/walk');
  };

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
        actionButton={
          isReplay ? (
            /* Replay: never writes progress, never advances the sequence */
            <Button
              size="lg"
              variant="outline"
              className="w-full h-14 text-[17px] rounded-2xl"
              onClick={goToPreviousDays}
            >
              Back to Previous Days
            </Button>
          ) : (
            /* Live: marks the day complete and returns to Today's Steps */
            <Button
              size="lg"
              className="w-full h-14 text-[17px] rounded-2xl"
              onClick={handleComplete}
              data-testid="button-complete-today"
            >
              Continue
            </Button>
          )
        }
      />

      <BottomNav />
    </div>
  );
}
