---
name: Daily Rhythm server authority
description: The Daily Rhythm must advance only through a locked server startup decision.
---

Daily Rhythm progress is server-authoritative: completion records the current day, while a later server calendar date may unlock exactly one next published step. The default timezone is Africa/Johannesburg, and first-open-per-day is persisted rather than inferred from browser localStorage.

**Why:** Client clocks, localStorage, multiple devices, and browser navigation previously allowed a completed day to unlock immediately or inconsistently.

**How to apply:** Keep direct completion requests locked to the persisted current day, serialize unlock checks with a row lock, and treat previous-day review as progression-neutral.