---
name: Daily Open Architecture
description: Normal web/icon launches open My Emmaus; native widget taps retain their exact Daily Rhythm destination.
---

## The Rule
Normal web launches and Android app-icon launches open `/walk` (My Emmaus) every
time. They do not consume the Daily Rhythm opening ledger or auto-route to
"10 Minutes with Jesus".

Native Daily Rhythm widget taps remain explicit deep links to the exact
`/daily-rhythm/day/:day?source=widget` route displayed by the widget.

`resolveDailyOpenRoute(journeys, progress, getStepsForJourney)` in `lib/entry-route.ts` encapsulates this. Key guards:
- Reads/writes account-scoped `emmaus_last_opened_v2` in localStorage (versioned to avoid poisoning from old buggy builds)
- Uses `localDateKey()` for an explicit local `YYYY-MM-DD` calendar boundary; never rely on locale-formatted date strings
- Returns null if: no DR journey found, no DR progress, steps not loaded, or already completed
- Writes the key ONLY on successful navigation (not on failure)

## Architecture (current)

- `Welcome.tsx` sends an authenticated normal root launch to `/walk`.
- `OpeningGate` still owns splash/auth/onboarding boundaries, but no longer
  requests the Daily Rhythm startup decision or redirects normal launches.
- `native-daily-rhythm-deep-link.ts` waits briefly for a cold widget intent
  before Welcome performs its normal `/walk` redirect. A valid widget route
  therefore wins without blocking React mounting.
- `DailyRhythmDay` acknowledges a widget route only after the referenced entry
  has been validated and rendered.

## Required regression coverage

- authenticated normal root launch routes to `/walk` without calling the Daily
  Rhythm startup endpoint;
- authenticated deep links remain direct;
- cold and warm widget taps preserve their exact widget-owned route;
- the native handoff remains independent from the normal `/walk` redirect.

## Auth.tsx
Members can still return through `/` after login; Welcome now resolves that
normal entry directly to `/walk`.

**Why:** The requested product behavior is a consistent My Emmaus home for web
and app-icon launches. Daily Rhythm remains available through the widget and
deliberate navigation instead of hijacking normal entry.
