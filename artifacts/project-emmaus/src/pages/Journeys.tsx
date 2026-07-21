import React from 'react';
import { BottomNav } from '@/components/BottomNav';
import { useJourney } from '@/contexts/JourneyContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

export default function Journeys() {
  const { journeys, progress } = useJourney();
  const [, setLocation] = useLocation();

  const coreJourneys = journeys.filter(j => j.journeyType === 'core');
  const companionJourneys = journeys.filter(j => j.journeyType === 'companion');

  const upcoming = [
    { title: "Prayer Basics", desc: "A 14-day guide to building a quiet time." },
    { title: "Foundations", desc: "Understanding the core tenets of faith." },
    { title: "Serving", desc: "Discovering your gifts for the body." }
  ];

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-6 pt-12 max-w-lg mx-auto space-y-10">
        
        <header>
          <h1 className="text-3xl font-serif font-medium tracking-tight">Journeys</h1>
        </header>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Active Journey</h2>
          {coreJourneys.map(j => {
            const prog = progress[j.id];
            const currentDay = prog ? prog.currentDay : 1;
            return (
              <Card key={j.id} className="border-border bg-card">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <h3 className="text-xl font-serif font-medium">{j.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{j.description}</p>
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={() => setLocation(`/journey/${j.id}/day/${currentDay}`)}
                  >
                    {prog ? 'Continue Journey' : 'Start Journey'}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">This Week</h2>
          {companionJourneys.map(j => {
            const prog = progress[j.id];
            const currentDay = prog ? prog.currentDay : 1;
            return (
              <Card key={j.id} className="border-border bg-background shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <span className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 block">Sermon Companion</span>
                    <h3 className="text-lg font-serif font-medium">{j.title}</h3>
                  </div>
                  <Button 
                    variant="outline"
                    className="w-full" 
                    onClick={() => setLocation(`/journey/${j.id}/day/${currentDay}`)}
                  >
                    Open
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Available Soon</h2>
          <div className="space-y-3">
            {upcoming.map((u, i) => (
              <div key={i} className="p-4 rounded-xl border border-border bg-background flex items-center justify-between opacity-60">
                <div>
                  <h4 className="font-medium text-foreground">{u.title}</h4>
                  <p className="text-xs text-muted-foreground mt-1">{u.desc}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-semibold bg-muted text-muted-foreground px-2 py-1 rounded-full">Soon</span>
              </div>
            ))}
          </div>
        </section>

      </main>
      <BottomNav />
    </div>
  );
}
