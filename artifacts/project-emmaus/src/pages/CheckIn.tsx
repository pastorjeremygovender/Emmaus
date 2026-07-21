import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

const feelings = ['Hopeful', 'Tired', 'Struggling', 'Nervous', 'Afraid', 'Okay'];

const responses: Record<string, string> = {
  Hopeful: "It's good to see you today. Let's keep walking together.",
  Tired: "You don't have to rush today. Let's take one small step together.",
  Struggling: "I'm glad you came. We can take this one step at a time.",
  Nervous: "Whatever's on your mind, you don't have to carry it alone.",
  Afraid: "You're not alone in what you're carrying today. Let's begin gently.",
  Okay: "Sometimes okay is just the right place to begin.",
};

export default function CheckIn() {
  const [, setLocation] = useLocation();
  const { updateFeeling } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const prefersReduced = useReducedMotion();

  const handleSelect = (feeling: string) => {
    setSelected(feeling);
    updateFeeling(feeling);
  };

  const handleContinue = () => {
    setIsTransitioning(true);
    const delay = prefersReduced ? 0 : 1100;
    setTimeout(() => {
      setLocation('/walk');
    }, delay);
  };

  if (isTransitioning) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background px-6">
        <motion.div
          key="transition"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: prefersReduced ? 0 : 0.4, ease: 'easeOut' }}
          className="text-center space-y-4 max-w-[320px]"
        >
          <p className="text-xl font-serif text-foreground">Thanks for sharing that.</p>
          <p className="text-base text-muted-foreground">Let's spend some time with Jesus.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background px-6 pt-20 pb-12">
      <div className="w-full max-w-[480px] mx-auto flex-1 flex flex-col">

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2 mb-10"
        >
          <h1 className="text-[30px] font-serif font-medium text-foreground tracking-tight leading-tight">
            How are you feeling today?
          </h1>
          <p className="text-base text-muted-foreground leading-relaxed">
            Be honest. There are no wrong answers here.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="grid grid-cols-2 gap-3"
          role="group"
          aria-label="How are you feeling today?"
        >
          {feelings.map((feeling) => {
            const isSelected = selected === feeling;
            return (
              <button
                key={feeling}
                onClick={() => handleSelect(feeling)}
                aria-pressed={isSelected}
                data-testid={`feeling-${feeling.toLowerCase()}`}
                className={`
                  min-h-[80px] px-5 py-5 rounded-2xl border text-left transition-all duration-200
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2
                  ${isSelected
                    ? 'bg-primary border-primary text-primary-foreground shadow-sm'
                    : 'bg-card border-border text-foreground hover:border-primary/40 hover:bg-card/80'}
                `}
              >
                <span className="font-medium text-[17px] leading-snug">{feeling}</span>
              </button>
            );
          })}
        </motion.div>

        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.35 }}
              className="mt-8 space-y-5"
            >
              <div className="p-6 rounded-2xl bg-accent/10 border border-accent/20">
                <p className="font-serif text-[19px] leading-[1.6] text-foreground">
                  {responses[selected]}
                </p>
              </div>
              <Button
                size="lg"
                className="w-full h-14 text-[17px] rounded-2xl"
                onClick={handleContinue}
                data-testid="button-lets-begin"
              >
                Let's Begin
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
