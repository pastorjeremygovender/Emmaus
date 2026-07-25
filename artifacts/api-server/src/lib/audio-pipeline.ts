/**
 * Audio Pipeline
 *
 * Downloads the audio track from a YouTube video and trims it to start at
 * the sermon start point (removing worship / announcements from the audio file).
 *
 * Stack:
 *   @distube/ytdl-core — stream the audio from YouTube (no API key needed for
 *                         public videos; works with a cookie jar for private ones)
 *   fluent-ffmpeg       — trim the stream and encode as 64kbps MP3
 *   local FS            — store under data/audio/<videoId>.mp3
 *
 * The generated file is served at GET /api/youtube-archive/audio/:videoId
 * by the youtube-archive router. This avoids the complex object-storage
 * setup for the current scale.
 */

import ytdl from "@distube/ytdl-core";
import ffmpeg from "fluent-ffmpeg";
import { mkdir, stat, unlink } from "node:fs/promises";
import { createWriteStream, existsSync } from "node:fs";
import { join } from "node:path";
import { logger } from "./logger.js";

// ─── Storage directory ────────────────────────────────────────────────────────

const AUDIO_DIR = join(process.cwd(), "data", "audio");

async function ensureAudioDir(): Promise<void> {
  if (!existsSync(AUDIO_DIR)) {
    await mkdir(AUDIO_DIR, { recursive: true });
  }
}

export function getAudioFilePath(videoId: string): string {
  return join(AUDIO_DIR, `${videoId}.mp3`);
}

export function getAudioFileUrl(videoId: string): string {
  return `/api/youtube-archive/audio/${videoId}`;
}

// ─── Audio generation ─────────────────────────────────────────────────────────

export interface AudioGenerateOptions {
  videoId: string;              // internal DB id (used for filename)
  youtubeVideoId: string;       // YouTube video id (e.g. "dQw4w9WgXcQ")
  youtubeUrl: string;           // full watch URL
  sermonStartSeconds: number;   // where to trim from
  /** When true, delete any existing MP3 and re-download/re-trim. Use when sermon start timing changed. */
  force?: boolean;
  onProgress?: (percent: number) => void;
}

export interface AudioGenerateResult {
  filePath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  format: "mp3";
}

/**
 * Download and trim sermon audio.
 *
 * Idempotent by default — if the file already exists and is non-empty, returns
 * immediately without re-downloading. Pass `force: true` to delete the existing
 * file and rebuild (required after sermon-start timing changes).
 *
 * @throws on download or encoding error; caller should update audioProcessingStatus to 'failed'.
 */
export async function generateSermonAudio(
  options: AudioGenerateOptions,
): Promise<AudioGenerateResult> {
  await ensureAudioDir();
  const outputPath = getAudioFilePath(options.videoId);

  if (existsSync(outputPath)) {
    if (options.force) {
      // Forced rebuild — delete the existing file so we re-download and re-trim
      await unlink(outputPath).catch(() => undefined);
      logger.info({ videoId: options.videoId, sermonStartSeconds: options.sermonStartSeconds },
        "Force-rebuilding sermon audio (timing may have changed)");
    } else {
      const existing = await stat(outputPath);
      if (existing.size > 0) {
        const durationSeconds = await getFileDuration(outputPath);
        logger.info({ videoId: options.videoId }, "Audio file already exists — skipping download");
        return {
          filePath: outputPath,
          fileSizeBytes: existing.size,
          durationSeconds,
          format: "mp3",
        };
      }
      // File exists but is empty — delete and re-download
      await unlink(outputPath).catch(() => undefined);
    }
  }

  const tmpPath = `${outputPath}.tmp.${Date.now()}`;

  try {
    logger.info(
      { videoId: options.videoId, youtubeVideoId: options.youtubeVideoId, sermonStartSeconds: options.sermonStartSeconds },
      "Starting sermon audio download and trim"
    );

    await downloadAndTrimAudio({
      youtubeUrl: options.youtubeUrl,
      sermonStartSeconds: options.sermonStartSeconds,
      outputPath: tmpPath,
      onProgress: options.onProgress,
    });

    // Rename tmp → final (atomic on POSIX)
    const { rename } = await import("node:fs/promises");
    await rename(tmpPath, outputPath);

    const info = await stat(outputPath);
    const durationSeconds = await getFileDuration(outputPath);

    logger.info(
      { videoId: options.videoId, fileSizeBytes: info.size, durationSeconds },
      "Sermon audio generation complete"
    );

    return {
      filePath: outputPath,
      fileSizeBytes: info.size,
      durationSeconds,
      format: "mp3",
    };
  } catch (err) {
    // Clean up partial file
    await unlink(tmpPath).catch(() => undefined);
    throw err;
  }
}

// ─── Download + transcode ──────────────────────────────────────────────────────

interface DownloadOptions {
  youtubeUrl: string;
  sermonStartSeconds: number;
  outputPath: string;
  onProgress?: (percent: number) => void;
}

function downloadAndTrimAudio(opts: DownloadOptions): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let audioStream: ReturnType<typeof ytdl> | null = null;

    try {
      // Request audio-only stream — ytdl picks the best audio quality
      audioStream = ytdl(opts.youtubeUrl, {
        filter: "audioonly",
        quality: "highestaudio",
        requestOptions: {
          headers: {
            // Treat requests as a Chrome browser to avoid bot detection
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        },
      });
    } catch (err) {
      reject(new Error(`Failed to create audio stream: ${String(err)}`));
      return;
    }

    const ff = ffmpeg(audioStream)
      // Trim from sermon start
      .setStartTime(Math.max(0, opts.sermonStartSeconds))
      // Audio encoding: 64kbps MP3 is CD-quality-adjacent for speech
      .audioBitrate(64)
      .audioChannels(2)
      .audioFrequency(44100)
      .toFormat("mp3")
      .output(opts.outputPath);

    if (opts.onProgress) {
      ff.on("progress", (progress) => {
        if (progress.percent !== undefined) {
          opts.onProgress!(Math.round(progress.percent));
        }
      });
    }

    ff.on("end", () => resolve());
    ff.on("error", (err) => {
      reject(new Error(`ffmpeg encoding failed: ${err.message}`));
    });

    // If the audio stream emits an error before ffmpeg processes it
    audioStream?.on("error", (err: Error) => {
      ff.kill("SIGTERM");
      reject(new Error(`Audio stream error: ${err.message}`));
    });

    ff.run();
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Get the duration of an MP3 file using ffprobe (bundled with ffmpeg).
 * Returns 0 if duration cannot be determined.
 */
function getFileDuration(filePath: string): Promise<number> {
  return new Promise<number>((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err || !metadata?.format?.duration) {
        resolve(0);
      } else {
        resolve(Math.round(metadata.format.duration));
      }
    });
  });
}

/**
 * Check whether a ytdl-compatible URL is downloadable (quick probe).
 * Returns null on success, or an error message string.
 */
export async function checkAudioAvailable(youtubeUrl: string): Promise<string | null> {
  try {
    await ytdl.getInfo(youtubeUrl);
    return null;
  } catch (err) {
    return String(err);
  }
}

export { AUDIO_DIR };
