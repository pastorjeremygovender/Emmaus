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

/** Minimal step shape needed to validate day existence. */
type StepLike = { day: number; status: string };

/**
 * Returns the correct member entry route for today.
 *
 * @param journeys           — published journey list from JourneyContext
 * @param progress           — member progress map from JourneyContext
 * @param getStepsForJourney — optional callback to load published steps;
 *                             when provided, the resolved day is clamped to
 *                             the highest real published entry so phantom
 *                             arithmetic days (e.g. Day 8 when only 1–7 exist)
 *                             never appear in the launch URL.
 * @returns — one of: /daily-rhythm/day/:n   or   /walk
 */
export function resolveEntryRoute(
  journeys: JourneyLike[],
  progress: Record<string, Progress>,
  getStepsForJourney?: (journeyId: string) => StepLike[],
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

  // New member: no progress record. Open day 1 only if it is published.
  if (!prog) {
    if (getStepsForJourney) {
      const steps = getStepsForJourney(journey.id).filter(s => s.status === 'Published');
      return steps.some(s => s.day === 1) ? '/daily-rhythm/day/1' : '/walk';
    }
    return '/daily-rhythm/day/1';
  }

  // KEY CHECK: if today's rhythm is already complete (lastCompletedAt is today's
  // local calendar date) → return to Today's Steps, never to the next day.
  if (isCompletedToday(prog.lastCompletedAt)) return '/walk';

  // Clamp the arithmetic currentDay to the highest real published entry.
  // This prevents routing to phantom days (e.g. Day 8 when only 1–7 are published).
  if (getStepsForJourney) {
    const publishedSteps = getStepsForJourney(journey.id).filter(s => s.status === 'Published');
    if (publishedSteps.length > 0) {
      const maxPublishedDay = Math.max(...publishedSteps.map(s => s.day));
      const effectiveDay    = Math.min(prog.currentDay, maxPublishedDay);
      // If the entry for effectiveDay doesn't exist (content gap), return /walk.
      if (!publishedSteps.some(s => s.day === effectiveDay)) return '/walk';
      return `/daily-rhythm/day/${effectiveDay}`;
    }
    // No published entries at all — safe fallback.
    return '/walk';
  }

  // Rhythm not yet complete today → open the current day (no step validation).
  return `/daily-rhythm/day/${prog.currentDay}`;
}
