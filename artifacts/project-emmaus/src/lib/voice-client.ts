/**
 * voice-client.ts — Browser-side Emmaus Voice API helpers.
 *
 * Transcription: sends base64 audio to POST /api/voice/transcribe.
 * TTS: fetches audio blob from POST /api/voice/speak, returns it as a Blob URL.
 * Settings: GET/PUT /api/voice/settings.
 *
 * All calls pass X-User-Id for identity (same pattern as emmaus-client.ts).
 */

const API_BASE = (import.meta.env.VITE_API_URL ?? '') as string;

export interface VoiceSettings {
  enabled: boolean;
  voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(userId: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-User-Id': userId };
}

/** Detect the best MIME type the browser's MediaRecorder supports. */
export function getSupportedMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4;codecs=aac',
    'audio/mp4',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return '';
}

// ─── Transcription ────────────────────────────────────────────────────────────

/**
 * Transcribe an audio Blob using the server-side Whisper integration.
 * Returns the transcript string, or throws on error.
 */
export async function transcribeAudio(
  audioBlob: Blob,
  userId: string,
): Promise<string> {
  // Encode to base64 to avoid multipart complexity
  const arrayBuffer = await audioBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const resp = await fetch(`${API_BASE}/api/voice/transcribe`, {
    method: 'POST',
    headers: authHeaders(userId),
    body: JSON.stringify({ audio: base64, mimeType: audioBlob.type || 'audio/webm' }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
    throw new Error(err.error ?? `Transcription failed (${resp.status})`);
  }

  const data = await resp.json() as { transcript: string };
  return data.transcript;
}

// ─── TTS ──────────────────────────────────────────────────────────────────────

/**
 * Fetch TTS audio for the given text from the server.
 * Returns a Blob URL that can be set as the src of an Audio element.
 * Caller is responsible for revoking the URL when done.
 */
export async function fetchSpeechBlobUrl(
  text: string,
  userId: string,
  options: { voice?: string; speed?: number } = {},
): Promise<string> {
  const resp = await fetch(`${API_BASE}/api/voice/speak`, {
    method: 'POST',
    headers: authHeaders(userId),
    body: JSON.stringify({ text, ...options }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
    throw new Error(err.error ?? `Speech failed (${resp.status})`);
  }

  const blob = await resp.blob();
  return URL.createObjectURL(blob);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

export async function getVoiceSettings(userId: string): Promise<VoiceSettings> {
  const resp = await fetch(`${API_BASE}/api/voice/settings`, {
    headers: { 'X-User-Id': userId },
  });
  if (!resp.ok) throw new Error(`Failed to load voice settings (${resp.status})`);
  return resp.json() as Promise<VoiceSettings>;
}

export async function updateVoiceSettings(
  userId: string,
  settings: Partial<VoiceSettings>,
): Promise<VoiceSettings> {
  const resp = await fetch(`${API_BASE}/api/voice/settings`, {
    method: 'PUT',
    headers: authHeaders(userId),
    body: JSON.stringify(settings),
  });
  if (!resp.ok) throw new Error(`Failed to save voice settings (${resp.status})`);
  return resp.json() as Promise<VoiceSettings>;
}
