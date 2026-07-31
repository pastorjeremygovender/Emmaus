/**
 * Runtime feature flags — set by startup migrations after invariants are
 * confirmed.  Routes that depend on a specific DB guarantee check the
 * corresponding flag before serving requests so a failed migration results
 * in a clear 503 rather than a cryptic 500 or silent data corruption.
 */

/** True once the unique index on user_journey_progress(user_id, journey_id) exists. */
let _startSharedReady = false;

export function setStartSharedReady(): void {
  _startSharedReady = true;
}

export function isStartSharedReady(): boolean {
  return _startSharedReady;
}
