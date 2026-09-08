/**
 * content-navigation.ts
 *
 * Single source of truth for how members navigate into content.
 *
 * Rule:
 *   - Content that has been started (in-progress or paused) → navigator page
 *     (Previous / Current / Next picker before entering the reading).
 *   - Everything else (not-started, completed, or unknown state) → returns null
 *     so the caller falls back to whatever detail/overview/day-1 route it
 *     already has.
 *
 * Adding a new content type:
 *   1. Add the navigator page + route in App.tsx.
 *   2. Add a case in navigatorRoute() below.
 *   Done — every call site that uses navigatorRoute() gets the new behaviour
 *   automatically.
 */

export type ContentKind =
  | 'daily-rhythm'
  | 'journey'
  | 'devotional'
  | 'sermon-companion';

/**
 * Returns the navigator route for the given content type + id when the member
 * is actively in-progress or paused; null otherwise (caller uses its own
 * fallback route).
 */
export function navigatorRoute(
  kind: ContentKind,
  id: string,
  state: string | undefined,
): string | null {
  if (state !== 'in-progress' && state !== 'paused' && state !== 'completed') return null;
  switch (kind) {
    case 'daily-rhythm':      return '/daily-rhythm/navigate';
    case 'journey':           return `/journey/${id}/navigate`;
    case 'devotional':        return `/devotional/${id}/navigate`;
    case 'sermon-companion':  return `/sermon-companion/${id}/navigate`;
    default:                  return null;
  }
}
