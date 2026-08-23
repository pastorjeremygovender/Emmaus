---
name: Overnight PWA launch
description: The failure mode and rule for opening Daily Rhythm after a retained PWA remains alive overnight.
---

If Emmaus remains mounted while a phone is backgrounded overnight, module-level startup guards do not run again the next morning. Normal home re-entry must detect a calendar-day change after a genuine overnight gap and route through the existing Daily Rhythm resolver.

**Why:** A fresh-load-only redirect can pass unit tests and still leave members on Yesterday's Steps when a PWA restores the existing JavaScript session the next morning.

**How to apply:** Preserve the exact current page during ordinary app switching and screen locking. Only normal home routes should re-enter the launch resolver after a long overnight background interval; deep links and active content pages must not be redirected.