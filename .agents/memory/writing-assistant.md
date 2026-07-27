---
name: Writing Assistant
description: Emmaus Writing Assistant implementation — pastoral content generation for Daily Rhythm days
---

## What was built

A pastoral writing assistant integrated into Content Studio → Daily Rhythm → Day Editor.

### Entry point
- "Help Me Write" button in the Day Editor header (visible to `admin` | `superAdmin` only)
- Button is a teal pill; toggles the side panel open/closed

### Architecture

**Server: `artifacts/api-server/src/lib/writing-assistant.ts`**
- `generateDailyRhythmDraft(inputs)` → `DraftResult` — calls OpenAI with full system prompt + user context
- `refineContent(action, content, context)` → `string` — focused single-field editing action
- System prompt enforces: Scripture first, no fabricated text, JSON output, style-specific guidance
- OpenAI uses `response_format: { type: "json_object" }` for reliable structured output

**Server: `artifacts/api-server/src/routes/writing-assistant.ts`**
- `POST /api/writing-assistant/generate` — generates all 5 fields or a single targetField
- `POST /api/writing-assistant/refine` — focused editing action on one field
- Permission: checks `userRole` in body must be `'admin'` or `'superAdmin'`
- Registered in `artifacts/api-server/src/routes/index.ts`

**Client: `artifacts/project-emmaus/src/lib/writing-assistant-api.ts`**
- `generateDraft(userId, userRole, inputs)` → `DraftResult`
- `regenerateField(userId, userRole, inputs)` → `DraftResult` (same endpoint with targetField set)
- `refineContent(userId, userRole, action, content, context)` → `{ suggestion: string }`
- `fetchPassageText(bookId, chapter, startVerse, endVerse, translation)` — retrieves passage text for the prompt

**Client: `artifacts/project-emmaus/src/components/WritingAssistantPanel.tsx`**
- Three-step flow: Inputs → Generating → Review
- Inputs: Scripture (with validate + passage retrieval), Central Truth, Connection to Previous Day, Desired Next Step, Additional Direction, Writing Style (5 options), ICC Sermon (optional search)
- Auto-validates scripture on mount if pre-filled from editor
- Review: per-field Accept/Edit/Regenerate/Keep Existing; field expansion/collapse
- "Apply Accepted Fields to Editor" → calls `onApplyField(field, value, 'replace' | 'append')`
- Conflict resolution dialog when editor field already has content
- Default writing style: `pastor-jeremy`

**Modified: `DailyRhythmDayEditor.tsx`**
- `FieldRefiner` component: small "AI" button under each textarea
- Opens dropdown with field-specific refine actions (9 action types)
- Shows suggestion with Replace / Insert Below / Dismiss options
- 5 fields wired: mentorIntro, devotional, prayerPrompt, actionStep, closingText
- WritingAssistantPanel rendered as fixed right overlay (440px) when `showAssistant` is true

### Key constraints
- Content stays Draft always — no auto-publish
- Scripture passage text is used in the prompt only — never stored; only the reference is stored
- Permission is enforced both client-side (isEditor check) and server-side (userRole check)
- No member names, prayer requests, or progress data are sent to OpenAI

### Field mapping (editor DayForm → DraftField)
- `mentorIntro` = Greeting
- `devotional` = Reflection
- `prayerPrompt` = Prayer
- `actionStep` = Your Next Step
- `closingText` = Closing

### Refine actions by field
- mentorIntro: warmer, clearer, shorter, new-believer
- devotional: warmer, clearer, shorter, paragraph-flow, jesus-central, new-believer
- prayerPrompt: warmer, clearer, shorter, new-believer, another-prayer
- actionStep: clearer, shorter, another-next-step, check-repetition
- closingText: warmer, clearer, shorter

**Why:** The spec requires field-by-field non-destructive review; passage text retrieved client-side before generation; no auto-publish under any circumstances.
