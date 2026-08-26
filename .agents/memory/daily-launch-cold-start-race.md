---
name: Daily launch cold-start race
description: The cold-start failure mode that can prevent Daily Rhythm opening on a fresh app launch.
---

On a fresh load that lands directly on `/walk`, auth can resolve before JourneyContext has populated the authenticated journey list. The Walk one-shot daily-open effect must not mark itself checked against an empty journey context. Cold `/walk` entries should also be routed through Welcome, which waits for auth, profile, and journey loading before resolving the Daily Rhythm destination.

**Why:** A fresh browser/PWA launch can otherwise land on Today's Steps every morning even though the Daily Rhythm resolver and isolated Welcome tests pass.

**How to apply:** Keep `/walk` as a normal in-app destination, but redirect an initial cold `/walk` route through Welcome and guard the Walk fallback until journeys are present. Do not use an overnight-only explanation unless the user confirms the app remained mounted.

The retained-PWA overnight path must re-query the server even when the
module-level startup-routing guard was completed yesterday; that guard is only
for the prior launch, not proof that today's Daily Rhythm opening was handled.
Startup request failures must retry with the same session identifier rather than
falling back to `/walk`, because the server may have committed the claim before
the response was lost.

**Why:** A mobile PWA can preserve both its JavaScript context and session
storage overnight. Treating yesterday's completed guard or a transient startup
error as today's normal home route skips the required first reading.

**How to apply:** Welcome must call the server startup decision on every root
entry after auth is ready, and retry transient failures until the decision is
available or the component is unmounted. Reset the lifecycle guard when a new
member signs in within an existing app context.