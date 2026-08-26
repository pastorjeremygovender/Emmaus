/**
 * Client-only lifecycle guard.
 *
 * The server launch claim makes duplicate bootstrap requests idempotent.
 * This separate flag answers a different question: may the client still
 * perform an automatic startup redirect? Once the initial destination has
 * been selected, ordinary SPA navigation must never consult that destination.
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
 * creating a new JavaScript context. The new member session must get its own
 * first-open decision rather than inheriting the previous account's guard.
 */
export function resetStartupRouting(): void {
  startupRoutingComplete = false;
}