---
name: Daily Rhythm day groups
description: Manual groups organize individual Daily Rhythm days without changing first-open behavior or progress identity.
---

Daily Rhythm groups are day-level memberships, not whole-journey content groups. A day may belong to multiple groups; progress remains keyed by the canonical journey/day, and members only receive Published groups and Published days.

**Why:** The first-open Daily Rhythm protocol is intentionally direct-to-day, while manual browsing needs the Psalms-style group navigator.

**How to apply:** Keep `/daily-rhythm/navigate` as the only grouped browsing surface; do not alter `resolveDailyOpenRoute()` or `/daily-rhythm/day/:dayNumber`.