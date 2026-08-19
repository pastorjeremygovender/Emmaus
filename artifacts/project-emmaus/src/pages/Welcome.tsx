/**
 * Welcome — Emmaus splash screen.
 *
 * Shows on every fresh launch (new tab, full reload, new browser session).
 * Does NOT repeat during ordinary in-app SPA navigation (tracked via sessionStorage).
 *
 * Flow:
 *   1. Splash appears immediately (~1 s, never longer than 1.5 s).
 *   2. Auth + journey state resolves behind the splash.
 *   3. After MIN_DURATION AND both resolved → gentle fade-out → navigate:
 *        authenticated member  → Today's Walk (/walk)
 *        authenticated admin   → /admin
 *        new member            → /onboarding
 *        unauthenticated       → /auth
 *   4. Subsequent in-app visits to "/" skip the splash and redirect instantly.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { isOnboarded, markOnboarded } from '@/lib/onboarding';
import { resolveEntryRoute, resolveDailyOpenRoute } from '@/lib/entry-route';

const SPLASH_KEY   = 'emmaus_splash_shown';
const MIN_DURATION = 1000; // ms — ~1 second per spec (never longer than 1.5 s)
const FADE_OUT_MS  = 220;  // ms — fade-out before navigate; total ≤ 1.22 s

// ── Component ─────────────────────────────────────────────────────────────────

export default function Welcome() {
  const { user, loading: authLoading, loadingProfile } = useAuth();
  const { journeys, progress, loading: journeyLoading, getStepsForJourney } = useJourney();
  const [, setLocation] = useLocation();

  const alreadyShown = sessionStorage.getItem(SPLASH_KEY) === 'true';

  const [timerDone, setTimerDone] = useState(false);
  const [fading, setFading]       = useState(false);
  const navigatedRef               = useRef(false);

  // ── Fast path: splash already shown this session ──────────────────────────
  useEffect(() => {
    if (!alreadyShown) return;
    if (authLoading || loadingProfile) return;
    if (user) {
      if (user.passwordRecovery) {
        setLocation('/auth/callback?mode=recovery');
        return;
      }
      const pendingJoin = sessionStorage.getItem('pendingInviteToken');
      if (pendingJoin && user.role !== 'admin' && user.role !== 'superAdmin') {
        sessionStorage.removeItem('pendingInviteToken');
        setLocation(`/join/${pendingJoin}`);
        return;
      }
      if (user.role === 'admin' || user.role === 'superAdmin') {
        setLocation('/admin');
      } else if (!isOnboarded(user.id) && !user.preferredName?.trim()) {
        setLocation('/onboarding');
      } else {
        if (!isOnboarded(user.id)) markOnboarded(user.id);
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

  // ── Navigate once timer, auth, profile, and journey data are all ready ────
  useEffect(() => {
    if (alreadyShown) return;
    if (!timerDone || authLoading || loadingProfile || journeyLoading) return;
    if (navigatedRef.current) return;
    navigatedRef.current = true;

    sessionStorage.setItem(SPLASH_KEY, 'true');

    function resolveDestination(): string {
      if (!user) return '/auth';
      if (user.passwordRecovery) return '/auth/callback?mode=recovery';
      const pendingJoin = sessionStorage.getItem('pendingInviteToken');
      if (pendingJoin && user.role !== 'admin' && user.role !== 'superAdmin') {
        sessionStorage.removeItem('pendingInviteToken');
        return `/join/${pendingJoin}`;
      }
      if (user.role === 'admin' || user.role === 'superAdmin') return '/admin';
      if (!isOnboarded(user.id) && !user.preferredName?.trim()) return '/onboarding';
      if (!isOnboarded(user.id)) markOnboarded(user.id);
      // First open of the day → land on the member's current Daily Rhythm step.
      // Subsequent same-day opens → Today's Walk (/walk).
      const dailyRoute = resolveDailyOpenRoute(user.id, journeys, progress, getStepsForJourney);
      const dest = dailyRoute ?? resolveEntryRoute(journeys, progress, getStepsForJourney);
      console.debug('[Emmaus routing] Route selected (splash):', dest);
      return dest;
    }

    const dest = resolveDestination();
    // Fade out, then navigate.
    setFading(true);
    setTimeout(() => setLocation(dest), FADE_OUT_MS);
  }, [alreadyShown, timerDone, authLoading, loadingProfile, journeyLoading, user, journeys, progress, getStepsForJourney]);

  // ── Already shown — render nothing while redirecting ─────────────────────
  if (alreadyShown) return null;

  // ── Splash ────────────────────────────────────────────────────────────────
  //
  // Animation layer reference (logo is 110 × 110 px):
  //   Cross centre  ≈ left 27 %, top 16 %  → (30 px, 18 px)
  //   Road bottom   ≈ left 25 %, top 88 %  → (28 px, 97 px)
  //   y travel cross→road  ≈ 79 px
  //
  return (
    <motion.div
      className="min-h-[100dvh] flex flex-col items-center justify-center bg-white select-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: fading ? 0 : 1 }}
      transition={{ duration: fading ? FADE_OUT_MS / 1000 : 0.38, ease: 'easeOut' }}
    >
      <div className="flex flex-col items-center gap-8">

        {/* ── Logo + animation layers ──────────────────────────────────── */}
        <div
          className="relative"
          style={{ width: 110, height: 110 }}
        >
          {/*
           * Ambient glow — soft mint halo centred on the cross.
           * Extends slightly beyond the logo via negative inset so it shows
           * against the white background as a gentle coloured aura.
           */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.55, 0.30] }}
            transition={{ duration: 0.90, delay: 0.12, ease: 'easeInOut' }}
            aria-hidden="true"
            style={{
              position: 'absolute',
              /* Centre the glow on the cross (27 %, 16 %) */
              left: '27%',
              top: '16%',
              transform: 'translate(-50%, -50%)',
              width: 90,
              height: 90,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(120,230,180,0.50) 0%, rgba(60,200,140,0.22) 45%, transparent 72%)',
              filter: 'blur(18px)',
              zIndex: 0,
              pointerEvents: 'none',
            }}
          />

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.42, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            style={{ position: 'relative', width: '100%', height: '100%', zIndex: 10 }}
          >
            <img
              src="/icon.png"
              alt="Emmaus"
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
            />

            {/*
             * Road light — glowing orb travels from the road base (top 88 %)
             * up to the cross (top 16 %).  y = 0 is the cross position;
             * y = +79 moves it down to the road bottom.
             */}
            <motion.div
              initial={{ y: 79, opacity: 0 }}
              animate={{ y: [79, 32, 0], opacity: [0, 0.95, 0] }}
              transition={{ duration: 0.50, delay: 0.28, ease: 'easeIn' }}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '26%',
                top: '16%',
                transform: 'translate(-50%, -50%)',
                width: 10,
                height: 10,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(160,255,210,0.75) 55%, transparent 100%)',
                filter: 'blur(2.5px)',
                zIndex: 20,
                pointerEvents: 'none',
              }}
            />

            {/* Cross glow — brief white-green pulse once the road light arrives */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.72, 0] }}
              transition={{ duration: 0.38, delay: 0.60, ease: 'easeInOut' }}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '27%',
                top: '15%',
                transform: 'translate(-50%, -50%)',
                width: 48,
                height: 48,
                borderRadius: '50%',
                background:
                  'radial-gradient(circle, rgba(255,255,255,0.88) 0%, rgba(160,255,210,0.45) 50%, transparent 80%)',
                filter: 'blur(9px)',
                zIndex: 20,
                pointerEvents: 'none',
              }}
            />
          </motion.div>
        </div>

        {/* ── Text ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-2">
          <motion.h1
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.50, ease: 'easeOut' }}
            style={{ fontFamily: "'Inter', sans-serif" }}
            className="text-[38px] font-semibold tracking-tight text-gray-900 leading-none"
          >
            Emmaus
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.30, delay: 0.68, ease: 'easeOut' }}
            style={{ fontFamily: "'Inter', sans-serif" }}
            className="text-[13px] text-gray-400 font-medium tracking-wide"
          >
            Isipingo Community Church
          </motion.p>
        </div>

      </div>
    </motion.div>
  );
}
