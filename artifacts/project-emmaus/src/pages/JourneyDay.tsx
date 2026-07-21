import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function JourneyDay() {
  const { journeyId, day: dayStr } = useParams<{ journeyId: string; day: string }>();
  const day = parseInt(dayStr || '1', 10);
  const [, setLocation] = useLocation();
  const { getStep, completeStep, startJourney, getJourney } = useJourney();

  const step = getStep(journeyId || '', day);
  const journey = getJourney(journeyId || '');

  const [stage, setStage] = useState(0);
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

  const stages = [
    {
      id: 'intro',
      label: 'Introduction',
      content: (
        <div className="space-y-6">
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
              Day {day}
            </span>
            <h1 className="text-[30px] font-serif font-semibold leading-tight">
              {step.title}
            </h1>
          </div>
          <p className="text-[18px] text-foreground leading-[1.65] italic border-l-2 border-primary/25 pl-5">
            {step.mentorIntro}
          </p>
        </div>
      ),
    },
    {
      id: 'scripture',
      label: 'Scripture',
      content: (
        <div className="space-y-4 bg-card rounded-2xl p-6 border border-border shadow-sm">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            The Word
          </h3>
          <p className="font-serif text-[20px] leading-[1.65] text-foreground">
            {step.scripture}
          </p>
          {step.sermonLink && (
            <a
              href={step.sermonLink}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-primary underline underline-offset-2 inline-block mt-2"
            >
              Watch this moment in Sunday's sermon
            </a>
          )}
        </div>
      ),
    },
    {
      id: 'devotional',
      label: 'Reflection',
      content: (
        <div className="space-y-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Reflection
          </h3>
          <p className="text-[18px] leading-[1.65] text-foreground">{step.devotional}</p>
        </div>
      ),
    },
    {
      id: 'response',
      label: 'Your Response',
      content: (
        <div className="space-y-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Consider
          </h3>
          <p className="text-[18px] font-medium text-foreground leading-[1.55]">
            {step.reflectionQuestion}
          </p>
          <Textarea
            placeholder="Write your thoughts here… (Optional)"
            className="min-h-[120px] text-[17px] resize-none rounded-xl mt-2"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            data-testid="input-reflection"
            aria-label="Your reflection"
          />
        </div>
      ),
    },
    {
      id: 'prayer',
      label: 'Prayer',
      content: (
        <div className="space-y-4">
          <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Prayer
          </h3>
          <p className="text-[18px] font-serif italic leading-[1.65] text-foreground">
            "{step.prayerPrompt}"
          </p>
        </div>
      ),
    },
    {
      id: 'action',
      label: 'Today\'s Step',
      content: (
        <div className="space-y-4 bg-accent/10 border border-accent/20 rounded-2xl p-6">
          <h3 className="text-[11px] font-semibold text-primary uppercase tracking-widest">
            Today's Step
          </h3>
          <p className="text-[18px] font-medium text-foreground leading-[1.55]">
            {step.actionStep}
          </p>
        </div>
      ),
    },
  ];

  const handleNext = () => {
    if (stage < stages.length - 1) {
      setStage((s) => s + 1);
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 150);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    setIsCompleting(true);
    completeStep(journey.id, day, reflection);
    setTimeout(() => {
      setLocation('/walk');
    }, 2200);
  };

  if (isCompleting) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="text-center space-y-4"
        >
          <div className="w-16 h-16 bg-primary/15 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={30} strokeWidth={2.5} />
          </div>
          <h2 className="text-[26px] font-serif font-medium">Great job.</h2>
          <p className="text-base text-muted-foreground">See you tomorrow.</p>
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
          <div className="flex-1 text-center font-medium text-sm text-muted-foreground truncate px-4">
            {journey.title}
          </div>
          {/* Step indicator */}
          <div className="text-[13px] font-medium text-muted-foreground whitespace-nowrap">
            {stage + 1} of {stages.length}
          </div>
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-10">
        {stages.slice(0, stage + 1).map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: 'easeOut' }}
          >
            {s.content}
          </motion.div>
        ))}

        <div className="pt-6">
          <Button
            size="lg"
            className="w-full h-14 text-[17px] rounded-2xl"
            onClick={handleNext}
            data-testid="button-journey-continue"
          >
            {stage < stages.length - 1 ? 'Continue' : 'Complete Today'}
          </Button>
        </div>
      </main>
    </div>
  );
}
