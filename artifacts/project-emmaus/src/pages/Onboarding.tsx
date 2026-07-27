/**
 * Onboarding — first-time member experience.
 *
 * Shown once per account (tracked via localStorage 'emmaus_onboarded').
 * Does NOT show on subsequent logins.
 *
 * Flow:
 *   Step 1: Welcome, {First Name}
 *           What would you like to begin with?
 *           ☑ 10 Minutes with Jesus (pre-selected)
 *           [Explore Journeys] button (optional — opens /journeys/explore)
 *           [Continue] button → Step 2
 *
 *   Step 2: Welcome. Let's begin.
 *           [Begin 10 Minutes with Jesus] → /walk
 *
 * On complete: sets emmaus_onboarded = 'true' in localStorage.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckSquare, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { markOnboarded } from '@/lib/onboarding';

export default function Onboarding() {
  const { user } = useAuth();
  const { journeys, startJourney } = useJourney();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);

  const firstName = user?.preferredName?.split(' ')[0] ?? 'Friend';

  const coreJourney = journeys.find(
    j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
  );

  function handleContinue() {
    setStep(2);
  }

  function handleBegin() {
    markOnboarded();
    if (coreJourney) {
      startJourney(coreJourney.id);
      setLocation('/daily-rhythm/day/1');
    } else {
      setLocation('/walk');
    }
  }

  function handleExploreJourneys() {
    setLocation('/journeys/explore');
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-6">
      <AnimatePresence mode="wait">

        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full max-w-[380px] space-y-8"
          >
            {/* Title */}
            <div className="space-y-2">
              <h1 className="text-[32px] font-sans font-medium tracking-tight text-foreground leading-tight">
                Welcome, {firstName}.
              </h1>
              <p className="text-[17px] text-muted-foreground leading-relaxed">
                What would you like to begin with?
              </p>
            </div>

            {/* 10 Minutes selection — always pre-checked */}
            <div className="rounded-2xl border border-primary/25 bg-primary/5 p-5 space-y-2.5">
              <div className="flex items-start gap-3">
                <CheckSquare size={20} className="text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-[16px] font-medium text-foreground">
                    10 Minutes with Jesus
                  </p>
                  <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
                    A simple daily rhythm of Scripture, reflection and prayer.
                  </p>
                </div>
              </div>
            </div>

            {/* Explore journeys (optional) */}
            <div className="space-y-3">
              <p className="text-[13px] text-muted-foreground text-center">
                You can also explore other Journeys to walk alongside this rhythm.
              </p>
              <button
                onClick={handleExploreJourneys}
                className="w-full h-11 rounded-xl border border-border text-[14px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all flex items-center justify-center gap-2"
              >
                <Square size={15} />
                Explore Journeys
              </button>
            </div>

            <Button
              className="w-full h-12 rounded-xl text-[16px] font-medium"
              onClick={handleContinue}
            >
              Continue
            </Button>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full max-w-[380px] space-y-8 text-center"
          >
            <div className="space-y-3">
              <h1 className="text-[36px] font-sans font-medium tracking-tight text-foreground">
                Welcome.
              </h1>
              <p className="text-[20px] text-muted-foreground font-normal">
                Let's begin.
              </p>
            </div>

            <Button
              className="w-full h-13 rounded-xl text-[17px] font-medium py-3.5"
              onClick={handleBegin}
            >
              Begin 10 Minutes with Jesus
            </Button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
