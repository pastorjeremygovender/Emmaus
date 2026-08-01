/**
 * useSpeechRecognition — thin wrapper around the Web Speech API.
 *
 * Returns:
 *   isSupported    — false on browsers without SpeechRecognition (hide the button)
 *   isListening    — true while the mic is active
 *   start()        — open the mic; fires onInterim with live text and onFinal
 *                    with the complete transcript when recognition ends
 *   stop           — close the mic early (triggers onend → onFinal fires)
 *
 * Transcript accumulation:
 *   The Web Speech API can fire multiple result events during a single session,
 *   each advancing `resultIndex`. We accumulate ALL finalised segments in a
 *   session-scoped ref (`sessionFinalRef`) so that a multi-phrase utterance is
 *   never truncated. `onInterim` receives (sessionFinals + currentInterim) on
 *   every event; `onFinal` receives the complete sessionFinals string once, when
 *   the recognition session ends (onend).
 *
 * Design decisions:
 *   - continuous: false — mic closes automatically after a pause.
 *   - interimResults: true — shows partial text while the user is speaking.
 *   - A fresh SpeechRecognition instance is created on each start() call to
 *     avoid stale event listeners from prior sessions.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// Browser compatibility shim
const SpeechRecognitionCtor =
  (typeof window !== 'undefined' &&
    ((window as unknown as Record<string, unknown>).SpeechRecognition ||
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition)) as
    | (new () => SpeechRecognition)
    | undefined;

export interface UseSpeechRecognitionOptions {
  /**
   * Called on every interim (or partial-final) update with the full accumulated
   * transcript for the session so far (finals + current interim segment).
   */
  onInterim?: (transcript: string) => void;
  /**
   * Called once with the complete final transcript when the recognition session
   * ends (either after a natural pause or after stop() is called).
   */
  onFinal?: (transcript: string) => void;
  /** Called if an unrecoverable error occurs */
  onError?: (error: string) => void;
}

export function useSpeechRecognition({
  onInterim,
  onFinal,
  onError,
}: UseSpeechRecognitionOptions = {}) {
  const isSupported = Boolean(SpeechRecognitionCtor);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Accumulates all final segments received during the current session
  const sessionFinalRef = useRef('');

  // Keep callback refs stable across re-renders
  const onInterimRef = useRef(onInterim);
  const onFinalRef = useRef(onFinal);
  const onErrorRef = useRef(onError);
  useEffect(() => { onInterimRef.current = onInterim; }, [onInterim]);
  useEffect(() => { onFinalRef.current = onFinal; }, [onFinal]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (!SpeechRecognitionCtor) return;

    // Abort any previous session before starting a new one
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.abort();
    }

    // Reset per-session accumulator
    sessionFinalRef.current = '';

    const rec = new SpeechRecognitionCtor();
    rec.continuous = false;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setIsListening(true);

    rec.onresult = (event: SpeechRecognitionEvent) => {
      // Walk only the new results (from resultIndex onward).
      // Finals are appended to sessionFinalRef; the last non-final result
      // is captured as the current interim.
      let currentInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          // Append with a space separator when the accumulator is non-empty
          const sep = sessionFinalRef.current ? ' ' : '';
          sessionFinalRef.current += sep + result[0].transcript.trim();
        } else {
          currentInterim = result[0].transcript;
        }
      }

      // Emit the full accumulated text so the textarea always shows everything
      const fullTranscript = currentInterim
        ? sessionFinalRef.current
          ? sessionFinalRef.current + ' ' + currentInterim
          : currentInterim
        : sessionFinalRef.current;

      if (fullTranscript) {
        onInterimRef.current?.(fullTranscript);
      }
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' and 'aborted' are expected — not real errors
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onErrorRef.current?.(event.error);
      }
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
      // Fire onFinal with the complete accumulated transcript once the session ends
      if (sessionFinalRef.current) {
        onFinalRef.current?.(sessionFinalRef.current);
      }
      sessionFinalRef.current = '';
    };

    recognitionRef.current = rec;
    rec.start();
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  return { isSupported, isListening, start, stop };
}
