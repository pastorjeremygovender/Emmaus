/**
 * Ask Emmaus — Home Screen
 *
 * Entry point from Personal. Shows:
 * - Title + subtitle
 * - Multiline textarea for the user's question
 * - Six tappable suggested-prompt chips
 * - "Continue" primary button
 * - Small disclaimer
 * - Previous conversations list (if any)
 */

import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ChevronRight, Clock, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { listConversations, type ConversationStub, type FlatContext } from '@/lib/emmaus-client';
import { setPendingMessage, takePendingContext } from '@/lib/emmaus-pending';

const SUGGESTED_PROMPTS = [
  'I feel far from God',
  'Help me understand a passage',
  "I'm struggling with something",
  'What does the Bible say about this?',
  'I want to grow in prayer',
  'How do I find peace today?',
];

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
  bible: 'Bible',
  walk: 'Walk',
  journeys: 'Journeys',
  sermons: 'Sermons',
  personal: 'Personal',
  standalone: 'Ask Emmaus',
};

/** Build a short human-readable label from a FlatContext, or null if generic. */
function buildContextLabel(ctx: FlatContext): string | null {
  if (!ctx.entryPoint || ctx.entryPoint === 'personal' || ctx.entryPoint === 'standalone') {
    return null;
  }
  if (ctx.bookName && ctx.chapter) return `${ctx.bookName} ${ctx.chapter}`;
  if (ctx.journeyTitle && ctx.currentDay) return `${ctx.journeyTitle} — Day ${ctx.currentDay}`;
  if (ctx.journeyTitle) return ctx.journeyTitle;
  if (ctx.chapterHeading) return ctx.chapterHeading; // room name passed via this field
  return null;
}

export default function AskEmmausHome() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [message, setMessage] = useState('');
  const [conversations, setConversations] = useState<ConversationStub[]>([]);
  const [fabContext, setFabContext] = useState<FlatContext | null>(null);
  const [returnPath, setReturnPath] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    // Pick up any context set by FloatingEmmausButton
    const pending = takePendingContext();
    if (pending) {
      setFabContext(pending.context);
      setReturnPath(pending.returnPath);
    }
    if (!user) return;
    listConversations(user.id).then(setConversations);
  }, [user]);

  function handleChipClick(prompt: string) {
    setMessage(prompt);
    textareaRef.current?.focus();
  }

  function handleContinue() {
    const trimmed = message.trim();
    if (!trimmed || !user) return;
    // Merge FAB context with user identity; fall back to personal entry point
    const context: FlatContext = fabContext
      ? { ...fabContext, userName: user.preferredName }
      : { entryPoint: 'personal', userName: user.preferredName };
    setPendingMessage(trimmed, context);
    setLocation('/personal/ask-emmaus/conversation');
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleContinue();
    }
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => setLocation(returnPath ?? '/personal')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label={returnPath ? 'Back' : 'Back to Personal'}
          >
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
          <div className="flex-1" />
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-8">

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-[28px] font-serif font-medium text-foreground leading-tight">
            Ask Emmaus
          </h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            Bring your questions, doubts, and moments — Emmaus walks alongside you.
          </p>

          {/* Context label — shown when arriving via the floating button */}
          {fabContext && buildContextLabel(fabContext) && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[13px] text-primary/80 bg-primary/8 border border-primary/15 rounded-full px-3 py-1 leading-snug">
                Discussing: {buildContextLabel(fabContext)}
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

        {/* Input */}
        <div className="space-y-3">
          <label htmlFor="emmaus-input" className="sr-only">
            What's on your mind?
          </label>
          <Textarea
            id="emmaus-input"
            ref={textareaRef}
            placeholder="What's on your mind?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            className="resize-none bg-background border-border text-[16px] leading-relaxed rounded-xl min-h-[120px] focus-visible:ring-primary/30"
            aria-label="Your message to Emmaus"
            autoFocus
          />

          {/* Suggested prompts */}
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Suggested prompts"
          >
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                onClick={() => handleChipClick(prompt)}
                className={[
                  'px-3 py-1.5 rounded-full border text-[13px] leading-snug transition-all',
                  message === prompt
                    ? 'border-primary/40 bg-primary/10 text-primary font-medium'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground',
                ].join(' ')}
                aria-pressed={message === prompt}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        {/* Continue */}
        <Button
          className="w-full h-12 rounded-xl text-[16px] gap-1.5"
          onClick={handleContinue}
          disabled={!message.trim()}
          aria-label="Continue to conversation"
        >
          Continue
          <ChevronRight size={17} aria-hidden="true" />
        </Button>

        {/* Disclaimer */}
        <p className="text-[12px] text-muted-foreground leading-relaxed text-center">
          Emmaus offers pastoral reflection, not professional advice.{' '}
          If you are in crisis, please contact{' '}
          <a href="tel:116123" className="underline underline-offset-2 hover:text-foreground">
            Samaritans on 116 123
          </a>.
        </p>

        {/* Previous conversations */}
        {conversations.length > 0 && (
          <section className="space-y-3 pt-2 pb-6">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
              <Clock size={11} aria-hidden="true" />
              Previous conversations
            </h2>
            <div className="space-y-2">
              {conversations.slice(0, 8).map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => setLocation(`/personal/ask-emmaus/history/${conv.id}`)}
                  className="w-full text-left"
                >
                  <Card className="border-border hover:border-primary/30 transition-all">
                    <CardContent className="p-3.5 flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0"
                        aria-hidden="true"
                      >
                        <MessageCircle size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-foreground truncate">
                          {conv.title}
                        </p>
                        <p className="text-[12px] text-muted-foreground mt-0.5">
                          {ENTRY_POINT_LABELS[conv.entryPoint] ?? 'Ask Emmaus'} ·{' '}
                          {formatDate(conv.updatedAt)}
                        </p>
                      </div>
                      <ChevronRight
                        size={15}
                        className="text-muted-foreground shrink-0"
                        aria-hidden="true"
                      />
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          </section>
        )}

      </main>
    </div>
  );
}
