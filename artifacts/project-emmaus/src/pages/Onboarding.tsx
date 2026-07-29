/**
 * Onboarding — first-time member experience.
 *
 * Shown once per account (tracked via localStorage 'emmaus_onboarded').
 * Does NOT show on subsequent logins.
 *
 * Flow:
 *   Step 0: "What would you like us to call you?" — shown only when no name is set.
 *           Input: First name
 *           [Continue] button → Step 1
 *
 *   Step 1: Welcome, {firstName}. (or just "Welcome." if no name was given)
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
  const { user, updateName } = useAuth();
  const { journeys, startJourney } = useJourney();
  const [, setLocation] = useLocation();

  // Determine whether name is already known from auth / profile.
  // Start on step 0 (name collection) only when no name has been set.
  const hasName = !!(user?.preferredName?.trim());
  const [step, setStep] = useState<0 | 1 | 2>(hasName ? 1 : 0);
  const [nameInput, setNameInput] = useState('');

  // Derive first name for display (safe — never falls back to 'Friend')
  const firstName = user?.preferredName?.trim().split(' ')[0] || nameInput.trim().split(' ')[0] || undefined;

  const coreJourney = journeys.find(
    j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
  );

  // ── Step 0 handlers ─────────────────────────────────────────────────────────

  function handleNameContinue() {
    const name = nameInput.trim();
    if (name) {
      updateName(name);
    }
    setStep(1);
  }

  // ── Step 1 handlers ─────────────────────────────────────────────────────────

  function handleContinue() {
    setStep(2);
  }

  function handleExploreJourneys() {
    setLocation('/journeys/explore');
  }

  // ── Step 2 handler ───────────────────────────────────────────────────────────

  function handleBegin() {
    markOnboarded();
    if (coreJourney) {
      startJourney(coreJourney.id);
      setLocation('/daily-rhythm/day/1');
    } else {
      setLocation('/walk');
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center px-6">
      <AnimatePresence mode="wait">

        {/* ── Step 0: Name collection ──────────────────────────────────────── */}
        {step === 0 && (
          <motion.div
            key="step0"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full max-w-[380px] space-y-8"
          >
            <div className="space-y-2">
              <h1 className="text-[32px] font-sans font-medium tracking-tight text-foreground leading-tight">
                What would you like us to call you?
              </h1>
              <p className="text-[17px] text-muted-foreground leading-relaxed">
                We'll use your name to personalise your experience.
              </p>
            </div>

            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && nameInput.trim() && handleNameContinue()}
              placeholder="First name"
              autoFocus
              className="w-full h-12 px-4 rounded-xl border border-input bg-background text-[16px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-all"
            />

            <div className="space-y-3">
              <Button
                className="w-full h-12 rounded-xl text-[16px] font-medium"
                onClick={handleNameContinue}
                disabled={!nameInput.trim()}
              >
                Continue
              </Button>
              <button
                onClick={() => setStep(1)}
                className="w-full text-center text-[14px] text-muted-foreground hover:text-foreground transition-colors py-1"
              >
                Skip for now
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Step 1: Choose what to begin ─────────────────────────────────── */}
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
                {firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
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

        {/* ── Step 2: Begin ────────────────────────────────────────────────── */}
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
