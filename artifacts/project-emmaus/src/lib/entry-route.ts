/**
 * entry-route — canonical app-entry resolver for Project Emmaus.
 *
 * Every launch path (Welcome splash, Auth redirect, session restore, PWA open)
 * must call `resolveEntryRoute` to decide where to send the member. No screen
 * may independently hard-code a Daily Rhythm day URL.
 *
 * Rule (spec-locked):
 *   • Today's rhythm NOT yet complete → open today's Daily Rhythm entry.
 *   • Today's rhythm IS complete       → open Today's Steps (/walk).
 *   • No rhythm journey found          → Today's Steps (/walk).
 *   • Dev mode                         → same as above (dev mode only bypasses
 *                                        the calendar gate on the reading page
 *                                        itself; it does not alter launch logic).
 *
 * The decision is based on:
 *   1. member local calendar date (via isCompletedToday — uses device timezone);
 *   2. today's available Daily Rhythm day (progress.currentDay);
 *   3. whether that exact day's completion timestamp falls on today's local date.
 *
 * It is deliberately NOT based on:
 *   – lastViewedDay or any stored route key;
 *   – currentDay + 1 (i.e., the next chronological entry);
 *   – browser history;
 *   – any cached selected-day value.
 */

import { isCompletedToday } from './daily-lock';
import type { Journey, Progress } from '@/contexts/JourneyContext';

type JourneyLike = Pick<Journey, 'id' | 'journeyType' | 'status'>;

/**
 * Returns the correct member entry route for today.
 *
 * @param journeys  — published journey list from JourneyContext
 * @param progress  — member progress map from JourneyContext
 * @returns         — one of: /daily-rhythm/day/:n   or   /walk
 */
export function resolveEntryRoute(
  journeys: JourneyLike[],
  progress: Record<string, Progress>,
): string {
  // Find the published Daily Rhythm journey (journeyType 'daily-rhythm' or legacy 'core').
  const journey = journeys.find(
    j =>
      (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') &&
      j.status === 'Published',
  );

  // No rhythm journey published yet — go to Today's Steps as a safe fallback.
  if (!journey) return '/walk';

  const prog = progress[journey.id];

  // New member: no progress record. Open day 1.
  if (!prog) return '/daily-rhythm/day/1';

  // KEY CHECK: if today's rhythm is already complete (lastCompletedAt is today's
  // local calendar date) → return to Today's Steps, never to the next day.
  // This prevents the "You're ahead of the rhythm" screen from appearing on
  // every app reopen after the member finishes their daily reading.
  if (isCompletedToday(prog.lastCompletedAt)) return '/walk';

  // Rhythm not yet complete today → open the current day.
  return `/daily-rhythm/day/${prog.currentDay}`;
}
