/**
 * Ask Emmaus — Conversation History View
 *
 * Read-only view of a past conversation, loaded by conversationId.
 * No follow-up input (history is read-only — user returns to home to start fresh).
 */

import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getMessages, type StoredMessage } from '@/lib/emmaus-client';
import { BottomNav } from '@/components/BottomNav';
import { ScriptureCard } from '@/components/emmaus/ScriptureCard';
import { NextStepCard } from '@/components/emmaus/NextStepCard';
import { ResourceCard } from '@/components/emmaus/ResourceCard';

function renderProse(text: string) {
  const paragraphs = text.split(/\n{2,}/).filter(Boolean);
  if (paragraphs.length <= 1) {
    return (
      <p className="text-[16px] text-foreground leading-[1.75] font-sans">{text}</p>
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

export default function AskEmmausHistory() {
  const { user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [messages, setMessages] = useState<StoredMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !id) return;
    getMessages(user.id, id).then((msgs) => {
      setMessages(msgs);
      setLoading(false);
    });
  }, [user, id]);

  return (
    <div className="min-h-[100dvh] bg-background">
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
            <p className="text-[14px] font-medium text-muted-foreground">Past conversation</p>
          </div>
          <div className="min-w-[44px]" aria-hidden="true" />
        </div>
      </header>

      <main className="px-5 pt-6 pb-24 max-w-[560px] mx-auto space-y-8">
        {loading && (
          <p className="text-[15px] text-muted-foreground pt-8 text-center">Loading…</p>
        )}

        {!loading && messages.length === 0 && (
          <div className="pt-16 text-center">
            <p className="text-[15px] text-muted-foreground">
              This conversation could not be found.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id}>
            {msg.role === 'user' ? (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  You
                </p>
                <p className="text-[16px] text-foreground leading-relaxed">{msg.content}</p>
              </div>
            ) : (
              <div className="space-y-5">
                {renderProse(msg.content)}
                {msg.metadata && (
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
              </div>
            )}
          </div>
        ))}
      </main>
      <BottomNav />
    </div>
  );
}
