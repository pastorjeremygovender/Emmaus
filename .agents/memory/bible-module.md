---
name: Bible module architecture
description: Full Bible Engine v1.0 shipped; Luke-first, BibleProvider abstraction, simplified reader, 24 chapters KJV data.
---

# Bible Module Architecture

## Overview
Complete Bible Engine v1.0 shipped as a refactor of the existing Bible module. Luke is the flagship book/journey (Walk Through Luke, 24 chapters). John data is preserved as an ordinary available book with chapters 1–21 (1–3 real KJV, 4–21 placeholder).

## Key Files

| File | Role |
|---|---|
| `src/lib/bible-provider.ts` | BibleProvider interface + KJVLocalProvider singleton; `getChapter(bookId, ch)` is the sole scripture access point |
| `src/data/kjv-luke.ts` | Complete KJV Luke 1–24 (1,151 verses); exports `LUKE_CHAPTERS`, `LUKE_HEADINGS`, `LUKE_READING_MINUTES` |
| `src/data/kjv-john.ts` | KJV John (ch 1–3 real, 4–21 placeholder); exports `JOHN_CHAPTERS`, `JOHN_HEADINGS`, `JOHN_READING_MINUTES`, `JOHN_SERMON_REFS_MAP` |
| `src/lib/bible-data.ts` | Thin catalogue: `BIBLE_BOOKS` (66 books; Luke+John `available:true`), `BIBLE_JOURNEYS` (Walk Through Luke flagship + placeholder cards), `TODAYS_READING`, `WEEKLY_MEMORY_VERSE`; re-exports types+`getChapter` from provider |
| `src/contexts/BibleContext.tsx` | localStorage persistence; `ChapterBookmark` type; `emmaus_bible_bookmarks_v2` key; `addBookmark`/`removeBookmark`/`isBookmarked` |
| `src/pages/Bible.tsx` | Home: Continue Reading (uses `readingHistory.bookId`), Today's Reading, Journeys, Browse Books, Bookmarks |
| `src/pages/bible/ChapterReader.tsx` | Scripture-first reader; bottom toolbar: Prev | Notes | Bookmark | Continue; verse-tap sheet (Save/Highlight/Note); no Ask Emmaus / Preached Here in active UI |
| `src/pages/bible/ChapterCompletion.tsx` | Gentle 2-card layout (Reflect + Pray); Continue / Finish buttons |
| `src/pages/bible/BibleJourneyDetail.tsx` | Walk Through Luke; imports LUKE_HEADINGS/LUKE_READING_MINUTES directly |
| `src/pages/bible/BookDetail.tsx` | Dynamic via `getChapter` provider; supports any available book |
| `src/pages/bible/BrowseBooks.tsx` | 66-book browse; "Luke is available now" copy |

## Architecture decisions

**Why provider abstraction:**
All UI components call `getChapter(bookId, ch)` from `bible-provider.ts` — never raw data files. Adding a new translation or remote source is a single `KJVLocalProvider` swap.

**Why localStorage stays:**
Firebase swap is a Task #5 follow-up. BibleContext is structured so only the context's read/write layer changes — UI is untouched.

**Why Ask Emmaus / Preached Here / Go Deeper are removed from active UI:**
Phase-2 features per spec. The verse-tap sheet and completion flow have slots ready for them. Sermon-to-verse mapping pattern lives in `JOHN_SERMON_REFS_MAP` in `kjv-john.ts`.

**localStorage key versioning:**
`emmaus_bible_bookmarks_v2` is new (chapter bookmarks, distinct from verse favourites). Other existing `emmaus_bible_*` keys are unchanged in shape. Any future shape change must bump the version suffix.
