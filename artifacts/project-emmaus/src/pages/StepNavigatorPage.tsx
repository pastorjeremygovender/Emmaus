/**
 * StepNavigatorPage — shown when a member taps a Walk or Daily Rhythm card on
 * Today's Steps. Lists EVERY step in the walk, all accessible at any time.
 * Nothing is locked or hidden — members can jump to any step freely.
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

// ── Step row ─────────────────────────────────────────────────────────────────

interface StepRowProps {
  step: Step;
  journey: Journey;
  isCurrent: boolean;
  isCompleted: boolean;
  onClick: () => void;
}

function StepRow({ step, journey, isCurrent, isCompleted, onClick }: StepRowProps) {
  const label = getStepLabel(step, journey);

  if (isCurrent) {
    return (
      <button
        className="w-full text-left rounded-2xl border-2 border-primary bg-primary/5 px-5 py-4 transition-all active:scale-[0.98] shadow-sm"
        onClick={onClick}
      >
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <div className="w-2 h-2 rounded-full bg-primary-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold text-primary uppercase tracking-widest mb-0.5">● Current</p>
            <p className="text-sm font-semibold text-foreground truncate">{label}{step.title ? ` · ${step.title}` : ''}</p>
          </div>
          <span className="flex-shrink-0 inline-flex items-center gap-1 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap">
            Open <ChevronRight className="w-3 h-3" />
          </span>
        </div>
      </button>
    );
  }

  return (
    <button
      className="w-full text-left rounded-2xl border border-border bg-background px-5 py-4 transition-all active:scale-[0.98] hover:bg-muted/40"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {isCompleted
          ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
          : <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {label}{step.title ? ` · ${step.title}` : ''}
          </p>
          {step.scripture && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{step.scripture}</p>
          )}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function StepNavigatorPage({ mode }: Props) {
  const params = useParams<{ journeyId?: string }>();
  const [, setLocation] = useLocation();
  const { journeys, progress, getStepsForJourney } = useJourney();

  const journey =
    mode === 'daily-rhythm'
      ? journeys.find(j => j.journeyType === 'daily-rhythm')
      : journeys.find(j => j.id === params.journeyId);

  const prog = journey ? progress[journey.id] : undefined;
  const currentDay = prog?.currentDay ?? 1;
  const completedSet = new Set(prog?.completedDays ?? []);

  // All published non-completion steps — every one is accessible
  const allSteps = journey
    ? getStepsForJourney(journey.id).filter(
        s => s.status === 'Published' && !s.isCompletionStep,
      )
    : [];

  const completedCount = completedSet.size;
  const totalSteps = allSteps.length;

  const stepPrefix =
    journey?.journeyType === 'daily-rhythm'
      ? 'Day'
      : (journey?.stepLabelPrefix?.trim() || 'Step');

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else setLocation('/walk');
  }

  function navigate(day: number) {
    if (!journey) return;
    setLocation(readingPath(mode, journey, day));
  }

  if (!journey) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

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
            <p className="text-sm font-semibold text-foreground">Choose a {stepPrefix.toLowerCase()} to read</p>
          </div>
        </div>
      </div>

      {/* ── Full step list — all accessible ────────────────────────────── */}
      <div className="flex-1 px-4 pt-4 pb-4 flex flex-col gap-2">
        {allSteps.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">No steps available yet.</p>
          </div>
        ) : (
          allSteps.map(step => (
            <StepRow
              key={step.id}
              step={step}
              journey={journey}
              isCurrent={step.day === currentDay}
              isCompleted={completedSet.has(step.day)}
              onClick={() => navigate(step.day)}
            />
          ))
        )}
      </div>

      <BottomNav />
    </div>
  );
}
