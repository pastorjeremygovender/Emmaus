/**
 * tab-paths — helpers for identifying member-facing tab sections.
 *
 * Extracted here so that:
 *   1. App.tsx can import them (startup redirect + visibilitychange listener).
 *   2. Tests can import and exercise them directly.
 */

/**
 * Tab section prefixes that must route through Welcome on every cold start
 * or warm resume so that auth, profile loading, onboarding and
 * resolveEntryRoute() can run and land on /walk.
 *
 * IMPORTANT: matched with startsWith so that deep paths such as
 * /bible/read/john/3 or /journeys/explore are caught in addition to
 * the tab roots themselves.  Previously only the three exact root strings
 * were checked, which meant any sub-path within a tab bypassed Welcome
 * entirely on relaunch — the root cause of "always opens on My Bible".
 */
export const TAB_PREFIXES = ['/bible', '/journeys', '/personal'];

/** Returns true when a path belongs to one of the three non-home tabs. */
export function isTabPath(path: string): boolean {
  return TAB_PREFIXES.some(p => path === p || path.startsWith(p + '/'));
}
