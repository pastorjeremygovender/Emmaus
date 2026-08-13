/**
 * VoiceMode — Full-screen voice interface for Ask Emmaus.
 * Phase 2: Continuous hands-free conversation.
 *
 * Route: /personal/ask-emmaus/voice
 *
 * Conversation loop (auto-restart):
 *   READY → (tap orb) → LISTENING → THINKING → SPEAKING
 *                ↑                                    |
 *                └──── auto-restart after 600 ms ────┘
 *
 * The user never needs to tap the mic after an Emmaus response.
 * Tap the orb to interrupt Emmaus at any time.
 * Tap "End" to leave Voice Mode.
 *
 * Emmaus cannot hear itself: the mic stream is closed inside
 * recorder.onstop (via stopVisualizer) BEFORE the TTS pipeline
 * runs — it is not reopened until audio.onended fires.
 *
 * Architecture: Voice is an interface to Emmaus, not a separate AI.
 * Transcripts feed the existing Ask Emmaus SSE pipeline, and the
 * same conversation ID / history array is used throughout.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  Mic,
  Square,
  Loader2,
  Volume2,
  MessageSquare,
  X,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVoiceEnabled } from '@/hooks/useVoiceEnabled';
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
import { cn } from '@/lib/utils';
import { fetchVoiceContext, type VoiceAppContext } from '@/lib/voice-context';
import { resolveIntent, type VoiceIntent } from '@/lib/voice-intent';

// ─── State machine ─────────────────────────────────────────────────────────────

type VoiceState = 'READY' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

/** Snapshot handed from the interrupt monitor to startListeningFromCapture. */
interface InterruptCapture {
  recorder: MediaRecorder | null;
  chunks:   Blob[];
  stream:   MediaStream | null;
  mimeType: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function VoiceMode() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const voiceEnabled = useVoiceEnabled(user?.id);

  // ── Voice state ──────────────────────────────────────────────────────────
  const [voiceState, setVoiceState]               = useState<VoiceState>('READY');
  const [transcript, setTranscript]               = useState('');
  const [response, setResponse]                   = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [errorMsg, setErrorMsg]                   = useState<string | null>(null);
  const [ttsError, setTtsError]                   = useState(false);

  // ── Conversation context (preserved across all turns) ───────────────────
  const [convId, setConvId]           = useState<string | null>(null);
  const [history, setHistory]         = useState<HistoryItem[]>([]);
  const [initContext, setInitContext] = useState<FlatContext | null>(null);

  // ── UI ───────────────────────────────────────────────────────────────────
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [showHistory, setShowHistory]         = useState(false);
  // Phase 3: label shown when Voice is reading content (e.g. "John 3" or "Day 12")
  const [activeContent, setActiveContent]     = useState<{ label: string } | null>(null);

  // ── Refs (stable across renders) ─────────────────────────────────────────
  const recorderRef         = useRef<MediaRecorder | null>(null);
  const chunksRef           = useRef<Blob[]>([]);
  const streamRef           = useRef<MediaStream | null>(null);
  const abortRef            = useRef<(() => void) | null>(null);
  const audioElRef          = useRef<HTMLAudioElement | null>(null);
  // Cleanup fn for the MediaSource / blob URL backing the current audio element
  const disposeAudioRef     = useRef<(() => void) | null>(null);
  // Pre-resumed during mic gesture to unlock mobile audio autoplay
  const playbackAcRef       = useRef<AudioContext | null>(null);
  // Set true on unmount so the async pipeline short-circuits everywhere
  const cancelledRef        = useRef(false);
  // Phase 2: tracks the 600 ms delay between speaking and re-listening
  const autoRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // VAD (Voice Activity Detection) — auto-stop while recording
  const vadAcRef            = useRef<AudioContext | null>(null);
  const analyserRef         = useRef<AnalyserNode | null>(null);
  const vadIntervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const vadSilenceStartRef  = useRef<number | null>(null);
  // true once the user's voice has crossed the speech threshold
  const vadSpokenRef        = useRef(false);
  const recordingStartRef   = useRef<number>(0);
  // Phase 3: app context fetched once at session start from /api/voice/context
  const appContextRef      = useRef<VoiceAppContext | null>(null);
  // Current Bible reading position — persists across turns so follow-up questions work
  const bibleContextRef    = useRef<{ bookId: string; chapter: number } | null>(null);
  // Active reading session (section list + cursor)
  const readingSectionsRef = useRef<{ label: string; text: string }[]>([]);
  const readingIndexRef    = useRef(0);
  const isReadingRef       = useRef(false);
  const readingPausedRef   = useRef(false);
  // Interrupt monitor — mic-only stream + analyser that listens for the user's
  // voice while Emmaus is speaking so the conversation stays hands-free.
  // A MediaRecorder starts on the stream the MOMENT energy is first detected so
  // the interrupted user's words are captured even before the interrupt fires.
  const intStreamRef        = useRef<MediaStream | null>(null);
  const intAcRef            = useRef<AudioContext | null>(null);
  const intAnalyserRef      = useRef<AnalyserNode | null>(null);
  const intIntervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const intSpeechStartRef   = useRef<number | null>(null);
  const intRecorderRef      = useRef<MediaRecorder | null>(null);
  const intChunksRef        = useRef<Blob[]>([]);
  const intMimeTypeRef      = useRef<string>('');

