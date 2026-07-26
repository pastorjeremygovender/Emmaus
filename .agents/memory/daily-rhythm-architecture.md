---
name: Daily Rhythm Architecture
description: How the Daily Rhythm content type works — separate from normal Journeys, never finishes, migrated from 'core' type.
---

# Daily Rhythm Architecture

## The new content type
`journeyType: 'daily-rhythm'` is the canonical type for the permanent daily practice.
The legacy `'core'` type is accepted as a fallback throughout the codebase.

## DB migration
`startup-migrations.ts` runs on every API server boot and promotes
`15-minutes-with-jesus` from `journeyType: 'core'` → `'daily-rhythm'` (idempotent WHERE clause).

**Why:** The seed was written with 'core' before this sprint; the migration ensures existing DB rows are updated automatically without requiring a manual seed re-run.

## Key invariants
- Daily Rhythm journeys NEVER show "Journey Complete" — `isFinalStep` is forced `false` in `JourneyDay.tsx` when `journeyType === 'daily-rhythm'`
- Walk screen card (`FifteenMinutesCard`) shows "Day X" only — never "Day X of Y"  
- `completeStep` has no duration cap (already infinite) — no backend change needed
- When a member advances to a day with no content yet, `JourneyDay.tsx` shows "You're ahead of the rhythm" placeholder instead of 404
- Enrollment.ts EXEMPT_TYPES includes 'daily-rhythm' so it never counts against the 5-active-Journey limit

## Content Studio
- New "Daily Rhythm" tab (icon: Sun) in Content Studio between Collections and Journeys
- `DailyRhythmStudio.tsx` lists all `daily-rhythm` journeys
- `NewDailyRhythmModal.tsx` creates new tracks (Foundation / Recurring / Seasonal / Church-Specific)
- Clicking "Edit Days" opens `StudioJourneyEditor` — same editor, different context
- `StudioJourneyList.tsx` filters OUT `daily-rhythm` journeys (they belong in the Daily Rhythm tab)

## Walk screen ordering (preserved)
1. 15 Minutes with Jesus (daily-rhythm)
2. Daily Devotional (devotional)
3. This Week's Sermon Companion (companion)
4. Continue Your Journeys
5. This Week
