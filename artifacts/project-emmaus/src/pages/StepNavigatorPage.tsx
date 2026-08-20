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
import { ChevronLeft } from 'lucide-react';
import { getStepLabel } from '@/lib/step-label';
import { BottomNav } from '@/components/BottomNav';
import { ContentStepList } from '@/components/ContentStepList';
import type { Journey } from '@/contexts/JourneyContext';

interface Props {
  mode: 'daily-rhythm' | 'journey';
}

function readingPath(mode: Props['mode'], journey: Journey, day: number) {
  return mode === 'daily-rhythm'
    ? `/daily-rhythm/day/${day}?from=navigate`
    : `/journey/${journey.id}/day/${day}?source=navigate`;
}

export function StepNavigatorPage({ mode }: Props) {
  const params = useParams<{ journeyId?: string }>();
  const [, setLocation] = useLocation();
  const { journeys, progress, getStepsForJourney } = useJourney();

  const journey =
    mode === 'daily-rhythm'
      ? journeys.find(j => j.journeyType === 'daily-rhythm')
      : journeys.find(j => j.id === params.journeyId);

  const prog = journey ? progress[journey.id] : undefined;
  const completedSet = new Set(prog?.completedDays ?? []);

  // All published non-completion steps — every one is accessible
  const allSteps = journey
    ? getStepsForJourney(journey.id).filter(
        s => s.status === 'Published' && !s.isCompletionStep,
      )
    : [];

  // Current = first uncompleted step; if all done, pin to last
  const currentDay = (() => {
    const next = allSteps.find(s => !completedSet.has(s.day));
    if (next) return next.day;
    return allSteps.length > 0 ? allSteps[allSteps.length - 1].day : null;
  })();

  const stepPrefix =
    journey?.journeyType === 'daily-rhythm'
      ? 'Day'
      : (journey?.stepLabelPrefix?.trim() || 'Step');

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else setLocation('/walk');
  }

  if (!journey) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="px-5 pt-6 pb-4 max-w-[480px] mx-auto space-y-6">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground transition-colors -ml-0.5"
          aria-label="Back"
        >
          <ChevronLeft size={17} />
          Today's Steps
        </button>

        <div className="space-y-0.5">
          <h1 className="text-[26px] font-sans font-medium tracking-tight text-foreground leading-snug">
            {journey.title}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            Choose a {stepPrefix.toLowerCase()} to read
          </p>
        </div>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            {stepPrefix === 'Day' ? 'Days' : 'Steps'}
          </h2>
          {allSteps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No steps available yet.</p>
          ) : (
            <ContentStepList
              items={allSteps.map(step => {
                const done = completedSet.has(step.day);
                const isCurrent = step.day === currentDay && !done;
                const label = getStepLabel(step, journey);
                return {
                  id: step.id,
                  index: step.day,
                  title: step.title || label,
                  subtitle: step.scripture,
                  completed: done,
                  current: isCurrent,
                  ariaLabel: isCurrent
                    ? `Up next: ${label}${step.title ? ` — ${step.title}` : ''}`
                    : done
                      ? `Review: ${label}${step.title ? ` — ${step.title}` : ''}`
                      : `${label}${step.title ? ` — ${step.title}` : ''}`,
                  onClick: () => setLocation(readingPath(mode, journey, step.day)),
                };
              })}
            />
          )}
        </section>
      </main>

      <BottomNav />
    </div>
  );
}
