/**
 * entry-route — canonical app-entry resolver for Project Emmaus.
 *
 * Every launch path (Welcome splash, Auth redirect, session restore, PWA open)
 * must call the helpers here to decide where to send an onboarded member.
 * No screen may independently hard-code an initial destination.
 *
 * Rules:
 *
 *   FIRST OPEN OF THE DAY (full cold/warm start, new browser session):
 *     If the member has an active Daily Rhythm step → open it directly.
 *     The member can then navigate anywhere they like.
 *     Call `resolveDailyOpenRoute(progress, getStepsForJourney)` from the
 *     full splash flow in Welcome.tsx.  It returns a route string or null.
 *     It also updates localStorage to record today as opened.
 *
 *   SUBSEQUENT OPENS SAME DAY (visiting "/" while splash already shown):
 *     Always → Today's Walk (/walk).
 *     Call `resolveEntryRoute()`.
 *
 *   RESUME EVENTS (screen lock/unlock, brief app switch, incoming call,
 *     notification shade, visibilitychange, pageshow, focus):
 *     The JS context is kept alive — the user returns to the exact screen
 *     they left.  Do NOT redirect on resume.
 *
 *   DEEP-LINK NAVIGATIONS (push notification, shared Room/Journey/Bible link):
 *     Target a specific URL directly and bypass Welcome entirely.
 *     After the user returns to a normal launch this resolver applies.
 *
 * Persistence contract (Emmaus must remember where every member is):
 *   – Daily Rhythm / Journeys : server-persisted via user_journey_progress.
 *     currentDay advances on completeStep — survives months of inactivity.
 *   – Daily Devotionals       : server-persisted via devotional_progress.
 *     Position is derived from completedDays, NOT currentDay (always 1).
 *   – Sermon Companions       : server-persisted via sermon_companion_progress.
 *     currentDay advances on completion.
 *   – Bible reading history   : cloud-persisted via user_bible_data (PATCH
 *     on every chapter open; server is authoritative on login).
 *   – Ask Emmaus              : in-memory (conversations are ephemeral by design).
 */

/**
 * localStorage key that stores the ISO date (YYYY-MM-DD) of the last
 * successful Daily Rhythm auto-open.
 *
 * Key is versioned (_v2) so a stale value from an earlier buggy build
 * (which wrote the date even when navigation failed) is never consulted.
 */
const LAST_OPENED_KEY = 'emmaus_last_opened_v2';

// ─── Types (minimal duck-typed to avoid circular imports) ─────────────────────

type JourneyLike  = { id: string; journeyType: string };
type ProgressLike = { currentDay?: number; completedDays?: number[] };
type StepLike     = { day: number };

// ─── resolveDailyOpenRoute ────────────────────────────────────────────────────

/**
 * For the FIRST open of a new day: returns the Daily Rhythm step route the
 * member should be taken to, or null if /walk should be used instead.
 *
 * Also records today's date in localStorage so subsequent calls (same day)
 * return null immediately.
 *
 * @param journeys           - Published journeys list from JourneyContext
 * @param progress           - Journey progress map (keyed by journey DB id)
 * @param getStepsForJourney - Returns published steps for a given journey ID
 */
export function resolveDailyOpenRoute(
  journeys: JourneyLike[],
  progress: Record<string, ProgressLike>,
  getStepsForJourney: (id: string) => StepLike[],
): string | null {
  // Local date as YYYY-MM-DD (respects the member's timezone)
  const today = new Date().toLocaleDateString('en-CA');
  const lastOpened = localStorage.getItem(LAST_OPENED_KEY);

  // If this is NOT the first open today, defer to the standard entry route.
  // NOTE: we only write the key on success, so a failed navigation never
  // consumes the daily slot.
  if (lastOpened === today) return null;

  // Find the Daily Rhythm journey by type — the same way Walk.tsx does it.
  // Never use a hardcoded slug: progress is keyed by the journey's DB id.
  const drJourney = journeys.find(
    j => j.journeyType === 'daily-rhythm' || j.journeyType === 'core',
  );
  if (!drJourney) return null;

  // First open today — try to resume the member's Daily Rhythm step.
  const drProgress = progress[drJourney.id];
  if (!drProgress) return null; // journey not yet started

  const currentDay = drProgress.currentDay ?? 1;
  if (currentDay < 1) return null;

  // Only navigate if the target day is a real published step (not beyond the end).
  const steps = getStepsForJourney(drJourney.id);
  if (steps.length === 0) return null;

  const dayNumbers = steps.map(s => s.day);
  const maxDay     = Math.max(...dayNumbers);
  if (currentDay > maxDay) return null; // journey fully complete — go to walk

  // Mark today ONLY on a successful navigation so a failed attempt
  // (missing data, journey complete, etc.) never blocks the next open.
  localStorage.setItem(LAST_OPENED_KEY, today);

  return `/daily-rhythm/day/${currentDay}`;
}

// ─── resolveEntryRoute ────────────────────────────────────────────────────────

/**
 * Standard member entry route — Today's Walk.
 *
 * Used for subsequent same-day opens (splash already shown this session),
 * and as the fallback when `resolveDailyOpenRoute` returns null.
 *
 * Parameters are accepted for API compatibility but are not used.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveEntryRoute(..._args: any[]): string {
  return '/walk';
}
