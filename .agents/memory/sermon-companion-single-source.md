---
name: Sermon Companion Single Source of Truth
description: Root cause and fix for stale sermon companions appearing in member UI; permanent Today's Steps card; 5-day generation; speaker attribution.
---

# Sermon Companion — Single Source of Truth Fix

## Root Cause of Stale Companions
"Jesus at the Center" and "God Uses the Unlikely" were stored as `journeys` with `journeyType='companion'` (old pre-canonical pipeline). They appeared in member UI because `next-steps.ts` merged two companion sources: `journeys` table (journeyType='companion') + `sermon_companion` table. The fix: **remove the journey-companion merge entirely from next-steps.ts**.

The 3 companions in `sermon_companion` table were already Draft (not Published) — the old legacy ones were never Published via the canonical pipeline, so no DB cleanup was needed beyond removing the bad merge.

## Single Source of Truth
**Canon**: `sermon_companion` table only. `next-steps.ts` must NEVER merge `journeys` with `journeyType='companion'` again.

`listPublishedSermonCompanions()` enforces Published status + at least 1 published entry. Results are sorted newest-published first. No fallback from the journeys table is acceptable.

## Orphan Companion Cleanup (startup migration)
Two-case idempotent migration runs on every boot:
1. `sermon_uuid IS NOT NULL AND NOT EXISTS (sermons WHERE id = sermon_uuid)` — deleted sermon
2. `sermon_uuid IS NULL` — pre-canonical companion with no sermon link

Both cases: `UPDATE sermon_companion SET status = 'Draft'`.

## "the pastor" → Speaker Attribution (startup migration + prompt)
Migration: `REGEXP_REPLACE(field, '\\mthe pastor\\M', 'Pastor Jeremy', 'gi')` on all companion entry text fields.
Prompt update: `SPEAKER RULE` in `COMPANION_SYSTEM` — never "the pastor"/"the preacher"; use speakerName naturally (e.g. "Pastor Jeremy") or communal "we reflected on" language.
`generateCompanion()` now accepts `speakerName?: string` and includes it in the user message as `Pastor <firstName>`.

## 5-Day Generation Fix
`DAYS RULE` in `COMPANION_SYSTEM` updated: **target exactly 5 days** by grouping/expanding ideas. Only generate fewer when sermon genuinely cannot support 5 (e.g. short 2-idea sermon). The old rule said "between 1 and 5 based on distinct ideas" — too conservative.

## Permanent "This Week's Sermon" Card (Today's Steps / Walk.tsx)
- Section 2 (after Daily Rhythm) — **always rendered**, even when no companion is published.
- Fetches from `/api/sermon-companions/current-week/member` (404 = 'none' empty state).
- Empty state: "This week's Sermon Companion will appear here when it is published."
- Progress states: not started → "Start Companion"; in progress → "Continue"; complete → "Review Companion".
- Routes to `/sermon-companion/:id/overview` for all states.
- Current-week companion is **excluded from section 5** (in-progress companions) to avoid duplication.
- `thisWeekCompanion` state: `null` (loading) | `'none'` (no current) | `{ id, title, publishedDayCount, progress }`.

## Publishing Rule (already in DB)
`listPublishedSermonCompanions()` enforces `status = 'Published'`. Unpublishing/deleting a companion removes it from all member discovery immediately. User progress records are preserved in `sermon_companion_progress` for audit.

**Why:**
Spec required Content Studio → Sermons to be the single authoritative source. The legacy journey-companion merge was the structural root cause of the discrepancy between admin view and member view.
