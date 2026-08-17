/**
 * FloatingEmmausButton — premium transparent pill FAB with animated blue-green border trace.
 *
 * Hidden on: /, /auth, /checkin, /join-room/*, /admin, /admin/*,
 *            /personal/ask-emmaus, /personal/ask-emmaus/*,
 *            /personal (My Walk) and all /personal/* child screens.
 *
 * Before navigating to Ask Emmaus the FAB writes a ReturnDestination to
 * sessionStorage (via setReturnDestination) so that both AskEmmausHome and
 * AskEmmausConversation can return directly to the originating page in one tap.
 *
 * Border technique: rotating conic-gradient inside a pill-shaped clip container.
 * Duration: 6 s per full circuit. Reduced-motion: static gradient border.
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { useBible } from '@/contexts/BibleContext';
import { useRooms } from '@/contexts/RoomsContext';
import {
  setPendingContext,
  setReturnDestination,
  sourceSectionFromPath,
} from '@/lib/emmaus-pending';
import type { FlatContext } from '@/lib/emmaus-client';
import { getActiveSermonCompanionContext } from '@/lib/sermon-companion-context';

// ─── Gradient palette ─────────────────────────────────────────────────────────

const BLUE  = '#258CFF';
const TEAL  = '#21C7C7';
const GREEN = '#2ED47A';

const CONIC = `conic-gradient(
  from 0deg,
  rgba(46,212,122,0.20)  0deg,
  ${GREEN}               35deg,
  ${TEAL}                95deg,
  ${BLUE}               155deg,
  ${TEAL}               205deg,
  rgba(46,212,122,0.30) 265deg,
  rgba(46,212,122,0.15) 330deg,
  rgba(46,212,122,0.20) 360deg
)`;

const STATIC_GRADIENT = `linear-gradient(135deg, ${BLUE} 0%, ${TEAL} 50%, ${GREEN} 100%)`;

// ─── Routing helpers ──────────────────────────────────────────────────────────

const HIDDEN_PREFIXES = [
  '/personal/ask-emmaus',  // Ask Emmaus screens themselves
  '/admin',
  '/join-room',
  '/bible/read',           // Bible chapter reader — focused reading, no FAB
];

// Primary screens use the inline AskEmmausBar instead of the FAB
const HIDDEN_EXACT = new Set(['/', '/auth', '/checkin', '/walk', '/journeys', '/bible', '/personal']);

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

  // Walk / Today's Steps
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

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (!user || isHidden(location)) return null;

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
      <ChevronRight size={13} strokeWidth={2.5} style={{ color: BLUE, flexShrink: 0 }} />
    </>
  );

  // ── Shared inner button styles ─────────────────────────────────────────────
  const innerStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '0 20px',
    height: '44px',
    borderRadius: '9999px',
    minHeight: '44px',
    background: 'hsl(var(--background) / 0.88)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
    color: 'hsl(var(--foreground))',
    fontSize: '14px',
    fontWeight: '600',
    border: 'none',
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
      {reducedMotion ? (
        // ── Reduced-motion: static gradient border ───────────────────────────
        <button
          onClick={handlePress}
          aria-label="Ask Emmaus"
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
          style={{
            ...innerStyle,
            background: `hsl(var(--background) / 0.88) padding-box, ${STATIC_GRADIENT} border-box`,
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            border: '2px solid transparent',
            boxShadow: `0 0 10px rgba(37,140,255,0.20)`,
          }}
        >
          {label}
        </button>
      ) : (
        // ── Animated: rotating conic-gradient clipped to pill perimeter ───────
        <div
          style={{
            position: 'relative',
            borderRadius: '9999px',
            padding: '2px',
            boxShadow: `
              0 0 12px rgba(37,140,255,0.28),
              0 0 24px rgba(46,212,122,0.14),
              0 2px 8px rgba(0,0,0,0.12)
            `,
          }}
        >
          {/* Clip container */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'inherit',
              overflow: 'hidden',
            }}
          >
            {/* Spinning conic-gradient square */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: '200%',
                height: '200%',
                transform: 'translate(-50%, -50%) rotate(0deg)',
                background: CONIC,
                animation: 'border-trace 6s linear infinite',
              }}
            />
          </div>

          {/* Inner button */}
          <button
            onClick={handlePress}
            aria-label="Ask Emmaus"
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#258CFF]"
            style={innerStyle}
          >
            {label}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildScrollKey(path: string): string | null {
  const m = path.match(/^\/bible\/read\/([^/]+)\/(\d+)/);
  if (m) return `emmaus_scroll_${m[1]}_${m[2]}`;
  return null;
}
