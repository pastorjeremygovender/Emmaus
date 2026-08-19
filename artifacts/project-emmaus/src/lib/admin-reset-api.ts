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
//
// emmaus_demo_user is intentionally preserved — it holds the auth session and
// the user's preferred name. Removing it would sign the user out entirely,
// which violates the "do not delete user account / login" contract.

const PRESERVED_CACHE_KEYS = new Set([
  'emmaus_demo_user', // auth session + preferred name — must never be cleared
]);

export function clearLocalProgressCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith("emmaus_") && !PRESERVED_CACHE_KEYS.has(key)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}
