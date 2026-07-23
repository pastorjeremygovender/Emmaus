/**
 * EmmausComposer — shared inline-send composer for Ask Emmaus.
 *
 * A controlled multiline textarea that auto-grows (up to 160px) with a
 * SendHorizontal icon button embedded at the bottom-right corner.
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
 * The `sending` guard resets when:
 *   - isLoading flips to false (streaming finished)
 *   - The component unmounts (navigation away on the home screen)
 *
 * On failure the caller preserves the text value so the user can retry.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { SendHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

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

  // Reset guard when the request completes (isLoading false → true → false)
  useEffect(() => {
    if (!isLoading) setSending(false);
  }, [isLoading]);

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
    onChange(e.target.value);
  }

  function handleSend() {
    if (!value.trim() || isLoading || disabled || sending) return;
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
          // Right + bottom padding ensure text never underlaps the 44px send button
          'pr-14 pb-10',
        )}
      />

      {/* Send icon — absolutely positioned inside the textarea's bottom-right */}
      <button
        type="button"
        onClick={handleSend}
        disabled={isSendDisabled}
        aria-label="Send message"
        className={cn(
          'absolute bottom-1.5 right-1.5',
          // 44×44 minimum touch target
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
  );
}
