# Journey Database Schema

All Journey data is stored in Postgres via Drizzle ORM. The schema lives in `lib/db/src/schema/journeys.ts`.

---

## Tables

### `journeys`

One row per journey (devotional, Bible study, companion, etc.).

| Column | Type | Notes |
|---|---|---|
| `id` | text (PK) | Slug-based, e.g. `walk-through-luke` |
| `title` | text | Display title |
| `description` | text | Short description shown to users |
| `journey_type` | text | `core` \| `companion` \| `bible-journey` \| etc. |
| `duration_days` | integer | Auto-updated from step count |
| `status` | text | `Draft` \| `Pastoral Review` \| `Approved` \| `Published` \| `Archived` |
| `cover_image_url` | text? | URL to cover art |
| `church_wide` | boolean | Whether this is a church-wide journey |
| `start_date` | text? | Optional scheduled start (ISO date string) |
| `end_date` | text? | Optional scheduled end |
| `linked_sermon_id` | text? | For companion journeys, the canonical sermon ID |
| `overload_exempt` | boolean | Exempt from concurrent journey limits |
| `pastor_edited` | boolean | Flagged as pastor-reviewed |
| `published_at` | timestamp? | When first published |
| `metadata` | jsonb | Extensible metadata bag |
| `created_at` | timestamp | Auto-set on insert |
| `updated_at` | timestamp | Updated on every write |
| `created_by` | text? | User ID of creator |
| `updated_by` | text? | User ID of last editor |

### `journey_steps`

One row per step (day) within a journey.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Auto-generated |
| `journey_id` | text (FK → journeys.id) | Cascades on delete |
| `day` | integer | Step number (1-based, unique within journey) |
| `title` | text | Step title |
| `content` | jsonb | All step content fields (see below) |
| `status` | text | `draft` \| `published` |
| `created_at` | timestamp | Auto-set on insert |
| `updated_at` | timestamp | Updated on every write |

**`content` JSONB shape:**
```json
{
  "mentorIntro": "...",
  "scripture": "John 1:14 — 'The Word became flesh...'",
  "devotional": "...",
  "reflectionQuestion": "...",
  "prayerPrompt": "...",
  "actionStep": "...",
  "sermonTimestampSeconds": 736,
  "sermonLink": "https://...",
  "sermonContextualSentence": "..."
}
```

### `user_journey_progress`

One row per (user, journey) pair — tracks overall progress.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Auto-generated |
| `user_id` | text | The user's ID |
| `journey_id` | text (FK → journeys.id) | Cascades on delete |
| `current_day` | integer | Next day to do (starts at 1) |
| `completed_days` | jsonb | Array of completed day numbers |
| `started_at` | timestamp | When the user started |
| `last_completed_at` | timestamp? | When they last completed a step |
| `status` | text | `active` \| `completed` \| `paused` \| `dropped` |
| `created_at` | timestamp | Auto-set on insert |
| `updated_at` | timestamp | Updated on every write |

### `step_reflections`

One row per (user, journey, day) — stores written reflections.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | Auto-generated |
| `user_id` | text | The user's ID |
| `journey_id` | text | Journey ID (no FK, allows orphan reflections) |
| `day` | integer | Step day number |
| `reflection` | text | The user's written reflection |
| `created_at` | timestamp | Auto-set on insert |
| `updated_at` | timestamp | Updated on every write |

---

## Key File Locations

- Schema: `lib/db/src/schema/journeys.ts`
- DB client: `lib/db/src/index.ts`
- Store (CRUD helpers): `artifacts/api-server/src/lib/journey-store.ts`
- Seed script: `artifacts/api-server/src/scripts/seed-journeys.ts`
