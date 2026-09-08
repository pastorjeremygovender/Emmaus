---
name: Ask Emmaus dated devotional resolution
description: Selection rules for calendar-allocated Daily Devotionals versus progress-based resources and Daily Rhythm.
---

For any published Daily Devotional series with parseable date labels on its entries, Ask Emmaus must select the entry allocated to the current Africa/Johannesburg calendar date. Member progress, completion, pause state, and whether the series has been opened do not change that dated answer. If no published entry is assigned today, report that explicitly instead of falling back to an unread entry.

**Why:** A calendar devotional answers “what is assigned today?”, while progress answers “what should I continue?”. Mixing them caused Psalms entries to drift away from their intended dates.

**How to apply:** Treat the admin-generated date-label formats as allocation metadata. Keep progress-aware selection only for non-dated Daily Devotionals. Never use this rule to bypass Daily Rhythm enrollment, opening, unlock, or future-entry guards.