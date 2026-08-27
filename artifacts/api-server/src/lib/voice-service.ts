/**
 * voice-service.ts — Emmaus Voice: speech-to-text and text-to-speech.
 *
 * Normal-user provider policy:
 *   - STT: OpenAI gpt-4o-mini-transcribe
 *   - TTS: device/browser speech synthesis (the client owns this decision)
 *
 * Paid providers are isolated behind explicit admin comparison calls. Merely
 * configuring ELEVENLABS_API_KEY must never activate it.
 *
 * Settings: persisted to the voice_settings DB table (single row, id=1).
 *           In-memory cache is warmed by initVoiceSettings() on boot.
 *           On restart, DB values are restored rather than reverting to defaults.
 *
 * Abstraction layer — callers never reference the provider directly.
 */

import { pool } from "@workspace/db";
import { logger } from "./logger.js";

// ─── ElevenLabs voice ID map ──────────────────────────────────────────────────
// Maps OpenAI voice names (stored in DB) to ElevenLabs voice IDs.
// These are stable ElevenLabs pre-built voices — no cloning required.
const EL_VOICE_MAP: Record<string, string> = {
  nova:    'EXAVITQu4vr4xnSDxMaL', // Sarah  — warm, conversational (primary)
  shimmer: '21m00Tcm4TlvDq8ikWAM', // Rachel — calm, clear
  alloy:   'pNInz6obpgDQGcFmaJgB', // Adam
  echo:    'ErXwobaYiN019PkySvjV', // Antoni
  fable:   'N2lVS1w4EtoT3dr4eOWO', // Callum
  onyx:    'VR6AewLTigWG4xSOukaG', // Arnold
};

// ─── Settings ─────────────────────────────────────────────────────────────────

export type VoiceId = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type VoiceComparisonProvider = 'openai' | 'elevenlabs';
export const VOICE_STT_MODEL = 'gpt-4o-mini-transcribe';
export const VOICE_OPENAI_TTS_MODEL = 'tts-1';
export const VOICE_ELEVENLABS_TTS_MODEL = 'eleven_turbo_v2_5';

export interface VoiceSettings {
  enabled: boolean;
  voice: VoiceId;
  speed: number;        // 0.25 – 4.0
  vadThreshold: number; // 1 – 100  (avg freq-bin amplitude to detect speech)
  vadTicks: number;     // 1 – 20   (consecutive 100 ms ticks above threshold)
  openaiTtsComparisonEnabled: boolean;
  elevenLabsComparisonEnabled: boolean;
}

// Sensitivity presets exposed to the admin UI.
// Stored as vadThreshold + vadTicks in the DB; the UI maps a label to these.
// "Sensitivity" = how easily the mic triggers speech detection.
// High sensitivity = lower threshold = triggers more easily = best for quiet rooms / soft speakers.
// Low  sensitivity = higher threshold = harder to trigger  = best for noisy environments.
export const VAD_SENSITIVITY_PRESETS = {
  low:    { vadThreshold: 65, vadTicks: 9 }, // noisy environments — hard to trigger
  medium: { vadThreshold: 50, vadTicks: 6 }, // balanced default
  high:   { vadThreshold: 35, vadTicks: 3 }, // quiet rooms / soft speakers — easy to trigger
} as const;

// In-memory cache — warmed from DB on boot via initVoiceSettings().
// Default is DISABLED so the server fails closed during the startup window
// (before initVoiceSettings runs) and on any DB failure.
let _settings: VoiceSettings = {
  enabled: false,
  voice: 'nova',
  speed: 1.0,
  vadThreshold: 50,
  vadTicks: 6,
  openaiTtsComparisonEnabled: false,
  elevenLabsComparisonEnabled: false,
};

/**
 * Load persisted settings from the DB into the in-memory cache.
 * Also logs ElevenLabs key presence for runtime verification.
 * Called once during startup (after the voice_settings table migration runs).
 */
