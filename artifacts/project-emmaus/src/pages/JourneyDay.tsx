import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Check, PlayCircle } from 'lucide-react';
import { motion } from 'framer-motion';

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function JourneyDay() {
  const { journeyId, day: dayStr } = useParams<{ journeyId: string; day: string }>();
  const day = parseInt(dayStr || '1', 10);
  const [, setLocation] = useLocation();
  const { getStep, completeStep, startJourney, getJourney } = useJourney();

  const step = getStep(journeyId || '', day);
  const journey = getJourney(journeyId || '');

  const [reflection, setReflection] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);

  useEffect(() => {
    if (journeyId) startJourney(journeyId);
    window.scrollTo(0, 0);
  }, [journeyId]);

  if (!step || !journey) {
    return (
      <div className="p-6 text-center mt-20 text-muted-foreground">
        Journey step not found.
      </div>
    );
  }

  const isCompanion = journey.journeyType === 'companion';
  const hasSermon = isCompanion && (step as any).sermonTimestampSeconds != null;

  const handleComplete = () => {
    setIsCompleting(true);
    completeStep(journey.id, day, reflection);
  };

  if (isCompleting) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-4 max-w-[320px]"
        >
          <div className="w-16 h-16 bg-primary/15 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={30} strokeWidth={2.5} />
          </div>
          <h2 className="text-[26px] font-serif font-medium">Great job.</h2>
          <p className="text-base text-muted-foreground">See you tomorrow.</p>
          <div className="pt-6">
            <Button
              variant="outline"
              className="rounded-xl px-8"
              onClick={() => setLocation('/walk')}
            >
              Back to Walk
            </Button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-32">
      {/* Sticky header */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => setLocation('/walk')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back to Walk"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0 text-center px-3">
            <div className="font-medium text-sm text-foreground truncate leading-tight">
              {journey.title}
            </div>
            <div className="text-[12px] text-muted-foreground">
              Day {day} of {journey.durationDays}
            </div>
          </div>
          {/* spacer to balance the back arrow */}
          <div className="min-w-[44px]" />
        </div>
      </header>

      <main className="px-5 pt-10 max-w-[480px] mx-auto">

        {/* Day label + title */}
        <section className="mb-10">
          <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
            Day {day}
          </span>
          <h1 className="mt-2 text-[32px] font-serif font-semibold leading-tight">
            {step.title}
          </h1>
        </section>

        {/* Mentor introduction */}
        <section className="mb-10">
          <p className="text-[18px] text-foreground leading-[1.7] italic border-l-2 border-primary/25 pl-5">
            {step.mentorIntro}
          </p>
        </section>

        {/* Scripture */}
        <section className="mb-10">
          <SectionLabel>The Word</SectionLabel>
          <div className="mt-4 bg-card rounded-2xl p-6 border border-border shadow-sm">
            <p className="font-serif text-[19px] leading-[1.7] text-foreground">
              {step.scripture}
            </p>
          </div>
        </section>

        {/* Devotional reflection */}
        <section className="mb-10">
          <SectionLabel>Reflection</SectionLabel>
          <p className="mt-4 text-[18px] leading-[1.7] text-foreground">
            {step.devotional}
          </p>
        </section>

        {/* Sermon moment — placed here for companion journeys */}
        {hasSermon && (
          <section className="mb-10">
            <SectionLabel>Sermon Moment</SectionLabel>
            <div className="mt-4 bg-card rounded-2xl p-5 border border-border shadow-sm space-y-3">
              <p className="text-[17px] text-foreground leading-[1.6]">
                This moment in Sunday's sermon connects directly with today's reflection.
              </p>
              <a
                href={(step as any).sermonLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-primary font-medium text-[15px] hover:underline"
                aria-label={`Watch sermon from ${formatTimestamp((step as any).sermonTimestampSeconds)}`}
              >
                <PlayCircle size={18} className="shrink-0" />
                Watch from {formatTimestamp((step as any).sermonTimestampSeconds)}
              </a>
            </div>
          </section>
        )}

        {/* Reflection question + optional response */}
        <section className="mb-10">
          <SectionLabel>Consider</SectionLabel>
          <p className="mt-4 text-[18px] font-medium text-foreground leading-[1.6]">
            {step.reflectionQuestion}
          </p>
          <Textarea
            placeholder="What stood out to you today?"
            className="mt-4 min-h-[120px] text-[17px] resize-none rounded-xl"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            data-testid="input-reflection"
            aria-label="Your reflection"
          />
        </section>

        {/* Prayer */}
        <section className="mb-10">
          <SectionLabel>Prayer</SectionLabel>
          <p className="mt-4 text-[18px] font-serif italic leading-[1.7] text-foreground">
            "{step.prayerPrompt}"
          </p>
        </section>

        {/* Action step */}
        <section className="mb-10">
          <SectionLabel primary>Today's Step</SectionLabel>
          <div className="mt-4 bg-accent/10 border border-accent/20 rounded-2xl p-6">
            <p className="text-[18px] font-medium text-foreground leading-[1.6]">
              {step.actionStep}
            </p>
          </div>
        </section>

        {/* Single completion button */}
        <div className="pt-2 pb-8">
          <Button
            size="lg"
            className="w-full h-14 text-[17px] rounded-2xl"
            onClick={handleComplete}
            data-testid="button-complete-today"
          >
            Complete Today
          </Button>
        </div>

      </main>
    </div>
  );
}

function SectionLabel({ children, primary }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <h2
      className={
        'text-[11px] font-semibold uppercase tracking-widest ' +
        (primary ? 'text-primary' : 'text-muted-foreground')
      }
    >
      {children}
    </h2>
  );
}
