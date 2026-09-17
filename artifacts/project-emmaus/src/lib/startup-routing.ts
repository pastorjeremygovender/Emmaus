/**
 * Client-only lifecycle guard.
 *
 * Retained for compatibility with older startup callers. Normal launches now
 * go directly to My Emmaus, and widget/deep-link destinations are explicit.
 */
let startupRoutingComplete = false;

export function isStartupRoutingComplete(): boolean {
  return startupRoutingComplete;
}

export function markStartupRoutingComplete(): void {
  startupRoutingComplete = true;
}

/**
 * A user can sign out from an admin or member route and sign in again without
 * creating a new JavaScript context. Keep the reset API available for older
 * callers even though normal entry no longer has a first-open redirect.
 */
export function resetStartupRouting(): void {
  startupRoutingComplete = false;
}