/**
 * Onboarding state utilities.
 * Kept in a separate module so Onboarding.tsx only exports the default component,
 * which allows Vite Fast Refresh to work without full-page reloads.
 */

const ONBOARDED_KEY = 'emmaus_onboarded';

export function markOnboarded() {
  try { localStorage.setItem(ONBOARDED_KEY, 'true'); } catch { /* ignore */ }
}

export function isOnboarded(): boolean {
  try { return localStorage.getItem(ONBOARDED_KEY) === 'true'; } catch { return false; }
}
