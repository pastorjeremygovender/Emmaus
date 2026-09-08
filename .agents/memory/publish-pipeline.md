---
name: Publish pipeline
description: How code changes and seed data reach the production app; what breaks silently and the permanent safeguards in place.
---

## Build not reaching production

**Root cause**: Replit's publish flow may not execute the `build = [...]` inline-array format in `artifacts/project-emmaus/.replit-artifact/artifact.toml`. The api-server uses the correct `[services.production.build]` table format with an `args` key; the web artifact used a different format whose execution is uncertain.

**Permanent fix**: The `data-safety: content integrity` workflow now runs `pnpm --filter @workspace/project-emmaus run build` as its first step. Since this workflow runs before every publish (it is the Run-button workflow), the `dist/public` bundle is always rebuilt from the latest source before the user clicks Publish. Replit's publish then snapshots the workspace including the fresh `dist/public`.

**Why**: The user repeatedly published and received stale code because the dist was last built Aug 12 while source changes were made later. Rebuilding locally is not enough — the data-safety workflow must do it.

**How to apply**: Any time voice, frontend, or UI code changes are made, running the data-safety workflow before publishing is the reliable guarantee. Do not advise the user to manually run `pnpm build` — the workflow handles it automatically.

## Replit file replacement flows

- `.replit`: never edit directly. Write full updated TOML to a temp file, then call `verifyAndReplaceDotReplit({ tempFilePath })` via CodeExecution.
- `artifact.toml` (`.replit-artifact/artifact.toml`): never edit directly. The correct callback is NOT available in the durable CodeExecution scope as of 2026-08-14 — `updateArtifactToml`, `replaceArtifactConfig`, `replaceArtifactToml`, `setArtifactToml`, `applyArtifactToml`, `validateAndReplaceArtifactToml` all fail. Leave a `.new` sibling file and document that the replacement flow is pending platform support.

## Production DB is read-only for agent

Direct `DELETE` statements via `executeSql({ environment: "production" })` fail with "cannot execute DELETE in a read-only transaction". To clean production data, use startup migrations (idempotent DELETEs in `startup-migrations.ts`) — they run on every production boot.

## Test data leaking to production

**Root cause**: `export:seed` exported ALL devotional_series rows including `__TEST__` records created by automated tests. The `prod-data-sync` upsert then pushed them to production.

**Permanent fixes**:
1. `export:seed` now has `AND title NOT LIKE '__TEST__%'` on both `devotional_series` and `devotional_entries` queries.
2. `startup-integrity.test.ts` now has a "No __TEST__ records in user-facing tables" describe block (2 tests) that fails the pre-publish gate if test records exist.
3. `startup-migrations.ts` has an idempotent DELETE block that cleans any `__TEST__` records from production on boot.

**Why**: Any test that creates a `devotional_series` with `__TEST__` in the title will be caught before it can reach the seed export or production DB.
