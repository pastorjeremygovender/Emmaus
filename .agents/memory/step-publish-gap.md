---
name: Step publish gap — Published journey with Draft steps
description: Journey can be Published while all its steps remain Draft. Members get an empty walk and the route guard bounces them back to JourneyDetail.
---

## The rule

When a journey is set to Published, all its Draft steps must be published automatically.
On the client, steps belonging to a Published journey must be visible to members regardless of their individual step status.

**Why:** `journey.status` and `step.status` are independent fields. An admin who publishes a journey but never explicitly publishes each step produces a Published journey with zero member-visible steps. `JourneyContext` was filtering to `step.status === 'Published'` only, so `getStepsForJourney` returned `[]` → `firstStepDay` fell back to `1` → `JourneyDay` found no step → route guard fired → bounce to JourneyDetail = "Continue returns to previous page."

## What was changed

1. **`JourneyContext.tsx` member step filter**: `s.status === 'Published' || publishedJourneyIds.has(s.journeyId)` — all steps of a Published journey are visible to members.

2. **`journey-store.ts` `updateJourney`**: when `data.status === 'Published'`, also run `UPDATE journey_steps SET status = 'Published' WHERE journey_id = :id AND status = 'Draft'`.

## How to apply

- Any new journey publish flow (bulk import, AI generation, manual create) should call `updateJourney` with `status: 'Published'` to get the auto-publish cascade.
- The client-side filter ensures already-deployed journeys with Draft steps work without a data migration.
