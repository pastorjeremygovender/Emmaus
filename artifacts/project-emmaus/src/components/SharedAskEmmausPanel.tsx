/**
 * SharedAskEmmausPanel.tsx — "Ask Emmaus Together" collaborative panel.
 *
 * All members see the AI response streaming live via the session SSE bus.
 * The leader has a question input at the bottom; members are read-only.
 *
 * Streaming state flows from useFollowLeader (in RoomDetail) down as props
 * so this component stays pure and testable.
 */

import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Send, Loader2, MessageSquare } from 'lucide-react';
import { apiSharedAskEmmaus, apiGetEmmausAnswers } from '@/lib/rooms-api';
import type { RoomEmmausAnswer } from '@/lib/rooms-types';

interface SharedAskEmmausPanelProps {
  roomId: string;
  userId: string;
  sessionId: string;
  isLeader: boolean;
  userName?: string;
  /** Non-null while AI is generating — the question that was asked. */
  activeQuestion: string | null;
  /** Accumulated streaming text from SSE chunks. */
  streamText: string;
  /** Set when the stream completes. Cleared on next question. */
  latestAnswer: {
    question: string;
    fullText: string;
    answerId: string | null;
    error?: boolean;
  } | null;
  onClose: () => void;
}

function AnswerCard({
  question,
  answer,
  isStreaming = false,
  streamText = '',
}: {
  question: string;
  answer?: string;
  isStreaming?: boolean;
  streamText?: string;
}) {
  const text = isStreaming ? streamText : (answer ?? '');

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 overflow-hidden">
      {/* Question label */}
      <div className="px-4 pt-3.5 pb-2.5 border-b border-primary/15 flex items-start gap-2.5">
        <MessageSquare size={14} className="text-primary shrink-0 mt-0.5" />
        <p className="text-[13px] font-semibold text-primary leading-snug">{question}</p>
      </div>
      {/* Answer body */}
      <div className="px-4 pt-3 pb-4">
        {isStreaming && !streamText ? (
          <div className="flex items-center gap-2 text-muted-foreground text-[13px]">
            <Loader2 size={14} className="animate-spin shrink-0" />
            <span>Emmaus is thinking for your group…</span>
          </div>
        ) : (
          <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-wrap">
            {text}
            {isStreaming && (
              <span className="inline-block w-[2px] h-[1em] bg-primary ml-0.5 animate-pulse align-middle" />
            )}
          </p>
        )}
      </div>
    </div>
  );
}

