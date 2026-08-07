---
name: Navigation Redesign
description: Full UX redesign — new bottom nav, Discover page, My Journey page, AskEmmausBar, Favourites, History, Global Search.
---

## Bottom Nav (canonical order)
Today's Steps | My Bible | Discover | My Journey

- Tab 1: Today's Steps → /walk
- Tab 2: My Bible → /bible
- Tab 3: Discover → /journeys  (was "Next Steps")
- Tab 4: My Journey → /personal

## FAB (FloatingEmmausButton) hidden on
`/walk`, `/journeys`, `/bible`, `/personal` — replaced by inline AskEmmausBar on those screens.

## AskEmmausBar
New inline companion bar (`src/components/AskEmmausBar.tsx`). Placed on Walk.tsx, Journeys.tsx, Personal.tsx.

## Discover page (Journeys.tsx)
- H1: "Discover" (was "Next Steps")
- Subtitle: "What would you like to explore?"
- AskEmmausBar below header
- Search bar: globalSearch() from `lib/search-api.ts`; results shown when query ≥ 2 chars; tabs hidden while searching
- Tab order: Walks | Journeys | Daily Devotionals | Sermon Companions
- SessionStorage key: `discover-tab` (was `next-steps-tab`)

## My Journey page (Personal.tsx)
Full rewrite. Sections:
1. Profile header + name edit (kept)
2. AskEmmausBar
3. Continue (in-progress from fetchNextSteps)
4. Completed (from fetchNextSteps)
5. ⭐ Favourites (from fetchFavourites)
6. History (from fetchHistory, last 20 entries)
7. Prayer Requests (localStorage)
8. Saved Reflections (localStorage)
9. My Rooms
10. Settings (notifications toggle)
11. Sign Out

## Backend — new routes & tables
- `user_favourites` table: GET/POST/DELETE at `/api/favourites`; `src/routes/favourites.ts`
- `user_history` table: GET/POST at `/api/history`; `src/routes/history.ts`; deduped by content_id, newest-first
- Unified search: GET `/api/search?q=`; `src/routes/search.ts`; searches journeys + devotionals + sermons + companions
- All registered in `src/routes/index.ts`
- Tables created by startup migration (idempotent)
- DB import: `@workspace/db` (not `../lib/db.js`)

## Frontend — new lib files
- `src/lib/favourites-api.ts` — fetchFavourites, checkFavourited, addFavourite, removeFavourite
- `src/lib/history-api.ts` — fetchHistory, recordView (fire-and-forget), historyTimeLabel
- `src/lib/search-api.ts` — globalSearch(query) + SearchResult type + CONTENT_TYPE_LABEL map

## FavouriteButton component
`src/components/FavouriteButton.tsx` — universal ⭐ toggle with optimistic UI. Added to SermonCompanionOverview header.

## History tracking wired to
- JourneyDay.tsx — useEffect on [journeyId, day]
- SermonCompanionReader.tsx — inside load() callback after setCompanion
- DevotionalDay.tsx — inside load() callback after setSeriesData
- SermonCompanionOverview.tsx — inside load() callback after setCompanion

**Why:** Step type has no `id` field — use `journeyId` + `day` as dependency keys for JourneyDay history useEffect.