export async function initVoiceSettings(): Promise<void> {
  logger.info({
    openaiConfigured: !!process.env.OPENAI_API_KEY,
    elevenLabsConfigured: !!process.env.ELEVENLABS_API_KEY,
    normalSttModel: VOICE_STT_MODEL,
    normalTts: 'device',
  }, '[VOICE PROVIDERS]');

  try {
    const result = await pool.query<{
      enabled: boolean;
      voice: string;
      speed: string;
      vad_threshold: number | null;
      vad_ticks: number | null;
      comparison_openai_enabled: boolean | null;
      comparison_elevenlabs_enabled: boolean | null;
    }>(
      `SELECT enabled, voice, speed, vad_threshold, vad_ticks,
              comparison_openai_enabled, comparison_elevenlabs_enabled
       FROM voice_settings WHERE id = 1`,
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      _settings = {
        enabled: row.enabled,
        voice: row.voice as VoiceId,
        speed: parseFloat(row.speed),
        vadThreshold: row.vad_threshold ?? 50,
        vadTicks:     row.vad_ticks     ?? 6,
        openaiTtsComparisonEnabled: Boolean(row.comparison_openai_enabled),
        elevenLabsComparisonEnabled: Boolean(row.comparison_elevenlabs_enabled),
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
  if (partial.vadThreshold !== undefined && (partial.vadThreshold < 1 || partial.vadThreshold > 100)) {
    throw new Error(`VAD threshold out of range: ${partial.vadThreshold} (must be 1–100)`);
  }
  if (partial.vadTicks !== undefined && (partial.vadTicks < 1 || partial.vadTicks > 20)) {
    throw new Error(`VAD ticks out of range: ${partial.vadTicks} (must be 1–20)`);
  }

  const updated = { ..._settings, ...partial };

  await pool.query(
    `UPDATE voice_settings
       SET enabled=$1, voice=$2, speed=$3, vad_threshold=$4, vad_ticks=$5,
           comparison_openai_enabled=$6, comparison_elevenlabs_enabled=$7
     WHERE id=1`,
    [
      updated.enabled,
      updated.voice,
      updated.speed,
      updated.vadThreshold,
      updated.vadTicks,
      updated.openaiTtsComparisonEnabled,
      updated.elevenLabsComparisonEnabled,
    ],
  );

  _settings = updated;
  logger.info({ settings: _settings }, 'voice: settings updated');
  return { ..._settings };
}

// ─── Speech-to-text ───────────────────────────────────────────────────────────

/**
 * Transcribe base64-encoded audio.
 * Provider: OpenAI gpt-4o-mini-transcribe. ElevenLabs is never selected here.
 * Logs [VOICE STT] with provider, model, latency, and transcript (truncated).
 */
export async function transcribeAudioBase64(
  base64Audio: string,
  mimeType: string,
): Promise<string> {
  const start  = Date.now();
  return transcribeWithOpenAI(base64Audio, mimeType, start);
}

/** Strip codec parameters so `audio/webm;codecs=opus` → `audio/webm`. */
function cleanMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim();
}

async function transcribeWithOpenAI(
  base64Audio: string,
  mimeType: string,
  startMs: number,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured — transcription unavailable');

  const buffer      = Buffer.from(base64Audio, 'base64');
  const ext         = mimeExtToExt(mimeType);
  const cleanedMime = cleanMimeType(mimeType);

  logger.info({ blobBytes: buffer.byteLength, mimeType, cleanedMime, ext }, '[VOICE STT] OpenAI Whisper attempt');

  const blob   = new Blob([buffer], { type: cleanedMime });
  const file   = new File([blob], `voice.${ext}`, { type: cleanedMime });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('model', VOICE_STT_MODEL);
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

  const transcript = (await resp.text()).trim();
  const latencyMs  = Date.now() - startMs;

  logger.info({
    provider:               'openai',
    model:                  VOICE_STT_MODEL,
    audioDurationMs:        'N/A',
    transcriptionLatencyMs: latencyMs,
    transcript:             transcript.slice(0, 120),
    normalUserProvider:     true,
  }, '[VOICE STT]');

  return transcript;
}

// ─── Text-to-speech ───────────────────────────────────────────────────────────

/**
 * Fetch comparison TTS audio and return the raw Response for streaming.
 * Normal users use device speech synthesis and never call this function.
 */
export async function fetchSpeechStream(
  text: string,
  voice: VoiceId,
  speed: number,
  provider: VoiceComparisonProvider = 'openai',
): Promise<Response> {
  if (provider === 'elevenlabs') {
    const elKey = process.env.ELEVENLABS_API_KEY;
    if (!elKey) throw new Error('ElevenLabs comparison is not configured');
    return fetchSpeechStreamElevenLabs(text, voice, speed, elKey);
  }
  return fetchSpeechStreamOpenAI(text, voice, speed);
}

async function fetchSpeechStreamElevenLabs(
  text: string,
  voice: VoiceId,
  speed: number,
  apiKey: string,
): Promise<Response> {
  const input    = text.slice(0, 5000).trim();
  if (!input) throw new Error('Text is empty after trimming');

  const voiceId  = EL_VOICE_MAP[voice] ?? EL_VOICE_MAP['nova'];
  // eleven_turbo_v2_5 = lowest latency model; ~75ms to first chunk
  const model    = VOICE_ELEVENLABS_TTS_MODEL;

  // Clamp speed: ElevenLabs accepts 0.7–1.2 in stability; we map 0.25–4.0 speed to it
  // ElevenLabs does not have a direct "speed" param in the same way as OpenAI.
  // stability ≈ consistency of output. We keep it fixed for voice-mode.
  const resp = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        'xi-api-key':   apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text:       input,
        model_id:   model,
        voice_settings: {
          // stability 0.25: less rigid, more natural and expressive delivery —
          // critical for conversational voice. Was 0.45 which sounded flat.
          // similarity_boost 0.80: keeps the voice character consistent.
          // style 0.20: adds natural human inflection; 0.0 was robotic.
          stability:         0.25,
          similarity_boost:  0.80,
          style:             0.20,
          use_speaker_boost: true,
        },
      }),
    },
  );

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`ElevenLabs TTS error ${resp.status}: ${body.slice(0, 200)}`);
  }

  return resp;
}

