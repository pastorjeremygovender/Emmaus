---
name: Admin Navigation Refactor
description: Canonical admin nav structure after the 2026-08-07 IA refactor — left nav order, Content Studio tabs, Bible Study consolidation.
---

# Admin Navigation Refactor (August 2026)

## Left nav order (Admin.tsx NAV_ITEMS)
Dashboard → Pastoral Dashboard → People → Analytics → Workflows → Content Studio → Bible Study → Settings → Audit Log → Testing

People was moved from position 7 to position 3.

## Content Studio top tabs (ContentStudio.tsx TOP_NAV)
Daily Rhythm | Daily Devotionals | Walks | Journeys | Sermons

- **Walks** (was "Journeys > Journey Library") — shows StudioJourneyList; page title is "Walks"
- **Journeys** (was "Journeys > Journeys/Collections subtab") — shows CollectionsList directly; represents ordered collections of Walks
- **Media Studio** — hidden from nav; all code and DB tables preserved
- **Bible Study** — removed from Content Studio; lives only as standalone left-nav section

## VIEW_TO_TAB mappings
- `journeys-library`, `journeys-standalone`, legacy editors → `'walks'`
- `journeys-collections`, `collection-editor`, `collection-detail`, `journey-detail`, `journey-day-editor` → `'journeys'`
- `journey-editor` is **dynamic**: `fromLibrary ? 'walks' : 'journeys'` (computed in IIFE, not static map)

## Bible Study section (Admin.tsx → UnifiedBibleStudy.tsx)
Single consolidated component with 5 tabs:
1. Overview → `BibleProgressDashboard`
2. Notes → `BibleStudyAdmin defaultTab="notes"`
3. Cross References → `BibleStudyAdmin defaultTab="crossrefs"`
4. Generation → `BibleContentGenerator`
5. Book Intros → `BibleContentStudio initialSubView="book-intros"`

`BibleStudyAdmin` gained a `defaultTab?: 'notes' | 'crossrefs'` prop (default `'notes'`).
Each Notes/Cross References instance uses a `key` prop so state resets on tab switch.

## What was NOT changed
- No routes, DB tables, API endpoints, or content models were touched
- Media Studio code lives in `admin/media-studio/` — just hidden from nav
- BibleContentStudio bible-studio views remain in ContentStudio.tsx renderView() for backward compat (navigation just can't reach them from the top nav)

**Why:**
Spec required the nav to reflect actual content architecture, not build order.
Walks = individual steps; Journeys = ordered collections of Walks.
Bible Study was duplicated across two surfaces; consolidated to one.
