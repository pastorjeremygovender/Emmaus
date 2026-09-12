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
  executeValidatedEmmausAction,
  getImmediateEmmausAction,
  type EmmausMetadata,
  type SseDoneEvent,
  type HistoryItem,
} from '@/lib/emmaus-client';
import { takePendingMessage, getReturnDestination, clearReturnDestination } from '@/lib/emmaus-pending';
import { ScriptureCard } from '@/components/emmaus/ScriptureCard';
import { NextStepCard } from '@/components/emmaus/NextStepCard';
import { NextStepsCard } from '@/components/emmaus/NextStepsCard';
import { ResourceCard } from '@/components/emmaus/ResourceCard';
import { SermonRecommendationCard } from '@/components/emmaus/SermonRecommendationCard';
import { InlineScriptureProse } from '@/components/emmaus/InlineScriptureProse';
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
  const [retrievalFailure, setRetrievalFailure] = useState<string[] | null>(null);

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

      setRetrievalFailure(null);
      const streamingMsgId = `streaming-${Date.now()}`;
      streamingIdRef.current = streamingMsgId;
      setIsStreaming(true);

      // Add empty streaming placeholder
      setMessages((prev) => [
        ...prev,
        { id: streamingMsgId, role: 'assistant', content: '', isStreaming: true },
      ]);

      // Keep the network stream and the visual stream separate. Fetch can
      // deliver several SSE frames in one browser task, and React may batch
      // those state updates into a single paint. A small queue guarantees that
      // the answer remains visibly progressive even when the transport bursts.
      let pendingText = '';
      let drainTimer: ReturnType<typeof setTimeout> | null = null;
      let completedPayload: SseDoneEvent | null = null;
      const DISPLAY_CHARS_PER_TICK = 8;
      const DISPLAY_TICK_MS = 30;

      const drainTextQueue = () => {
        drainTimer = null;
        if (pendingText) {
          const visibleChunk = pendingText.slice(0, DISPLAY_CHARS_PER_TICK);
          pendingText = pendingText.slice(visibleChunk.length);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingMsgId
                ? { ...m, content: m.content + visibleChunk }
                : m
            )
          );
        }

        if (pendingText) {
          drainTimer = setTimeout(drainTextQueue, DISPLAY_TICK_MS);
        } else if (completedPayload) {
          finishStream(completedPayload);
        }
      };

      const scheduleTextDrain = () => {
        if (drainTimer === null) {
          drainTimer = setTimeout(drainTextQueue, DISPLAY_TICK_MS);
        }
      };

      const finishStream = (payload: SseDoneEvent) => {
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
              ? {
                  ...m,
                  // The server may apply a final transport-level redaction
                  // after parsing metadata. Reconcile the streamed text
                  // with that canonical answer before marking it complete.
                  content: payload.metadata.jarvis?.pastoralText
                    ?? payload.metadata.displayAnswer
                    ?? payload.metadata.answer
                    ?? m.content,
                  isStreaming: false,
                  metadata: payload.metadata,
                }
              : m
          )
        );
        setRetrievalFailure(
          payload.metadata.retrievalFailures?.length
            ? payload.metadata.retrievalFailures
            : null,
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
        const isNavigationOnly = Boolean(
          payload.metadata.resourceActions?.some((action) => action.kind === 'OPEN')
          || payload.metadata.capabilityActions?.some((action) => action.kind === 'OPEN')
        );
        if (
          payload.metadata.nextStep &&
          payload.metadata.nextStep.action &&
          !memoryDecided &&
          !isNavigationOnly
        ) {
          setMemoryPrompt(payload.metadata.nextStep.action);
        }

        // Canonical imperative requests are already authenticated and validated
        // by the server. Execute their returned action immediately instead of
        // making the member tap a duplicate button. Questions and ambiguous
        // requests never have an automatic action.
        const immediateAction = getImmediateEmmausAction(payload.metadata);
        if (immediateAction) {
          executeValidatedEmmausAction(immediateAction, setLocation);
        }
        // Do not programmatically focus the follow-up textarea — doing so
        // causes the browser to scroll it into view, overriding the scroll
        // position set above. Users tap the textarea themselves on mobile.
      };

      const callbacks = {
        onText: (chunk: string) => {
          pendingText += chunk;
          scheduleTextDrain();
        },
        onDone: (payload: SseDoneEvent) => {
          completedPayload = payload;
          scheduleTextDrain();
        },
        onError: (message: string) => {
          if (drainTimer !== null) clearTimeout(drainTimer);
          drainTimer = null;
          pendingText = '';
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
        const appendContext = contextOverride
          ? {
              ...contextOverride,
              conversationId: convId,
              userName: user.preferredName,
            }
          : {
              entryPoint: 'personal' as const,
              conversationId: convId,
              userName: user.preferredName,
            };
        appendMessage({
          userId: user.id,
          conversationId: convId,
          message: text,
          context: appendContext,
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

    // Preserve the originating Bible/Walk/Journey context for typed follow-ups
    // such as "what about this verse?" instead of silently falling back to the
    // generic Personal context.
    streamResponse(trimmed, conversationId, history, initialContext ?? undefined);
  }

  function handleRetryRetrieval() {
    if (!retrievalFailure || isStreaming || !user) return;
    const previousUser = [...messages].reverse().find((message) => message.role === 'user');
    if (!previousUser) return;
    const history: HistoryItem[] = messages
      .filter((m) => !m.isStreaming)
      .map((m) => ({ role: m.role, content: m.content }));
    const userMsgId = `user-${Date.now()}`;
    setMessages((prev) => [...prev, { id: userMsgId, role: 'user', content: previousUser.content }]);
    streamResponse(previousUser.content, conversationId, history, initialContext ?? undefined);
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

  function handleBack() {
    // New conversations launched from a page keep that page as their return
    // destination. Existing saved conversations have no launch destination and
    // should return to Ask Emmaus Home as before.
    const destination = params.id ? null : getReturnDestination();
    clearReturnDestination();
    setLocation(destination?.pathname ?? '/personal/ask-emmaus');
  }

  // ─── Crisis mode ─────────────────────────────────────────────────────────────

  if (isCrisisMode) {
    return <SafetyHandoverCard onReturn={handleBack} />;
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div ref={rootRef} className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[560px] mx-auto">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
          <div className="min-w-[44px]" aria-hidden="true" />
        </div>
      </header>

      {/* Conversation */}
      <main
        ref={mainRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pt-6 pb-28 max-w-[560px] mx-auto w-full space-y-8"
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
                    : msg.content ? (
                      <InlineScriptureProse
                        text={msg.content}
                        references={msg.metadata?.scriptureReferences ?? (msg.metadata?.scripture ? [msg.metadata.scripture] : [])}
                        resources={[
                          ...(msg.metadata?.recommendations ?? []),
                          ...(msg.metadata?.sermonRecommendations ?? []).map((sermon) => ({
                            title: sermon.title,
                            path: sermon.openPath ?? sermon.watchUrl,
                          })),
                        ]}
                      />
                    ) : null}
                </div>

                {/* Hear Emmaus — read completed response aloud */}
                {!msg.isStreaming && msg.content && user && (
                  <HearEmmausButton
                    text={msg.content}
                    userId={user.id}
                    label="Hear Emmaus read this response"
                    variant="pill"
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
                    {!msg.metadata.nextStep && msg.metadata.jarvis?.suggestedNextAction && (
                      <button
                        type="button"
                        onClick={() => {
                          executeValidatedEmmausAction(
                            msg.metadata?.jarvis?.suggestedNextAction,
                            setLocation,
                          );
                        }}
                        className="w-full rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left text-[13px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                      >
                        {msg.metadata.jarvis.suggestedNextAction.label}
                      </button>
                    )}
                    {msg.metadata.capabilityActions?.map((action) => (
                      <button
                        key={`${action.capabilityId}:${action.kind}:${action.route}`}
                        type="button"
                        onClick={() => {
                          executeValidatedEmmausAction(action, setLocation);
                        }}
                        className="w-full rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left text-[13px] font-semibold text-primary hover:bg-primary/10 transition-colors"
                      >
                        {action.label}
                      </button>
                    ))}
                    {msg.metadata.recommendations.slice(0, 3).map((rec, i) => (
                      <ResourceCard
                        key={i}
                        recommendation={rec}
                        actions={msg.metadata?.resourceActions?.filter((action) =>
                          action.resourceId === rec.resourceId
                        )}
                      />
                    ))}
                    {msg.metadata.sermonRecommendations?.slice(0, 3).map((sermon) => (
                      <SermonRecommendationCard key={sermon.sermonId} sermon={sermon} />
                    ))}
                    {msg.metadata.nextSteps &&
                      msg.metadata.nextSteps.length > 0 &&
                      !(
                        (msg.metadata.sermonRecommendations?.length ?? 0) > 0 &&
                        msg.metadata.nextSteps.every((step) => step.type === 'listen')
                      ) && (
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

        {!isStreaming && messages.length > 0 && (
          <div className="pt-2 pb-4">
            <label htmlFor="follow-up-input" className="sr-only">
              Continue the conversation
            </label>
            <EmmausComposer
              id="follow-up-input"
              value={followUp}
              onChange={setFollowUp}
              onSend={handleFollowUp}
              placeholder="Ask a follow-up…"
              isLoading={isStreaming}
              compact
              aria-label="Follow-up message"
            />
          </div>
        )}
        <div aria-hidden="true" className="h-16" />
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

      {retrievalFailure && !isStreaming && (
        <div className="flex-shrink-0 px-4 pt-2 max-w-[560px] mx-auto w-full">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[13px] text-amber-800">
              I couldn’t reach all of the trusted sources for this answer.
            </p>
            <button
              type="button"
              onClick={handleRetryRetrieval}
              className="mt-2 text-[13px] font-medium text-amber-900 underline"
            >
              Try the search again
            </button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