export function SharedAskEmmausPanel({
  roomId,
  userId,
  sessionId,
  isLeader,
  userName,
  activeQuestion,
  streamText,
  latestAnswer,
  onClose,
}: SharedAskEmmausPanelProps) {
  const [previousAnswers, setPreviousAnswers] = useState<RoomEmmausAnswer[]>([]);
  const [question, setQuestion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [generationTimedOut, setGenerationTimedOut] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latestAnswerIdRef = useRef<string | null>(null);

  // A disconnected provider or dropped SSE connection must not leave the
  // leader's group permanently disabled behind a spinner. The server also
  // times out, but this local guard gives the UI a retryable state first.
  useEffect(() => {
    if (activeQuestion === null) {
      setGenerationTimedOut(false);
      return;
    }
    setGenerationTimedOut(false);
    const timer = setTimeout(() => setGenerationTimedOut(true), 30_000);
    return () => clearTimeout(timer);
  }, [activeQuestion]);

  // Load previous answers for this session on mount
  useEffect(() => {
    apiGetEmmausAnswers(userId, roomId, sessionId)
      .then(answers => setPreviousAnswers(answers))
      .catch(() => { /* silent — show empty state */ });
  }, [userId, roomId, sessionId]);

  // When the stream completes and we get a new answer, add it to the list
  useEffect(() => {
    // Failed requests remain in the live state so the leader can retry them
    // and reconnecting members can see the explicit outcome. They are not
    // historical answers and should not be added to the answer list.
    if (!latestAnswer || latestAnswer.error) return;
    if (latestAnswer.answerId && latestAnswer.answerId === latestAnswerIdRef.current) return;
    latestAnswerIdRef.current = latestAnswer.answerId;
    setPreviousAnswers(prev => {
      // Avoid duplicates if the GET endpoint already returned it
      const alreadyIn = prev.some(a => a.id === latestAnswer.answerId);
      if (alreadyIn) return prev;
      return [
        ...prev,
        {
          id: latestAnswer.answerId ?? `local-${Date.now()}`,
          sessionId,
          roomId,
          askedBy: userId,
          question: latestAnswer.question,
          answer: latestAnswer.fullText,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }, [latestAnswer, sessionId, roomId, userId]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [previousAnswers, streamText, activeQuestion]);

  const submitQuestion = async (q: string) => {
    if (!q || submitting || (activeQuestion !== null && !generationTimedOut)) return;
    setSubmitting(true);
    setSubmitError('');
    setGenerationTimedOut(false);
    try {
      await apiSharedAskEmmaus(userId, roomId, sessionId, q, userName);
      setQuestion('');
      inputRef.current?.focus();
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Failed to send. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    await submitQuestion(question.trim());
  };

  const handleRetry = async () => {
    if (!latestAnswer?.error) return;
    await submitQuestion(latestAnswer.question.trim());
  };

  const isGenerating = activeQuestion !== null && !generationTimedOut;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-0 z-50 flex flex-col h-[100dvh] max-w-[480px] mx-auto bg-background pb-page-safe">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles size={16} className="text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[16px] font-bold text-foreground leading-tight">
                  Ask Emmaus Together
                </p>
                <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-primary/10 text-primary uppercase tracking-wide">
                  Group
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {isLeader ? 'Ask on behalf of the group' : 'Response visible to all members'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable content area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Empty state — no previous answers and not streaming */}
          {previousAnswers.length === 0 && !isGenerating && (
            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-primary/8 flex items-center justify-center">
                <Sparkles size={24} className="text-primary opacity-50" />
              </div>
              <div>
                <p className="text-[15px] font-semibold text-foreground">No questions yet</p>
                <p className="text-[13px] text-muted-foreground mt-1 max-w-[240px] mx-auto">
                  {isLeader
                    ? 'Ask a question below and the whole group will see the response together.'
                    : 'The leader will ask a question on behalf of the group.'}
                </p>
              </div>
            </div>
          )}

          {/* Previous completed answers */}
          {previousAnswers.map(ans => (
            <AnswerCard
              key={ans.id}
              question={ans.question}
              answer={ans.answer}
            />
          ))}

          {/* Current streaming answer */}
          {isGenerating && (
            <AnswerCard
              key="streaming"
              question={activeQuestion ?? ''}
              isStreaming
              streamText={streamText}
            />
          )}
          {generationTimedOut && activeQuestion && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5">
              <p className="text-[13px] font-semibold text-amber-700 dark:text-amber-300">
                Emmaus is taking longer than expected
              </p>
              <p className="text-[13px] text-muted-foreground mt-1">
                The group can try the question again. A completed response will
                still appear here if it arrives shortly.
              </p>
            </div>
          )}
          {latestAnswer?.error && !isGenerating && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5">
              <p className="text-[13px] font-semibold text-amber-700 dark:text-amber-300">
                This group question was not completed
              </p>
              <div className="mt-2 flex items-start gap-2 text-[13px] text-foreground">
                <MessageSquare size={14} className="mt-0.5 shrink-0 text-primary" />
                <span>{latestAnswer.question}</span>
              </div>
              <p className="text-[13px] text-muted-foreground mt-1">
                {latestAnswer.fullText ||
                  'Emmaus stopped before the group received an answer.'}
              </p>
              {isLeader && (
                <button
                  type="button"
                  onClick={() => void handleRetry()}
                  disabled={submitting}
                  className="mt-3 rounded-xl bg-amber-600 px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? 'Trying again…' : 'Try this question again'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Leader question input */}
        {isLeader && (
          <div className="shrink-0 border-t border-border/60 bg-card px-4 py-3 pb-safe-or-4 pb-4">
            {submitError && (
              <p className="text-[12px] text-red-500 mb-2">{submitError}</p>
            )}
            {isGenerating && (
              <div className="flex items-center gap-2 text-[12px] text-muted-foreground mb-2">
                <Loader2 size={12} className="animate-spin" />
                Generating response for the group…
              </div>
            )}
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit();
                  }
                }}
                placeholder="Ask Emmaus a question for the group…"
                rows={2}
                disabled={isGenerating || submitting}
                className="flex-1 resize-none rounded-xl border border-border bg-background px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
              />
              <button
                onClick={handleSubmit}
                disabled={!question.trim() || isGenerating || submitting}
                className="shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity"
                aria-label="Send"
              >
                {submitting ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
