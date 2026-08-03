---
name: ffmpeg production path — use ffmpeg-static
description: Production deployments have a restricted PATH with no Nix store. The only reliable fix is ffmpeg-static as a production npm dep. Records the full setup required.
---

## Rule
Use `ffmpeg-static` as a **production npm dependency** in `artifacts/api-server`. It ships a static Linux x64 binary via its postinstall download script. `resolveFfmpegPath()` in `audio-transcription.ts` loads it via `createRequire` as its primary source.

**Why:** The Replit production deployment container's `/bin/sh` has a restricted PATH with no Nix store entries. `which ffmpeg` exits code 1. The Nix glob fallback (`ls /nix/store/*-replit-runtime-path*/bin/ffmpeg`) also fails — the Nix store is not present in the deployment container. The only approach that works in both dev and production is bundling the binary with the app via `ffmpeg-static`.

**How to apply:**
1. `ffmpeg-static` must be in `dependencies` (not `devDependencies`) in `artifacts/api-server/package.json`
2. `ffmpeg-static` must be in `onlyBuiltDependencies` in `pnpm-workspace.yaml` — without this, pnpm blocks its postinstall download script and the binary is never downloaded
3. `ffmpeg-static` must be in the `external` list in `build.mjs` — so esbuild doesn't bundle the import and it resolves at runtime from `node_modules`
4. `resolveFfmpegPath()` uses `createRequire(import.meta.url)('ffmpeg-static')` to get the absolute path synchronously
5. `FFMPEG_BIN` and `FFMPEG_AVAILABLE` are both exported from `audio-transcription.ts`
6. `audio-pipeline.ts` calls `ffmpeg.setFfmpegPath(FFMPEG_BIN)` so fluent-ffmpeg also finds the binary
7. The `/admin/:id/process` route checks `FFMPEG_AVAILABLE` and returns 503 if false, preventing misleading "processing…" states

## Confirmed static binary details
- Package: `ffmpeg-static@5.3.0`
- Version delivered: `ffmpeg version 7.0.2-static https://johnvansickle.com/ffmpeg/`
- Dev path: `.../node_modules/.pnpm/ffmpeg-static@5.3.0/.../ffmpeg-static/ffmpeg`

## Startup health check log (success)
```
Startup: ffmpeg available
    bin: ".../ffmpeg-static/ffmpeg"
    version: "ffmpeg version 7.0.2-static..."
```

## Symptom of old/broken state
`spawn ffmpeg ENOENT` + `"path":"ffmpeg"` in production logs  
`Startup migration: ffmpeg NOT available` + `Command failed: which ffmpeg`
