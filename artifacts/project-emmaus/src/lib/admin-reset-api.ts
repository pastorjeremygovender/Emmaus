/**
 * admin-reset-api.ts — Frontend client for admin progress reset endpoints.
 *
 * Identity and admin access are derived server-side from the secure session
 * cookie; requests send credentials so the backend can authenticate the caller.
 */

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function apiUrl(path: string) {
  return `${BASE}/api/admin-reset${path}`;
}

interface AuthHeaders {
  userId: string;
  userRole: string;
}

async function post(path: string, _auth: AuthHeaders): Promise<void> {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    const clean =
      body.startsWith("<") || body.startsWith("Cannot")
        ? `HTTP ${res.status}`
        : body;
    throw new Error(clean || `HTTP ${res.status}`);
  }
}

// ─── Content list ─────────────────────────────────────────────────────────────

export interface ResetContentList {
  journeys: { id: string; title: string; journeyType: string }[];
  devotionals: { id: string; title: string }[];
  companions: { id: string; title: string }[];
}

export async function fetchContentList(_auth: AuthHeaders): Promise<ResetContentList> {
  const res = await fetch(apiUrl("/content-list"), {
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── Reset actions ────────────────────────────────────────────────────────────

/** Reset the Daily Rhythm journey to Day 1 (user stays enrolled). */
export function resetDailyRhythm(auth: AuthHeaders): Promise<void> {
  return post("/daily-rhythm", auth);
}

/**
 * Reset a single piece of content.
 * - kind "journey"    → resets to Day 1, user stays enrolled
 * - kind "devotional" → removes progress row (user re-enrolls fresh)
 * - kind "companion"  → removes progress row
 */
export function resetJourney(
  id: string,
  kind: "journey" | "devotional" | "companion",
  auth: AuthHeaders
): Promise<void> {
  return post(`/journey/${encodeURIComponent(id)}?kind=${kind}`, auth);
}

/**
 * Wipe ALL progress for this user across every content type.
 * User account, profile, and settings are untouched.
 */
export function resetEverything(auth: AuthHeaders): Promise<void> {
  return post("/everything", auth);
}

// ─── Local cache clear ────────────────────────────────────────────────────────
// After a reset, progress-related emmaus_* keys in localStorage are cleared so
// the UI reflects the new state without a stale optimistic layer on top.

export function clearLocalProgressCache(subject: string): void {
  const keysToRemove: string[] = [];
  const accountPrefix = `emmaus_account:${subject}:`;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key &&
      (key.startsWith(accountPrefix) || key === `emmaus_member_state:${subject}`)
    ) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}

/**
 * Clear obsolete browser launch state for older builds. The current opening
 * decision is server-authoritative, so this does not and cannot change whether
 * today's opening is due.
 */
export function clearDailyOpenMarkers(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (
      key?.endsWith(':emmaus_last_opened_v2') ||
      key?.endsWith(':emmaus_last_opened_v3') ||
      key?.endsWith(':emmaus_opening_resolved_v1')
    ) keysToRemove.push(key);
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));

  // Force the next root launch through the Welcome resolver in this browser.
  sessionStorage.removeItem('emmaus_splash_shown');
}
