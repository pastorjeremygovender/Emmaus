/**
 * Onboarding state utilities.
 * Kept in a separate module so Onboarding.tsx only exports the default component,
 * which allows Vite Fast Refresh to work without full-page reloads.
 */

import { accountStorageKey } from '@/lib/account-storage';

const ONBOARDED_KEY = 'emmaus_onboarded';

export function markOnboarded(subject: string) {
  try {
    localStorage.setItem(accountStorageKey(ONBOARDED_KEY, subject), 'true');
  } catch {
    /* ignore */
  }
}

export function isOnboarded(subject: string): boolean {
  try {
    return localStorage.getItem(accountStorageKey(ONBOARDED_KEY, subject)) === 'true';
  } catch {
    return false;
  }
}
