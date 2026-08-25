/**
 * VoiceMode — Phase 4: Thin view layer for the Emmaus Voice session.
 *
 * Route: /personal/ask-emmaus/voice
 *
 * ALL engine logic now lives in VoiceSessionContext (app-level provider).
 * This component is responsible only for:
 *   1. Registering the current navigate fn with the session (for voice commands).
 *   2. Starting a new session on first mount (if none is active).
 *   3. Updating visual context when returning to an already-active session.
 *   4. Rendering the UI — identical to Phase 1-3, zero engine duplication.
 *
 * CLOSE VIEW vs END SESSION (Phase 4 distinction):
 *   ← Back  (header)  → navigate back — session CONTINUES in background.
 *   End     (footer)  → endSession()  → session TERMINATES + navigate back.
 *
 * When a session is running in the background, GlobalVoiceIndicator provides
 * a compact pill that lets the user return to this screen at any time.
 */

import { useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  ArrowLeft,
  Mic,
  Square,
  Loader2,
  Volume2,
  Pause,
  Play,
  MessageSquare,
  X,
  RotateCcw,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVoiceEnabled } from '@/hooks/useVoiceEnabled';
import { takePendingContext, getReturnDestination, clearReturnDestination } from '@/lib/emmaus-pending';
import { useVoiceSession } from '@/contexts/VoiceSessionContext';
import { cn } from '@/lib/utils';
import { SermonRecommendationCard } from '@/components/emmaus/SermonRecommendationCard';

// ─── Component ─────────────────────────────────────────────────────────────────

export default function VoiceMode() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const voiceEnabled = useVoiceEnabled(user?.id);

  const session = useVoiceSession() as ReturnType<typeof useVoiceSession> & {
    registerNavigate: (fn: (to: string) => void) => void;
  };

  const {
    isActive,
    voiceState,
    transcript,
    response,
    streamingResponse,
    errorMsg,
    ttsError,
    history,
    autoplayBlocked,
    hasAudioElement,
    showHistory,
    activeContent,
    sessionPaused,
    startSession,
    endSession,
    handleOrbTap,
    handleTapToHear,
    handleRetryAudio,
    pauseSession,
    resumeSession,
    stopPlayback,
    setShowHistory,
    updateVisualContext,
    sermonResults,
  } = session;

  // ── Register navigate fn (used by voice commands like "open my bible") ───
  // Must be stable because the session may outlive this component.
  const stableNavigate = useCallback((to: string) => navigate(to), [navigate]);

  useEffect(() => {
    session.registerNavigate?.(stableNavigate);
  }, [session, stableNavigate]);

  // ── Session lifecycle on mount ────────────────────────────────────────────
  // Only runs once per mount (each navigation TO this route remounts VoiceMode).
  useEffect(() => {
    const pending = takePendingContext();
    if (!isActive) {
      // No active session — start a fresh one.
      startSession(pending?.context ?? undefined);
    } else {
      // Session is already running (user returned from another screen).
      // Just update visual context if there is new pending context.
      if (pending?.context) updateVisualContext(pending.context);
    }
    // !! Do NOT call endSession / cleanupAll on unmount.
    // The session should persist through navigation — that is Phase 4's purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── End session + navigate back ───────────────────────────────────────────
  function handleEnd() {
    endSession();
    const dest = getReturnDestination();
    clearReturnDestination();
    navigate(dest?.pathname ?? '/walk');
  }

  // ── Close view (session continues) ───────────────────────────────────────
  function handleCloseView() {
    const dest = getReturnDestination();
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
      case 'READY':     return history.length > 0 ? 'Tap to continue' : 'Tap to begin';
      case 'LISTENING': return 'Listening…';
      case 'THINKING':  return 'Understanding…';
      case 'SPEAKING':  return activeContent ? 'Reading…' : 'Speaking…';
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
            onClick={handleCloseView}
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
            onClick={handleCloseView}
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
        {/* ← Back: closes the VIEW but keeps the session alive */}
        <button
          onClick={handleCloseView}
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

          {sermonResults.length > 0 && (
            <div className="w-full space-y-2">
              {sermonResults.slice(0, 3).map((sermon) => (
                <SermonRecommendationCard key={sermon.sermonId} sermon={sermon} />
              ))}
            </div>
          )}

          {/* Tap-to-play fallback (mobile autoplay blocked) */}
          {autoplayBlocked && hasAudioElement && response && (
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
                onClick={() => handleRetryAudio()}
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
      {/* "End" terminates the session; ← Back (header) just closes this screen */}
      <footer
        className="shrink-0 border-t border-border/30 flex items-center justify-center"
        style={{ paddingTop: '12px', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
      >
        {(isSpeaking || sessionPaused || activeContent) && (
          <div className="flex items-center gap-2 mr-4">
            <button
              onClick={sessionPaused ? resumeSession : pauseSession}
              className="min-h-[48px] min-w-[48px] rounded-xl bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20"
              aria-label={sessionPaused ? 'Resume reading' : 'Pause reading'}
            >
              {sessionPaused ? <Play size={19} fill="currentColor" /> : <Pause size={19} />}
            </button>
            <button
              onClick={stopPlayback}
              className="min-h-[48px] min-w-[48px] rounded-xl bg-destructive/10 text-destructive flex items-center justify-center hover:bg-destructive/20"
              aria-label="Stop reading"
            >
              <Square size={19} fill="currentColor" />
            </button>
          </div>
        )}
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