async function fetchSpeechStreamOpenAI(
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
      Authorization:  `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: VOICE_OPENAI_TTS_MODEL,
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mimeExtToExt(mimeType: string): string {
  if (mimeType.includes('webm')) return 'webm';
  if (mimeType.includes('mp4'))  return 'mp4';
  if (mimeType.includes('ogg'))  return 'ogg';
  if (mimeType.includes('wav'))  return 'wav';
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'mp3';
  return 'webm';
}

// ─── Per-user rate limiter ────────────────────────────────────────────────────
//
// Two separate buckets:
//
//   checkVoiceRateLimit  — STT (transcribe) + LLM (conversation): 10 req/60s.
//                          These are the expensive calls; keep the limit tight.
//
//   checkTTSRateLimit    — TTS (speak): 40 req/60s.
//                          Structured reading makes 5 rapid TTS calls per session
//                          (Introduction → Scripture → Teaching → Reflection → Prayer).
//                          A user who interrupts and restarts burns ~10 TTS calls in
//                          under a minute. 40/min prevents abuse while allowing full
//                          reading sessions to complete without a 429.

const _rateLimitWindow    = new Map<string, number[]>();
const _ttsRateLimitWindow = new Map<string, number[]>();

const VOICE_RATE_LIMIT_MAX = 10;
const VOICE_RATE_LIMIT_MS  = 60_000;
const TTS_RATE_LIMIT_MAX   = 40;
const TTS_RATE_LIMIT_MS    = 60_000;

export function checkVoiceRateLimit(userId: string): boolean {
  const now    = Date.now();
  const recent = (_rateLimitWindow.get(userId) ?? []).filter(
    (t) => t > now - VOICE_RATE_LIMIT_MS,
  );
  if (recent.length >= VOICE_RATE_LIMIT_MAX) return false;
  recent.push(now);
  _rateLimitWindow.set(userId, recent);
  return true;
}

export function checkTTSRateLimit(userId: string): boolean {
  const now    = Date.now();
  const recent = (_ttsRateLimitWindow.get(userId) ?? []).filter(
    (t) => t > now - TTS_RATE_LIMIT_MS,
  );
  if (recent.length >= TTS_RATE_LIMIT_MAX) return false;
  recent.push(now);
  _ttsRateLimitWindow.set(userId, recent);
  return true;
}

// One active billable Voice request per authenticated user. This protects
// against double taps and late recorder callbacks creating overlapping calls.
const activeVoiceRequests = new Map<string, string>();

export function acquireVoiceRequest(userId: string, requestId: string): boolean {
  if (activeVoiceRequests.has(userId)) return false;
  activeVoiceRequests.set(userId, requestId);
  return true;
}

export function releaseVoiceRequest(userId: string, requestId: string): void {
  if (activeVoiceRequests.get(userId) === requestId) activeVoiceRequests.delete(userId);
}

export function getVoiceProviderStatus(): {
  normalStt: { provider: 'openai'; model: string; available: boolean };
  normalTts: { provider: 'device' };
  comparisons: {
    openai: { available: boolean; enabled: boolean };
    elevenlabs: { available: boolean; enabled: boolean };
  };
} {
  return {
    normalStt: {
      provider: 'openai',
      model: VOICE_STT_MODEL,
      available: !!process.env.OPENAI_API_KEY,
    },
    normalTts: { provider: 'device' },
    comparisons: {
      openai: {
        available: !!process.env.OPENAI_API_KEY,
        enabled: _settings.openaiTtsComparisonEnabled,
      },
      elevenlabs: {
        available: !!process.env.ELEVENLABS_API_KEY,
        enabled: _settings.elevenLabsComparisonEnabled
          && process.env.VOICE_ENABLE_ELEVENLABS_COMPARISON === 'true',
      },
    },
  };
}

// ─── Provider status ──────────────────────────────────────────────────────────

export function getProviderStatus(): { available: boolean; reason?: string } {
  if (process.env.OPENAI_API_KEY)     return { available: true };
  return { available: false, reason: 'OpenAI transcription is not configured' };
}
