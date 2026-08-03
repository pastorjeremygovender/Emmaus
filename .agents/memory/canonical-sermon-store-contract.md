---
name: Canonical sermon store contract
description: Key design decisions for the canonical sermons DB table and its admin API surface — persist correctly or Ask Emmaus and Preached Here break.
---

# Canonical sermon store contract

## The rule
`transcript` = sermon-section only (used by Ask Emmaus, companion generation, re-detect).  
`full_transcript` = original full recording (used by the redetect route; must not be lost on save).

**Why:** redetect runs on the full recording to locate sermon boundaries. If only the trimmed transcript is stored, re-detection produces the wrong result.

## How to apply
- Generator: persist `transcript = sermonTranscript || fullTranscript`, `full_transcript = fullTranscript`.
- `adminPatchToCanonical`: map `body.transcript → fullTranscript`, `body.sermonTranscript → transcript`. When `sermonTranscript` is absent (non-generator sermon), mirror `transcript` to both fields.
- redetect route: use `existing.fullTranscript || existing.transcript` as input; update `transcript` (sermon-only) plus detection metadata.

## `publishedAt` must be maintained by the PATCH route
`publishSermon()` / `unpublishSermon()` helpers exist but the editor uses `PATCH /api/admin-sermons/:id`. `adminPatchToCanonical` must set `publishedAt = now()` on publish and `publishedAt = null` on draft/unpublish — otherwise canonical ordering by `published_at` is broken.

## Atomic delete
`deleteSermonFully(sermonId)` in `canonical-sermon-store.ts` wraps companion progress + entries + companion + sermon deletion in a single transaction. Always use this for canonical sermons — never two separate calls.

## `addSermon` shadow-write prevention
`AdminContext.addSermon` accepts `opts?: { skipServerPersist?: boolean }`. Always pass `{ skipServerPersist: true }` when adding a sermon that already lives in the canonical DB (generator-created or DB-hydrated after reload) to prevent a JSON shadow record being created via POST `/api/admin-sermons`.

## SermonEditor loading guard
When `sermonId` is a UUID not yet in `AdminContext` (post-reload), the editor fetches from the DB before rendering the form. `loadingFromDb` state blocks the form; `loadFromDbError` shows an error screen. This prevents a blank form being saved over the canonical record.

## Detection metadata columns (added 2026-08)
`sermons` table has: `full_transcript`, `sermon_start_time`, `sermon_end_time`, `detection_confidence`, `detection_method`. These are optional in `CreateSermonData` (legacy callers default to `""` / `0` / `"none"`).

## Audio-first processing pipeline (added 2026-08)
Two new columns on `sermons`: `processing_stage` (TEXT default `'idle'`) and `processing_error` (TEXT default `''`). Values: `idle | transcribing | generating | complete | failed:transcribing | failed:generating`.

`POST /api/sermons/admin/:id/process` sets stage to `'transcribing'`, returns 202, then background: `transcribeAudio → updateSermon(generating) → generateSermonContentFromTranscript → updateSermon(complete)`.

Frontend: `processingStage` state in `SermonEditor` initialized from `existing.processingStage`. Polls `getAdminSermon` every 3s when active. Shows `SermonProcessingView` (full-screen progress) when stage is `transcribing | generating | failed:*`. On `complete`, reloads sermon + companion.

`SermonsList` "Process Sermon" button = primary (requires audio); "Save as Draft" = secondary (no processing). Default speaker pre-filled to 'Pastor Jeremy Govender'.

`handlePublish` in SermonEditor is now atomic: also publishes companion if it's Draft.

## ffmpeg PATH in deployed environment — critical
`spawn("ffmpeg")` fails with `ENOENT` in the deployed server process because Node.js uses a stripped PATH that excludes Nix store paths visible in the interactive shell.

**Fix (in audio-transcription.ts):** `resolveFfmpegPath()` runs `execSync("which ffmpeg")` via `/bin/sh` at module load time — the shell has the full Nix PATH. The resolved absolute path is stored as `FFMPEG_BIN` and used in all `spawn()` calls. Never use bare `"ffmpeg"` as the spawn command; always use the cached `FFMPEG_BIN`.

## Large-file transcription pipeline (audio-transcription.ts)
Three-stage pipeline — all automatic, no admin action required:
1. File ≤ 24 MB → Whisper directly (single call)
2. File > 24 MB → `compressWithFfmpeg()` (16 kHz mono 32 kbps MP3 via `FFMPEG_BIN`). 82.6 MB at 128 kbps stereo → ~21 MB.
3. Compressed result still > 24 MB (sermon > ~100 min) → `transcribeInChunks()`: segments into 15-min chunks via `ffmpeg -f segment`, transcribes each chunk sequentially, concatenates results.

**Why post-compression guard is required:** `compressedBytes` must be checked against `WHISPER_MAX_BYTES` after compression, not only before. Original code only logged it; missing guard caused > 25 MB compressed files to hit Whisper and return 413.
