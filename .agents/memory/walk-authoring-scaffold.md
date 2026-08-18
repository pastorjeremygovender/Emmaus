---
name: Walk authoring scaffold bug and fix
description: Root cause and fix pattern for the Walk Complete masquerading as the next lesson day in StudioJourneyEditor.
---

## The bug

`journeyScaffold` in StudioJourneyEditor was built purely from existing step rows. Opening Day 1 caused the scaffold to rebuild as `[Walk Introduction, Day 1, Walk Complete(day=2)]`. Clicking "Walk Complete" called `handleOpenSection(2)` which created a **regular** step (isCompletionStep=false) titled "Walk Complete" at day 2. This repeated until a spurious day-N+1 step was created with title "Walk Complete" after the configured last day.

## The fix (StudioJourneyEditor.tsx)

1. **`journeyScaffold` useMemo** — now uses `Math.max(journey.durationDays, maxExistingLessonDay)` as `totalDays`. Generates all day slots upfront (Day 1…N) even before their DB rows exist. Walk Complete is always pinned at `totalDays + 1` unless a real completion step already exists.

2. **`handleOpenSection`** — detects the Walk Complete slot by checking `scaffold[scaffold.length-1].day === sectionDay`. If so, passes `isCompletionStep: true` to `addStep` so the correct DB row is created.

3. **`handleSaveComplete`** — was hardcoded to `saveStep(6)`. Changed to `stepsRef.current.find(s => s.isCompletionStep)?.day ?? 6` to work for any walk length.

## DB column names for journey_steps content

Actual DB columns (NOT the camelCase frontend names):
- `teaching_content` (not `devotional`)
- `prayer` (not `prayer_prompt`)
- `todays_action` (not `action_step`)
- `mentor_intro`, `scripture`, `reflection_question`, `memory_verse` ✓

## Startup migrations added

- **duration_days refresh** — UPDATEs all journeys whose `duration_days` doesn't match `MAX(day)` of Published non-completion steps. Fixes admin-created walks (e.g. "Ready to Serve") with `duration_days=0`.
- **Spurious Walk Complete cleanup** — DELETEs steps where `is_completion_step=false AND title='Walk Complete'` AND all content columns are blank. Repairs the "Who Is God?" walk in production.

**Why:** Walk Introduction (day=0) is stored on the journey record, NOT as a step row. Walk Complete IS a step row with `is_completion_step=true`.
