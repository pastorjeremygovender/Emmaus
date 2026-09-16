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
import { getDailyRhythmState, getJourney } from '@/lib/journeys-api';

type Presence = 'resting' | 'hearing' | 'with-you' | 'interrupted';

type CompanionMove = {
  label: string;
  route: string;
};

function lastPathName(route: string): string {
  const parts = route.split('?')[0].split('/').filter(Boolean);
  const tail = parts[parts.length - 1] || '';
  return decodeURIComponent(tail).replace(/[-_]+/g, ' ').trim();
}

function pathsMatch(left?: string, right?: string): boolean {
  if (!left || !right) return false;
  const a = left.split('?')[0].replace(/\/+$/, '');
  const b = right.split('?')[0].replace(/\/+$/, '');
  return a === b || a.endsWith(b) || b.endsWith(a);
}

function titleFromRoute(route: string): string {
  const path = route.split('?')[0];
  const rhythm = path.match(/\/daily-rhythm\/day\/(\d+)/);
  if (rhythm) return `10 Minutes with Jesus — day ${rhythm[1]}`;
  if (path.includes('/bible')) return 'Open in Bible';
  const named = lastPathName(route);
  if (path.includes('/sermon-companion')) return named ? `Sermon Companion — ${named}` : 'Open Sermon Companion';
  if (path.includes('/sermon')) return named ? `Sermon — ${named}` : 'Open sermon';
  if (path.includes('/walk')) return named ? `Walk — ${named}` : 'Open this Walk';
  if (path.includes('/journey')) return named ? `Journey — ${named}` : 'Open this Journey';
  if (path.includes('/group') || path.includes('/room')) return named ? `Room — ${named}` : 'Open this room';
  if (path.includes('/devotional')) return named ? `Devotional — ${named}` : 'Open this devotional';
  if (path.includes('/bible-study') || path.includes('/study')) return named ? `Bible Study — ${named}` : 'Open this Bible study';
  return named ? named : 'Continue in Emmaus';
}

function kindFromRoute(route: string, resourceType?: string): string {
  const path = route.split('?')[0];
  if (resourceType === 'daily-rhythm' || path.includes('/daily-rhythm')) return '10 Minutes';
  if (resourceType === 'bible' || path.includes('/bible')) return 'Bible';
  if (resourceType === 'sermon-companion' || path.includes('/sermon-companion')) return 'Sermon Companion';
  if (resourceType === 'sermon' || path.includes('/sermon')) return 'Sermon';
  if (resourceType === 'room' || path.includes('/room') || path.includes('/group')) return 'Room';
  if (resourceType === 'walk' || path.includes('/walk')) return 'Walk';
  if (resourceType === 'devotional' || path.includes('/devotional')) return 'Devotional';
  if (resourceType === 'bible-study' || path.includes('/study')) return 'Bible study';
  if (resourceType === 'journey' || path.includes('/journey')) return 'Journey';
  return 'Emmaus';
}

function withKind(label: string, kind: string): string {
  const clean = label.replace(/^(Walk|Journey|Bible|Sermon Companion|Sermon|Room|Devotional|Bible study|10 Minutes) · /i, '').trim();
  return `${kind} · ${clean}`;
}

function scoreMove(label: string, route: string, spoken: string): number {
  const hay = `${label} ${route}`.toLowerCase();
  const said = spoken.toLowerCase();
  let score = 0;
  if (said && label && said.includes(label.toLowerCase().replace(/^(walk|journey|bible|sermon|room|devotional|10 minutes) · /i, '').trim())) score += 12;
  if (/hope in the storm/.test(said) && /hope in the storm|daily-rhythm/.test(hay)) score += 14;
  if (/john\s*6/.test(said) && /john|bible/.test(hay)) score += 10;
  if (route.includes('/daily-rhythm')) score += 7;
  if (route.includes('/bible')) score += 6;
  if (route.includes('/sermon')) score += 9;
  if (route.includes('/room') || route.includes('/group')) score += 2;
  if (/afraid|fear|storm|anxious/.test(said) && /what went wrong|sin entering|created in god/.test(hay)) score -= 14;
  return score;
}

