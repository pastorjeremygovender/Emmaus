---
name: Emmaus Journey Standard
description: Official field names, order, and completion rules for Journey authoring.
---

# Emmaus Journey Standard

## Official field order and names (as of 2026-07-30)

Every Journey day must be authored in this order:

| Field label (UI) | Data field       | Notes                                      |
|------------------|------------------|--------------------------------------------|
| Step Title       | `title`          | Required; auto-filled with section label   |
| Welcome          | `mentorIntro`    | Optional opening paragraph                 |
| Scripture        | `scripture`      | Single reference, e.g. "John 3:16–17"      |
| Reflection       | `devotional`     | Main content; key completion field         |
| Prayer           | `prayerPrompt`   | —                                          |
| Today's Step     | `actionStep`     | One practical response                     |
| Looking Ahead    | `lookingAhead`   | Short intro for tomorrow; stored in content JSONB |

Previous labels: "Introduction" was Welcome, "Content" was Reflection, "Next Step" was Today's Step.

## Looking Ahead storage

`lookingAhead` is stored in the `content` JSONB column (same column as `blocks` and `closingText`).
It is NOT a dedicated DB column — no migration needed.
Every `saveStep` call always sends `{ ...stepData, blocks }`, so `lookingAhead` is always included in
the content patch alongside blocks.

## Completion rules

**Why:** Opening a section (which creates the step row) previously marked it "complete" (green tick).
This was wrong — empty steps showed as done.

**Rule:** A step is complete only when it has been **saved** with non-empty content in at least one key
field: `devotional`, `actionStep`, `prayerPrompt`, or `mentorIntro`.

```ts
function isStepComplete(step): boolean {
  return Boolean(step?.devotional?.trim() || step?.actionStep?.trim() ||
                 step?.prayerPrompt?.trim() || step?.mentorIntro?.trim());
}
```

`introIsComplete` for Journey Introduction: `Boolean(journey?.introductionContent?.trim())` — unchanged.

## Sequential unlock rule

- A section already opened (step row exists) stays **accessible** regardless of content.
- The NEXT locked section only **unlocks** when the preceding section is `isStepComplete`.
- This means Day 2 stays locked until Day 1 has saved content, even if Day 1 was opened.

**How to apply:** Both `isSectionClickable` (unlock check) and all `started` variables (green tick)
use `isStepComplete`, not step existence.
