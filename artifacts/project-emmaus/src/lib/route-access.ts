/**
 * Route-access policy for member destinations that intentionally do not enter
 * the Daily Rhythm opening flow.
 *
 * Keep route matching segment-aware: `/bible-study` is not part of the Bible
 * section and must retain the normal opening behavior.
 */
export function routePathname(location: string): string {
  const separator = location.search(/[?#]/);
  return separator === -1 ? location : location.slice(0, separator);
}

export function isBibleRoute(location: string): boolean {
  const pathname = routePathname(location);
  return pathname === '/bible' || pathname.startsWith('/bible/');
}

/** Signed-in Bible destinations are available without the Daily Rhythm gate. */
export function bypassesDailyRhythmOpening(location: string): boolean {
  return isBibleRoute(location);
}