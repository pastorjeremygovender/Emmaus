---
name: Unified Sermons Module
description: Architecture and implementation state for the canonical sermon DB pipeline replacing JSON-backed admin-sermon-store.
---

# Unified Sermons Module

## What was built (8 phases)

**Phase 1 — Object Storage:** GCS bucket provisioned via Replit App Storage. `objectStorage.ts`, `objectAcl.ts`, `routes/storage.ts` in place. Upload URL endpoint at `POST /storage/uploads/request-url` (admin-only). GET serve endpoints are public.

**Phase 2 — DB Schema + Migration:**
- `sermons` table (UUID PK, `legacy_json_id` text with non-partial unique index, all sermon fields as columns + JSONB arrays).
- `sermon_companion.sermon_uuid UUID REFERENCES sermons(id)` FK added (nullable during transition).
- `sermon-data-migration.ts` runs on every boot: reads `admin-drafts.json`, upserts to `sermons` via `upsertByLegacyId` (SELECT+INSERT/UPDATE, not ON CONFLICT), back-fills `sermon_companion.sermon_uuid` from legacy `sermon_id`.
- Boot order: `runStartupMigrations()` → `runProdDataSync()` → `runSermonDataMigration()`.

**Phase 3 — API Routes:** `routes/sermons.ts` mounted at `/api/sermons`. 
- Member: `GET /`, `GET /:id` (published only).
- Admin: `GET /admin`, `GET /admin/:id`, `POST /admin`, `PATCH /admin/:id`, `POST /admin/:id/publish`, `POST /admin/:id/unpublish`, `DELETE /admin/:id`, `POST /admin/:id/audio-upload-url`.

**Phase 4 — Admin UI:**
- Content Studio tab renamed "Sermon Companions" → "Sermons" (ContentStudio.tsx).
- `SermonsList.tsx` rewritten: fetches from `/api/sermons/admin`, shows `CanonicalSermon` type, publish/unpublish/delete via new endpoints. "New Sermon" modal creates canonical DB record directly.
- `canonical-sermon-api.ts` (frontend) — thin fetch layer.
- **Dual-write:** `admin-sermon-store.ts` `upsertAdminSermon` and `updateAdminSermon` now fire-and-forget `syncToCanonical()` so all generator pipeline writes immediately mirror to the DB (no next-boot wait).

**Phase 5 — Generator pipeline integration:** Dual-write via `admin-sermon-store.ts` covers this. Generator still writes JSON; canonical DB is updated synchronously via `syncToCanonical`.

**Phase 6 — Ask Emmaus:** `sermon-retrieval.ts` uses a hybrid, publication-safe result set:
  1. Published canonical DB sermons, including audio-only records.
  2. Published-sermon knowledge-index matches for companion/teaching text.
  3. Approved YouTube archive segments for gaps such as Prodigal/Luke 15.
- Canonical results expose `/sermon/:id`; archive-only results expose only verified YouTube/audio actions.
- Canonical-linked archive videos are suppressed by the public `youtube_video_id`; fabricated registry/placeholder results are not eligible.

**Phase 7 — Preached Here:** `youtube-archive.ts` `GET /youtube-archive/preached-here` updated:
  1. Fetches `listPublishedSermons()`, filters by `scriptureBookIds` + chapter.
  2. Builds response objects compatible with `SermonSearchResult` shape.
   3. Appends deduplicated archive results (suppresses by `youtubeVideoId`).
  4. Returns `{ sermons, chapterSermons, bookSermons }` shape unchanged for frontend compat.

**Phase 8 — Member UX:**
- `SermonHome.tsx` at `/sermon/:id` — member canonical sermon page (title, speaker, date, scripture, summary, YouTube link, themes).
- Walk.tsx: sermon companion card label → `"THIS WEEK'S SERMON"` when `sc.isCurrentWeek`, else `"SERMON COMPANION"`.
- Walk.tsx: "View Previous →" secondary action removed from sermon companion cards.

## Key rules

**Never return both canonical + archive for same sermon.** Dedup in retrieval and Preached Here uses the canonical `youtube_video_id`, not an archive row's internal UUID.

**Knowledge-index joins cast `sermons.id` to text.** The canonical UUID is stored as text in `emmaus_knowledge_index.sermon_id`.

**Why:** The database schema intentionally preserves the index's text key, so an uncast UUID/text join fails at runtime and silently removes published index matches.

**How to apply:** Use `s.id::text = k.sermon_id` in index reads and diagnostics; keep publication filtering in the SQL join.

**`upsertByLegacyId` uses SELECT+INSERT/UPDATE** (not ON CONFLICT) — the unique index on `legacy_json_id` is non-partial, but the SELECT approach is more robust during boot window migrations.

**Status casing:** legacy JSON store uses lowercase `"draft"|"review"|"published"`. Canonical DB uses title-case `"Draft"|"Review"|"Published"`. Frontend `CanonicalSermon` type reflects title-case. `StatusBadge` in SermonsList is passed `.toLowerCase()` to preserve existing badge styles.

**Edit flow in SermonsList:** `editId(s)` returns `s.legacyJsonId ?? s.id`. This means the SermonEditor (which reads from `AdminContext.sermons` → admin-sermon JSON store) still works for legacy sermons. New canonical-only sermons (no legacyJsonId) would need a dedicated editor — deferred.

**`admin-drafts.json`** remains as backup. Not deleted. `sermon-data-migration.ts` re-runs idempotently on every boot.

## Files created/modified

| File | Change |
|---|---|
| `artifacts/api-server/src/lib/canonical-sermon-store.ts` | New — canonical DB CRUD |
| `artifacts/api-server/src/lib/sermon-data-migration.ts` | New — JSON→DB migration |
| `artifacts/api-server/src/lib/admin-sermon-store.ts` | +dual-write to canonical DB |
| `artifacts/api-server/src/lib/startup-migrations.ts` | +sermons table + sermon_companion.sermon_uuid |
| `artifacts/api-server/src/routes/sermons.ts` | New — canonical sermons API |
| `artifacts/api-server/src/routes/storage.ts` | Adapted auth (requireAuth + isAdmin) |
| `artifacts/api-server/src/routes/index.ts` | +storageRouter, +sermonsRouter |
| `artifacts/api-server/src/routes/youtube-archive.ts` | Phase 7: canonical-first Preached Here |
| `artifacts/api-server/src/emmaus/sermon-retrieval.ts` | Phase 6: canonical priority 1 |
| `artifacts/api-server/src/app.ts` | +runSermonDataMigration in boot chain |
| `artifacts/project-emmaus/src/lib/canonical-sermon-api.ts` | New — frontend API client |
| `artifacts/project-emmaus/src/pages/admin/SermonsList.tsx` | Rewritten — canonical API |
| `artifacts/project-emmaus/src/pages/admin/content-studio/ContentStudio.tsx` | Tab renamed |
| `artifacts/project-emmaus/src/pages/SermonHome.tsx` | New — member sermon page |
| `artifacts/project-emmaus/src/App.tsx` | +SermonHome route |
| `artifacts/project-emmaus/src/pages/Walk.tsx` | Label + removed "View Previous" |
| `lib/api-spec/openapi.yaml` | +storage schemas + paths |
