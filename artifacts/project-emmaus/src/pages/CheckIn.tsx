import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';

const feelings = ['Hopeful', 'Tired', 'Struggling', 'Nervous', 'Afraid', 'Okay'];

const responses: Record<string, string> = {
  Hopeful: "It's good to see you today. Let's keep walking together.",
  Tired: "You don't have to rush today. Let's take one small step together.",
  Struggling: "I'm glad you came. We can take this one step at a time.",
  Nervous: "Whatever's on your mind, you don't have to carry it alone.",
  Afraid: "You're not alone in what you're carrying today. Let's begin gently.",
  Okay: "Sometimes okay is just the right place to begin."
};

export default function CheckIn() {
  const [, setLocation] = useLocation();
  const { user, updateFeeling } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);

  // If already checked in today, could redirect, but let's allow it if they land here manually.

  const handleSelect = (feeling: string) => {
    setSelected(feeling);
    updateFeeling(feeling);
  };

  const handleContinue = () => {
    setLocation('/walk');
  };

  return (
    <div className="min-h-[100dvh] flex flex-col p-6 bg-background pt-24 pb-12">
      <div className="w-full max-w-sm mx-auto flex-1 flex flex-col">
        
        <motion.div 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-2 mb-10"
        >
          <h1 className="text-3xl font-serif font-medium text-foreground tracking-tight">
            How are you feeling today?
          </h1>
          <p className="text-muted-foreground text-lg">
            Be honest. There are no wrong answers here.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-2 gap-4 flex-1 content-start"
        >
          {feelings.map((feeling) => {
            const isSelected = selected === feeling;
            return (
              <button
                key={feeling}
                onClick={() => handleSelect(feeling)}
                className={`
                  p-6 rounded-2xl border text-left transition-all duration-300
                  ${isSelected 
                    ? 'bg-primary border-primary text-primary-foreground shadow-md scale-[1.02]' 
                    : 'bg-card border-border hover:border-primary/30 hover:bg-accent/5'}
                `}
              >
                <span className="font-medium text-lg">{feeling}</span>
              </button>
            )
          })}
        </motion.div>

        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="mt-8 space-y-6"
            >
              <div className="p-6 rounded-2xl bg-accent/10 border border-accent/20">
                <p className="font-serif text-xl leading-relaxed text-foreground">
                  "{responses[selected]}"
                </p>
              </div>
              <Button size="lg" className="w-full" onClick={handleContinue}>
                Let's Begin
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
