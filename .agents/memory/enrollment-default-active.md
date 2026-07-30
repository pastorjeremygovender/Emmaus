---
name: Enrollment default-to-active bug class
description: getState() returns 'active' as default for unstarted journeys — any caller using it alone to decide navigation silently treats a new walk as already started.
---

## The rule

Never use `getState(journeyId)` alone to decide whether to navigate directly to a Walk step.
Always gate the "resume" branch on `startedIds.has(journeyId)` (i.e. a real DB progress record exists) **first**.

```ts
// WRONG — getState defaults to 'active' for any journey not in localStorage
if (getState(journeyId) === 'active') {
  setLocation(`/journey/${id}/day/${progress[id]?.currentDay ?? 1}`);
  return;
}

// CORRECT — only resume when there is a real progress record
if (startedIds.has(journeyId)) {
  setLocation(`/journey/${id}/day/${progress[id]?.currentDay ?? 1}`);
  return;
}
// Falls through to open the JourneyStartModal
```

**Why:** `enrollment.ts` `getState` returns `enrollment[journeyId] ?? 'active'`. A journey with no localStorage entry (never started) therefore appears 'active'. Without the `startedIds` guard the start modal never opens, `startJourney()` is never called, and the user lands on the Walk content with no enrollment record.

**How to apply:** Every new page or component that lets a member start a Walk must follow this pattern. The three places this was fixed: `CollectionPage.handleStart`, `ExploreJourneys.handleStart`, and `Walk.tsx goToJourney` (dead startJourney guard removed there).

## Safe callers (do NOT change)

- `activeGrowthCount` in `enrollment.ts` additionally requires `startedIds.has(j.id)` — safe.
- `next-step-engine.ts` companion eligibility defaults to active intentionally — everyone sees the weekly companion unless they explicitly paused it.
- `Walk.tsx activeGrowthJourneys` filter requires `progress[j.id]` first — safe.
- `JourneyDetail.tsx` `isActive`/`isPaused` additionally require `isStarted` from progress — safe.
