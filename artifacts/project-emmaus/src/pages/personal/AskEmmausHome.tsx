/**
 * Ask Emmaus — Home Screen
 *
 * Single-screen layout when idle; transitions to a WhatsApp-style
 * composer-focused view the moment the user starts typing.
 *
 * "Talk to Emmaus" voice button is shown only when voice mode is enabled.
 * The composer pill matches the UnifiedEmmausInput bar and includes an
 * in-pill mic button for speech-to-text (Web Speech API).
 */

import { useState, useRef, useCallback } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Mic, MicOff, SendHorizontal } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useVoiceEnabled } from '@/hooks/useVoiceEnabled';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import {
  setPendingMessage,
  setPendingContext,
  getReturnDestination,
  clearReturnDestination,
} from '@/lib/emmaus-pending';
import { unlockVoiceAudio } from '@/lib/voice-audio-unlock';
import { cn } from '@/lib/utils';

// ─── Component ────────────────────────────────────────────────────────────────

export default function AskEmmausHome() {
  const { user } = useAuth();
  const voiceEnabled = useVoiceEnabled(user?.id);
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState('');

  const isTyping = message.length > 0;

  // ── Speech-to-text ──────────────────────────────────────────────────────────
  const valueBeforeMicRef = useRef('');
  const interimActiveRef  = useRef(false);

  const { isSupported: micSupported, isListening, start: startListening, stop: stopListening } =
    useSpeechRecognition({
      onInterim: useCallback((transcript: string) => {
        const base = valueBeforeMicRef.current;
        setMessage(base + (base ? ' ' : '') + transcript);
        interimActiveRef.current = true;
      }, []),
      onFinal: useCallback((transcript: string) => {
        const base = valueBeforeMicRef.current;
        setMessage(base + (base ? ' ' : '') + transcript);
        interimActiveRef.current = false;
      }, []),
      onError: useCallback(() => {
        setMessage(valueBeforeMicRef.current);
        interimActiveRef.current = false;
      }, []),
    });

  function handleMicToggle() {
    if (isListening) {
      stopListening();
    } else {
      valueBeforeMicRef.current = message;
      interimActiveRef.current  = false;
      startListening();
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────────

  function handleBack() {
    const dest = getReturnDestination();
    clearReturnDestination();
    setLocation(dest?.pathname ?? '/walk');
  }

  function handleSend() {
    const trimmed = message.trim();
    if (!trimmed || !user) return;
    if (isListening) stopListening();
    setPendingMessage(trimmed, { entryPoint: 'personal', userName: user.preferredName });
    setLocation('/personal/ask-emmaus/conversation');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (interimActiveRef.current) {
      valueBeforeMicRef.current = e.target.value;
      interimActiveRef.current  = false;
    }
    setMessage(e.target.value);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header
        className={cn(
          'shrink-0 flex items-center px-4 transition-all duration-250',
          isTyping ? 'h-14 border-b border-border/50' : 'h-12',
        )}
      >
        <button
          onClick={handleBack}
          className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Back"
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </button>

        <p
          className={cn(
            'flex-1 text-center text-[17px] font-semibold text-foreground transition-all duration-250',
            isTyping ? 'opacity-100' : 'opacity-0 pointer-events-none',
          )}
        >
          Ask Emmaus
        </p>

        {/* Balance the back button */}
        <div className="min-w-[44px]" />
      </header>

      {/* ── Idle content — collapses when typing ─────────────────────────── */}
      <div
        className={cn(
          'flex flex-col px-5 pt-10 gap-6 transition-all duration-250 overflow-hidden',
          isTyping
            ? 'max-h-0 opacity-0 pointer-events-none'
            : '',
        )}
      >
        {/* Talk to Emmaus voice button */}
        {voiceEnabled === true && (
          <div className="flex flex-col items-center gap-2.5">
            <div className="relative inline-flex">
              <span
                className="absolute -inset-1.5 rounded-full border border-primary/20 animate-pulse"
                aria-hidden="true"
              />
              <button
                onClick={() => {
                  if (!user) return;
                  setPendingContext({ entryPoint: 'personal' as const, userName: user.preferredName });
                  unlockVoiceAudio();
                  setLocation('/personal/ask-emmaus/voice');
                }}
                className="relative flex items-center gap-2 px-6 py-3 rounded-full text-[15px] font-medium bg-primary/8 border border-primary/25 text-primary hover:bg-primary/12 active:scale-95 transition-all"
                aria-label="Open voice mode"
              >
                <Mic size={16} aria-hidden="true" />
                Talk to Emmaus
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground text-center">
              Speak your question and hear Emmaus respond.
            </p>
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[12px] text-muted-foreground leading-relaxed text-center">
          Emmaus offers pastoral reflection, not counseling or professional advice.
        </p>
      </div>

      {/* ── WhatsApp spacer — fills space above composer when typing ─────── */}
      {isTyping && <div className="flex-1" />}

      {/* ── Composer ─────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'shrink-0 px-5 py-3 transition-all duration-250',
          isTyping && 'border-t border-border/50',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-2.5 px-4 py-3 rounded-full border bg-card shadow-sm transition-all',
            isTyping
              ? 'border-primary/40 ring-2 ring-primary/15 shadow-md'
              : 'border-border hover:border-primary/25 hover:shadow-md',
          )}
        >
          {/* Text input */}
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input
            type="text"
            placeholder="What's on your mind?"
            value={message}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            autoFocus
            aria-label="Your message to Emmaus"
            className="flex-1 bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-w-0"
          />

          {/* Mic — speech-to-text */}
          {micSupported && (
            <button
              type="button"
              onClick={handleMicToggle}
              aria-label={isListening ? 'Stop recording' : 'Speak your question'}
              aria-pressed={isListening}
              className={cn(
                'shrink-0 w-8 h-8 flex items-center justify-center rounded-full transition-all',
                isListening
                  ? 'bg-red-50 text-red-500'
                  : 'bg-primary/10 hover:bg-primary/20 text-primary',
              )}
            >
              {isListening ? (
                <span className="relative flex items-center justify-center">
                  <span className="absolute inline-flex h-5 w-5 rounded-full bg-red-400/30 animate-ping" aria-hidden="true" />
                  <MicOff size={15} strokeWidth={1.8} aria-hidden="true" />
                </span>
              ) : (
                <Mic size={15} strokeWidth={1.8} aria-hidden="true" />
              )}
            </button>
          )}

          {/* Send — shown only when there is text */}
          {isTyping && (
            <button
              type="button"
              onClick={handleSend}
              disabled={!message.trim()}
              aria-label="Send message"
              className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:scale-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <SendHorizontal size={15} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

    </div>
  );
}
