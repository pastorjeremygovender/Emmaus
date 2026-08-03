/**
 * audio-transcription.ts — OpenAI Whisper transcription for uploaded sermon audio.
 *
 * Pipeline for large files (handles typical sermon recordings of 45–180+ min):
 *
 *   1. Download from object storage → emit "preparing"
 *   2. If file ≤ 24 MB → send to Whisper directly ("transcribing:1:1")
 *   3. If file > 24 MB → compress to 16 kHz mono 32 kbps MP3 ("compressing")
 *      A 90-min sermon at 128 kbps stereo (≈ 86 MB) → ~21 MB after compression.
 *   4. If compressed result ≤ 24 MB → single Whisper call ("transcribing:1:1")
 *   5. If compressed result still > 24 MB (> ~100 min) →
 *      chunk-and-stitch ("chunking:N", "transcribing:i:N", "combining")
 *   6. If compression itself fails → attempt direct chunking on the raw file
 *      (skips the "compressing" stage and goes straight to chunking)
 *
 * The manual-compression error path is gone. Every valid audio file is
 * processed automatically, regardless of original size.
 */

import { ObjectStorageService } from "./objectStorage.js";
import { logger } from "./logger.js";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, readdir, unlink, access, constants as fsConstants } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

const objectStorage = new ObjectStorageService();

// ─── Resolve ffmpeg binary path ───────────────────────────────────────────────
//
// ffmpeg-static is a production npm dependency that bundles a platform-specific
// static ffmpeg binary and downloads it during `pnpm install` via its postinstall
// script. This is the only approach that works reliably in both the Replit dev
// workspace AND production deployments (which have a restricted PATH with no
// Nix store entries visible to /bin/sh).
//
// Resolution order:
//   1. ffmpeg-static (primary — static binary shipped with the app)
//   2. PATH / Nix shell fallback (dev convenience — non-critical)
//   3. Bare "ffmpeg" — will fail with ENOENT if reached; that failure is caught
//      by the startup health check and the process endpoint guard.
//
// FFMPEG_BIN and FFMPEG_AVAILABLE are both exported so callers can gate on
// availability before attempting to spawn the binary.

const _require = createRequire(import.meta.url);