function movesFromMetadata(metadata: EmmausMetadata, spoken = '', todayDay: number | null = null): CompanionMove[] {
  const moves: CompanionMove[] = [];
  const seen = new Set<string>();
  const recs = metadata.recommendations ?? [];
  const extras = metadata.resourceRecommendations ?? [];
  const add = (label: string, route?: string) => {
    if (!route || (!route.startsWith('/') && !route.startsWith('http')) || route.startsWith('//') || seen.has(route)) return;
    const clean = label.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    seen.add(route);
    moves.push({ label: clean, route });
  };

  const nameFor = (route?: string, resourceId?: string, resourceType?: string) => {
    const rec = recs.find((item) =>
      (resourceId && (item.resourceId === resourceId || item.sermonId === resourceId))
      || pathsMatch(item.path, route),
    );
    if (rec?.title) return rec.title;
    const extra = extras.find((item) => item.resourceId === resourceId);
    if (extra?.reason) return extra.reason;
    if (route) return titleFromRoute(route);
    return resourceType ? resourceType.replace(/-/g, ' ') : 'Continue in Emmaus';
  };

  for (const item of metadata.capabilityActions ?? []) {
    add(item.label || nameFor(item.route, undefined, item.capabilityId), item.route);
  }
  for (const item of metadata.resourceActions ?? []) {
    add(nameFor(item.route, item.resourceId, item.resourceType), item.route);
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

  if (/hope in the storm/i.test(spoken) && todayDay) {
    add('Hope in the Storm', `/daily-rhythm/day/${todayDay}`);
  }

  const used = new Set<string>();
  const unique = moves.filter((move) => {
    const key = move.label.toLowerCase();
    if (used.has(key)) return false;
    used.add(key);
    return true;
  }).map((move) => ({
    ...move,
    label: withKind(move.label, kindFromRoute(move.route)),
  }));

  unique.sort((a, b) => scoreMove(b.label, b.route, spoken) - scoreMove(a.label, a.route, spoken));
  return unique.slice(0, 3);
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
  const [presence, setPresence] = useState<Presence>('resting');
  const [spoken, setSpoken] = useState('');
  const [draft, setDraft] = useState('');
  const [moves, setMoves] = useState<CompanionMove[]>([]);
  const [dayLine, setDayLine] = useState<string | null>(null);
  const [todayDay, setTodayDay] = useState<number | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const abortRef = useRef<{ abort: () => void } | null>(null);
  const spokenRef = useRef('');

  useEffect(() => {
    const snap = (window.history.state && window.history.state.companionSnapshot) as SavedPresence | undefined;
    if (!snap) return;
    conversationIdRef.current = snap.conversationId;
    spokenRef.current = snap.spoken;
    setSpoken(snap.spoken);
    setMoves(snap.moves ?? []);
  }, []);

  function remember(nextSpoken: string, nextMoves: CompanionMove[], conversationId = conversationIdRef.current) {
    writePresence({
      conversationId,
      spoken: nextSpoken,
      moves: nextMoves,
    });
    const url = conversationId ? `/personal/companion/${conversationId}` : '/personal/companion';
    window.history.replaceState({ companionSnapshot: { conversationId, spoken: nextSpoken, moves: nextMoves } }, '', url);
  }

  async function nameJourneyMoves(nextMoves: CompanionMove[]): Promise<CompanionMove[]> {
    return Promise.all(nextMoves.map(async (move) => {
      const id = move.route.split('?')[0].match(/\/journeys?\/([^/]+)/)?.[1];
      if (!id) return move;
      try {
        const journey = await getJourney(id);
        if (journey?.title) return { ...move, label: journey.title };
      } catch {
        return move;
      }
      return move;
    }));
  }

  function startOver() {
    abortRef.current?.abort();
    conversationIdRef.current = null;
    spokenRef.current = '';
    setSpoken('');
    setMoves([]);
    setDraft('');
    setPresence('resting');
    sessionStorage.removeItem(PRESENCE_KEY);
    window.history.replaceState(null, '', '/personal/companion');
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
      onDone: async (payload: { conversationId: string; metadata: EmmausMetadata }) => {
        conversationIdRef.current = payload.conversationId;
        const canonical = payload.metadata.jarvis?.pastoralText
          ?? payload.metadata.displayAnswer
          ?? payload.metadata.answer
          ?? spokenRef.current;
        spokenRef.current = canonical;
        let nextMoves = movesFromMetadata(payload.metadata, canonical, todayDay);
        nextMoves = await nameJourneyMoves(nextMoves);
        nextMoves = nextMoves.map((move) => ({
          ...move,
          label: withKind(move.label, kindFromRoute(move.route)),
        }));
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
        <button
          type="button"
          onClick={startOver}
          className="text-[11px] text-muted-foreground min-h-[44px] px-1"
        >
          Start over
        </button>
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
