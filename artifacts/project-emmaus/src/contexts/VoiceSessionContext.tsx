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
  startConversation,
  appendMessage,
  type SseDoneEvent,
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

  function stopAudio() {
    stopInterruptMonitor();
    audioElRef.current?.pause();
    audioElRef.current = null;
    setHasAudioElement(false);
    disposeAudioRef.current?.();
    disposeAudioRef.current = null;
    setAutoplayBlocked(false);
    setTtsError(false);
    // Clear Media Session state when audio stops
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = 'none'; } catch { /* ignore */ }
    }
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
      // Wait 3 s before starting to poll.  TTS audio plays through the device
      // speaker and immediately bleeds back into the mic — polling too early
      // captures TTS output and fires a false interrupt.  3 s gives the audio
      // system time for AEC (echo cancellation) to lock on before we look for
      // intentional user speech.
      const monitorStartTime = Date.now();
      const MONITOR_STARTUP_DELAY_MS = 3000;

      intIntervalRef.current = setInterval(() => {
        // Don't evaluate anything until the startup window has passed
        if (Date.now() - monitorStartTime < MONITOR_STARTUP_DELAY_MS) return;

        const a = intAnalyserRef.current;
        if (!a) return;
        a.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;

        // Threshold 40 and gate 1500 ms were stable before and are intentional.
        // Lower values (e.g. 25 / 700 ms) caused TTS bleed to trigger the
        // interrupt within the first second of every response — do NOT lower them.
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
          } else if (Date.now() - intSpeechStartRef.current > 1500) {
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
          const VAD_THRESHOLD     = 35;  // avg freq bin — was 18, too low
          const VAD_MIN_ELAPSED   = 1500; // ms before silence-gate can fire
          const VAD_SILENCE_GATE  = 2000; // ms of silence after speech to stop

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
              // Require at least 5 consecutive above-threshold ticks (~500 ms)
              // before marking speech as started — prevents a single loud noise
              // from locking vadSpokenRef to true.
              if (vadAboveCount >= 5) {
                vadSpokenRef.current       = true;
                vadSilenceStartRef.current = null;
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
            } else if (Date.now() - vadSilenceStartRef.current > 2000) {
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
    const convId      = convIdRef.current;
    const history     = historyRef.current;
    const initContext = initContextRef.current;

    if (!user || cancelledRef.current) return;

    // ── Inner helpers (same as Phases 1–3) ────────────────────────────────

    async function playTTS(ttsText: string, isReadingSection: boolean): Promise<void> {
      if (cancelledRef.current) return;
      setVoiceState('SPEAKING');

      let ttsAudio: HTMLAudioElement;
      try {
        const result = await streamSpeechToAudio(ttsText, user!.id);
        if (cancelledRef.current) { result.dispose(); return; }
        ttsAudio                = result.audio;
        audioElRef.current      = result.audio;
        disposeAudioRef.current = result.dispose;
        setHasAudioElement(true);
      } catch {
        if (!cancelledRef.current) { setTtsError(true); setVoiceState('READY'); }
        return;
      }

      startInterruptMonitor((capture) => {
        stopAudio();
        setStreamingResponse('');
        startListeningFromCapture(capture);
      });

      await new Promise<void>((resolve) => {
        ttsAudio.onended = () => {
          if (audioElRef.current !== ttsAudio) { resolve(); return; }
          stopAudio();
          if (!cancelledRef.current) {
            setVoiceState('READY');
            // Delay before reopening the mic:
            //   • Conversation: 2500 ms — gives room reverb / speaker echo time
            //     to decay so the VAD doesn't immediately see "speech" from the
            //     tail of Emmaus's response.
            //   • Reading section: 1500 ms — shorter pause between sections.
            // Do NOT reduce these below ~1500 ms without retesting on device.
            autoRestartTimerRef.current = setTimeout(() => {
              autoRestartTimerRef.current = null;
              if (!cancelledRef.current && !pausedRef.current) startListening();
            }, isReadingSection ? 1500 : 2500);
          }
          resolve();
        };
        ttsAudio.onerror = () => {
          if (audioElRef.current !== ttsAudio) { resolve(); return; }
          stopAudio();
          setVoiceState('READY');
          resolve();
        };
        ttsAudio.play().catch((err: unknown) => {
          const blocked =
            err instanceof DOMException &&
            (err.name === 'NotAllowedError' || err.name === 'AbortError');
          if (blocked) { setAutoplayBlocked(true); setVoiceState('READY'); }
          else          { stopAudio();             setVoiceState('READY'); }
          resolve();
        });
      });
    }

    async function playReadingSection(section: { label: string; text: string } | undefined): Promise<void> {
      if (!section || cancelledRef.current) return;
      setActiveContent({ label: section.label });
      updateMediaSession(section.label, 'playing');
      await playTTS(section.text, true);
    }

    async function advanceReading(): Promise<void> {
      const sections = readingSectionsRef.current;
      const next = readingIndexRef.current + 1;
      if (!sections.length || next >= sections.length) {
        isReadingRef.current = false;
        setActiveContent(null);
        setVoiceState('READY');
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

      if (appCtx?.todaysSummary && appCtx.todaysSummary !== 'No active content today.') {
        parts.push(`User's active content today: ${appCtx.todaysSummary}`);
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

    // ── Main pipeline ─────────────────────────────────────────────────────────

    setVoiceState('THINKING');

    try {
      const audioBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
      const text = await transcribeAudio(audioBlob, user.id);
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
      // Captures the full dispatch path so physical-device tests can confirm:
      //   transcript → classifiedIntent → dispatcher → action executor
      const _isDeterministic = (
        intent.type === 'navigate' || intent.type === 'read-content' ||
        intent.type === 'reading-command' || intent.type === 'continue-walk' ||
        intent.type === 'continue-reading' || intent.type === 'get-steps'
      );
      console.log('[VOICE ACTION TRACE]', JSON.stringify({
        transcript:        text,
        classifiedIntent:  intent.type,
        confidence:        _isDeterministic ? 'deterministic' : 'conversational',
        actionType:        _isDeterministic ? intent.type : 'converse',
        contentType:       intent.type === 'read-content' ? (intent as { content: string }).content : null,
        titleHint:         intent.type === 'read-content' ? ((intent as { titleHint?: string }).titleHint ?? null) : null,
        navigationTarget:  intent.type === 'navigate' ? (intent as { target: string }).target : null,
        dispatcherMatched: _isDeterministic,
        fallbackTriggered: !_isDeterministic,
        fallbackReason:    !_isDeterministic ? 'conversational_intent_or_no_pattern_match' : null,
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
          walk: '/walk', bible: '/walk/bible', discover: '/discover', journeys: '/journeys',
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

      // ── Read content ─────────────────────────────────────────────────────────
      if (intent.type === 'read-content') {
        const started = await loadAndStartReading(intent.content, intent.bibleRef, intent.titleHint);
        console.log('[VOICE]', JSON.stringify({ contentResolved: started, readingStarted: started, contentType: intent.content, titleHint: intent.titleHint ?? null }));
        if (started) return;

        // Do NOT fall through to Ask Emmaus when a deterministic read intent was
        // recognised but content couldn't be loaded.  Speak a specific error so
        // the user understands what happened.  This prevents the AI from saying
        // "I cannot directly read Scripture" (which is both wrong and confusing).
        // Note: the 'devotional' disambiguation (multiple active) is handled inside
        // loadAndStartReading via playTTS — so the error below only fires when
        // content is genuinely absent or empty.
        let errMsg: string;
        if (intent.content === 'bible') {
          const ref = intent.bibleRef;
          if (ref) {
            errMsg = `I wasn't able to load ${ref.bookName} chapter ${ref.chapter} right now. You can read it in My Bible — just tap the book icon.`;
          } else {
            errMsg = `I don't have a Bible passage loaded for context. Try saying "Read John 3" to request a specific chapter.`;
          }
        } else if (intent.content === 'daily-rhythm') {
          errMsg = `I couldn't find your active Daily Rhythm content. Check Today's Steps on your Walk screen to see what's available.`;
        } else if (intent.content === 'devotional') {
          errMsg = `I couldn't find an active devotional to read right now. Check Today's Steps on your Walk screen.`;
        } else if (intent.content === 'sermon-companion') {
          errMsg = `I couldn't find an active Sermon Companion to read. Your companion appears in Today's Steps once it's available.`;
        } else {
          errMsg = `I wasn't able to load that content right now.`;
        }

        setResponse(errMsg);
        setStreamingResponse('');
        await playTTS(errMsg, false);
        return;
      }

      // ── Continue walk ────────────────────────────────────────────────────────
      if (intent.type === 'continue-walk') {
        const walks = appContextRef.current?.activeWalks ?? [];
        const match = intent.hint
          ? walks.find((w) => w.title.toLowerCase().includes(intent.hint!.toLowerCase()))
          : null;
        const target = match ?? (walks.length === 1 ? walks[0] : null);
        if (target) {
          navigateRef.current?.(`/journey/${target.journeyId}/day/${target.currentDay}`);
          return;
        }
      }

      // ── Continue reading ─────────────────────────────────────────────────────
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

      // ── Ask Emmaus ───────────────────────────────────────────────────────────
      const context = buildEmmausContext(intent);

      let fullResponse = '';
      let latestConvId = convId;

      await new Promise<void>((resolve, reject) => {
        const callbacks = {
          onText: (chunk: string) => {
            if (cancelledRef.current) { abortRef.current?.(); return; }
            fullResponse += chunk;
            setStreamingResponse(fullResponse);
          },
          onDone: (payload: SseDoneEvent) => {
            latestConvId = payload.conversationId;
            if (!cancelledRef.current) {
              setConvId(payload.conversationId);
              setHistory((prev) => [
                ...prev,
                { role: 'user' as const,      content: text },
                { role: 'assistant' as const, content: fullResponse },
              ]);
            }
            resolve();
          },
          onError: (msg: string) => reject(new Error(msg)),
        };

        const handle = latestConvId
          ? appendMessage({ userId: user.id, conversationId: latestConvId, message: text, context, history, callbacks })
          : startConversation({ userId: user.id, message: text, context, history, callbacks });

        abortRef.current = handle.abort;
      });

      abortRef.current = null;
      if (cancelledRef.current) return;
      if (!fullResponse.trim()) { setVoiceState('READY'); return; }

      setResponse(fullResponse);
      setStreamingResponse('');
      await playTTS(fullResponse, false);

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
    // Fetch fresh app context for the new session
    const uid = userRef.current?.id;
    if (uid) {
      fetchVoiceContext(uid).then((ctx) => { if (ctx) appContextRef.current = ctx; });
    }
    setupMediaSessionHandlers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const endSession = useCallback(() => {
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
