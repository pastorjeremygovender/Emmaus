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

The startup response can advance the server progress one moment before the
client's already-loaded progress snapshot catches up. The Daily Rhythm reader
must refresh authoritative state before deciding a requested day is ahead of the
member; otherwise a valid newly unlocked route is immediately redirected to
`/walk`.

**Why:** Production tracing showed progress loaded just before `daily_rhythm_unlock_at`,
then startup advanced the account and returned the correct day, while the reader
still saw the old current day.

**How to apply:** Treat the startup destination and the reader's future-day
guard as one handoff: refresh `/daily-rhythm/state` on Daily Rhythm route entry,
hold the guard while it loads, and only then render or redirect.

The Daily Rhythm loading guard is runtime-sensitive: bundling can succeed even
when a newly referenced guard variable is missing, so the source contract must
assert both the declaration and its use.

**Why:** A missing declaration in a render-time guard produced a blank member
page despite a successful production build.

**How to apply:** When adding route-level loading guards, keep the derived
boolean beside the data it describes and cover its declaration in the focused
page contract test.

The opening request lifecycle must remain independent of its resolved/error
state. Clearing an error for a retry should start exactly one new request, not
re-run the effect because the state changed.

**Why:** A retry that reset both the request key and error state while the
effect depended on both could issue two startup requests; the later stale
response could replace a successful recovery with the normal Walk fallback.

**How to apply:** Use a dedicated retry/lifecycle key to trigger startup
requests and keep transient decision/error state out of that effect's trigger
dependencies.