import { useMemo } from 'react';
import { useLocation } from 'wouter';
import { BookOpen, ChevronRight, Headphones, Leaf, MessageCircle, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { BottomNav } from '@/components/BottomNav';
import { MemberHeaderActions } from '@/components/MemberHeaderActions';

export default function EmmausHome() {
  const { user } = useAuth();
  const { journeys, progress, getStepsForJourney, dailyRhythmState } = useJourney();
  const [, setLocation] = useLocation();

  const dailyRhythm = useMemo(
    () => journeys.find(journey => journey.status === 'Published' && journey.journeyType === 'daily-rhythm'),
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

  const activeResources = useMemo(
    () => journeys
      .filter(journey =>
        journey.status === 'Published' &&
        journey.journeyType !== 'daily-rhythm' &&
        journey.journeyType !== 'companion' &&
        Boolean(progress[journey.id]) &&
        !progress[journey.id]?.hiddenFromToday
      )
      .slice(0, 1),
    [journeys, progress],
  );

  if (!user) return null;

  const preferredName = user.preferredName?.trim();
  const greetingName = preferredName || 'friend';

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="mx-auto max-w-[480px] space-y-6 px-4 pb-6 pt-8">
        <header className="space-y-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold uppercase tracking-[0.24em] text-primary">
              Emmaus
            </p>
            <MemberHeaderActions compact />
          </div>
          <h1 className="max-w-[22rem] text-[34px] font-semibold leading-[1.08] tracking-tight text-foreground">
            Good morning,<br />{greetingName}
          </h1>
        </header>

        <section
          className="overflow-hidden rounded-[28px] border border-primary/10 bg-primary/[0.045] p-5 shadow-sm"
          aria-labelledby="next-step-title"
        >
          <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">
            Your next step
          </p>
          {dailyRhythm ? (
            <>
              <h2 id="next-step-title" className="mt-6 text-[27px] font-semibold leading-tight tracking-tight text-foreground">
                {dailyRhythm.title}
              </h2>
              <p className="mt-2 text-[17px] leading-snug text-muted-foreground">
                {currentStep?.title || `Day ${currentDay}`}
              </p>
              <button
                type="button"
                onClick={() => setLocation(`/daily-rhythm/day/${currentDay}?from=emmaus`)}
                className="mt-6 min-h-[52px] w-full rounded-2xl bg-primary px-5 text-[17px] font-semibold text-primary-foreground shadow-sm transition-opacity active:opacity-85"
              >
                Continue
              </button>
            </>
          ) : (
            <p className="mt-5 text-[15px] text-muted-foreground">
              We couldn't load today's reading. Please try again.
            </p>
          )}
        </section>

        <section aria-labelledby="ask-emmaus-title">
          <p id="ask-emmaus-title" className="mb-2 text-[12px] font-semibold uppercase tracking-[0.16em] text-primary">
            Ask Emmaus
          </p>
          <button
            type="button"
            onClick={() => setLocation('/personal/ask-emmaus')}
            className="flex min-h-[70px] w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left shadow-sm transition-colors hover:border-primary/25"
          >
            <MessageCircle size={20} className="shrink-0 text-primary" aria-hidden="true" />
            <span className="flex-1 text-[16px] text-muted-foreground">What's on your heart today?</span>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Send size={18} aria-hidden="true" />
            </span>
          </button>
        </section>

        <section aria-labelledby="journey-heading">
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 id="journey-heading" className="text-[22px] font-semibold tracking-tight text-foreground">
              Also on your journey
            </h2>
            <button
              type="button"
              onClick={() => setLocation('/library')}
              className="shrink-0 pb-0.5 text-[13px] font-semibold text-primary"
            >
              View My Library →
            </button>
          </div>

          <div className="space-y-2.5">
            {activeResources.map(journey => {
              const resourceProgress = progress[journey.id];
              const resourceStep = getStepsForJourney(journey.id)
                .find(step => step.dayNumber === (resourceProgress?.currentDay ?? 1));
              return (
                <button
                  key={journey.id}
                  type="button"
                  onClick={() => setLocation(`/journeys/${journey.id}?source=emmaus`)}
                  className="flex min-h-[78px] w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-primary">
                    <Leaf size={20} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-foreground">{journey.title}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
                      {resourceStep?.title || 'Continue your journey'}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => {
                try { sessionStorage.setItem('emmaus_discover_tab', 'sermons'); } catch { /* ignore */ }
                setLocation('/journeys');
              }}
              className="flex min-h-[78px] w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-50 text-primary">
                <Headphones size={20} aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[16px] font-semibold text-foreground">This Week's Sermon</span>
                <span className="mt-0.5 block text-[13px] text-muted-foreground">Listen when you're ready</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setLocation('/bible')}
          className="mx-auto flex min-h-[52px] w-[min(15rem,80%)] items-center justify-center gap-2 rounded-full border border-primary/40 bg-primary/[0.035] px-5 text-[16px] font-semibold text-primary"
        >
          <BookOpen size={20} aria-hidden="true" />
          My Bible
        </button>
      </main>
      <BottomNav />
    </div>
  );
}
