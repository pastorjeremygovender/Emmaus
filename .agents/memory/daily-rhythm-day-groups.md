---
name: Daily Rhythm day groups
description: Manual groups organize individual Daily Rhythm days without changing widget/deep-link behavior or progress identity.
---

Daily Rhythm groups are day-level memberships, not whole-journey content groups. A day may belong to multiple groups; progress remains keyed by the canonical journey/day, and members only receive Published groups and Published days. Normal launches open My Emmaus; widget and deliberate Daily Rhythm navigation resolve the selected published day.

**Why:** The normal home and Daily Rhythm's explicit entry surfaces have different intent, while manual browsing still needs the Psalms-style group navigator.

**How to apply:** Keep `/daily-rhythm/navigate` as the only grouped browsing surface and preserve `/daily-rhythm/day/:dayNumber` for widget and deliberate navigation.