# Journey Migration Notes

## What Changed

Journey data was previously hard-coded in `artifacts/project-emmaus/src/lib/demo-data.ts` and persisted in `localStorage`. It is now stored in Postgres and served via the Journey API.

## Seeded Journeys

The seed script (`artifacts/api-server/src/scripts/seed-journeys.ts`) inserts the following journeys if they don't already exist:

| ID | Title | Days | Status |
|---|---|---|---|
| `15-minutes-with-jesus` | 15 Minutes with Jesus | 7 | Published |
| `gods-kindness-restores-the-broken` | God's Kindness Restores the Broken | 5 | Published |

The seed script is idempotent — running it twice is safe.

## localStorage Migration

On first login after the switch to the API-backed context, `JourneyContext` performs a one-time progress migration:

1. Reads `emmaus_progress` from `localStorage`.
2. Sends it to `POST /api/journeys/progress/import` (only imports journeys with no existing server-side progress — never overwrites).
3. Removes `emmaus_progress` from `localStorage` on success.

Reflections remain in `localStorage` as a local cache (they are not migrated to the server in this release).

## Walk Through Luke

"Walk Through Luke" is a Bible Journey (24 chapters) defined in `artifacts/project-emmaus/src/lib/bible-data.ts`. It has **not** been migrated to the Journey CMS — it continues to operate through the Bible Engine (`BibleJourney` type, rendered via the Bible reading flow). A future migration task can move it into the CMS if desired.

## API Endpoints Reference

All endpoints are mounted at `/api/journeys`:

```
GET    /api/journeys               → { journeys: Journey[] }      (admin: all, user: use /published)
GET    /api/journeys/published     → { journeys: Journey[] }      (Published only)
POST   /api/journeys               → Journey                       (create)
GET    /api/journeys/:id           → Journey
PATCH  /api/journeys/:id           → Journey                       (update)
DELETE /api/journeys/:id           → { ok: true }
POST   /api/journeys/:id/publish   → Journey
POST   /api/journeys/:id/archive   → Journey
POST   /api/journeys/:id/duplicate → Journey

GET    /api/journeys/:id/steps          → { steps: Step[] }
POST   /api/journeys/:id/steps          → Step
PATCH  /api/journeys/:id/steps/:day     → Step
DELETE /api/journeys/:id/steps/:day     → { ok: true }

GET    /api/journeys/progress?userId=            → { progress: Record<string, Progress> }
POST   /api/journeys/:id/progress/start          → Progress   (body: { userId })
POST   /api/journeys/:id/progress/complete-step  → Progress   (body: { userId, day, reflectionText? })
POST   /api/journeys/progress/import             → { ok: true }
```
