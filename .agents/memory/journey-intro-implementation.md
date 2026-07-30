---
name: Journey Introduction implementation
description: How Journey Introduction is stored and edited — distinct from journey steps.
---

# Journey Introduction — storage and editor wiring

## The root cause of the original bug

`handleOpenSection(0)` attempted to create a DB step with `day: 0`. Step `day` is 1-based
in the schema. The POST either produced a bad record or failed silently. `selectedView` was
never updated, so the center panel never rendered the editor.

## Storage decision: metadata JSONB, not a step

Journey Introduction is stored as `metadata.introductionContent` on the journey record itself —
**not** as a `journey_steps` row. No schema migration required.

**Why:** The introduction belongs to the journey, not to a numbered day. Using a step would
mean every create/read/save path has to handle day-0 as a special case. The metadata JSONB
column already exists and is already used for `scriptureReference`, `nextJourneyId`, etc.

## Files changed

- `artifacts/api-server/src/lib/journey-store.ts` — `FrontendJourney.introductionContent`,
  `toFrontendJourney` (extraction from metadata), `updateJourney` (persists in metadata block).
- `artifacts/project-emmaus/src/contexts/JourneyContext.tsx` — `Journey.introductionContent`.
- `artifacts/project-emmaus/src/lib/journeys-api.ts` — `Journey.introductionContent`.
- `artifacts/project-emmaus/src/pages/admin/content-studio/StudioJourneyEditor.tsx` — all
  editor wiring (see below).

## SelectedView type

`type SelectedView = 'overview' | 'introduction' | number` — `'introduction'` is the new
distinct view for the intro. Never use a numeric 0 for the intro view.

## isSectionClickable change

Added `introIsComplete: boolean` parameter. Day 0 always returns true. Day 1 requires
`introIsComplete || step already exists` (backward compat: existing journeys stay unlocked).

## JourneyIntroEditor props change

Old: `{ step, onMetaChange, onSaveDraft, onContinue }`
New: `{ content, onChange, onSaveDraft, onContinue, saveStatus }`
The textarea now binds to `introContent` state (not `step.devotional`).

## Save flow

`handleSaveIntro` → `updateJourney({ ...journey, introductionContent: introContent })` (awaited).
`handleSaveAndContinueIntro` → awaits `handleSaveIntro` then calls `handleOpenSection(1)`.
Save button shows "Saving…" / "✓ Saved" / "Could not save — try again" based on `introSaveStatus`.

## Completion

`introIsComplete = Boolean(journey?.introductionContent?.trim())`
Derived from the server record, not from local state — ensures it reflects what was actually saved.
