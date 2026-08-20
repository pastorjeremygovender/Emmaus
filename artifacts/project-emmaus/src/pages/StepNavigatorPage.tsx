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
import { useState } from 'react';
import { useJourney } from '@/contexts/JourneyContext';
import { ArrowLeft } from 'lucide-react';
import { getStepLabel } from '@/lib/step-label';
import { BottomNav } from '@/components/BottomNav';
import type { Journey } from '@/contexts/JourneyContext';
import { BrowseModeToggle, type BrowseMode } from '@/components/BrowseModeToggle';

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
  const [browseMode, setBrowseMode] = useState<BrowseMode>('groups');

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
    <div className="min-h-[100dvh] bg-background pb-page-safe flex flex-col">
      {/* Sticky header */}
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
          <BrowseModeToggle value={browseMode} onChange={setBrowseMode} />
        </div>
      </div>

      {/* Full step list */}
      <main className="flex-1 px-4 pt-5 pb-4">
        {browseMode === 'groups' ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No step groups are available yet.</p>
            <button type="button" className="mt-3 text-sm font-medium text-primary" onClick={() => setBrowseMode('all')}>
              View all {stepPrefix.toLowerCase()}s
            </button>
          </div>
        ) : allSteps.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No steps available yet.</p>
        ) : (
          <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
            {allSteps.map(step => {
              const done      = completedSet.has(step.day);
              const isCurrent = step.day === currentDay && !done;
              const label     = getStepLabel(step, journey);

              return (
                <button
                  key={step.id}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 transition-colors text-left ${
                    isCurrent
                      ? 'bg-primary/5 hover:bg-primary/10 active:bg-primary/15'
                      : 'bg-card hover:bg-muted/40 active:bg-muted/60'
                  }`}
                  onClick={() => setLocation(readingPath(mode, journey, step.day))}
                  aria-label={
                    isCurrent
                      ? `Up next: ${label}${step.title ? ` — ${step.title}` : ''}`
                      : done
                        ? `Review: ${label}${step.title ? ` — ${step.title}` : ''}`
                        : `${label}${step.title ? ` — ${step.title}` : ''}`
                  }
                >
                  <span className={`text-[12px] font-medium w-6 shrink-0 mt-0.5 ${done || isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                    {step.day}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`text-[14px] leading-snug block ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {step.title || label}
                    </span>
                    {step.scripture && (
                      <span className="text-[12px] text-muted-foreground block mt-0.5">{step.scripture}</span>
                    )}
                  </span>
                  <span className={`ml-auto text-[11px] font-medium shrink-0 mt-0.5 ${isCurrent ? 'text-primary' : done ? 'text-primary' : 'text-muted-foreground'}`}>
                    {isCurrent ? 'Up next →' : done ? 'Review →' : '→'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
