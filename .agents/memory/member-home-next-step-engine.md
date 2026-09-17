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

BottomNav labels: "My Emmaus"→"/walk", "Discover"→"/journeys", "My Bible"→"/bible", "My Journey"→"/personal". Icons updated: Footprints / Library / BookOpen / User.

## Two-Journey limit

Enforced in `Journeys.tsx` via `canActivateMore(journeys, startedIds)`. When blocked:
- Show `JourneyLimitDialog` with both active journeys listed
- User pauses one → `handlePauseFromLimit` → immediately opens the start modal for the blocked journey
- Pausing calls `pauseJourney(id)` from `useEnrollment` → sets enrollment state to `'paused'`

## Walk screen fixed section order (correction sprint)

Order is now FIXED — the next-step engine may not rearrange it:
1. 10 Minutes with Jesus (always first, most prominent, `bg-primary/5` treatment)
2. This Week's Sermon Devotional (companion journey type)
3. Daily Devotional (devotional journey type — hidden cleanly if none published)
4. Continue Your Journeys (active non-exempt growth journeys only)
5. This Week (weekly progress)

Removed from Walk: "Ready for you" card, Ask Emmaus inline card, Browse Journeys link/section.

## Splash screen

`Welcome.tsx` is a pure auto-transitioning splash (no buttons). Uses sessionStorage key `emmaus_splash_shown` to skip during in-app SPA navigation but show on fresh load/reload. Waits for `max(2s, auth resolved)` then navigates: authenticated → `/walk`, unauthenticated → `/auth`. The old Welcome page had buttons — that pattern is replaced by the pure splash; unauthenticated users land on /auth directly.

**Why:** Spec requires splash on every fresh launch without skipping for authenticated users, but no repeat during tab navigation.

## First-time My Emmaus defaults

Brand-new member accounts are initialized once on the server, across each independent
progress system. The “First Steps - Come and See” default is a collection card, so its
first published child journey is seeded rather than looking for a journey with the
collection's title.

**Why:** Collection-backed cards are the member-facing unit, while progress belongs to a
child journey. Account-backed initialization prevents removed defaults from returning on
later visits or another device.

**How to apply:** Keep the initialization one-time and engagement-aware: seed only when
the profile has no initialization marker and no existing journey, devotional, or companion
engagement; never repopulate after removal.
