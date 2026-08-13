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
  fetchSpeechBlobUrl,
  getSupportedMimeType,
} from '@/lib/voice-client';
import {
  takePendingContext,
  getReturnDestination,
  clearReturnDestination,
} from '@/lib/emmaus-pending';
import { cn } from '@/lib/utils';

// ─── State machine ─────────────────────────────────────────────────────────────

type VoiceState = 'READY' | 'LISTENING' | 'THINKING' | 'SPEAKING' | 'ERROR';

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

  // ── Refs (stable across renders) ─────────────────────────────────────────
  const recorderRef         = useRef<MediaRecorder | null>(null);
  const chunksRef           = useRef<Blob[]>([]);
  const streamRef           = useRef<MediaStream | null>(null);
  const abortRef            = useRef<(() => void) | null>(null);
  const audioElRef          = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef          = useRef<string | null>(null);
  // Pre-resumed during mic gesture to unlock mobile audio autoplay
  const playbackAcRef       = useRef<AudioContext | null>(null);
  // Set true on unmount so the async pipeline short-circuits everywhere
  const cancelledRef        = useRef(false);
  // Phase 2: tracks the 600 ms delay between speaking and re-listening
  const autoRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ─── Cleanup helpers ──────────────────────────────────────────────────────

  function cancelAutoRestart() {
    if (autoRestartTimerRef.current) {
      clearTimeout(autoRestartTimerRef.current);
      autoRestartTimerRef.current = null;
    }
  }

  function stopAudio() {
    audioElRef.current?.pause();
    audioElRef.current = null;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
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
   * stopRecorder — user-initiated: keeps onstop intact so processAudioBlob fires.
   */
  function stopRecorder() {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
  }

  /**
   * cancelRecorder — unmount/interrupt: nulls onstop BEFORE stopping so the
   * pipeline never triggers after navigation or interruption.
   */
  function cancelRecorder() {
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

  // ─── Audio processing pipeline ────────────────────────────────────────────

  const processAudioBlob = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (!user || cancelledRef.current) return;
      setVoiceState('THINKING');

      try {
        // ── Step 1: Transcribe (Whisper) ──────────────────────────────────
        const audioBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
        const text = await transcribeAudio(audioBlob, user.id);
        if (cancelledRef.current) return;

        if (!text.trim()) {
          // Silent / inaudible — soft error, stay ready for another attempt
          setErrorMsg("I didn't catch that. Tap to try again.");
          setVoiceState('ERROR');
          return;
        }

        setTranscript(text);
        setStreamingResponse('');

        // ── Step 2: Ask Emmaus (existing intelligence pipeline) ───────────
        const context: FlatContext = initContext
          ? { ...initContext, userName: user.preferredName }
          : { entryPoint: 'personal', userName: user.preferredName };

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

        // ── Step 3: TTS ───────────────────────────────────────────────────
        // The mic stream is already closed (stopMicStream ran in recorder.onstop).
        setResponse(fullResponse);
        setStreamingResponse('');
        setVoiceState('SPEAKING');

        let url: string;
        try {
          url = await fetchSpeechBlobUrl(fullResponse, user.id);
        } catch {
          // TTS network error — keep the text visible, offer retry
          if (!cancelledRef.current) {
            setTtsError(true);
            setVoiceState('READY');
          }
          return;
        }

        if (cancelledRef.current) { URL.revokeObjectURL(url); return; }

        blobUrlRef.current = url;
        const audio = new Audio(url);
        audioElRef.current = audio;

        /**
         * scheduleAutoRestart — called after audio finishes playing.
         * The 600 ms pause feels natural (like a breath) and also gives the
         * user time to decide whether to tap End before the mic reopens.
         */
        const scheduleAutoRestart = () => {
          if (cancelledRef.current) return;
          setVoiceState('READY');
          autoRestartTimerRef.current = setTimeout(() => {
            autoRestartTimerRef.current = null;
            if (!cancelledRef.current) startListening();
          }, 600);
        };

        await new Promise<void>((resolve) => {
          audio.onended = () => {
            stopAudio();
            scheduleAutoRestart();
            resolve();
          };
          audio.onerror = () => {
            // Mid-play error — go to READY without auto-restart (edge case)
            stopAudio();
            setVoiceState('READY');
            resolve();
          };
          audio.play().catch((err: unknown) => {
            const blocked =
              err instanceof DOMException &&
              (err.name === 'NotAllowedError' || err.name === 'AbortError');
            if (blocked) {
              // Mobile autoplay blocked — keep blob URL, show tap-to-play button.
              // Auto-restart fires after the user taps and playback finishes.
              audioElRef.current = null;
              setAutoplayBlocked(true);
              setVoiceState('READY');
            } else {
              stopAudio();
              setVoiceState('READY');
            }
            resolve();
          });
        });
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

    // Clear stale autoplay-blocked blob URL
    if (autoplayBlocked) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setAutoplayBlocked(false);
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

  function handleTapToHear() {
    const url = blobUrlRef.current;
    if (!url) return;
    setAutoplayBlocked(false);
    setVoiceState('SPEAKING');
    const audio = new Audio(url);
    audioElRef.current = audio;
    audio.onended = () => {
      stopAudio();
      // Auto-restart after tap-to-play — same loop as normal playback
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
      const url = await fetchSpeechBlobUrl(response, user.id);
      if (cancelledRef.current) { URL.revokeObjectURL(url); return; }
      blobUrlRef.current = url;
      const audio = new Audio(url);
      audioElRef.current = audio;
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
      case 'SPEAKING':  return 'Emmaus is speaking…';
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
          {autoplayBlocked && blobUrlRef.current && response && (
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

      {/* ── Footer — End button ────────────────────────────────────────────── */}
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
