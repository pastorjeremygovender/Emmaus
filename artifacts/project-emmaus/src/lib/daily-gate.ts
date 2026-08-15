/**
 * Daily gate — disabled.
 *
 * The "complete 10 Minutes with Jesus first" restriction has been removed.
 * All content is freely accessible regardless of daily rhythm completion.
 *
 * The hook and function signatures are preserved so call-sites require no changes.
 *
 * Search alias: searching "15 minutes with jesus" also finds "10 minutes with jesus"
 * because the journey ID and tags preserve backward compatibility.
 */

import { useMemo } from 'react';
import { useJourney } from '@/contexts/JourneyContext';
import type { Journey } from '@/contexts/JourneyContext';

/**
 * Always returns false — no journey is gated by the daily rhythm.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isGatedByDailyGate(_j: Journey): boolean {
  return false;
}

export interface DailyGateResult {
  /** Always true — the gate is disabled. */
  gateClear: boolean;
  /** The published daily rhythm journey (10 Minutes with Jesus), if found. */
  coreJourney: Journey | undefined;
}

/**
 * Reactive hook — gate is permanently clear.
 * coreJourney is still resolved so any UI that references it (e.g. nudge cards)
 * continues to work without changes.
 */
export function useDailyGate(): DailyGateResult {
  const { journeys } = useJourney();

  const coreJourney = useMemo(
    () => journeys.find(
      j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
    ),
    [journeys]
  );

  return { gateClear: true, coreJourney };
}
