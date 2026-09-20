---
name: Daily launch cold-start race
description: Normal launches stay on My Emmaus while native widget handoff is protected from startup races.
---

Normal web and Android app-icon launches must settle on `/walk` (My Emmaus),
regardless of the local calendar day or the member's Daily Rhythm progress.

The only cold-start exception is a native Daily Rhythm widget intent. The
native bridge may deliver its exact `source=widget` route after React mounts,
so Welcome waits briefly for that handoff before redirecting a normal root
launch to `/walk`. React mounting itself must never wait on the native bridge.

**Why:** Without the short handoff window, Welcome can replace a valid widget
destination with `/walk`; without the normal redirect, the old opening gate can
send the first daily launch to "10 Minutes with Jesus".

**How to apply:** Keep widget routes exact and source-validated, acknowledge a
widget route only after its referenced entry is rendered, and do not reintroduce
calendar-day or localStorage logic into normal launch routing.