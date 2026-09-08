/**
 * entry-route — canonical app-entry resolver for Project Emmaus.
 *
 * Every launch path (Welcome splash, Auth redirect, session restore, PWA open)
 * must call the helpers here to decide where to send an onboarded member.
 * No screen may independently hard-code an initial destination.
 *
 * Rules:
 *
 *   FIRST OPEN OF THE DAY:
 *     The server opening endpoint resolves this from the authenticated account
 *     and its timezone-aware opening ledger. Client-only date markers are not
 *     authoritative and must never decide whether an opening is due.
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

// ─── Types (minimal duck-typed to avoid circular imports) ─────────────────────

type JourneyLike  = { id: string; journeyType: string };
type ProgressLike = { currentDay?: number; completedDays?: number[] };
type StepLike     = { day: number };

// ─── resolveDailyOpenRoute ────────────────────────────────────────────────────

/**
 * Deprecated compatibility shim. Daily Rhythm launch decisions are now made
 * by GET /api/journeys/daily-rhythm/startup. Keeping this function as a
 * no-op prevents older callers from reviving the former localStorage contract.
 *
 * @param journeys           - Published journeys list from JourneyContext
 * @param progress           - Journey progress map (keyed by journey DB id)
 * @param getStepsForJourney - Returns published steps for a given journey ID
 */
export function resolveDailyOpenRoute(
  subject: string,
  journeys: JourneyLike[],
  progress: Record<string, ProgressLike>,
  getStepsForJourney: (id: string) => StepLike[],
): string | null {
  void subject;
  void journeys;
  void progress;
  void getStepsForJourney;
  return null;
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
