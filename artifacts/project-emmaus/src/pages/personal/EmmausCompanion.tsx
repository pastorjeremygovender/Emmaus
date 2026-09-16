/**
 * Emmaus Companion — presence surface (not Ask Emmaus).
 *
 * Ask Emmaus stays at /personal/ask-emmaus. This route is the Jarvis-shaped
 * companion: one living reply, resource actions from the existing server
 * contract, no chat transcript as the product.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  appendMessage,
  executeValidatedEmmausAction,
  getImmediateEmmausAction,
  startConversation,
  type EmmausMetadata,
  type FlatContext,
} from '@/lib/emmaus-client';
import { getDailyRhythmState } from '@/lib/journeys-api';

type Presence = 'resting' | 'hearing' | 'with-you' | 'interrupted';

export default function EmmausCompanion() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [presence, setPresence] = useState<Presence>('resting');
  const [spoken, setSpoken] = useState('');
  const [draft, setDraft] = useState('');
  const [action, setAction] = useState<{ label: string; route: string } | null>(null);
  const [dayLine, setDayLine] = useState<string | null>(null);
  const [todayDay, setTodayDay] = useState<number | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const spokenRef = useRef('');

  useEffect(() => {
    let cancelled = false;
    void getDailyRhythmState()
      .then((state) => {
        if (cancelled || !state?.todayAvailableDay) return;
        const title = state.currentStepTitle?.trim();
        setTodayDay(state.todayAvailableDay);
        setDayLine(
          title
            ? `Today is day ${state.todayAvailableDay} — ${title}.`
            : `Today is day ${state.todayAvailableDay} of 10 Minutes with Jesus.`,
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const contextForTurn = useCallback((): FlatContext => {
    return {
      entryPoint: 'personal',
      userName: user?.preferredName,
      conversationId: conversationIdRef.current ?? undefined,
      currentDay: todayDay ?? undefined,
      journeyTitle: '10 Minutes with Jesus',
      journeyType: 'daily-rhythm',
      voiceAppContext: dayLine ?? undefined,
    };
  }, [dayLine, todayDay, user?.preferredName]);

  const speakFromEmmaus = useCallback((message: string) => {
    if (!user?.id || !message.trim()) return;
    abortRef.current?.abort();
    spokenRef.current = '';
    setSpoken('');
    setAction(null);
    setPresence('with-you');

    const callbacks = {
      onText: (chunk: string) => {
        spokenRef.current += chunk;
        setSpoken(spokenRef.current);
      },
      onDone: (payload: { conversationId: string; metadata: EmmausMetadata }) => {
        conversationIdRef.current = payload.conversationId;
        const next = getImmediateEmmausAction(payload.metadata);
        const labeled = payload.metadata.jarvis?.suggestedNextAction
          ?? payload.metadata.resourceActions?.[0]
          ?? payload.metadata.capabilityActions?.[0];
        if (next?.route && labeled?.label) {
          setAction({ label: labeled.label, route: next.route });
        } else if (next?.route) {
          setAction({ label: 'Continue in Emmaus', route: next.route });
        }
        setPresence('resting');
      },
      onError: (err: string) => {
        setSpoken(err);
        setPresence('interrupted');
      },
    };

    abortRef.current = conversationIdRef.current
      ? appendMessage({
          userId: user.id,
          conversationId: conversationIdRef.current,
          message: message.trim(),
          context: contextForTurn(),
          callbacks,
        })
      : startConversation({
          userId: user.id,
          message: message.trim(),
          context: contextForTurn(),
          callbacks,
        });
  }, [contextForTurn, user?.id]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    setPresence('hearing');
    speakFromEmmaus(text);
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="h-12 flex items-center justify-between px-4">
        <button
          type="button"
          onClick={() => setLocation('/walk')}
          className="p-2 -ml-2 min-h-[44px] min-w-[44px] text-muted-foreground"
          aria-label="Back"
        >
          <ArrowLeft size={22} />
        </button>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Emmaus</p>
        <span className="w-11" />
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-8 pb-8 text-center gap-8">
        <div
          className={`h-28 w-28 rounded-full border ${
            presence === 'with-you'
              ? 'border-primary/50 bg-primary/10'
              : presence === 'hearing'
                ? 'border-primary/30 bg-primary/5'
                : 'border-border bg-card'
          }`}
          aria-hidden="true"
        />
        <div className="space-y-3 max-w-sm">
          <p className="text-[13px] text-muted-foreground">
            {presence === 'with-you'
              ? 'Emmaus is with you'
              : presence === 'hearing'
                ? 'Emmaus is listening'
                : presence === 'interrupted'
                  ? 'Emmaus could not finish'
                  : 'Emmaus is here'}
          </p>
          <p className="font-serif text-xl leading-relaxed">
            {spoken || dayLine || 'Speak when you are ready. I already know today in Emmaus.'}
          </p>
        </div>
        {action && (
          <button
            type="button"
            className="rounded-full bg-primary text-primary-foreground px-5 py-3 text-sm"
            onClick={() => executeValidatedEmmausAction(action, (route) => setLocation(route))}
          >
            {action.label}
          </button>
        )}
      </main>

      <form onSubmit={handleSubmit} className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <label className="sr-only" htmlFor="emmaus-companion-say">
          Speak to Emmaus
        </label>
        <input
          id="emmaus-companion-say"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="I’m here…"
          className="w-full rounded-full border border-border bg-card px-5 py-3 text-[15px] outline-none focus:border-primary/40"
        />
      </form>
    </div>
  );
}
