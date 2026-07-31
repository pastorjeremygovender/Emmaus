---
name: Bible Study Foundation
description: Stages 1–3 of the Bible Study & Annotation system — DB persistence, verse actions, study panel, admin.
---

# Bible Study Foundation (Stages 1–3)

## What was built

### Stage 1 — DB persistence
- `user_bible_data` table: single JSONB blob per user; replaces ephemeral in-memory Map.
- `bible_study_notes` table: admin-curated study content per verse/passage.
- Both tables created via `startup-migrations.ts` (idempotent).
- `artifacts/api-server/src/bible/store.ts` fully replaced with async PostgreSQL-backed implementation using `pool` from `@workspace/db`.
- API routes `GET /api/bible/data` and `PATCH /api/bible/data` made `async` to await the DB-backed functions.

**Why:** In-memory store was lost on every server restart; user annotations were ephemeral.

### Stage 2 — Verse action sheet (8 actions)
`ChapterReader.tsx` verse sheet redesigned as 4×2 grid:
1. **Study** → opens `VerseStudyPanel`
2. **Highlight** → inline colour picker (amber/blue/green + remove)
3. **Note** → inline textarea (existing flow preserved)
4. **Bookmark** → instant chapter bookmark (existing flow)
5. **Favourite** → instant verse save (existing flow)
6. **Prayer** → inline textarea, saves via `savePrayer(bookId, chapter, "BookName Ch:V — text")`
7. **Share** → `navigator.share()` with clipboard fallback
8. **Ask Emmaus** → navigates to `/personal/ask-emmaus/conversation?verse=…&q=…`

New state in ChapterReader: `showHighlightPicker`, `showPrayerInput`, `prayerText`, `studyPanelVerse`.
New helpers: `handleShare()`, `handleSavePrayer()`, `openStudyPanel()`.

### Stage 3 — Study panel framework
- `artifacts/project-emmaus/src/components/VerseStudyPanel.tsx`: bottom Sheet (92dvh) with 9 expandable accordion sections — Explanation, Passage Context, Historical Background, Original Language, How This Points to Jesus, Apply It, Preached Here, Go Deeper (Ask Emmaus), Related Walks.
- Fetches from `GET /api/bible/study-notes?bookId=&chapter=&verse=` (Published notes only).
- Shows clean empty states when no content is available.
- Admin study notes CRUD at `artifacts/project-emmaus/src/pages/admin/BibleStudyAdmin.tsx`.
- API endpoints: `GET /api/bible/study-notes` (member), plus `GET/POST/PUT/PATCH/DELETE /api/bible/study-notes/admin` (admin only, checked via x-user-role header).
- Bible Study section added to admin sidebar in `Admin.tsx` (new `AdminSection = 'bible-study'`).

## Key patterns

**PersonalPrayer**: `savePrayer` is chapter-scoped (one per chapter, replaces). For verse prayers, the verse ref is prepended to the text as "BookName Ch:V — [prayer text]". Full per-verse prayer journal is deferred.

**Study notes status flow**: Draft → In Review → Published → Archived. Only `Published` notes show in the member reader. Admins can one-click toggle Published ↔ Draft from the list.

**DB import in routes**: `bible.ts` now has a top-level `import { pool } from "@workspace/db"` for study notes CRUD — added inside the route file rather than a separate store module.

## Follow-up tasks proposed (stages 4–9)
- #219: Book intros + chapter overviews + cross references (Stage 4)
- #220: Personal Bible library — search annotations (Stage 7)
- #221: Side-by-side translation comparison (Stage 8)
