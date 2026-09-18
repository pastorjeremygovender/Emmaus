/**
 * Journey enrollment state — active / paused / saved-for-later.
 *
 * Primary source of truth: server-side user_journey_progress.status column
 * (set via POST /api/engagements/journey/:id/pause|resume).
 *
 * localStorage (emmaus_enrollment) is kept as an optimistic UI cache so the
 * cards on Walk.tsx and Journeys.tsx update instantly without waiting for the
 * network round-trip. The server state is always the authoritative value.
 *
 * Exempt journey types do NOT count toward the five-active-Journey limit:
 *   - 'daily-rhythm' / 'core' (10 Minutes with Jesus)
 *   - 'companion'             (This Week's Sermon companion)
 *   - 'devotional' (Daily Devotional)
 *   - journey.overloadExempt === true (admin-marked)
 */

import { useState, useCallback, useEffect } from 'react';
import type { Journey } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { accountStorageKey } from '@/lib/account-storage';

export type EnrollmentState = 'active' | 'paused' | 'saved';
export type EnrollmentMap = Record<string, EnrollmentState>;

const STORAGE_KEY = 'emmaus_enrollment';
export const MAX_ACTIVE_JOURNEYS = 5;

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Types that are always exempt from the active-Journey limit.
 *
 * NOTE: 'core' is intentionally NOT in this set.  The startup migration
 * promotes the actual 10-Minutes-with-Jesus journey from 'core' → 'daily-rhythm',
 * so any remaining 'core' journey is an admin-created growth journey that must
 * count toward the limit and appear on My Emmaus.
 */
const EXEMPT_TYPES = new Set(['companion', 'devotional', 'daily-rhythm']);

export function isExemptJourney(j: Journey): boolean {
  return EXEMPT_TYPES.has(j.journeyType) || j.overloadExempt === true;
}

function load(subject: string | null): EnrollmentMap {
  if (!subject) return {};
  try {
    const raw = localStorage.getItem(accountStorageKey(STORAGE_KEY, subject));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persist(subject: string, map: EnrollmentMap) {
  try {
    localStorage.setItem(accountStorageKey(STORAGE_KEY, subject), JSON.stringify(map));
  } catch { /* ignore storage errors */ }
}

/** Custom event name used to sync across hook instances on the same page. */
const SYNC_EVENT = 'emmaus_enrollment_change';

/**
 * Call the engagements API to persist pause/resume server-side.
 * Fire-and-forget — the optimistic localStorage update is already applied.
 */
async function callEngagementApi(
  journeyId: string,
  action: 'pause' | 'resume'
): Promise<void> {
  try {
    await fetch(
      `${BASE}/api/engagements/journey/${encodeURIComponent(journeyId)}/${action}`,
      {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch {
    // Network errors are non-fatal — localStorage has the optimistic state.
    // The server will reflect the correct status once connectivity is restored.
  }
}

export function useEnrollment() {
  const { user } = useAuth();
  const subject = user?.id ?? null;
  const [enrollment, setEnrollmentState] = useState<EnrollmentMap>(() => load(subject));
  const [loadedSubject, setLoadedSubject] = useState<string | null>(subject);

  // Keep all instances in sync when storage changes (e.g. from another component).
  useEffect(() => {
    setEnrollmentState(load(subject));
    setLoadedSubject(subject);
    const handler = () => setEnrollmentState(load(subject));
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, [subject]);

  const mutate = useCallback((journeyId: string, state: EnrollmentState) => {
    if (!subject) return;
    setEnrollmentState(prev => {
      const next = { ...prev, [journeyId]: state };
      persist(subject, next);
      window.dispatchEvent(new Event(SYNC_EVENT));
      return next;
    });
  }, [subject]);

  const visibleEnrollment = loadedSubject === subject ? enrollment : {};

  const getState = useCallback(
    (journeyId: string): EnrollmentState => visibleEnrollment[journeyId] ?? 'active',
    [visibleEnrollment]
  );

  /**
   * Pause a journey: optimistic localStorage update + server-side persist.
   * Walk.tsx and Journeys.tsx also read progress[j.id]?.status from JourneyContext
   * (which refreshes on next mount) but the localStorage cache keeps the UI
   * in sync immediately.
   */
  const pauseJourney = useCallback((id: string) => {
    mutate(id, 'paused');
    void callEngagementApi(id, 'pause');
  }, [mutate]);

  /**
   * Resume a journey: optimistic localStorage update + server-side persist.
   */
  const resumeJourney = useCallback((id: string) => {
    mutate(id, 'active');
    void callEngagementApi(id, 'resume');
  }, [mutate]);

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
        (visibleEnrollment[j.id] ?? 'active') === 'active'
    ).length;
  }

  /**
   * Returns true if the user can start or mark a new growth journey active.
   */
  function canActivateMore(journeys: Journey[], startedIds: Set<string>): boolean {
    return activeGrowthCount(journeys, startedIds) < MAX_ACTIVE_JOURNEYS;
  }

  return {
    enrollment: visibleEnrollment,
    getState,
    pauseJourney,
    resumeJourney,
    saveForLater,
    activeGrowthCount,
    canActivateMore,
    MAX_ACTIVE_JOURNEYS,
  };
}
