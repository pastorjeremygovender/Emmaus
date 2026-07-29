---
name: Completion flow standardisation
description: How completion panels, return navigation, and sermon companion routing work across all member reading pages.
---

## PreviousDaysScreen (platform standard)
`src/components/PreviousDaysScreen.tsx` — shared Previous Days UI for ALL sequential content.
- Props: `contentTitle`, `entries: PreviousDayEntry[]`, `loading`, `onBack`, `onReviewDay`, `backLabel`, `emptyMessage`.
- `PreviousDayEntry.status`: `'completed' | 'current' | 'locked'` — only 'completed' gets a "Review →" link.
- Routes: `/daily-rhythm/previous`, `/devotional/:seriesId/previous`, `/sermon-companion/:id/previous`, `/journey/:journeyId/previous`.
- `DevotionalPreviousDays` + `SermonCompanionPreviousDays` read `?from=journeys|walk` to resolve back destination.
- `JourneyPreviousDays` + `PreviousDays` always return to `/journeys` and `/walk` respectively.

## Phantom Day prevention (platform rule)
**Rule:** Daily Rhythm may only display and route to a real published entry. Never trust `progress.currentDay` raw — always clamp to `maxPublishedDay` from the published steps list.
- `Walk.tsx`: computes `coreSteps`, `coreMaxPublishedDay`, `coreCaughtUp`, `effectiveCoreDay`, `coreCurrentEntry`. All routing uses `effectiveCoreDay`.
- `entry-route.ts`: `resolveEntryRoute` accepts optional `getStepsForJourney` callback; when provided, clamps launch URL to max published day.
- `FifteenMinutesCard`: `caughtUp` prop + `uptodate`/`waitlatest` states — shows "You're up to date" safe state, never a phantom day number.

## EmmausCompletionCard (design-locked)
Single canonical completion component at `src/components/EmmausCompletionCard.tsx`.
- **Visual**: `bg-teal-50 border-teal-200 rounded-2xl px-5 py-6` card; `CheckCircle2 size=28 text-green-500`; heading `text-[16px] font-medium text-teal-900`; subMessage `text-[13px] text-teal-700`; primary Button `rounded-xl h-11`.
- **`fullScreen` prop**: wraps card in `min-h-[100dvh] flex items-center justify-center` — used by JourneyDay.tsx; default false for inline reading pages.
- `onPreviousDays?: () => void` — when provided, renders "See Previous Days →" teal text link beneath primary button. Only pass when `day > 1` and in live completion mode (not replay).
- DO NOT redesign, add secondary buttons (other than See Previous Days), use gamification language, or create a page-level layout.
- Replaces: `JourneyCompletionPanel.tsx` (deleted) and `ReadingCompletionFooter.tsx` (deleted).
- Button wording: 10 Minutes → "Back to Today's Steps"; all others → "Back to Next Steps".
- Mockup preview at `artifacts/mockup-sandbox/src/components/mockups/EmmausCompletionCardPreview.tsx`.

## Entry-route resolver
`src/lib/entry-route.ts` exports `resolveEntryRoute(journeys, progress)`. Rule:
- `isCompletedToday(prog.lastCompletedAt)` → `/walk`
- otherwise → `/daily-rhythm/day/${prog.currentDay}`
- no journey or no progress → `/walk` / day 1

`Welcome.tsx` imports and calls this instead of the old `getDailyRhythmUrl` (which just used `currentDay` and could route to an unpublished future day).

`DailyRhythmDay.tsx` future-day guard: `!devMode && (isAhead || !step)` → render `<RedirectToWalk>` (replace) instead of showing `AheadOfRhythm`. The screen is now Dev Mode only.

**Why the bug happened:** `completeStep` advances `currentDay` to `day + 1`. Old resolver returned `/daily-rhythm/day/${currentDay}` = future day. That day's step is not yet published → `!step = true` → "ahead of rhythm" on every same-day reopen.

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
