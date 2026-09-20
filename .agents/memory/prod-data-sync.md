---
name: prod-data-sync
description: Rules and gotchas for the dev→production data sync pipeline (export-seed + prod-data-sync.ts).
---

# prod-data-sync

## The pipeline
Three-part countermeasure against dev/prod DB drift:
1. `export:seed` — runs on every API server startup; dumps dev DB → `dist/data/prod-sync-*.json`
2. `data-safety` workflow — gate that must pass before any publish
3. `runProdDataSync()` — runs on every production boot; upserts seed files into production DB

## Content preservation rule (CRITICAL)
Step upsert uses COALESCE so authored content is **never overwritten** by seed data:
- `content` (JSONB): `CASE WHEN existing IS NOT NULL AND existing::text NOT IN ('null','{}','[]') THEN existing ELSE seed END`
- Text fields (`teaching_content`, `reflection_question`, `prayer`, `todays_action`, `mentor_intro`): `COALESCE(NULLIF(existing, ''), seed)`
- `share_image_url`: `COALESCE(existing, seed)`
- `status`: a seeded existing step may upgrade from `Draft` to `Published`, but never downgrade an existing published step

**Why:** A previous version directly overwrote content columns on every boot, wiping anything an admin had written in production that wasn't in the seed file.

## Tombstone pattern
`reseed_tombstones` table (created by startup migration) tracks permanently deleted seed journeys.
- Written by the permanent-delete route in `routes/journeys.ts` immediately after `permanentDeleteJourney()`
- Read by `prod-data-sync.ts` before each journey upsert; IDs in the table are skipped
- Prevents the "deleted walk comes back after restart" class of bug

## OLD_JOURNEY_IDS cleanup list
Any journey ID that was ever published to production but no longer exists in dev **must** be added to `OLD_JOURNEY_IDS` in `prod-data-sync.ts`. Otherwise it persists in production forever because prod-data-sync only upserts (never deletes) journeys not in that list.

**How to apply:** After deleting an AI-generated or test walk from dev, query production DB for orphans (`SELECT id FROM journeys WHERE id NOT IN (<seed IDs>)`) and add any found IDs to `OLD_JOURNEY_IDS`.

## Critical rule: admins must write content in dev, not production
The export-seed reads the **dev** database. Content written in the production admin panel (`*.replit.app/admin`) lives only in the production DB and is never captured by export-seed. If an admin writes step content in the production editor and then publishes, the seed (built from dev) will overwrite it — unless the COALESCE rule above is in place AND the existing prod value is non-empty.

**Correct workflow:** Write/edit content in the Replit workspace preview (dev), then publish to sync to production.

## Seeded journeys (current)
- `the-road-to-emmaus` — "The Road to Emmaus", 3 steps, all with content
- `coming-to-jesus` — "Who Is God?", 5 steps + completion, all currently empty
- `15-minutes-with-jesus` — "10 Minutes with Jesus", 30 steps, all with content

## Tombstoned journey steps
When a seed journey is skipped because its ID is in `reseed_tombstones`, its seed steps must be skipped too.

**Why:** The journey tombstone intentionally prevents recreation; attempting its steps afterward violates the `journey_steps.journey_id` foreign key on every production boot.

**How to apply:** Keep the tombstone check before every step upsert, not only before the parent journey upsert.

## Production correction boundary
The production query surface is read-only for the agent. A narrow production data correction must use an explicitly supported production-write path; do not substitute the broad boot-time sync, which can update multiple existing journey and step fields.

**Why:** A content-equivalent correction may still be unsafe if the chosen mechanism rewrites unrelated records or fields.

**How to apply:** Capture a timestamped pre-change export, verify exact IDs/content hashes/current values, apply only guarded field updates in one transaction through the supported production mechanism, then verify progress and authored-content invariants before republishing.
