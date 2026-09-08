---
name: Analytics Centre (Checkpoint 6)
description: 15-section discipleship analytics system; routes, store, and frontend section components
---

## Architecture

- **Nav item**: `'analytics'` in Admin.tsx → `AnalyticsCentre.tsx`
- **Backend store**: `artifacts/api-server/src/lib/analytics-store.ts` — 11 query functions
- **Routes**: `artifacts/api-server/src/routes/analytics.ts` mounted at `/api/analytics`
- **Auth**: Uses `requireAuth` + `getUserRole` from user-role-store (same pattern as pastoral.ts — never trust X-User-Role header)
- **DB migration**: `analytics_saved_reports` table added to startup-migrations.ts

## Routes

| Route | Returns |
|---|---|
| `GET /api/analytics/health-kpis` | 10 KPI cards |
| `GET /api/analytics/attendance-trends` | weekly/monthly data, by-meeting breakdown, retention |
| `GET /api/analytics/discipleship` | walk stats, devotional/rhythm/companion counts, weekly chart data |
| `GET /api/analytics/retention-funnel` | 8-stage funnel with percentages |
| `GET /api/analytics/spiritual-growth` | signal trend, disengaging/growing counts, consistency % |
| `GET /api/analytics/rooms` | per-room stats, aggregates |
| `GET /api/analytics/sermons` | companion starts/completions/avg |
| `GET /api/analytics/bible` | users with data, top annotated books |
| `GET /api/analytics/pastoral-care` | open/resolved signals, response time, by-category breakdown |
| `GET /api/analytics/insights` | rule-based predictive insights (≤5 patterns) |
| `GET /api/analytics/saved-reports` | list / POST create / DELETE by id |

## Schema corrections vs spec (real column names)

- `journeys.step_count` does NOT exist → use `journeys.duration_days`
- `user_journey_progress.completed_steps` does NOT exist → use `user_journey_progress.completed_days`
- `pastoral_milestones.occurred_at` does NOT exist → use `pastoral_milestones.created_at` for date filtering
- Any join between `attendance_records` + `meeting_sessions` must qualify `status` as `ar.status` / `ms.status` to avoid ambiguity
- `discipleship_signals.status` must be qualified as `ds.status` when joining

## Frontend pattern

- `useSection<T>(fetcher, refreshMs)` — stable ref pattern for generic type inference; each section has independent loading state
- Section components live in `src/pages/admin/analytics/`
- `shared.tsx` provides: `KpiCard`, `SectionHeader`, `SectionLoader`, `SectionError`, `EmptyState`, `StatRow`, `TrendBadge`
- 12 tab-based sections (nav at top of page, no sidebar)

## Key decisions

**Why tab-based nav rather than one long page:**
Analytics Centre is "enter the section you need" not "scroll through everything". Each tab load is independent — switching tabs triggers fresh data for that section only, not a full reload.

**Predictive insights (S12) are rule-based only:**
Spec explicitly says "Do NOT invent AI predictions — use historical trends." All 5 insights compare time windows (4w vs 4w, 7d vs 7d, 30d vs 30d) and emit positive/warning badges with change %.

**Saved reports (S13):** Stored in `analytics_saved_reports` DB table (church_id, name, description, config JSONB). Three preset templates ship in the UI; custom saves are free-form. The `config` column is available for future filter state persistence.
