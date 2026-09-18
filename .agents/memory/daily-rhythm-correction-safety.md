---
name: Daily Rhythm correction safety
description: How guarded one-time Daily Rhythm production corrections must behave when historical verification fixtures are retired.
---

Guarded one-time content corrections must fail closed on data writes without failing open on application availability: if the historical verification snapshot is unavailable, log a clear skip and leave content untouched.

**Why:** A historical Day 8 correction ran during every production boot and crashed the API when the current seed no longer contained that snapshot, turning a harmless stale migration into a deployment outage.

**How to apply:** Keep exact content guards for corrections that still have verified fixtures, but make missing retired fixtures an idempotent no-op; never invent replacement content or weaken field-level verification just to make startup pass.