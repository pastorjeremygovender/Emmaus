/**
 * StepNavigatorPage — shown when a member taps a Walk or Daily Rhythm card on
 * Today's Steps.  Instead of dropping straight into the current reading, this
 * gives them explicit Previous / Current / Next choices so they can decide where
 * to go.
 *
 * Used at two routes:
 *   /daily-rhythm/navigate          (mode='daily-rhythm')
 *   /journey/:journeyId/navigate    (mode='journey')
 */

import { useParams, useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { ArrowLeft, CheckCircle2, ChevronRight } from 'lucide-react';
import { getStepLabel } from '@/lib/step-label';
import { BottomNav } from '@/components/BottomNav';
import type { Journey, Step } from '@/contexts/JourneyContext';

interface Props {
  mode: 'daily-rhythm' | 'journey';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readingPath(mode: Props['mode'], journey: Journey, day: number) {
  return mode === 'daily-rhythm'
    ? `/daily-rhythm/day/${day}?from=navigate`
    : `/journey/${journey.id}/day/${day}?source=navigate`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StepCardProps {
  role: 'previous' | 'current' | 'next';
  step: Step;
  journey: Journey;
  onClick: () => void;
}

function StepCard({ role, step, journey, onClick }: StepCardProps) {
  const label = getStepLabel(step, journey);

  if (role === 'current') {
    return (
      <button
        className="w-full text-left rounded-2xl border-2 border-primary bg-primary/5 px-5 py-5 transition-all active:scale-[0.98] shadow-sm"
        onClick={onClick}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <span className="inline-block text-[10px] font-bold text-primary uppercase tracking-widest mb-2">
              ● Current
            </span>
            <p className="text-base font-bold text-foreground leading-snug">
              {label}
            </p>
            {step.title && (
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                {step.title}
              </p>
            )}
          </div>
          <span className="flex-shrink-0 inline-flex items-center gap-1 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full mt-0.5 whitespace-nowrap">
            Open <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </button>
    );
  }

  if (role === 'previous') {
    return (
      <button
        className="w-full text-left rounded-2xl border border-border bg-muted/30 px-5 py-4 transition-all active:scale-[0.98]"
        onClick={onClick}
      >
        <div className="flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
              ← Previous
            </p>
            <p className="text-sm font-medium text-foreground/75 truncate">
              {label}{step.title ? ` · ${step.title}` : ''}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-50" />
        </div>
      </button>
    );
  }

  // next
  return (
    <button
      className="w-full text-left rounded-2xl border border-border bg-background px-5 py-4 transition-all active:scale-[0.98]"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
            Next →
          </p>
          <p className="text-sm font-medium text-foreground/75 truncate">
            {label}{step.title ? ` · ${step.title}` : ''}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
    </button>
  );
}

function EmptySlot({ role }: { role: 'previous' | 'next' }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/50 px-5 py-4 opacity-40 pointer-events-none">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
        {role === 'previous' ? '← Previous' : 'Next →'}
      </p>
      <p className="text-sm text-muted-foreground">
        {role === 'previous' ? 'This is the beginning' : 'More coming soon'}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function StepNavigatorPage({ mode }: Props) {
  const params = useParams<{ journeyId?: string }>();
  const [, setLocation] = useLocation();
  const { journeys, progress, getStepsForJourney } = useJourney();

  // Resolve which journey this navigator is for
  const journey =
    mode === 'daily-rhythm'
      ? journeys.find(j => j.journeyType === 'daily-rhythm')
      : journeys.find(j => j.id === params.journeyId);

  const prog = journey ? progress[journey.id] : undefined;
  const currentDay = prog?.currentDay ?? 1;
  const completedCount = prog?.completedDays.length ?? 0;

  const allSteps = journey
    ? getStepsForJourney(journey.id).filter(
        s => s.status === 'Published' && !s.isCompletionStep,
      )
    : [];

  const prevStep = allSteps.find(s => s.day === currentDay - 1) ?? null;
  const currStep = allSteps.find(s => s.day === currentDay) ?? null;
  const nextStep = allSteps.find(s => s.day === currentDay + 1) ?? null;

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else setLocation('/walk');
  }

  function navigate(day: number) {
    if (!journey) return;
    setLocation(readingPath(mode, journey, day));
  }

  // Show a skeleton-style placeholder while journey data loads
  if (!journey) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const stepPrefix =
    journey.journeyType === 'daily-rhythm'
      ? 'Day'
      : (journey.stepLabelPrefix?.trim() || 'Step');
  const totalSteps = allSteps.length;

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe flex flex-col">
      {/* ── Sticky header ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={goBack}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-muted transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{journey.title}</p>
            <p className="text-sm font-semibold text-foreground">Where would you like to read?</p>
          </div>
        </div>
      </div>

      {/* ── Cards ──────────────────────────────────────────────────────── */}
      <div className="flex-1 px-4 pt-6 pb-4 flex flex-col gap-3">
        {/* Previous */}
        {prevStep ? (
          <StepCard
            role="previous"
            step={prevStep}
            journey={journey}
            onClick={() => navigate(prevStep.day)}
          />
        ) : (
          <EmptySlot role="previous" />
        )}

        {/* Current */}
        {currStep ? (
          <StepCard
            role="current"
            step={currStep}
            journey={journey}
            onClick={() => navigate(currStep.day)}
          />
        ) : (
          /* Unlikely: means progress is beyond all published steps — still navigable */
          <div className="rounded-2xl border-2 border-border bg-muted/20 px-5 py-5 text-center opacity-60">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">● Current</p>
            <p className="text-sm text-muted-foreground">No content available yet</p>
          </div>
        )}

        {/* Next */}
        {nextStep ? (
          <StepCard
            role="next"
            step={nextStep}
            journey={journey}
            onClick={() => navigate(nextStep.day)}
          />
        ) : (
          <EmptySlot role="next" />
        )}
      </div>

      {/* ── Progress bar ───────────────────────────────────────────────── */}
      {totalSteps > 0 && (
        <div className="px-4 pb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progress</span>
            <span>
              {completedCount} of {totalSteps} {stepPrefix.toLowerCase()}s completed
            </span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (completedCount / totalSteps) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── View all link ───────────────────────────────────────────────── */}
      <div className="px-4 pb-4 text-center">
        <button
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
          onClick={() =>
            mode === 'daily-rhythm'
              ? setLocation('/daily-rhythm/previous')
              : setLocation(`/journey/${params.journeyId}/previous`)
          }
        >
          View all {stepPrefix.toLowerCase()}s
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
