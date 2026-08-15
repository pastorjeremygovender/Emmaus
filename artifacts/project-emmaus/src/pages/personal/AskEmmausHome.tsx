/**
 * Ask Emmaus — Home Screen (redesigned)
 *
 * Single-screen layout when idle; transitions to a WhatsApp-style
 * composer-focused view the moment the user starts typing.
 *
 * "Talk to Emmaus" voice button pulses with an animate-ping ring.
 */

import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, Clock, MessageCircle, ChevronRight, Mic } from 'lucide-react';
import { EmmausComposer } from '@/components/emmaus/EmmausComposer';
import { useAuth } from '@/contexts/AuthContext';
import { useVoiceEnabled } from '@/hooks/useVoiceEnabled';
import { BottomNav } from '@/components/BottomNav';
import { listConversations, type ConversationStub, type FlatContext } from '@/lib/emmaus-client';
import {
  setPendingMessage,
  setPendingContext,
  takePendingContext,
  getReturnDestination,
  clearReturnDestination,
} from '@/lib/emmaus-pending';
import { unlockVoiceAudio } from '@/lib/voice-audio-unlock';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTED_PROMPTS = [
  'I feel far from God',
  'Help me understand a passage',
  "I'm struggling with something",
  'What does the Bible say about this?',
  'I want to grow in prayer',
  'How do I find peace today?',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

const ENTRY_POINT_LABELS: Record<string, string> = {
  bible: 'My Bible',
  walk: "Today's Steps",
  journeys: 'Next Steps',
  sermons: 'Sermons',
  personal: 'My Journey',
  standalone: 'Ask Emmaus',
};

function buildContextLabel(ctx: FlatContext): string | null {
  if (!ctx.entryPoint || ctx.entryPoint === 'personal' || ctx.entryPoint === 'standalone') return null;
  if (ctx.bookName && ctx.chapter) return `${ctx.bookName} ${ctx.chapter}`;
  if (ctx.journeyTitle && ctx.currentDay) return `${ctx.journeyTitle} — Day ${ctx.currentDay}`;
  if (ctx.journeyTitle) return ctx.journeyTitle;
  if (ctx.chapterHeading) return ctx.chapterHeading;
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AskEmmausHome() {
  const { user } = useAuth();
  const voiceEnabled = useVoiceEnabled(user?.id);
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState('');
  const [conversations, setConversations] = useState<ConversationStub[]>([]);
  const [fabContext, setFabContext] = useState<FlatContext | null>(null);

  const isTyping = message.length > 0;

  useEffect(() => {
    window.scrollTo(0, 0);
    const pending = takePendingContext();
    if (pending) setFabContext(pending.context);
    if (!user) return;
    listConversations(user.id).then(setConversations);
  }, [user]);

  function handleBack() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      const dest = getReturnDestination();
      clearReturnDestination();
      setLocation(dest?.pathname ?? '/walk');
    }
  }

  function handleContinue() {
    const trimmed = message.trim();
    if (!trimmed || !user) return;
    const context: FlatContext = fabContext
      ? { ...fabContext, userName: user.preferredName }
      : { entryPoint: 'personal', userName: user.preferredName };
    setPendingMessage(trimmed, context);
    setLocation('/personal/ask-emmaus/conversation');
  }

  const contextLabel = fabContext ? buildContextLabel(fabContext) : null;

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
          'flex flex-col px-5 transition-all duration-250 overflow-hidden',
          isTyping
            ? 'flex-none max-h-0 opacity-0 pointer-events-none'
            : 'flex-1 justify-center gap-5 pb-2',
        )}
      >
        {/* Heading */}
        <div className="space-y-1.5">
          <h1 className="text-[26px] font-sans font-medium text-foreground leading-tight">
            Ask Emmaus
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Bring your questions, doubts, and moments — Emmaus walks alongside you.
          </p>
          {contextLabel && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[13px] text-primary/80 bg-primary/8 border border-primary/15 rounded-full px-3 py-1 leading-snug">
                Discussing: {contextLabel}
              </span>
              <button
                onClick={() => setFabContext(null)}
                className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear context"
              >
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Voice button with pulsing ring */}
        {voiceEnabled === true && (
          <div className="flex flex-col items-center gap-2.5">
            <div className="relative inline-flex">
              {/* Subtle pulse ring */}
              <span
                className="absolute -inset-1.5 rounded-full border border-primary/20 animate-pulse"
                aria-hidden="true"
              />
              <button
                onClick={() => {
                  if (!user) return;
                  const context = fabContext
                    ? { ...fabContext, userName: user.preferredName }
                    : { entryPoint: 'personal' as const, userName: user.preferredName };
                  setPendingContext(context);
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

        {/* Suggested prompts */}
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Suggested prompts"
        >
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              onClick={() => setMessage(prompt)}
              className="px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground text-[13px] leading-snug hover:border-primary/30 hover:text-foreground transition-all"
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Disclaimer + past conversations */}
        <div className="space-y-2.5">
          <p className="text-[12px] text-muted-foreground leading-relaxed text-center">
            Emmaus offers pastoral reflection, not counseling or professional advice.
          </p>
          {conversations.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
                <Clock size={11} aria-hidden="true" />
                Recent
              </p>
              {conversations.slice(0, 2).map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setLocation(`/personal/ask-emmaus/history/${conv.id}`)}
                  className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border bg-card hover:border-primary/30 transition-all text-left"
                >
                  <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <MessageCircle size={13} aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-foreground truncate">{conv.title}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {ENTRY_POINT_LABELS[conv.entryPoint] ?? 'Ask Emmaus'} · {formatDate(conv.updatedAt)}
                    </p>
                  </div>
                  <ChevronRight size={14} className="text-muted-foreground shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
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
        <EmmausComposer
          id="emmaus-input"
          value={message}
          onChange={setMessage}
          onSend={handleContinue}
          placeholder="What's on your mind?"
          autoFocus
          aria-label="Your message to Emmaus"
        />
      </div>

      <BottomNav />
    </div>
  );
}
