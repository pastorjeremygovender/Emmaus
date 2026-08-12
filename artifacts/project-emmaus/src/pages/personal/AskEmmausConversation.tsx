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

import { useState, useEffect, useRef, useCallback, memo, type RefObject } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { HearEmmausButton } from '@/components/emmaus/HearEmmausButton';
import { ShareButton } from '@/components/ShareButton';
import { useAuth } from '@/contexts/AuthContext';
import { BottomNav } from '@/components/BottomNav';
import { EmmausComposer } from '@/components/emmaus/EmmausComposer';
import {
  startConversation,
  appendMessage,
  getMessages,
  saveMemory,
  type EmmausMetadata,
  type SseDoneEvent,
  type HistoryItem,
} from '@/lib/emmaus-client';
import { takePendingMessage, getReturnDestination, clearReturnDestination } from '@/lib/emmaus-pending';
import { ScriptureCard } from '@/components/emmaus/ScriptureCard';
import { NextStepCard } from '@/components/emmaus/NextStepCard';
import { NextStepsCard } from '@/components/emmaus/NextStepsCard';
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

// ─── Thinking bubble ─────────────────────────────────────────────────────────
//
// Animated three-dot ellipsis matching the assistant message style.
// Cycles •  ••  •••  •  … every 400 ms.
// When `slow` is true, shows the long-wait reassurance text instead.

const ThinkingBubble = memo(function ThinkingBubble({ slow }: { slow: boolean }) {
  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    if (slow) return;
    const id = setInterval(() => setDotCount((d) => (d === 3 ? 1 : d + 1)), 400);
    return () => clearInterval(id);
  }, [slow]);

  if (slow) {
    return (
      <p className="text-[16px] text-foreground/70 leading-[1.75] font-sans italic">
        I'm still searching Scripture and relevant teaching to give you the best answer.
      </p>
    );
  }

  return (
    // Fixed-height container prevents the bubble from resizing as dots appear/disappear
    <span className="inline-flex items-center gap-[5px] h-6" aria-label="Thinking">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[7px] h-[7px] rounded-full bg-foreground/40 transition-opacity duration-300"
          style={{ opacity: dotCount >= i ? 1 : 0.15 }}
        />
      ))}
    </span>
  );
});

// ─── Visual Viewport hook ────────────────────────────────────────────────────
//
// Syncs the outer container's height to window.visualViewport.height so the
// flex layout is always bounded by the *visible* area (excluding the software
// keyboard). This is the most reliable cross-browser approach:
//
//  • Modern iOS 15.4+ / Chrome Android  → dvh already tracks the keyboard, but
//    the imperative update provides an additional safety net.
//  • Older iOS Safari (< 15.4) / WebView → dvh isn't supported or doesn't
//    shrink with the keyboard; the hook is the only reliable fix.
//
// We manipulate the DOM directly (no setState) so the update runs synchronously
// during the keyboard animation without causing a React render.

