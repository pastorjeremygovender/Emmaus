# Data Safety — Project Emmaus

This document describes how authored content is protected, how to verify a
deployment did not mutate the database, and what to do if the integrity check
fails.

---

## 1. Data classification

| Category | Tables | Who writes it | Can startup code touch it? |
|---|---|---|---|
| **Schema** | All tables (DDL) | Startup migrations | ✅ DDL only |
| **Authored content** | `journeys`, `journey_steps`, `collections`, `devotional_series`, `devotional_entries`, `sermon_companion`, `sermon_companion_entry`, `bible_study_notes`, `bible_book_introductions`, `bible_chapter_overviews` | Admins via the UI | ❌ Never |
| **User data** | `user_journey_progress`, `devotional_progress`, `sermon_companion_progress`, `user_profiles`, `user_bible_data` | Members via the app | ❌ Never |
| **Config / operational** | `rooms`, `room_members`, `room_messages`, `room_journeys` | Members + admins | ❌ Never |
| **Seed / demo** | Same tables as authored content | `seed-content.ts`, `seed-demo.ts` | ❌ Run manually only |

---

## 2. The startup DDL-only rule

**`startup-migrations.ts` must only contain:**

- `CREATE TABLE IF NOT EXISTS`
- `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
- `CREATE [UNIQUE] INDEX IF NOT EXISTS`

**Never add to `startup-migrations.ts`:**

- `INSERT`, `UPDATE`, or `DELETE` on any authored content or user data table
- Any call to seed scripts or data initialisation helpers

**Why this rule exists:**

A previous migration ran `DELETE FROM journey_steps` on every boot, wiping
authored step content that could not be recovered from git. The data-safety
banner at the top of `startup-migrations.ts` documents this history. All
contributors must read it before editing that file.

Seed scripts that insert initial content belong in:

- `src/scripts/seed-content.ts` — foundational authored content
- `src/scripts/seed-demo.ts` — demo / sample content for development

Both scripts automatically refuse to run when `NODE_ENV=production` unless
`ALLOW_SEED_IN_PRODUCTION=true` is explicitly set.

---

## 3. Content checksum tool

The checksum tool snapshots row counts and SHA-256 hashes for every authored
content table. Run it before and after a deployment to prove zero unintended
mutations.

```bash
# Captures only the diffable JSON (timestamp goes to stderr):
pnpm --filter @workspace/api-server run checksum:content > before.json

# ... deploy ...

pnpm --filter @workspace/api-server run checksum:content > after.json

diff before.json after.json
```

A clean diff (empty output) confirms the deployment mutated no authored rows.
The generation timestamp is printed to stderr only — it never appears in
`before.json` / `after.json` and does not interfere with `diff`.

**Tables covered:**

| Table | Authored text columns hashed |
|---|---|
| `journeys` | title, subtitle, description |
| `journey_steps` | title, mentor_intro, teaching_content, reflection_question, prayer, todays_action |
| `collections` | title, description |
| `devotional_series` | title, description |
| `devotional_entries` | title, scripture_reference, greeting, consider_this, prayer, next_step, closing |
| `sermon_companion` | title |
| `sermon_companion_entry` | title, scripture_reference, greeting, reflection, prayer, next_step, closing, sermon_link |
| `bible_study_notes` | title, content, context_note, historical_note, original_language_note, jesus_connection, apply_it, key_truth, reflection_question, related_scriptures |
| `bible_book_introductions` | book_name, testament, genre, author_attribution, date_range, original_audience, historical_setting, purpose, points_to_jesus, interpretation_notes |
| `bible_chapter_overviews` | summary, key_verse, book_connection, jesus_connection |
| `rooms` | name, description |

**What is detected:** Any insertion, deletion, or rewrite of the columns
listed above. JSONB columns (e.g. `cross_references`, `major_themes`) are
excluded because JSON key ordering is not guaranteed to be deterministic across
Postgres versions; mutations to JSONB columns are tracked instead via the
`content_audit_log` table.

The full table and column inventory lives in one place:
`artifacts/api-server/src/lib/authored-content-tables.ts`. Update that file
when adding new authored content tables.

---

## 4. Restart integrity test

The integrity test imports and calls the real `runStartupMigrations()` function
a second time against the live dev database, then asserts every content table's
row count and hash is unchanged. It also asserts that seed scripts refuse to
run in production mode. The test uses the same table/column inventory as the
checksum tool, from `authored-content-tables.ts`.

```bash
pnpm --filter @workspace/api-server run test:integrity
```

Run this after any edit to `startup-migrations.ts` before merging the PR.
Because the test calls the actual migration function (not a reimplementation),
it stays in sync automatically as new migrations are added.

---

## 5. Running seed:content safely on a new environment

On a **fresh** deployment (database is empty):

```bash
pnpm --filter @workspace/api-server run seed:content
```

On **production** (if intentional, e.g. adding new foundational content):

```bash
ALLOW_SEED_IN_PRODUCTION=true \
  pnpm --filter @workspace/api-server run seed:content
```

All inserts use `ON CONFLICT DO NOTHING` — existing rows are never overwritten.
Verify with a checksum before and after to confirm only the expected rows were
added.

---

## 6. What to do if the integrity test fails

A failure means `runStartupMigrations()` mutated authored content. **Do not
proceed with deployment.**

1. Run the checksum tool against the current database:
   ```bash
   pnpm --filter @workspace/api-server run checksum:content > current.json
   diff last-known-good.json current.json
   ```
2. Identify which table's hash changed and which rows were affected using the
   Audit Log (`GET /api/admin/audit-log`) and direct SQL:
   ```sql
   SELECT * FROM content_audit_log
   ORDER BY performed_at DESC
   LIMIT 50;
   ```
3. Revert the offending code from `startup-migrations.ts`.
4. If rows were deleted, restore them from a database backup (see §7).
5. Re-run `test:integrity` until it passes before re-deploying.

---

## 7. Database backups

The Replit-managed PostgreSQL database supports **point-in-time recovery**
managed by the platform. Recovery periods by plan:

| Plan | Backup retention |
|---|---|
| Core | 7 days |
| Pro / Teams | Up to 28 days |

**To request a restore:**

1. Go to the Replit Deployments dashboard for this project.
2. Open the Database tab and follow the Data Recovery workflow.
3. Reference: <https://docs.replit.com/features/data-and-storage/data-recovery>

> **Note:** Restoring overwrites the entire database to the chosen point in
> time. Coordinate with all users before initiating a restore and export any
> data written after the target timestamp first.

---

## 8. Audit log

Every admin mutation to authored content is recorded in `content_audit_log`.
The Admin UI exposes this at **Admin → Audit Log**. The API endpoint is:

```
GET /api/admin/audit-log?contentType=journey&limit=100
```

Fields: `content_type`, `content_id`, `action`, `performed_by`,
`performed_at`, `previous_state` (JSONB), `new_state` (JSONB).

Audit events are written *after* successful mutations and include a
`source` field for bulk operations (CSV import, AI generate, AI build).
