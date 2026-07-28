---
name: Daily Devotionals module
description: Architecture decisions and gotchas for the Daily Devotionals content type.
---

## What it is
A first-class content type separate from Journeys. Three DB tables: `devotional_series`, `devotional_entries`, `devotional_progress`. Scripture text is never stored — only the reference; passage loads at read time from the member's chosen translation.

## Auth pattern
Role-gate for admin routes uses `req.headers["x-user-role"]` (same approach as `requireSuperAdmin` in auth.ts). There is no `req.session` type in the Express Request — do not access it. Use `requireAuth(req, res)` for member routes and the `guardAdmin` helper (in devotionals.ts) for admin routes.

## lib/db must be rebuilt after schema changes
The api-server uses TypeScript project references (`tsconfig.json` → `"references": [{ "path": "../../lib/db" }]`). TypeScript reads from `lib/db/dist/` (declaration files), not source. After adding a new schema file to `lib/db/src/schema/`, run:
```
cd lib/db && npx tsc --build tsconfig.json
```
This generates the `.d.ts` files the api-server type-checker needs. The runtime bundle (esbuild) reads source directly and doesn't need this step — the app runs fine without it, but `tsc --noEmit` will report missing exports.

**Why:** `lib/db` has `"composite": true` and `"emitDeclarationOnly": true` in its tsconfig, which is the TypeScript project-references pattern. Forgetting the build step causes spurious `Module has no exported member` errors in the api-server.

## Startup migration
Tables are created via `startup-migrations.ts` with `CREATE TABLE IF NOT EXISTS` — idempotent, runs on every server start. Log line: `Startup migration: devotional tables created (idempotent)`.

## Frontend routes
- `/devotional/:seriesId/day/:day` → `DevotionalDay.tsx`
- `/devotional/:seriesId/previous` → `DevotionalPreviousDays.tsx`

## Walk.tsx card
The `DevotionalCard` only shows if the member has already started a series (`progress !== null`). It does not auto-start a series — the member must open the series page first (which calls `POST /api/devotionals/:id/start`).

## Content Studio tab
Tab id is `devotionals`, placed between Daily Rhythm and Journeys in `TOP_NAV`. Three views: `devotionals` → `devotional-editor` → `devotional-entry-editor`.

## Field component limitation
The shared `Field` component does not accept a `description` prop. Add hint text as a `<p className="mt-1 text-[11px] text-gray-400">` inside the Field's children instead.
