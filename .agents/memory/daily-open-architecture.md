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

## Architecture (final)

Two call sites for `resolveDailyOpenRoute`:

### 1. Welcome.tsx splash path (`alreadyShown = false`)
- Fires on fresh browser sessions (new tab, full reload, first install)
- Waits for `timerDone + !authLoading + !loadingProfile + !journeyLoading`
- Handles: user already logged in, opens app fresh → lands on DR step directly

### 2. Walk.tsx `dailyOpenCheckedRef` effect
- Fires once per Walk.tsx mount, after `loading = false` (journeys + progress ready)
- Handles: user logs in via `/auth` → Auth.tsx sends to `/walk` → Walk mounts with real data → daily-open redirect fires
- `dailyOpenCheckedRef` prevents re-firing on subsequent effect runs
- `emmaus_last_opened_v2` guard in `resolveDailyOpenRoute` prevents firing on second daily visit

## Why Walk.tsx (not Welcome.tsx fast path)

Putting the check in Welcome.tsx fast path creates a race condition:
- When Auth.tsx redirects to `/`, JourneyContext hasn't set `journeyLoading = true` yet for the newly-authenticated user
- Fast path fires with stale `progress = {}` from the unauthenticated load
- `resolveDailyOpenRoute` returns null (no DR progress) → navigates to /walk
- Any guard (navigatedFastRef) then locks out the subsequent correct firing

Walk.tsx mounts AFTER auth is established and journeys+progress are fully loaded → no race condition possible.

## Auth.tsx
- Members are sent to `/walk` (not `/`) after login — Auth.tsx is correct as-is
- All daily-open routing is handled by Walk.tsx or Welcome.tsx splash path
