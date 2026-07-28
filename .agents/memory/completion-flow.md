---
name: Completion flow standardisation
description: How completion panels, return navigation, and sermon companion routing work across all member reading pages.
---

## JourneyCompletionPanel
Single reusable component at `src/components/JourneyCompletionPanel.tsx`. Props: `heading`, `subMessage?`, `returnLabel`, `onReturn`, `className?`. Styling: `bg-teal-50 border-teal-200 rounded-2xl` — match SermonCompanionReader's original inline panel.

## Source-aware return navigation
All reading pages accept `?source=today` or `?source=nextSteps` as a query param.
- Default for daily devotionals → `today` (returns to /walk)
- Default for sermon companions → `nextSteps` (returns to /journeys)
Walk.tsx passes `?source=today` when navigating. Journeys.tsx passes `?source=nextSteps`.
Both `DevotionalDay.tsx` and `SermonCompanionReader.tsx` read `new URLSearchParams(window.location.search).get('source')` on mount.

## Ten Minutes with Jesus auto-return
`DailyRhythmDay.tsx`: after `handleComplete`, sets `justCompleted = true`. A `useEffect` auto-navigates to `/walk` after 2000 ms. `JourneyCompletionPanel` is shown in-page so the user can also tap immediately. No full-page screen. `ReadingCompletionFooter` is kept for replay mode only.

## Sermon Companion routing — critical
Walk.tsx previously used `publishedJourneys.find(j => j.journeyType === 'companion')` → `/journey/:id/day/:day` → `JourneyDay.tsx` which had no step data → "Journey step not found."

**Fix**: Walk.tsx now loads the current companion from `localStorage.getItem('emmaus_admin_settings')?.currentWeeklySermonCompanionId`, fetches `/api/sermon-companions/:id/member`, and navigates to `/sermon-companion/:id/day/:currentDay`. The `scCompanion` state+effect must be declared **before** the `if (!user) return null` early return to obey Rules of Hooks.

Journeys.tsx already handled this correctly via `handleSermonCompanionAction` checking `item.route.startsWith('/sermon-companion/')`.

## View Previous Days in Next Steps tab
`Journeys.tsx` `DevotionalCard` now accepts `onViewPreviousDays?` prop. `DevotionalsPanel` passes it for any item where `memberProgressState !== 'not-started'`. Navigates to `/devotional/:seriesId/previous`.

**Why:** Walk.tsx's DevotionalCard already had this but Journeys.tsx didn't, causing inconsistency.
