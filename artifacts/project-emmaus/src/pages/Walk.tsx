import { useLocation, Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { differenceInDays } from 'date-fns';

export default function Walk() {
  const { user } = useAuth();
  const { journeys, progress, getStep } = useJourney();
  const [, setLocation] = useLocation();

  if (!user) return null;

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const coreJourney = journeys.find((j) => j.journeyType === 'core');
  const coreProg = coreJourney ? progress[coreJourney.id] : null;
  const currentDay = coreProg ? coreProg.currentDay : 1;
  const streak = coreProg ? coreProg.completedDays.length : 0;

  const companionJourney = journeys.find((j) => j.journeyType === 'companion');
  const companionProg = companionJourney ? progress[companionJourney.id] : null;
  const companionStarted =
    companionProg && companionProg.completedDays.length > 0;

  const todayStep = coreJourney ? getStep(coreJourney.id, currentDay) : null;

  // Welcome back logic — never mention "lost streak"
  let welcomeBackMsg: string | null = null;
  if (coreProg && coreProg.lastCompletedAt) {
    const daysSince = differenceInDays(
      new Date(),
      new Date(coreProg.lastCompletedAt)
    );
    if (daysSince > 2) {
      welcomeBackMsg =
        "Welcome back. We're glad you're here. Let's take the next step together.";
    }
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

      <main className="px-5 pt-12 max-w-[480px] mx-auto space-y-8">

        {/* Greeting */}
        <header className="space-y-1.5">
          <motion.h1
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="text-[32px] font-serif font-medium tracking-tight leading-tight"
            data-testid="text-greeting"
          >
            {greeting}, {user.preferredName}.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-base text-muted-foreground"
          >
            Let's take the next step together.
          </motion.p>
        </header>

        {/* Welcome back banner */}
        {welcomeBackMsg && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 rounded-xl bg-accent/10 text-foreground text-[15px] leading-relaxed border border-accent/20"
          >
            {welcomeBackMsg}
          </motion.div>
        )}

        {/* Primary Journey */}
        {coreJourney && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Your Journey
            </h2>
            <Card className="overflow-hidden border-border bg-card shadow-sm">
              <CardContent className="p-6 space-y-5">
                <div>
                  <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-2">
                    Day {currentDay} of {coreJourney.durationDays}
                  </div>
                  <h3 className="text-[24px] font-serif font-semibold leading-snug">
                    {todayStep?.title || coreJourney.title}
                  </h3>
                  {todayStep?.mentorIntro && (
                    <p className="text-[15px] text-muted-foreground leading-relaxed mt-2">
                      {todayStep.mentorIntro.split('.')[0]}.
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  {streak > 0 ? (
                    <span className="text-[13px] text-muted-foreground">
                      {streak} day{streak !== 1 ? 's' : ''} walking
                    </span>
                  ) : (
                    <span className="text-[13px] text-muted-foreground">Your walk begins today</span>
                  )}
                  <Button
                    className="rounded-xl px-6 h-11"
                    onClick={() =>
                      setLocation(`/journey/${coreJourney.id}/day/${currentDay}`)
                    }
                    data-testid="button-continue-journey"
                  >
                    Continue
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

        {/* Sermon Companion — This Week at Church */}
        {companionJourney && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              This Week at Church
            </h2>
            <Card className="border border-primary/15 bg-background shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div>
                  <p className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1.5">
                    {companionStarted ? 'Continue Sunday\'s Message' : 'Sunday\'s Message'}
                  </p>
                  <h3 className="text-[20px] font-serif font-medium leading-snug">
                    {companionJourney.sermon?.title || companionJourney.title}
                  </h3>
                  <p className="text-[14px] text-muted-foreground mt-2 leading-relaxed">
                    5 short weekday devotionals based on Sunday's sermon.
                  </p>
                </div>

                <div className="flex gap-3">
                  <Button
                    className="flex-1 rounded-xl h-11"
                    onClick={() => {
                      const day = companionProg ? companionProg.currentDay : 1;
                      setLocation(`/journey/${companionJourney.id}/day/${day}`);
                    }}
                    data-testid="button-companion-start"
                  >
                    {companionStarted ? 'Continue' : 'Start Monday'}
                  </Button>
                  <Button variant="ghost" className="px-4 h-11 text-muted-foreground text-[14px]">
                    Maybe Later
                  </Button>
                </div>
              </CardContent>
            </Card>
          </section>
        )}

      </main>

      <BottomNav />
    </div>
  );
}
