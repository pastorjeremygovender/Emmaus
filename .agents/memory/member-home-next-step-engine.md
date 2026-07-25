---
name: Member Home & Next-Step Engine sprint
description: Walk with Jesus home screen, next-step engine, enrollment state, daily lock, and typography overhaul landed in this sprint.
---

# Member Home & Next-Step Engine

## New library files

- `src/lib/daily-lock.ts` — `localDateKey()`, `isCompletedToday(lastCompletedAt)`, `isNextDayAvailable(lastCompletedAt)`. Uses `toLocaleDateString()` (not a 24h window) for calendar-day accuracy.
- `src/lib/enrollment.ts` — `useEnrollment()` hook; localStorage key `emmaus_enrollment`. Exports `isExemptJourney(j)` — exempt types: `core`, `companion`, `devotional`, plus `j.overloadExempt === true`. Syncs across hook instances via custom `emmaus_enrollment_change` event. Max active non-exempt = 2.
- `src/lib/next-step-engine.ts` — `computeNextStep(journeys, progress, enrollment)` returns `{ primary: NextStep | null }`. Deterministic priority order: core → companion → active growth (most recently continued) → church-wide → browse.

## Architecture rules

**React Rules of Hooks**: All `useMemo` calls in `Walk.tsx` must be BEFORE the `if (!user) return null` guard. Violating this causes React to throw because hook count changes between renders (user starts null on first render).

**Enrollment state**: Stored separately from JourneyContext in localStorage. Components call `useEnrollment()` independently; all share the same key, so state is consistent without a new Context.

**Daily lock for core journeys**: Uses `Progress.lastCompletedAt` (already on the server-synced progress object). If `isCompletedToday(lastCompletedAt)` is true, the daily step is complete. No extra storage needed.

## Typography

- `--app-font-serif` fallback changed from `Georgia, serif` to `ui-sans-serif, sans-serif` — if Crimson Pro fails, falls to modern sans.
- Batch sed replaced `font-serif` → `font-sans` across all member-facing pages (Walk, Journeys, Bible, Personal, Auth, CheckIn, Rooms, ChapterReader, Ask Emmaus components).
- ChapterReader Bible verse text: `font-sans` with `text-[19px] leading-[1.65]` — readable, modern, not formal.
- Crimson Pro remains available for admin/design surfaces via `--font-serif` CSS variable but is not used in member content.

## Navigation

BottomNav labels changed: "Today's Steps"→"Walk", "Next Steps"→"Journeys", "My Bible"→"Bible", "My Walk"→"Personal". Icons updated: Footprints / Library / BookOpen / User.

## Two-Journey limit

Enforced in `Journeys.tsx` via `canActivateMore(journeys, startedIds)`. When blocked:
- Show `JourneyLimitDialog` with both active journeys listed
- User pauses one → `handlePauseFromLimit` → immediately opens the start modal for the blocked journey
- Pausing calls `pauseJourney(id)` from `useEnrollment` → sets enrollment state to `'paused'`

## Welcome/splash

`Welcome.tsx` now auto-redirects authenticated users to `/walk` (or `/admin`) via `useEffect` on `user`. Shows `null` while checking session to prevent splash flash for returning users.
