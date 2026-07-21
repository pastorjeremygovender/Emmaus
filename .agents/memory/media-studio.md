---
name: Media Studio module
description: Architecture and critical rules for the Emmaus Media Studio admin module.
---

## Location
- Types: `src/lib/media-studio-types.ts`
- Demo data + content generators: `src/lib/media-studio-demo-data.ts`
- Context (localStorage): `src/contexts/MediaStudioContext.tsx`
- UI: `src/pages/admin/media-studio/` — Dashboard, KitWizard, KitEditor, Calendar, GraphicPreview

## Critical rules
**Why:** The spec requires nothing auto-publishes, auto-schedules, or auto-shares.
- Every generated asset starts `status: 'Draft'` — hardcoded in `MediaKitWizard.handleGenerate` and `doGenerateCompanion`.
- Status flow: Draft → Pastoral Review → Approved → Scheduled → Published.
- Publishing always requires a `ConfirmDialog` — both at kit level and individual asset level.
- Restoring a version always creates a new Draft version; approved content is never silently overwritten.

## How to apply
- Any new asset-generation path must hardcode `status: 'Draft'`.
- The `regenerateAsset` function in `MediaStudioContext` always resets status to 'Draft'.
- `advanceAssetStatus` is the only path to change status; it's called only from confirmed UI actions.

## Admin routing
- `section: 'media-studio'` added to `AdminSection` type in `Admin.tsx`.
- `kitId?: string` added to `AdminNav`.
- `MediaStudioProvider` wraps inside `AdminProvider` in `Admin.tsx`.
- Nav item `Clapperboard` icon, positioned between Sermons and Prayer Requests.
