/**
 * Emmaus Companion — presence surface (not Ask Emmaus).
 *
 * Same conversation API as Ask Emmaus. Different embodiment: one reply,
 * visible working state, send control, and server-owned actions.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ArrowUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  appendMessage,
  executeValidatedEmmausAction,
  startConversation,
  type EmmausMetadata,
  type FlatContext,
  type SermonRecommendation,
} from '@/lib/emmaus-client';
import { getDailyRhythmState } from '@/lib/journeys-api';

type Presence = 'resting' | 'hearing' | 'with-you' | 'interrupted';

type CompanionMove = {
  label: string;
  route: string;
};

function titleFromRoute(route: string): string {
  const path = route.split('?')[0];
  const rhythm = path.match(/\/daily-rhythm\/day\/(\d+)/);
  if (rhythm) return `Open 10 Minutes with Jesus — day ${rhythm[1]}`;
  if (path.includes('/bible')) return 'Open in Bible';
  if (path.includes('/sermon-companion')) return 'Open Sermon Companion';
  if (path.includes('/sermon')) return 'Open sermon';
  if (path.includes('/walk')) return 'Open this Walk';
  if (path.includes('/journey')) return 'Open this Journey';
  if (path.includes('/group') || path.includes('/room')) return 'Open this room';
  if (path.includes('/devotional')) return 'Open this devotional';
  return 'Continue in Emmaus';
}

function typeLabel(resourceType?: string): string | null {
  switch (resourceType) {
    case 'daily-rhythm':
      return 'Open 10 Minutes with Jesus';
    case 'bible':
      return 'Open in Bible';
    case 'walk':
      return 'Open this Walk';
    case 'journey':
      return 'Open this Journey';
    case 'sermon':
      return 'Open this sermon';
    case 'sermon-companion':
      return 'Open Sermon Companion';
    case 'devotional':
      return 'Open this devotional';
    case 'room':
      return 'Open this room';
    default:
      return null;
  }
}

function movesFromMetadata(metadata: EmmausMetadata): CompanionMove[] {
  const moves: CompanionMove[] = [];
  const seen = new Set<string>();
  const recs = metadata.recommendations ?? [];
  const add = (label: string, route?: string) => {
    if (!route || (!route.startsWith('/') && !route.startsWith('http')) || route.startsWith('//') || seen.has(route)) return;
    const clean = label.replace(/\s+/g, ' ').trim();
    if (!clean || clean.toLowerCase() === 'open this') return;
    seen.add(route);
    moves.push({ label: clean, route });
  };

  const namedRoute = (route?: string, resourceId?: string) =>
    recs.find((item) => (route && item.path === route) || (resourceId && item.resourceId === resourceId));

  for (const item of metadata.capabilityActions ?? []) {
    add(item.label || titleFromRoute(item.route), item.route);
  }
  for (const item of metadata.resourceActions ?? []) {
    const named = namedRoute(item.route, item.resourceId);
    add(named?.title || typeLabel(item.resourceType) || titleFromRoute(item.route), item.route);
  }
  if (metadata.scripture?.book) {
    const chapter = metadata.scripture.chapter;
    const bookId = metadata.scripture.book.toLowerCase().replace(/\s+/g, '-');
    add(`Open ${metadata.scripture.reference}`, `/bible/read/${bookId}/${chapter}`);
  }
  for (const rec of recs) {
    add(rec.title, rec.path);
  }
  for (const step of metadata.nextSteps ?? []) {
    add(step.text, step.path);
  }
  if (metadata.nextStep?.path) {
    add(metadata.nextStep.primaryButtonText || metadata.nextStep.action, metadata.nextStep.path);
  }
  for (const sermon of (metadata.sermonRecommendations ?? []) as SermonRecommendation[]) {
    if (sermon.openPath) add(sermon.title, sermon.openPath);
    if (sermon.watchUrl) add(`Watch ${sermon.title}`, sermon.watchUrl);
  }
  const suggested = metadata.jarvis?.suggestedNextAction;
  if (suggested?.route) add(suggested.label, suggested.route);
  return moves.slice(0, 3);
}

function isOpenBibleAsk(text: string): boolean {
  return /^(please\s+)?(open|go to|show|take me to)\s+(my\s+)?(the\s+)?bible\b/i.test(text.trim())
    || /^(my\s+)?bible$/i.test(text.trim());
}

function isOpenTodayRhythmAsk(text: string): boolean {
  return /(10\s*minutes?\s+with\s+jesus|daily rhythm|today'?s\s+(reading|rhythm|opening))/i.test(text);
}

const PRESENCE_KEY = 'emmaus_companion_presence';

type SavedPresence = {
  conversationId: string | null;
  spoken: string;
  moves: CompanionMove[];
};

function readPresence(): SavedPresence | null {
  try {
    const raw = sessionStorage.getItem(PRESENCE_KEY);
    return raw ? JSON.parse(raw) as SavedPresence : null;
  } catch {
    return null;
  }
}

function writePresence(next: SavedPresence) {
  sessionStorage.setItem(PRESENCE_KEY, JSON.stringify(next));
}

export default function EmmausCompanion() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const saved = readPresence();
  const [presence, setPresence] = useState<Presence>('resting');
  const [spoken, setSpoken] = useState(saved?.spoken ?? '');
  const [draft, setDraft] = useState('');
  const [moves, setMoves] = useState<CompanionMove[]>(saved?.moves ?? []);
  const [dayLine, setDayLine] = useState<string | null>(null);
  const [todayDay, setTodayDay] = useState<number | null>(null);
  const conversationIdRef = useRef<string | null>(saved?.conversationId ?? null);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const spokenRef = useRef(saved?.spoken ?? '');

  function remember(nextSpoken: string, nextMoves: CompanionMove[], conversationId = conversationIdRef.current) {
    writePresence({
      conversationId,
      spoken: nextSpoken,
      moves: nextMoves,
    });
    if (conversationId && !window.location.pathname.includes(conversationId)) {
      window.history.replaceState(null, '', `/personal/companion/${conversationId}`);
    }
  }

  function openMove(route: string) {
    remember(spokenRef.current || spoken, moves, conversationIdRef.current);
    if (route.startsWith('http')) {
      window.open(route, '_blank', 'noopener,noreferrer');
      return;
    }
    executeValidatedEmmausAction({ label: route, route }, (next) => setLocation(next));
  }

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

  const contextForTurn = useCallback((): FlatContext => ({
    entryPoint: 'personal',
    userName: user?.preferredName,
    conversationId: conversationIdRef.current ?? undefined,
    currentDay: todayDay ?? undefined,
    journeyTitle: '10 Minutes with Jesus',
    journeyType: 'daily-rhythm',
    voiceAppContext: [
      dayLine,
      'Companion surface. Keep the spoken reply under 80 words.',
      'Prefer one Scripture and one Emmaus action over a long essay.',
      'If the member asks to open the Bible, Daily Rhythm, a Walk, or a sermon, return an OPEN action.',
    ].filter(Boolean).join(' '),
  }), [dayLine, todayDay, user?.preferredName]);

  const speakFromEmmaus = useCallback((message: string) => {
    if (!user?.id || !message.trim()) return;
    abortRef.current?.abort();
    spokenRef.current = '';
    setSpoken('');
    setMoves([]);
    setPresence('hearing');

    const callbacks = {
      onText: (chunk: string) => {
        if (!chunk) return;
        spokenRef.current += chunk;
        setSpoken(spokenRef.current);
        setPresence('with-you');
      },
      onDone: (payload: { conversationId: string; metadata: EmmausMetadata }) => {
        conversationIdRef.current = payload.conversationId;
        const canonical = payload.metadata.jarvis?.pastoralText
          ?? payload.metadata.displayAnswer
          ?? payload.metadata.answer
          ?? spokenRef.current;
        spokenRef.current = canonical;
        const nextMoves = movesFromMetadata(payload.metadata);
        setSpoken(canonical);
        setMoves(nextMoves);
        remember(canonical, nextMoves, payload.conversationId);
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
  }, [contextForTurn, setLocation, user?.id]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || presence === 'hearing' || presence === 'with-you') return;
    setDraft('');

    if (isOpenBibleAsk(text)) {
      setSpoken('Opening the Bible.');
      setMoves([{ label: 'My Bible', route: '/bible' }]);
      setLocation('/bible');
      return;
    }
    if (isOpenTodayRhythmAsk(text) && todayDay) {
      const route = `/daily-rhythm/day/${todayDay}`;
      setSpoken(dayLine ?? 'Opening today’s 10 Minutes with Jesus.');
      setMoves([{ label: 'Open today’s reading', route }]);
      setLocation(route);
      return;
    }

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

      <main className="flex-1 flex flex-col items-center px-6 pb-6 text-center gap-6 overflow-y-auto">
        <div
          className={`mt-6 h-24 w-24 rounded-full border transition-colors ${
            presence === 'hearing' || presence === 'with-you'
              ? 'border-primary/50 bg-primary/10'
              : presence === 'interrupted'
                ? 'border-destructive/40 bg-destructive/5'
                : 'border-border bg-card'
          }`}
          aria-hidden="true"
        />
        <p className="text-[13px] text-muted-foreground" aria-live="polite">
          {presence === 'hearing'
            ? 'Emmaus heard you. Stay with me…'
            : presence === 'with-you'
              ? 'Emmaus is answering'
              : presence === 'interrupted'
                ? 'Emmaus could not finish'
                : 'Emmaus is here'}
        </p>
        <p className="font-serif text-xl leading-relaxed max-w-md whitespace-pre-wrap">
          {spoken || dayLine || 'Speak when you are ready. I already know today in Emmaus.'}
        </p>
        {moves.length > 0 && (
          <div className="flex flex-col gap-2 w-full max-w-sm">
            {moves.map((move) => (
              <button
                key={move.route}
                type="button"
                className="rounded-full border border-border bg-card px-4 py-3 text-sm"
                onClick={() => openMove(move.route)}
              >
                {move.label}
              </button>
            ))}
          </div>
        )}
      </main>

      <form
        onSubmit={handleSubmit}
        className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex items-center gap-2"
      >
        <label className="sr-only" htmlFor="emmaus-companion-say">
          Speak to Emmaus
        </label>
        <input
          id="emmaus-companion-say"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="I’m here…"
          disabled={presence === 'hearing' || presence === 'with-you'}
          className="flex-1 rounded-full border border-border bg-card px-5 py-3 text-[15px] outline-none focus:border-primary/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!draft.trim() || presence === 'hearing' || presence === 'with-you'}
          className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40"
          aria-label="Send to Emmaus"
        >
          <ArrowUp size={20} />
        </button>
      </form>
    </div>
  );
}
