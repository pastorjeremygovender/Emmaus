/**
 * Authenticated cold-launch budgets.
 *
 * These are intentionally test-owned thresholds for a healthy local/network
 * path. The target budget covers the time from mounting the app until the
 * server-authorized Daily Rhythm destination is requested; the content budgets
 * protect the primary/secondary loading split independently.
 */
export const AUTHENTICATED_STARTUP_BUDGET_MS = {
  identityProfile: 1_000,
  serverDecision: 1_000,
  primaryContent: 2_000,
  secondaryContent: 3_000,
  authorizedTarget: 2_500,
} as const;

export type AuthenticatedStartupPhase = keyof typeof AUTHENTICATED_STARTUP_BUDGET_MS;
