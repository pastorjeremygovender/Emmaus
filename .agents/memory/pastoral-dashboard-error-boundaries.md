---
name: Pastoral dashboard error boundaries
description: Pastoral aggregates and Today cards must preserve the difference between a valid empty result and a failed data source.
---

Database aggregates must let failures reach their route, while the Today view requests briefing, register, and statistics independently so one failed section does not hide healthy sections.

**Why:** Converting rejected queries into zeroes or empty arrays made production outages look like a pastor had no people, activity, or signals.

**How to apply:** Keep empty-result handling in successful SQL responses, surface failed sections as unavailable, and test mixed success/failure responses separately from valid empty states.