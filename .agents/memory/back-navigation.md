---
name: Back navigation system
description: Unified source-aware back navigation across all member content pages — return-context.ts utility, EmmausBackButton component, SourceKey union, tab-specific nextSteps sources, ?tab= URL param on /journeys.
---

# Back Navigation System

## The rule
Every content page reads `?source=` (and optionally `?sourceId=`) from its URL. The back arrow resolves its destination from that source via `resolveReturn()`. Navigation callers are responsible for appending the correct `?source=` when opening content.

## Shared utility
`artifacts/project-emmaus/src/lib/return-context.ts`
- `SourceKey` union: `walk | today | nextSteps | nextStepsDevotionals | nextStepsJourneys | nextStepsSermons | journeyDetail | myJourney`
- `resolveReturn(source, sourceId?, fallback?)` → `{ path, label }` — content-specific fallbacks matter; each page passes the appropriate parent as fallback (e.g. Journey Day → `/journeys?tab=journeys`)
- `encodeSource(key, sourceId?)` → `?source=...` query string fragment

## Shared component
`artifacts/project-emmaus/src/components/EmmausBackButton.tsx`
- Props: `source`, `sourceId`, `fallback` (required), `label?`, `className?`
- Uses `resolveReturn` internally; double-activation guard via `firedRef`

## Tab-specific source values
- `nextStepsDevotionals` → `/journeys?tab=devotionals`
- `nextStepsJourneys` → `/journeys?tab=journeys`
- `nextStepsSermons` → `/journeys?tab=sermons`
- Legacy `nextSteps` → `/journeys` (backward compat, maps to devotionals tab by default)

## /journeys tab URL param
`Journeys.tsx` `sessionTab()` reads `?tab=` from URL first, then falls back to sessionStorage. All navigation to content from Journeys.tsx appends tab-specific source. Returning from content using `resolveReturn` appends `?tab=` to `/journeys`, so the right tab opens automatically.

## Previous Days ?from= param
All Previous Days pages pass the full `source` value through as `?from=` (not a simplified `walk|journeys`). This lets Previous Days pages call `resolveReturn(from)` with a content-specific fallback to get the correct back destination. Example: `DevotionalPreviousDays` uses fallback `/journeys?tab=devotionals`.

## Daily Rhythm back
Daily Rhythm content (DailyRhythmDay, PreviousDays) always defaults to `/walk` — this content is Walk-first and never accessed from Next Steps directly.

**Why:** Every page previously had a hardcoded `/walk` back arrow. Opening a Journey from Next Steps → Back → `/walk` was disorienting. Tab-specific sources allow returning to the exact tab without sessionStorage guesswork.

**How to apply:** When navigating to any content page, always call `encodeSource('nextStepsX')` and append it. When adding new content types, add their SourceKey to return-context.ts and update callers.