  // ─── Mount / unmount ──────────────────────────────────────────────────────

  useEffect(() => {
    cancelledRef.current = false;
    const pending = takePendingContext();
    if (pending?.context) setInitContext(pending.context);
    return () => {
      cancelledRef.current = true;
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Phase 3: fetch app context (what's active today) once at session start.
  // Used by the reading engine and Emmaus context enrichment.
  useEffect(() => {
    if (!user?.id) return;
    fetchVoiceContext(user.id).then((ctx) => {
      if (ctx) appContextRef.current = ctx;
    });
  }, [user?.id]);

  // ─── Cleanup helpers ──────────────────────────────────────────────────────

  function cancelAutoRestart() {
    if (autoRestartTimerRef.current) {
      clearTimeout(autoRestartTimerRef.current);
      autoRestartTimerRef.current = null;
    }
  }

  /**
   * startInterruptMonitor — opens a monitoring-only mic stream while Emmaus is
   * speaking so the conversation is completely hands-free.
   *
   * Design:
   *   • Energy threshold 40/255 — higher than VAD (18/255) so speaker bleed and
   *     ambient noise don't trigger a false interrupt.
   *   • The MOMENT energy first crosses the threshold a MediaRecorder is started
   *     on the stream, so the user's words are captured from the very beginning.
   *   • If energy drops before 1 500 ms the partial recording is discarded.
   *   • If energy is sustained for 1 500 ms the interrupt fires: the monitor
   *     tears itself down and hands the pre-recorded data to onInterrupt so
   *     no words are lost.
   */
  async function startInterruptMonitor(onInterrupt: (capture: InterruptCapture) => void) {
    if (intStreamRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (cancelledRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }

      intStreamRef.current = stream;

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) { stopInterruptMonitor(); return; }

      const ac = new Ctx();
      const source = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      intAcRef.current      = ac;
      intAnalyserRef.current = analyser;
      intSpeechStartRef.current = null;

      const mimeType = getSupportedMimeType();
      intMimeTypeRef.current = mimeType;

      const data = new Uint8Array(analyser.frequencyBinCount);
      intIntervalRef.current = setInterval(() => {
        const a = intAnalyserRef.current;
        if (!a) return;
        a.getByteFrequencyData(data);
        const avg = data.reduce((s, v) => s + v, 0) / data.length;

        if (avg > 40) {
          if (intSpeechStartRef.current === null) {
            // ── First energy peak ──────────────────────────────────────────
            // Start recording immediately so these words are captured even if
            // the interrupt fires 1.5 s later.
            intSpeechStartRef.current = Date.now();
            const opts: MediaRecorderOptions = mimeType ? { mimeType } : {};
            try {
              const rec = new MediaRecorder(intStreamRef.current!, opts);
              intChunksRef.current = [];
              rec.ondataavailable = (e) => {
                if (e.data.size > 0) intChunksRef.current.push(e.data);
              };
              rec.start(200);
              intRecorderRef.current = rec;
            } catch { /* recorder unavailable — interrupt will still fire by time */ }

          } else if (Date.now() - intSpeechStartRef.current > 1500) {
            // ── 1.5 s of sustained speech — fire the interrupt ─────────────
            // Tear down the monitoring layer but hand the recorder + stream to
            // the interrupt handler so the captured audio can be transcribed.
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
            // Null the refs so stopInterruptMonitor() called from stopAudio() is a no-op
            intRecorderRef.current = null;
            intChunksRef.current   = [];
            intStreamRef.current   = null;

            onInterrupt(capture);
          }
        } else {
          // ── Energy dropped — discard the partial pre-recording ─────────────
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
    } catch { /* mic denied or not available — skip interrupt monitor */ }
  }

  /** stopInterruptMonitor — tears down the monitoring stream and any partial
   *  pre-recording. Safe to call multiple times. */
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

  /**
   * clearVAD — stops the polling interval and closes the AudioContext used for
   * Voice Activity Detection. Safe to call multiple times.
   */
  function clearVAD() {
    if (vadIntervalRef.current) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    analyserRef.current    = null;
    vadSilenceStartRef.current = null;
    vadSpokenRef.current   = false;
    vadAcRef.current?.close().catch(() => {});
    vadAcRef.current = null;
  }

  function stopAudio() {
    stopInterruptMonitor();
    audioElRef.current?.pause();
    audioElRef.current = null;
    disposeAudioRef.current?.();
    disposeAudioRef.current = null;
    setAutoplayBlocked(false);
    setTtsError(false);
  }

  /**
   * stopMicStream — closes the mic tracks so Emmaus cannot accidentally
   * transcribe its own TTS output. Called inside recorder.onstop, before
   * the async TTS pipeline begins.
   */
  function stopMicStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  /**
   * stopRecorder — user-initiated (or VAD-triggered): keeps onstop intact so
   * processAudioBlob fires.
   */
  function stopRecorder() {
    clearVAD();
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
  }

  /**
   * cancelRecorder — unmount/interrupt: nulls onstop BEFORE stopping so the
   * pipeline never triggers after navigation or interruption.
   */
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

  function cleanupAll() {
    cancelAutoRestart();
    clearVAD();
    stopAudio();
    cancelRecorder();
    abortRef.current?.();
    abortRef.current = null;
    playbackAcRef.current?.close().catch(() => {});
    playbackAcRef.current = null;
  }

  // ─── Recording ────────────────────────────────────────────────────────────

  async function startListening() {
    setErrorMsg(null);
    setTranscript('');
    setTtsError(false);

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Guard: user may have navigated away while the permission prompt was open
      if (cancelledRef.current) {
        mediaStream.getTracks().forEach((t) => t.stop());
        return;
      }

      streamRef.current = mediaStream;

      const mimeType = getSupportedMimeType();
      const opts: MediaRecorderOptions = mimeType ? { mimeType } : {};
      const recorder = new MediaRecorder(mediaStream, opts);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // CRITICAL: close the mic stream BEFORE the TTS pipeline starts.
        // This prevents Emmaus from transcribing its own voice output.
        stopMicStream();
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
        chunksRef.current = [];
        await processAudioBlob(blob, mimeType || 'audio/webm');
      };

      recorder.start(200); // 200 ms chunks
      recordingStartRef.current = Date.now();

      // ── Voice Activity Detection ───────────────────────────────────────
      // Uses an AnalyserNode to measure mic volume every 100 ms. After the
      // user has clearly spoken (volume > SPEECH_THRESHOLD) and then gone
      // quiet for SILENCE_MS, recording is automatically stopped — no tap needed.
      //
      // Thresholds (out of 255):
      //   SPEECH_THRESHOLD 18 — minimum average frequency energy to count as speech
      //   SILENCE_THRESHOLD 12 — below this is considered silence
      //   MIN_SPEECH_MS 600  — ignore silence in the first 600 ms
      //   SILENCE_MS 1500    — 1.5 s of continuous quiet triggers auto-stop
      try {
        const Ctx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctx) {
          const ac = new Ctx();
          const source = ac.createMediaStreamSource(mediaStream);
          const analyser = ac.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          vadAcRef.current    = ac;
          analyserRef.current = analyser;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);

          vadIntervalRef.current = setInterval(() => {
            const a = analyserRef.current;
            if (!a) return;
            a.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
            const elapsed = Date.now() - recordingStartRef.current;

            if (avg > 18) {
              // Active speech — reset silence timer
              vadSpokenRef.current      = true;
              vadSilenceStartRef.current = null;
            } else if (vadSpokenRef.current && elapsed > 600) {
              // Below silence threshold after user has spoken and min time passed
              if (vadSilenceStartRef.current === null) {
                vadSilenceStartRef.current = Date.now();
              } else if (Date.now() - vadSilenceStartRef.current > 1500) {
                // 1.5 s of quiet — auto-stop (clearVAD is called inside stopRecorder)
                stopRecorder();
                setVoiceState('THINKING');
              }
            }
          }, 100);
        }
      } catch { /* VAD not supported — user taps manually */ }

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
    stopRecorder(); // → triggers recorder.onstop → processAudioBlob
    setVoiceState('THINKING');
  }

  /**
   * startListeningFromCapture — starts a real recording turn using audio that
   * was already captured by the interrupt monitor before the interrupt fired.
   *
   * The recorder in `capture` has been running since the first energy peak
   * (up to 1.5 s before this call), so the user's words from the very start
   * of their sentence are already in `capture.chunks`.  We re-attach the
   * pipeline onstop handler, spin up VAD for auto-stop, and set state to
   * LISTENING — the user is already mid-sentence.
   */
  function startListeningFromCapture(capture: InterruptCapture) {
    const { recorder, chunks, stream, mimeType } = capture;

    setErrorMsg(null);
    setTranscript('');
    setTtsError(false);
    cancelAutoRestart();

    if (!stream) {
      // Stream was unexpectedly lost — fall back to a fresh getUserMedia call
      startListening();
      return;
    }

    streamRef.current       = stream;
    chunksRef.current       = chunks;
    recordingStartRef.current = Date.now();

    // Re-use the pre-started recorder if it's still recording; otherwise start
    // a fresh one on the existing stream (mic permission is already granted).
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
      await processAudioBlob(blob, mimeType || 'audio/webm');
    };

    recorderRef.current = rec;
    setVoiceState('LISTENING');

    // Attach VAD — vadSpokenRef starts true since the user was already speaking
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        const ac = new Ctx();
        const source = ac.createMediaStreamSource(stream);
        const analyser = ac.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        vadAcRef.current          = ac;
        analyserRef.current       = analyser;
        vadSilenceStartRef.current = null;
        vadSpokenRef.current      = true; // already mid-sentence when interrupt fired

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        vadIntervalRef.current = setInterval(() => {
          const a = analyserRef.current;
          if (!a) return;
          a.getByteFrequencyData(dataArray);
          const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
          const elapsed = Date.now() - recordingStartRef.current;
          if (avg > 18) {
            vadSilenceStartRef.current = null;
          } else if (elapsed > 600) {
            if (vadSilenceStartRef.current === null) {
              vadSilenceStartRef.current = Date.now();
            } else if (Date.now() - vadSilenceStartRef.current > 1500) {
              clearVAD();
              stopRecorder();
              setVoiceState('THINKING');
            }
          }
        }, 100);
      }
    } catch { /* VAD unavailable — user taps the orb to stop */ }
  }

