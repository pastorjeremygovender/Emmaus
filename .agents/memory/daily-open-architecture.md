---
name: Daily Open Architecture
description: How the first-daily-open auto-route to Daily Rhythm works, and the bug class that breaks it.
---

## The Rule
Every normal member launch should land on the current Daily Rhythm step.
Today's Steps is not a launch fallback.

`resolveDailyOpenRoute(journeys, progress, getStepsForJourney)` in `lib/entry-route.ts` encapsulates this. Key guards:
- Reads/writes account-scoped `emmaus_last_opened_v2` in localStorage (versioned to avoid poisoning from old buggy builds)
- Uses `localDateKey()` for an explicit local `YYYY-MM-DD` calendar boundary; never rely on locale-formatted date strings
- Returns null if: no DR journey found, no DR progress, steps not loaded, or already completed
- Writes the key ONLY on successful navigation (not on failure)

## Architecture (final)

Two call sites for `resolveDailyOpenRoute`:

### 1. Welcome.tsx root-entry paths (both splash and fast path)
- Fires on fresh browser sessions (new tab, full reload, first install) and when a retained browser/PWA session re-enters `/`
- Both paths wait for `!authLoading + !loadingProfile + !journeyLoading`; the splash path also waits for its display timer
- The session splash marker and old once-per-day marker never control the foundational destination
- Handles: user already logged in, opens app fresh → lands on DR step directly

### 2. Walk.tsx `dailyOpenCheckedRef` effect
- Remains only as a compatibility path for deliberate direct arrivals at `/walk`
- The normal Auth flow returns through `/`, so it cannot bypass the Welcome foundational resolver

## Why Welcome needs journey loading

Putting the check in Welcome.tsx fast path **without** waiting for journey loading creates a race condition:
- When Auth.tsx redirects to `/`, JourneyContext hasn't set `journeyLoading = true` yet for the newly-authenticated user
- Fast path fires with stale `progress = {}` from the unauthenticated load
- `resolveDailyOpenRoute` returns null (no DR progress) → navigates to /walk
- A direct fallback to `/walk` makes the behavior dependent on a second component mounting correctly

Welcome's fast path waits for the full JourneyContext load before invoking the
foundational resolver. If Daily Rhythm data is genuinely unavailable, the
resolver returns null and the existing `/walk` fallback remains explicit.

## Required regression coverage

Use fake system time to test the only-once-per-day contract; manual testing cannot reliably catch it:
- first daily open routes to the current Daily Rhythm step and records the local date;
- a second open on that date routes to `/walk`;
- advancing the local date routes to Daily Rhythm again;
- a retained `emmaus_splash_shown` session marker from yesterday must still route to Daily Rhythm after JourneyContext finishes loading.

**Why:** browser/PWA session storage can survive overnight even when the user experiences the next interaction as opening the app.

## Auth.tsx
- Members are sent to `/` after login so Welcome can apply the foundational
  Daily Rhythm launch rule.
