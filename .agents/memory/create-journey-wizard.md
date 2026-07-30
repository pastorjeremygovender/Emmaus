---
name: Create Journey wizard
description: 3-step modal (method → contentType → details); reference pattern for all Emmaus creation workflows.
---

# Create Journey wizard

## Pattern (reference for all future creation workflows)
`NewJourneyModal.tsx` is the canonical template. Every creation workflow should follow:
- Fixed modal shell: `max-h-[calc(100dvh-2rem)]` so it never clips the viewport
- `flex-col` with three parts: `flex-shrink-0` header, `flex-1 min-h-0 overflow-y-auto` content, `flex-shrink-0` footer
- Header: ← Back (Cancel on step 1) | centred title | ✕ Close — all three always visible; Back and Close each `w-20 flex-shrink-0` so the title stays centred
- Step progress: 3 `h-[3px]` pill divs, `flex-1`, teal when `s <= step`
- Footer: single full-width `h-12 rounded-2xl` CTA, disabled with `disabled:opacity-40`

## Wizard steps
1. **Method**: Build with Emmaus AI | Start from Scratch — large two-card layout
2. **Content type**: 6 cards in `grid-cols-2`, icon + label + desc; selecting a type also auto-fills journeyType suggestion
3. **Details**: Title, Description, Collection (if any exist), Journey Type (dropdown), Estimated Length (number)

## Routing after Step 3
- **Scratch** → `addJourney()` → `onCreated(id)`. `durationDays = parseInt(estimatedLength) || 0`.
- **AI** → sets `launchBuilder = true` → renders `JourneyBuilderWizard` with `initialContentType`, `initialTitle`, `initialScreen={1}` (skip wizard's own Screen 0).

## JourneyBuilderWizard new props
- `initialTitle?: string` — pre-fills `state.title` in `loadDraft()`, overrides any saved draft
- `initialScreen?: number` — passed to `useState(initialScreen ?? 0)` for `screen`
- Always override `contentType` and `title` in `loadDraft`, even when a draft is found in localStorage

## Content type → journeyType mapping
`CT_TO_JOURNEY_TYPE` in NewJourneyModal maps content type IDs to sensible journeyType defaults so Step 3 is pre-filled when the user selects a content type in Step 2.
