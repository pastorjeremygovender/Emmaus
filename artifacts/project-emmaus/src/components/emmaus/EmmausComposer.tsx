/**
 * EmmausComposer — shared inline-send composer for Ask Emmaus.
 *
 * A controlled multiline textarea that auto-grows (up to 160px) with a
 * SendHorizontal icon button embedded at the bottom-right corner, and an
 * optional microphone button for voice input via the Web Speech API.
 *
 * Keyboard behaviour:
 *   Enter alone      → new line (default)
 *   Ctrl/Cmd+Enter   → send
 *
 * Send is disabled when:
 *   - value is empty / whitespace-only
 *   - isLoading is true (request in flight)
 *   - disabled prop is true
 *   - a local `sending` guard is active (prevents double-tap)
 *
 * Voice input behaviour:
 *   - Mic button is hidden entirely on browsers without SpeechRecognition
 *   - Tapping mic starts listening; interim text appears live in the textarea
 *   - Recognition ends automatically after a pause (continuous: false)
 *   - Tapping mic again while listening stops it early
 *   - Transcribed text replaces any existing interim text but preserves text
 *     the user had typed before tapping the mic (prepended with a space)
 *   - Member can review and edit before sending
 *
 * The `sending` guard resets when:
 *   - isLoading flips to false (streaming finished)
 *   - The component unmounts (navigation away on the home screen)
 *
 * On failure the caller preserves the text value so the user can retry.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { SendHorizontal, Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

export interface EmmausComposerProps {
  id?: string;
  /** Controlled value */
  value: string;
  /** Called on every keystroke — updates parent state */
  onChange: (value: string) => void;
  /** Called when the user submits (icon tap or Ctrl/Cmd+Enter).
   *  Parent reads value from its own state; no argument is passed. */
  onSend: () => void;
  placeholder?: string;
  /** Disable the composer entirely (e.g. while loading a history page) */
  disabled?: boolean;
  /** Pass true while a streaming request is in flight */
  isLoading?: boolean;
  autoFocus?: boolean;
  'aria-label'?: string;
}

