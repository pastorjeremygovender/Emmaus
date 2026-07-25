import { useLocation, Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { isCompletedToday, isNextDayAvailable } from '@/lib/daily-lock';
import { useMemo } from 'react';

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

  const scripturedays   = completionDates.size;
  const journeyContinued = completionDates.size;

  const items: Array<{ label: string; show: boolean }> = [
    {
      label:
        scripturedays === 0
          ? "Open Scripture to begin your week\u2019s rhythm."
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
              <li
                key={i}
                className="flex items-start gap-2.5 text-[14px] text-foreground leading-snug"
              >
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

// ─── 15 Minutes with Jesus card ───────────────────────────────────────────────
// This is the central daily rhythm card and must be the most prominent element.
function FifteenMinutesCard({
  journey,
  prog,
  onContinue,
}: {
  journey: import('@/contexts/JourneyContext').Journey;
  prog: import('@/contexts/JourneyContext').Progress | undefined;
  onContinue: () => void;
}) {
  const completedToday  = isCompletedToday(prog?.lastCompletedAt);
  const nextDayAvail    = isNextDayAvailable(prog?.lastCompletedAt);
  const currentDay      = prog?.currentDay ?? 1;
  const started         = !!prog;

  let state: 'start' | 'ready' | 'complete' | 'tomorrow';
  if (!started)                          state = 'start';
  else if (completedToday && !nextDayAvail) state = 'complete';
  else if (completedToday)               state = 'tomorrow';
  else                                   state = 'ready';

  const cfg = {
    start:    { label: 'Begin Day 1',       variant: 'default'  as const, disabled: false },
    ready:    {
      label:   prog && prog.completedDays.length > 0
                 ? `Continue Day ${currentDay}`
                 : 'Begin today',
      variant: 'default' as const,
      disabled: false,
    },
    complete: { label: 'Review today',      variant: 'outline'  as const, disabled: false },
    tomorrow: { label: 'Available tomorrow', variant: 'outline' as const, disabled: true  },
  }[state];

  return (
    <div
      className={[
        'rounded-2xl p-6 space-y-4 border',
        state === 'complete' || state === 'tomorrow'
          ? 'bg-card border-border'
          : 'bg-primary/5 border-primary/20',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-primary uppercase tracking-widest">
            15 Minutes with Jesus
          </p>
          <p className="text-[22px] font-medium text-foreground leading-snug">
            {state === 'start'
              ? 'Begin your daily walk'
              : state === 'complete' || state === 'tomorrow'
              ? `Day ${currentDay - 1 > 0 ? currentDay - 1 : currentDay} — Complete`
              : `Day ${currentDay} of ${journey.durationDays}`}
          </p>
        </div>
        {(state === 'complete' || state === 'tomorrow') && (
          <CheckCircle2 size={22} className="text-primary mt-1 shrink-0" />
        )}
      </div>

      {/* Completion message */}
      {state === 'complete' && (
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Today's time with Jesus is complete. Come back tomorrow for the next step.
        </p>
      )}
      {state === 'tomorrow' && (
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Today's time with Jesus is complete. Come back tomorrow for the next step.
        </p>
      )}

      {/* Action */}
      <Button
        className="w-full h-12 rounded-xl text-[16px] font-medium"
        variant={cfg.variant}
        onClick={onContinue}
        disabled={cfg.disabled}
      >
        {cfg.label}
      </Button>
    </div>
  );
}

// ─── This Week's Sermon Devotional card ──────────────────────────────────────
function SermonDevotionalCard({
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
          This Week's Sermon Devotional
        </p>
        <p className="text-[17px] font-medium text-foreground leading-snug">
          {journey.sermon?.title ?? journey.title}
        </p>
        {!started && (
          <p className="text-[13px] text-muted-foreground pt-0.5">
            Five weekday reflections based on Sunday's message.
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

// ─── Daily Devotional card ────────────────────────────────────────────────────
function DailyDevotionalCard({
  journey,
  prog,
  onContinue,
}: {
  journey: import('@/contexts/JourneyContext').Journey;
  prog: import('@/contexts/JourneyContext').Progress | undefined;
  onContinue: () => void;
}) {
  const completedToday = isCompletedToday(prog?.lastCompletedAt);
  const nextDayAvail   = isNextDayAvailable(prog?.lastCompletedAt);
  const currentDay     = prog?.currentDay ?? 1;
  const started        = !!prog;

  let state: 'start' | 'ready' | 'complete' | 'tomorrow';
  if (!started)                              state = 'start';
  else if (completedToday && !nextDayAvail)  state = 'complete';
  else if (completedToday)                   state = 'tomorrow';
  else                                       state = 'ready';

  const cfg = {
    start:    { label: 'Begin today',        variant: 'outline'  as const, disabled: false },
    ready:    { label: 'Continue reading',   variant: 'outline'  as const, disabled: false },
    complete: { label: 'Read again',         variant: 'outline'  as const, disabled: false },
    tomorrow: { label: 'Available tomorrow', variant: 'outline'  as const, disabled: true  },
  }[state];

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="space-y-0.5">
        <p className="text-[11px] font-semibold text-primary uppercase tracking-widest">
          Daily Devotional
        </p>
        <p className="text-[17px] font-medium text-foreground leading-snug">
          {journey.title}
        </p>
        {started && (
          <p className="text-[13px] text-muted-foreground pt-0.5">
            {state === 'complete' || state === 'tomorrow'
              ? 'Completed today'
              : `Day ${currentDay} of ${journey.durationDays}`}
          </p>
        )}
      </div>

      {(state === 'complete' || state === 'tomorrow') && (
        <p className="text-[13px] text-muted-foreground leading-relaxed">
          Today's devotional is complete. Come back tomorrow.
        </p>
      )}

      <Button
        className="w-full h-11 rounded-xl text-[15px]"
        variant={cfg.variant}
        onClick={onContinue}
        disabled={cfg.disabled}
      >
        {cfg.label}
      </Button>
    </div>
  );
}

// ─── Continue journey card ────────────────────────────────────────────────────
function ContinueJourneyCard({
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

      <Button className="w-full h-11 rounded-xl text-[15px]" onClick={onContinue}>
        Continue
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Walk() {
  const { user } = useAuth();
  const { journeys, progress, loading, startJourney } = useJourney();
  const { enrollment, pauseJourney, getState } = useEnrollment();
  const [, setLocation] = useLocation();

  // Hooks must all be called before early returns.
  const publishedJourneys = useMemo(
    () => journeys.filter(j => j.status === 'Published'),
    [journeys]
  );

  if (!user) return null;

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-24">
        <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-8">
          <div className="space-y-1.5 pt-2">
            <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
          </div>
          <SkeletonCard lines={5} />
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </main>
      </div>
    );
  }

  // ── Content resolution ───────────────────────────────────────────────────────

  // 1. Core — 15 Minutes with Jesus
  const coreJourney    = publishedJourneys.find(j => j.journeyType === 'core');
  const coreProg       = coreJourney ? progress[coreJourney.id] : undefined;

  // 2. Companion — This Week's Sermon Devotional
  const companionJourney = publishedJourneys.find(j => j.journeyType === 'companion');
  const companionProg    = companionJourney ? progress[companionJourney.id] : undefined;

  // 3. Devotional — Daily Devotional
  const devotionalJourney = publishedJourneys.find(j => j.journeyType === 'devotional');
  const devotionalProg    = devotionalJourney ? progress[devotionalJourney.id] : undefined;

  // 4. Continue Your Journeys — active non-exempt growth journeys only
  const activeGrowthJourneys = publishedJourneys.filter(
    j =>
      !isExemptJourney(j) &&
      progress[j.id] &&
      getState(j.id) === 'active'
  );

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function goToJourney(journeyId: string, prog?: { currentDay: number }) {
    const day = prog?.currentDay ?? 1;
    if (!progress[journeyId]) startJourney(journeyId);
    setLocation(`/journey/${journeyId}/day/${day}`);
  }

  // ── Greeting ─────────────────────────────────────────────────────────────────

  const hour    = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  // ── Render ───────────────────────────────────────────────────────────────────

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

        {/* ── Greeting ───────────────────────────────────────────────────────── */}
        <header>
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

        {/* ── 1. 15 Minutes with Jesus ───────────────────────────────────────── */}
        {coreJourney ? (
          <motion.section
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05 }}
          >
            <FifteenMinutesCard
              journey={coreJourney}
              prog={coreProg}
              onContinue={() => goToJourney(coreJourney.id, coreProg)}
            />
          </motion.section>
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center">
            <p className="text-[15px] text-muted-foreground">
              We couldn't load this step. Please try again.
            </p>
          </div>
        )}

        {/* ── 2. This Week's Sermon Devotional ───────────────────────────────── */}
        {companionJourney && (
          <motion.section
            className="space-y-3"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.10 }}
          >
            <SermonDevotionalCard
              journey={companionJourney}
              prog={companionProg}
              onContinue={() => goToJourney(companionJourney.id, companionProg)}
            />
          </motion.section>
        )}

        {/* ── 3. Daily Devotional ────────────────────────────────────────────── */}
        {devotionalJourney && (
          <motion.section
            className="space-y-3"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            <DailyDevotionalCard
              journey={devotionalJourney}
              prog={devotionalProg}
              onContinue={() => goToJourney(devotionalJourney.id, devotionalProg)}
            />
          </motion.section>
        )}

        {/* ── 4. Continue Your Journeys ──────────────────────────────────────── */}
        {activeGrowthJourneys.length > 0 && (
          <motion.section
            className="space-y-3"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.20 }}
          >
            <SectionLabel>Continue Your Journeys</SectionLabel>
            <div className="space-y-3">
              {activeGrowthJourneys.map(j => {
                const jProg = progress[j.id]!;
                return (
                  <ContinueJourneyCard
                    key={j.id}
                    journey={j}
                    prog={jProg}
                    onContinue={() => goToJourney(j.id, jProg)}
                    onPause={() => pauseJourney(j.id)}
                  />
                );
              })}
            </div>
          </motion.section>
        )}

        {/* ── 5. This Week ───────────────────────────────────────────────────── */}
        <WeeklyProgress progress={progress} journeys={journeys} />

      </main>

      <BottomNav />
    </div>
  );
}
