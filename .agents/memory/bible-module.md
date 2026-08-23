---
name: Bible module architecture
description: Full Bible MVP — 66 books, BSB+ASV+KJV local + API.Bible provider for NIV/GNT/MSG with confirmed Bible IDs, dynamic catalogue, translation dropdown fixed.
---

# Bible Module Architecture

## Overview
Complete Bible MVP with all 66 books in three public-domain translations (BSB default, ASV, KJV) plus a server-side API.Bible provider for licensed translations (NIV, GNT, MSG). Licensed translations appear in selectors only when the configured API.Bible account confirms access. The frontend is provider-neutral — it fetches from the same API routes regardless of source.

## Data Layer

| File / Path | Role |
|---|---|
| `artifacts/api-server/data/bible/bsb/` | 66 JSON files, BSB text (CC0) |
| `artifacts/api-server/data/bible/asv/` | 66 JSON files, ASV text (PD 1901) |
| `artifacts/api-server/data/bible/kjv/` | 66 JSON files, KJV text (PD) |
| `artifacts/api-server/scripts/download-bible.mjs` | Re-download script (scrollmapper/bible_databases); downloads BSB, ASV, KJV |
| `artifacts/api-server/src/routes/bible.ts` | `GET /api/bible/translations` (dynamic catalogue), `GET /api/bible/:translation/:bookId/:chapter` (local + licensed), `POST /api/bible/search` (local only) |
| `artifacts/api-server/src/lib/api-bible-provider.ts` | Server-side API.Bible proxy; verifies confirmed Bible IDs at startup; never exposes key to client |
| `artifacts/project-emmaus/src/lib/bible-provider.ts` | `RemoteBibleProvider` (in-memory cache, dedup in-flight); `remoteBibleProvider` singleton |
| `artifacts/project-emmaus/src/hooks/useChapter.ts` | `useChapter(bookId, ch, translationId)` — per-effect `cancelled` flag for stale request protection |
| `artifacts/project-emmaus/src/hooks/useTranslations.ts` | `useTranslations()` — fetches `/api/bible/translations` once per session (module-level cache), falls back to BSB/ASV/KJV while loading |
| `artifacts/project-emmaus/src/lib/bible-data.ts` | 66-book catalogue; cross-book navigation helpers |
| `docs/bible-translations.md` | Full attribution, licensing, caching policy, confirmed Bible IDs |

## API.Bible — Confirmed Bible IDs

These IDs are account-specific. Do NOT substitute guesses. Update `CONFIRMED_BIBLES` in `api-bible-provider.ts` if the account changes.

| Internal ID | Abbreviation | Name | API.Bible Bible ID |
|-------------|-------------|------|-------------------|
| `niv` | NIV | New International Version | `78a9f6124f344018-01` |
| `gnt` | GNT | Good News Translation | `61fd76eafa1577c2-02` |
| `msg` | MSG | The Message | `6f11a7de016f942e-01` |

**Why direct IDs not keyword matching:** Runtime keyword discovery was unreliable (wrong Bible returned on partial matches). Confirmed IDs verified against `/bibles/{id}` at startup; excluded if 401/403.

## The Message verse format
The Message uses `[N-M]` range markers (e.g. `[1-3]`, `[4-7]`) instead of individual `[N]` per verse. The verse parser handles both: use start verse number N as the key, store the full paragraph under it. `parseVerseMarkers()` in `api-bible-provider.ts` handles both formats.

## API Path Resolution
`DATA_DIR = join(process.cwd(), "data/bible")` — must use `process.cwd()` not `import.meta.url` because esbuild bundles into `dist/index.mjs`.

## Translation Architecture
- **Local**: BSB, ASV, KJV — served from disk, `public, max-age=86400`, search supported
- **Licensed**: NIV, GNT, MSG — proxied via `apiBibleProvider`, `private, max-age=300`, no disk persistence
- **Catalogue**: `GET /api/bible/translations` always returns local 3; licensed added only after API.Bible verification
- **Frontend**: Both Bible Home and ChapterReader use `useTranslations()` hook — same live catalogue, module-level cache

## Selector / ChapterReader fix (translation dropdown)
The close-on-outside-click listener was `{ capture: true, once: true }` which fired in capture phase before item onClick. Fixed to `pointerdown` + `dropdownWrapperRef.current.contains(e.target)` — closes only when pointer lands outside the wrapper.

**Failure recovery**: `prevTranslationRef` tracks last working translation. On load error, `setTranslation(prevTranslationRef.current)` reverts and sets `translationError` shown inline.

## Cache key
`${translationId}:${bookId}:${chapter}` — all three dimensions included; switching translations never serves stale text from a different translation.

## Chapter content parsing
API.Bible chapter endpoint: `GET /bibles/{bibleId}/chapters/{chapterId}?content-type=text&include-verse-numbers=true&include-verse-spans=true`
Returns a single text blob with inline `[N]` or `[N-M]` markers.
`parseVerseMarkers()` splits on both patterns; range markers use the start verse number.

## Key Decisions
- **`process.cwd()` not `import.meta.url`** for DATA_DIR in compiled bundle
- **Literal admin routes must bypass dynamic member routes** — Express will otherwise treat `/book-intro/admin` as `bookId = "admin"` and return the member-route 404 before admin handlers run.
- **Strict allowlist** for bookId (66 canonical IDs) and translationId before any filesystem access
- **KJV local data kept** — `kjv-luke.ts` and `kjv-john.ts` still used for Walk journey chapter headings and reading-minute estimates (separate from the full KJV served via API)
- **Search limited to local translations** — API.Bible search not implemented; search route returns 400 for licensed IDs
- **Licensed caching**: `private, max-age=300` header, in-process Map only, cleared on restart
- **MSG Bible ID was originally given as `61f1fa7de016f942e-01` (typo)** — actual ID is `6f11a7de016f942e-01`; found by searching the account's 250-Bible catalogue
