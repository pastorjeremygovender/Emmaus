import React, { useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { BottomNav } from '@/components/BottomNav';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import { format, differenceInDays } from 'date-fns';

export default function Walk() {
  const { user } = useAuth();
  const { journeys, progress, getStep } = useJourney();
  const [, setLocation] = useLocation();

  if (!user) return null; // let App router handle redirect if needed

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const coreJourney = journeys.find(j => j.journeyType === 'core');
  const coreProg = coreJourney ? progress[coreJourney.id] : null;
  const currentDay = coreProg ? coreProg.currentDay : 1;
  const streak = coreProg ? coreProg.completedDays.length : 0;
  
  const companionJourney = journeys.find(j => j.journeyType === 'companion');
  const companionProg = companionJourney ? progress[companionJourney.id] : null;

  const todayStep = coreJourney ? getStep(coreJourney.id, currentDay) : null;
  
  // Welcome back logic
  let welcomeBackMsg = null;
  if (coreProg && coreProg.lastCompletedAt) {
    const daysSince = differenceInDays(new Date(), new Date(coreProg.lastCompletedAt));
    if (daysSince > 2) {
      welcomeBackMsg = "Welcome back. We're glad you're here. Let's take the next step together.";
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {user.role === 'admin' && (
        <div className="bg-primary text-primary-foreground text-xs py-1 text-center font-medium">
          Running in admin mode — <Link href="/admin" className="underline">Go to Admin</Link>
        </div>
      )}

      <main className="px-6 pt-12 max-w-lg mx-auto space-y-8">
        
        <header className="space-y-2">
          <motion.h1 
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-3xl font-serif font-medium tracking-tight"
          >
            {greeting}, {user.preferredName}.
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-muted-foreground"
          >
            {format(new Date(), 'EEEE, MMMM d')}
          </motion.p>
        </header>

        {welcomeBackMsg && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="p-4 rounded-xl bg-accent/10 text-accent-foreground text-sm font-medium border border-accent/20"
          >
            {welcomeBackMsg}
          </motion.div>
        )}

        {/* Primary Journey */}
        {coreJourney && (
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Your Journey</h2>
            <Card className="overflow-hidden border-border bg-card hover:border-primary/30 transition-colors">
              <CardContent className="p-6 space-y-6">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-serif font-semibold">{coreJourney.title}</h3>
                    {streak > 0 && (
                      <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-1 rounded-full">
                        {streak} day{streak !== 1 ? 's' : ''} walking
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">{coreJourney.description}</p>
                </div>

                <div className="bg-background rounded-xl p-4 border border-border space-y-2">
                  <div className="text-xs font-medium text-primary uppercase tracking-wider">Day {currentDay} of {coreJourney.durationDays}</div>
                  <h4 className="font-medium text-foreground">{todayStep?.title || "Next Step"}</h4>
                </div>

                <Button 
                  className="w-full" 
                  onClick={() => setLocation(`/journey/${coreJourney.id}/day/${currentDay}`)}
                >
                  Continue
                </Button>
              </CardContent>
            </Card>
          </section>
        )}

        {/* This Week / Companion */}
        {companionJourney && (
          <section className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">This Week</h2>
            <Card className="border-border bg-background shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div>
                  <h4 className="font-medium text-sm text-primary uppercase tracking-wider mb-1">Continue Sunday's Message</h4>
                  <h3 className="text-lg font-serif font-medium">{companionJourney.sermon?.title}</h3>
                  <p className="text-sm text-muted-foreground mt-2">{companionJourney.description}</p>
                </div>
                
                <div className="flex gap-3">
                  <Button 
                    className="flex-1" 
                    variant="outline"
                    onClick={() => {
                      const day = companionProg ? companionProg.currentDay : 1;
                      setLocation(`/journey/${companionJourney.id}/day/${day}`);
                    }}
                  >
                    Start
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
