---
name: Daily Open Architecture
description: How the first-daily-open auto-route to Daily Rhythm works, and the bug class that breaks it.
---

## The Rule
On the first app open each day, members should land on their current Daily Rhythm step. Subsequent same-day opens go to /walk.

`resolveDailyOpenRoute(journeys, progress, getStepsForJourney)` in `lib/entry-route.ts` encapsulates this. Key guards:
- Reads/writes `emmaus_last_opened_v2` in localStorage (versioned to avoid poisoning from old buggy builds)
- Returns null if: no DR journey found, no DR progress, steps not loaded, or already completed
- Writes the key ONLY on successful navigation (not on failure)

## Architecture

`resolveDailyOpenRoute` must be called in **both** Welcome.tsx paths:

### Splash path (lines 76–106): `alreadyShown = false`
- Fires on fresh browser sessions (new tab, reload, first install)
- Waits for `timerDone + !authLoading + !loadingProfile + !journeyLoading`
- Already calls `resolveDailyOpenRoute` correctly

### Fast path (lines 44–66): `alreadyShown = true`
- Fires when user returns to `/` within the same session
- Also fires after Auth.tsx redirects back to `/` post-login
- **Must also call `resolveDailyOpenRoute`** (with `journeyLoading` guard + `navigatedFastRef`)

## Bug Class: Auth Login Bypasses Daily Open

**Symptom:** Clearing browser data + logging in always lands on /walk, never on the DR step.

**Root cause:**
1. Unauthenticated first visit to `/` → splash path fires → sets `SPLASH_KEY = 'true'` → sends to `/auth`
2. Auth.tsx (old code) sent members to `/walk` directly after login
3. Welcome.tsx never runs again; fast path (which called only `resolveEntryRoute → /walk`) was never reached with journey data

**Fix applied (2026-08-16):**
- Auth.tsx: all member post-login redirects changed from `/walk` to `/`
- Welcome.tsx fast path: added `journeyLoading` to guard, `navigatedFastRef` to prevent double-navigation, and `resolveDailyOpenRoute` call

**Why:** Auth.tsx → `/` means Welcome fires. If `SPLASH_KEY` is set, fast path runs — now with proper journey loading guard and daily-open check.

## The `navigatedFastRef` Guard

Prevents re-navigation when effect re-fires due to dependency changes (e.g., `journeys` or `progress` updating). Without it, after the first navigation writes `emmaus_last_opened_v2`, a second effect fire would call `resolveDailyOpenRoute` → null → /walk, overriding the DR navigation.
