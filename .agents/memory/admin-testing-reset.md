---
name: Admin Testing — Reset Progress
description: Admin-only Testing page with three progress reset actions; route and frontend structure.
---

## What was built

**Admin → Testing** page (`/admin` → "Testing" sidebar item).

### Backend
- New route file: `artifacts/api-server/src/routes/admin-reset.ts`
- Registered in `routes/index.ts` as `router.use(adminResetRouter)`
- Auth guard: `requireAuth` + `isAdmin(userId)` — admin/superAdmin only
- Routes:
  - `GET  /api/admin-reset/content-list` — returns `{ journeys, devotionals, companions }` for the UI list
  - `POST /api/admin-reset/daily-rhythm` — `resetProgress(userId, dailyRhythmId)` (keeps enrolled, Day 1)
  - `POST /api/admin-reset/journey/:id?kind=journey|devotional|companion` — kind selects the store function
  - `POST /api/admin-reset/everything` — removes all progress rows for the user (all three stores)

### Reset store functions used
| Kind | Function |
|---|---|
| journey | `journeyStore.resetProgress(userId, id)` — resets to Day 1, stays enrolled |
| devotional | `devotionalStore.removeSeries(userId, id)` — removes progress row |
| companion | `companionStore.removeCompanion(userId, id)` — removes progress row |
| everything-journeys | `journeyStore.removeJourneyProgress(userId, id)` per row |
| everything-devotionals | `devotionalStore.removeSeries(userId, id)` per row |
| everything-companions | `companionStore.removeCompanion(userId, id)` per row |

### Frontend
- API client: `artifacts/project-emmaus/src/lib/admin-reset-api.ts`
- Page: `artifacts/project-emmaus/src/pages/admin/Testing.tsx`
- `Admin.tsx` updated: added `'testing'` to `AdminSection` type, `NAV_ITEMS`, `sectionLabel`, `renderContent`, import

### Local cache
`clearLocalProgressCache()` removes all `emmaus_*` keys from localStorage after any reset.

**Why:** `emmaus_enrollment` and other emmaus_ keys are optimistic UI caches that would show stale state after a server-side reset without this clear.

### Confirmation pattern
- Daily Rhythm: single confirmation
- Individual Journey: single confirmation (per-item)
- Reset Everything: two confirmations in sequence (double gate)

### No DB migrations
All tables already exist. No schema changes needed.
