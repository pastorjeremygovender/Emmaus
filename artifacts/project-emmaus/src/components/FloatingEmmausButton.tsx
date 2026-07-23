/**
 * FloatingEmmausButton — global FAB that surfaces Ask Emmaus from any screen.
 *
 * Hides itself on: /, /auth, /checkin, /join-room/*, /admin, /admin/*,
 * /personal/ask-emmaus, /personal/ask-emmaus/*
 *
 * Gathers lightweight context from the active route and passes it via
 * setPendingContext() before navigating to /personal/ask-emmaus, so
 * AskEmmausHome can show a "Discussing: …" label.
 *
 * Positioned fixed bottom-right, above BottomNav, with safe-area-inset support.
 */

import { MessageCircle } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { useBible } from '@/contexts/BibleContext';
import { useRooms } from '@/contexts/RoomsContext';
import { setPendingContext } from '@/lib/emmaus-pending';
import type { FlatContext } from '@/lib/emmaus-client';

// ─── Paths on which the FAB must not appear ───────────────────────────────────

const HIDDEN_PREFIXES = [
  '/personal/ask-emmaus',
  '/admin',
  '/join-room',
];

const HIDDEN_EXACT = new Set(['/', '/auth', '/checkin']);

function isHidden(path: string): boolean {
  if (HIDDEN_EXACT.has(path)) return true;
  return HIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix));
}

// ─── Capitalise a bookId like "john" → "John" ─────────────────────────────────

function cap(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Build FlatContext from the active route ──────────────────────────────────

function buildContext(
  path: string,
  readingHistory: ReturnType<typeof useBible>['readingHistory'],
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
    // Prefer readingHistory for the human-readable bookName
    const bookName = readingHistory?.bookId === bookId
      ? readingHistory.bookName
      : cap(bookId);
    return {
      entryPoint: 'bible',
      bookId,
      bookName,
      chapter,
      chapterHeading: readingHistory?.bookId === bookId && readingHistory.chapter === chapter
        ? readingHistory.chapterHeading
        : undefined,
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

  // Walk
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
    return {
      entryPoint: 'personal',
      conversationId: undefined,
      // pass roomId via chapterHeading field as a hint — we only surface it in the label
      chapterHeading: room?.name,
    };
  }

  // Bible hub / sub-pages
  if (path.startsWith('/bible')) {
    if (readingHistory) {
      return {
        entryPoint: 'bible',
        bookId: readingHistory.bookId,
        bookName: readingHistory.bookName,
        chapter: readingHistory.chapter,
        chapterHeading: readingHistory.chapterHeading,
      };
    }
    return { entryPoint: 'bible' };
  }

  // Journeys hub
  if (path === '/journeys') {
    return { entryPoint: 'journeys' };
  }

  // Rooms hub
  if (path === '/rooms') {
    return { entryPoint: 'personal' };
  }

  // Personal (default)
  return { entryPoint: 'personal' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FloatingEmmausButton() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { journeys, progress, getStep } = useJourney();
  const { readingHistory } = useBible();
  const { getMyRooms } = useRooms();

  // Hide on excluded routes or when unauthenticated
  if (!user || isHidden(location)) return null;

  function handlePress() {
    const ctx = buildContext(
      location,
      readingHistory,
      journeys,
      progress,
      getStep,
      getMyRooms,
      user?.id,
    );
    // Pass current path as return target so AskEmmausHome's back button can
    // return the user to the screen they came from rather than /personal.
    setPendingContext(ctx, location);
    navigate('/personal/ask-emmaus');
  }

  return (
    <button
      onClick={handlePress}
      aria-label="Ask Emmaus"
      className={[
        // Size & shape
        'w-14 h-14 rounded-full',
        // Colour — primary teal, matching design tokens
        'bg-primary text-primary-foreground',
        // Position — above BottomNav with safe-area offset
        'fixed right-4 z-40',
        // Interaction
        'flex items-center justify-center',
        'shadow-md hover:shadow-lg active:scale-95 transition-all duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
      ].join(' ')}
      style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <MessageCircle size={24} aria-hidden="true" strokeWidth={2} />
    </button>
  );
}