export function EmmausComposer({
  id,
  value,
  onChange,
  onSend,
  placeholder = "What's on your mind?",
  disabled = false,
  isLoading = false,
  autoFocus = false,
  'aria-label': ariaLabel,
}: EmmausComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Duplicate-submission guard: set on tap, cleared when isLoading resets
  const [sending, setSending] = useState(false);

  // Track the text the user had typed *before* tapping the mic, so we can
  // prepend it when the interim / final transcript comes in.
  const valueBeforeMicRef = useRef<string>('');
  // Track whether the mic is actively injecting interim text so we can
  // overwrite it on the next interim update rather than appending.
  const interimActiveRef = useRef(false);

  // ─── Speech recognition ────────────────────────────────────────────────────

  const { isSupported: micSupported, isListening, start: startListening, stop: stopListening } =
    useSpeechRecognition({
      onInterim: useCallback(
        (transcript: string) => {
          // Replace interim text with latest partial result
          const base = valueBeforeMicRef.current;
          const separator = base ? ' ' : '';
          onChange(base + separator + transcript);
          interimActiveRef.current = true;
        },
        [onChange],
      ),
      onFinal: useCallback(
        (transcript: string) => {
          // Commit final transcript, strip trailing interim placeholder
          const base = valueBeforeMicRef.current;
          const separator = base ? ' ' : '';
          onChange(base + separator + transcript);
          interimActiveRef.current = false;
          // Focus the textarea so the user can review/edit
          textareaRef.current?.focus();
        },
        [onChange],
      ),
      onError: useCallback(() => {
        // On error, restore the pre-mic value so the user doesn't lose text
        onChange(valueBeforeMicRef.current);
        interimActiveRef.current = false;
      }, [onChange]),
    });

  function handleMicToggle() {
    if (isListening) {
      stopListening();
    } else {
      // Snapshot the current value as the base before transcription starts
      valueBeforeMicRef.current = value;
      interimActiveRef.current = false;
      startListening();
    }
  }

  // Reset guard when the request completes (isLoading false → true → false)
  useEffect(() => {
    if (!isLoading) setSending(false);
  }, [isLoading]);

  // Stop the mic when the composer is disabled or a request starts
  useEffect(() => {
    if ((disabled || isLoading) && isListening) {
      stopListening();
    }
  }, [disabled, isLoading, isListening, stopListening]);

  // Auto-grow: recalculate height whenever value changes
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    autoGrow();
  }, [value, autoGrow]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    // If the user types while interim text is showing, commit the edit and
    // detach the mic "base" so further speech doesn't overwrite manual edits.
    if (interimActiveRef.current) {
      valueBeforeMicRef.current = e.target.value;
      interimActiveRef.current = false;
    }
    onChange(e.target.value);
  }

  function handleSend() {
    if (!value.trim() || isLoading || disabled || sending) return;
    // Stop any active recording before sending
    if (isListening) stopListening();
    setSending(true);
    onSend();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl+Enter or Cmd+Enter sends; plain Enter inserts a newline
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSend();
    }
  }

  const isSendDisabled = !value.trim() || isLoading || disabled || sending;
  const isMicDisabled = disabled || isLoading;

  // Width of the button cluster in the bottom-right corner:
  //   mic (44px) + send (44px) = 88px + a small gap → pr-24 (96px)
  const textareaPrClass = micSupported ? 'pr-24' : 'pr-14';

  return (
    <div className="relative">
      <textarea
        id={id}
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        rows={1}
        className={cn(
          'w-full resize-none rounded-xl border border-input bg-background',
          'px-3 pt-[13px] text-[16px] leading-relaxed text-foreground shadow-sm',
          'placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
          // min-h matches one row; max-h caps growth; overflow scrolls internally
          'min-h-[52px] max-h-[160px] overflow-y-auto',
          // Right padding accounts for mic + send buttons; bottom for both
          textareaPrClass,
          'pb-10',
        )}
      />

      {/* Button cluster — absolutely positioned inside the textarea's bottom-right */}
      <div className="absolute bottom-1.5 right-1.5 flex items-center gap-0.5">
        {/* Mic button — hidden when SpeechRecognition is unsupported */}
        {micSupported && (
          <button
            type="button"
            onClick={handleMicToggle}
            disabled={isMicDisabled}
            aria-label={isListening ? 'Stop recording' : 'Speak your question'}
            aria-pressed={isListening}
            className={cn(
              'min-w-[44px] min-h-[44px] flex items-center justify-center',
              'rounded-lg transition-all duration-150',
              isMicDisabled
                ? 'text-muted-foreground/35 cursor-not-allowed'
                : isListening
                  ? 'text-red-500 hover:bg-red-50 active:scale-90'
                  : 'text-muted-foreground hover:bg-muted/60 active:scale-90',
            )}
          >
            {isListening ? (
              /* Pulsing mic-off icon indicates "tap to stop" while recording */
              <span className="relative flex items-center justify-center">
                <span
                  className="absolute inline-flex h-6 w-6 rounded-full bg-red-400/30 animate-ping"
                  aria-hidden="true"
                />
                <MicOff size={19} aria-hidden="true" strokeWidth={2} />
              </span>
            ) : (
              <Mic size={19} aria-hidden="true" strokeWidth={2} />
            )}
          </button>
        )}

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={isSendDisabled}
          aria-label="Send message"
          className={cn(
            'min-w-[44px] min-h-[44px] flex items-center justify-center',
            'rounded-lg transition-all duration-150',
            isSendDisabled
              ? 'text-muted-foreground/35 cursor-not-allowed'
              : 'text-primary hover:bg-primary/10 active:scale-90',
          )}
        >
          <SendHorizontal size={20} aria-hidden="true" strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
