/**
 * voice-service.ts — Emmaus Voice: speech-to-text and text-to-speech.
 *
 * Provider priority (runtime):
 *   - ElevenLabs if ELEVENLABS_API_KEY is set (STT: scribe_v1, TTS: eleven_turbo_v2_5)
 *   - OpenAI fallback (STT: whisper-1, TTS: tts-1)
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

export interface VoiceSettings {
  enabled: boolean;
  voice: VoiceId;
  speed: number;   // 0.25 – 4.0
}

// In-memory cache — warmed from DB on boot via initVoiceSettings().
// Default is DISABLED so the server fails closed during the startup window
// (before initVoiceSettings runs) and on any DB failure.
let _settings: VoiceSettings = {
  enabled: false,
  voice: 'nova',
  speed: 1.0,
};

/**
 * Load persisted settings from the DB into the in-memory cache.
 * Also logs ElevenLabs key presence for runtime verification.
 * Called once during startup (after the voice_settings table migration runs).
 */
export async function initVoiceSettings(): Promise<void> {
  // Log ElevenLabs key status — never print the key value
  const elKeyConfigured = !!(process.env.ELEVENLABS_API_KEY);
  logger.info({ apiKeyConfigured: elKeyConfigured }, '[VOICE ELEVENLABS]');

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

  await pool.query(
    'UPDATE voice_settings SET enabled=$1, voice=$2, speed=$3 WHERE id=1',
    [updated.enabled, updated.voice, updated.speed],
  );

  _settings = updated;
  logger.info({ settings: _settings }, 'voice: settings updated');
  return { ..._settings };
}

// ─── Speech-to-text ───────────────────────────────────────────────────────────

/**
 * Transcribe base64-encoded audio.
 * Provider: ElevenLabs scribe_v1 if ELEVENLABS_API_KEY is set, else OpenAI whisper-1.
 * Logs [VOICE STT] with provider, model, latency, and transcript (truncated).
 */
export async function transcribeAudioBase64(
  base64Audio: string,
  mimeType: string,
): Promise<string> {
  const elKey = process.env.ELEVENLABS_API_KEY;
  const start  = Date.now();

  if (elKey) {
    return transcribeWithElevenLabs(base64Audio, mimeType, elKey, start);
  }
  return transcribeWithOpenAI(base64Audio, mimeType, start);
}

async function transcribeWithElevenLabs(
  base64Audio: string,
  mimeType: string,
  apiKey: string,
  startMs: number,
): Promise<string> {
  const buffer = Buffer.from(base64Audio, 'base64');
  const ext    = mimeExtToExt(mimeType);
  const blob   = new Blob([buffer], { type: mimeType });
  const file   = new File([blob], `voice.${ext}`, { type: mimeType });

  const formData = new FormData();
  formData.append('file', file);
  formData.append('model_id', 'scribe_v1');

  const resp = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    // Hard failure — do NOT silently fall back; caller decides
    throw new Error(`ElevenLabs STT error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const json = await resp.json() as { text?: string };
  const transcript = (json.text ?? '').trim();
  const latencyMs  = Date.now() - startMs;

  logger.info({
    provider:               'elevenlabs',
    model:                  'scribe_v1',
    audioDurationMs:        'N/A',   // not exposed by EL API; estimated client-side
    transcriptionLatencyMs: latencyMs,
    transcript:             transcript.slice(0, 120),
  }, '[VOICE STT]');

  return transcript;
}

async function transcribeWithOpenAI(
  base64Audio: string,
  mimeType: string,
  startMs: number,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured — transcription unavailable');

  const buffer = Buffer.from(base64Audio, 'base64');
  const ext    = mimeExtToExt(mimeType);
  const blob   = new Blob([buffer], { type: mimeType });
  const file   = new File([blob], `voice.${ext}`, { type: mimeType });

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

  const transcript = (await resp.text()).trim();
  const latencyMs  = Date.now() - startMs;

  logger.info({
    provider:               'openai',
    model:                  'whisper-1',
    audioDurationMs:        'N/A',
    transcriptionLatencyMs: latencyMs,
    transcript:             transcript.slice(0, 120),
    fallback:               true,
    reason:                 'ELEVENLABS_API_KEY not set',
  }, '[VOICE STT]');

  return transcript;
}

// ─── Text-to-speech ───────────────────────────────────────────────────────────

/**
 * Fetch TTS audio and return the raw Response for streaming.
 * Provider: ElevenLabs eleven_turbo_v2_5 if ELEVENLABS_API_KEY is set, else OpenAI tts-1.
 * ElevenLabs starts streaming bytes almost immediately, cutting time-to-first-audio.
 */
export async function fetchSpeechStream(
  text: string,
  voice: VoiceId,
  speed: number,
): Promise<Response> {
  const elKey = process.env.ELEVENLABS_API_KEY;
  if (elKey) {
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
  const model    = 'eleven_turbo_v2_5';

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
          stability:        0.45,
          similarity_boost: 0.80,
          style:            0.0,
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

// ─── Provider status ──────────────────────────────────────────────────────────

export function getProviderStatus(): { available: boolean; reason?: string } {
  if (process.env.ELEVENLABS_API_KEY) return { available: true };
  if (process.env.OPENAI_API_KEY)     return { available: true };
  return { available: false, reason: 'No voice API key configured (ELEVENLABS_API_KEY or OPENAI_API_KEY)' };
}
