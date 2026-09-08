---
name: Pastoral Dashboard (Checkpoint 5)
description: 9-section pastoral dashboard added as a separate admin nav item
---

## Architecture

- **Nav item**: `'pastoral-dashboard'` in Admin.tsx, renders `PastoralDashboard.tsx`
- **Does NOT replace** the existing `Dashboard.tsx` — co-exists as a second nav entry
- **Backend store**: `artifacts/api-server/src/lib/dashboard-store.ts` — 5 independent query functions
- **Routes**: 5 new routes appended to `pastoral.ts` under `/api/pastoral/dashboard/`
- **Frontend**: `artifacts/project-emmaus/src/pages/admin/PastoralDashboard.tsx` — self-contained

## Route map

| Endpoint | Returns |
|---|---|
| `GET /api/pastoral/dashboard/today-stats` | TodayStats (attendance, walks, devotionals, new people, follow-up count) |
| `GET /api/pastoral/dashboard/movement` | 8 movement cards for the current calendar month |
| `GET /api/pastoral/dashboard/engagement` | Chart data: attendance last 12, devotional last 30, walks/rooms last 90 days |
| `GET /api/pastoral/dashboard/new-believers` | People who completed Coming to Jesus / Made Free in last 60 days |
| `GET /api/pastoral/dashboard/activity` | Combined timeline: walks + rooms + milestones + attendance (last 14 days) |

Existing endpoints reused in the dashboard:
- `GET /api/pastoral/discipleship-signals` — S2 Care Signals + S7 Follow-up Queue
- `GET /api/pastoral/people` — S9 Search

## Frontend pattern

- `useAutoFetch<T>(fetcher, 30_000)` hook — each section fetches independently and auto-refreshes every 30s
- No section blocks another — isolated `useState`/`useEffect` per widget
- "Open Profile" overlays `PersonPage` locally (no Admin.tsx routing needed)
- Recharts: `AreaChart` for attendance, `BarChart` for daily rhythm + walk activity

## Key decisions

**Why `dashboard-store.ts` is separate from `pastoral-store.ts`:**
pastoral-store.ts is already large. Dashboard queries are read-only aggregates that don't share any mutations with the pastoral store. Keeping them separate makes each file easier to reason about.

**Prayer requests (S1 Today) come from AdminContext (demo data), not backend:**
There's no `prayer_requests` DB table yet — prayer is localStorage/demo. The dashboard uses `useAdmin().prayerRequests` for the prayer count card.

**People Cache pre-loaded in dashboard:**
PastoralDashboard pre-fetches `listPeople` once on mount so "View Profile" clicks open instantly without a second round-trip.