  // ─── Audio processing pipeline ────────────────────────────────────────────

  const processAudioBlob = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (!user || cancelledRef.current) return;

      // ─── Phase 3: Inner helpers ──────────────────────────────────────────────
      // Defined at the top of the callback so they can be called anywhere below.
      // These close over `user`, `convId`, `history`, `initContext` from the
      // useCallback deps — they always see the values from the current render.

      /**
       * playTTS — stream text to speech and wait for it to finish.
       *
       * Uses the same MediaSource pipeline as Phase 2.  Starts the interrupt
       * monitor so the user can speak at any time to take over.
       *
       * @param ttsText         Text to synthesise.
       * @param isReadingSection  When true uses an 800 ms post-playback pause
       *                          (reading feels more natural than conversation).
       */
      async function playTTS(ttsText: string, isReadingSection: boolean): Promise<void> {
        if (cancelledRef.current) return;
        setVoiceState('SPEAKING');

        let ttsAudio: HTMLAudioElement;
        try {
          const result = await streamSpeechToAudio(ttsText, user.id);
          if (cancelledRef.current) { result.dispose(); return; }
          ttsAudio                = result.audio;
          audioElRef.current      = result.audio;
          disposeAudioRef.current = result.dispose;
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
            // Guard: if audio was already cleaned up (e.g. by interrupt), just resolve
            if (audioElRef.current !== ttsAudio) { resolve(); return; }
            stopAudio();
            if (!cancelledRef.current) {
              setVoiceState('READY');
              autoRestartTimerRef.current = setTimeout(() => {
                autoRestartTimerRef.current = null;
                if (!cancelledRef.current) startListening();
              }, isReadingSection ? 800 : 600);
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
            if (blocked) {
              setAutoplayBlocked(true);
              setVoiceState('READY');
            } else {
              stopAudio();
              setVoiceState('READY');
            }
            resolve();
          });
        });
      }

      /** Play one reading section and update the active-content label. */
      async function playReadingSection(
        section: { label: string; text: string } | undefined,
      ): Promise<void> {
        if (!section || cancelledRef.current) return;
        setActiveContent({ label: section.label });
        await playTTS(section.text, true);
      }

      /** Advance the reading cursor to the next section, or end the session. */
      async function advanceReading(): Promise<void> {
        const sections = readingSectionsRef.current;
        const next = readingIndexRef.current + 1;
        if (!sections.length || next >= sections.length) {
          isReadingRef.current = false;
          setActiveContent(null);
          setVoiceState('READY');
          autoRestartTimerRef.current = setTimeout(() => {
            autoRestartTimerRef.current = null;
            if (!cancelledRef.current) startListening();
          }, 800);
          return;
        }
        readingIndexRef.current = next;
        await playReadingSection(sections[next]);
      }

      /**
       * loadAndStartReading — fetch content, build sections, begin playback.
       * Returns true if a session was started, false if content unavailable.
       */
      async function loadAndStartReading(
        content: 'daily-rhythm' | 'devotional' | 'sermon-companion' | 'bible',
        bibleRef?: { bookId: string; bookName: string; chapter: number; verse?: number },
      ): Promise<boolean> {
        const appCtx = appContextRef.current;
        const sections: { label: string; text: string }[] = [];

        if (content === 'daily-rhythm') {
          const dr = appCtx?.dailyRhythm;
          if (!dr) return false;
          const label = `${dr.journeyTitle} — Day ${dr.currentDay}`;
          if (dr.stepTitle)      sections.push({ label: 'Introduction', text: dr.stepTitle });
          if (dr.stepScripture)  sections.push({ label: 'Scripture',    text: `Today's scripture is ${dr.stepScripture}.` });
          if (dr.stepTeaching)   sections.push({ label: 'Teaching',     text: dr.stepTeaching });
          if (dr.stepReflection) sections.push({ label: 'Reflection',   text: dr.stepReflection });
          if (dr.stepPrayer)     sections.push({ label: 'Prayer',       text: dr.stepPrayer });
          if (!sections.length) return false;
          readingSectionsRef.current = sections;
          readingIndexRef.current    = 0;
          isReadingRef.current       = true;
          readingPausedRef.current   = false;
          setActiveContent({ label });
        }

        else if (content === 'devotional') {
          const devs = appCtx?.activeDevotionals ?? [];
          if (devs.length === 0) return false;
          // Multiple devotionals → let Emmaus disambiguate (falls through to conversation)
          if (devs.length > 1) return false;
          const dev = devs[0];
          const label = `${dev.seriesTitle} — Day ${dev.currentDay}`;
          if (dev.entryTitle)    sections.push({ label: 'Today',      text: dev.entryTitle });
          if (dev.entryScripture) sections.push({ label: 'Scripture', text: `Today's scripture is ${dev.entryScripture}.` });
          if (dev.entryContent)  sections.push({ label: 'Reflection', text: dev.entryContent });
          if (dev.entryPrayer)   sections.push({ label: 'Prayer',     text: dev.entryPrayer });
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

        else if (content === 'bible' && bibleRef) {
          try {
            const res = await fetch(
              `/api/bible/bsb/${bibleRef.bookId}/${bibleRef.chapter}`,
              { headers: { 'X-User-Id': user.id } },
            );
            if (!res.ok) return false;
            const data = (await res.json()) as { verses: { verse: number; text: string }[] };
            if (!data.verses?.length) return false;

            // Track Bible context so follow-up questions ("what does that mean?") work
            bibleContextRef.current = { bookId: bibleRef.bookId, chapter: bibleRef.chapter };

            if (bibleRef.verse) {
              const start = Math.max(1, bibleRef.verse - 1);
              const end   = Math.min(data.verses.length, bibleRef.verse + 4);
              const chunk = data.verses.filter((v) => v.verse >= start && v.verse <= end);
              const text  = chunk.map((v) => `Verse ${v.verse}: ${v.text}`).join(' ');
              sections.push({
                label: `${bibleRef.bookName} ${bibleRef.chapter}:${bibleRef.verse}`,
                text,
              });
            } else {
              // Full chapter — chunk into groups of 8 verses for natural pausing
              const CHUNK = 8;
              for (let i = 0; i < data.verses.length; i += CHUNK) {
                const chunk = data.verses.slice(i, i + CHUNK);
                const startV = chunk[0].verse;
                const endV   = chunk[chunk.length - 1].verse;
                const text   = chunk.map((v) => `Verse ${v.verse}: ${v.text}`).join(' ');
                sections.push({ label: `${bibleRef.bookName} ${bibleRef.chapter}:${startV}–${endV}`, text });
              }
            }

            if (!sections.length) return false;
            readingSectionsRef.current = sections;
            readingIndexRef.current    = 0;
            isReadingRef.current       = true;
            readingPausedRef.current   = false;
            setActiveContent({ label: `${bibleRef.bookName} ${bibleRef.chapter}` });
          } catch {
            return false;
          }
        }

        if (!sections.length) return false;

        setStreamingResponse('');
        await playReadingSection(sections[0]);
        return true;
      }

      /**
       * buildEmmausContext — construct a FlatContext enriched with the user's
       * current app state and active reading section for the Emmaus pipeline.
       *
       * Bible / journey context is included in the typed fields so Emmaus
       * can answer follow-up questions ("explain that verse") without the
       * user being on any particular page.
       */
      function buildEmmausContext(intent: VoiceIntent): FlatContext {
        const base: FlatContext = initContext
          ? { ...initContext, userName: user.preferredName }
          : { entryPoint: 'personal', userName: user.preferredName };

        const parts: string[] = [];
        const appCtx = appContextRef.current;

        if (appCtx?.todaysSummary && appCtx.todaysSummary !== 'No active content today.') {
          parts.push(`User's active content today: ${appCtx.todaysSummary}`);
        }

        // Inject current reading section so Emmaus can explain / pray about it
        if (isReadingRef.current && readingSectionsRef.current.length > 0) {
          const section = readingSectionsRef.current[readingIndexRef.current];
          if (section) {
            parts.push(`Voice is currently reading: ${section.label}`);
            parts.push(section.text.slice(0, 500));
          }
        }

        const voiceAppContext = parts.length > 0 ? parts.join('\n\n') : undefined;

        // Bible context (for "explain that verse" after reading)
        if (bibleContextRef.current) {
          return {
            ...base,
            bookId:          bibleContextRef.current.bookId,
            chapter:         bibleContextRef.current.chapter,
            voiceAppContext,
          };
        }

        // Daily rhythm journey context (enriches for "what's today's reflection?" etc.)
        if (appCtx?.dailyRhythm && (isReadingRef.current || intent.type === 'converse')) {
          const dr = appCtx.dailyRhythm;
          return {
            ...base,
            journeyId:    dr.journeyId,
            journeyTitle: dr.journeyTitle,
            currentDay:   dr.currentDay,
            voiceAppContext,
          };
        }

        return { ...base, voiceAppContext };
      }

      // ─── Main pipeline ────────────────────────────────────────────────────────

      setVoiceState('THINKING');

      try {
        // ── Step 1: Transcribe (Whisper) ──────────────────────────────────────
        const audioBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
        const text = await transcribeAudio(audioBlob, user.id);
        if (cancelledRef.current) return;

        if (!text.trim()) {
          // In reading mode, silence means the user is listening → advance to next section.
          if (isReadingRef.current && !readingPausedRef.current) {
            await advanceReading();
            return;
          }
          setErrorMsg("I didn't catch that. Tap to try again.");
          setVoiceState('ERROR');
          return;
        }

        setTranscript(text);
        setStreamingResponse('');

        // ── Phase 3: Intent classification ────────────────────────────────────
        // Only clearly deterministic commands are classified here.
        // Conversational, ambiguous, and follow-up utterances fall through as
        // 'converse' and are handled by the full Emmaus pipeline below.
        const intent = resolveIntent(text, isReadingRef.current);

        // ─── Reading commands ────────────────────────────────────────────────
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

          // 'explain' and 'pray' fall through to Emmaus with the current section injected.
          // Pause auto-advance so the user gets the response without it skipping ahead.
          readingPausedRef.current = true;
        }

        // ─── Navigation ──────────────────────────────────────────────────────
        if (intent.type === 'navigate') {
          const routes: Record<string, string> = {
            walk:     '/walk',
            bible:    '/walk/bible',
            discover: '/discover',
            journeys: '/journeys',
          };
          if (intent.target === 'back') { window.history.back(); return; }
          const route = routes[intent.target];
          if (route) { navigate(route); return; }
        }

        // ─── Read content ────────────────────────────────────────────────────
        if (intent.type === 'read-content') {
          const started = await loadAndStartReading(intent.content, intent.bibleRef);
          if (started) return;
          // Content not available → fall through so Emmaus can explain
        }

        // ─── Continue walk ───────────────────────────────────────────────────
        if (intent.type === 'continue-walk') {
          const walks = appContextRef.current?.activeWalks ?? [];
          const match = intent.hint
            ? walks.find((w) => w.title.toLowerCase().includes(intent.hint!.toLowerCase()))
            : null;
          const target = match ?? (walks.length === 1 ? walks[0] : null);
          if (target) {
            navigate(`/journey/${target.journeyId}/day/${target.currentDay}`);
            return;
          }
          // Multiple walks or no match → Emmaus disambiguates
        }

        // ─── Continue reading (Bible chapter advance) ────────────────────────
        if (intent.type === 'continue-reading') {
          if (isReadingRef.current && !readingPausedRef.current) {
            await advanceReading();
            return;
          }
          if (bibleContextRef.current) {
            const { bookId, chapter } = bibleContextRef.current;
            const started = await loadAndStartReading('bible', {
              bookId,
              bookName: bookId,
              chapter:  chapter + 1,
            });
            if (started) return;
          }
          // No context → Emmaus handles it
        }

        // ── Step 2: Ask Emmaus — enriched with current app context ────────────
        // Every unhandled intent, fallthrough, and conversational message lands here.
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
                  { role: 'user' as const, content: text },
                  { role: 'assistant' as const, content: fullResponse },
                ]);
              }
              resolve();
            },
            onError: (msg: string) => reject(new Error(msg)),
          };

          const handle = latestConvId
            ? appendMessage({
                userId: user.id,
                conversationId: latestConvId,
                message: text,
                context,
                history,
                callbacks,
              })
            : startConversation({
                userId: user.id,
                message: text,
                context,
                history,
                callbacks,
              });

          abortRef.current = handle.abort;
        });

        abortRef.current = null;
        if (cancelledRef.current) return;

        if (!fullResponse.trim()) {
          setVoiceState('READY');
          return;
        }

        // ── Step 3: TTS ────────────────────────────────────────────────────────
        setResponse(fullResponse);
        setStreamingResponse('');
        await playTTS(fullResponse, false);

      } catch (err) {
        if (cancelledRef.current) return;
        setErrorMsg(
          err instanceof Error ? err.message : 'Something went wrong. Tap to try again.',
        );
        setVoiceState('ERROR');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, convId, history, initContext],
  );

  // ─── Orb tap (primary action) ────────────────────────────────────────────

  function handleOrbTap() {
    // AudioContext resume — must happen synchronously in the user gesture.
    // This is the most reliable way to unlock audio.play() on iOS Safari
    // and Android Chrome without requiring a separate "tap to play" step.
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        if (!playbackAcRef.current || playbackAcRef.current.state === 'closed') {
          playbackAcRef.current = new Ctx();
        }
        playbackAcRef.current.resume().catch(() => {});
      }
    } catch { /* ignore — fallback to tap-to-play */ }

    // Always cancel any pending auto-restart; the user is taking over
    cancelAutoRestart();

    // Discard any pending autoplay-blocked audio element
    if (autoplayBlocked) {
      stopAudio(); // pauses element + disposes MediaSource URL
    }

    switch (voiceState) {
      case 'READY':
      case 'ERROR':
        setErrorMsg(null);
        startListening();
        break;

      case 'LISTENING':
        // User is done speaking — process the recording
        stopListening();
        break;

      case 'SPEAKING':
        // Interrupt Emmaus: stop playback immediately, start new turn
        stopAudio();
        setStreamingResponse('');
        startListening();
        break;

      case 'THINKING':
        // Button is disabled during THINKING — no-op
        break;
    }
  }

  // ─── Tap-to-play fallback (mobile autoplay blocked) ───────────────────────
  // The audio element is still alive in audioElRef with the stream buffered;
  // we just call play() again in the context of a user gesture.

  function handleTapToHear() {
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
  }

  // ─── Retry audio (TTS fetch failed) ──────────────────────────────────────

  async function handleRetryAudio() {
    if (!user || !response) return;
    setTtsError(false);
    setVoiceState('SPEAKING');
    try {
      const { audio, dispose } = await streamSpeechToAudio(response, user.id);
      if (cancelledRef.current) { dispose(); return; }
      audioElRef.current   = audio;
      disposeAudioRef.current = dispose;
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
  }

  // ─── End / back ───────────────────────────────────────────────────────────

  function handleEnd() {
    cleanupAll();
    const dest = getReturnDestination();
    clearReturnDestination();
    navigate(dest?.pathname ?? '/walk');
  }

  // ─── Derived values ───────────────────────────────────────────────────────

  const isListening = voiceState === 'LISTENING';
  const isThinking  = voiceState === 'THINKING';
  const isSpeaking  = voiceState === 'SPEAKING';
  const isError     = voiceState === 'ERROR';
  const isReady     = voiceState === 'READY';

  const statusLabel = (() => {
    switch (voiceState) {
      case 'READY':     return convId ? 'Tap to continue' : 'Tap to begin';
      case 'LISTENING': return 'Listening…';
      case 'THINKING':  return 'Thinking…';
      case 'SPEAKING':  return 'Speak to interrupt';
      case 'ERROR':     return 'Tap to try again';
    }
  })();

  const displayedResponse = streamingResponse || response;

  // ─── Loading state (voice settings not yet fetched) ───────────────────────

  if (voiceEnabled === null) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center h-14 px-4 border-b border-border/50 shrink-0">
          <button
            onClick={handleEnd}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="ml-3 text-[15px] font-medium text-foreground">Emmaus Voice</span>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-muted-foreground/40" />
        </main>
      </div>
    );
  }

  // ─── Disabled state (admin has turned off voice) ──────────────────────────

  if (voiceEnabled === false) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center h-14 px-4 border-b border-border/50 shrink-0">
          <button
            onClick={handleEnd}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="ml-3 text-[15px] font-medium text-foreground">Emmaus Voice</span>
        </header>
        <main className="flex-1 flex items-center justify-center px-6">
          <div className="text-center space-y-4 max-w-[280px]">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto">
              <Mic size={28} className="text-muted-foreground/40" />
            </div>
            <p className="text-[16px] font-medium text-foreground">Voice mode is unavailable</p>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              Your admin has disabled voice mode. Check back later or send your question in writing.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ─── Main interface ───────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col select-none">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex items-center justify-between h-14 px-4 border-b border-border/50 shrink-0">
        <button
          onClick={handleEnd}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close voice mode"
        >
          <ArrowLeft size={20} />
        </button>

        <span className="text-[15px] font-medium text-foreground">Emmaus Voice</span>

        {/* View conversation history */}
        <button
          onClick={() => history.length > 0 && setShowHistory((v) => !v)}
          className={cn(
            'p-2 -mr-2 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg',
            history.length > 0
              ? 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
              : 'text-muted-foreground/20 pointer-events-none',
          )}
          aria-label="View conversation"
        >
          <MessageSquare size={18} />
        </button>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center justify-between py-8 px-6 overflow-hidden min-h-0">

        {/* Last user transcript */}
        <div className="w-full max-w-[420px] min-h-[52px] flex items-start justify-end">
          {transcript ? (
            <div className="bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[85%]">
              <p className="text-[14px] text-foreground leading-relaxed">{transcript}</p>
            </div>
          ) : null}
        </div>

        {/* ── Orb ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-center gap-5">
          <div className="relative flex items-center justify-center w-52 h-52">

            {/* Outermost slow-ping ring — only during active states */}
            {(isListening || isSpeaking) && (
              <span
                className={cn(
                  'absolute inset-0 rounded-full animate-ping',
                  isListening ? 'bg-rose-400/12' : 'bg-primary/10',
                )}
                style={{ animationDuration: isListening ? '1.8s' : '2.4s' }}
              />
            )}

            {/* Middle ambient ring */}
            <div
              className={cn(
                'absolute w-44 h-44 rounded-full border-2 transition-colors duration-700',
                isReady     && 'border-primary/20 bg-primary/5 animate-voice-breathe',
                isListening && 'border-rose-400/40 bg-rose-500/8',
                isThinking  && 'border-border/60 bg-muted/10',
                isSpeaking  && 'border-primary/30 bg-primary/8 animate-voice-breathe',
                isError     && 'border-muted/30 bg-muted/8',
              )}
            />

            {/* Core button */}
            <button
              onClick={handleOrbTap}
              disabled={isThinking}
              aria-label={statusLabel}
              className={cn(
                'relative z-10 w-[84px] h-[84px] rounded-full flex items-center justify-center',
                'transition-all duration-200 shadow-md focus-visible:outline-none',
                isListening
                  ? 'bg-rose-500 text-white scale-110 shadow-rose-200/80 dark:shadow-rose-900/40'
                  : isThinking
                  ? 'bg-muted text-muted-foreground/40 cursor-not-allowed shadow-none'
                  : isSpeaking
                  ? 'bg-primary/12 text-primary ring-2 ring-primary/25'
                  : isError
                  ? 'bg-destructive/10 text-destructive'
                  : 'bg-primary text-white hover:scale-105 active:scale-95',
              )}
            >
              {isListening ? (
                <Square size={28} className="fill-white" />
              ) : isThinking ? (
                <Loader2 size={28} className="animate-spin" />
              ) : (
                <Mic size={28} />
              )}
            </button>
          </div>

          {/* Status label */}
          <p
            className={cn(
              'text-[14px] text-center leading-snug min-h-[20px] transition-all duration-300',
              isError ? 'text-destructive/70' : 'text-muted-foreground',
            )}
          >
            {statusLabel}
          </p>

          {/* Phase 3: active content context — what Voice is reading or discussing */}
          {activeContent && !isError && (
            <p className="text-[12px] text-primary/70 font-medium tracking-wide text-center px-4 -mt-1">
              {activeContent.label}
            </p>
          )}

          {/* Extended error message */}
          {isError && errorMsg && (
            <p className="text-[13px] text-center text-muted-foreground/80 max-w-[260px] leading-relaxed -mt-2">
              {errorMsg}
            </p>
          )}
        </div>

        {/* ── Response + action area ───────────────────────────────────────── */}
        <div className="w-full max-w-[420px] flex flex-col items-start gap-3">

          {/* Last Emmaus response snippet */}
          {displayedResponse ? (
            <div
              className={cn(
                'bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 w-full',
                streamingResponse && !response ? 'border-primary/25' : '',
              )}
            >
              <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-wrap line-clamp-4">
                {displayedResponse}
              </p>
              {streamingResponse && !response && (
                <span className="inline-block w-1.5 h-4 ml-1 bg-foreground/40 animate-pulse rounded-sm align-middle" />
              )}
            </div>
          ) : null}

          {/* Tap-to-play fallback (mobile autoplay blocked) */}
          {autoplayBlocked && audioElRef.current && response && (
            <button
              onClick={handleTapToHear}
              className="flex items-center gap-2 text-[14px] text-primary font-medium bg-primary/10 hover:bg-primary/20 active:bg-primary/30 px-4 py-3 rounded-xl transition-colors min-h-[48px] w-full"
            >
              <Volume2 size={18} className="shrink-0" />
              Tap to hear Emmaus
            </button>
          )}

          {/* TTS fetch error — show text, allow retry */}
          {ttsError && response && (
            <div className="w-full bg-muted/40 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
              <p className="text-[13px] text-muted-foreground">Audio unavailable</p>
              <button
                onClick={handleRetryAudio}
                className="flex items-center gap-1.5 text-[13px] text-primary font-medium min-h-[36px] px-3 rounded-lg hover:bg-primary/10 transition-colors"
              >
                <RotateCcw size={13} />
                Retry audio
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer
        className="shrink-0 border-t border-border/30 flex items-center justify-center"
        style={{ paddingTop: '12px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleEnd}
          className="text-[15px] font-medium text-muted-foreground hover:text-foreground transition-colors min-h-[48px] px-10 rounded-xl hover:bg-muted/40 active:bg-muted/60"
        >
          End
        </button>
      </footer>

      {/* ── Conversation history panel ─────────────────────────────────────── */}
      {showHistory && (
        <div
          className="absolute inset-0 z-20 flex flex-col"
          role="dialog"
          aria-label="Conversation history"
        >
          {/* Tap-to-dismiss backdrop */}
          <button
            className="flex-1 bg-black/25 backdrop-blur-[2px]"
            onClick={() => setShowHistory(false)}
            aria-label="Close conversation"
          />

          {/* Panel */}
          <div className="bg-background rounded-t-2xl shadow-xl flex flex-col max-h-[70dvh]">
            {/* Panel header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/50 shrink-0">
              <span className="text-[15px] font-semibold text-foreground">Conversation</span>
              <button
                onClick={() => setShowHistory(false)}
                className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-muted/40"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Message list */}
            <div className="overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
              {history.map((item, i) => (
                <div
                  key={i}
                  className={cn('flex', item.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-3 text-[14px] leading-relaxed',
                      item.role === 'user'
                        ? 'bg-primary/10 border border-primary/20 rounded-tr-sm text-foreground'
                        : 'bg-card border border-border rounded-tl-sm text-foreground',
                    )}
                  >
                    {item.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
