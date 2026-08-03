/**
 * audio-transcription.ts — OpenAI Whisper transcription for uploaded sermon audio.
 *
 * Pipeline for large files (handles typical sermon recordings of 45–180+ min):
 *
 *   1. Download from object storage.
 *   2. If file > 24 MB → compress to 16 kHz mono 32 kbps MP3 with ffmpeg.
 *      A 90-min sermon at 128 kbps stereo (≈ 86 MB) → ~21 MB after compression.
 *   3. If compressed result is STILL > 24 MB (very long recordings, > ~100 min) →
 *      segment into 15-minute chunks, transcribe each chunk with Whisper, and
 *      concatenate the results.
 *
 * The hard size-reject is gone. Every file that ffmpeg can decode will be
 * transcribed, regardless of original size.
 */

import { ObjectStorageService } from "./objectStorage.js";
import { logger } from "./logger.js";
import { spawn, execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, readdir, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const objectStorage = new ObjectStorageService();

// ─── Resolve ffmpeg binary path ───────────────────────────────────────────────
//
// Node.js spawn() uses a restricted PATH that may not include Nix store paths
// present in the interactive shell. Running `which ffmpeg` via execSync uses
// /bin/sh, which inherits the full shell PATH and correctly resolves the
// Nix-managed binary. The result is cached at module load time so subsequent
// calls pay no overhead.
//
// Fallback: if which fails, return the bare name "ffmpeg" so that spawn
// produces a clear ENOENT rather than a misleading error.

function resolveFfmpegPath(): string {
  try {
    const resolved = execSync("which ffmpeg", {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (resolved) return resolved;
  } catch { /* not in PATH — fall through */ }
  return "ffmpeg";
}

const FFMPEG_BIN = resolveFfmpegPath();

// Whisper's hard upload limit is 25 MB. We target 24 MB to leave headroom.
const WHISPER_MAX_BYTES = 24 * 1024 * 1024; // 24 MB
const COMPRESS_BITRATE  = "32k";             // 32 kbps mono — clear speech, small file
const CHUNK_SECONDS     = 900;               // 15-minute segments for chunked transcription

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
 * Compresses audio to 16 kHz mono 32 kbps MP3 using ffmpeg.
 *
 * A typical 90-minute sermon at 128 kbps stereo (≈ 86 MB) comes out at
 * ~21 MB — well under Whisper's 25 MB limit.
 *
 * Temp files are cleaned up regardless of success or failure.
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
        "-ar", "16000",        // 16 kHz sample rate
        "-ac", "1",            // mono
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
    // readFile returns a Buffer whose byteOffset is always 0 and whose
    // .buffer property is the full, correctly-sized ArrayBuffer.
    return { buffer: compressed.buffer as ArrayBuffer, filename: `${id}.mp3` };
  } finally {
    unlink(inputPath).catch(() => {});
    unlink(outputPath).catch(() => {});
  }
}

// ─── Stage 2: ffmpeg segmentation + multi-call Whisper ───────────────────────

/**
 * Splits an already-compressed audio buffer into CHUNK_SECONDS-long segments
 * and transcribes each one with Whisper, then joins the results.
 *
 * Used when compression alone is not enough (very long recordings that are
 * still > 24 MB at 32 kbps, i.e. > ~100 minutes of audio).
 *
 * Each 15-minute chunk at 32 kbps is ~3.6 MB — well within Whisper's limit.
 */
async function transcribeInChunks(
  audioBuffer: ArrayBuffer,
  apiKey: string,
  audioPath: string,
): Promise<string> {
  const id           = randomUUID();
  const inputPath    = join(tmpdir(), `${id}-chunked-src.mp3`);
  const chunkPattern = join(tmpdir(), `${id}-chunk-%03d.mp3`);
  const chunkPrefix  = `${id}-chunk-`;

  await writeFile(inputPath, Buffer.from(audioBuffer));

  try {
    // Split into fixed-length segments (stream copy — no re-encode needed,
    // file is already 32 kbps MP3 from the compression step above)
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(FFMPEG_BIN, [
        "-i", inputPath,
        "-f", "segment",
        "-segment_time", String(CHUNK_SECONDS),
        "-c",  "copy",
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

    // Discover generated chunk files
    const allTmpFiles  = await readdir(tmpdir());
    const chunkFiles   = allTmpFiles
      .filter(f => f.startsWith(chunkPrefix) && f.endsWith(".mp3"))
      .sort(); // sort ensures chronological order (chunk-000, chunk-001, …)

    logger.info(
      { audioPath, chunks: chunkFiles.length, chunkSec: CHUNK_SECONDS },
      "audio-transcription: transcribing in chunks",
    );

    // Transcribe each chunk sequentially (Whisper rate limit: 50 req/min on
    // most plans — sequential is safe and avoids burst issues)
    const parts: string[] = [];
    for (let i = 0; i < chunkFiles.length; i++) {
      const chunkPath = join(tmpdir(), chunkFiles[i]);
      try {
        const chunkBuf  = await readFile(chunkPath);
        const chunkBlob = new Blob([chunkBuf], { type: "audio/mpeg" });
        const chunkFile = new File([chunkBlob], chunkFiles[i], { type: "audio/mpeg" });

        const formData = new FormData();
        formData.append("file",            chunkFile);
        formData.append("model",           "whisper-1");
        formData.append("response_format", "text");

        logger.info({ audioPath, chunk: i + 1, total: chunkFiles.length }, "audio-transcription: sending chunk to Whisper");

        const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method:  "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body:    formData,
        });

        if (!resp.ok) {
          const errBody = await resp.text().catch(() => "");
          throw new Error(
            `Whisper chunk ${i + 1}/${chunkFiles.length} failed (HTTP ${resp.status}): ${errBody.slice(0, 200)}`,
          );
        }

        parts.push(await resp.text());
        logger.info({ audioPath, chunk: i + 1, total: chunkFiles.length }, "audio-transcription: chunk complete");
      } finally {
        // Clean up chunk file as soon as it's been transcribed
        unlink(chunkPath).catch(() => {});
      }
    }

    return parts.join(" ");
  } finally {
    unlink(inputPath).catch(() => {});
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Transcribes the audio at `audioPath` (an object-storage path like
 * `/objects/uploads/<uuid>`) using OpenAI Whisper-1.
 *
 * Preprocessing pipeline (runs automatically, no admin action required):
 *
 *   • Files ≤ 24 MB: sent to Whisper directly.
 *   • Files 24 MB – ~100 min compressed: compressed to 32 kbps mono MP3,
 *     then sent to Whisper as a single call.
 *   • Files that are still > 24 MB after compression (very long recordings):
 *     segmented into 15-minute chunks, each chunk transcribed separately,
 *     results concatenated.
 *
 * Returns the full transcript as plain text.
 */
export async function transcribeAudio(audioPath: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set — transcription unavailable");

  logger.info({ audioPath }, "audio-transcription: downloading audio from object storage");

  // ── 1. Download from object storage ──────────────────────────────────────
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

  let arrayBuffer    = await downloadResp.arrayBuffer();
  const rawBytes     = arrayBuffer.byteLength;

  // ── 2. Derive filename + content type ────────────────────────────────────
  const rawName       = audioPath.split("/").pop() ?? "audio";
  const fallbackCt    = downloadResp.headers.get("content-type") ?? "audio/mpeg";
  const contentType   = guessContentType(rawName, fallbackCt);
  const ext           = Object.entries(AUDIO_CONTENT_TYPES)
                          .find(([, v]) => v === contentType)?.[0] ?? ".mp3";
  let filename        = rawName.includes(".") ? rawName : `${rawName}${ext}`;
  let sendContentType = contentType;

  // ── 3. Compress if file exceeds Whisper's limit ───────────────────────────
  if (rawBytes > WHISPER_MAX_BYTES) {
    logger.info(
      { audioPath, rawMB: (rawBytes / 1024 / 1024).toFixed(1) },
      "audio-transcription: file exceeds 24 MB — compressing with ffmpeg",
    );

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

      arrayBuffer     = compressed;
      filename        = cName;
      sendContentType = "audio/mpeg";

      // ── 4. If still > 24 MB after compression → chunk-and-stitch ──────────
      if (compressedBytes > WHISPER_MAX_BYTES) {
        logger.info(
          { audioPath, compressedMB: (compressedBytes / 1024 / 1024).toFixed(1) },
          "audio-transcription: compressed file still exceeds limit — using chunked transcription",
        );
        return transcribeInChunks(arrayBuffer, apiKey, audioPath);
      }
    } catch (compressErr) {
      logger.error({ err: compressErr, audioPath }, "audio-transcription: ffmpeg compression failed");
      throw new Error(
        `Sermon audio is ${(rawBytes / 1024 / 1024).toFixed(1)} MB and automatic compression failed. ` +
        `Check that ffmpeg is available and the audio file is not corrupted.`,
      );
    }
  }

  // ── 5. Single-call Whisper transcription ─────────────────────────────────
  logger.info(
    { audioPath, bytes: arrayBuffer.byteLength, contentType: sendContentType, filename },
    "audio-transcription: sending to Whisper",
  );

  const blob      = new Blob([arrayBuffer], { type: sendContentType });
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

  logger.info(
    { audioPath, chars: transcript.length },
    "audio-transcription: transcription complete",
  );

  return transcript;
}
