/**
 * audio-transcription.ts — OpenAI Whisper transcription for uploaded sermon audio.
 *
 * Downloads the audio file from object storage, sends it to Whisper-1, and
 * returns the full transcript as plain text.
 *
 * Whisper limit: 25 MB. Files larger than that are rejected at the API layer.
 */

import { ObjectStorageService } from "./objectStorage.js";
import { logger } from "./logger.js";

const objectStorage = new ObjectStorageService();

const WHISPER_MAX_BYTES = 25 * 1024 * 1024; // 25 MB

// ─── Supported MIME types ────────────────────────────────────────────────────

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

// ─── Main export ─────────────────────────────────────────────────────────────

/**
 * Transcribes the audio at `audioPath` (an object-storage path like
 * `/objects/uploads/<uuid>`) using OpenAI Whisper-1.
 *
 * Returns the raw transcript text (no timestamps).
 */
export async function transcribeAudio(audioPath: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set — transcription unavailable");

  logger.info({ audioPath }, "audio-transcription: downloading audio from object storage");

  // ── Download from object storage ──────────────────────────────────────────
  let file: Awaited<ReturnType<typeof objectStorage.getObjectEntityFile>>;
  try {
    file = await objectStorage.getObjectEntityFile(audioPath);
  } catch (err) {
    throw new Error(`Audio file not found in object storage: ${audioPath}`);
  }

  const downloadResp = await objectStorage.downloadObject(file);
  if (!downloadResp.ok) {
    throw new Error(`Failed to download audio: HTTP ${downloadResp.status}`);
  }

  const arrayBuffer = await downloadResp.arrayBuffer();
  const bytes = arrayBuffer.byteLength;

  if (bytes > WHISPER_MAX_BYTES) {
    throw new Error(
      `Audio file is ${(bytes / 1024 / 1024).toFixed(1)} MB — Whisper limit is 25 MB. ` +
      `Please compress the file before uploading.`
    );
  }

  // ── Derive filename with correct extension ────────────────────────────────
  const rawName   = audioPath.split("/").pop() ?? "audio";
  const fallbackCt = downloadResp.headers.get("content-type") ?? "audio/mpeg";
  const contentType = guessContentType(rawName, fallbackCt);
  const ext       = Object.entries(AUDIO_CONTENT_TYPES).find(([, v]) => v === contentType)?.[0] ?? ".mp3";
  const filename  = rawName.includes(".") ? rawName : `${rawName}${ext}`;

  logger.info(
    { audioPath, bytes, contentType, filename },
    "audio-transcription: sending to Whisper"
  );

  // ── Call OpenAI Whisper ───────────────────────────────────────────────────
  const blob      = new Blob([arrayBuffer], { type: contentType });
  const audioFile = new File([blob], filename, { type: contentType });

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
