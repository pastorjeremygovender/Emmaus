---
name: Daily Discipleship Rhythm sprint
description: Architecture decisions and patterns from the Daily Discipleship Rhythm sprint.
---

## Active Journey limit
`MAX_ACTIVE_JOURNEYS = 5` exported from `lib/enrollment.ts`. Core/companion/devotional types and `overloadExempt` journeys never count.

## Daily gate system
- `lib/daily-gate.ts` — `useDailyGate()` hook, `isGatedByDailyGate(j)` function.
- Gate = before today's 15 Min with Jesus (core journey) is completed.
- Gate is reactive: clears instantly via JourneyContext progress update, no reload needed.
- `requiresDailyGate?: boolean` stored in `metadata` JSONB on journeys table (same pattern as `scriptureReference`/`nextJourneyId`).
- Default behaviour: gate ON. Set to `false` for pastoral journeys (Crisis Care, Grief Support etc).
- Gate shows gentle "Complete today's 15 Minutes with Jesus" CTA — never error/guilt language.

## Journey metadata JSONB pattern
`scriptureReference`, `nextJourneyId`, `requiresDailyGate` all stored in the existing `metadata jsonb` column.
`toFrontendJourney()` reads them with `(meta.field as Type) || undefined`.
`updateJourney()` does a SELECT to get current metadata, merges, then writes.
**Why:** avoids DB migrations for fields that are additive and optional.

## Onboarding flow
- `lib/onboarding.ts` — `isOnboarded()` / `markOnboarded()` (localStorage key `emmaus_onboarded`).
- Kept in a separate lib file so `Onboarding.tsx` only exports the default component — required for Vite Fast Refresh to work without full-page reloads.
- Welcome.tsx routes first-time authenticated members to `/onboarding` instead of `/walk`.

## Walk screen order (spec)
15 Min → Daily Devotional → Sermon Companion → Continue Journeys → This Week

## Journeys screen order (spec)
Continue Your Journeys → Explore Journeys (card) → Saved → Completed
Removed: Suggested for You, ManageSection accordion.

## Limit dialog wording (spec)
"You're already walking through five journeys. To begin another one, pause or complete one of your current journeys."
Buttons: "Manage My Journeys" | "Cancel"
