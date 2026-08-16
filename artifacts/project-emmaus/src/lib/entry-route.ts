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

// ─── Constants ────────────────────────────────────────────────────────────────

/** The journey ID for the Daily Rhythm ("10 Minutes with Jesus") journey. */
export const DAILY_RHYTHM_JOURNEY_ID = '15-minutes-with-jesus';

/** localStorage key that stores the ISO date (YYYY-MM-DD) of the last app open. */
const LAST_OPENED_KEY = 'emmaus_last_opened_date';

// ─── Types (minimal duck-typed to avoid circular imports) ─────────────────────

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
 * @param progress        - Journey progress map (keyed by journey ID)
 * @param getStepsForJourney - Returns steps for a given journey ID
 */
export function resolveDailyOpenRoute(
  progress: Record<string, ProgressLike>,
  getStepsForJourney: (id: string) => StepLike[],
): string | null {
  // Local date as YYYY-MM-DD (respects the member's timezone)
  const today = new Date().toLocaleDateString('en-CA');
  const lastOpened = localStorage.getItem(LAST_OPENED_KEY);

  // Record this open regardless of whether we navigate to Daily Rhythm.
  // This ensures subsequent opens today go straight to /walk.
  localStorage.setItem(LAST_OPENED_KEY, today);

  // If this is NOT the first open today, defer to the standard entry route.
  if (lastOpened === today) return null;

  // First open today — try to resume the member's Daily Rhythm step.
  const drProgress = progress[DAILY_RHYTHM_JOURNEY_ID];
  if (!drProgress) return null; // journey not yet started

  const currentDay = drProgress.currentDay ?? 1;
  if (currentDay < 1) return null;

  // Only navigate if the target day is a real published step (not beyond the end).
  const steps = getStepsForJourney(DAILY_RHYTHM_JOURNEY_ID);
  if (steps.length === 0) return null;

  const dayNumbers = steps.map(s => s.day);
  const maxDay     = Math.max(...dayNumbers);
  if (currentDay > maxDay) return null; // journey fully complete — go to walk

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
