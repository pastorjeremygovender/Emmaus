---
name: Daily Rhythm day groups
description: Manual groups organize individual Daily Rhythm days without changing first-open behavior or progress identity.
---

Daily Rhythm groups are day-level memberships, not whole-journey content groups. A day may belong to multiple groups; progress remains keyed by the canonical journey/day, and members only receive Published groups and Published days. A member with no progress row starts at the first published day on first open.

**Why:** The first-open Daily Rhythm protocol is intentionally direct-to-day, while manual browsing needs the Psalms-style group navigator.

**How to apply:** Keep `/daily-rhythm/navigate` as the only grouped browsing surface; preserve `/daily-rhythm/day/:dayNumber`, and make first-open start missing Daily Rhythm progress idempotently before navigation.