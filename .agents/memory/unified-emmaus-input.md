---
name: Unified Emmaus Input
description: UnifiedEmmausInput replaces AskEmmausBar + separate search on Walk, Discover, and Personal pages. Intent detection routes question → Ask Emmaus conversation, search → grouped live results dropdown.
---

## Rule
`UnifiedEmmausInput` is the single input component for all primary member screens. Do not add `AskEmmausBar` or a separate search `<input>` to Walk, Journeys (Discover), or Personal — they are all replaced.

**Why:** Spec A requires one unified input that auto-detects intent (question vs. search) rather than two separate UI elements.

**How to apply:**
- Import from `@/components/UnifiedEmmausInput`
- Props: `className?`, `onActiveChange?: (active: boolean) => void`
- On Discover (Journeys.tsx): `discoverActive` state gates whether tabs/rooms are visible — `{!discoverActive && ...}`
- On Walk and Personal: no gate needed; just render the component

## Intent detection (inside UnifiedEmmausInput)
- Question words (what, why, how, does, is, can, tell, explain…) → `setPendingMessage()` + navigate to `/personal/ask-emmaus/conversation`
- Bible book names detected in input → treated as search
- Short inputs (≤ 3 words, no question word) → search
- Otherwise → Ask Emmaus conversation

## Search results
- Live grouped dropdown (debounced 350 ms)
- Results grouped by `contentType`; labels from `CONTENT_TYPE_LABEL` in `search-api.ts`
- `search-api.ts` CONTENT_TYPE_LABEL includes `'daily-rhythm': 'Daily Walk'`

## Personal.tsx (Spec B changes, same session)
- Removed: Continue section, Completed section, `fetchNextSteps` import, `ProgressRow` component, `NextStepsItem`/`NextStepsData` types
- Rooms: no Create Room / Join Room buttons; empty state = "Any Rooms you are part of will appear here."
- "Save Prayer Request" renamed to "Send Prayer Request"

## JourneyDetail.tsx
- `FavouriteButton` added next to the h1 heading (flex row with `items-start gap-2`)
