/**
 * Daily gate — the 10 Minutes with Jesus gating system.
 *
 * Before today's 10 Minutes with Jesus is completed:
 *   - Growth journeys surface a gentle "Complete today's 10 Minutes with Jesus"
 *     CTA instead of their normal primary action.
 *   - No harsh disabling, no guilt language, no errors.
 *
 * After completion the gate clears immediately, reactively — no reload required.
 *
 * Admin override: set requiresDailyGate = false on a Journey to bypass the gate
 * (for pastoral journeys like Crisis Care, Grief Support, Emergency Prayer etc.)
 *
 * Search alias: searching "15 minutes with jesus" also finds "10 minutes with jesus"
 * because the journey ID and tags preserve backward compatibility.
 */

import { useMemo } from 'react';
import { useJourney } from '@/contexts/JourneyContext';
import { isCompletedToday } from './daily-lock';
import type { Journey } from '@/contexts/JourneyContext';

/**
 * Returns true if this journey should respect the daily gate.
 * Exempt types (daily-rhythm/core/companion/devotional) are the gate content themselves.
 * Admin can also disable the gate per journey via requiresDailyGate = false.
 */
export function isGatedByDailyGate(j: Journey): boolean {
  // The 10-min daily rhythm, sermon companion, and daily devotional are never gated —
  // they ARE the core rhythm content.
  if (['daily-rhythm', 'core', 'companion', 'devotional'].includes(j.journeyType)) return false;
  // Admin-marked overload-exempt journeys bypass the gate too.
  if (j.overloadExempt === true) return false;
  // Admin can explicitly disable the gate for pastoral/crisis journeys.
  if (j.requiresDailyGate === false) return false;
  // All other growth journeys are gated by default.
  return true;
}

export interface DailyGateResult {
  /** True when the user has completed today's 10 Minutes with Jesus. */
  gateClear: boolean;
  /** The published daily rhythm journey (10 Minutes with Jesus), if found. */
  coreJourney: Journey | undefined;
}

/**
 * Reactive hook — returns the current gate state.
 * Updates immediately when the user completes today's 10 Minutes with Jesus,
 * because progress comes from JourneyContext which updates on completeStep().
 */
export function useDailyGate(): DailyGateResult {
  const { journeys, progress } = useJourney();

  // Accepts 'daily-rhythm' (current) and 'core' (legacy) for backward compat.
  const coreJourney = useMemo(
    () => journeys.find(
      j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
    ),
    [journeys]
  );

  const coreProg = coreJourney ? progress[coreJourney.id] : undefined;
  const gateClear = isCompletedToday(coreProg?.lastCompletedAt);

  return { gateClear, coreJourney };
}
