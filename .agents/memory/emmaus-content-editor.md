---
name: EmmausContentEditor shared layout
description: Shared two-panel layout shell for all four Emmaus day/entry editors — how it works and what must be maintained.
---

## The shared component

`artifacts/project-emmaus/src/pages/admin/content-studio/EmmausContentEditor.tsx`

Accepts: `toolbar`, `fields`, `preview`, `aboveSplit?`, `dialogs?` as React.ReactNode slots.
The `preview` slot must always be the **actual member renderer** — never a fake approximation.

## Adapter pattern per content type

| Editor file | Component | Variant / notes |
|---|---|---|
| `DevotionalEntryEditor.tsx` | `DevotionalReading` preview | Benchmark — visual reference for all others |
| `DailyRhythmDayEditor.tsx` | `DailyRhythmReading` preview | `variant='daily-rhythm'` (default) or `variant='journey'` |
| `SermonEditor.tsx` → `CompanionDayEditor` | `DevotionalReading` preview | Embedded in Sermon Companion tab; companion status tracked separately in parent |

## Journey variant labels

`DailyRhythmDayEditor` has `variant?: 'daily-rhythm' | 'journey'` prop.
- `daily-rhythm` (default): "Reflection", "Your Next Step"
- `journey`: "Today's Journey", "Today's Step"

ContentStudio passes `variant="journey"` for `journey-day-editor` case.

## Companion status tracking

`SermonEditor` tracks `companionStatusLocal` (string, 'Draft'/'Published') separately from the sermon status.
- Initialized from `c.status` when `getCompanion()` resolves
- `handleCompanionPublish` → `publishJourney(companionId, userId)`
- `handleCompanionUnpublish` → `updateJourney(companionId, { status: 'Draft' }, userId)`
- Passed as `companionStatus` + `onCompanionPublish` + `onCompanionUnpublish` + `onBack` into `CompanionDayEditor`

**Why:** Companions are journeys in the DB. `publishJourney` and `updateJourney` are in `journeys-api.ts`. The companion has its OWN `ContentStudioToolbar` inside the Companion tab (separate from the outer Sermon toolbar).

## CompanionDayEditor back button

`onBack` passed as `() => setActiveTab('sermon')` — navigates back to the Sermon tab, not out of SermonEditor.
