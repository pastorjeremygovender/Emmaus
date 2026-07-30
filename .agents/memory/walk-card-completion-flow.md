---
name: Walk card navigation and completion flow
description: CollectionPage JourneyCard is now a single clickable entry → JourneyDetail (Walk overview). Completion always returns to JourneyDetail via "Back to Walk", not directly to a lesson or Next Steps.
---

## The rules

0. **Journey card navigates directly to the current lesson.** In the Journeys tab (`JourneysPanel` in `Journeys.tsx`), clicking Continue calls `onOpenJourney(col)` which resolves the target walk (prefer in-progress → not-started → first) and navigates to `walk.route?source=nextStepsJourneys`. The `route` is pre-computed server-side as `/journey/:id/day/:currentDay`. No Walk overview, no collection page. "View Previous Steps →" shown when any walk has been started.

1. **Walk card has no Continue button.** The whole card body is one `<button onClick={onDetails}>` pointing to JourneyDetail. Bookmark and Details are separate buttons below the card body (never nested inside it). No nested interactive HTML.

2. **CollectionPage holds no start-modal logic.** The start modal (enrollment check, room start) lives in JourneyDetail only. CollectionPage removed: `handleStart`, `handleStartAlone`, `handleStartWithRoom`, `pendingJourneyId`, `journeysWithIntro`, `JourneyStartModal`.

3. **`backSource`/`backSourceId` thread.** JourneyDetail appends `&backSource=…&backSourceId=…` to every JourneyDay URL. This carries JourneyDetail's own back context (e.g. `collectionDetail` + collectionId) through to the lesson page so that "Back to Walk" can reconstruct the full URL and the chain remains intact.

4. **Completion card — standard Emmaus pattern.** Non-final lesson: heading "Lesson complete.", "Continue to Next Lesson" (primary, resolves next step from `allSteps.find(s => s.day > day)`), "Back to Next Steps" (return via `resolveReturn`), "View Previous Steps →". Final lesson: "Journey complete. May the Lord continue His work in your life.", "Back to Next Steps", "View Previous Steps →". Button label on lesson page is "Finished" (not "Complete Today").

5. **JourneyDay back button** also navigates to `journeyDetailUrl` (not EmmausBackButton) so the back arrow from within a lesson preserves the same chain as the completion card.

**Why:** Without the backSource thread, arriving at JourneyDetail after completion or lesson-back had no source params, so JourneyDetail's back arrow defaulted to Next Steps instead of Coming to Jesus.

## How to apply

- Every new content type opened from JourneyDetail should receive `backSource`/`backSourceId` in its URL.
- The completion/finish component for any Walk content should use "Back to Walk" → `/journeys/:journeyId?source=…` pattern.
- Collection cards for any content type: the full card body is one button, secondary actions (Bookmark, share) are separate elements below it.
