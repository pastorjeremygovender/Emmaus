---
name: YouTube Sermon Archive
description: Architecture of the ICC sermon archive pipeline — import, search, sermon-start detection, audio generation, and dual-timestamp model.
---

# YouTube Sermon Archive — Durable Architecture Notes

## Dual-Timestamp Model
Every `SermonSegment` carries two coordinate systems:
- `absoluteStartSeconds` — seconds from video start (matches YouTube `?t=` param)
- `relativeStartSeconds` — seconds from detected/manual sermon start (audio player position)
- `isSermonContent` — `false` for pre-sermon segments (worship, announcements); those are excluded from the search index

**Why:** ICC services run 20–40 min of worship before preaching. YouTube links must land at the absolute position; the in-app audio player must seek to the relative position within the trimmed audio.

## finalSermonStartSeconds Source of Truth
`getFinalSermonStart(manual, detected)` — manual overrides auto-detection. This value is recomputed and persisted whenever `manualSermonStartSeconds` changes (in the PATCH route). Audio generation always reads `video.finalSermonStartSeconds ?? 0`.

**Why:** Without re-persisting on manual update, the generate-audio route could use a stale auto-detected value and trim at the wrong point.

## OAuth Token File — NEVER COMMIT
`artifacts/api-server/data/sermons/oauth.json` holds live YouTube refresh + access tokens at runtime. It is in `.gitignore`. Do not move it, rename it, or create alternate token files outside that ignore pattern.

## Audio Pipeline
- Uses `@distube/ytdl-core` (not yt-dlp — pip unavailable on Nix) + `fluent-ffmpeg` (ffmpeg is on PATH via Nix)
- Output: `data/audio/<videoId>.mp3`; served via `GET /api/youtube-archive/audio/:id` with Range support
- Status lifecycle: `undefined → processing → ready | failed`

## Sermon-Start Detector — Key Design Decisions
- **Window matching**: each cue is matched against a 3-cue window (prev + cue + next) to handle phrases that span caption boundaries
- **Best-match scanning**: continues past the first match to find the highest-confidence phrase; stops at ≥ 0.90
- **Music-gap strategy**: finds ALL gaps ≥ 30 s with ≥ 60 s of speech following, then returns the last eligible candidate (≤ 80% of video duration) — this targets the worship→sermon boundary not the opening or closing
- **Duration estimate** is graduated: 20% (45-75 min), 25% (75-100 min), 28% (100-130 min), 30% (130+)
- **Confidence colour coding** in admin: green ≥ 80%, amber ≥ 70%, red < 70%

## Admin Sermon-Timing Review
- "Needs Timing Review" filter = approved + transcribed, unverified, AND (no detection OR confidence < 70%)
- YouTube embed preview uses `?start={detected - 60}&autoplay=1` — lets admin hear ±60 s of context without full audio generation
- `sermonStartsNeedingReview` stat uses the same predicate; `sermonStartsVerified` / `sermonStartsDetected` = accuracy %

## Search Index Filtering
`buildIndex` skips segments where `isSermonContent === false`; segments with `isSermonContent === undefined` (legacy, pre-repair) are included for backward compatibility. Run repair-timestamps pipeline to backfill.

## req.params Quirk
Route params must be cast with `String(req.params.id)` — not used directly. This prevents subtle type issues downstream.

## Route Mount
All youtube-archive routes are mounted bare (no extra `/api` prefix) because the router is registered at `/api` already.
