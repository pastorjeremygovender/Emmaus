---
name: Sermon Generation Pipeline
description: Root causes, fixes, and architecture of the URL-first sermon draft pipeline
---

## The real failure mode (July 2026)

`max_completion_tokens: 600` caused OpenAI to truncate the sermon draft JSON mid-output, producing `"Unexpected end of JSON input"`. Authentication worked fine; the model responded; only the parse failed.

**Fix:** 1500 tokens for sermon draft, 6000 tokens for companion (5 days × full devotionals).

## Critical: THEME_CONFIRMATION_REQUIRED must return HTTP 200

`httpStatusForCode()` in `routes/sermon-generator.ts` must include `"THEME_CONFIRMATION_REQUIRED": return 200`. If missing, the route returns HTTP 500, the `post<T>()` client discards `source` (hardcodes `null`), `themeSource` is null in SermonEditor, and `handleThemeConfirm` silently does nothing — the pipeline appears frozen.

**Why:** `post<T>()` only forwards `source` on `res.ok` (200) responses; non-ok responses lose it entirely. Even with the HTTP fix in place, `post<T>()` now preserves `source` from non-ok bodies as a defence.

**How to apply:** Any new structured-confirmation error code must be added to `httpStatusForCode` returning 200.

## Output validation before saving

`generateFromUrl` now validates AI output before saving to DB:
- Sermon: `summary.length >= 30` — if empty, throws `GENERATION_FAILED` without saving.
- Companion: all 5 entries must have `reflection.length >= 30` — if any blank, throws `GENERATION_FAILED`.

This prevents `safeParseJson` returning `{}` (empty AI content) from flowing through to a saved blank draft.

## `safeParseJson()` — truncation repair

When `finish_reason === "length"`, the response was cut off. `safeParseJson()` in `sermon-generator.ts` tries:
1. Direct `JSON.parse`
2. Repair: close open strings, strip trailing commas, count+close open `{` / `[`
3. Return `{}` as last resort (never throw — caller handles missing fields gracefully)

## Structured errors (GenerationError class)

All failures in the pipeline throw `new GenerationError(code, message, source?)`.
Route handler catches `instanceof GenerationError` and returns:
```json
{ "success": false, "code": "...", "message": "...", "source": {...} }
```
HTTP status mapped by `httpStatusForCode()`. `TRANSCRIPT_REQUIRED` returns 200 (structured "needs input", not a server error).

## Transcript fallback architecture

1. If `options.providedTranscript` is in the body → use it, skip OAuth retrieval
2. Otherwise attempt OAuth caption retrieval
3. If retrieval returns null → throw `GenerationError("TRANSCRIPT_REQUIRED", ..., { videoId, title, thumbnailUrl })`
4. Frontend catches `ApiError` with `code === "TRANSCRIPT_REQUIRED"` → shows `TranscriptFallbackPhase`
5. Pastor pastes transcript → calls same endpoint with `{ youtubeUrl, transcript }` → succeeds

## Frontend error codes → messages (SermonEditor errorMessage())

| Code | User-facing message |
|------|---------------------|
| INVALID_YOUTUBE_URL | "Please enter a valid YouTube video link." |
| UNAUTHENTICATED | "Your session has expired. Please sign in again." |
| FORBIDDEN | "You don't have permission to generate sermon drafts." |
| VIDEO_UNAVAILABLE | "We couldn't access this YouTube video..." |
| AI_NOT_CONFIGURED | "Sermon generation is not configured yet." |
| GENERATION_TIMEOUT | "Emmaus took too long to prepare this draft..." |
| GENERATION_FAILED | "We couldn't prepare the sermon draft..." |

## `ApiError` class (frontend `sermon-generator-api.ts`)

`post<T>()` now parses error bodies and throws `ApiError(code, message, source)`.
Both `!res.ok` AND `res.ok + success:false + code` flows throw `ApiError` so callers can `instanceof` check uniformly.

## URL normalization

`extractVideoId()` supports:
- `youtube.com/watch?v=ID`
- `youtu.be/ID`
- `youtube.com/embed/ID`
- `youtube.com/live/ID`
- `youtube.com/shorts/ID`

All validate against `/^[A-Za-z0-9_-]{11}$/` to reject garbage before calling any provider.

**Why:** Before this fix, /live/ and /shorts/ URLs returned null video ID and showed a generic error.
