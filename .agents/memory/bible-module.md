---
name: Bible module architecture
description: Design decisions, data flow, and extension points for the Bible module in Project Emmaus.
---

## Overview
The Bible module is the theological and visual centre of Project Emmaus. Scripture is the primary surface.

## Key files
- `src/lib/bible-data.ts` — all 66 books catalogue, full KJV John 1–3, placeholder verses John 4–21, chapter metadata (journeyIntro, askEmmaus, goDeeper, prayerPrompt), 5 BIBLE_JOURNEYS, JOHN_SERMON_LINKS
- `src/contexts/BibleContext.tsx` — BibleProvider + useBible() hook, all state in localStorage
- `src/pages/Bible.tsx` — Bible home
- `src/pages/bible/BrowseBooks.tsx` — all 66 books
- `src/pages/bible/BookDetail.tsx` — John detail with chapter list
- `src/pages/bible/ChapterReader.tsx` — main reading screen
- `src/pages/bible/ChapterCompletion.tsx` — post-chapter: Reflect, Pray, Go Deeper, Ask Emmaus
- `src/pages/bible/BibleJourneyDetail.tsx` — Walk Through John hub

## localStorage keys (do not rename without bumping)
emmaus_bible_history, emmaus_bible_completed, emmaus_bible_journey_progress, emmaus_bible_highlights, emmaus_bible_favourites, emmaus_bible_notes, emmaus_bible_reflections, emmaus_bible_prayers

## Routes (in App.tsx)
- /bible
- /bible/books
- /bible/books/:bookId
- /bible/read/:bookId/:chapter  ← ChapterReader; accepts ?journey=journeyId
- /bible/read/:bookId/:chapter/complete  ← ChapterCompletion; note: /complete MUST come BEFORE the reader route
- /bible/journey/:journeyId

**Why the route order matters:** Wouter matches top-to-bottom; /complete must be declared before the bare /:chapter route or it won't match.

## Preached Here data pattern
`JOHN_SERMON_LINKS` in bible-data.ts maps chapter number → array of { sermonId, timestampSeconds, note }. ChapterReader looks up the sermon from localStorage ('emmaus_admin_sermons') with fallback to DEMO_JOHN_SERMON imported from admin-demo-data.ts. No duplicate storage — the sermon record lives in admin, the link lives in bible-data.

## Extension points
- Swap KJV for a licensed provider: implement `BibleProvider` interface in bible-data.ts and swap getJohnChapter() with an API call — no UI changes needed.
- John only is available:true; all 65 others show a lock/unavailable state.
- Ask Emmaus and Go Deeper are seeded for John 1–3; chapters 4–21 show "coming soon" gracefully.
- DEMO_JOHN_SERMON (id: sermon-john-3) is in admin-demo-data.ts; add it to the admin sermon list if needed.
