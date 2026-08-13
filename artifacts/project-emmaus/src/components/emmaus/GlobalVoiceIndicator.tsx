/**
 * GlobalVoiceIndicator — Phase 4: Compact persistent Voice overlay.
 *
 * Shown when an Emmaus Voice session is active but the user is on any screen
 * OTHER than the dedicated Voice Mode view.  Tap to return to Voice Mode.
 *
 * Positioning:
 *   Fixed pill, sitting above the bottom navigation bar.
 *   Uses safe-area-inset-bottom so it clears notches / home indicators.
 *   z-index 40 (below VoiceMode's z-50, above most content).
 *
 * Controls exposed:
 *   Tap pill  → navigate to /personal/ask-emmaus/voice (session continues)
 *   ■ button  → end session
 *   ⏸/▶ button → pause / resume
 *
 * Intentionally minimal — the full control surface is in VoiceMode.
 */

import { useLocation } from 'wouter';
import { Mic, Square, Pause, Play } from 'lucide-react';
import { useVoiceSession } from '@/contexts/VoiceSessionContext';
import { cn } from '@/lib/utils';

const VOICE_ROUTE = '/personal/ask-emmaus/voice';

export function GlobalVoiceIndicator() {
  const [location, navigate] = useLocation();
  const {
    isActive,
    sessionPaused,
    voiceState,
    activeContent,
    pauseSession,
    resumeSession,
    endSession,
  } = useVoiceSession();

  // Only show when session is active AND we're not already on the Voice screen
  if (!isActive || location === VOICE_ROUTE) return null;

  const isListening = voiceState === 'LISTENING';
  const isSpeaking  = voiceState === 'SPEAKING';
  const isThinking  = voiceState === 'THINKING';

  const statusLabel = (() => {
    if (sessionPaused) return 'Paused';
    if (isListening)   return 'Listening…';
    if (isThinking)    return 'Thinking…';
    if (isSpeaking && activeContent) return activeContent.label;
    if (isSpeaking)    return 'Speaking…';
    return 'Ready';
  })();

  const dotColor = sessionPaused
    ? 'bg-muted-foreground/40'
    : isListening
    ? 'bg-rose-500'
    : isSpeaking
    ? 'bg-primary'
    : isThinking
    ? 'bg-amber-400'
    : 'bg-primary/60';

  function handlePillTap() {
    navigate(VOICE_ROUTE);
  }

  function handlePauseResume(e: React.MouseEvent) {
    e.stopPropagation();
    if (sessionPaused) resumeSession();
    else pauseSession();
  }

  function handleEnd(e: React.MouseEvent) {
    e.stopPropagation();
    endSession();
  }

  return (
    <div
      className="fixed left-0 right-0 z-40 flex justify-center pointer-events-none"
      style={{
        bottom: `calc(env(safe-area-inset-bottom, 0px) + 68px)`,
      }}
    >
      {/* Pill */}
      <div
        className={cn(
          'pointer-events-auto flex items-center gap-2.5',
          'bg-background/95 backdrop-blur-md',
          'border border-border/60 shadow-lg shadow-black/10',
          'rounded-full px-3.5 py-2',
          'max-w-[calc(100vw-32px)] min-w-0',
        )}
      >
        {/* Tap zone — returns to Voice view */}
        <button
          onClick={handlePillTap}
          className="flex items-center gap-2.5 min-w-0 flex-1"
          aria-label="Return to Emmaus Voice"
        >
          {/* State dot / mic icon */}
          <span className="relative flex items-center justify-center w-6 h-6 shrink-0">
            {isListening ? (
              <span className={cn('absolute inset-0 rounded-full animate-ping opacity-40', dotColor)} />
            ) : null}
            <span className={cn('relative w-2.5 h-2.5 rounded-full', dotColor)} />
          </span>

          {/* Label */}
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-semibold text-foreground/70 leading-none">
              Emmaus Voice
            </span>
            <span className="text-[13px] font-medium text-foreground truncate leading-tight mt-0.5">
              {statusLabel}
            </span>
          </div>
        </button>

        {/* Pause / Resume */}
        <button
          onClick={handlePauseResume}
          className="shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
          aria-label={sessionPaused ? 'Resume Voice' : 'Pause Voice'}
        >
          {sessionPaused
            ? <Play size={14} className="fill-current" />
            : <Pause size={14} />
          }
        </button>

        {/* End session */}
        <button
          onClick={handleEnd}
          className="shrink-0 p-1.5 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
          aria-label="End Voice session"
        >
          <Square size={13} className="fill-current" />
        </button>
      </div>
    </div>
  );
}
