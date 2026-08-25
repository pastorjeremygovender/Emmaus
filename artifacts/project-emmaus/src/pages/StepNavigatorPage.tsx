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
import { useEffect, useState } from 'react';
import { useJourney } from '@/contexts/JourneyContext';
import { ChevronLeft, FolderOpen } from 'lucide-react';
import { getStepLabel } from '@/lib/step-label';
import { BottomNav } from '@/components/BottomNav';
import { ContentStepList } from '@/components/ContentStepList';
import { BrowseModeToggle } from '@/components/BrowseModeToggle';
import { listDailyRhythmGroups, type DailyRhythmGroup } from '@/lib/journeys-api';
import { isCompletedToday } from '@/lib/daily-lock';
import type { Journey } from '@/contexts/JourneyContext';

interface Props {
  mode: 'daily-rhythm' | 'journey';
}

function readingPath(mode: Props['mode'], journey: Journey, day: number) {
  return mode === 'daily-rhythm'
    ? `/daily-rhythm/day/${day}?source=today`
    : `/journey/${journey.id}/day/${day}?source=today`;
}

export function StepNavigatorPage({ mode }: Props) {
  const params = useParams<{ journeyId?: string }>();
  const [, setLocation] = useLocation();
  const { journeys, progress, getStepsForJourney } = useJourney();
  const [groups, setGroups] = useState<DailyRhythmGroup[]>([]);
  const [browseMode, setBrowseMode] = useState<'groups' | 'all'>('groups');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const journey =
    mode === 'daily-rhythm'
      ? journeys.find(j => j.journeyType === 'daily-rhythm')
      : journeys.find(j => j.id === params.journeyId);

  const prog = journey ? progress[journey.id] : undefined;
  const completedSet = new Set(prog?.completedDays ?? []);
  const dailyRhythmLockedToday =
    mode === 'daily-rhythm' && isCompletedToday(prog?.lastCompletedAt);
  // The current day remains visible after completion so the Days screen agrees
  // with Today's Steps. It is still the server's current day; showing it does
  // not unlock the next day.
  const availableThroughDay = prog?.currentDay ?? 1;

  // All published non-completion steps — every one is accessible
  const allSteps = journey
    ? getStepsForJourney(journey.id).filter(
        s => s.status === 'Published' && !s.isCompletionStep,
      )
    : [];
  const visibleSteps = allSteps.filter(
    step => mode !== 'daily-rhythm' || step.day <= availableThroughDay,
  );

  // Current = first uncompleted step; if all done, pin to last
  const currentDay = (() => {
    const groupSteps = selectedGroupId
      ? (groups.find(group => group.id === selectedGroupId)?.items ?? [])
      : allSteps;
    const navigableSteps = groupSteps.filter(
      step => mode !== 'daily-rhythm' || step.day <= availableThroughDay,
    );
    const next = navigableSteps.find(s => !completedSet.has(s.day));
    if (next) return next.day;
    return navigableSteps.length > 0 ? navigableSteps[navigableSteps.length - 1].day : null;
  })();

  const stepPrefix =
    journey?.journeyType === 'daily-rhythm'
      ? 'Day'
      : (journey?.stepLabelPrefix?.trim() || 'Step');

  function goBack() {
    if (selectedGroupId) {
      setSelectedGroupId(null);
      return;
    }
    if (window.history.length > 1) window.history.back();
    else setLocation('/walk');
  }

  useEffect(() => {
    if (mode !== 'daily-rhythm' || !journey) return;
    listDailyRhythmGroups(journey.id).then(setGroups).catch(() => setGroups([]));
  }, [mode, journey?.id]);

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
          {selectedGroupId ? journey.title : "Today's Steps"}
        </button>

        <div className="space-y-0.5">
          <h1 className="text-[26px] font-sans font-medium tracking-tight text-foreground leading-snug">
            {journey.title}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {selectedGroupId
              ? groups.find(group => group.id === selectedGroupId)?.title ?? 'Choose a day to read'
              : `Choose a ${stepPrefix.toLowerCase()} to read`}
          </p>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              {selectedGroupId ? 'Days' : browseMode === 'groups' && mode === 'daily-rhythm' ? 'Groups' : stepPrefix === 'Day' ? 'Days' : 'Steps'}
            </h2>
            {mode === 'daily-rhythm' && !selectedGroupId && (
              <BrowseModeToggle value={browseMode} onChange={setBrowseMode} />
            )}
          </div>
          {!selectedGroupId && browseMode === 'groups' && mode === 'daily-rhythm' ? (
            groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
                <FolderOpen size={20} className="mx-auto text-muted-foreground/60" />
                <p className="mt-3 text-sm text-muted-foreground">No Daily Rhythm groups are available yet.</p>
                <button type="button" className="mt-3 text-sm font-medium text-primary hover:underline" onClick={() => setBrowseMode('all')}>
                  View all days
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map(group => (
                  <button
                    key={group.id}
                    type="button"
                    onClick={() => setSelectedGroupId(group.id)}
                    className="w-full flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 text-left hover:border-primary/25 hover:bg-muted/40 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"><FolderOpen size={17} /></span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold truncate">{group.title}</span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">{group.items.length} {group.items.length === 1 ? 'day' : 'days'}</span>
                    </span>
                    <span className="text-[11px] font-medium text-primary">Open →</span>
                  </button>
                ))}
              </div>
            )
          ) : (selectedGroupId
            ? (groups.find(group => group.id === selectedGroupId)?.items ?? [])
            : allSteps
          ).length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No steps available yet.</p>
          ) : (
            <ContentStepList
              items={(selectedGroupId
             ? (groups.find(group => group.id === selectedGroupId)?.items ?? [])
                 .filter(step => step.day <= availableThroughDay)
             : visibleSteps
              ).map(step => {
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
