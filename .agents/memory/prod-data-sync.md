---
name: prod-data-sync
description: How authored content is kept in sync between dev and production databases, and the permanent countermeasure against drift.
---

## The problem
Replit uses separate dev and production PostgreSQL databases. Authored content (chapter overviews, journeys, steps) created via the admin UI in dev never reaches production automatically.

## The permanent solution (three parts)

### 1. export:seed script — runs before every deploy
`artifacts/api-server/src/scripts/export-seed.ts`
`pnpm --filter @workspace/api-server run export:seed`

Dumps the current dev DB to two seed files:
- `src/data/prod-sync-overviews.json` — all Published chapter overviews (247+)
- `src/data/prod-sync-journeys.json` — all journeys + steps

Blocked in NODE_ENV=production. Safe to run multiple times.

### 2. data-safety workflow — export runs before every integrity check
Command: `export:seed && checksum:content > /tmp/pre-deploy-checksum.json && test:integrity`

This means seed files are always refreshed before the pre-deploy snapshot is taken. You cannot deploy stale seed files — the export runs first.

### 3. prod-data-sync.ts — always-upsert on every boot
`artifacts/api-server/src/lib/prod-data-sync.ts`
Called from `app.ts` after `runStartupMigrations()`.

- **Chapter overviews**: `ON CONFLICT (book_id, chapter) DO UPDATE SET ...` — always syncs, not just when table is empty
- **Journeys**: `ON CONFLICT (id) DO UPDATE SET ...`
- **Steps**: `ON CONFLICT (id) DO UPDATE SET ...`
- Also deletes stale old journey IDs that don't exist in dev (OLD_JOURNEY_IDS list)
- Non-fatal — any failure logs a WARN but never aborts server startup

## Key schema facts for journey_steps
- `content` column is **JSONB**, not text — pass null or `JSON.stringify(obj)`, never empty string ""
- No `created_by`/`updated_by` columns on `journey_steps` (unlike `journeys` and `bible_chapter_overviews`)

## How to add new content types to the sync
1. Add the SELECT to `export-seed.ts`
2. Add the upsert loop to `prod-data-sync.ts`
3. Add the cp() call in `build.mjs` if it's a separate file

**Why:** Without this, every new deployment that adds authored content requires a manual migration. The three-part system makes it automatic and impossible to miss.
