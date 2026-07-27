/**
 * DailyRhythmDay — dedicated reader for 10 Minutes with Jesus.
 *
 * Canonical route: /daily-rhythm/day/:dayNumber
 *
 * Modes:
 *   Live    — day === member's current day; shows Continue button; marks complete on tap.
 *   Replay  — day <  member's current day; read-only; shows Back to Walk; never writes progress.
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBibleLink(ref: string): string {
  const match = ref.trim().match(/^(\d\s+)?([A-Za-z]+)\s+(\d+)/);
  if (!match) return '/bible/books';
  const num  = match[1] ? match[1].trim() + '-' : '';
  const book = (num + match[2]).toLowerCase();
  return `/bible/read/${book}/${match[3]}`;
}

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
            Back to Walk
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
    window.scrollTo(0, 0);
  }, [journeyId]);

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

  const hasPreviousDays = currentDay > 1;
  const goBack          = () => setLocation('/walk');

  // ── Access enforcement: future days are blocked ────────────────────────────
  if (day > currentDay) {
    return (
      <AheadOfRhythm
        hasPreviousDays={hasPreviousDays}
        onBack={goBack}
        onViewPrevious={goBack}
      />
    );
  }

  // Fetch the step (members only see Published steps via JourneyContext filtering).
  const step = getStep(journeyId, day);

  // ── Step not published / not authored yet ──────────────────────────────────
  if (!step) {
    return (
      <AheadOfRhythm
        hasPreviousDays={hasPreviousDays}
        onBack={goBack}
        onViewPrevious={goBack}
      />
    );
  }

  // ── Reader ────────────────────────────────────────────────────────────────
  // day < currentDay → replay (read-only).
  // day === currentDay → live (Continue button marks complete and returns to Walk).
  const isReplay = day < currentDay;

  const handleComplete = () => {
    completeStep(journeyId, day, '');
    setLocation('/walk');
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-32">

      {/* Sticky nav bar */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={goBack}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back to Walk"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0 text-center px-3">
            <div className="font-medium text-sm text-foreground truncate leading-tight">
              10 Minutes with Jesus
            </div>
            <div className="text-[12px] text-muted-foreground">
              Day {day}
            </div>
          </div>
          {/* Spacer balances the back arrow */}
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
        onReadInBible={step.scripture ? () => setLocation(parseBibleLink(step.scripture)) : undefined}
        actionButton={
          isReplay ? (
            /* Replay: never writes progress, never advances the sequence */
            <Button
              size="lg"
              variant="outline"
              className="w-full h-14 text-[17px] rounded-2xl"
              onClick={goBack}
            >
              Back to Walk
            </Button>
          ) : (
            /* Live: marks the day complete and returns to Walk */
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

    </div>
  );
}
