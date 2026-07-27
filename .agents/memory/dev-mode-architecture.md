---
name: Dev Mode Architecture
description: How Development Mode works — the toggle, auth, storage, and bypass points.
---

# Development Mode Architecture

## Two-part gate
`isDevelopmentMode(user)` returns true **only when both are true**:
1. `user.role === 'admin' || 'superAdmin'` (role check)
2. User has explicitly toggled dev mode ON (localStorage key `emmaus_dev_mode_${userId}`)

This replaced the old role-only check from the previous session.

## Function signature change
`isDevelopmentMode(user)` now requires `{ id: string; role: string }` — not just `{ role: string }`. Call sites in Walk.tsx and DailyRhythmDay.tsx already pass the full user object from `useAuth()`.

## Single source of truth
All calendar-lock bypass decisions import `isDevelopmentMode` from `src/lib/dev-mode.ts`. No hard-coded role checks elsewhere.

## localStorage keys (per user)
- `emmaus_dev_mode_${userId}` — boolean toggle ('true' | absent)
- `emmaus_dev_audit_${userId}` — JSON array of `DevAuditEntry[]`, max 50 entries

## What is bypassed
- `day > currentDay` gate in DailyRhythmDay.tsx
- Walk card `completedToday`/`nextDayAvail` state (card always shows Continue, never "Review today" or "Available tomorrow")
- PreviousDays filter (shows all Published days, not just day < currentDay)

## What is NOT bypassed
- `!step` gate (unpublished/unwritten days still blocked)
- `completeStep` writes (opening a day doesn't mark it complete)
- Replay mode for already-completed days
- Streak/progress data for normal members

## Control surface
- **Toggle location**: Admin → Settings → Development section (amber-themed)
- **Indicator**: `DevModeBanner` component on Walk, DailyRhythmDay, PreviousDays — amber bar with Preview Day picker and X to disable
- **Disable via banner**: calls `window.location.reload()` so all components re-read localStorage

## Progress test tools (Admin → Settings → Development)
- Mark Day N Complete: calls JourneyContext `completeStep`
- Mark Day N Incomplete: calls new `markStepIncomplete` → `POST /api/journeys/:id/progress/mark-step-incomplete`
- Reset Test Progress (with confirm): calls new `resetProgress` → `POST /api/journeys/:id/progress/reset`

## New API endpoints
- `POST /api/journeys/:id/progress/reset` — resets to Day 1 for calling user only
- `POST /api/journeys/:id/progress/mark-step-incomplete` — removes day from completedDays, rolls back currentDay

## New JourneyContext methods
- `resetProgress(journeyId)` — calls API, updates local state
- `markStepIncomplete(journeyId, day)` — calls API, updates local state

**Why:** Separate "open day" from "complete day" — admins can browse freely without accidentally advancing their progress.
