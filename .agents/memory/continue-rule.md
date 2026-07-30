---
name: Continue rule & route guards
description: Platform-wide spec-locked rule governing when the Continue button appears; redirect-not-dead-end guard decision.
---

# Continue rule & route guards

## The rule (spec-locked)
A user must NEVER be shown a Continue button unless a valid next published item exists. This is a permanent product rule, not a preference.

## Field name mismatch — do not confuse
Journey steps use `day` (integer). Devotional entries and Sermon Companion entries use `dayNumber`. The shared helpers in `lib/resolve-next-entry.ts` enforce this split. If a new content type is added, check which field name it uses before wiring up Continue.

## Route guard decision
When a user arrives at an unavailable day (stale URL, outdated Continue link, or manual navigation):
- **Redirect** to the return destination — never show a dead-end message.
- Use `{ replace: true }` so the browser Back button doesn't loop the user back.
- The redirect effect must reference only values declared **before** it in the component to avoid temporal-dead-zone TypeScript errors.
- The explicit render guard (`if (!data || !entry) return null`) should omit any `loading &&` prefix so TypeScript can narrow the values for the remainder of the component (the loading guard above it already handles the loading state).

**Why:** Dead-end messages ("Day X is not available yet.") trained users to distrust navigation. Redirect removes the dead end entirely.

## Admin vs member Continue behaviour
Members receive only Published steps from the API (filtered at load time). The shared helpers explicitly filter for `status === 'Published'` so admin users — who receive all steps including Draft — see the same Continue behaviour as members: Continue is never shown for Draft content.
