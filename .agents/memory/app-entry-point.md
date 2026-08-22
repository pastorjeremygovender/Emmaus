---
name: App entry point rule
description: Where signed-in members always land on normal app launch, and why the previous logic was wrong.
---

## Rule (spec-locked — permanent)
Every normal member launch must enter the Daily Rhythm "10 Minutes With Jesus"
journey at the member's current step. The foundational resolver must ignore
once-per-day localStorage markers; `/walk` is not the initial destination.

Every normal launch — cold start, warm start, PWA open, background resume, force-close — lands on Today's Walk.

## Root cause of the bug
The previous launch path treated Daily Rhythm as a once-per-day detour and
allowed the `emmaus_last_opened_v2` marker, or an Auth redirect directly to
`/walk`, to bypass the foundational practice.

**Why:**  Daily Rhythm is the foundational reason for the app. Members may use
Today's Steps after entering the practice, but it must not replace the first
destination.

## Deep-link exceptions
Push notifications, shared Room invitations, shared Journey links, Bible deep links — these navigate directly to a specific URL and never pass through `Welcome.tsx` at root. They are NOT handled by `resolveEntryRoute`; they bypass it entirely. After the deep-link interaction ends, the next normal launch returns to `/walk`.

## Call sites
Both `Welcome.tsx` useEffect paths (fast path + splash path) call the
foundational Daily Rhythm resolver. `Auth.tsx` sends members back through `/`
so the same authenticated launch path runs after sign-in.

## How to apply
Never add routing logic that sends a member to a daily-rhythm URL at launch. Any content-page URL from launch must be a genuine deep link passed in through the URL, not derived from progress state.
