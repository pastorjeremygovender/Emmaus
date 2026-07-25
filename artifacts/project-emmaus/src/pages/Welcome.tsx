/**
 * Welcome — Emmaus splash screen.
 *
 * Shows on every fresh launch (new tab, full reload, new browser session).
 * Does NOT repeat during ordinary in-app SPA navigation (tracked via sessionStorage).
 *
 * Flow:
 *   1. Splash appears immediately.
 *   2. Auth state resolves behind the splash.
 *   3. After ~2 s AND auth resolved → navigate:
 *        authenticated  → /walk
 *        unauthenticated → /auth
 *   4. Subsequent in-app visits to "/" skip the splash and redirect instantly.
 */

import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';

const SPLASH_KEY   = 'emmaus_splash_shown';
const MIN_DURATION = 2000; // ms — minimum visible time even if auth resolves faster

export default function Welcome() {
  const { user, loading } = useAuth();
  const [, setLocation] = useLocation();

  // Has this splash already been shown in the current browser session?
  const alreadyShown = sessionStorage.getItem(SPLASH_KEY) === 'true';

  // Track whether the minimum display time has elapsed.
  const [timerDone, setTimerDone]   = useState(false);
  const navigatedRef                 = useRef(false);

  // ── Fast path: splash already shown this session ──────────────────────────
  useEffect(() => {
    if (!alreadyShown) return;
    if (loading) return;
    // Skip straight to destination without showing splash.
    if (user) {
      setLocation(user.role === 'admin' ? '/admin' : '/walk');
    } else {
      setLocation('/auth');
    }
  }, [alreadyShown, loading, user]);

  // ── Minimum display timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (alreadyShown) return;
    const id = setTimeout(() => setTimerDone(true), MIN_DURATION);
    return () => clearTimeout(id);
  }, [alreadyShown]);

  // ── Navigate once both conditions are met ─────────────────────────────────
  useEffect(() => {
    if (alreadyShown) return;
    if (!timerDone || loading) return;
    if (navigatedRef.current) return;
    navigatedRef.current = true;

    sessionStorage.setItem(SPLASH_KEY, 'true');

    if (user) {
      setLocation(user.role === 'admin' ? '/admin' : '/walk');
    } else {
      setLocation('/auth');
    }
  }, [alreadyShown, timerDone, loading, user]);

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
