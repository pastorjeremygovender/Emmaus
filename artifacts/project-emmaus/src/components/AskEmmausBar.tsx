/**
 * AskEmmausBar — permanent inline companion entry point.
 *
 * Replaces the floating FAB on the four primary screens.
 * Renders as an inline bar (not fixed-positioned) so it never covers content.
 *
 * Usage (inside a primary screen's <main> before the first content section):
 *   <AskEmmausBar />
 */

import { useLocation } from 'wouter';
import { MessageCircle, Mic } from 'lucide-react';
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

// ─── Context builder (mirrors FloatingEmmausButton logic) ─────────────────────

function buildBarContext(
  path: string,
  lastRead: ReturnType<typeof useBible>['lastRead'],
  journeys: ReturnType<typeof useJourney>['journeys'],
  progress: ReturnType<typeof useJourney>['progress'],
  getStep: ReturnType<typeof useJourney>['getStep'],
): FlatContext {
  if (path === '/walk') {
    const coreJourney = journeys.find((j) => j.journeyType === 'core');
    if (coreJourney) {
      const prog = progress[coreJourney.id];
      const currentDay = prog?.currentDay ?? 1;
      const step = getStep(coreJourney.id, currentDay);
      return { entryPoint: 'walk', journeyId: coreJourney.id, journeyTitle: coreJourney.title, currentDay, chapterHeading: step?.title };
    }
    return { entryPoint: 'walk' };
  }
  if (path.startsWith('/bible')) {
    if (lastRead) {
      return { entryPoint: 'bible', bookId: lastRead.bookId, bookName: lastRead.bookName, chapter: lastRead.chapter, chapterHeading: lastRead.chapterHeading };
    }
    return { entryPoint: 'bible' };
  }
  if (path.match(/^\/sermon-companion\//)) {
    const ctx = getActiveSermonCompanionContext();
    return { entryPoint: 'personal', sermonId: ctx?.sermonId, sermonTitle: ctx?.sermonTitle, scriptureReference: ctx?.scriptureReference };
  }
  if (path === '/journeys') return { entryPoint: 'journeys' };
  return { entryPoint: 'personal' };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function AskEmmausBar() {
  const [location, navigate] = useLocation();
  const { user } = useAuth();
  const { journeys, progress, getStep } = useJourney();
  const { lastRead } = useBible();
  const { getMyRooms } = useRooms();

  if (!user) return null;

  function handlePress() {
    setReturnDestination({
      pathname: location,
      scrollY: Math.round(window.scrollY),
      sourceSection: sourceSectionFromPath(location),
    });
    const ctx = buildBarContext(location, lastRead, journeys, progress, getStep);
    setPendingContext(ctx);
    navigate('/personal/ask-emmaus');
  }

  function handleMicPress(e: React.MouseEvent) {
    e.stopPropagation();
    // Navigate to ask emmaus; voice input is handled there
    handlePress();
  }

  return (
    <button
      onClick={handlePress}
      aria-label="Ask Emmaus"
      className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-border bg-card hover:border-primary/30 hover:bg-card/80 transition-all text-left group"
    >
      {/* Icon */}
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 transition-colors group-hover:bg-primary/15">
        <MessageCircle size={16} className="text-primary" strokeWidth={1.8} />
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <span className="text-[14px] text-muted-foreground">
          What would you like help with today?
        </span>
      </div>

      {/* Mic */}
      <button
        onClick={handleMicPress}
        aria-label="Voice input"
        className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-primary/10 transition-colors shrink-0 focus-visible:outline-none"
      >
        <Mic size={16} className="text-muted-foreground/70" strokeWidth={1.8} />
      </button>
    </button>
  );
}
