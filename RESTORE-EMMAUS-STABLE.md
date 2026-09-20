# Emmaus Stable Baseline — 4 August 2026

This file documents the protected restore point created before the Discipleship and
Pastoral Care Dashboard development phase began.

---

## Stable Baseline Details

| Item | Value |
|---|---|
| Stable commit | `3151a68249773fe6b59c8af27ef45424f43667a7` |
| Stable commit message | Add backfill script for emmaus_knowledge_index; fix corrupted sermon-companions.ts routes |
| Restore point commit | `emmaus-stable-2026-08-04` tag (annotated) |
| Stable branch | `stable/2026-08-04` |
| Development branch | `development/next-phase` |
| Deployment URL | https://mobile-first-prototype-pastorjeremygov.replit.app |
| Deployment type | Autoscale |
| Deployment visibility | Private |
| Deployment state | Active, successful build as of 4 August 2026 |
| GitHub repository | https://github.com/pastorjeremygovender/Emmaus |

---

## Database Snapshot

The production database is a Replit-managed PostgreSQL instance deployed alongside the
autoscale deployment above.

**Migration state at this baseline — 66 idempotent migration statements across:**

- `sermon_companion` + `sermon_companion_entry` + `sermon_companion_progress`
- `devotional_series` + `devotional_entries` + `devotional_progress`
- `user_profiles`
- `rooms` + `room_members` + `room_messages` + `room_journeys`
- `user_bible_data` + `bible_cross_references` + `bible_study_notes`
- `bible_book_introductions` + `bible_chapter_overviews`
- `user_journey_progress` (unique index, hidden_from_today, last_opened_at)
- `emmaus_knowledge_index` (sermon search index, FTS index)
- `content_audit_log`
- Runtime ALTER TABLE additions: `published_at`, `is_current_week`, `description`
  on `sermon_companion`; `status`, `last_opened_at`, `hidden_from_today` on progress
  tables; `notify_published_at` Smart Content Indicator columns

**All migrations are idempotent** — re-running them on restore is safe.

> ⚠️ **IMPORTANT:** Restoring the application code does NOT automatically restore the
> production database contents. User accounts, Walk progress, sermon data, companion
> progress, Rooms, and all published content live in the production database.
> Use the database point-in-time restore (see below) to restore data.

### Database backup / point-in-time restore

Replit's managed PostgreSQL supports point-in-time recovery. To restore:

1. Open the Replit workspace for this project.
2. Navigate to the **Database** pane (or Settings → Database).
3. Use the **Restore** option to select a point in time at or before 4 August 2026
   (before any new Pastoral Dashboard migrations are applied).
4. After code restore, redeploy so the idempotent startup migrations re-run against
   the restored database — they will not overwrite existing data.

Do **not** place a database export containing personal data into a public Git repository.

---

## How to Restore

### A. Replit Checkpoint Rollback

1. Open the Replit workspace.
2. Click the **Checkpoints** icon in the sidebar (clock/history icon).
3. Find the checkpoint labelled **"Emmaus stable baseline — 4 August 2026"** or the
   most recent checkpoint created on 4 August 2026 before new development began.
4. Click **Restore** on that checkpoint.
5. Redeploy the app from the restored state.

> This is the fastest restore path and recovers both code and environment configuration.

---

### B. Git Stable Branch

```bash
git fetch origin
git checkout stable/2026-08-04
# Verify you are on the stable commit:
git log --oneline -1
# Expected: 3151a68 Add backfill script...
```

To redeploy from this branch, push it to main (or the deployment branch) and publish
from the Replit deployment panel.

---

### C. Git Tag

```bash
git fetch --tags
git checkout emmaus-stable-2026-08-04
# Creates a detached HEAD at the stable commit
git checkout -b restore/from-stable-2026-08-04
```

The tag `emmaus-stable-2026-08-04` is annotated and permanently points to commit
`3151a68249773fe6b59c8af27ef45424f43667a7`. Do not move or reuse this tag.

---

### D. Stable Deployment (production URL)

The deployment active at this baseline remains live at:

```
https://mobile-first-prototype-pastorjeremygov.replit.app
```

It will continue serving from the successful build associated with commit `3151a68`
until a new deployment replaces it. If the live site is broken, use the Replit
deployment panel to roll back to a prior build or redeploy from the stable branch.

---

### E. Database Restore

See **Database backup / point-in-time restore** above.

Steps at a glance:
1. Restore the production database to a point-in-time snapshot at/before 4 August 2026.
2. Restore the application code using one of methods A–D above.
3. Redeploy so startup migrations re-run (idempotent — safe).
4. Verify the app is healthy before re-opening to users.

> ⚠️ Restoring code without restoring the database will leave the application running
> against whatever database state currently exists in production.

---

## What Is Protected

| Area | Status |
|---|---|
| User accounts and preferred names | ✅ Preserved in `user_profiles` |
| Walk + Journey progress | ✅ Preserved in `user_journey_progress` |
| Devotional progress | ✅ Preserved in `devotional_progress` |
| Sermon Companion progress | ✅ Preserved in `sermon_companion_progress` |
| Published sermons and companions | ✅ Preserved in `sermons` + `sermon_companion` |
| Knowledge index entries | ✅ Preserved in `emmaus_knowledge_index` |
| Rooms and memberships | ✅ Preserved in `rooms` + `room_members` |
| Bible study notes | ✅ Preserved in `bible_study_notes` |
| All published Walk/Journey content | ✅ Preserved in `journey_steps` |
| Uploaded media references | ✅ Preserved (media in Object Storage, references in DB) |
| Audit log | ✅ Preserved in `content_audit_log` |

---

## Next Development Phase

All new development for the Discipleship and Pastoral Care Dashboard must happen on:

```
development/next-phase
```

**Do not commit directly to `stable/2026-08-04`.**

When the next phase is stable and tested, a new restore point should be created
following the same procedure as this document.
