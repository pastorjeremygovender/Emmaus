import { BottomNav } from '@/components/BottomNav';

/**
 * PreviousDays — lists every Published Daily Rhythm day the member is allowed to revisit.
 *
 * Route: /daily-rhythm/previous
 *
 * Access rules:
 *   - Published steps only (JourneyContext already filters non-Published for members)
 *   - day < member's current unlocked day
 *   - Listed most-recent-first (e.g. Day 3, Day 2, Day 1)
 *
 * Tapping a row opens that day in replay mode via /daily-rhythm/day/:day.
 * Back arrow returns to Today's Steps (/walk).
 */

import { useLocation } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { DevModeBanner } from '@/components/DevModeBanner';

export default function PreviousDays() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { journeys, getStepsForJourney, progress, loading } = useJourney();

  const devMode = isDevelopmentMode(user);

  // Resolve the published Daily Rhythm journey.
  const coreJourney = journeys.find(
    j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
  );
  const journeyId  = coreJourney?.id;
  const currentDay = journeyId ? (progress[journeyId]?.currentDay ?? 1) : 1;

  // In dev mode: show all Published days (admins can revisit any day).
  // In production: only days strictly earlier than the current unlocked day.
  const previousDays = coreJourney
    ? getStepsForJourney(coreJourney.id)
        .filter(s => s.status === 'Published' && (devMode || s.day < currentDay))
        .sort((a, b) => b.day - a.day)
    : [];

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-24">

      {/* Dev mode indicator — shown only to authorised admins with dev mode on */}
      {devMode && <DevModeBanner hidePicker={false} />}

      {/* Sticky nav bar */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => setLocation('/walk')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back to Today's Steps"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0 text-center px-3">
            <div className="font-medium text-sm text-foreground leading-tight">
              10 Minutes with Jesus
            </div>
            <div className="text-[12px] text-muted-foreground">Previous Days</div>
          </div>
          {/* Spacer balances the back arrow */}
          <div className="min-w-[44px]" />
        </div>
      </header>

      <main className="px-5 pt-4 max-w-[480px] mx-auto">

        {previousDays.length === 0 ? (

          /* ── Empty state ────────────────────────────────────────────────── */
          <div className="text-center space-y-5 mt-20">
            <p className="text-[15px] text-muted-foreground">
              No previous days are available yet.
            </p>
            <Button
              variant="outline"
              className="rounded-xl px-8"
              onClick={() => setLocation('/walk')}
            >
              Back to Today's Steps
            </Button>
          </div>

        ) : (

          /* ── Day list ───────────────────────────────────────────────────── */
          <div className="divide-y divide-border/60">
            {previousDays.map(step => (
              <button
                key={step.day}
                onClick={() => setLocation(`/daily-rhythm/day/${step.day}`)}
                className="w-full flex items-center justify-between py-4 px-1 text-left hover:bg-accent/50 transition-colors rounded-lg"
                data-testid={`previous-day-row-${step.day}`}
              >
                <div className="min-w-0">
                  <div className="text-[12px] text-muted-foreground font-medium tracking-wide uppercase">
                    Day {step.day}
                  </div>
                  <div className="text-[16px] font-medium text-foreground mt-0.5 truncate">
                    {step.title}
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground flex-shrink-0 ml-4" />
              </button>
            ))}
          </div>

        )}
      </main>
      <BottomNav />
    </div>
  );
}
