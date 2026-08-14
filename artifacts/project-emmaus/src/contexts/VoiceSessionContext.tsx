/**
 * VoiceSessionContext — Phase 4: App-level persistent Voice session.
 *
 * Previously the Voice engine lived entirely inside VoiceMode.tsx and was
 * destroyed every time the user navigated away.  Phase 4 lifts the engine
 * to the application level so the session survives route changes.
 *
 * ARCHITECTURE:
 *   VoiceSessionProvider   — mounts once at app startup (inside the router)
 *   useVoiceSession()      — hook consumed by VoiceMode (view) and
 *                            GlobalVoiceIndicator (compact overlay)
 *
 * CLOSE VIEW vs END SESSION:
 *   Navigating away from /personal/ask-emmaus/voice → session continues.
 *   Tapping "End" explicitly → endSession() → cleanup + state reset.
 *
 * ENGINE NOTES:
 *   All phases 1-3 logic is preserved verbatim.
 *   Dynamic state (convId, history, user, initContext) is mirrored into
 *   refs so processAudioBlob can be a stable useCallback with no deps —
 *   eliminating the stale-closure problem that existed in the old component.
 *
 *   cancelledRef is now a "session ended" flag, NOT an "unmounted" flag.
 *   It is reset to false on startSession() and set to true on endSession().
 */

