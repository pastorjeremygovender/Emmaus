import { useLocation, Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { MessageCircle, ChevronRight, CheckCircle2, Clock, BookOpen, Play } from 'lucide-react';
import { computeNextStep } from '@/lib/next-step-engine';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { isCompletedToday, isNextDayAvailable } from '@/lib/daily-lock';
import { differenceInDays } from 'date-fns';
import { useMemo } from 'react';
import { setReturnDestination } from '@/lib/emmaus-pending';

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-card rounded-2xl border border-border p-6 space-y-3 animate-pulse">
      <div className="h-3 w-24 rounded bg-muted" />
      <div className="h-6 w-3/4 rounded bg-muted" />
      {Array.from({ length: lines - 2 }).map((_, i) => (
        <div key={i} className="h-4 w-full rounded bg-muted" />
      ))}
    </div>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
      {children}
    </h2>
  );
}

// ─── Weekly progress ──────────────────────────────────────────────────────────
function WeeklyProgress({
  progress,
  journeys,
}: {
  progress: Record<string, import('@/contexts/JourneyContext').Progress>;
  journeys: import('@/contexts/JourneyContext').Journey[];
}) {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  // Count how many distinct local-calendar-dates the user completed a step this week.
  const completionDates = new Set<string>();
  let listenedSermon = false;

  for (const j of journeys) {
    const prog = progress[j.id];
    if (!prog?.lastCompletedAt) continue;
    const completedAt = new Date(prog.lastCompletedAt);
    if (completedAt >= monday) {
      completionDates.add(completedAt.toLocaleDateString());
      if (j.journeyType === 'companion') listenedSermon = true;
    }
  }

  const scripturedays = completionDates.size; // rough: each completion = a day with the Word
  const journeyContinued = completionDates.size;

  const items: Array<{ label: string; show: boolean }> = [
    {
      label: scripturedays === 0
        ? "Open Scripture to begin your week's rhythm."
        : `Read Scripture ${scripturedays} day${scripturedays !== 1 ? 's' : ''} this week`,
      show: true,
    },
    {
      label: `Continued a Journey ${journeyContinued} day${journeyContinued !== 1 ? 's' : ''} this week`,
      show: journeyContinued > 0,
    },
    {
      label: "Listened to this week's sermon",
      show: listenedSermon,
    },
  ];

  const shown = items.filter(i => i.show);

  const encouragements = [
    "You're building a steady rhythm. Keep taking the next step.",
    'Every small step matters. Keep going, one day at a time.',
    "You've made space to walk with Jesus. Keep it up.",
    'Faithful steps add up. Well done this week.',
  ];
  const encouragement = encouragements[new Date().getDay() % encouragements.length];

  return (
    <section className="space-y-3">
      <SectionLabel>This week</SectionLabel>
      <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
        {shown.length === 0 ? (
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Your weekly rhythm will appear here as you begin.
          </p>
        ) : (
          <ul className="space-y-2">
            {shown.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[14px] text-foreground leading-snug">
                <CheckCircle2 size={16} className="text-primary mt-0.5 shrink-0" />
                <span>{item.label}</span>
              </li>
            ))}
          </ul>
        )}
        {shown.length > 0 && (
          <p className="text-[13px] text-muted-foreground leading-relaxed border-t border-border pt-3">
            {encouragement}
          </p>
        )}
      </div>
    </section>
  );
}

