/**
 * voice-audio-unlock.ts
 *
 * iOS Safari and some Android browsers enforce an autoplay policy: audio.play()
 * is only permitted when called within the synchronous user-gesture stack.
 * Voice Mode starts TTS after two async operations (fetchVoiceContext +
 * streamSpeechToAudio), so the gesture chain is broken by the time play() fires.
 *
 * The fix: call unlockVoiceAudio() synchronously in every UI click handler
 * that opens Voice Mode.  This function:
 *   1. Creates and resumes an AudioContext (stays 'running' permanently after
 *      a user gesture — future async operations inherit the unlocked state).
 *   2. Plays a 1-sample silent buffer to open the OS audio route immediately.
 *
 * Later, getUnlockedAudioContext() returns the running context so playGreeting
 * can decode and play TTS via AudioBufferSourceNode — no HTMLAudioElement, no
 * autoplay gate.
 *
 * IMPORTANT: This module is intentionally stateful (module-level singleton).
 * The AudioContext must survive React component remounts and navigation events —
 * a ref inside a component would be destroyed every time VoiceMode unmounts.
 */

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

let _ac: AudioContext | null = null;

/**
 * Returns the cached AudioContext if it was previously unlocked via a user
 * gesture and is still in the 'running' state, or null otherwise.
 */
export function getUnlockedAudioContext(): AudioContext | null {
  return _ac && _ac.state !== 'closed' ? _ac : null;
}

/**
 * Must be called **synchronously** inside a user-gesture handler (click/touch).
 * Creates and resumes an AudioContext, plays a silent primer buffer to open
 * the OS audio route, and caches the result for getUnlockedAudioContext().
 *
 * Idempotent: safe to call multiple times — a no-op if already running.
 * All failures are swallowed; this is best-effort hardening for autoplay.
 */
export function unlockVoiceAudio(): void {
  try {
    const Ctx =
      window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
    if (!Ctx) return;

    if (!_ac || _ac.state === 'closed') {
      _ac = new Ctx();
    }
    if (_ac.state === 'suspended') {
      _ac.resume().catch(() => {});
    }

    // Play a 1-sample, zero-gain buffer to open the OS audio routing path
    // before any async TTS fetch begins.
    const buf = _ac.createBuffer(1, 1, 22050);
    const src = _ac.createBufferSource();
    src.buffer = buf;
    const gain = _ac.createGain();
    gain.gain.value = 0;
    src.connect(gain);
    gain.connect(_ac.destination);
    src.start(0);
    src.stop(_ac.currentTime + 0.001);
  } catch {
    // AudioContext not available or blocked — silently skip.
  }

  console.info('[VOICE GREETING]', JSON.stringify({ event: 'audioUnlockAttempted' }));
}
