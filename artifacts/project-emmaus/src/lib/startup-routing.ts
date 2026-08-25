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