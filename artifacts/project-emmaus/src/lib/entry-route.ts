/**
 * entry-route — canonical app-entry resolver for Project Emmaus.
 *
 * Every launch path (Welcome splash, Auth redirect, session restore, PWA open)
 * must call `resolveEntryRoute` to decide where to send an onboarded member.
 * No screen may independently hard-code an initial destination.
 *
 * Rule (spec-locked — permanent):
 *   Normal app launch → Today's Walk (/walk)
 *
 *   This applies after:
 *     • cold start (new session / fresh browser open)
 *     • warm start (browser session still live)
 *     • PWA re-open from home screen (JS context destroyed)
 *     • force-close and reopen
 *
 *   It does NOT apply to resume events — screen lock/unlock, brief app switch,
 *   incoming call, notification shade, visibilitychange, pageshow, focus.
 *   On resume the JS context is kept alive and the user returns to the exact
 *   screen they left.  Do not redirect on resume.
 *
 *   The only exceptions are explicit deep-link navigations (push notification,
 *   shared Room invitation, shared Journey link, Bible deep link).  Those
 *   navigations target a specific URL directly and never pass through this
 *   resolver — they bypass Welcome entirely.  After the user returns to a
 *   normal launch, this resolver sends them back to Today's Walk.
 *
 * It is deliberately NOT based on:
 *   – the member's current Daily Rhythm day;
 *   – lastViewedDay or any stored route key;
 *   – browser history;
 *   – any cached selected-day value.
 */

/**
 * Returns the correct member entry route for a normal app launch.
 *
 * Always returns `/walk` (Today's Walk) — the canonical home screen.
 *
 * Parameters are accepted for API compatibility (callers in Welcome.tsx
 * already resolve journey/progress context before calling) but are not
 * used in the routing decision.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function resolveEntryRoute(..._args: any[]): string {
  return '/walk';
}
