---
name: Daily Rhythm Content — Starting with Jesus
description: Architecture and content decisions for the 30-day "Starting with Jesus" daily rhythm deployment
---

# Daily Rhythm Content

## Seed location
`artifacts/api-server/src/scripts/seed-daily-rhythm.ts`
- 30 days through John's Gospel: John 1–19
- Called from `startup-migrations.ts` via `seedDailyRhythm()`
- Uses `onConflictDoNothing()` — admin edits are never overwritten
- Updates `journeysTable.durationDays` to 30 on each boot

## Journey ID
`15-minutes-with-jesus` — ID preserved for backward compat; display title is "10 Minutes with Jesus"

## Field mapping (DB → frontend)
- `teachingContent` → `devotional` (the reflection)
- `prayer` → `prayerPrompt`
- `todaysAction` → `actionStep`
- `scripture` → reference only (e.g. "John 1:35-39"), NOT Bible text

## JourneyDay.tsx changes (daily-rhythm specific)
- `isDailyRhythmJourney` computed from `journey?.journeyType === 'daily-rhythm'` at top of component
- Header shows "10 Minutes with Jesus / Day X" (no "of total")
- Scripture section shows reference + "Read in Bible" link → `/bible/read/:book/:chapter`
- `parseBibleLink("John 1:35-39")` → `/bible/read/john/1`
- No "Consider" textarea for daily-rhythm
- "Continue" button completes step and navigates directly to /walk
- `isDailyRhythmReadOnly`: true if `completedDays.includes(day)` — shows "Back to Walk" instead
- Closing text: "Tomorrow we'll continue walking together." shown before Continue button

**Why:** Spec said "Do not modify the Walk screen" (Walk.tsx untouched) but JourneyDay.tsx needed the structured layout.

## Content arc (Days 1–30)
John 1:35-39 → John 19:28-30 — chronological through John's Gospel
Day 1: Come and See, Day 30: It Is Finished

## Days 31+ 
Not yet seeded — members who reach Day 31 see "You're ahead of the rhythm. Check back later." placeholder.
