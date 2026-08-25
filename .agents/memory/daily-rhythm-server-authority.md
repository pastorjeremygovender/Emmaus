---
name: Daily Rhythm server authority
description: The Daily Rhythm must advance only through a locked server startup decision.
---

Daily Rhythm progress is server-authoritative: completion records the current day, while a later server calendar date may unlock exactly one next published step. The default timezone is Africa/Johannesburg, and first-open-per-day is persisted rather than inferred from browser localStorage. Startup requests carry a per-launch session claim so duplicate Welcome/Walk/auth-remount requests return the same destination.

**Why:** Client clocks, localStorage, multiple devices, browser navigation, and duplicate React/auth startup effects previously allowed a completed day or first-open destination to resolve inconsistently.

**How to apply:** Keep direct completion requests locked to the persisted current day, serialize unlock checks with a row lock, make duplicate calls idempotent by launch session, and treat previous-day review as progression-neutral.