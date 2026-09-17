---
name: App entry point rule
description: Where signed-in members always land on normal app launch, and why the previous logic was wrong.
---

## Rule (spec-locked — permanent)
Every normal member app opening from the web or Android app icon lands on
`/walk` (My Emmaus). It must not automatically launch the Daily Rhythm
"10 Minutes With Jesus" journey.

The Daily Rhythm widget remains a deliberate exception: its exact native
`source=widget` destination opens the displayed Daily Rhythm entry.

## Root cause of the bug
The launch gate was applying the Daily Rhythm opening ledger to normal root and
cold member launches. That made the first opening of a day bypass My Emmaus.

**Why:** My Emmaus is the normal home. Daily Rhythm should open automatically
only when the member deliberately chooses it or taps its widget.

## Deep-link exceptions
Push notifications, shared Room invitations, shared Journey links, Bible deep links — these navigate directly to a specific URL and never pass through `Welcome.tsx` at root. They are NOT handled by `resolveEntryRoute`; they bypass it entirely. After the deep-link interaction ends, the next normal launch returns to `/walk`.

## Call sites
`Welcome.tsx` routes authenticated normal root launches to `/walk`.
`OpeningGate` handles splash/auth/onboarding only. Native widget handoff is
resolved separately before the normal root redirect.

## How to apply
Never add routing logic that sends a normal member launch to a daily-rhythm URL.
Any Daily Rhythm URL at launch must be a deliberate widget or content deep link.
