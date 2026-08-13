---
name: Voice Bible Translation (Phase 3.1)
description: Translation resolution policy, shared fetch singleton, localStorage key, and TTS licensing for Emmaus Voice Bible reading.
---

## Rule
Voice Bible reading (TTS audio) must use the same translation as the visual Bible reader — one shared source of truth. Never hardcode `bsb`.

**Why:** Phase 3 hardcoded BSB in a raw fetch. Phase 3.1 fixes this.

## Translation storage
- `localStorage` key: `'emmaus_bible_translation'` (same key BibleContext uses)
- Default: `'bsb'`
- Comment in BibleContext confirms: "Translation preference is always local — not synced to cloud"

## TTS licensing policy
- **TTS-safe (public domain):** BSB, ASV, KJV — no restrictions on audio reproduction
- **Excluded from Voice TTS:** NIV (Zondervan), GNT (ABS), MSG (NavPress) — API.Bible standard terms cover text display, NOT audio reproduction. Until TTS licences are confirmed with each publisher, these are excluded.
- If a user's preference or explicit request is an excluded translation, `resolveVoiceTranslation()` returns BSB with `substituted: true`. Voice speaks a notice before reading.

## Key files
- `artifacts/project-emmaus/src/lib/voice-bible.ts` — Translation resolution, `TTS_SAFE_TRANSLATIONS`, `resolveVoiceTranslation()`, `buildSubstitutionNotice()`, `SPOKEN_TRANSLATION_MAP`
- `artifacts/project-emmaus/src/lib/bible-provider.ts` — `remoteBibleProvider` singleton (shared with visual reader)
- `artifacts/project-emmaus/src/components/emmaus/VoiceMode.tsx` — `bibleContextRef` now includes `translationId`; `loadAndStartReading` uses `remoteBibleProvider`

## Shared fetch
Use `remoteBibleProvider.getChapter(bookId, chapter, translationId)` — not raw fetch. It has in-memory caching, deduplication, and correct `apiBase` from Vite's `BASE_URL`. The `/api/bible/:translation/:bookId/:chapter` endpoint does NOT require auth (only `/bible/data` and `/bible/cross-references` do).

## Intent changes (voice-intent.ts)
- `BibleRef` now has `translationId?: string` for explicit requests ("read John 3 in ASV")
- `parseBibleRef` strips "in [the] [translation]" suffix before book matching, sets `translationId`
- `continue-reading` now has `direction?: 'next' | 'previous'`
- "previous chapter" → `{ type: 'continue-reading', direction: 'previous' }`
- "read this chapter" → `{ type: 'read-content', content: 'bible' }` (no bibleRef; caller uses bibleContextRef or initContext)

## How to apply
If a future change needs to read Bible text for Voice, always call `resolveVoiceTranslation(explicitId | null)` first, then check `substituted`. Speak the notice (from `buildSubstitutionNotice`) before reading if substituted. Never call the Bible API with a hardcoded translation string.