// ─── 15 Minutes card ─────────────────────────────────────────────────────────
function FifteenMinutesCard({
  journey,
  prog,
  onContinue,
}: {
  journey: import('@/contexts/JourneyContext').Journey;
  prog: import('@/contexts/JourneyContext').Progress | undefined;
  onContinue: () => void;
}) {
  const completedToday = isCompletedToday(prog?.lastCompletedAt);
  const nextDayAvailable = isNextDayAvailable(prog?.lastCompletedAt);
  const currentDay = prog?.currentDay ?? 1;
  const started = !!prog;

  let state: 'start' | 'ready' | 'complete' | 'tomorrow';
  if (!started) state = 'start';
  else if (completedToday && !nextDayAvailable) state = 'complete';
  else if (completedToday) state = 'tomorrow';
  else state = 'ready';

  const stateConfig = {
    start: { label: 'Start Day 1', variant: 'default' as const },
    ready: { label: prog && prog.completedDays.length > 0 ? `Continue Day ${currentDay}` : 'Begin today', variant: 'default' as const },
    complete: { label: 'Read again', variant: 'outline' as const },
    tomorrow: { label: 'Available tomorrow', variant: 'outline' as const },
  };

  const cfg = stateConfig[state];

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-primary uppercase tracking-widest">
            15 Minutes with Jesus
          </p>
          <p className="text-[17px] font-medium text-foreground leading-snug">
            {state === 'start'
              ? 'Begin your daily walk'
              : state === 'complete' || state === 'tomorrow'
              ? `Day ${currentDay - 1} — Complete`
              : `Day ${currentDay} of ${journey.durationDays}`}
          </p>
        </div>
        {state === 'complete' && (
          <CheckCircle2 size={20} className="text-primary mt-1 shrink-0" />
        )}
      </div>

      {state === 'complete' && (
        <p className="text-[13px] text-muted-foreground">
          Today's time with Jesus is complete. Come back tomorrow for the next step.
        </p>
      )}

      <Button
        className="w-full h-11 rounded-xl text-[15px]"
        variant={cfg.variant}
        onClick={onContinue}
        disabled={state === 'tomorrow'}
      >
        {cfg.label}
      </Button>
    </div>
  );
}

// ─── Sermon companion card ────────────────────────────────────────────────────
function SermonCard({
  journey,
  prog,
  onContinue,
}: {
  journey: import('@/contexts/JourneyContext').Journey;
  prog: import('@/contexts/JourneyContext').Progress | undefined;
  onContinue: () => void;
}) {
  const started = prog && prog.completedDays.length > 0;
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="space-y-0.5">
        <p className="text-[11px] font-semibold text-primary uppercase tracking-widest">
          This Week's Sermon
        </p>
        <p className="text-[17px] font-medium text-foreground leading-snug">
          {journey.sermon?.title ?? journey.title}
        </p>
        {!started && (
          <p className="text-[13px] text-muted-foreground pt-0.5">
            5 weekday reflections based on Sunday's message.
          </p>
        )}
        {started && prog && (
          <p className="text-[13px] text-muted-foreground pt-0.5">
            Day {prog.currentDay} of {journey.durationDays}
          </p>
        )}
      </div>
      <Button
        className="w-full h-11 rounded-xl text-[15px]"
        variant={started ? 'default' : 'outline'}
        onClick={onContinue}
      >
        {started ? 'Continue' : 'Start Monday'}
      </Button>
    </div>
  );
}

