---
name: Journey step status inheritance
description: createStep inherits parent status; refreshJourneyDuration counts Published steps only; startup migration repairs existing data on first deploy.
---

## The rule

`createStep` now fetches the parent journey and inherits its status:
- Parent is `Published` → step is `Published`
- Parent is `Draft` (or unknown) → step is `Draft`

**Why:** Steps were always created as `Draft` regardless of parent status. Steps added to a Published journey after publish stayed Draft and were invisible to members (the bug that affected `what-went-wrong`).

**How to apply:** All creation paths (manual Add Step, import, generate, builder, duplicate) go through `createStep`. Duplicate always creates a new journey as Draft first, so its steps are Draft by inheritance — correct.

## refreshJourneyDuration

Only counts `Published` steps when computing `durationDays`. Draft pseudo-steps (e.g. "Journey Complete" at day 6) must not inflate the lesson total and break `isFinalStep` logic.

**Why:** `what-went-wrong` had a "Journey Complete" Draft step at day 6. Before fix, if it got Published, `durationDays` would have been 6 instead of 5, making day 5 not the final step.

## Startup migration (idempotent data repair)

`repairStepStatuses()` runs in `runStartupMigrations()` on every boot:
1. Finds all Published journeys.
2. Bulk-publishes any Draft steps belonging to them.
3. Sets `created-in-god-s-image` to Draft if it's still Published (accidental placeholder in the Coming to Jesus collection).

After the first successful run the UPDATE matches 0 rows — pure no-op thereafter.

## Client-side workaround removed

`JourneyContext.tsx` previously granted step visibility via parent-journey status as a workaround. With the server fix in place, members now see only `s.status === 'Published'` steps — the straightforward canonical filter.

## Canonical resolver

`listSteps(journeyId)` returns ALL steps (no status filter) — intentional for admin use. Client filtering is the gate for members. `JourneyPreviousDays` further narrows to `status === 'Published' && day < currentDay`.

## Tests

24/24 pass in `src/lib/__tests__/journey-step-status.test.ts`:
- A: status inheritance
- B: duration counts Published steps only
- C: Continue resolver (no progress → step 1; mid-journey; all-complete → null; Draft excluded)
- D: Previous Steps filter (desc order; Draft excluded; empty state)
- E: isFinalStep logic
- F: import/generate always create as Draft
