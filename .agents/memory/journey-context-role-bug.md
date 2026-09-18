---
name: journey-context-role-bug
description: superAdmin role missing from refreshJourneys and related functions in JourneyContext — caused all draft walks to vanish on any mutation.
---

# JourneyContext superAdmin role bug

## The rule
Every place in `JourneyContext.tsx` that decides whether to call `api.listJourneys()` vs `api.listPublishedJourneys()` **must** check for BOTH `'admin'` and `'superAdmin'`:

```ts
const isAdmin = user?.role === 'admin' || user?.role === 'superAdmin';
const jList = isAdmin ? await api.listJourneys() : await api.listPublishedJourneys();
```

## Why
`listPublishedJourneys()` returns only Published journeys. Any Draft content (AI-generated walks, new steps, etc.) disappears from the list for superAdmin users after any mutation that triggers a refresh.

The initial load used the correct two-role check; `refreshJourneys`, `addStep`, and `deleteStep` only checked `=== 'admin'`, so superAdmin users saw Drafts on first load but lost them as soon as they edited anything.

## Fixed locations (all in JourneyContext.tsx)
- `refreshJourneys` callback
- `addStep` — post-create duration refresh
- `deleteStep` — post-delete list refresh