function useVisualViewportHeight(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv || !ref.current) return;

    function sync() {
      if (ref.current) {
        // Set explicit pixel height; overrides the CSS h-[100dvh] baseline
        ref.current.style.height = `${vv!.height}px`;
      }
    }

    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    sync(); // set immediately

    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, [ref]);
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
  const { user, updateName } = useAuth();
  const params = useParams<{ id?: string }>();
  const [, setLocation] = useLocation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(params.id ?? null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState<'dots' | 'slow'>('dots');
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Context from AskEmmausHome (may include Bible/Walk/Journey entry point from FAB)
  const [initialContext, setInitialContext] = useState<import('@/lib/emmaus-client').FlatContext | null>(null);
  const [followUp, setFollowUp] = useState('');
  const [isCrisisMode, setIsCrisisMode] = useState(false);
  // P2-6: soft pastoral nudge — shown when handoffType === 'pastoral'
  const [isPastoralMode, setIsPastoralMode] = useState(false);
  const [memoryPrompt, setMemoryPrompt] = useState<string | null>(null);
  const [memoryDecided, setMemoryDecided] = useState(false);

  // ─── 20-second slow-response timer ─────────────────────────────────────────
  useEffect(() => {
    if (isStreaming) {
      setThinkingPhase('dots');
      thinkingTimerRef.current = setTimeout(() => setThinkingPhase('slow'), 20_000);
    } else {
      if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
      setThinkingPhase('dots');
    }
    return () => {
      if (thinkingTimerRef.current) clearTimeout(thinkingTimerRef.current);
    };
  }, [isStreaming]);

  const rootRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const streamingMsgRef = useRef<HTMLDivElement>(null);
  const streamingIdRef = useRef<string | null>(null);

  // Keep the outer container height equal to the visual viewport (keyboard-aware)
  useVisualViewportHeight(rootRef);

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
          // Persist name change when Emmaus detected a "call me [name]" request
          if (payload.detectedNameUpdate) {
            updateName(payload.detectedNameUpdate);
          }
          // Crisis handoff
          if (payload.metadata.handoffType === 'crisis') {
            setIsCrisisMode(true);
          }
          // P2-6: Pastoral nudge — softer than crisis, shown as inline banner
          if (payload.metadata.handoffType === 'pastoral') {
            setIsPastoralMode(true);
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
          context: { entryPoint: 'personal', conversationId: convId, userName: user.preferredName },
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
    <div ref={rootRef} className="h-[100dvh] bg-background flex flex-col overflow-hidden pb-16">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[560px] mx-auto">
          <button
            onClick={() => {
              // Navigate directly to the originating page — no two-press required.
              const dest = getReturnDestination();
              clearReturnDestination();
              const target = dest?.pathname ?? '/walk';
              setLocation(target);
              if (dest?.scrollY) {
                requestAnimationFrame(() => {
                  setTimeout(() => window.scrollTo({ top: dest.scrollY, behavior: 'instant' }), 80);
                });
              }
            }}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
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
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-6 pb-4 max-w-[560px] mx-auto w-full space-y-8"
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
                {/* Prose or thinking bubble */}
                <div
                  className={[
                    'transition-opacity duration-200',
                    msg.isStreaming && msg.content ? 'opacity-90' : 'opacity-100',
                  ].join(' ')}
                >
                  {msg.isStreaming && !msg.content
                    ? <ThinkingBubble slow={thinkingPhase === 'slow'} />
                    : msg.content ? renderProse(msg.content) : null}
                </div>

                {/* Hear Emmaus — read completed response aloud */}
                {!msg.isStreaming && msg.content && user && (
                  <HearEmmausButton
                    text={msg.content}
                    userId={user.id}
                    label="Hear Emmaus read this response"
                  />
                )}

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
                    {msg.metadata.nextSteps && msg.metadata.nextSteps.length > 0 && (
                      <NextStepsCard steps={msg.metadata.nextSteps} />
                    )}

                    {/* AE-2: follow-up suggestion chips — only on the last assistant message */}
                    {msg.metadata.followUpPrompts && (msg.metadata.followUpPrompts as string[]).length > 0 &&
                      msg.id === messages.filter(m => m.role === 'assistant').at(-1)?.id && (
                      <div className="space-y-2 pt-1">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest px-0.5">
                          Keep exploring
                        </p>
                        {(msg.metadata.followUpPrompts as string[]).map((prompt, i) => (
                          <button
                            key={i}
                            onClick={() => setFollowUp(prompt)}
                            className="w-full text-left text-[14px] text-foreground bg-muted/50 hover:bg-muted/80 px-4 py-2.5 rounded-xl transition-colors"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )}
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

                {/* Share — only on the last completed assistant message */}
                {!msg.isStreaming &&
                  msg.content &&
                  msg.id === messages.filter((m) => m.role === 'assistant').at(-1)?.id && (
                    <ShareButton
                      payload={{
                        title: 'Ask Emmaus',
                        reflection: msg.content,
                      }}
                    />
                  )}
              </div>
            )}
          </div>
        ))}

        <div aria-hidden="true" className="h-1" />
      </main>

      {/* P2-6: Pastoral handoff banner — soft nudge, not full-screen */}
      {isPastoralMode && !isCrisisMode && (
        <div className="flex-shrink-0 px-4 pt-2 max-w-[560px] mx-auto w-full">
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
            <p className="text-[13px] font-semibold text-amber-800">A gentle note</p>
            <p className="text-[13px] text-amber-700 leading-relaxed">
              This sounds like something your pastor would love to walk through with you.
              Emmaus is here too — but a conversation with someone from church could go deeper.
            </p>
            <button
              onClick={() => setIsPastoralMode(false)}
              className="text-[12px] text-amber-600 hover:text-amber-800 underline mt-0.5"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Follow-up composer — hidden while streaming */}
      {!isStreaming && messages.length > 0 && (
        <div
          className="flex-shrink-0 border-t border-border/50 bg-background/95 backdrop-blur-sm"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="px-4 py-3 max-w-[560px] mx-auto">
            <label htmlFor="follow-up-input" className="sr-only">
              Continue the conversation
            </label>
            <EmmausComposer
              id="follow-up-input"
              value={followUp}
              onChange={setFollowUp}
              onSend={handleFollowUp}
              placeholder="Continue…"
              isLoading={isStreaming}
              aria-label="Follow-up message"
            />
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
}
