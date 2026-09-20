---
name: Pastoral Workflows (Checkpoint 7)
description: Ministry Tasks system — tasks, templates, notes, calendar, suggestions, reports
---

## Architecture

- **Nav item**: `'workflows'` → `PastoralWorkflows.tsx` (9-tab shell)
- **Backend store**: `artifacts/api-server/src/lib/workflows-store.ts`
- **Routes**: `artifacts/api-server/src/routes/workflows.ts` mounted at `/api/workflows`
- **Frontend client**: `artifacts/project-emmaus/src/lib/workflows-api.ts`
- **Auth**: `requireAuth` + `getUserRole` — same pattern as pastoral.ts and analytics.ts
- **3 DB tables** added via startup-migrations.ts (CP7 block): `ministry_tasks`, `task_templates`, `pastoral_workflow_notes`
- **8 system templates** seeded via `ensureSystemTemplates()` called in `app.ts` after `runSermonDataMigration()` (not in startup-migrations.ts — data not DDL)

## Routes

| Route | Purpose |
|---|---|
| `GET /tasks` | List tasks (filters: status, assignedTo, personId, team, overdueOnly) |
| `POST /tasks` | Create task |
| `GET /tasks/leader` | Leader's own view (overdue / today / tomorrow / upcoming grouping) |
| `GET /tasks/pastor` | Full pastor view (unassigned, overdue, workload by leader/team) |
| `GET /tasks/:id` | Get one task |
| `PATCH /tasks/:id` | Update task |
| `DELETE /tasks/:id` | Archive task (soft delete) |
| `GET /suggestions` | Care signals without linked tasks — suggested task list |
| `POST /suggestions/:signalId/create-task` | Create task from signal |
| `GET /templates` | List all templates (system + custom) |
| `POST /templates` | Create custom template |
| `PATCH /templates/:id` | Update custom template (system templates protected) |
| `DELETE /templates/:id` | Delete custom template |
| `GET /notes` | List notes (filter: personId, taskId, includeConfidential) |
| `POST /notes` | Create note (immutable — no edit/delete) |
| `GET /search?q=` | Full-text search across tasks + notes |
| `GET /reports` | Completion stats, by-source, by-team, by-leader |
| `GET /calendar?from=&to=` | Tasks with due dates in date range |

## Schema notes (real column names)

- `ministry_tasks`: no `started_at` column — use `created_at` for creation time and `updated_at` for completion time
- `discipleship_signals`: no `description` column — use `explanation` instead
- `task_templates`: `is_system = true` prevents DELETE/UPDATE (guarded in store)
- `pastoral_workflow_notes`: immutable — no `updated_at` column, no edit routes

## Frontend tabs

`PastoralWorkflows.tsx` → 9 tabs: Tasks / My Tasks / Pastor View / Suggestions / Calendar / Templates / Notes / Search / Reports

## PersonPage integration

`CareHistorySection` added after "Attendance History" (section 8b). Accepts `auth: workflows-api.AuthHeaders` (with `x-user-id`/`x-user-role` keys — different from pastoral-api AuthHeaders which uses `userId`/`userRole`).

## Key decisions

**Why immutable notes:**
Pastoral confidentiality requires an audit trail. Notes are timestamped, author-recorded, and never editable — they become part of the permanent discipleship story.

**Why suggestions don't auto-create tasks:**
Spec explicitly says "Emmaus never creates pastoral work automatically." The suggestions route only returns signals without linked tasks; the pastor decides whether to create.

**Why ensureSystemTemplates is in app.ts not startup-migrations.ts:**
The startup-migrations.ts policy prohibits INSERT on content tables. System templates are seeded with ON CONFLICT DO NOTHING after migrations complete.
