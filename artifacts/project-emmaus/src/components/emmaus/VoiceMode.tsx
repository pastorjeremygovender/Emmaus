/**
 * VoiceMode — Full-screen voice interface for Ask Emmaus.
 *
 * Route: /personal/ask-emmaus/voice
 *
 * Flow:
 *   READY → (tap mic) → LISTENING → (tap stop) → THINKING → SPEAKING → READY (loop)
 *
 * Interruption: tapping the mic while SPEAKING cancels playback and starts recording.
 *
 * The conversation id is preserved across turns so follow-up questions carry
 * full context (same semantics as the text-based AskEmmausConversation).
 *
 * Audio pipeline:
 *   MediaRecorder (audio/webm or audio/mp4 on iOS) → base64 → Whisper → transcript
 *   transcript → Ask Emmaus SSE → response text → OpenAI TTS → HTMLAudioElement
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Mic, Square, Loader2 } from 'lucide-react';
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

const STATE_LABELS: Record<VoiceState, string> = {
  READY: 'Tap to speak',
  LISTENING: 'Listening… tap to stop',
  THINKING: 'Emmaus is thinking…',
  SPEAKING: 'Tap to speak again',
  ERROR: 'Tap to try again',
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function VoiceMode() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const voiceEnabled = useVoiceEnabled(user?.id);

  // Voice state machine
  const [voiceState, setVoiceState] = useState<VoiceState>('READY');
  const [transcript, setTranscript]           = useState('');
  const [response, setResponse]               = useState('');
  const [streamingResponse, setStreamingResponse] = useState('');
  const [errorMsg, setErrorMsg]               = useState<string | null>(null);

  // Conversation context across turns
  const [convId, setConvId]         = useState<string | null>(null);
  const [history, setHistory]       = useState<HistoryItem[]>([]);
  const [initContext, setInitContext] = useState<FlatContext | null>(null);

  // Refs — non-reactive resources
  const recorderRef   = useRef<MediaRecorder | null>(null);
  const chunksRef     = useRef<Blob[]>([]);
  const streamRef     = useRef<MediaStream | null>(null);
  const acRef         = useRef<AudioContext | null>(null);
  const analyserRef   = useRef<AnalyserNode | null>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);
  const rafRef        = useRef<number | null>(null);
  const abortRef      = useRef<(() => void) | null>(null);
  const audioElRef    = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef    = useRef<string | null>(null);
  // cancelledRef is set to true on unmount so the async pipeline aborts early.
  const cancelledRef  = useRef(false);

  // ─── Mount / unmount ────────────────────────────────────────────────────────

  useEffect(() => {
    cancelledRef.current = false;
    // Pick up conversation context set by the originating page
    const pending = takePendingContext();
    if (pending?.context) setInitContext(pending.context);

    return () => {
      // Mark cancelled BEFORE cleanup so the async pipeline short-circuits
      cancelledRef.current = true;
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Cleanup helpers ────────────────────────────────────────────────────────

  function stopAudio() {
    audioElRef.current?.pause();
    audioElRef.current = null;
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
  }

  function stopVisualizer() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    acRef.current?.close().catch(() => {});
    acRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  /**
   * stopRecorder — user-initiated stop: keeps onstop intact so processAudioBlob fires.
   */
  function stopRecorder() {
    const rec = recorderRef.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    recorderRef.current = null;
  }

  /**
   * cancelRecorder — unmount/cancel: nulls out onstop BEFORE stopping so the
   * processing pipeline never triggers after navigation.
   */
  function cancelRecorder() {
    const rec = recorderRef.current;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      if (rec.state !== 'inactive') rec.stop();
    }
    recorderRef.current = null;
  }

  function cleanupAll() {
    stopAudio();
    stopVisualizer();
    cancelRecorder(); // not stopRecorder — must not fire onstop after unmount
    abortRef.current?.();
    abortRef.current = null;
  }

  // ─── Web Audio visualizer ───────────────────────────────────────────────────

  function startVisualizer(stream: MediaStream) {
    try {
      const ac = new AudioContext();
      acRef.current = ac;
      const analyser = ac.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;
      const src = ac.createMediaStreamSource(stream);
      src.connect(analyser);

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufLen = analyser.frequencyBinCount;
      const dataArr = new Uint8Array(bufLen);

      function draw() {
        if (!canvas || !ctx) return;
        rafRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArr);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barW = Math.floor(canvas.width / bufLen) - 2;

        for (let i = 0; i < bufLen; i++) {
          const v = dataArr[i] / 255;
          const barH = Math.max(6, v * canvas.height);
          const alpha = 0.4 + v * 0.6;
          ctx.fillStyle = `rgba(139, 92, 246, ${alpha})`;
          const x = i * (barW + 2);
          const y = (canvas.height - barH) / 2;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, y, barW, barH, 3);
          } else {
            ctx.rect(x, y, barW, barH);
          }
          ctx.fill();
        }
      }

      draw();
    } catch {
      // Visualizer is optional — proceed without it on unsupported devices
    }
  }

  // ─── Recording ──────────────────────────────────────────────────────────────

  async function startListening() {
    setErrorMsg(null);
    setTranscript('');

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // If the user navigated away while the permission prompt was open, stop
      // the tracks immediately and bail — cancelRecorder() cannot help here
      // because no recorder exists yet.
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
        stopVisualizer();
        const blob = new Blob(chunksRef.current, {
          type: mimeType || 'audio/webm',
        });
        chunksRef.current = [];
        await processAudioBlob(blob, mimeType || 'audio/webm');
      };

      recorder.start(200); // 200 ms chunks
      startVisualizer(mediaStream);
      setVoiceState('LISTENING');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('NotAllowed') || msg.includes('Permission')) {
        setErrorMsg('Microphone access was denied. Please allow microphone access and try again.');
      } else {
        setErrorMsg('Could not start recording. Please check your microphone and try again.');
      }
      setVoiceState('ERROR');
    }
  }

  function stopListening() {
    stopRecorder(); // → triggers recorder.onstop → processAudioBlob
    setVoiceState('THINKING');
  }

  // ─── Audio processing pipeline ──────────────────────────────────────────────

  const processAudioBlob = useCallback(
    async (blob: Blob, mimeType: string) => {
      if (!user || cancelledRef.current) return;
      setVoiceState('THINKING');

      try {
        // ── Step 1: Transcribe ─────────────────────────────────────────────
        const audioBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
        const text = await transcribeAudio(audioBlob, user.id);

        // Check cancellation after every await — user may have navigated away
        if (cancelledRef.current) return;

        if (!text.trim()) {
          // Empty or silent recording — go back to ready
          setVoiceState('READY');
          return;
        }

        setTranscript(text);
        setStreamingResponse('');

        // ── Step 2: Ask Emmaus ─────────────────────────────────────────────
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

        // Check cancellation after Ask Emmaus stream completes
        if (cancelledRef.current) return;

        if (!fullResponse.trim()) {
          setVoiceState('READY');
          return;
        }

        // ── Step 3: TTS ────────────────────────────────────────────────────
        setResponse(fullResponse);
        setStreamingResponse('');
        setVoiceState('SPEAKING');

        const url = await fetchSpeechBlobUrl(fullResponse, user.id);

        // Check cancellation after TTS fetch — navigating during TTS fetch
        if (cancelledRef.current) { URL.revokeObjectURL(url); return; }

        blobUrlRef.current = url;

        const audio = new Audio(url);
        audioElRef.current = audio;

        await new Promise<void>((resolve) => {
          audio.onended = () => { stopAudio(); setVoiceState('READY'); resolve(); };
          audio.onerror = () => { stopAudio(); setVoiceState('READY'); resolve(); };
          audio.play().catch(() => { stopAudio(); setVoiceState('READY'); resolve(); });
        });
      } catch (err) {
        if (cancelledRef.current) return; // suppress errors after unmount
        const msg =
          err instanceof Error ? err.message : 'Something went wrong. Please try again.';
        setErrorMsg(msg);
        setVoiceState('ERROR');
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, convId, history, initContext],
  );

  // ─── Button handler ──────────────────────────────────────────────────────────

  function handleMicButton() {
    if (voiceState === 'READY' || voiceState === 'ERROR') {
      setErrorMsg(null);
      startListening();
    } else if (voiceState === 'LISTENING') {
      stopListening();
    } else if (voiceState === 'SPEAKING') {
      // Interrupt — stop audio and start a new turn
      stopAudio();
      setResponse('');
      setStreamingResponse('');
      startListening();
    }
    // THINKING: button is disabled
  }

  // ─── Back navigation ────────────────────────────────────────────────────────

  function handleBack() {
    cleanupAll();
    const dest = getReturnDestination();
    clearReturnDestination();
    navigate(dest?.pathname ?? '/walk');
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  const isThinking = voiceState === 'THINKING';
  const isListening = voiceState === 'LISTENING';
  const isSpeaking = voiceState === 'SPEAKING';

  // Text shown below the mic
  const displayedResponse = streamingResponse || response;

  // ── Loading state (settings not yet fetched from server) ─────────────────
  // Fail-closed: hide the mic interface until we know voice is enabled.
  // All hooks are called above unconditionally — this conditional return is safe.
  if (voiceEnabled === null) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center h-14 px-4 border-b border-border/50 shrink-0">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="ml-2 text-[15px] font-medium text-foreground">Emmaus Voice</span>
        </header>
        <main className="flex-1 flex items-center justify-center">
          <Loader2 size={28} className="animate-spin text-muted-foreground/40" />
        </main>
      </div>
    );
  }

  // ── Disabled state (admin has turned off voice mode) ──────────────────────
  if (voiceEnabled === false) {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center h-14 px-4 border-b border-border/50 shrink-0">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <ArrowLeft size={20} />
          </button>
          <span className="ml-2 text-[15px] font-medium text-foreground">Emmaus Voice</span>
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

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center h-14 px-4 border-b border-border/50 shrink-0">
        <button
          onClick={handleBack}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close voice mode"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="ml-2 text-[15px] font-medium text-foreground">Emmaus Voice</span>
      </header>

      {/* Body */}
      <main className="flex-1 flex flex-col items-center justify-between py-10 px-6 overflow-hidden">

        {/* ── Transcript (what the user said) ──────────────────────────── */}
        <div className="w-full max-w-[480px] min-h-[56px] flex items-start justify-end">
          {transcript ? (
            <div className="bg-primary/10 border border-primary/20 rounded-2xl rounded-tr-sm px-4 py-3 max-w-[80%]">
              <p className="text-[15px] text-foreground leading-relaxed">{transcript}</p>
            </div>
          ) : null}
        </div>

        {/* ── Centre: visualiser + mic button ──────────────────────────── */}
        <div className="flex flex-col items-center gap-6">
          {/* Canvas visualizer — only visible during LISTENING */}
          <canvas
            ref={canvasRef}
            width={200}
            height={60}
            className={cn(
              'transition-opacity duration-300',
              isListening ? 'opacity-100' : 'opacity-0',
            )}
            aria-hidden="true"
          />

          {/* Mic button */}
          <div className="relative flex items-center justify-center">
            {/* Pulsing outer ring */}
            {(isListening || isSpeaking) && (
              <span
                className={cn(
                  'absolute inset-0 rounded-full animate-ping',
                  isListening ? 'bg-red-400/25' : 'bg-primary/20',
                )}
              />
            )}

            <button
              onClick={handleMicButton}
              disabled={isThinking}
              className={cn(
                'relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-200 shadow-lg focus-visible:outline-none',
                isListening
                  ? 'bg-red-500 text-white scale-110'
                  : isThinking
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : isSpeaking
                  ? 'bg-primary/15 text-primary ring-2 ring-primary/30'
                  : 'bg-primary text-white hover:scale-105 active:scale-95',
              )}
              aria-label={STATE_LABELS[voiceState]}
            >
              {isListening ? (
                <Square size={28} className="fill-white" />
              ) : isThinking ? (
                <RefreshCw size={28} className="animate-spin" />
              ) : (
                <Mic size={28} />
              )}
            </button>
          </div>

          {/* State label */}
          <p className="text-[14px] text-muted-foreground text-center leading-snug min-h-[20px]">
            {STATE_LABELS[voiceState]}
          </p>

          {/* Error message */}
          {errorMsg && voiceState === 'ERROR' && (
            <p className="text-[13px] text-destructive text-center max-w-[280px] leading-relaxed">
              {errorMsg}
            </p>
          )}
        </div>

        {/* ── Response (what Emmaus said) ───────────────────────────────── */}
        <div className="w-full max-w-[480px] min-h-[56px] flex items-end justify-start">
          {displayedResponse ? (
            <div
              className={cn(
                'bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 max-w-[90%] overflow-y-auto max-h-[200px]',
                streamingResponse && !response ? 'border-primary/30' : '',
              )}
            >
              <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap">
                {displayedResponse}
              </p>
              {streamingResponse && !response && (
                <span className="inline-block w-2 h-4 ml-1 bg-foreground/40 animate-pulse rounded-sm align-middle" />
              )}
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
