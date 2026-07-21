import { BottomNav } from '@/components/BottomNav';
import { useJourney } from '@/contexts/JourneyContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

export default function Journeys() {
  const { journeys, progress } = useJourney();
  const [, setLocation] = useLocation();

  const coreJourneys = journeys.filter((j) => j.journeyType === 'core');
  const companionJourneys = journeys.filter((j) => j.journeyType === 'companion');

  const upcoming = [
    { title: 'Prayer Basics', desc: 'A 14-day guide to building a quiet time.' },
    { title: 'Foundations', desc: 'Understanding the core tenets of faith.' },
    { title: 'Serving', desc: 'Discovering your gifts for the body.' },
  ];

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-5 pt-12 max-w-[480px] mx-auto space-y-10">

        <header>
          <h1 className="text-[30px] font-serif font-medium tracking-tight">Journeys</h1>
        </header>

        {/* Active Journey — visually prominent */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Active Journey
          </h2>
          {coreJourneys.map((j) => {
            const prog = progress[j.id];
            const currentDay = prog ? prog.currentDay : 1;
            const completedCount = prog ? prog.completedDays.length : 0;
            return (
              <Card key={j.id} className="border-border bg-card shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <div>
                    {prog && (
                      <div className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1.5">
                        Day {currentDay} of {j.durationDays}
                      </div>
                    )}
                    <h3 className="text-[22px] font-serif font-semibold leading-snug">{j.title}</h3>
                    <p className="text-[15px] text-muted-foreground mt-1.5 leading-relaxed">
                      {j.description}
                    </p>
                    {completedCount > 0 && (
                      <p className="text-[13px] text-muted-foreground mt-1">
                        {completedCount} day{completedCount !== 1 ? 's' : ''} completed
                      </p>
                    )}
                  </div>
                  <Button
                    className="w-full h-11 rounded-xl text-base"
                    onClick={() => setLocation(`/journey/${j.id}/day/${currentDay}`)}
                    data-testid={`button-journey-${j.id}`}
                  >
                    {prog ? 'Continue Journey' : 'Start Journey'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* This Week — Companion */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            This Week
          </h2>
          {companionJourneys.map((j) => {
            const prog = progress[j.id];
            const currentDay = prog ? prog.currentDay : 1;
            const started = prog && prog.completedDays.length > 0;
            return (
              <Card key={j.id} className="border border-primary/15 bg-background shadow-sm">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1.5 block">
                      Sermon Companion
                    </span>
                    <h3 className="text-[20px] font-serif font-medium leading-snug">{j.title}</h3>
                    <p className="text-[14px] text-muted-foreground mt-1.5 leading-relaxed">
                      {j.description}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="w-full h-11 rounded-xl text-base"
                    onClick={() => setLocation(`/journey/${j.id}/day/${currentDay}`)}
                    data-testid={`button-companion-${j.id}`}
                  >
                    {started ? 'Continue' : 'Start Monday'}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Available Soon */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Available Journeys
          </h2>
          <div className="space-y-2.5">
            {upcoming.map((u, i) => (
              <div
                key={i}
                className="p-4 rounded-xl border border-border bg-background flex items-center justify-between opacity-55"
                aria-disabled="true"
              >
                <div>
                  <h4 className="font-medium text-[16px] text-foreground">{u.title}</h4>
                  <p className="text-[13px] text-muted-foreground mt-0.5">{u.desc}</p>
                </div>
                <span className="text-[10px] uppercase tracking-wider font-semibold bg-muted text-muted-foreground px-2.5 py-1 rounded-full ml-3 shrink-0">
                  Coming soon
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Completed */}
        <section className="space-y-3 pb-4">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Completed Journeys
          </h2>
          <div className="p-8 border border-dashed border-border rounded-2xl text-center">
            <p className="text-[15px] text-muted-foreground">
              Completed journeys will appear here.
            </p>
          </div>
        </section>

      </main>
      <BottomNav />
    </div>
  );
}
