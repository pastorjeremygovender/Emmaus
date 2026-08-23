---
name: Daily launch cold-start race
description: The cold-start failure mode that can prevent Daily Rhythm opening on a fresh app launch.
---

On a fresh load that lands directly on `/walk`, auth can resolve before JourneyContext has populated the authenticated journey list. The Walk one-shot daily-open effect must not mark itself checked against an empty journey context. Cold `/walk` entries should also be routed through Welcome, which waits for auth, profile, and journey loading before resolving the Daily Rhythm destination.

**Why:** A fresh browser/PWA launch can otherwise land on Today's Steps every morning even though the Daily Rhythm resolver and isolated Welcome tests pass.

**How to apply:** Keep `/walk` as a normal in-app destination, but redirect an initial cold `/walk` route through Welcome and guard the Walk fallback until journeys are present. Do not use an overnight-only explanation unless the user confirms the app remained mounted.