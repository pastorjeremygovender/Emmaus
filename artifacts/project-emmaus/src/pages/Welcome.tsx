/**
 * Welcome — Emmaus splash screen.
 *
 * Shows on every fresh launch (new tab, full reload, new browser session).
 * Does NOT repeat during ordinary in-app SPA navigation (tracked via sessionStorage).
 *
 * Flow:
 *   1. Splash appears immediately.
 *   2. Auth + journey state resolves behind the splash.
 *   3. After ~2 s AND both resolved → navigate:
 *        authenticated member  → Today's Walk (/walk) — always, on every normal launch
 *        authenticated admin   → /admin
 *        new member            → /onboarding
 *        unauthenticated       → /auth
 *   4. Subsequent in-app visits to "/" skip the splash and redirect instantly.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { isOnboarded, markOnboarded } from '@/lib/onboarding';
import { resolveEntryRoute } from '@/lib/entry-route';

const SPLASH_KEY   = 'emmaus_splash_shown';
const MIN_DURATION = 2000; // ms — minimum visible time even if auth resolves faster

export default function Welcome() {
  const { user, loading: authLoading, loadingProfile } = useAuth();
  const { journeys, progress, loading: journeyLoading, getStepsForJourney } = useJourney();
  const [, setLocation] = useLocation();

  // Has this splash already been shown in the current browser session?
  const alreadyShown = sessionStorage.getItem(SPLASH_KEY) === 'true';

  // Track whether the minimum display time has elapsed.
  const [timerDone, setTimerDone]   = useState(false);
  const navigatedRef                 = useRef(false);

  // ── Fast path: splash already shown this session ──────────────────────────
  // Journey context is already loaded (same session), so we can resolve the day.
  // We also wait for loadingProfile so that a server-restored name can prevent
  // the onboarding name-prompt from appearing for members who already set one.
  useEffect(() => {
    if (!alreadyShown) return;
    if (authLoading || loadingProfile) return;
    if (user) {
      if (user.role === 'admin' || user.role === 'superAdmin') {
        setLocation('/admin');
      } else if (!isOnboarded() && !user.preferredName?.trim()) {
        // Only show onboarding when the member genuinely has no saved name.
        // If the server restored a name (after a localStorage clear), skip it.
        setLocation('/onboarding');
      } else {
        // If onboarding flag was lost but name survived via server, restore flag.
        if (!isOnboarded()) markOnboarded();
        console.debug('[Emmaus routing] Route selected:', resolveEntryRoute(journeys, progress, getStepsForJourney));
        setLocation(resolveEntryRoute(journeys, progress, getStepsForJourney));
      }
    } else {
      setLocation('/auth');
    }
  }, [alreadyShown, authLoading, loadingProfile, user, journeys, progress, getStepsForJourney]);

  // ── Minimum display timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (alreadyShown) return;
    const id = setTimeout(() => setTimerDone(true), MIN_DURATION);
    return () => clearTimeout(id);
  }, [alreadyShown]);

  // ── Navigate once splash timer, auth, profile, AND journey data are all ready ──
  // loadingProfile is typically <100 ms on a good connection and runs inside the
  // 2-second minimum splash window, so it adds no visible delay.
  useEffect(() => {
    if (alreadyShown) return;
    if (!timerDone || authLoading || loadingProfile || journeyLoading) return;
    if (navigatedRef.current) return;
    navigatedRef.current = true;

    sessionStorage.setItem(SPLASH_KEY, 'true');

    if (user) {
      if (user.role === 'admin' || user.role === 'superAdmin') {
        setLocation('/admin');
      } else if (!isOnboarded() && !user.preferredName?.trim()) {
        // Only show onboarding when the member genuinely has no saved name.
        setLocation('/onboarding');
      } else {
        if (!isOnboarded()) markOnboarded();
        const dest = resolveEntryRoute(journeys, progress, getStepsForJourney);
        console.debug('[Emmaus routing] Route selected (splash):', dest);
        setLocation(dest);
      }
    } else {
      setLocation('/auth');
    }
  }, [alreadyShown, timerDone, authLoading, loadingProfile, journeyLoading, user, journeys, progress, getStepsForJourney]);

  // ── If already shown, render nothing while redirecting ───────────────────
  if (alreadyShown) return null;

  // ── Splash ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background">
      <AnimatePresence>
        <motion.div
          key="splash"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="flex flex-col items-center gap-4 text-center select-none"
        >
          <h1 className="text-[42px] leading-none font-sans font-medium tracking-tight text-foreground">
            Emmaus
          </h1>
          <p className="text-[18px] text-muted-foreground font-sans font-normal leading-relaxed">
            Walk with Jesus
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
