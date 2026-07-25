/**
 * Journey enrollment state — active / paused / saved-for-later.
 *
 * Stored in localStorage under 'emmaus_enrollment'.
 * Components use the useEnrollment() hook; all calls share the same storage key
 * so state is consistent across the app without a new context.
 *
 * Exempt journey types do NOT count toward the two-active-Journey limit:
 *   - 'core'      (15 Minutes with Jesus)
 *   - 'companion' (This Week's Sermon companion)
 *   - journey.overloadExempt === true (admin-marked)
 */

import { useState, useCallback, useEffect } from 'react';
import type { Journey } from '@/contexts/JourneyContext';

export type EnrollmentState = 'active' | 'paused' | 'saved';
export type EnrollmentMap = Record<string, EnrollmentState>;

const STORAGE_KEY = 'emmaus_enrollment';
const MAX_ACTIVE_GROWTH = 2;

/** Types that are always exempt from the active-Journey limit. */
const EXEMPT_TYPES = new Set(['core', 'companion', 'devotional']);

export function isExemptJourney(j: Journey): boolean {
  return EXEMPT_TYPES.has(j.journeyType) || j.overloadExempt === true;
}

function load(): EnrollmentMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persist(map: EnrollmentMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore storage errors */ }
}

/** Custom event name used to sync across hook instances on the same page. */
const SYNC_EVENT = 'emmaus_enrollment_change';

export function useEnrollment() {
  const [enrollment, setEnrollmentState] = useState<EnrollmentMap>(() => load());

  // Keep all instances in sync when storage changes (e.g. from another component).
  useEffect(() => {
    const handler = () => setEnrollmentState(load());
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, []);

  const mutate = useCallback((journeyId: string, state: EnrollmentState) => {
    setEnrollmentState(prev => {
      const next = { ...prev, [journeyId]: state };
      persist(next);
      window.dispatchEvent(new Event(SYNC_EVENT));
      return next;
    });
  }, []);

  const getState = useCallback(
    (journeyId: string): EnrollmentState => enrollment[journeyId] ?? 'active',
    [enrollment]
  );

  const pauseJourney = useCallback((id: string) => mutate(id, 'paused'), [mutate]);
  const resumeJourney = useCallback((id: string) => mutate(id, 'active'), [mutate]);
  const saveForLater = useCallback((id: string) => mutate(id, 'saved'), [mutate]);

  /**
   * Count non-exempt journeys the user has started and has 'active'.
   * A journey is counted only if it has a progress record (user has enrolled).
   */
  function activeGrowthCount(
    journeys: Journey[],
    startedIds: Set<string>
  ): number {
    return journeys.filter(
      j =>
        !isExemptJourney(j) &&
        startedIds.has(j.id) &&
        (enrollment[j.id] ?? 'active') === 'active'
    ).length;
  }

  /**
   * Returns true if the user can start or mark a new growth journey active.
   */
  function canActivateMore(journeys: Journey[], startedIds: Set<string>): boolean {
    return activeGrowthCount(journeys, startedIds) < MAX_ACTIVE_GROWTH;
  }

  return {
    enrollment,
    getState,
    pauseJourney,
    resumeJourney,
    saveForLater,
    activeGrowthCount,
    canActivateMore,
    MAX_ACTIVE_GROWTH,
  };
}
