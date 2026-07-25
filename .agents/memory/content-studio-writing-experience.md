---
name: Content Studio — Writing Experience sprint
description: Design decisions and patterns from the "Writing Experience" sprint that polished the block editor into a Notion-like writing environment.
---

# Content Studio — Writing Experience Sprint

## Architecture decisions

**Collapsible panels**: `leftOpen` / `rightOpen` boolean state in `StudioJourneyEditor`. Collapsed left shows a thin strip with day-number buttons; collapsed right disappears entirely with a toggle in the center topbar.

**SelectedView type**: Changed from `selectedDay: number | null` to `selectedView: 'overview' | number`. When `'overview'`, center shows `JourneyHeader` (title/subtitle/description as editable inline fields). When a number, center shows `BlockCanvas` for that step's day. Right panel adapts to show `JourneySettings` or `StepSettings` accordingly.

**"New Journey" flow**: `StudioOverview.onNewJourney` → `ContentStudio` navigates to `{ id: 'journeys', openNew: true }` → `StudioJourneyList` receives `autoOpenNew` prop and initialises `showNew` state to `true`, skipping the extra click.

**Add Step → immediate focus**: `handleAddStep` calls `addStep` with title `'Untitled Step'`, then `setTimeout(() => titleInputRef.current?.focus(), 100)` to place the cursor in the step title field in the center header bar.

## Block canvas (BlockCanvas.tsx)

- Spacing: `py-2 px-1` per block row (was `p-3`) + `AddBetweenBtn` height increased to `h-6`
- Type labels: only shown for non-paragraph/heading/divider blocks; colored per type using `LABEL_COLORS` map
- Empty state: warm copy ("Start writing below") + keyboard hint; rounded-2xl dashed border

## Journey list (StudioJourneyList.tsx)

- `TYPE_CONFIG` map: icon + color + bg + label for core/companion/series/course
- Metadata row uses Clock and Tag lucide icons inline
- Action button is a labeled pill "Edit" (with Layers icon) only — removed classic editor button from hover state to reduce clutter

## Overview (StudioOverview.tsx)

- Primary action is a full-width teal CTA button (not a card) — "New Journey"
- "Continue Editing" section shows recent drafts (Draft/Pastoral Review status) separate from "Recently Updated"
- Language: "Journeys" not "Manage Journeys", "Collections" not "Manage Collections"

## Preview panel

Three viewport buttons (phone/tablet/desktop) remembered in `previewSize` state. Width is set via inline style `maxWidth`. Phone=375px, Tablet=768px, Desktop=100%.

## What NOT to change in future sprints

- The autosave ref pattern (`stepsRef`) — critical for avoiding stale closures
- The `key={view.journeyId}` on `StudioJourneyEditor` — forces full remount on journey switch, preventing stale state
- Collections routes require `requireAuth` on POST/PUT/DELETE

**Why:** These were rejected-completion fixes; bypassing them will reintroduce bugs.