import React, {
  createContext,
  useContext,
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import {
  type FlatContext,
  type HistoryItem,
} from '@/lib/emmaus-client';
import {
  transcribeAudio,
  streamSpeechToAudio,
  getSupportedMimeType,
} from '@/lib/voice-client';
import {
  takePendingContext,
  getReturnDestination,
  clearReturnDestination,
} from '@/lib/emmaus-pending';
import { fetchVoiceContext, type VoiceAppContext } from '@/lib/voice-context';
import { resolveIntent, type VoiceIntent } from '@/lib/voice-intent';
import { sendVoiceConversation, type AnyVoiceToolCall } from '@/lib/voice-conversation-client';
import {
  resolveVoiceTranslation,
  buildSubstitutionNotice,
} from '@/lib/voice-bible';
import { remoteBibleProvider } from '@/lib/bible-provider';

// ─── Types ────────────────────────────────────────────────────────────────────

export type VoiceState = 'READY' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

interface InterruptCapture {
  recorder: MediaRecorder | null;
  chunks:   Blob[];
  stream:   MediaStream | null;
  mimeType: string;
}

export interface VoiceSessionContextType {
  // ── Session lifecycle ──────────────────────────────────────────────────────
  isActive:      boolean;
  sessionPaused: boolean;

  // ── Engine state (reactive) ────────────────────────────────────────────────
  voiceState:       VoiceState;
  transcript:       string;
  response:         string;
  streamingResponse: string;
  errorMsg:         string | null;
  ttsError:         boolean;
  convId:           string | null;
  history:          HistoryItem[];
  initContext:      FlatContext | null;
  autoplayBlocked:  boolean;
  showHistory:      boolean;
  activeContent:    { label: string } | null;

  // ── For the view to access audioElRef (tap-to-play guard) ─────────────────
  hasAudioElement: boolean;

  // ── Actions (stable references) ────────────────────────────────────────────
  startSession:       (context?: FlatContext) => void;
  endSession:         () => void;
  pauseSession:       () => void;
  resumeSession:      () => void;
  handleOrbTap:       () => void;
  handleTapToHear:    () => void;
  handleRetryAudio:   () => Promise<void>;
  setShowHistory:     React.Dispatch<React.SetStateAction<boolean>>;
  updateVisualContext: (ctx: FlatContext) => void;
  /** Called by VoiceMode on mount so processAudioBlob can issue navigation commands. */
  registerNavigate:   (fn: (to: string) => void) => void;
}

// ─── Opening greeting builder ─────────────────────────────────────────────────
/**
 * Build a short personalised greeting from the user's active content.
 * Called once when a voice session starts. Purely data-driven — no LLM call.
 * Returns null when there is nothing meaningful to announce (skip to listening).
 */
function buildOpeningGreeting(
  ctx: import('@/lib/voice-context').VoiceAppContext,
  preferredName?: string | null,
): string | null {
  const name = preferredName && preferredName.trim() && preferredName !== 'friend'
    ? preferredName.trim()
    : null;
  const hi = name ? `Hi ${name}.` : 'Hi.';

  const items: string[] = [];
  if (ctx.dailyRhythm) {
    const dr = ctx.dailyRhythm;
    items.push(`your ${dr.journeyTitle} on Day ${dr.currentDay}`);
  }
  for (const d of ctx.activeDevotionals) {
    items.push(`your ${d.seriesTitle} on Day ${d.currentDay}`);
  }
  if (ctx.sermonCompanion) {
    items.push('your Sermon Companion');
  }

  if (items.length === 0) return null;

  if (items.length === 1) {
    return `${hi} You have ${items[0]} ready. What would you like to do?`;
  }
  const last = items[items.length - 1];
  const rest = items.slice(0, -1).join(', ');
  return `${hi} You have ${rest} and ${last} ready. What would you like to do?`;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const VoiceSessionContext = createContext<VoiceSessionContextType | null>(null);

export function useVoiceSession(): VoiceSessionContextType {
  const ctx = useContext(VoiceSessionContext);
  if (!ctx) throw new Error('useVoiceSession must be used within VoiceSessionProvider');
  return ctx;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function VoiceSessionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [location, providerNavigate] = useLocation();
  // providerNavigate is always available (provider-level), used as fallback when
  // VoiceMode is not mounted (user speaking via GlobalVoiceIndicator).
  const providerNavigateRef = useRef<((to: string) => void) | null>(null);
  useEffect(() => { providerNavigateRef.current = providerNavigate; }, [providerNavigate]);

  // ── Session lifecycle state ────────────────────────────────────────────────
  const [isActive,      setIsActive]      = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);

  // ── Voice engine state (same as old VoiceMode) ────────────────────────────
  const [voiceState,        setVoiceState]        = useState<VoiceState>('READY');
  const [transcript,        setTranscript]        = useState('');
  const [response,          setResponse]          = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [errorMsg,          setErrorMsg]          = useState<string | null>(null);
  const [ttsError,          setTtsError]          = useState(false);
  const [convId,            setConvId]            = useState<string | null>(null);
  const [history,           setHistory]           = useState<HistoryItem[]>([]);
  const [initContext,       setInitContext]       = useState<FlatContext | null>(null);
  const [autoplayBlocked,   setAutoplayBlocked]   = useState(false);
  const [showHistory,       setShowHistory]       = useState(false);
  const [activeContent,     setActiveContent]     = useState<{ label: string } | null>(null);
  const [hasAudioElement,   setHasAudioElement]   = useState(false);

  // ── Ref-copies of dynamic state (for use inside stable processAudioBlob) ──
  // React guarantees state setters are stable; the VALUES need refs.
  const userRef        = useRef(user);
  const convIdRef      = useRef<string | null>(null);
  const historyRef     = useRef<HistoryItem[]>([]);
  const initContextRef = useRef<FlatContext | null>(null);

  useEffect(() => { userRef.current        = user; },        [user]);
  useEffect(() => { convIdRef.current      = convId; },      [convId]);
  useEffect(() => { historyRef.current     = history; },     [history]);
  useEffect(() => { initContextRef.current = initContext; }, [initContext]);

  // ── Audio / recording refs ─────────────────────────────────────────────────
  const recorderRef         = useRef<MediaRecorder | null>(null);
  const chunksRef           = useRef<Blob[]>([]);
  const streamRef           = useRef<MediaStream | null>(null);
  const abortRef            = useRef<(() => void) | null>(null);
  const audioElRef          = useRef<HTMLAudioElement | null>(null);
  const disposeAudioRef     = useRef<(() => void) | null>(null);
  const playbackAcRef       = useRef<AudioContext | null>(null);
  const cancelledRef        = useRef(true); // true until startSession() is called
  const autoRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── VAD refs ──────────────────────────────────────────────────────────────
  const vadAcRef            = useRef<AudioContext | null>(null);
  const analyserRef         = useRef<AnalyserNode | null>(null);
  const vadIntervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const vadSilenceStartRef  = useRef<number | null>(null);
  const vadSpokenRef        = useRef(false);
  // hadVoiceActivityRef is set to true by the VAD interval when speech is
  // detected (same trigger as vadSpokenRef) but is NOT cleared by clearVAD().
  // It is only reset at the start of startListening() so that processAudioBlob
  // can reliably tell whether the user actually spoke — even though clearVAD()
  // always runs before recorder.onstop fires.
  const hadVoiceActivityRef = useRef(false);
  const recordingStartRef   = useRef<number>(0);

  // ── Phase 3: content context refs ─────────────────────────────────────────
  const appContextRef      = useRef<VoiceAppContext | null>(null);
  const bibleContextRef    = useRef<{ bookId: string; chapter: number; translationId: string } | null>(null);
  const readingSectionsRef = useRef<{ label: string; text: string }[]>([]);
  const readingIndexRef    = useRef(0);
  const isReadingRef       = useRef(false);
  const readingPausedRef   = useRef(false);

  // ── Interrupt monitor refs ─────────────────────────────────────────────────
  const intStreamRef        = useRef<MediaStream | null>(null);
  const intAcRef            = useRef<AudioContext | null>(null);
  const intAnalyserRef      = useRef<AnalyserNode | null>(null);
  const intIntervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const intSpeechStartRef   = useRef<number | null>(null);
  const intRecorderRef      = useRef<MediaRecorder | null>(null);
  const intChunksRef        = useRef<Blob[]>([]);
  const intMimeTypeRef      = useRef<string>('');

  // ── Stable ref for processAudioBlob (avoids stale closures in recorder.onstop) ──
  const processAudioBlobRef = useRef<((blob: Blob, mimeType: string) => Promise<void>) | null>(null);

  // ── pausedRef — mirrors sessionPaused for use inside the stable processAudioBlob
  // callback. Without this, the auto-restart timer inside playTTS would see the
  // initial (false) value of sessionPaused because processAudioBlob has no deps.
  const pausedRef = useRef(false);

  // ── Post-TTS mic guard — records when TTS audio last finished so that
  // processAudioBlob can compute how long the mic has been open since TTS
  // ended. Used in [VOICE INPUT TRACE] for diagnostics.
  const ttsEndedAtRef = useRef<number | null>(null);

  // ─── Cleanup helpers ──────────────────────────────────────────────────────

  function cancelAutoRestart() {
    if (autoRestartTimerRef.current) {
      clearTimeout(autoRestartTimerRef.current);
      autoRestartTimerRef.current = null;
    }
  }

  function stopInterruptMonitor() {
    if (intIntervalRef.current) { clearInterval(intIntervalRef.current); intIntervalRef.current = null; }
    intAnalyserRef.current    = null;
    intSpeechStartRef.current = null;
    intAcRef.current?.close().catch(() => {}); intAcRef.current = null;
    const rec = intRecorderRef.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop          = null;
      if (rec.state !== 'inactive') rec.stop();
      intRecorderRef.current = null;
    }
    intChunksRef.current = [];
    intStreamRef.current?.getTracks().forEach((t) => t.stop());
    intStreamRef.current = null;
  }

  function clearVAD() {
    if (vadIntervalRef.current) { clearInterval(vadIntervalRef.current); vadIntervalRef.current = null; }
    analyserRef.current        = null;
    vadSilenceStartRef.current = null;
    vadSpokenRef.current       = false;
    vadAcRef.current?.close().catch(() => {});
    vadAcRef.current = null;
  }

  function stopMicStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  function stopAudioElement() {
    // Clears only the audio element — leaves the interrupt monitor running.
    // Use this between reading sections so the monitor stays alive across the
    // whole reading session without restarting getUserMedia per section.
    audioElRef.current?.pause();
    audioElRef.current = null;
    setHasAudioElement(false);
    disposeAudioRef.current?.();
    disposeAudioRef.current = null;
    setAutoplayBlocked(false);
    setTtsError(false);
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'none'; } catch { /* ignore */ }
    }
  }

  function stopAudio() {
    stopInterruptMonitor();
    stopAudioElement();
  }

  function cancelRecorder() {
    clearVAD();
    const rec = recorderRef.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
    }
    recorderRef.current = null;
    stopMicStream();
  }

  function stopRecorder() {
    clearVAD();
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
  }

  function cleanupAll() {
    cancelAutoRestart();
    clearVAD();
    stopAudio();
    cancelRecorder();
    abortRef.current?.();
    abortRef.current = null;
    playbackAcRef.current?.close().catch(() => {});
    playbackAcRef.current = null;
    // Clear Media Session
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('stop', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
      } catch { /* ignore */ }
    }
  }

  // ─── Media Session API ───────────────────────────────────────────────────────

  function updateMediaSession(title: string, state: MediaSessionPlaybackState) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: 'Emmaus Voice',
        album: 'Emmaus',
      });
      navigator.mediaSession.playbackState = state;
    } catch { /* not supported — silently skip */ }
  }

  function setupMediaSessionHandlers() {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler('pause', () => {
        readingPausedRef.current = true;
        cancelAutoRestart();
        stopAudio();
        setVoiceState('READY');
        try { navigator.mediaSession.playbackState = 'paused'; } catch { /* ignore */ }
      });
      navigator.mediaSession.setActionHandler('play', () => {
        if (readingPausedRef.current) {
          readingPausedRef.current = false;
          const sections = readingSectionsRef.current;
          const section  = sections[readingIndexRef.current];
          if (section) {
            processAudioBlobRef.current; // ensure stable ref is set
            // Restart via the reading engine
            setActiveContent({ label: section.label });
            try { navigator.mediaSession.playbackState = 'playing'; } catch { /* ignore */ }
          }
        }
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        endSession();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        const sections = readingSectionsRef.current;
        const next = readingIndexRef.current + 1;
        if (next < sections.length) {
          readingIndexRef.current = next;
          updateMediaSession(sections[next].label, 'playing');
        }
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        const prev = Math.max(0, readingIndexRef.current - 1);
        readingIndexRef.current = prev;
        const sections = readingSectionsRef.current;
        if (sections[prev]) updateMediaSession(sections[prev].label, 'playing');
      });
    } catch { /* not all handlers supported — skip */ }
  }

  // ─── Interrupt monitor ────────────────────────────────────────────────────

  async function startInterruptMonitor(onInterrupt: (capture: InterruptCapture) => void) {
    if (intStreamRef.current) return;
    try {
      // echoCancellation + noiseSuppression prevent TTS speaker bleed from
      // self-triggering the interrupt.  On iOS only one concurrent mic stream
      // is allowed — this call may fail silently if the primary stream is still
      // open, which is why we also keep the orb-tap path as a barge-in option.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl:  true,
        },
      });
      if (cancelledRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      intStreamRef.current = stream;

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) { stopInterruptMonitor(); return; }

      const ac       = new Ctx();
      const source   = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      intAcRef.current       = ac;
      intAnalyserRef.current = analyser;
      intSpeechStartRef.current = null;

      const mimeType = getSupportedMimeType();
      intMimeTypeRef.current = mimeType;

      const data = new Uint8Array(analyser.frequencyBinCount);

      // ── Startup delay ──────────────────────────────────────────────────────
      // Wait before starting to poll.  TTS audio bleeds back through the mic —
      // polling too early fires a false interrupt.  AEC (echo cancellation) with
      // noiseSuppression typically locks within 200–400 ms; 1000 ms is a
      // conservative but comfortable margin.  We previously used 3000 ms which
      // meant short responses could never be interrupted at all.
      const monitorStartTime = Date.now();
      const MONITOR_STARTUP_DELAY_MS = 1000;

      intIntervalRef.current = setInterval(() => {
        // Don't evaluate anything until the startup window has passed
        if (Date.now() - monitorStartTime < MONITOR_STARTUP_DELAY_MS) return;

        const a = intAnalyserRef.current;
        if (!a) return;
        a.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;

        // Threshold 40: low enough to catch normal speech but high enough that
        // TTS speaker bleed (attenuated by AEC after the startup delay) doesn't
        // self-trigger.  Gate 600 ms: user must sustain speech for 600 ms before
        // the interrupt fires — short enough to feel immediate, long enough to
        // ignore transient noise.
        if (avg > 40) {
          if (intSpeechStartRef.current === null) {
            intSpeechStartRef.current = Date.now();
            const opts: MediaRecorderOptions = mimeType ? { mimeType } : {};
            try {
              const rec = new MediaRecorder(intStreamRef.current!, opts);
              intChunksRef.current = [];
              rec.ondataavailable = (e) => { if (e.data.size > 0) intChunksRef.current.push(e.data); };
              rec.start(200);
              intRecorderRef.current = rec;
            } catch { /* recorder unavailable */ }
          } else if (Date.now() - intSpeechStartRef.current > 600) {
            if (intIntervalRef.current) { clearInterval(intIntervalRef.current); intIntervalRef.current = null; }
            intAnalyserRef.current    = null;
            intSpeechStartRef.current = null;
            intAcRef.current?.close().catch(() => {}); intAcRef.current = null;

            const capture: InterruptCapture = {
              recorder: intRecorderRef.current,
              chunks:   intChunksRef.current,
              stream:   intStreamRef.current,
              mimeType: intMimeTypeRef.current,
            };
            intRecorderRef.current = null;
            intChunksRef.current   = [];
            intStreamRef.current   = null;
            console.log('[VOICE] bargeInDetected: true — interrupt monitor fired');
            onInterrupt(capture);
          }
        } else {
          if (intSpeechStartRef.current !== null) {
            intSpeechStartRef.current = null;
            const rec = intRecorderRef.current;
            if (rec) {
              rec.ondataavailable = null;
              rec.onstop = null;
              if (rec.state !== 'inactive') rec.stop();
              intRecorderRef.current = null;
            }
            intChunksRef.current = [];
          }
        }
      }, 50);
    } catch (err) {
      // Mic denied or device doesn't allow a second concurrent stream (iOS).
      // Barge-in via orb tap (SPEAKING state → startListening) is still available.
      console.log('[VOICE] bargeInDetected: false — interrupt monitor unavailable:', String(err));
    }
  }

  // ─── Recording ────────────────────────────────────────────────────────────

  async function startListening() {
    setErrorMsg(null);
    setTranscript('');
    setTtsError(false);
    hadVoiceActivityRef.current = false; // reset here, NOT in clearVAD()

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current) { mediaStream.getTracks().forEach((t) => t.stop()); return; }

      streamRef.current = mediaStream;

      const mimeType = getSupportedMimeType();
      const opts: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(mediaStream, opts);
      recorderRef.current = recorder;
      chunksRef.current   = [];

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        stopMicStream();
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        chunksRef.current = [];
        await processAudioBlobRef.current?.(blob, mimeType || 'audio/webm');
      };

      recorder.start(200);
      recordingStartRef.current = Date.now();

      // ── Voice Activity Detection ──────────────────────────────────────────
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ac       = new Ctx();
          const source   = ac.createMediaStreamSource(mediaStream);
          const analyser = ac.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          vadAcRef.current    = ac;
          analyserRef.current = analyser;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          // ── VAD tuning notes ────────────────────────────────────────────────
          // threshold 18 was too low — room HVAC / ambient hum triggers it in
          // a quiet space, causing the recorder to stop on near-silence and
          // send garbage audio to Whisper which returns hallucinated text.
          // 35 requires actual voice-level energy.  Keep it here; do NOT lower
          // it without testing in a real room environment.
          const VAD_THRESHOLD     = 35;   // avg freq bin — was 18, too low
          const VAD_MIN_ELAPSED   = 1500; // ms before silence-gate can fire
          // Sprint 1: reduced 2000 → 1200 ms for more natural conversational cadence.
          // Still long enough to avoid cutting off mid-sentence pauses (~500–800 ms).
          const VAD_SILENCE_GATE  = 1200; // ms of silence after speech to stop

          // Track how long we've been genuinely above threshold
          let vadAboveCount = 0;

          vadIntervalRef.current = setInterval(() => {
            const a = analyserRef.current;
            if (!a) return;
            a.getByteFrequencyData(dataArray);
            const avg     = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
            const elapsed = Date.now() - recordingStartRef.current;

            if (avg > VAD_THRESHOLD) {
              vadAboveCount++;
              // Sprint 1: reduced from 5 → 3 consecutive above-threshold ticks (~300 ms)
              // so natural conversational speech (shorter, softer utterances) is detected.
              // Still prevents a single transient noise from falsely locking vadSpokenRef.
              if (vadAboveCount >= 3) {
                vadSpokenRef.current        = true;
                hadVoiceActivityRef.current = true; // survives clearVAD()
                vadSilenceStartRef.current  = null;
              }
            } else {
              vadAboveCount = 0;
              if (vadSpokenRef.current && elapsed > VAD_MIN_ELAPSED) {
                if (vadSilenceStartRef.current === null) {
                  vadSilenceStartRef.current = Date.now();
                } else if (Date.now() - vadSilenceStartRef.current > VAD_SILENCE_GATE) {
                  stopRecorder();
                  setVoiceState('THINKING');
                }
              }
            }
          }, 100);
        }
      } catch { /* VAD not supported */ }

      setVoiceState('LISTENING');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      const isDenied =
        msg.includes('NotAllowed') || msg.includes('Permission') || msg.includes('denied');
      setErrorMsg(
        isDenied
          ? 'Emmaus needs microphone access for Voice Mode. Please allow microphone access in your browser settings.'
          : 'Could not start the microphone. Please check your device and try again.',
      );
      setVoiceState('ERROR');
    }
  }

  function stopListening() {
    stopRecorder();
    setVoiceState('THINKING');
  }

  function startListeningFromCapture(capture: InterruptCapture) {
    const { recorder, chunks, stream, mimeType } = capture;

    setErrorMsg(null);
    setTranscript('');
    setTtsError(false);
    cancelAutoRestart();
    // The user was definitely speaking (they triggered the barge-in by talking for 1500 ms).
    // Mark voice activity so processAudioBlob doesn't reject this blob at the VAD gate.
    hadVoiceActivityRef.current = true;

    if (!stream) { startListening(); return; }

    streamRef.current         = stream;
    chunksRef.current         = chunks;
    recordingStartRef.current = Date.now();

    let rec = recorder;
    if (!rec || rec.state === 'inactive') {
      const opts: MediaRecorderOptions = mimeType ? { mimeType } : {};
      rec = new MediaRecorder(stream, opts);
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.start(200);
    } else {
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    }

    rec.onstop = async () => {
      stopMicStream();
      const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
      chunksRef.current = [];
      await processAudioBlobRef.current?.(blob, mimeType || 'audio/webm');
    };

    recorderRef.current = rec;
    setVoiceState('LISTENING');

    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ac       = new Ctx();
        const source   = ac.createMediaStreamSource(stream);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        vadAcRef.current          = ac;
        analyserRef.current       = analyser;
        vadSilenceStartRef.current = null;
        vadSpokenRef.current      = true;

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        // startListeningFromCapture — capture continues from barge-in.
        // vadSpokenRef is already true (user was speaking), so only the
        // silence gate matters here.  Same thresholds as startListening.
        vadIntervalRef.current = setInterval(() => {
          const a = analyserRef.current;
          if (!a) return;
          a.getByteFrequencyData(dataArray);
          const avg     = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
          const elapsed = Date.now() - recordingStartRef.current;
          if (avg > 35) {
            vadSilenceStartRef.current = null;
          } else if (elapsed > 1500) {
            if (vadSilenceStartRef.current === null) {
              vadSilenceStartRef.current = Date.now();
            } else if (Date.now() - vadSilenceStartRef.current > 1200) {
              // Sprint 1: 2000 → 1200 ms (matches startListening silence gate)
              clearVAD();
              stopRecorder();
              setVoiceState('THINKING');
            }
          }
        }, 100);
      }
    } catch { /* VAD unavailable */ }
  }

  // ─── Audio processing pipeline (stable — reads everything from refs) ───────

  const processAudioBlob = useCallback(async (blob: Blob, mimeType: string) => {
    // Pull current values from refs — no stale closures
    const user        = userRef.current;
    const history     = historyRef.current;
    const initContext = initContextRef.current;

    if (!user || cancelledRef.current) return;

    // ── Inner helpers (same as Phases 1–3) ────────────────────────────────

    async function playTTS(ttsText: string, isReadingSection: boolean): Promise<void> {
      if (cancelledRef.current) return;
      setVoiceState('SPEAKING');

      const sectionIdx   = isReadingSection ? readingIndexRef.current : null;
      const sectionLabel = isReadingSection ? (readingSectionsRef.current[readingIndexRef.current]?.label ?? null) : null;
      const ttsStartMs   = Date.now();

      console.info('[VOICE CONTENT PLAYBACK]', JSON.stringify({
        event:         'ttsRequestStarted',
        isReadingSection,
        sectionIndex:  sectionIdx,
        sectionLabel,
        sectionsTotal: isReadingSection ? readingSectionsRef.current.length : null,
        textLength:    ttsText.length,
        ttsProvider:   'elevenlabs',
      }));

      let ttsAudio: HTMLAudioElement;
      try {
        const result = await streamSpeechToAudio(ttsText, user!.id);
        if (cancelledRef.current) { result.dispose(); return; }
        ttsAudio                = result.audio;
        audioElRef.current      = result.audio;
        disposeAudioRef.current = result.dispose;
        setHasAudioElement(true);
        console.info('[VOICE CONTENT PLAYBACK]', JSON.stringify({
          event:          'audioElementCreated',
          isReadingSection,
          sectionIndex:   sectionIdx,
          firstChunkMs:   Date.now() - ttsStartMs,
        }));
      } catch (fetchErr) {
        console.error('[VOICE CONTENT PLAYBACK]', JSON.stringify({
          event:         'ttsRequestFailed',
          isReadingSection,
          sectionIndex:  sectionIdx,
          failureReason: 'streamSpeechToAudio_threw',
          error:         String(fetchErr),
        }));
        if (!cancelledRef.current) { setTtsError(true); setVoiceState('READY'); }
        // During structured reading: skip the failed section and advance instead of stalling
        if (isReadingSection && isReadingRef.current && !readingPausedRef.current && !cancelledRef.current) {
          setTimeout(() => { if (!cancelledRef.current) advanceReading(); }, 500);
        }
        return;
      }

      // Interrupt monitor is started once per reading session in playReadingSection,
      // NOT here per TTS call. Starting getUserMedia mid-playback causes iOS to
      // briefly interrupt audio routing (audible stutter). By starting it once
      // before the first section, the mic is already open when audio plays.

      await new Promise<void>((resolve) => {
        ttsAudio.onended = () => {
          if (audioElRef.current !== ttsAudio) { resolve(); return; }
          console.info('[VOICE CONTENT PLAYBACK]', JSON.stringify({
            event:             'audioEnded',
            isReadingSection,
            sectionIndex:      sectionIdx,
            totalPlayMs:       Date.now() - ttsStartMs,
            nextSectionExists: isReadingSection && ((sectionIdx ?? 0) + 1 < readingSectionsRef.current.length),
            nextSectionIndex:  isReadingSection && ((sectionIdx ?? 0) + 1 < readingSectionsRef.current.length)
              ? (sectionIdx ?? 0) + 1 : null,
          }));
          // Between reading sections: clear audio element only, keep interrupt monitor alive.
          // For normal conversation TTS: full stopAudio (closes monitor, opens mic).
          if (isReadingSection) { stopAudioElement(); } else { stopAudio(); }
          ttsEndedAtRef.current = Date.now();
          if (!cancelledRef.current) {
            setVoiceState('READY');
            autoRestartTimerRef.current = setTimeout(() => {
              autoRestartTimerRef.current = null;
              if (cancelledRef.current || pausedRef.current) return;

              // ── Structured reading: advance section directly ─────────────────
              // Do NOT route through startListening() between sections.
              // The old path (mic → VAD silence → empty transcript → advanceReading)
              // fails in a quiet room because VAD requires 5 consecutive ticks
              // above threshold before silence-gate can fire — it never triggers
              // when there is no speech, so the reader stalls after section 0.
              if (isReadingSection && isReadingRef.current && !readingPausedRef.current) {
                advanceReading();
                return;
              }

              // Normal conversation or end-of-reading: open the mic.
              startListening();
            // Sprint 1: post-TTS mic delay reduced from 2500 → 1000 ms for conversation.
            // Reading advance stays at 800 ms (bypasses mic entirely — no change needed).
            }, isReadingSection ? 800 : 1000);
          }
          resolve();
        };
        ttsAudio.onerror = (e) => {
          if (audioElRef.current !== ttsAudio) { resolve(); return; }
          console.error('[VOICE CONTENT PLAYBACK]', JSON.stringify({
            event:         'audioError',
            isReadingSection,
            sectionIndex:  sectionIdx,
            failureReason: 'audio_element_onerror',
            error:         e instanceof ErrorEvent ? e.message : String(e),
          }));
          // Keep interrupt monitor alive between reading sections.
          if (isReadingSection) { stopAudioElement(); } else { stopAudio(); }
          setVoiceState('READY');
          // During structured reading: skip the failed section and advance instead of stalling
          if (isReadingSection && isReadingRef.current && !readingPausedRef.current && !cancelledRef.current) {
            setTimeout(() => { if (!cancelledRef.current) advanceReading(); }, 500);
          }
          resolve();
        };
        const playPromise = ttsAudio.play();
        console.info('[VOICE CONTENT PLAYBACK]', JSON.stringify({
          event:        'audioPlayCalled',
          isReadingSection,
          sectionIndex: sectionIdx,
          hasPromise:   playPromise !== undefined,
        }));
        playPromise?.catch((err: unknown) => {
          // AbortError = audio was deliberately stopped (barge-in / interrupt / stopAudio).
          // Do NOT advance reading — the interrupt handler owns what happens next.
          // Also guard against the audio element having been replaced (ref no longer matches).
          const isAbort = err instanceof DOMException && err.name === 'AbortError';
          if (isAbort || audioElRef.current !== ttsAudio) {
            console.info('[VOICE CONTENT PLAYBACK]', JSON.stringify({
              event:         'audioPlayAborted',
              isReadingSection,
              sectionIndex:  sectionIdx,
              failureReason: isAbort ? 'AbortError_intentional_stop' : 'audio_ref_replaced',
            }));
            resolve();
            return;
          }
          const isNotAllowed = err instanceof DOMException && err.name === 'NotAllowedError';
          console.error('[VOICE CONTENT PLAYBACK]', JSON.stringify({
            event:         'audioPlayRejected',
            isReadingSection,
            sectionIndex:  sectionIdx,
            failureReason: isNotAllowed ? 'autoplay_NotAllowedError' : 'play_rejected',
            errorName:     err instanceof DOMException ? err.name : String(err),
          }));
          if (isNotAllowed) { setAutoplayBlocked(true); setVoiceState('READY'); }
          else if (isReadingSection) { stopAudioElement(); setVoiceState('READY'); }
          else               { stopAudio();              setVoiceState('READY'); }
          // Only advance during reading on genuine play() failures (not intentional stops)
          if (isReadingSection && isReadingRef.current && !readingPausedRef.current && !cancelledRef.current) {
            setTimeout(() => { if (!cancelledRef.current) advanceReading(); }, 500);
          }
          resolve();
        });
      });
    }

    async function playReadingSection(section: { label: string; text: string } | undefined): Promise<void> {
      if (!section || cancelledRef.current) return;
      const sections = readingSectionsRef.current;
      const idx      = readingIndexRef.current;
      // ── VOICE CONTENT PLAYBACK: section boundary ─────────────────────────────
      console.info('[VOICE CONTENT PLAYBACK]', JSON.stringify({
        event:             'sectionStarted',
        readingIndex:      idx,
        sectionsTotal:     sections.length,
        sectionLabel:      section.label,
        sectionTextLength: section.text.length,
        nextSectionExists: idx + 1 < sections.length,
        ttsRequestStarted: true,
      }));
      // Legacy READER TRACE kept for backwards compatibility
      console.log('[VOICE READER TRACE]', JSON.stringify({
        contentTitle:             activeContent?.label ?? null,
        sectionsTotal:            sections.length,
        currentSectionIndex:      idx,
        currentSectionLabel:      section.label,
        currentSectionTextLength: section.text.length,
        nextSectionExists:        idx + 1 < sections.length,
        nextSectionIndex:         idx + 1 < sections.length ? idx + 1 : null,
        readerState:              'SPEAKING',
      }));
      setActiveContent({ label: section.label });
      updateMediaSession(section.label, 'playing');
      // Start (or keep) interrupt monitor for this reading session.
      // Called once per section but is a no-op if monitor is already running
      // (intStreamRef guard at top of startInterruptMonitor). This approach means
      // getUserMedia is called BEFORE audio starts playing — eliminating the iOS
      // hardware-routing stutter that occurred when it was called mid-playback.
      // The 3-second startup delay now counts from session start, not per section.
      startInterruptMonitor((capture) => {
        stopAudio();
        setStreamingResponse('');
        startListeningFromCapture(capture);
      });
      await playTTS(section.text, true);
    }

    async function advanceReading(): Promise<void> {
      const sections = readingSectionsRef.current;
      const next     = readingIndexRef.current + 1;
      console.info('[VOICE CONTENT PLAYBACK]', JSON.stringify({
        event:         'advanceReading',
        fromIndex:     readingIndexRef.current,
        toIndex:       next,
        sectionsTotal: sections.length,
        hasNext:       !(!sections.length || next >= sections.length),
      }));
      if (!sections.length || next >= sections.length) {
        isReadingRef.current = false;
        // Reading is done — stop the interrupt monitor that was kept alive across sections.
        stopInterruptMonitor();
        setActiveContent(null);
        setVoiceState('READY');
        console.info('[VOICE CONTENT PLAYBACK]', JSON.stringify({ event: 'readingComplete', totalSections: sections.length }));
        autoRestartTimerRef.current = setTimeout(() => {
          autoRestartTimerRef.current = null;
          if (!cancelledRef.current && !pausedRef.current) startListening();
        }, 1500);
        return;
      }
      readingIndexRef.current = next;
      await playReadingSection(sections[next]);
    }

    async function loadAndStartReading(
      content: 'daily-rhythm' | 'devotional' | 'sermon-companion' | 'bible',
      bibleRef?: { bookId: string; bookName: string; chapter: number; verse?: number; translationId?: string },
      titleHint?: string,
    ): Promise<boolean> {
      // ── Race-condition guard ──────────────────────────────────────────────
      // fetchVoiceContext is fire-and-forget at session start; if the user
      // speaks before the API responds, appContextRef is still null.
      // Await a fresh fetch here so content always resolves correctly.
      if (!appContextRef.current && content !== 'bible') {
        const uid = userRef.current?.id;
        console.log('[VOICE CONTENT DEBUG] appContextRef was null — awaiting fresh context fetch', { uid, content });
        if (uid) {
          const fresh = await fetchVoiceContext(uid);
          if (fresh) appContextRef.current = fresh;
        }
      }

      const appCtx = appContextRef.current;
      const sections: { label: string; text: string }[] = [];

      // ── Diagnostic log (always emitted, seen in browser console on device) ──
      if (content !== 'bible') {
        console.log('[VOICE CONTENT DEBUG]', JSON.stringify({
          content,
          titleHint: titleHint ?? null,
          voiceContextLoaded: !!appCtx,
          availableDailyRhythm: appCtx?.dailyRhythm
            ? { journeyTitle: appCtx.dailyRhythm.journeyTitle, currentDay: appCtx.dailyRhythm.currentDay, stepTitle: appCtx.dailyRhythm.stepTitle }
            : null,
          availableDevotionals: appCtx?.activeDevotionals?.map(d => ({
            seriesId: d.seriesId, seriesTitle: d.seriesTitle, currentDay: d.currentDay, entryTitle: d.entryTitle,
          })) ?? [],
          availableSermonCompanion: appCtx?.sermonCompanion
            ? { title: appCtx.sermonCompanion.title, currentDay: appCtx.sermonCompanion.currentDay }
            : null,
        }));
      }

      if (content === 'daily-rhythm') {
        const dr = appCtx?.dailyRhythm;
        if (!dr) {
          console.log('[VOICE CONTENT DEBUG] daily-rhythm: failureReason=no_daily_rhythm_in_context');
          return false;
        }
        const label = `${dr.journeyTitle} — Day ${dr.currentDay}`;
        if (dr.stepTitle)      sections.push({ label: 'Introduction', text: dr.stepTitle });
        if (dr.stepScripture)  sections.push({ label: 'Scripture',    text: `Today's scripture is ${dr.stepScripture}.` });
        if (dr.stepTeaching)   sections.push({ label: 'Teaching',     text: dr.stepTeaching });
        if (dr.stepReflection) sections.push({ label: 'Reflection',   text: dr.stepReflection });
        if (dr.stepPrayer)     sections.push({ label: 'Prayer',       text: dr.stepPrayer });
        console.log('[VOICE CONTENT DEBUG] daily-rhythm', JSON.stringify({
          journeyTitle: dr.journeyTitle, currentDay: dr.currentDay,
          sectionsCount: sections.length,
          contentResolved: sections.length > 0,
          failureReason: sections.length === 0 ? 'all_fields_empty' : null,
        }));
        if (!sections.length) return false;
        readingSectionsRef.current = sections;
        readingIndexRef.current    = 0;
        isReadingRef.current       = true;
        readingPausedRef.current   = false;
        setActiveContent({ label });
      }

      else if (content === 'devotional') {
        const allDevs = appCtx?.activeDevotionals ?? [];

        // Fuzzy match titleHint (e.g. "psalms") against series titles so
        // "Read my Psalms devotional" finds "Psalms Daily Devotional" without hardcoding.
        let devs = allDevs;
        if (titleHint && allDevs.length > 0) {
          const hint = titleHint.toLowerCase();
          const matched = allDevs.filter(d => d.seriesTitle.toLowerCase().includes(hint));
          if (matched.length > 0) devs = matched;
        }

        console.log('[VOICE CONTENT DEBUG] devotional', JSON.stringify({
          titleHint: titleHint ?? null,
          totalActive: allDevs.length,
          matchedCount: devs.length,
          matchedTitles: devs.map(d => d.seriesTitle),
        }));

        if (devs.length === 0) {
          console.log('[VOICE CONTENT DEBUG] devotional: failureReason=no_active_devotionals');
          return false;
        }
        if (devs.length > 1) {
          // Speak the real titles so the user can clarify
          const titles = devs.map(d => d.seriesTitle).join(' and ');
          await playTTS(`You have ${titles}. Which devotional would you like me to read?`, false);
          console.log('[VOICE CONTENT DEBUG] devotional: failureReason=multiple_active_asked_clarification titles=' + titles);
          return false;
        }
        const dev   = devs[0];
        const label = `${dev.seriesTitle} — Day ${dev.currentDay}`;
        if (dev.entryTitle)     sections.push({ label: 'Today',      text: dev.entryTitle });
        if (dev.entryScripture) sections.push({ label: 'Scripture',  text: `Today's scripture is ${dev.entryScripture}.` });
        if (dev.entryContent)   sections.push({ label: 'Reflection', text: dev.entryContent });
        if (dev.entryPrayer)    sections.push({ label: 'Prayer',     text: dev.entryPrayer });
        console.log('[VOICE CONTENT DEBUG] devotional', JSON.stringify({
          seriesTitle: dev.seriesTitle, currentDay: dev.currentDay,
          entryTitle: dev.entryTitle, sectionsCount: sections.length,
          contentResolved: sections.length > 0,
          failureReason: sections.length === 0 ? 'all_fields_empty' : null,
        }));
        if (!sections.length) return false;
        readingSectionsRef.current = sections;
        readingIndexRef.current    = 0;
        isReadingRef.current       = true;
        readingPausedRef.current   = false;
        setActiveContent({ label });
      }

      else if (content === 'sermon-companion') {
        const sc = appCtx?.sermonCompanion;
        if (!sc) return false;
        const label = `Sermon Companion — Day ${sc.currentDay}`;
        if (sc.entryGreeting)   sections.push({ label: 'Opening',    text: sc.entryGreeting });
        if (sc.entryScripture)  sections.push({ label: 'Scripture',  text: `This week's scripture is ${sc.entryScripture}.` });
        if (sc.entryReflection) sections.push({ label: 'Reflection', text: sc.entryReflection });
        if (sc.entryPrayer)     sections.push({ label: 'Prayer',     text: sc.entryPrayer });
        if (sc.entryClosing)    sections.push({ label: 'Closing',    text: sc.entryClosing });
        if (!sections.length) return false;
        readingSectionsRef.current = sections;
        readingIndexRef.current    = 0;
        isReadingRef.current       = true;
        readingPausedRef.current   = false;
        setActiveContent({ label });
      }

      else if (content === 'bible') {
        let resolvedRef: {
          bookId: string; bookName: string; chapter: number;
          verse?: number; translationId?: string;
        } | null = null;

        if (bibleRef?.bookId) {
          resolvedRef = bibleRef;
        } else if (bibleContextRef.current) {
          const ctx = bibleContextRef.current;
          resolvedRef = { bookId: ctx.bookId, bookName: ctx.bookId, chapter: ctx.chapter, translationId: ctx.translationId };
        } else if (initContext?.bookId && initContext?.chapter) {
          resolvedRef = { bookId: initContext.bookId, bookName: initContext.bookName ?? initContext.bookId, chapter: initContext.chapter };
        }

        if (!resolvedRef) return false;

        const translation = resolveVoiceTranslation(resolvedRef.translationId ?? null);
        let chapterData: Awaited<ReturnType<typeof remoteBibleProvider.getChapter>> = null;
        try {
          chapterData = await remoteBibleProvider.getChapter(resolvedRef.bookId, resolvedRef.chapter, translation.resolvedId);
          console.log('[VOICE] Bible fetch result:', resolvedRef.bookId, resolvedRef.chapter, translation.resolvedId, '→ verses:', chapterData?.verses?.length ?? 0);
        } catch (err) {
          console.error('[VOICE] Bible fetch error:', String(err), { bookId: resolvedRef.bookId, chapter: resolvedRef.chapter, translation: translation.resolvedId });
          return false;
        }
        if (!chapterData?.verses?.length) {
          console.log('[VOICE] Bible fetch: no verses returned for', resolvedRef.bookId, resolvedRef.chapter);
          return false;
        }

        bibleContextRef.current = { bookId: resolvedRef.bookId, chapter: resolvedRef.chapter, translationId: translation.resolvedId };

        const displayBook        = resolvedRef.bookName;
        const displayTranslation = translation.resolvedId.toUpperCase();

        if (translation.substituted) {
          const wasExplicit = Boolean(resolvedRef.translationId);
          sections.push({ label: 'Translation note', text: buildSubstitutionNotice(translation.requestedId, translation.resolvedName, wasExplicit) });
        }

        if (resolvedRef.verse) {
          const start = Math.max(1, resolvedRef.verse - 1);
          const end   = Math.min(chapterData.verses.length, resolvedRef.verse + 4);
          const chunk = chapterData.verses.filter((v) => v.verse >= start && v.verse <= end);
          sections.push({ label: `${displayBook} ${resolvedRef.chapter}:${resolvedRef.verse} (${displayTranslation})`, text: chunk.map((v) => `Verse ${v.verse}: ${v.text}`).join(' ') });
        } else {
          const CHUNK = 8;
          for (let i = 0; i < chapterData.verses.length; i += CHUNK) {
            const chunk  = chapterData.verses.slice(i, i + CHUNK);
            sections.push({ label: `${displayBook} ${resolvedRef.chapter}:${chunk[0].verse}–${chunk[chunk.length - 1].verse} (${displayTranslation})`, text: chunk.map((v) => `Verse ${v.verse}: ${v.text}`).join(' ') });
          }
        }

        if (!sections.length) return false;
        readingSectionsRef.current = sections;
        readingIndexRef.current    = 0;
        isReadingRef.current       = true;
        readingPausedRef.current   = false;
        setActiveContent({ label: `${displayBook} ${resolvedRef.chapter} (${displayTranslation})` });
      }

      if (!sections.length) return false;

      // ── VOICE READING START log (verifiable in browser DevTools) ─────────────
      console.info('[VOICE READING START]', JSON.stringify({
        content,
        entry:               sections[0]?.label ?? '',
        sectionsTotal:       sections.length,
        initialSectionIndex: 0,
        initialSectionLabel: sections[0]?.label ?? '',
      }));

      setStreamingResponse('');
      await playReadingSection(sections[0]);
      return true;
    }

    function buildEmmausContext(intent: VoiceIntent): FlatContext {
      const base: FlatContext = initContext
        ? { ...initContext, userName: user!.preferredName }
        : { entryPoint: 'personal', userName: user!.preferredName };

      const parts: string[] = [];
      const appCtx = appContextRef.current;

      if (appCtx) {
        const contentLines: string[] = [];
        if (appCtx.dailyRhythm) {
          const dr = appCtx.dailyRhythm;
          const stepInfo = dr.stepTitle ? `, step: "${dr.stepTitle}"` : '';
          contentLines.push(
            `• ${dr.journeyTitle} (also known as "Daily Rhythm" or "10 Minutes with Jesus") — Day ${dr.currentDay} of ${dr.totalDays}${stepInfo}`,
          );
        }
        for (const d of appCtx.activeDevotionals) {
          const entryInfo = d.entryTitle ? `, entry: "${d.entryTitle}"` : '';
          contentLines.push(`• ${d.seriesTitle} — Day ${d.currentDay} of ${d.totalDays}${entryInfo}`);
        }
        if (appCtx.sermonCompanion) {
          const sc = appCtx.sermonCompanion;
          const entryInfo = sc.entryTitle ? `, today: "${sc.entryTitle}"` : '';
          contentLines.push(`• Sermon Companion: "${sc.title}" — Day ${sc.currentDay} of ${sc.totalDays}${entryInfo}`);
        }
        if (contentLines.length > 0) {
          parts.push(`User's available content today:\n${contentLines.join('\n')}`);
        }
      }

      if (isReadingRef.current && readingSectionsRef.current.length > 0) {
        const section = readingSectionsRef.current[readingIndexRef.current];
        if (section) {
          parts.push(`Voice is currently reading: ${section.label}`);
          parts.push(section.text.slice(0, 500));
        }
      }

      const voiceAppContext = parts.length > 0 ? parts.join('\n\n') : undefined;

      if (bibleContextRef.current) {
        const bCtx = bibleContextRef.current;
        const translationNote     = `\nBible reading translation: ${bCtx.translationId.toUpperCase()}`;
        const enrichedVoiceCtx    = voiceAppContext ? voiceAppContext + translationNote : translationNote.trim();
        return { ...base, bookId: bCtx.bookId, chapter: bCtx.chapter, voiceAppContext: enrichedVoiceCtx };
      }

      if (appCtx?.dailyRhythm && (isReadingRef.current || intent.type === 'converse')) {
        const dr = appCtx.dailyRhythm;
        return { ...base, journeyId: dr.journeyId, journeyTitle: dr.journeyTitle, currentDay: dr.currentDay, voiceAppContext };
      }

      return { ...base, voiceAppContext };
    }

    // ── [VOICE INPUT TRACE] — diagnostic for physical-device testing ──────────
    {
      const audioDurationMs = Date.now() - recordingStartRef.current;
      const audioBytes      = blob.size;
      console.log('[VOICE INPUT TRACE]', JSON.stringify({
        audioDurationMs,
        audioBytes,
        ttsEndedAt:        ttsEndedAtRef.current ? new Date(ttsEndedAtRef.current).toISOString() : null,
        timeSinceTtsEnded: ttsEndedAtRef.current !== null ? Date.now() - ttsEndedAtRef.current : null,
      }));

      // ── Audio rejection gates ─────────────────────────────────────────────
      //
      // Gate 1: hadVoiceActivityRef — set by the VAD interval when ≥5
      // consecutive above-threshold ticks are detected (~500 ms of real speech).
      // Unlike vadSpokenRef, this ref is NOT cleared by clearVAD(), so it
      // retains the value from the recording session even though clearVAD()
      // always runs before recorder.onstop fires.  This correctly blocks
      // near-silence echo picked up after TTS playback ends.
      //
      // Gate 2: blob size floor — rejects MediaRecorder flush artifacts (a few
      // hundred bytes produced by recorder.stop() with no real audio).
      const MIN_BLOB_BYTES = 1000;

      const rejectedByVad      = !hadVoiceActivityRef.current;
      const rejectedByBlobSize = audioBytes < MIN_BLOB_BYTES;

      if (rejectedByVad || rejectedByBlobSize) {
        console.log('[VOICE AUDIO REJECTED]', JSON.stringify({
          reason:      rejectedByVad ? 'no_vad_speech_detected' : 'blob_too_small',
          duration:    audioDurationMs,
          bytes:       audioBytes,
          hadVoiceActivity: hadVoiceActivityRef.current,
          vadSpeechMs: null,
        }));
        if (isReadingRef.current && !readingPausedRef.current) {
          await advanceReading();
        } else {
          setVoiceState('LISTENING');
          autoRestartTimerRef.current = setTimeout(() => {
            autoRestartTimerRef.current = null;
            if (!cancelledRef.current && !pausedRef.current) startListening();
          }, 500);
        }
        return;
      }
    }

    // ── Main pipeline ─────────────────────────────────────────────────────────

    setVoiceState('THINKING');

    try {
      const audioBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
      const text = await transcribeAudio(audioBlob, user.id);

      console.log('[VOICE CORE TRACE]', JSON.stringify({
        event:               'transcription_complete',
        audioBlobBytes:      blob.size,
        audioDurationMs:     Date.now() - recordingStartRef.current,
        transcriptionStarted: true,
        transcript:          text.trim().slice(0, 120),
        audioAccepted:       true,
        nextState:           text.trim() ? 'dispatch' : 'error_or_advance',
      }));

      if (cancelledRef.current) return;

      if (!text.trim()) {
        if (isReadingRef.current && !readingPausedRef.current) { await advanceReading(); return; }
        setErrorMsg("I didn't catch that. Tap to try again.");
        setVoiceState('ERROR');
        return;
      }

      setTranscript(text);
      setStreamingResponse('');

      const intent = resolveIntent(text, isReadingRef.current);

      // ── [VOICE ACTION TRACE] — emitted after every classification ────────────
      // Sprint 2 routing:
      //   Fast-path (regex, no LLM): reading-command | navigate | continue-reading
      //   LLM tool dispatch (everything else): read-content, continue-walk,
      //     get-steps, converse — LLM decides tool or conversational reply
      const _isFastPath = (
        intent.type === 'navigate' ||
        intent.type === 'reading-command' ||
        intent.type === 'continue-reading'
      );
      console.log('[VOICE ACTION TRACE]', JSON.stringify({
        transcript:        text,
        classifiedIntent:  intent.type,
        dispatch:          _isFastPath ? 'fast-path-regex' : 'llm-tool-dispatch',
        navigationTarget:  intent.type === 'navigate' ? (intent as { target: string }).target : null,
        isReadingActive:   isReadingRef.current,
        voiceContextLoaded: !!appContextRef.current,
      }));

      // ── Reading commands ────────────────────────────────────────────────────
      if (intent.type === 'reading-command') {
        const { command } = intent;
        if (command === 'pause') {
          readingPausedRef.current = true;
          cancelAutoRestart();
          stopAudio();
          setVoiceState('READY');
          return;
        }
        if (command === 'continue') {
          readingPausedRef.current = false;
          await playReadingSection(readingSectionsRef.current[readingIndexRef.current]);
          return;
        }
        if (command === 'repeat') {
          readingPausedRef.current = false;
          await playReadingSection(readingSectionsRef.current[readingIndexRef.current]);
          return;
        }
        if (command === 'next-section') {
          readingPausedRef.current = false;
          await advanceReading();
          return;
        }
        readingPausedRef.current = true;
      }

      // ── Navigation ───────────────────────────────────────────────────────────
      if (intent.type === 'navigate') {
        const routes: Record<string, string> = {
          walk: '/walk', bible: '/bible', discover: '/discover', journeys: '/journeys',
        };
        if (intent.target === 'back') {
          window.history.back();
          // Restart listening after navigating back (small delay for page to settle)
          autoRestartTimerRef.current = setTimeout(() => {
            autoRestartTimerRef.current = null;
            if (!cancelledRef.current && !pausedRef.current) startListening();
          }, 1200);
          return;
        }
        const route = routes[intent.target] ?? '/walk';
        // Prefer VoiceMode's registered navigate; fall back to provider-level navigate
        const navFn = navigateRef.current ?? providerNavigateRef.current;
        console.log('[VOICE]', JSON.stringify({ navigationRoute: route, hasFn: !!navFn }));
        if (navFn) {
          navFn(route);
        } else {
          // Last resort: use browser history API
          window.history.pushState({}, '', route);
          window.dispatchEvent(new PopStateEvent('popstate'));
        }
        // Restart listening after navigation so the session continues on the new screen
        autoRestartTimerRef.current = setTimeout(() => {
          autoRestartTimerRef.current = null;
          if (!cancelledRef.current && !pausedRef.current) startListening();
        }, 1200);
        return;
      }

      // ── Continue reading (fast path — unambiguous chapter navigation) ────────
      if (intent.type === 'continue-reading') {
        if (isReadingRef.current && !readingPausedRef.current && intent.direction !== 'previous') {
          await advanceReading();
          return;
        }
        if (bibleContextRef.current) {
          const { bookId, chapter, translationId } = bibleContextRef.current;
          const targetChapter = intent.direction === 'previous' ? chapter - 1 : chapter + 1;
          if (targetChapter >= 1) {
            const started = await loadAndStartReading('bible', { bookId, bookName: bookId, chapter: targetChapter, translationId });
            if (started) return;
          }
        }
      }

      // ── LLM tool dispatch ─────────────────────────────────────────────────────
      //
      // Sprint 2: all remaining intents (read-content, continue-walk, get-steps,
      // converse) are sent to POST /api/voice/conversation with tool definitions.
      // The model decides whether to call read_content, navigate, or respond
      // conversationally — no rigid command vocabulary required from the user.
      //
      // Fast paths kept above (reading-command / navigate / continue-reading) are
      // deterministic, zero-latency, and need no LLM involvement.

      const emmausCtx   = buildEmmausContext(intent);
      const voiceAppCtx = emmausCtx.voiceAppContext;

      let toolCallPending: AnyVoiceToolCall | null = null;
      let hadToolCall = false;
      let fullResponse = '';

      // ── Start interrupt monitor NOW (before the LLM call) ────────────────────
      // Previously the monitor was only started inside playReadingSection, so the
      // user could never interrupt a conversational response.  Starting it here,
      // before the LLM request fires, means the 1-second startup delay elapses
      // during LLM latency (free time) — the monitor is already active when TTS
      // starts playing.  The guard (intStreamRef.current) makes this idempotent:
      // if a reading session already started the monitor it stays alive as-is.
      //
      // interruptFired: local flag that stops the sentence drain loop and aborts
      // the SSE stream when a barge-in fires.  Without it, the old drain loop
      // keeps running and tries to play the next queued sentence over the user's
      // new recording.
      let interruptFired = false;
      startInterruptMonitor((capture) => {
        interruptFired = true;
        abortRef.current?.();   // abort any in-flight LLM SSE stream
        abortRef.current = null;
        stopAudio();
        setStreamingResponse('');
        startListeningFromCapture(capture);
      });

      // ── Sentence streaming queue ──────────────────────────────────────────────
      // Sentences from the server are played via TTS as they arrive so the user
      // hears Emmaus start speaking within 1-2 s of finishing their question,
      // rather than waiting for the full LLM response.  Only used for
      // conversational (non-tool-call) responses.
      //
      // ORDERING INVARIANT: the server always emits { type:'sentence' } before
      // { type:'done' } for any non-empty conversational response (including the
      // trailing-fragment flush at finishReason==='stop').  The SSE reader in
      // voice-conversation-client.ts calls onSentence during the read loop and
      // calls onDone only after the loop ends, so sentenceEverEnqueued is
      // guaranteed to be true before the outer Promise resolves whenever the
      // server emitted at least one sentence.  This makes the fallback branch
      // below safe from double-speaking.
      const sentenceQueue: string[] = [];
      let   sentenceQueueDone    = false;
      let   sentenceQueueWaker: (() => void) | null = null;
      let   sentenceQueueActive  = false;
      // sentenceEverEnqueued is set to true the first time a valid sentence is
      // pushed to the queue.  It is never cleared, so the fallback guard below
      // can reliably distinguish "no sentences ever arrived" from "drain already
      // finished" — the two cases that produce an identical sentenceQueueActive
      // value after the drain loop exits.
      let   sentenceEverEnqueued = false;
      let   drainPromise: Promise<void> | null = null;

      /**
       * Play sentences from the queue sequentially, waiting for more to arrive
       * when the queue empties before the stream has finished.
       * Cancels the post-TTS auto-restart timer before each sentence so that the
       * previous sentence's 1-second delay doesn't fire the mic while a new
       * sentence is already queued.
       * Stops immediately when interruptFired — barge-in owns what happens next.
       */
      async function drainAndPlaySentences(): Promise<void> {
        while (true) {
          if (interruptFired || cancelledRef.current) return;
          if (sentenceQueue.length > 0) {
            cancelAutoRestart(); // clear timer set by previous playTTS onended
            const sentence = sentenceQueue.shift()!;
            if (!cancelledRef.current && !interruptFired) {
              await playTTS(sentence, false);
            }
            if (cancelledRef.current || interruptFired) return;
          } else if (sentenceQueueDone) {
            return;
          } else {
            // Cancel any auto-restart timer that fired while we waited for the
            // next sentence — prevents the mic from opening between sentences.
            cancelAutoRestart();
            await new Promise<void>((r) => { sentenceQueueWaker = r; });
          }
        }
      }

      function enqueueSentence(sentence: string) {
        if (!sentence.trim() || hadToolCall || interruptFired) return;
        sentenceEverEnqueued = true; // set before drain starts; survives drain completion
        sentenceQueue.push(sentence);
        if (!sentenceQueueActive) {
          sentenceQueueActive = true;
          drainPromise = drainAndPlaySentences();
        } else if (sentenceQueueWaker) {
          const wake = sentenceQueueWaker;
          sentenceQueueWaker = null;
          wake();
        }
      }

      await new Promise<void>((resolve, reject) => {
        const handle = sendVoiceConversation({
          message:         text,
          userId:          user.id,
          history:         history,
          voiceAppContext: voiceAppCtx,
          isReading:       isReadingRef.current,
          callbacks: {
            onText: (chunk) => {
              if (cancelledRef.current) return;
              fullResponse += chunk;
              setStreamingResponse(fullResponse);
            },
            // Each complete sentence is dispatched to TTS immediately so the
            // user hears the first sentence before the LLM finishes responding.
            onSentence: (sentence) => {
              if (cancelledRef.current) return;
              enqueueSentence(sentence);
            },
            // Collect the tool call — executed after stream ends so any brief
            // confirmation text can be spoken before or instead of the action.
            onToolCall: (tc) => {
              hadToolCall = true;
              toolCallPending = tc;
              console.log('[VOICE TOOL CALL]', JSON.stringify({ tool: tc.tool, args: tc.args }));
            },
            onDone: (_finalText, _hadTool) => {
              if (!_hadTool && !cancelledRef.current) {
                // Pure conversation — persist to local history for multi-turn context
                setHistory((prev) => [
                  ...prev,
                  { role: 'user' as const,      content: text },
                  { role: 'assistant' as const, content: fullResponse },
                ]);
              }
              // Signal drain loop that no more sentences are coming
              sentenceQueueDone = true;
              if (sentenceQueueWaker) {
                const wake = sentenceQueueWaker;
                sentenceQueueWaker = null;
                wake();
              }
              resolve();
            },
            onError: (msg) => reject(new Error(msg)),
          },
        });
        abortRef.current = handle.abort;
      });

      abortRef.current = null;
      if (cancelledRef.current) return;

      // ── Execute pending tool call ─────────────────────────────────────────────
      if (hadToolCall && toolCallPending) {
        const tc = toolCallPending as AnyVoiceToolCall;

        if (tc.tool === 'read_content') {
          // Reading IS the response — do not TTS any accompanying text.
          const args = tc.args as {
            type:          string;
            bibleBook?:    string;
            bibleChapter?: number;
            titleHint?:    string;
          };
          let bibleRef: { bookId: string; bookName: string; chapter: number } | undefined;
          if (args.bibleBook && args.bibleChapter) {
            bibleRef = { bookId: args.bibleBook, bookName: args.bibleBook, chapter: args.bibleChapter };
          }
          const started = await loadAndStartReading(
            args.type as 'daily-rhythm' | 'devotional' | 'sermon-companion' | 'bible',
            bibleRef,
            args.titleHint,
          );
          if (!started) {
            // Log the real failure so it's visible in DevTools (not hidden behind a friendly string)
            const errorCode =
              args.type === 'daily-rhythm'      ? 'VOICE_RESOLVER_NO_ACTIVE_DAILY_RHYTHM' :
              args.type === 'devotional'         ? 'VOICE_RESOLVER_ENTRY_NOT_FOUND_DEVOTIONAL' :
              args.type === 'sermon-companion'   ? 'VOICE_RESOLVER_NO_SERMON_COMPANION' :
              args.type === 'bible'              ? 'VOICE_RESOLVER_BIBLE_FETCH_FAILED' :
                                                   'VOICE_RESOLVER_UNKNOWN_CONTENT_TYPE';
            console.error('[VOICE CONTENT BRIDGE FAILED]', JSON.stringify({
              errorCode,
              toolArgs: args,
              appContextLoaded: !!appContextRef.current,
              dailyRhythmInContext: !!appContextRef.current?.dailyRhythm,
              activeDevotionalsCount: appContextRef.current?.activeDevotionals?.length ?? 0,
            }));
            const errMsg = `I wasn't able to load that content. Check Today's Steps to see what's available.`;
            setResponse(errMsg);
            setStreamingResponse('');
            await playTTS(errMsg, false);
          }
          return;
        }

        if (tc.tool === 'navigate') {
          const args = tc.args as { destination: string };
          const routes: Record<string, string> = {
            walk: '/walk', bible: '/bible', discover: '/discover', journeys: '/journeys',
          };
          const resolvedRoute = args.destination === 'back' ? 'HISTORY_BACK' : (routes[args.destination] ?? '/walk');
          const routeExists   = args.destination === 'back' || Object.keys(routes).includes(args.destination);
          const navFnName = navigateRef.current ? 'navigateRef' : providerNavigateRef.current ? 'providerNavigateRef(wouter)' : 'window.history.pushState';
          console.info('[VOICE TOOL NAV TRACE]', JSON.stringify({
            toolName:             'navigate',
            toolArguments:        args,
            requestedDestination: args.destination,
            resolvedRoute,
            routeExists,
            routerFunctionUsed:   navFnName,
            navigationCalled:     true,
          }));
          // Bible-specific canonical nav log (all fields from spec)
          if (args.destination === 'bible') {
            console.info('[VOICE BIBLE NAV]', JSON.stringify({
              utterance:         text ?? '(unavailable)',
              toolCall:          'navigate({ destination: "bible" })',
              canonicalAction:   `${navFnName}("/bible")`,
              route:             '/bible',
              routeMatched:      true,
              finalURL:          '/bible',
              renderedComponent: 'Bible (src/pages/Bible.tsx)',
              success:           !!(navigateRef.current ?? providerNavigateRef.current),
            }));
          }
          // Speak brief confirmation text first (e.g. "Opening your Bible now.")
          if (fullResponse.trim()) {
            setResponse(fullResponse);
            setStreamingResponse('');
            await playTTS(fullResponse, false);
            if (cancelledRef.current) return;
          }
          if (args.destination === 'back') {
            window.history.back();
          } else {
            const route = routes[args.destination] ?? '/walk';
            const navFn = navigateRef.current ?? providerNavigateRef.current;
            if (navFn) navFn(route);
            else { window.history.pushState({}, '', route); window.dispatchEvent(new PopStateEvent('popstate')); }
          }
          if (!fullResponse.trim()) {
            // No TTS — restart listening after navigation settles
            autoRestartTimerRef.current = setTimeout(() => {
              autoRestartTimerRef.current = null;
              if (!cancelledRef.current && !pausedRef.current) startListening();
            }, 1200);
          }
          // If TTS was spoken, its onended handler restarts listening automatically
          return;
        }

        if (tc.tool === 'continue_walk') {
          // The server resolved the walk server-side and returned either a direct
          // route or a clarification prompt (zero / multiple active walks).
          const args = tc.args as { route?: string; prompt?: string; journeyTitle?: string; currentDay?: number };

          if (args.prompt) {
            // Speak clarification or "no walks" message, then re-open the mic.
            // Persist this exchange to history so the LLM has full context on the
            // next turn — the user's follow-up ("Walk A") will arrive as the new
            // user message, and the LLM will call continue_walk({ titleHint: 'Walk A' }).
            setHistory((prev) => [
              ...prev,
              { role: 'user' as const,      content: text },
              { role: 'assistant' as const, content: args.prompt! },
            ]);
            setResponse(args.prompt);
            setStreamingResponse('');
            await playTTS(args.prompt, false);
            return;
          }

          if (args.route) {
            // Speak any brief LLM confirmation text first, then navigate
            if (fullResponse.trim()) {
              setResponse(fullResponse);
              setStreamingResponse('');
              await playTTS(fullResponse, false);
              if (cancelledRef.current) return;
            }
            const navFn = navigateRef.current ?? providerNavigateRef.current;
            console.log('[VOICE]', JSON.stringify({ continueWalkRoute: args.route, hasFn: !!navFn }));
            if (navFn) {
              navFn(args.route);
            } else {
              window.history.pushState({}, '', args.route);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
            if (!fullResponse.trim()) {
              autoRestartTimerRef.current = setTimeout(() => {
                autoRestartTimerRef.current = null;
                if (!cancelledRef.current && !pausedRef.current) startListening();
              }, 1200);
            }
          }
          return;
        }

        if (tc.tool === 'search_sermons') {
          // Server resolved the search and returned a TTS-ready sentence + optional route.
          const args = tc.args as { spokenText: string; navigateRoute?: string };
          setResponse(args.spokenText);
          setStreamingResponse('');
          await playTTS(args.spokenText, false);
          if (cancelledRef.current) return;
          // Navigate to the search results page (e.g. /discover?q=faith)
          if (args.navigateRoute) {
            const navFn = navigateRef.current ?? providerNavigateRef.current;
            if (navFn) {
              navFn(args.navigateRoute);
            } else {
              window.history.pushState({}, '', args.navigateRoute);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }
          // playTTS onended will restart listening automatically
          return;
        }
      }

      // ── No tool — pure conversational response ────────────────────────────────
      if (!fullResponse.trim()) { setVoiceState('READY'); return; }
      setResponse(fullResponse);
      setStreamingResponse('');

      // If sentence streaming was used (sentences arrived during the LLM stream),
      // await the drain promise — playback already started on the first sentence,
      // so the user has been hearing Emmaus speak since ~1-2 s after they spoke.
      // The last sentence's playTTS onended handler will schedule the mic restart.
      //
      // DOUBLE-SPEAK GUARD: sentenceEverEnqueued is the authoritative flag for
      // "at least one sentence was enqueued".  It is set before the drain loop
      // starts and is never cleared, so it remains true even after drainPromise
      // resolves — unlike sentenceQueueActive which serves the same purpose but
      // could in principle be confused with a "drain loop already exited" state.
      // Only take the fallback branch when NO sentence ever arrived; in that
      // case the full response is guaranteed to be unplayed.
      if (sentenceEverEnqueued && drainPromise) {
        // Drain loop already started (and may have already resolved); awaiting
        // a resolved promise is a no-op, so this is safe in all timings.
        await drainPromise;
      } else {
        // No sentence events arrived from the server (e.g. empty sentenceBuf at
        // finishReason==='stop' after flushSentences already consumed all text,
        // or a tool-call-only response that produced no delta.content at all —
        // which should be unreachable here because hadToolCall routes above).
        // Speak the full response exactly once.
        await playTTS(fullResponse, false);
      }

    } catch (err) {
      if (cancelledRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Tap to try again.');
      setVoiceState('ERROR');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // stable — reads all dynamic values from refs

  // Keep the stable ref up to date
  useEffect(() => { processAudioBlobRef.current = processAudioBlob; }, [processAudioBlob]);

  // ─── navigate ref (set by VoiceMode when mounted, survives unmount) ────────
  // Since the session outlives VoiceMode, we need a way to navigate from
  // processAudioBlob after the view has unmounted (e.g. "Open My Bible" while
  // on a different screen is impossible — but navigate commands only fire when
  // the user is actively speaking, so VoiceMode is likely the current route).
  // We store the navigate function so it's always current.
  const navigateRef = useRef<((to: string) => void) | null>(null);

  /** Called by VoiceMode on mount/update to register the current navigate fn. */
  const registerNavigate = useCallback((fn: (to: string) => void) => {
    navigateRef.current = fn;
  }, []);

  // ─── Opening greeting ─────────────────────────────────────────────────────
  /**
   * Play a short personalised greeting when a session opens, then start listening.
   * Reads from refs so it is safe to call from inside a useCallback closure.
   * Silently skips to listening if TTS fails or autoplay is blocked.
   */
  async function playGreeting(text: string): Promise<void> {
    if (cancelledRef.current) return;
    const uid = userRef.current?.id;
    if (!uid) { startListening(); return; }
    setVoiceState('SPEAKING');
    try {
      const result = await streamSpeechToAudio(text, uid);
      if (cancelledRef.current) { result.dispose(); return; }
      audioElRef.current      = result.audio;
      disposeAudioRef.current = result.dispose;
      setHasAudioElement(true);
      await new Promise<void>((resolve) => {
        result.audio.onended = () => { stopAudioElement(); resolve(); };
        result.audio.onerror = () => { stopAudioElement(); resolve(); };
        result.audio.play().catch(() => {
          // Autoplay blocked (browser policy) — skip greeting silently.
          stopAudioElement(); resolve();
        });
      });
    } catch {
      // TTS unavailable — just skip to listening.
      stopAudioElement();
    }
    if (!cancelledRef.current) startListening();
  }

  // ─── Session lifecycle ────────────────────────────────────────────────────

  const startSession = useCallback((context?: FlatContext) => {
    cancelledRef.current = false;
    pausedRef.current    = false;
    setIsActive(true);
    setSessionPaused(false);
    setVoiceState('READY');
    setTranscript('');
    setResponse('');
    setStreamingResponse('');
    setErrorMsg(null);
    setTtsError(false);
    setAutoplayBlocked(false);
    setActiveContent(null);
    if (context) {
      setInitContext(context);
      initContextRef.current = context;
    }
    // Fetch fresh app context, then speak an opening greeting.
    // The greeting tells the user what's available today so they don't
    // need to know exact content names before they say their first command.
    const uid = userRef.current?.id;
    if (uid) {
      fetchVoiceContext(uid).then((ctx) => {
        if (!ctx || cancelledRef.current) {
          // No context — start listening straight away.
          if (!cancelledRef.current) startListening();
          return;
        }
        appContextRef.current = ctx;
        const greetingText = buildOpeningGreeting(ctx, userRef.current?.preferredName);
        if (greetingText) {
          playGreeting(greetingText);
        } else {
          startListening();
        }
      }).catch(() => {
        if (!cancelledRef.current) startListening();
      });
    } else {
      startListening();
    }
    setupMediaSessionHandlers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endSession = useCallback(() => {
    console.log('[VOICE STOP TRACE]', JSON.stringify({
      tapReceived:   true,
      recorderActive: Boolean(recorderRef.current),
      ttsActive:     Boolean(audioElRef.current),
      timerPending:  Boolean(autoRestartTimerRef.current),
      sessionEnded:  true,
    }));
    cancelledRef.current = true;
    pausedRef.current    = false;
    cleanupAll();
    setIsActive(false);
    setSessionPaused(false);
    setVoiceState('READY');
    setTranscript('');
    setResponse('');
    setStreamingResponse('');
    setErrorMsg(null);
    setTtsError(false);
    setAutoplayBlocked(false);
    setActiveContent(null);
    setConvId(null);
    setHistory([]);
    setInitContext(null);
    isReadingRef.current       = false;
    readingPausedRef.current   = false;
    bibleContextRef.current    = null;
    readingSectionsRef.current = [];
    readingIndexRef.current    = 0;
    appContextRef.current      = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pauseSession = useCallback(() => {
    if (!isActive) return;
    pausedRef.current = true;
    setSessionPaused(true);
    cancelAutoRestart();
    // Stop mic; preserve all session state
    cancelRecorder();
    setVoiceState('READY');
    try { navigator.mediaSession.playbackState = 'paused'; } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const resumeSession = useCallback(() => {
    if (!isActive) return;
    pausedRef.current = false;
    setSessionPaused(false);
    startListening();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const updateVisualContext = useCallback((ctx: FlatContext) => {
    setInitContext(ctx);
    initContextRef.current = ctx;
  }, []);

  // ─── Route change — refresh app context ──────────────────────────────────
  // When the user navigates while Voice is active, refresh the voice context
  // so "what's on this page?" is always accurate. Debounced to avoid hammering.

  const contextRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive) return;
    const uid = userRef.current?.id;
    if (!uid) return;

    // Debounce by 800ms so rapid nav taps don't spam the API
    if (contextRefreshTimerRef.current) clearTimeout(contextRefreshTimerRef.current);
    contextRefreshTimerRef.current = setTimeout(() => {
      fetchVoiceContext(uid).then((ctx) => { if (ctx) appContextRef.current = ctx; });
    }, 800);

    return () => {
      if (contextRefreshTimerRef.current) clearTimeout(contextRefreshTimerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location, isActive]);

  // ─── Page visibility handling ─────────────────────────────────────────────
  // When the browser tab is hidden: preserve session, don't destroy.
  // When it becomes visible again: if session is active and paused/ready, optionally resume.

  useEffect(() => {
    function handleVisibilityChange() {
      if (!isActive) return;
      if (document.hidden) {
        // Tab backgrounded — audio may continue (browser-dependent).
        // If the recorder is running, the OS may suspend it. We keep session state
        // but can't guarantee mic continues (browser security restriction).
        // No action needed — the session is preserved.
      } else {
        // Tab restored — if we were in an error or forced stop, reset to READY
        // so the user can tap to continue without ending the session.
        if (voiceState === 'ERROR') setVoiceState('READY');
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isActive, voiceState]);

  // ─── Orb tap ──────────────────────────────────────────────────────────────

  const handleOrbTap = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        if (!playbackAcRef.current || playbackAcRef.current.state === 'closed') {
          playbackAcRef.current = new Ctx();
        }
        playbackAcRef.current.resume().catch(() => {});
      }
    } catch { /* ignore */ }

    cancelAutoRestart();
    setSessionPaused(false);

    if (autoplayBlocked) stopAudio();

    switch (voiceState) {
      case 'READY':
      case 'ERROR':
        setErrorMsg(null);
        startListening();
        break;
      case 'LISTENING':
        stopListening();
        break;
      case 'SPEAKING':
        stopAudio();
        setStreamingResponse('');
        startListening();
        break;
      case 'THINKING':
        break;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceState, autoplayBlocked]);

  // ─── Tap-to-play fallback ─────────────────────────────────────────────────

  const handleTapToHear = useCallback(() => {
    const audio = audioElRef.current;
    if (!audio) return;
    setAutoplayBlocked(false);
    setVoiceState('SPEAKING');
    audio.onended = () => {
      stopAudio();
      autoRestartTimerRef.current = setTimeout(() => {
        autoRestartTimerRef.current = null;
        if (!cancelledRef.current) startListening();
      }, 600);
    };
    audio.onerror = () => { stopAudio(); setVoiceState('READY'); };
    audio.play().catch(() => { stopAudio(); setVoiceState('READY'); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Retry audio ──────────────────────────────────────────────────────────

  const handleRetryAudio = useCallback(async () => {
    const user = userRef.current;
    if (!user || !response) return;
    setTtsError(false);
    setVoiceState('SPEAKING');
    try {
      const { audio, dispose } = await streamSpeechToAudio(response, user.id);
      if (cancelledRef.current) { dispose(); return; }
      audioElRef.current      = audio;
      disposeAudioRef.current = dispose;
      setHasAudioElement(true);
      audio.onended = () => {
        stopAudio();
        autoRestartTimerRef.current = setTimeout(() => {
          autoRestartTimerRef.current = null;
          if (!cancelledRef.current) startListening();
        }, 600);
      };
      audio.onerror = () => { stopAudio(); setVoiceState('READY'); };
      audio.play().catch(() => { stopAudio(); setVoiceState('READY'); });
    } catch {
      setTtsError(true);
      setVoiceState('READY');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [response]);

  // ─── Context value ────────────────────────────────────────────────────────

  const value: VoiceSessionContextType = {
    isActive,
    sessionPaused,
    voiceState,
    transcript,
    response,
    streamingResponse,
    errorMsg,
    ttsError,
    convId,
    history,
    initContext,
    autoplayBlocked,
    showHistory,
    activeContent,
    hasAudioElement,
    startSession,
    endSession,
    pauseSession,
    resumeSession,
    handleOrbTap,
    handleTapToHear,
    handleRetryAudio,
    setShowHistory,
    updateVisualContext,
    registerNavigate,
  };

  return (
    <VoiceSessionContext.Provider value={value}>
      {children}
    </VoiceSessionContext.Provider>
  );
}