async function resolveFfmpegPath(): Promise<string> {
  // Step 1: ffmpeg-static — the only production-safe option.
  try {
    const staticPath: string | null = _require("ffmpeg-static");
    if (typeof staticPath === "string" && staticPath) {
      // Verify the binary actually exists and is executable before trusting it.
      await access(staticPath, fsConstants.X_OK);
      return staticPath;
    }
  } catch { /* binary missing or not executable — fall through */ }

  // Step 2: Shell PATH fallback (works in the Replit dev workspace where the
  // interactive shell exposes the Nix runtime PATH to /bin/sh).
  try {
    const { execSync } = await import("node:child_process");
    const p = execSync("which ffmpeg", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (p) return p;
  } catch { /* PATH lookup failed — fall through */ }

  // Bare fallback — produces a clear ENOENT on spawn. The startup health check
  // and the process-endpoint guard both detect this and surface a user-visible
  // error instead of silently starting a job that will fail.
  return "ffmpeg";
}

// Resolve at module load time (top-level await in ESM).
export const FFMPEG_BIN: string       = await resolveFfmpegPath();
export const FFMPEG_AVAILABLE: boolean = FFMPEG_BIN !== "ffmpeg";

// ─── Stage-progress callback ──────────────────────────────────────────────────

/**
 * Called at each pipeline transition with a processingStage string.
 * The route handler persists it to the DB so the polling client sees live progress.
 *
 * Stage values emitted:
 *   "preparing"          — downloading from object storage
 *   "compressing"        — ffmpeg compress running
 *   "chunking:N"         — splitting into N segments (N = estimated count or "?")
 *   "transcribing:i:N"   — sending chunk i of N to Whisper (or "transcribing:1:1" for single call)
 *   "combining"          — joining chunk transcripts
 */
export type ProgressCallback = (stage: string) => Promise<void> | void;

// ─── Constants ────────────────────────────────────────────────────────────────

const WHISPER_MAX_BYTES = 24 * 1024 * 1024; // 24 MB — Whisper hard limit is 25 MB
const COMPRESS_BITRATE  = "32k";             // 32 kbps mono — clear speech, small file
const CHUNK_SECONDS     = 900;               // 15-minute segments

// ─── Supported MIME types ─────────────────────────────────────────────────────

const AUDIO_CONTENT_TYPES: Record<string, string> = {
  ".mp3":  "audio/mpeg",
  ".m4a":  "audio/mp4",
  ".wav":  "audio/wav",
  ".mp4":  "video/mp4",
  ".mpeg": "audio/mpeg",
  ".webm": "audio/webm",
  ".ogg":  "audio/ogg",
};

function guessContentType(filename: string, fallback: string): string {
  const ext = filename.match(/\.[^.]+$/)?.[0]?.toLowerCase() ?? "";
  return AUDIO_CONTENT_TYPES[ext] ?? fallback;
}

// ─── Stage 1: ffmpeg compression ──────────────────────────────────────────────

/**
 * Compresses audio to 16 kHz mono 32 kbps MP3.
 * Temp files are always cleaned up regardless of success or failure.
 */
async function compressWithFfmpeg(
  inputBuffer: ArrayBuffer,
  inputExt: string,
): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const id         = randomUUID();
  const inputPath  = join(tmpdir(), `${id}-in${inputExt}`);
  const outputPath = join(tmpdir(), `${id}-out.mp3`);

  await writeFile(inputPath, Buffer.from(inputBuffer));

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_BIN, [
        "-i", inputPath,
        "-ar", "16000",
        "-ac", "1",
        "-b:a", COMPRESS_BITRATE,
        "-y",
        outputPath,
      ], { stdio: "pipe" });

      let stderr = "";
      proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
      proc.on("close", code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg compress exited ${code}. stderr: ${stderr.slice(-400)}`));
      });
      proc.on("error", reject);
    });

    const compressed = await readFile(outputPath);
    return { buffer: compressed.buffer as ArrayBuffer, filename: `${id}.mp3` };
  } finally {
    unlink(inputPath).catch(() => {});
    unlink(outputPath).catch(() => {});
  }
}

// ─── Stage 2: ffmpeg segmentation + multi-call Whisper ───────────────────────

/**
 * Splits audio into CHUNK_SECONDS-long segments, transcribes each with Whisper,
 * then joins the results.
 *
 * Always re-encodes segments to 32 kbps mono MP3 so it works universally —
 * whether input is an already-compressed MP3 or the raw original (M4A, WAV, etc.).
 *
 * Each 15-minute chunk at 32 kbps is ~3.6 MB — well within Whisper's limit.
 * Even at 128 kbps stereo, a 15-min chunk from the original is only ~14 MB.
 */
async function transcribeInChunks(
  audioBuffer: ArrayBuffer,
  apiKey: string,
  audioPath: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  const id           = randomUUID();
  const inputPath    = join(tmpdir(), `${id}-src`);
  const chunkPattern = join(tmpdir(), `${id}-chunk-%03d.mp3`);
  const chunkPrefix  = `${id}-chunk-`;

  await writeFile(inputPath, Buffer.from(audioBuffer));

  try {
    // ── Estimate total chunks for labelling ─────────────────────────────────
    let estimatedChunks: number | "?" = "?";
    try {
      const durationRaw = execSync(
        `"${FFMPEG_BIN}" -i "${inputPath}" 2>&1 | grep -oP 'Duration: \\K[0-9:]+'`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      ).trim();
      const [hh = "0", mm = "0", ss = "0"] = durationRaw.split(":");
      const totalSec = (+hh) * 3600 + (+mm) * 60 + parseFloat(ss);
      if (totalSec > 0) estimatedChunks = Math.max(1, Math.ceil(totalSec / CHUNK_SECONDS));
    } catch { /* duration probe failed — keep "?" */ }

    await onProgress?.(`chunking:${estimatedChunks}`);

    // ── Split into fixed-length segments ────────────────────────────────────
    // Re-encode to 32 kbps mono MP3 so output is universally Whisper-compatible.
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_BIN, [
        "-i", inputPath,
        "-f", "segment",
        "-segment_time", String(CHUNK_SECONDS),
        "-ar", "16000",
        "-ac", "1",
        "-b:a", COMPRESS_BITRATE,
        "-y",
        chunkPattern,
      ], { stdio: "pipe" });

      let stderr = "";
      proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
      proc.on("close", code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg segment exited ${code}. stderr: ${stderr.slice(-300)}`));
      });
      proc.on("error", reject);
    });

    // ── Discover chunk files ─────────────────────────────────────────────────
    const allTmpFiles = await readdir(tmpdir());
    const chunkFiles  = allTmpFiles
      .filter(f => f.startsWith(chunkPrefix) && f.endsWith(".mp3"))
      .sort();
    const totalChunks = chunkFiles.length;

    logger.info(
      { audioPath, chunks: totalChunks, chunkSec: CHUNK_SECONDS },
      "audio-transcription: transcribing in chunks",
    );

    // ── Transcribe each chunk sequentially ──────────────────────────────────
    const parts: string[] = [];
    for (let i = 0; i < totalChunks; i++) {
      await onProgress?.(`transcribing:${i + 1}:${totalChunks}`);

      const chunkPath = join(tmpdir(), chunkFiles[i]);
      try {
        const chunkBuf  = await readFile(chunkPath);
        const chunkBlob = new Blob([chunkBuf], { type: "audio/mpeg" });
        const chunkFile = new File([chunkBlob], chunkFiles[i], { type: "audio/mpeg" });

        const formData = new FormData();
        formData.append("file",            chunkFile);
        formData.append("model",           "whisper-1");
        formData.append("response_format", "text");

        logger.info(
          { audioPath, chunk: i + 1, total: totalChunks },
          "audio-transcription: sending chunk to Whisper",
        );

        const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method:  "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body:    formData,
        });

        if (!resp.ok) {
          const errBody = await resp.text().catch(() => "");
          throw new Error(
            `Whisper chunk ${i + 1}/${totalChunks} failed (HTTP ${resp.status}): ${errBody.slice(0, 200)}`,
          );
        }

        parts.push(await resp.text());
        logger.info(
          { audioPath, chunk: i + 1, total: totalChunks },
          "audio-transcription: chunk complete",
        );
      } finally {
        unlink(chunkPath).catch(() => {});
      }
    }

    await onProgress?.("combining");
    return parts.join(" ");
  } finally {
    unlink(inputPath).catch(() => {});
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Transcribes the audio at `audioPath` (an object-storage path) using Whisper-1.
 *
 * `onProgress` is called with a processingStage string at each pipeline
 * transition so the caller can persist it to the DB for the polling client.
 */
export async function transcribeAudio(
  audioPath: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set — transcription unavailable");

  // ── 1. Download from object storage ──────────────────────────────────────
  await onProgress?.("preparing");
  logger.info({ audioPath }, "audio-transcription: downloading audio from object storage");

  let file: Awaited<ReturnType<typeof objectStorage.getObjectEntityFile>>;
  try {
    file = await objectStorage.getObjectEntityFile(audioPath);
  } catch {
    throw new Error(`Audio file not found in object storage: ${audioPath}`);
  }

  const downloadResp = await objectStorage.downloadObject(file);
  if (!downloadResp.ok) {
    throw new Error(`Failed to download audio: HTTP ${downloadResp.status}`);
  }

  const arrayBuffer   = await downloadResp.arrayBuffer();
  const rawBytes      = arrayBuffer.byteLength;

  // ── 2. Derive filename + content type ────────────────────────────────────
  const rawName       = audioPath.split("/").pop() ?? "audio";
  const fallbackCt    = downloadResp.headers.get("content-type") ?? "audio/mpeg";
  const contentType   = guessContentType(rawName, fallbackCt);
  const ext           = Object.entries(AUDIO_CONTENT_TYPES)
                          .find(([, v]) => v === contentType)?.[0] ?? ".mp3";
  let sendBuffer      = arrayBuffer;
  let filename        = rawName.includes(".") ? rawName : `${rawName}${ext}`;
  let sendContentType = contentType;

  // ── 3. Compress if file exceeds Whisper's limit ───────────────────────────
  if (rawBytes > WHISPER_MAX_BYTES) {
    logger.info(
      { audioPath, bytes: rawBytes, limitMB: "24" },
      "audio-transcription: file exceeds Whisper limit — compressing with ffmpeg",
    );
    await onProgress?.("compressing");

    try {
      const { buffer: compressed, filename: cName } = await compressWithFfmpeg(arrayBuffer, ext);
      const compressedBytes = compressed.byteLength;

      logger.info(
        {
          audioPath,
          originalMB:   (rawBytes       / 1024 / 1024).toFixed(1),
          compressedMB: (compressedBytes / 1024 / 1024).toFixed(1),
          ratio:        (compressedBytes / rawBytes).toFixed(2),
        },
        "audio-transcription: ffmpeg compression complete",
      );

      // ── 4. Still > 24 MB after compression → chunk-and-stitch ────────────
      if (compressedBytes > WHISPER_MAX_BYTES) {
        logger.info(
          { audioPath, compressedMB: (compressedBytes / 1024 / 1024).toFixed(1) },
          "audio-transcription: compressed file still exceeds limit — chunking",
        );
        return await transcribeInChunks(compressed, apiKey, audioPath, onProgress);
      }

      sendBuffer      = compressed;
      filename        = cName;
      sendContentType = "audio/mpeg";

    } catch (compressErr) {
      // Compression failed (e.g. ffmpeg ENOENT, corrupt file, unsupported codec).
      // Spec: do NOT ask the admin to compress manually.
      // Attempt direct chunking on the original raw audio instead.
      logger.error(
        { err: compressErr, audioPath },
        "audio-transcription: ffmpeg compression failed — attempting direct chunking on source",
      );
      return await transcribeInChunks(arrayBuffer, apiKey, audioPath, onProgress);
    }
  }

  // ── 5. Single-call Whisper transcription ─────────────────────────────────
  await onProgress?.("transcribing:1:1");
  logger.info(
    { audioPath, bytes: sendBuffer.byteLength, contentType: sendContentType, filename },
    "audio-transcription: sending to Whisper",
  );

  const blob      = new Blob([sendBuffer], { type: sendContentType });
  const audioFile = new File([blob], filename, { type: sendContentType });

  const formData = new FormData();
  formData.append("file",            audioFile);
  formData.append("model",           "whisper-1");
  formData.append("response_format", "text");

  const whisperResp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method:  "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body:    formData,
  });

  if (!whisperResp.ok) {
    const errBody = await whisperResp.text().catch(() => "");
    logger.error(
      { status: whisperResp.status, body: errBody },
      "audio-transcription: Whisper API error",
    );
    throw new Error(`Whisper API returned ${whisperResp.status}: ${errBody.slice(0, 200)}`);
  }

  const transcript = await whisperResp.text();
  logger.info({ audioPath, chars: transcript.length }, "audio-transcription: transcription complete");
  return transcript;
}
