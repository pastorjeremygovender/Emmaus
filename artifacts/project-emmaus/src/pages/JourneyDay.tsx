import React, { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useJourney } from '@/contexts/JourneyContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function JourneyDay() {
  const { journeyId, day: dayStr } = useParams<{ journeyId: string, day: string }>();
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
    return <div className="p-6 text-center mt-20">Journey step not found.</div>;
  }

  const handleNext = () => {
    if (stage < stages.length - 1) {
      setStage(s => s + 1);
      setTimeout(() => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      }, 100);
    } else {
      handleComplete();
    }
  };

  const handleComplete = () => {
    setIsCompleting(true);
    completeStep(journey.id, day, reflection);
    setTimeout(() => {
      setLocation('/walk');
    }, 2000);
  };

  const stages = [
    {
      id: 'intro',
      content: (
        <div className="space-y-6">
          <div className="space-y-2">
            <span className="text-primary font-medium text-sm tracking-wider uppercase">Day {day}</span>
            <h1 className="text-3xl font-serif font-semibold leading-tight">{step.title}</h1>
          </div>
          <p className="text-lg text-muted-foreground leading-relaxed italic border-l-2 border-primary/20 pl-4">
            {step.mentorIntro}
          </p>
        </div>
      )
    },
    {
      id: 'scripture',
      content: (
        <div className="space-y-4 bg-card rounded-2xl p-6 border border-border shadow-sm">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">The Word</h3>
          <p className="font-serif text-xl leading-relaxed">{step.scripture}</p>
          {step.sermonLink && (
            <a href={step.sermonLink} target="_blank" rel="noreferrer" className="text-sm text-primary underline block mt-4">
              Watch this moment in Sunday's sermon
            </a>
          )}
        </div>
      )
    },
    {
      id: 'devotional',
      content: (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reflection</h3>
          <p className="text-lg leading-relaxed">{step.devotional}</p>
        </div>
      )
    },
    {
      id: 'response',
      content: (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Consider</h3>
          <p className="text-lg font-medium">{step.reflectionQuestion}</p>
          <Textarea 
            placeholder="Write your thoughts here... (Optional)"
            className="min-h-[120px] text-base resize-none"
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
          />
        </div>
      )
    },
    {
      id: 'prayer',
      content: (
        <div className="space-y-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prayer</h3>
          <p className="text-lg font-serif italic leading-relaxed text-muted-foreground">"{step.prayerPrompt}"</p>
        </div>
      )
    },
    {
      id: 'action',
      content: (
        <div className="space-y-4 bg-accent/10 border border-accent/20 rounded-2xl p-6">
          <h3 className="text-xs font-semibold text-accent uppercase tracking-wider">Today's Step</h3>
          <p className="text-lg font-medium text-foreground">{step.actionStep}</p>
        </div>
      )
    }
  ];

  if (isCompleting) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center space-y-4"
        >
          <div className="w-16 h-16 bg-primary/20 text-primary rounded-full flex items-center justify-center mx-auto mb-6">
            <Check size={32} />
          </div>
          <h2 className="text-2xl font-serif font-medium">Great job.</h2>
          <p className="text-muted-foreground">See you tomorrow.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-32">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-lg mx-auto">
          <button 
            onClick={() => setLocation('/walk')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="flex-1 text-center font-medium text-sm text-muted-foreground truncate px-4">
            {journey.title}
          </div>
          <div className="w-10"></div> {/* balance */}
        </div>
        {/* Progress bar */}
        <div className="h-1 bg-border w-full">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out" 
            style={{ width: `${((stage + 1) / stages.length) * 100}%` }}
          />
        </div>
      </header>

      <main className="px-6 pt-8 max-w-lg mx-auto space-y-12">
        {stages.slice(0, stage + 1).map((s, i) => (
          <motion.div
            key={s.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
            {s.content}
          </motion.div>
        ))}
        
        <div className="pt-8">
          <Button 
            size="lg" 
            className="w-full text-md h-14" 
            onClick={handleNext}
          >
            {stage < stages.length - 1 ? 'Continue' : 'Complete Today'}
          </Button>
        </div>
      </main>
    </div>
  );
}
