---
name: Pastoral Care Module
description: Architecture and conventions for the Checkpoint 1 pastoral care database and API — covers DB tables, permission model, route structure, frontend components, and key constraints.
---

## Schema (all tables include church_id DEFAULT 'icc')

| Table | Purpose |
|---|---|
| `pastoral_persons` | Attendance-only people without Emmaus accounts; `linked_user_id` ties to `user_profiles.email` |
| `meeting_types`    | Reusable templates (name, category, usual day/time, trackAttendance, careSignalEnabled, isSensitive) |
| `meeting_sessions` | Dated instances of meeting_types; status: scheduled / completed / cancelled |
| `attendance_records` | Per-person per-session status; UNIQUE(session_id, person_id, person_type); upsert pattern |
| `person_attendance_expectations` | Who normally attends which meeting type; UNIQUE(person_id, person_type, meeting_type_id) |
| `pastoral_audit_log` | All attendance corrections and person links; separate from content_audit_log |

`user_profiles` also has `pastoral_role TEXT` (pastor | recorder | null).

## PersonType keys (URL-safe)

- Emmaus user: `eu-{encodeURIComponent(email)}`
- Pastoral person: `pp-{uuid}`

These are parsed server-side in `parsePersonKey()` in `routes/pastoral.ts`.

## Permission levels

| Level | Who | Gate |
|---|---|---|
| `requireRecorderAccess` | superAdmin, admin, pastoral_role=recorder or pastor | for read + basic attendance write |
| `requirePastorAccess`   | superAdmin, admin, pastoral_role=pastor | for corrections, patches, sensitive data |

## Unified People list

`listUnifiedPeople()` in `pastoral-store.ts` merges `user_profiles` (as emmaus_user rows) with `pastoral_persons`. Linked pastoral persons (those with `linked_user_id`) suppress the duplicate emmaus_user entry — the pastoral_person row is used instead.

## Frontend wiring

- `People.tsx` — top-level tab shell (Members / Rooms / Prayer / Attendance / Care)
- Members tab → `MembersTab` sub-component with sub-tabs: "All People" (PastoralPeople) vs "Emmaus Accounts" (AdminUsers)
- Attendance tab → `AttendanceSection` (sub-tabs: Sessions + Meeting Types; Register drill-down)
- `PastoralPeople` → `PersonPage` drill-down (attendance history + expectations)
- `AttendanceRegister` → add visitor modal + link account modal inline

## Checkpoint boundaries

- Checkpoint 1 (built): DB foundations, people, meeting types, sessions, attendance register
- Checkpoint 2: Full discipleship profile (Emmaus Walks/Rooms linked to pastoral record)
- Checkpoint 3: Care signals (requires careSignalEnabled + expectations populated in C1)
- Checkpoint 4: Dashboard alert system

**Why:** User approved this checkpoint model; Checkpoints 2–4 must not begin until C1 is published and tested.

## Key constraints

- Never auto-mark anyone as Absent — all statuses must be deliberate (register starts blank)
- `meeting_sessions` with status=cancelled block attendance writes (checked in upsertAttendance)
- All pastoral API routes are under `/api/pastoral/` (registered in routes/index.ts)
- Single-tenant: CHURCH_ID = 'icc' hardcoded in pastoral-store.ts; query filter on every read
