---
name: ffmpeg production PATH fix
description: In Replit production deployments, `which ffmpeg` fails because /bin/sh has a restricted PATH that excludes Nix store directories. The fix is a two-step resolution in resolveFfmpegPath().
---

## Rule
`resolveFfmpegPath()` in `audio-transcription.ts` must try two strategies before falling back to the bare `"ffmpeg"` name:

1. `which ffmpeg` via execSync — works in the dev workspace (interactive shell has full Nix PATH)
2. `ls /nix/store/*-replit-runtime-path*/bin/ffmpeg 2>/dev/null | head -1` — works in production deployments where /bin/sh has a restricted PATH

**Why:** The Replit production deployment container runs Node.js with a shell that does NOT have the Nix runtime in its PATH. The ffmpeg binary is present at `/nix/store/<hash>-replit-runtime-path/bin/ffmpeg` but `which ffmpeg` exits with code 1. The glob expansion `ls /nix/store/*-replit-runtime-path*/bin/ffmpeg` resolves it instantly without a slow `find` traversal.

**How to apply:** Any code that spawns ffmpeg must use `FFMPEG_BIN` (resolved at module load via `resolveFfmpegPath()`). Never hardcode `"ffmpeg"` as the command. Never use `find /nix/store -name ffmpeg` (too slow — Nix store has thousands of packages).

## Symptom
Production log: `"spawn ffmpeg ENOENT"` + `"path":"ffmpeg"` (bare name in spawnargs)
Production startup log: `"Startup migration: ffmpeg NOT available"` with `"Command failed: which ffmpeg"`
Dev startup log (correct): `"Startup migration: ffmpeg available"` with full absolute path

## Confirmed working path (may change with Nix package updates)
`/nix/store/jj9hkc8i90yb3dpcyyqlncijyj71w9id-replit-runtime-path/bin/ffmpeg`