// ─── Active journey card ──────────────────────────────────────────────────────
function ActiveJourneyCard({
  journey,
  prog,
  onContinue,
  onPause,
}: {
  journey: import('@/contexts/JourneyContext').Journey;
  prog: import('@/contexts/JourneyContext').Progress;
  onContinue: () => void;
  onPause: () => void;
}) {
  const pct = Math.round((prog.completedDays.length / (journey.durationDays || 1)) * 100);
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5 flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Journey
          </p>
          <h3 className="text-[17px] font-medium text-foreground leading-snug truncate">
            {journey.title}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            Step {prog.currentDay} of {journey.durationDays}
          </p>
        </div>
        <button
          onClick={onPause}
          className="text-[12px] text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
          aria-label="Pause journey"
        >
          Pause
        </button>
      </div>

      {pct > 0 && (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <Button
        className="w-full h-11 rounded-xl text-[15px]"
        onClick={onContinue}
      >
        Continue where you stopped
      </Button>
    </div>
  );
}

// ─── Ready for you card ───────────────────────────────────────────────────────
function ReadyForYouCard({
  nextStep,
  onGo,
}: {
  nextStep: ReturnType<typeof computeNextStep>['primary'];
  onGo: () => void;
}) {
  if (!nextStep) {
    return (
      <div className="bg-card rounded-2xl border border-dashed border-border p-6 text-center space-y-2">
        <p className="text-[16px] font-medium text-foreground">You're all caught up for today.</p>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          You can revisit today's Scripture or continue another Journey.
        </p>
      </div>
    );
  }

  const iconMap: Record<string, React.ReactNode> = {
    core: <Clock size={18} className="text-primary" />,
    companion: <Play size={18} className="text-primary" />,
    growth: <BookOpen size={18} className="text-primary" />,
    'church-wide': <BookOpen size={18} className="text-primary" />,
    browse: <ChevronRight size={18} className="text-primary" />,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-primary/5 border border-primary/15 rounded-2xl p-6 space-y-4"
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold text-primary uppercase tracking-widest">
        {iconMap[nextStep.type]}
        {nextStep.label}
      </div>

      <div className="space-y-1.5">
        <h3 className="text-[22px] font-medium text-foreground leading-snug">
          {nextStep.title}
        </h3>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          {nextStep.description}
        </p>
      </div>

      <div className="flex items-center gap-3">
        {nextStep.estimatedTime && (
          <span className="text-[13px] text-muted-foreground flex items-center gap-1.5">
            <Clock size={13} />
            {nextStep.estimatedTime}
          </span>
        )}
        {nextStep.progressPercent !== undefined && nextStep.progressPercent > 0 && (
          <span className="text-[13px] text-muted-foreground">
            {nextStep.progressPercent}% complete
          </span>
        )}
      </div>

      <Button
        className="w-full h-12 rounded-xl text-[16px] font-medium"
        onClick={onGo}
        data-testid="button-ready-for-you"
      >
        {nextStep.buttonText}
      </Button>
    </motion.div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Walk() {
  const { user } = useAuth();
  const { journeys, progress, loading, startJourney } = useJourney();
  const { enrollment, pauseJourney, getState } = useEnrollment();
  const [, setLocation] = useLocation();

  // All hooks must be called unconditionally before any early returns.
  const startedIds = useMemo(() => new Set(Object.keys(progress)), [progress]);
  const { primary: nextStep } = useMemo(
    () => computeNextStep(journeys, progress, enrollment),
    [journeys, progress, enrollment]
  );

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-24">
        <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-8">
          <div className="space-y-1.5 pt-2">
            <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
          </div>
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </main>
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const publishedJourneys = journeys.filter(j => j.status === 'Published');

  const coreJourney = publishedJourneys.find(j => j.journeyType === 'core');
  const coreProg = coreJourney ? progress[coreJourney.id] : undefined;

  const companionJourney = publishedJourneys.find(j => j.journeyType === 'companion');
  const companionProg = companionJourney ? progress[companionJourney.id] : undefined;

  // Active growth journeys (non-exempt, started, not paused)
  const activeGrowthJourneys = publishedJourneys.filter(
    j =>
      !isExemptJourney(j) &&
      progress[j.id] &&
      getState(j.id) === 'active'
  );

  // Welcome-back message (no guilt, no streak language)
  let welcomeBackMsg: string | null = null;
  if (coreProg?.lastCompletedAt) {
    const daysSince = differenceInDays(new Date(), new Date(coreProg.lastCompletedAt));
    if (daysSince > 2) {
      welcomeBackMsg = "Welcome back. We're glad you're here. Let's take the next step together.";
    }
  }

  // Navigation helpers
  function goToJourney(journeyId: string, prog?: { currentDay: number }) {
    const day = prog?.currentDay ?? 1;
    if (!progress[journeyId]) startJourney(journeyId);
    setLocation(`/journey/${journeyId}/day/${day}`);
  }

  function goToNextStep() {
    if (!nextStep) return;
    const j = nextStep.journey;
    if (!progress[j.id]) startJourney(j.id);
    setLocation(`/journey/${j.id}/day/${nextStep.day}`);
  }

  function openAskEmmaus() {
    setReturnDestination({ pathname: '/walk', scrollY: 0, sourceSection: 'walk' });
    setLocation('/personal/ask-emmaus');
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {user.role === 'admin' && (
        <div className="bg-primary text-primary-foreground text-xs py-1.5 text-center font-medium">
          Admin mode —{' '}
          <Link href="/admin" className="underline">
            Go to Admin
          </Link>
        </div>
      )}

      <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-8">

        {/* Greeting */}
        <header className="space-y-1">
          <motion.h1
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="text-[30px] font-sans font-medium tracking-tight leading-tight text-foreground"
            data-testid="text-greeting"
          >
            {greeting}, {user.preferredName}.
          </motion.h1>
        </header>

        {/* Welcome back banner */}
        {welcomeBackMsg && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 rounded-xl bg-accent/10 text-foreground text-[14px] leading-relaxed border border-accent/20"
          >
            {welcomeBackMsg}
          </motion.div>
        )}

        {/* Ready for you */}
        <section className="space-y-3">
          <SectionLabel>Ready for you</SectionLabel>
          <ReadyForYouCard nextStep={nextStep} onGo={goToNextStep} />
        </section>

        {/* 15 Minutes with Jesus */}
        {coreJourney && (
          <section className="space-y-3">
            <SectionLabel>15 Minutes with Jesus</SectionLabel>
            <FifteenMinutesCard
              journey={coreJourney}
              prog={coreProg}
              onContinue={() => goToJourney(coreJourney.id, coreProg)}
            />
          </section>
        )}

        {/* This Week's Sermon companion */}
        {companionJourney && (
          <section className="space-y-3">
            <SectionLabel>This Week's Sermon</SectionLabel>
            <SermonCard
              journey={companionJourney}
              prog={companionProg}
              onContinue={() => goToJourney(companionJourney.id, companionProg)}
            />
          </section>
        )}

        {/* Active growth journeys */}
        {activeGrowthJourneys.length > 0 && (
          <section className="space-y-3">
            <SectionLabel>Active Journeys</SectionLabel>
            <div className="space-y-3">
              {activeGrowthJourneys.map(j => {
                const prog = progress[j.id]!;
                return (
                  <ActiveJourneyCard
                    key={j.id}
                    journey={j}
                    prog={prog}
                    onContinue={() => goToJourney(j.id, prog)}
                    onPause={() => pauseJourney(j.id)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* Ask Emmaus */}
        <section className="space-y-3">
          <SectionLabel>Ask Emmaus</SectionLabel>
          <button
            onClick={openAskEmmaus}
            className="w-full text-left bg-card rounded-2xl border border-border p-5 hover:border-primary/30 transition-all group"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <MessageCircle size={19} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-medium text-foreground">Ask Emmaus</p>
                <p className="text-[13px] text-muted-foreground mt-0.5">
                  Questions about Scripture, faith, or your next step.
                </p>
              </div>
              <ChevronRight
                size={18}
                className="text-muted-foreground group-hover:text-primary transition-colors shrink-0"
              />
            </div>
          </button>
        </section>

        {/* This week */}
        <WeeklyProgress progress={progress} journeys={journeys} />

        {/* Browse journeys link */}
        <div className="pb-4 flex justify-center">
          <Link
            href="/journeys"
            className="text-[14px] text-primary font-medium hover:underline flex items-center gap-1"
          >
            Browse Journeys <ChevronRight size={14} />
          </Link>
        </div>

      </main>

      <BottomNav />
    </div>
  );
}
