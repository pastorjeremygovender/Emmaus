/**
 * audio-transcription.ts — OpenAI Whisper transcription for uploaded sermon audio.
 *
 * Downloads the audio file from object storage, sends it to Whisper-1, and
 * returns the full transcript as plain text.
 *
 * Large files (> 24 MB) are automatically compressed to 16 kHz mono 32 kbps MP3
 * via ffmpeg before being sent to Whisper. This handles typical sermon recordings
 * (60–90 minutes, 50–80 MB) without any manual preparation by the admin.
 */

import { ObjectStorageService } from "./objectStorage.js";
import { logger } from "./logger.js";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeFile, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";

const objectStorage = new ObjectStorageService();

// Whisper's hard upload limit is 25 MB. We compress anything above 24 MB to
// leave a comfortable margin after ffmpeg's output size may vary slightly.
const WHISPER_MAX_BYTES  = 24 * 1024 * 1024;
const COMPRESS_BITRATE   = "32k";  // 32 kbps mono — clear speech, small file

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

// ─── ffmpeg compression ───────────────────────────────────────────────────────

/**
 * Compresses audio to 16 kHz mono 32 kbps MP3 using ffmpeg so it fits within
 * Whisper's 25 MB input limit. Typical sermon (60–90 min at 128 kbps stereo)
 * goes from 50–80 MB down to ~8–14 MB. Temp files live in the OS temp dir and
 * are cleaned up after the operation regardless of success or failure.
 */
async function compressWithFfmpeg(
  inputBuffer: ArrayBuffer,
  inputExt: string
): Promise<{ buffer: ArrayBuffer; filename: string }> {
  const id         = randomUUID();
  const inputPath  = join(tmpdir(), `${id}-sermon-in${inputExt}`);
  const outputPath = join(tmpdir(), `${id}-sermon-out.mp3`);

  await writeFile(inputPath, Buffer.from(inputBuffer));

  try {
    await new Promise<void>((resolve, reject) => {
      const proc = spawn("ffmpeg", [
        "-i", inputPath,
        "-ar", "16000",        // 16 kHz sample rate (Whisper works well at this)
        "-ac", "1",            // mono channel
        "-b:a", COMPRESS_BITRATE,
        "-y",                  // overwrite output without prompting
        outputPath,
      ], { stdio: "pipe" });

      let stderr = "";
      proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

      proc.on("close", code => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited ${code}. stderr: ${stderr.slice(-400)}`));
      });
      proc.on("error", reject);
    });

    const compressed = await readFile(outputPath);
    return { buffer: compressed.buffer as ArrayBuffer, filename: `${id}.mp3` };
  } finally {
    // Clean up temp files (fire-and-forget, non-fatal if they fail)
    unlink(inputPath).catch(() => {});
    unlink(outputPath).catch(() => {});
  }
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Transcribes the audio at `audioPath` (an object-storage path like
 * `/objects/uploads/<uuid>`) using OpenAI Whisper-1.
 *
 * Files larger than 24 MB are automatically compressed to 32 kbps mono MP3
 * via ffmpeg before being sent to Whisper. This handles typical sermon
 * recordings (60–90 minutes) without any manual preparation.
 *
 * Returns the raw transcript text (no timestamps).
 */
export async function transcribeAudio(audioPath: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set — transcription unavailable");

  logger.info({ audioPath }, "audio-transcription: downloading audio from object storage");

  // ── Download from object storage ─────────────────────────────────────────
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

  let arrayBuffer  = await downloadResp.arrayBuffer();
  const rawBytes   = arrayBuffer.byteLength;

  // ── Derive filename + content type ────────────────────────────────────────
  const rawName     = audioPath.split("/").pop() ?? "audio";
  const fallbackCt  = downloadResp.headers.get("content-type") ?? "audio/mpeg";
  const contentType = guessContentType(rawName, fallbackCt);
  const ext         = Object.entries(AUDIO_CONTENT_TYPES)
                        .find(([, v]) => v === contentType)?.[0] ?? ".mp3";
  let filename      = rawName.includes(".") ? rawName : `${rawName}${ext}`;
  let sendContentType = contentType;

  // ── Compress if > 24 MB ───────────────────────────────────────────────────
  if (rawBytes > WHISPER_MAX_BYTES) {
    logger.info(
      { audioPath, bytes: rawBytes, limitMB: (WHISPER_MAX_BYTES / 1024 / 1024).toFixed(0) },
      "audio-transcription: file exceeds Whisper limit — compressing with ffmpeg"
    );
    try {
      const { buffer: compressed, filename: cName } = await compressWithFfmpeg(arrayBuffer, ext);
      const compressedBytes = compressed.byteLength;
      logger.info(
        {
          originalMB:   (rawBytes / 1024 / 1024).toFixed(1),
          compressedMB: (compressedBytes / 1024 / 1024).toFixed(1),
          ratio:        (compressedBytes / rawBytes).toFixed(2),
        },
        "audio-transcription: ffmpeg compression complete"
      );
      arrayBuffer     = compressed;
      filename        = cName;
      sendContentType = "audio/mpeg";
    } catch (compressErr) {
      logger.error({ err: compressErr, audioPath }, "audio-transcription: ffmpeg compression failed");
      throw new Error(
        `Sermon audio is ${(rawBytes / 1024 / 1024).toFixed(1)} MB and automatic compression failed. ` +
        `Please compress it to under 25 MB and upload again.`
      );
    }
  }

  logger.info(
    { audioPath, bytes: arrayBuffer.byteLength, contentType: sendContentType, filename },
    "audio-transcription: sending to Whisper"
  );

  // ── Call OpenAI Whisper ───────────────────────────────────────────────────
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
      "audio-transcription: Whisper API error"
    );
    throw new Error(`Whisper API returned ${whisperResp.status}: ${errBody.slice(0, 200)}`);
  }

  const transcript = await whisperResp.text();

  logger.info(
    { audioPath, chars: transcript.length },
    "audio-transcription: transcription complete"
  );

  return transcript;
}
