/**
 * FloatingEmmausButton — neutral translucent pill FAB.
 *
 * Hidden on: /, /auth, /checkin, /walk, /library, /journeys, /bible,
 *            /join-room/*, /admin, /admin/*,
 *            /personal/ask-emmaus, /personal/ask-emmaus/*,
 *            /personal (My Walk) and all /personal/* child screens.
 *
 * Before navigating to Ask Emmaus the FAB writes a ReturnDestination to
 * sessionStorage (via setReturnDestination) so that both AskEmmausHome and
 * AskEmmausConversation can return directly to the originating page in one tap.
 *
 * Uses the same quiet translucent surface treatment as the Bible navigation.
 */

import { useLocation } from 'wouter';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { useBible } from '@/contexts/BibleContext';
import { useRooms } from '@/contexts/RoomsContext';
import { useMeetingMedia } from '@/contexts/MeetingMediaContext';
import {
  setPendingContext,
  setReturnDestination,
  sourceSectionFromPath,
} from '@/lib/emmaus-pending';
import type { FlatContext } from '@/lib/emmaus-client';
import { getActiveSermonCompanionContext } from '@/lib/sermon-companion-context';
import { buildEmmausScreenContext } from '@/lib/emmaus-screen-context';





// ─── Routing helpers ──────────────────────────────────────────────────────────

const HIDDEN_PREFIXES = [
  '/personal/ask-emmaus',  // Ask Emmaus screens themselves
  '/personal/companion',
  '/admin',
  '/join-room',
  '/bible/read',           // Bible chapter reader — focused reading, no FAB
];

// Primary screens use the inline AskEmmausBar instead of the FAB
const HIDDEN_EXACT = new Set(['/', '/auth', '/checkin', '/walk', '/library', '/journeys', '/bible', '/personal']);

function isHidden(path: string): boolean {
  if (HIDDEN_EXACT.has(path)) return true;
  return HIDDEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + '/'));
}

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Context builder ──────────────────────────────────────────────────────────

