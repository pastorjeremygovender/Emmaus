import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { BookOpen, ChevronRight, Compass, Headphones, Leaf } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { BottomNav } from '@/components/BottomNav';
import { MemberHeaderActions } from '@/components/MemberHeaderActions';
import { UnifiedEmmausInput } from '@/components/UnifiedEmmausInput';

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, '');

type CurrentSermon = {
  id: string;
  title: string;
  isCurrentWeek: boolean;
  entries: Array<{ dayNumber: number; title: string }>;
  progress: {
    currentDay: number;
    completedDays: number[];
    status: string;
    hiddenFromToday?: boolean;
  } | null;
};

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function EmmausHome() {
  const { user } = useAuth();
  const { journeys, progress, getStepsForJourney, dailyRhythmState } = useJourney();
  const [, setLocation] = useLocation();
  const [currentSermon, setCurrentSermon] = useState<CurrentSermon | null | undefined>(undefined);

  const dailyRhythm = useMemo(
    () => journeys.find(journey =>
      journey.status === 'Published' && journey.journeyType === 'daily-rhythm'
    ),
    [journeys],
  );

  const rhythmProgress = dailyRhythm
    ? (dailyRhythmState?.progress ?? progress[dailyRhythm.id])
    : undefined;
  const currentDay = rhythmProgress?.currentDay ?? 1;
  const currentStep = dailyRhythm
    ? getStepsForJourney(dailyRhythm.id)
        .filter(step => step.status === 'Published')
        .sort((a, b) => a.dayNumber - b.dayNumber)
        .find(step => step.dayNumber === currentDay)
    : undefined;

  const activeResource = useMemo(
    () => journeys.find(journey =>
      journey.status === 'Published' &&
      journey.journeyType !== 'daily-rhythm' &&
      journey.journeyType !== 'companion' &&
      Boolean(progress[journey.id]) &&
      !progress[journey.id]?.hiddenFromToday
    ),
    [journeys, progress],
  );

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    const load = () => {
      fetch(`${BASE_URL}/api/sermon-companions/member/engagements`, {
        credentials: 'include',
        cache: 'no-store',
      })
        .then(response => {
          if (!response.ok) throw new Error('Could not load this week\'s sermon');
          return response.json() as Promise<CurrentSermon[]>;
        })
        .then(items => {
          if (!cancelled) {
            setCurrentSermon(items.find(item => item.isCurrentWeek) ?? null);
          }
        })
        .catch(() => {
          if (!cancelled) setCurrentSermon(null);
        });
    };
    load();
    document.addEventListener('visibilitychange', load);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', load);
    };
  }, [user?.id]);

  if (!user) return null;

  const preferredName = user.preferredName?.trim() || 'friend';
  const greetingName = preferredName.toLowerCase() === 'jeremy'
    ? 'Pastor Jeremy'
    : preferredName;
  const activeProgress = activeResource ? progress[activeResource.id] : undefined;
  const activeStep = activeResource
    ? getStepsForJourney(activeResource.id)
        .find(step => step.dayNumber === (activeProgress?.currentDay ?? 1))
    : undefined;

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="mx-auto max-w-[480px] px-4 pb-5 pt-5">
        <header className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[12px] font-semibold uppercase tracking-[0.24em] text-primary">
              Emmaus
            </p>
            <MemberHeaderActions compact />
          </div>
          <h1 className="mt-3 text-[25px] font-semibold leading-tight tracking-tight text-foreground">
            {greetingForHour(new Date().getHours())}, {greetingName}
          </h1>
        </header>

        <section className="mb-4" aria-label="Ask Emmaus">
          <UnifiedEmmausInput />
        </section>

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setLocation(`/daily-rhythm/day/${currentDay}?from=emmaus`)}
            className="flex w-full items-center gap-3 rounded-2xl border border-primary/15 bg-primary/[0.045] p-4 text-left shadow-sm active:opacity-80"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
                Today
              </span>
              <span className="mt-1 block text-[19px] font-semibold leading-tight text-foreground">
                {dailyRhythm?.title || '10 Minutes with Jesus'}
              </span>
              <span className="mt-1 block truncate text-[13px] text-muted-foreground">
                {currentStep?.title || `Day ${currentDay}`}
              </span>
            </span>
            <span className="flex h-9 shrink-0 items-center rounded-full bg-primary px-4 text-[13px] font-semibold text-primary-foreground">
              Open
            </span>
          </button>

          {currentSermon === undefined ? (
            <div className="h-[76px] animate-pulse rounded-2xl border border-border bg-card" />
          ) : currentSermon ? (
            <button
              type="button"
              onClick={() => setLocation(`/sermon-companion/${currentSermon.id}/navigate?from=emmaus`)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left active:opacity-80"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-primary">
                <Headphones size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                  This week's sermon
                </span>
                <span className="mt-1 block truncate text-[15px] font-semibold text-foreground">
                  {currentSermon.title}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-primary">
                <Headphones size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                  This week's sermon
                </span>
                <span className="mt-1 block text-[13px] text-muted-foreground">
                  Not available yet
                </span>
              </span>
            </div>
          )}

          {activeResource && (
            <button
              type="button"
              onClick={() => setLocation(`/journeys/${activeResource.id}?source=emmaus`)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left active:opacity-80"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-primary">
                <Leaf size={17} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-primary">
                  Continue your journey
                </span>
                <span className="mt-1 block truncate text-[15px] font-semibold text-foreground">
                  {activeResource.title}
                </span>
                {activeStep?.title && (
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                    {activeStep.title}
                  </span>
                )}
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setLocation('/library')}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold text-foreground"
          >
            <BookOpen size={16} className="text-primary" aria-hidden="true" />
            My Library
          </button>
          <button
            type="button"
            onClick={() => setLocation('/journeys?from=emmaus')}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold text-foreground"
          >
            <Compass size={16} className="text-primary" aria-hidden="true" />
            Discover
          </button>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
