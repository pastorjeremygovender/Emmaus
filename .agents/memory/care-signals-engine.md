---
name: Care Signals Engine (Checkpoint 4)
description: discipleship_signals table, rules engine, store functions, routes, and frontend components
---

## Architecture

- DB table: `discipleship_signals` — UNIQUE on `(church_id, person_id, person_type, signal_type)`
- On conflict: upsert updates evidence/explanation; if previously resolved/dismissed, resets to `new`
- State-based signals (attention/follow_up): auto-resolved by engine when condition no longer holds
- Event-based signals (celebration/growth/significant): persist until manually actioned

## Files

| File | Role |
|---|---|
| `artifacts/api-server/src/lib/care-signals-engine.ts` | 18 rules, `PersonContext`, `detectSignals()`, `ALL_RULES[]` — no DB access |
| `artifacts/api-server/src/lib/pastoral-store.ts` | `DiscipleshipSignal`, `runSignalsEngine`, `listDiscipleshipSignals`, `upsertDiscipleshipSignal`, `gatherPersonContext` |
| `artifacts/api-server/src/routes/pastoral.ts` | 5 new routes under `/api/pastoral/discipleship-signals` |
| `artifacts/project-emmaus/src/lib/pastoral-api.ts` | `DiscipleshipSignal`, `SignalCategory`, `SignalStatus` types + 5 API functions |
| `artifacts/project-emmaus/src/pages/admin/pastoral/signals/SignalsDashboard.tsx` | Full dashboard (new Signals tab in People.tsx) |
| `artifacts/project-emmaus/src/pages/admin/pastoral/profile/CareSignalsSection.tsx` | Per-person section in PersonPage.tsx below HeroSummaryCard |

## Routes

- `GET    /api/pastoral/discipleship-signals` — list (query: category, status, personId, personType, limit)
- `POST   /api/pastoral/discipleship-signals/run-engine` — runs engine (body: personId?, personType?)
- `PATCH  /api/pastoral/discipleship-signals/:id/status` — updates status + audits
- `PATCH  /api/pastoral/discipleship-signals/:id/note` — updates pastoral note
- `PATCH  /api/pastoral/discipleship-signals/:id/assign` — assigns to leader + audits

## Rules (18 total)

| ID | Category |
|---|---|
| completed_first_walk | celebration |
| consistent_attendance_8_weeks | celebration (state) |
| accepted_christ | significant |
| baptised | significant |
| started_new_walk | growth |
| started_daily_rhythm | growth |
| joined_room | growth |
| regular_emmaus_engagement | growth (state) |
| attendance_declining | attention (state) |
| walk_inactive_14_days | attention (state) |
| daily_rhythm_stopped | attention (state) |
| missed_three_services | follow_up (state) |
| no_emmaus_activity_30_days | follow_up (state) |
| hospital_visit | significant |
| bereavement | significant |
| marriage | significant |
| birth_of_child | significant |
| pastoral_intervention | significant |

## Key decisions

**Why `PersonContext` lives in `care-signals-engine.ts` not `pastoral-store.ts`:**  
Prevents circular import. Engine file has no DB dependency. Store imports engine; not the reverse.

**Why `significant` not `celebration` for baptism/salvation:**  
Spec says significant signals "stay visible longer". Matches spec section on Significant category.

**Why UNIQUE constraint per signal_type per person:**  
Prevents signal spam on every engine run. Upsert keeps evidence fresh while preserving status.

**Adding a new signal:**  
Add one entry to `ALL_RULES` in `care-signals-engine.ts`. Nothing else changes.
