---
name: App entry point rule
description: Where signed-in members always land on normal app launch, and why the previous logic was wrong.
---

## Rule (spec-locked — permanent)
`resolveEntryRoute()` in `lib/entry-route.ts` always returns `/walk`.

Every normal launch — cold start, warm start, PWA open, background resume, force-close — lands on Today's Walk.

## Root cause of the bug
The previous `entry-route.ts` routed members to `/daily-rhythm/day/:n` (their current progress day) when today's rhythm was not yet complete. This bypassed Today's Walk entirely.

**Why:**  The original spec said "open today's unread day." The new permanent spec says "open Today's Walk always — members navigate to their day from there."

## Deep-link exceptions
Push notifications, shared Room invitations, shared Journey links, Bible deep links — these navigate directly to a specific URL and never pass through `Welcome.tsx` at root. They are NOT handled by `resolveEntryRoute`; they bypass it entirely. After the deep-link interaction ends, the next normal launch returns to `/walk`.

## Call sites
Both `Welcome.tsx` useEffect paths (fast path + splash path) call `resolveEntryRoute()`. `Auth.tsx` already redirected non-admin members to `/walk` directly and was not affected.

## How to apply
Never add routing logic that sends a member to a daily-rhythm URL at launch. Any content-page URL from launch must be a genuine deep link passed in through the URL, not derived from progress state.
