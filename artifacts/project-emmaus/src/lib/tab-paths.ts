/**
 * tab-paths — helpers for identifying member-facing tab sections.
 *
 * Extracted here so that:
 *   1. App.tsx can import them (startup redirect + visibilitychange listener).
 *   2. Tests can import and exercise them directly.
 */

/**
 * Member-facing tab section prefixes that can be restored by a browser or
 * PWA. OpeningGate applies the route-access policy to determine whether each
 * section needs the Daily Rhythm opening flow.
 *
 * IMPORTANT: matched with startsWith so that deep paths such as
 * /bible/read/john/3 or /journeys/explore are caught in addition to
 * the tab roots themselves.
 */
export const TAB_PREFIXES = ['/bible', '/journeys', '/personal'];

/** Returns true when a path belongs to one of the three non-home tabs. */
export function isTabPath(path: string): boolean {
  return TAB_PREFIXES.some(p => path === p || path.startsWith(p + '/'));
}

/**
 * Member routes that must pass through the launch resolver when loaded by a
 * brand-new JS context. `/walk` is the normal in-app home, but it is also the
 * route a browser/PWA may restore directly on a cold launch.
 */
export function isColdMemberLaunchPath(path: string): boolean {
  return path === '/walk' || isTabPath(path);
}
