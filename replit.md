# Project Emmaus

A church discipleship platform that turns Sunday sermons into a week of daily content. Members walk through Daily Rhythm devotionals, Sermon Companions, Journeys, and Bible reading. Pastors manage everything from the Content Studio admin.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080 in dev)
- `pnpm --filter @workspace/project-emmaus run dev` — run the frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `API_BIBLE_KEY`, `YOUTUBE_API_KEY`, `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Wouter (client-side routing), Tailwind CSS
- API: Express 5 + pino logger, served at `/project-emmaus/api/*`
- DB: PostgreSQL + Drizzle ORM (`lib/db`)
- AI: OpenAI (sermon generation, Ask Emmaus), API.Bible (scripture)
- Build: esbuild (API bundle), Vite (frontend)

## Where things live

- `artifacts/api-server/src/routes/` — all API routes (journeys, sermons, bible, companions, devotionals, etc.)
- `artifacts/api-server/src/lib/` — store functions (journey-store, sermon-companion-store, admin-sermon-store, etc.)
- `artifacts/api-server/src/lib/sermon-generator.ts` — sermon generation pipeline (detection, theme confirmation, draft generation, companion generation)
- `artifacts/project-emmaus/src/pages/Admin.tsx` — admin shell with auth guard
- `artifacts/project-emmaus/src/pages/admin/content-studio/ContentStudio.tsx` — all Content Studio navigation and view rendering
- `artifacts/project-emmaus/src/contexts/AdminContext.tsx` — sermon list state (localStorage + server reconciliation)
- `lib/db/src/schema/` — PostgreSQL schema (journeys, sermon-companions, devotionals, collections)
- `artifacts/api-server/data/sermons/admin-drafts.json` — file-backed sermon draft store

## Architecture decisions

- Sermon companions use two storage models: legacy (`journeys` table, slug IDs, `journeyType='companion'`) and current (`sermon_companion` table, UUID IDs). Both must be handled in all delete/edit paths.
- Admin sermon records are file-backed (admin-drafts.json), not PostgreSQL. Companion data is PostgreSQL.
- `THEME_CONFIRMATION_REQUIRED` and `SERMON_CONFIRMATION_REQUIRED` are normal workflow states, not errors — both return HTTP 200 with `success: false` and `source` data.
- Daily Rhythm is the only content type with calendar-based gating; all other content (Devotionals, Sermon Companions, Journeys) is self-paced.
- ContentStudio navigation is internal state (not URL-based). All views live under `/admin`.

## Product

- **Walk (Today's Steps)** — member home; shows daily content card for the current day
- **Daily Rhythm** — church-wide daily devotional, calendar-gated, unlocks one day at a time
- **Daily Devotionals** — self-paced devotional series, advance on completion
- **Sermon Companions** — 5-day AI-generated companions from Sunday sermons, self-paced
- **Journeys** — multi-step discipleship journeys (Collections and Standalone), self-paced
- **Bible** — KJV + licensed translations (NIV, GNT, MSG), chapter reading with verse-tap sheets
- **Ask Emmaus** — AI chat assistant with sermon and scripture context
- **Admin / Content Studio** — Daily Rhythm editor, Devotionals editor, Journey builder, Sermon Companion generator, Media Studio

## User preferences

### Permanent Regression Prevention Protocol

This applies to every task without exception.

**Before starting any task:**
1. Check git status and recent commits. Report: current branch, HEAD commit, uncommitted changes, files changed since last stable checkpoint.
2. Identify any currently broken features before writing new code.
3. Create a named git commit checkpoint before making changes.
4. Only then begin the requested change.

**Change scope control:**
- Modify only files directly required by the task.
- Do not refactor, rename, or reorganize unrelated areas.
- Before touching a shared file (router, auth middleware, shared components, DB schema, deletion helpers, AI services), explain why it must change, which features depend on it, and what regression checks will run.
- Prefer the smallest safe patch. Do not "clean up" or "modernize" outside scope.

**Preserve existing implementations:**
- Before creating a new component, route, or API, search the codebase for an existing one.
- If a previously working implementation is disconnected, restore its connection rather than rebuilding it.

**No database destruction:**
- Never reset, drop, or replace production tables or records during troubleshooting.
- All schema changes must be backward-compatible migrations with rollback safety confirmed.

**Definition of done:**
A task is complete only when the requested workflow works end-to-end AND all related existing workflows still work. Specifically:
1. The requested change works from beginning to end.
2. Browser refresh works on affected routes.
3. Back navigation works correctly.
4. Draft, publish, and delete behaviour is correct.
5. Existing records are still visible.
6. No browser console errors.
7. No unhandled server errors.
8. No unexpected failed API requests.

**Structured error handling:**
- Never show raw HTTP 500/502/null/undefined to admins.
- Never swallow errors or return false-success responses.
- Never save empty AI output.
- Structured confirmation states (THEME_CONFIRMATION_REQUIRED, SERMON_CONFIRMATION_REQUIRED) are normal workflow states — handle them as 200 responses, not exceptions.
- Preserve form data after failure and allow retry.

**After every task — required change report:**
1. Checkpoint created before the change.
2. Root cause of the issue.
3. Files changed and why.
4. Shared files changed and which features depend on them.
5. Tests performed and results.
6. Regression checklist results (run the relevant sections from the checklist below).
7. Any test that could not be completed and why.
8. Confirmation that existing content was preserved.
9. New checkpoint commit created after successful testing.

**If a regression is found during testing:** stop, repair the regression, retest, only then proceed. Never leave the application in a partially broken state.

### Regression Checklist (run relevant sections after every task)

**A — Daily Rhythm:** list opens, content appears, create/edit/save/publish/delete work, previous days accessible, gating unchanged, completion returns to Today's Steps.

**B — Daily Devotionals:** list opens, devotionals appear, create/edit/save/publish/delete work, self-paced advancement correct, back navigation correct.

**C — Journeys:** Collections and Standalone tabs open, existing content appears, Journey Builder opens, steps visible and editable, save/reopen preserves content, collection assignment works, no "Journey not found" on valid workflows.

**D — Sermon Companions:** list opens, all companions appear, New Companion opens, URL accepted, transcript retrieved, sermon slice detected, theme confirmation appears and works, Monday–Friday content generates after confirmation, draft saves, editor opens, publish/unpublish works, no HTTP 500/502, no blank AI content saved.

**E — Media Studio:** YouTube Archive, Media Library, Uploads sections open, existing media visible.

**F — Public App:** splash displays, Daily Rhythm loads, Today's Steps cards correct, green button labels correct, back arrows return to originating screen, bottom navigation works, Ask Emmaus available, no route leads to "Journey not found."

**G — General Admin:** Save Draft, Publish, Unpublish, Delete, Permanent Delete all work; status labels update immediately; error messages are useful; form data preserved after recoverable errors.

## Gotchas

- `THEME_CONFIRMATION_REQUIRED` must be in `httpStatusForCode()` returning 200 — missing entry causes 500/502 and breaks theme confirmation flow entirely.
- `sermon_companion_progress` has no FK cascade from `sermon_companion` — must be explicitly deleted before deleting a companion.
- `step_reflections` has no FK cascade from `journeys` — must be explicitly deleted before deleting a journey.
- Legacy sermon companions live in the `journeys` table (`journeyType = 'companion'`, slug IDs). All delete/edit paths must detect UUID vs. slug and handle both.
- `deleteServerSermon` must pass `companionJourneyId` in the request body — for legacy sermons with no admin-drafts.json record, this is the only way the server knows what to delete.
- `DEMO_SERMON_RECORD` in `admin-demo-data.ts` is the localStorage fallback — it restores a deleted "God's Kindness" companion if the pastor clears browser storage entirely.
- API server rebuild takes ~400–900ms after code changes; always wait for "Server listening" log before testing.
- The Replit proxy routes `/project-emmaus/api/*` to the API server. Screenshot tool has no auth cookies — admin screenshots always show the "no permission" guard, which is expected.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- `.agents/memory/MEMORY.md` — agent persistent memory across sessions (key architectural decisions, recurring quirks)