function buildContext(
  path: string,
  lastRead: ReturnType<typeof useBible>['lastRead'],
  translationId: string,
  journeys: ReturnType<typeof useJourney>['journeys'],
  progress: ReturnType<typeof useJourney>['progress'],
  getStep: ReturnType<typeof useJourney>['getStep'],
  getMyRooms: ReturnType<typeof useRooms>['getMyRooms'],
  userId: string | undefined,
): FlatContext {
  const screenContext = buildEmmausScreenContext(path, {
    journeys,
    progress,
    getStep,
    lastRead,
    translationId,
  });
  if (screenContext.journeyId || screenContext.sermonId || screenContext.bookId) {
    return screenContext;
  }

  // Bible chapter reader
  const bibleReadMatch = path.match(/^\/bible\/read\/([^/]+)\/(\d+)/);
  if (bibleReadMatch) {
    const bookId = bibleReadMatch[1];
    const chapter = parseInt(bibleReadMatch[2], 10);
    const bookName = lastRead?.bookId === bookId ? lastRead.bookName : cap(bookId);
    const heading = lastRead?.bookId === bookId && lastRead.chapter === chapter
      ? lastRead.chapterHeading : undefined;
    return {
      entryPoint: 'bible',
      bookId,
      bookName,
      chapter,
      chapterHeading: heading
        ? `${heading} · ${translationId.toUpperCase()}`
        : `${translationId.toUpperCase()}`,
    };
  }

  // Journey day
  const journeyDayMatch = path.match(/^\/journey\/([^/]+)\/day\/(\d+)/);
  if (journeyDayMatch) {
    const journeyId = journeyDayMatch[1];
    const day = parseInt(journeyDayMatch[2], 10);
    const journey = journeys.find((j) => j.id === journeyId);
    const step = getStep(journeyId, day);
    return {
      entryPoint: 'journeys',
      journeyId,
      journeyTitle: journey?.title,
      currentDay: day,
      chapterHeading: step?.title,
    };
  }

  // Walk / My Emmaus
  if (path === '/walk') {
    const coreJourney = journeys.find((j) => j.journeyType === 'core');
    if (coreJourney) {
      const prog = progress[coreJourney.id];
      const currentDay = prog?.currentDay ?? 1;
      const step = getStep(coreJourney.id, currentDay);
      return {
        entryPoint: 'walk',
        journeyId: coreJourney.id,
        journeyTitle: coreJourney.title,
        currentDay,
        chapterHeading: step?.title,
      };
    }
    return { entryPoint: 'walk' };
  }

  // Room detail
  const roomMatch = path.match(/^\/rooms\/([^/]+)/);
  if (roomMatch && roomMatch[1] !== 'create' && roomMatch[1] !== 'join') {
    const roomId = roomMatch[1];
    const rooms = userId ? getMyRooms(userId) : [];
    const room = rooms.find((r) => r.id === roomId);
    return { entryPoint: 'personal', conversationId: undefined, chapterHeading: room?.name };
  }

  // Sermon Companion — overview and step reader
  if (path.match(/^\/sermon-companion\//)) {
    const ctx = getActiveSermonCompanionContext();
    return {
      entryPoint: 'personal' as const,
      sermonId: ctx?.sermonId,
      sermonTitle: ctx?.sermonTitle,
      scriptureReference: ctx?.scriptureReference,
      chapterHeading: ctx?.sermonTitle ?? 'Sermon Companion',
    };
  }

  // Bible hub / sub-pages
  if (path.startsWith('/bible')) {
    if (lastRead) {
      return {
        entryPoint: 'bible',
        bookId: lastRead.bookId,
        bookName: lastRead.bookName,
        chapter: lastRead.chapter,
        chapterHeading: lastRead.chapterHeading,
      };
    }
    return { entryPoint: 'bible' };
  }

  // Journeys hub / Next Steps
  if (path === '/journeys') return { entryPoint: 'journeys' };

  // Rooms hub
  if (path === '/rooms') return { entryPoint: 'personal' };

  return { entryPoint: 'personal' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingEmmausButton() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { journeys, progress, getStep } = useJourney();
  const { lastRead, translationId } = useBible();
  const { getMyRooms } = useRooms();
  const meeting = useMeetingMedia();
  if (!user || isHidden(location) || meeting.connected || meeting.prejoin || document.body.dataset.meetingUi === 'present') return null;

  function handlePress() {
    // 1. Persist the return destination in sessionStorage so both AskEmmausHome
    //    and AskEmmausConversation can return in one tap without losing state.
    setReturnDestination({
      pathname: location,
      scrollY: Math.round(window.scrollY),
      sourceSection: sourceSectionFromPath(location),
    });

    // 2. Save scroll position per-page key (Bible chapter restoration).
    const scrollKey = buildScrollKey(location);
    if (scrollKey) sessionStorage.setItem(scrollKey, String(Math.round(window.scrollY)));

    // 3. Build and store the conversation context label shown on AskEmmausHome.
    const ctx = buildContext(
      location, lastRead, translationId,
      journeys, progress, getStep, getMyRooms, user?.id,
    );
    setPendingContext(ctx);

    navigate('/personal/ask-emmaus');
  }

  // ── Shared inner button label ──────────────────────────────────────────────
  const label = (
    <>
      <span style={{ letterSpacing: '0.01em' }}>Ask Emmaus</span>
      <ChevronRight size={13} strokeWidth={2} className="shrink-0 text-muted-foreground/60" />
    </>
  );

  // ── Shared inner button styles ─────────────────────────────────────────────
  const innerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '0 18px',
    height: '44px',
    borderRadius: '9999px',
    minHeight: '44px',
    background: 'hsl(var(--background) / 0.75)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    color: 'hsl(var(--foreground))',
    fontSize: '14px',
    fontWeight: '600',
    border: '1px solid hsl(var(--border) / 0.65)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)',
    cursor: 'pointer',
    userSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  };

  return (
    <div
      className="fixed z-40"
      style={{
        // On the Bible chapter reader both a chapter nav (h-14=3.5rem) and the
        // standard BottomNav (h-16=4rem) are stacked at the bottom.
        // Raise the FAB above both bars on that route; use the standard offset elsewhere.
        bottom: location.startsWith('/bible/read/')
          ? 'calc(8.5rem + env(safe-area-inset-bottom, 0px))'
          : 'calc(5rem + env(safe-area-inset-bottom, 0px))',
        right: '16px',
      }}
    >
      <button
        onClick={handlePress}
        aria-label="Ask Emmaus"
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-foreground/20"
        style={innerStyle}
      >
        {label}
      </button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildScrollKey(path: string): string | null {
  const m = path.match(/^\/bible\/read\/([^/]+)\/(\d+)/);
  if (m) return `emmaus_scroll_${m[1]}_${m[2]}`;
  return null;
}
