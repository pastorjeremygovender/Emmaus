---
name: App entry point rule
description: Where signed-in members always land on normal app launch, and why the previous logic was wrong.
---

## Rule (spec-locked — permanent)
On the first normal member app opening of each calendar day, launch the Daily
Rhythm "10 Minutes With Jesus" journey at the member's current step. Later
same-day openings land on `/walk` (Today's Steps).

Every normal launch — cold start, warm start, PWA open, background resume, force-close — lands on Today's Walk.

## Root cause of the bug
The launch path must preserve the once-per-day `emmaus_last_opened_v2` rule,
but Auth must return members through `/` so Welcome can apply that rule instead
of bypassing it with a direct `/walk` redirect.

**Why:**  Daily Rhythm should be the first spiritual touchpoint each day,
while Today's Steps remains the normal destination for subsequent openings.

## Deep-link exceptions
Push notifications, shared Room invitations, shared Journey links, Bible deep links — these navigate directly to a specific URL and never pass through `Welcome.tsx` at root. They are NOT handled by `resolveEntryRoute`; they bypass it entirely. After the deep-link interaction ends, the next normal launch returns to `/walk`.

## Call sites
Both `Welcome.tsx` useEffect paths (fast path + splash path) call
`resolveDailyOpenRoute`. `Auth.tsx` sends members back through `/` so the same
authenticated launch path runs after sign-in.

## How to apply
Never add routing logic that sends a member to a daily-rhythm URL at launch. Any content-page URL from launch must be a genuine deep link passed in through the URL, not derived from progress state.
