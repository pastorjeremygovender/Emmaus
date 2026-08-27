---
name: Completion card back navigation rule
description: Universal rule for how back buttons on completion cards must be implemented to avoid circular navigation loops.
---

# Completion card back navigation rule

## The rule
**Completion card `onReturn` callbacks must always use the shared `goBackOrFallback()` helper.** The helper uses a marked, depth-tracked Emmaus history entry to pop one in-app route, and uses a replacing fallback only for direct/deep-linked entries.

"View Previous Steps →" / "See Previous Days →" secondary links are the ONLY place `setLocation` (forward navigation) is correct, because those are explicit forward-navigation choices.

**Why:**
Previous Days pages (PreviousDays.tsx, JourneyPreviousDays.tsx, DevotionalPreviousDays.tsx, SermonCompanionPreviousDays.tsx) all use `history.back()` for their own back button. If a completion card also uses `setLocation` to "go back", it pushes a new entry onto the history stack. The user then presses the back arrow on the Previous Days page, which pops back to the content page. The content card still shows. They press back again — loop forever.

## Pattern to follow

```tsx
// ✅ CORRECT — completion card back button
onReturn={() => goBackOrFallback(returnPath, setLocation)}

// ✅ CORRECT — "View Previous Steps →" secondary link (forward navigation)
onPreviousDays={() => setLocation(`/journey/${journeyId}/previous?from=${source ?? 'walk'}`)}

// ❌ WRONG — completion card back button (creates circular loop)
onReturn={() => setLocation(returnPath)}
```

## Affected files (all now fixed)
- `DailyRhythmDay.tsx` — justCompleted + replay cards
- `JourneyDay.tsx` — non-final completion + replay cards
- `DevotionalDay.tsx` — justCompleted completion card
- `SermonCompanionReader.tsx` — justCompleted + replay cards
- `WalkCompletePage.tsx` — walk complete card

## DailyRhythmDay special case
`goToPreviousDays` (used for header back arrow when replaying from Previous Days) must use `goBackOrFallback()` — it must NOT use a direct `setLocation` even though the destination is Previous Days.

`openPreviousDays` is the separate function that uses `setLocation` — only used for the "See Previous Days →" secondary link (when user arrived from Today's Steps and wants to navigate forward to Previous Days).
