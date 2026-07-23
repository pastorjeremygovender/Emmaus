/**
 * Ask Emmaus — Conversation Screen
 *
 * Streams responses immediately on mount (no loading indicator, no typing bubble).
 * Renders:
 *   - User message with "You" label
 *   - Emmaus prose response (no label, no avatar)
 *   - ScriptureCard, NextStepCard, ResourceCards after streaming completes
 *   - SafetyHandoverCard fullscreen on crisis handoff
 *   - MemoryConsentBar when a memory opportunity is surfaced
 *   - Follow-up textarea for continued conversation
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import {
  startConversation,
  appendMessage,
  getMessages,
  saveMemory,
  type EmmausMetadata,
  type SseDoneEvent,
  type HistoryItem,
} from '@/lib/emmaus-client';
import { takePendingMessage } from '@/lib/emmaus-pending';
import { ScriptureCard } from '@/components/emmaus/ScriptureCard';
import { NextStepCard } from '@/components/emmaus/NextStepCard';
import { ResourceCard } from '@/components/emmaus/ResourceCard';
import { SafetyHandoverCard } from '@/components/emmaus/SafetyHandoverCard';
import { MemoryConsentBar } from '@/components/emmaus/MemoryConsentBar';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: EmmausMetadata;
  isStreaming?: boolean;
}

// ─── Helper: parse paragraphs ─────────────────────────────────────────────────

function renderProse(text: string) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  if (paragraphs.length <= 1) {
    return (
      <p className="text-[16px] text-foreground leading-[1.75] font-sans">
        {text}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-[16px] text-foreground leading-[1.75] font-sans">
          {p}
        </p>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AskEmmausConversation() {
  const { user } = useAuth();
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(params.id ?? null);
  const [isStreaming, setIsStreaming] = useState(false);
  // Context from AskEmmausHome (may include Bible/Walk/Journey entry point from FAB)
  const [initialContext, setInitialContext] = useState<import('@/lib/emmaus-client').FlatContext | null>(null);
  const [followUp, setFollowUp] = useState('');
  const [isCrisisMode, setIsCrisisMode] = useState(false);
  const [memoryPrompt, setMemoryPrompt] = useState<string | null>(null);
  const [memoryDecided, setMemoryDecided] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const streamingMsgRef = useRef<HTMLDivElement>(null);
  const followUpRef = useRef<HTMLTextAreaElement>(null);
  const streamingIdRef = useRef<string | null>(null);

  // ─── Scroll to top of new streaming message (once, on stream start) ─────────
  // Two-phase: wait 60 ms for the DOM to assign height to the new element,
  // then measure and scroll. Never re-fires after that (guard: !isStreaming).

  const HEADER_HEIGHT = 56; // matches h-14 sticky header

  useEffect(() => {
    if (!isStreaming) return;
    const timer = setTimeout(() => {
      if (!streamingMsgRef.current || !mainRef.current) return;
      const main = mainRef.current;
      const msgEl = streamingMsgRef.current;
      const msgTop = msgEl.getBoundingClientRect().top;
      const mainTop = main.getBoundingClientRect().top;
      const target = main.scrollTop + (msgTop - mainTop) - HEADER_HEIGHT - 12;
      main.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
    }, 60);
    return () => clearTimeout(timer);
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Stream a response ──────────────────────────────────────────────────────

  const streamResponse = useCallback(
    (
      text: string,
      convId: string | null,
      history: HistoryItem[],
      /** Optional context override — used for the first message when the FAB
       *  supplied Bible/Walk/Journey context from the originating screen. */
      contextOverride?: import('@/lib/emmaus-client').FlatContext,
    ) => {
      if (!user) return;

      const streamingMsgId = `streaming-${Date.now()}`;
      streamingIdRef.current = streamingMsgId;
      setIsStreaming(true);

      // Add empty streaming placeholder
      setMessages((prev) => [
        ...prev,
        { id: streamingMsgId, role: 'assistant', content: '', isStreaming: true },
      ]);

      const callbacks = {
        onText: (chunk: string) => {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgId
                ? { ...m, content: m.content + chunk }
                : m
            )
          );
        },
        onDone: (payload: SseDoneEvent) => {
          setIsStreaming(false);
          setConversationId(payload.conversationId);
          // Update URL to include the conversationId (replace history entry)
          window.history.replaceState(
            null,
            '',
            `/personal/ask-emmaus/conversation/${payload.conversationId}`
          );
          // Finalise the message with metadata
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgId
                ? { ...m, isStreaming: false, metadata: payload.metadata }
                : m
            )
          );
          // Crisis handoff
          if (payload.metadata.handoffType === 'crisis') {
            setIsCrisisMode(true);
          }
          // Suggest memory if there is a next step worth remembering
          if (
            payload.metadata.nextStep &&
            payload.metadata.nextStep.action &&
            !memoryDecided
          ) {
            setMemoryPrompt(payload.metadata.nextStep.action);
          }
          // Do not programmatically focus the follow-up textarea — doing so
          // causes the browser to scroll it into view, overriding the scroll
          // position set above. Users tap the textarea themselves on mobile.
        },
        onError: (message: string) => {
          setIsStreaming(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    content: m.content || message,
                  }
                : m
            )
          );
        },
      };

      if (!convId) {
        // Use FAB-supplied context when available; fall back to personal.
        const ctx = contextOverride
          ? { ...contextOverride, userName: user.preferredName }
          : { entryPoint: 'personal' as const, userName: user.preferredName };
        startConversation({
          userId: user.id,
          message: text,
          context: ctx,
          history,
          callbacks,
        });
      } else {
        appendMessage({
          userId: user.id,
          conversationId: convId,
          message: text,
          context: { entryPoint: 'personal', conversationId: convId },
          history,
          callbacks,
        });
      }
    },
    [user, memoryDecided]
  );

  // ─── On mount: pick up pending message or load existing conversation ────────

  useEffect(() => {
    if (!user) return;

    const existingId = params.id ?? null;

    if (existingId) {
      // Load existing conversation from the API
      getMessages(user.id, existingId).then((stored) => {
        const loaded: Message[] = stored.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          metadata: m.metadata,
        }));
        setMessages(loaded);
      });
      return;
    }

    // New conversation — take the pending message from the home screen
    const pending = takePendingMessage();
    if (!pending) {
      // No pending message and no conversation ID — go back to home
      setLocation('/personal/ask-emmaus');
      return;
    }

    // Capture context supplied by the FAB / AskEmmausHome for the first request
    setInitialContext(pending.context ?? null);

    // Add the user message to the UI
    const userMsgId = `user-${Date.now()}`;
    setMessages([{ id: userMsgId, role: 'user', content: pending.message }]);

    // Start streaming — pass the pending context so the backend knows the
    // originating area (Bible book+chapter, Walk, Journey, etc.)
    streamResponse(pending.message, null, [], pending.context);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Follow-up submit ───────────────────────────────────────────────────────

  function handleFollowUp() {
    const trimmed = followUp.trim();
    if (!trimmed || isStreaming || !user) return;

    const userMsgId = `user-${Date.now()}`;
    const history: HistoryItem[] = messages
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: trimmed },
    ]);
    setFollowUp('');
    setMemoryPrompt(null);
    setMemoryDecided(false);

    streamResponse(trimmed, conversationId, history);
  }

  function handleFollowUpKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleFollowUp();
    }
  }

  // ─── Memory consent ──────────────────────────────────────────────────────────

  function handleMemoryAccept() {
    if (!user || !memoryPrompt) return;
    saveMemory(user.id, memoryPrompt, `conversation:${conversationId ?? 'new'}`);
    setMemoryPrompt(null);
    setMemoryDecided(true);
  }

  function handleMemoryDecline() {
    setMemoryPrompt(null);
    setMemoryDecided(true);
  }

  // ─── Crisis mode ─────────────────────────────────────────────────────────────

  if (isCrisisMode) {
    return <SafetyHandoverCard onReturn={() => setLocation('/personal/ask-emmaus')} />;
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[560px] mx-auto">
          <button
            onClick={() => setLocation('/personal/ask-emmaus')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back to Ask Emmaus"
          >
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
          <div className="flex-1 text-center">
            <p className="text-[14px] font-medium text-muted-foreground">
              Ask Emmaus
            </p>
          </div>
          <div className="min-w-[44px]" aria-hidden="true" />
        </div>
      </header>

      {/* Conversation */}
      <main
        ref={mainRef}
        className="flex-1 overflow-y-auto px-5 pt-6 pb-4 max-w-[560px] mx-auto w-full space-y-8"
        aria-live="polite"
        aria-label="Conversation"
      >
        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              /* ── User message ── */
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  You
                </p>
                <p className="text-[16px] text-foreground leading-relaxed">
                  {msg.content}
                </p>
              </div>
            ) : (
              /* ── Emmaus response ── */
              <div
                ref={msg.isStreaming ? streamingMsgRef : undefined}
                className="space-y-5"
              >
                {/* Prose */}
                <div
                  className={[
                    'transition-opacity duration-200',
                    msg.isStreaming ? 'opacity-90' : 'opacity-100',
                  ].join(' ')}
                >
                  {msg.content ? renderProse(msg.content) : null}
                </div>

                {/* Response cards — only after streaming completes */}
                {!msg.isStreaming && msg.metadata && (
                  <div className="space-y-3">
                    {msg.metadata.scripture && (
                      <ScriptureCard scripture={msg.metadata.scripture} />
                    )}
                    {msg.metadata.nextStep && (
                      <NextStepCard nextStep={msg.metadata.nextStep} />
                    )}
                    {msg.metadata.recommendations.slice(0, 3).map((rec, i) => (
                      <ResourceCard key={i} recommendation={rec} />
                    ))}
                  </div>
                )}

                {/* Memory consent (only after last assistant message) */}
                {!msg.isStreaming &&
                  memoryPrompt &&
                  msg.id === messages.filter((m) => m.role === 'assistant').at(-1)?.id && (
                    <MemoryConsentBar
                      memoryContent={memoryPrompt}
                      onAccept={handleMemoryAccept}
                      onDecline={handleMemoryDecline}
                    />
                  )}
              </div>
            )}
          </div>
        ))}

        <div aria-hidden="true" className="h-1" />
      </main>

      {/* Follow-up input */}
      {!isStreaming && messages.length > 0 && (
        <div className="border-t border-border/50 bg-background/95 backdrop-blur-sm safe-area-bottom">
          <div className="px-5 py-3 max-w-[560px] mx-auto space-y-2">
            <label htmlFor="follow-up-input" className="sr-only">
              Continue the conversation
            </label>
            <Textarea
              id="follow-up-input"
              ref={followUpRef}
              placeholder="Continue…"
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              onKeyDown={handleFollowUpKeyDown}
              className="resize-none bg-background border-border text-[15px] leading-relaxed rounded-xl min-h-[68px] max-h-[140px] focus-visible:ring-primary/30"
              aria-label="Follow-up message"
            />
            <Button
              className="w-full h-10 rounded-xl text-[14px]"
              onClick={handleFollowUp}
              disabled={!followUp.trim() || isStreaming}
            >
              Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
