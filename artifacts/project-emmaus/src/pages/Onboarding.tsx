/**
 * Onboarding — first-time member experience.
 *
 * Shown once per account (tracked via localStorage 'emmaus_onboarded').
 * Does NOT show on subsequent logins.
 *
 * Flow:
 *   Step 0: "What would you like us to call you?"
 *           Shown only when no name is set.
 *           [Continue] or [Skip for now] → Step 1
 *
 *   Step 1: "Welcome, {firstName}."
 *           "Let's begin by spending 10 Minutes with Jesus."
 *           [Begin 10 Minutes with Jesus] → /daily-rhythm/day/1 (or /walk)
 *
 * On complete: sets emmaus_onboarded = 'true' in localStorage.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { markOnboarded } from '@/lib/onboarding';

export default function Onboarding() {
  const { user, updateName } = useAuth();
  const { journeys, startJourney } = useJourney();
  const [, setLocation] = useLocation();

  // Start on step 0 (name collection) only when no name has been set yet.
  const hasName = !!(user?.preferredName?.trim());
  const [step, setStep] = useState<0 | 1>(hasName ? 1 : 0);
  const [nameInput, setNameInput] = useState('');

  // Derive first name for display — from auth state (updated after updateName)
  // or from the input field as an immediate fallback on the same render cycle.
  const firstName =
    user?.preferredName?.trim().split(' ')[0] ||
    nameInput.trim().split(' ')[0] ||
    undefined;

  const coreJourney = journeys.find(
    j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
  );

  // ── Step 0 handlers ─────────────────────────────────────────────────────────

  function handleNameContinue() {
    const name = nameInput.trim();
    if (name) updateName(name);
    setStep(1);
  }

  // ── Step 1 handler ───────────────────────────────────────────────────────────

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

        {/* ── Step 1: Welcome and begin ─────────────────────────────────────── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="w-full max-w-[380px] space-y-8 text-center"
          >
            <div className="space-y-3">
              <h1 className="text-[36px] font-sans font-medium tracking-tight text-foreground leading-tight">
                {firstName ? `Welcome, ${firstName}.` : 'Welcome.'}
              </h1>
              <p className="text-[18px] text-muted-foreground font-normal leading-relaxed">
                Let's begin by spending 10 Minutes with Jesus.
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
