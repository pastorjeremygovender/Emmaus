/**
 * voice-service.ts — Emmaus Voice: speech-to-text and text-to-speech.
 *
 * Transcription: OpenAI Whisper-1 (same API key as Ask Emmaus).
 * TTS: OpenAI tts-1 model, streamed audio/mpeg.
 * Settings: persisted to the voice_settings DB table (single row, id=1).
 *           In-memory cache is warmed by initVoiceSettings() on boot.
 *           On restart, DB values are restored rather than reverting to defaults.
 *
 * Abstraction layer — callers never reference the provider directly.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";

// ─── Settings ─────────────────────────────────────────────────────────────────

export type VoiceId = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export interface VoiceSettings {
  enabled: boolean;
  voice: VoiceId;
  speed: number;   // 0.25 – 4.0
}

// In-memory cache — warmed from DB on boot via initVoiceSettings().
// Default is DISABLED so the server fails closed during the startup window
// (before initVoiceSettings runs) and on any DB failure.
// Once initVoiceSettings() succeeds, the persisted value takes effect.
let _settings: VoiceSettings = {
  enabled: false,
  voice: 'nova',
  speed: 1.0,
};

/**
 * Load persisted settings from the DB into the in-memory cache.
 * Called once during startup (after the voice_settings table migration runs).
 * Non-fatal: uses defaults if the row is missing or the query fails.
 */
export async function initVoiceSettings(): Promise<void> {
  try {
    const result = await pool.query<{ enabled: boolean; voice: string; speed: string }>(
      'SELECT enabled, voice, speed FROM voice_settings WHERE id = 1',
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      _settings = {
        enabled: row.enabled,
        voice: row.voice as VoiceId,
        speed: parseFloat(row.speed),
      };
      logger.info({ settings: _settings }, 'voice: settings loaded from DB');
    }
  } catch (err) {
    logger.warn({ err }, 'voice: failed to load settings from DB — using defaults');
  }
}

export function getVoiceSettings(): VoiceSettings {
  return { ..._settings };
}

/**
 * Update the in-memory cache AND write through to the DB.
 * DB write failure is non-fatal (in-memory change is still applied),
 * but is logged as a warning.
 */
export async function updateVoiceSettings(
  partial: Partial<VoiceSettings>,
): Promise<VoiceSettings> {
  if (partial.voice && !['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'].includes(partial.voice)) {
    throw new Error(`Invalid voice: ${partial.voice}`);
  }
  if (partial.speed !== undefined && (partial.speed < 0.25 || partial.speed > 4.0)) {
    throw new Error(`Speed out of range: ${partial.speed} (must be 0.25–4.0)`);
  }

  const updated = { ..._settings, ...partial };

  // Persist to DB first — if this fails the in-memory state is NOT updated,
  // so the route gets an error and the admin knows the change wasn't saved.
  // A restart will also restore the last successfully-persisted values.
  await pool.query(
    'UPDATE voice_settings SET enabled=$1, voice=$2, speed=$3 WHERE id=1',
    [updated.enabled, updated.voice, updated.speed],
  );

  // Only update in-memory after the DB write succeeds
  _settings = updated;
  logger.info({ settings: _settings }, 'voice: settings updated');
  return { ..._settings };
}

// ─── Speech-to-text ───────────────────────────────────────────────────────────

/**
 * Transcribe base64-encoded audio using OpenAI Whisper-1.
 * The client sends raw audio as base64 to avoid multipart/form-data complexity.
 */
export async function transcribeAudioBase64(
  base64Audio: string,
  mimeType: string,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured — transcription unavailable');

  const buffer = Buffer.from(base64Audio, 'base64');

  // Derive a sensible filename extension from the MIME type
  const ext =
    mimeType.includes('webm') ? 'webm' :
    mimeType.includes('mp4')  ? 'mp4'  :
    mimeType.includes('ogg')  ? 'ogg'  :
    mimeType.includes('wav')  ? 'wav'  :
    mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' :
    'webm';

  const blob = new Blob([buffer], { type: mimeType });
  const file = new File([blob], `voice.${ext}`, { type: mimeType });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', 'whisper-1');
  formData.append('response_format', 'text');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`Whisper error ${resp.status}: ${body.slice(0, 200)}`);
  }

  return (await resp.text()).trim();
}

// ─── Text-to-speech ───────────────────────────────────────────────────────────

/**
 * Fetch TTS audio from OpenAI and return the raw Response for streaming.
 * Caller is responsible for piping response.body to the HTTP response.
 */
export async function fetchSpeechStream(
  text: string,
  voice: VoiceId,
  speed: number,
): Promise<Response> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured — TTS unavailable');

  const input = text.slice(0, 4000).trim();
  if (!input) throw new Error('Text is empty after trimming');

  const resp = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input,
      voice,
      speed,
      response_format: 'mp3',
    }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`TTS error ${resp.status}: ${body.slice(0, 200)}`);
  }

  return resp;
}

// ─── Per-user rate limiter ────────────────────────────────────────────────────

// Sliding-window rate limit: max N voice API calls per minute per userId.
// Prevents a single identity from running up unbounded OpenAI costs.
const _rateLimitWindow = new Map<string, number[]>();
const VOICE_RATE_LIMIT_MAX = 10;  // max calls per window
const VOICE_RATE_LIMIT_MS  = 60_000; // 1-minute window

/**
 * Returns `true` if the caller is within their rate limit, `false` if exceeded.
 * Call once per route handler; both transcription and TTS count toward the limit.
 */
export function checkVoiceRateLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (_rateLimitWindow.get(userId) ?? []).filter(
    (t) => t > now - VOICE_RATE_LIMIT_MS,
  );
  if (recent.length >= VOICE_RATE_LIMIT_MAX) return false;
  recent.push(now);
  _rateLimitWindow.set(userId, recent);
  return true;
}

// ─── Provider status ──────────────────────────────────────────────────────────

export function getProviderStatus(): { available: boolean; reason?: string } {
  if (!process.env.OPENAI_API_KEY) {
    return { available: false, reason: 'OpenAI API key not configured' };
  }
  return { available: true };
}
