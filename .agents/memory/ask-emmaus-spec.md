---
name: Ask Emmaus spec implementation
description: Full spec implementation — parallel search, nextSteps, chapter badge, prompt overhaul. Durable decisions about the design of these features.
---

## What was built

### Parallel Bible + Sermon search (conversation-service.ts)
- `Promise.all([searchBibleVerses, retrieveSermon])` replace the sequential sermon-only call
- `searchBibleVerses()` is synchronous, reads BSB from `data/bible/bsb/`, cached in-process
- Up to 5 BSB verse matches injected into the LLM system context block before every call
- sermon-retrieval.ts remains unchanged (already async)

### nextSteps array (EmmausResponseMetadata)
- Added `nextStepItem` interface to `firestore-model.ts` and `emmaus-client.ts`
- LLM generates `read`, `pray`, `continue` items in EMMAUS_META JSON
- Conversation service INJECTS the `listen` item from the verified sermon result after LLM call — LLM is explicitly instructed NEVER to generate `listen`
- The listen item is formatted: `"${titleShort}" — ${speaker}, ${timestampLabel}`
- `defaultMetadata()` includes `nextSteps: []` so the field always exists
- `finalMeta.nextSteps` is force-initialized to `[]` before injection to handle LLM omissions

### System prompt overhaul (system-instructions.ts v1.1.0)
- Added CRITICAL RESPONSE STYLE block: "Write ONE flowing pastoral response — never section headers"
- LLM told to weave sermon insight naturally into prose (reference by insight, not by link)
- nextSteps format documented with exact types and examples
- Explicit: do NOT generate type "listen" — injected automatically
- Verified sermon context must require at least one natural written sermon reference; the link/listen card is supplementary, not a substitute.

### Preached Here chapter badge (ChapterReader.tsx)
- `useEffect` fetches `/api/youtube-archive/preached-here?bookId=&chapter=` on chapter change
- Non-critical: errors silently dismissed
- Badge (amber pill with 🎧) appears below chapter heading when results > 0
- Tapping opens a Sheet with sermon list (title, speaker, "▶ Watch from N:NN")
- `getPreachedHere()` added to `youtube-archive-api.ts`

### searchByScripture (sermon-search.ts)
- Primary: searches `bookIndex` (pre-tagged `scriptureBookIds`)
- Fallback: searches `termIndex` for book name as term (works even without tagged metadata)
- Chapter filter: ONLY applied when segment has `scriptureChapters` or `scriptureRefs` data — skipped for text-fallback results (no chapter metadata available)
- Returns `SermonSearchResult[]` async (triggers index build if needed)
- Route `/api/youtube-archive/preached-here` is async and awaits it

### Embedding generation endpoint
- `POST /api/youtube-archive/pipeline/embed` starts background embed job
- Uses `text-embedding-3-small` with 256 dimensions
- Stores in `data/sermons/embeddings.json` (atomic write per batch)
- Idempotent — skips segments already embedded
- Job type "embed" added to `JobType` union in sermon-store.ts
- `SermonSegment.embedding?: number[]` field added
- `runEmbedding()` added to `youtube-archive-api.ts`

### NextStepsCard component
- Renders `read`📖 `pray`🙏 `listen`🎧 `continue`🚶 items with emoji icons
- Clickable items navigate (internal path) or open in new tab (http URLs)
- Listen items show timestamp sub-line: "▶ Watch from N:NN"
- Rendered after ResourceCards in AskEmmausConversation.tsx

## Key constraints and gotchas

**Why**: The `searchByScripture` chapter filter must be skipped for text-fallback results.
Segments found via `termIndex["john"]` have empty `scriptureChapters` — applying the filter
would eliminate all fallback results. The guard `hasScriptureMetadata` controls this.

**Why**: "listen" nextSteps must NEVER come from the LLM. The system prompt states this
explicitly. The conversation service strips any LLM-generated listen items (the `hasListen`
check prevents duplicates but the LLM is instructed not to produce them).

**Why**: `searchByScripture` is async even though the core logic is synchronous. It needs to
call `buildIndex()` when `_index` is null (after server restart, before first `searchSermons`
call). Making it sync would return empty on cold start.

**Why**: BSB Bible passages injected into context give the LLM exact verse text to quote
accurately, rather than relying on training data (which may differ from the app's translation).

## Data state (as of implementation)
- 2,179 sermon segments, 19 approved videos
- Only 2 segments enriched (enrichment was failing: "Unexpected end of JSON input" from gpt-5)
- Preached Here chapter badge uses text-based fallback (book name in segment terms)
- Embedding job started but embeddings.json may not be complete
- Preached Here returns ~4-5 results for popular books (John, Romans) via text fallback
