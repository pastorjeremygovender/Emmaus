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
  vadThreshold: number; // 1–100 avg freq-bin amplitude; admin-tunable
  vadTicks: number;     // 1–20 consecutive 100 ms ticks above threshold
}

/** Sensitivity label derived from vadThreshold + vadTicks stored in the DB. */
export type VadSensitivity = 'low' | 'medium' | 'high';

// "Sensitivity" = how easily the mic triggers speech detection.
// High sensitivity = lower threshold = triggers more easily = best for quiet rooms / soft speakers.
// Low  sensitivity = higher threshold = harder to trigger = best for noisy environments.
export const VAD_PRESETS: Record<VadSensitivity, { vadThreshold: number; vadTicks: number }> = {
  low:    { vadThreshold: 65, vadTicks: 9 }, // noisy environments — hard to trigger
  medium: { vadThreshold: 50, vadTicks: 6 }, // balanced default
  high:   { vadThreshold: 35, vadTicks: 3 }, // quiet rooms / soft speakers — easy to trigger
};

/** Map stored threshold back to the nearest sensitivity label.
 *  High sensitivity = low threshold (easy to trigger).
 *  Low  sensitivity = high threshold (hard to trigger).
 */
export function sensitivityFromSettings(s: Pick<VoiceSettings, 'vadThreshold'>): VadSensitivity {
  if (s.vadThreshold <= 42) return 'high';   // 35 → high (easy to trigger)
  if (s.vadThreshold <= 57) return 'medium'; // 50 → medium
  return 'low';                               // 65 → low (hard to trigger)
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
 * @deprecated Prefer streamSpeechToAudio which starts playing within the first
 * few hundred ms instead of buffering the whole file first.
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

/**
 * Stream TTS audio directly into an HTMLAudioElement using MediaSource (where
 * supported) so playback begins within the first few hundred milliseconds
 * instead of waiting for the full file to download.
 *
 * Falls back to a full-blob download on Safari/iOS where MediaSource does not
 * support audio/mpeg.
 *
 * Returns the configured audio element plus a dispose() function the caller
 * must invoke when playback ends or is interrupted to free the underlying URL.
 */
export async function streamSpeechToAudio(
  text: string,
  userId: string,
): Promise<{ audio: HTMLAudioElement; dispose: () => void }> {
  const supportsStreaming =
    typeof MediaSource !== 'undefined' &&
    typeof MediaSource.isTypeSupported === 'function' &&
    MediaSource.isTypeSupported('audio/mpeg');

  if (!supportsStreaming) {
    // Safari / older browsers: buffer the whole blob then play
    const url = await fetchSpeechBlobUrl(text, userId);
    return { audio: new Audio(url), dispose: () => URL.revokeObjectURL(url) };
  }

  // Chrome / Firefox / Edge: pipe the server's streaming response into a
  // SourceBuffer so the audio element can start playing from the first chunk.
  return new Promise<{ audio: HTMLAudioElement; dispose: () => void }>((resolve, reject) => {
    const ms     = new MediaSource();
    const msUrl  = URL.createObjectURL(ms);
    const audio  = new Audio();
    const dispose = () => { try { URL.revokeObjectURL(msUrl); } catch { /* ignore */ } };

    ms.addEventListener('sourceopen', async () => {
      let sb: SourceBuffer;
      try {
        sb = ms.addSourceBuffer('audio/mpeg');
      } catch {
        dispose();
        // SourceBuffer creation failed (can happen in some environments)
        try {
          const url = await fetchSpeechBlobUrl(text, userId);
          resolve({ audio: new Audio(url), dispose: () => URL.revokeObjectURL(url) });
        } catch (e) { reject(e); }
        return;
      }

      // ── Chunk queue ─────────────────────────────────────────────────────
      // SourceBuffer only accepts one appendBuffer at a time.  We queue
      // incoming chunks and drain the queue in the 'updateend' handler.
      const queue: Uint8Array[] = [];
      let fetchDone = false;
      let appending = false;

      function drainQueue() {
        if (appending || sb.updating) return;
        if (queue.length > 0) {
          appending = true;
          try { sb.appendBuffer(queue.shift()!); } catch { appending = false; }
        } else if (fetchDone) {
          try { if (ms.readyState === 'open') ms.endOfStream(); } catch { /* ignore */ }
        }
      }

      sb.addEventListener('updateend', () => { appending = false; drainQueue(); });
      sb.addEventListener('error',     () => { appending = false; });

      // ── Fetch & stream ──────────────────────────────────────────────────
      try {
        const resp = await fetch(`${API_BASE}/api/voice/speak`, {
          method:  'POST',
          headers: authHeaders(userId),
          body:    JSON.stringify({ text }),
        });

        if (!resp.ok || !resp.body) {
          throw new Error(`TTS failed (${resp.status})`);
        }

        // Resolve as soon as the server responds — the audio element is ready
        // to play even though only a few bytes may have arrived.
        resolve({ audio, dispose });

        const reader = resp.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) { fetchDone = true; drainQueue(); break; }
          queue.push(value);
          drainQueue();
        }
      } catch (err) {
        dispose();
        reject(err);
      }
    }, { once: true });

    // Setting src triggers 'sourceopen'
    audio.src = msUrl;
  });
}

/**
 * Fetch TTS audio for the given text and return it as a decoded ArrayBuffer.
 * Used by the Web Audio API playback path in playGreeting(), which routes audio
 * through an already-unlocked AudioContext (no HTMLAudioElement, no autoplay gate).
 */
export async function fetchSpeechArrayBuffer(
  text: string,
  userId: string,
): Promise<ArrayBuffer> {
  const resp = await fetch(`${API_BASE}/api/voice/speak`, {
    method: 'POST',
    headers: authHeaders(userId),
    body: JSON.stringify({ text }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
    throw new Error(err.error ?? `Speech failed (${resp.status})`);
  }
  return resp.arrayBuffer();
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
