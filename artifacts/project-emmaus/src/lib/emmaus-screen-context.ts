import { getActiveSermonCompanionContext } from '@/lib/sermon-companion-context';
import type { FlatContext } from '@/lib/emmaus-client';

export interface EmmausScreenJourney {
  id: string;
  title: string;
  journeyType?: string;
}

export interface EmmausScreenProgress {
  currentDay?: number;
}

export interface EmmausScreenBiblePosition {
  bookId: string;
  bookName: string;
  chapter: number;
  chapterHeading?: string;
}

export function buildEmmausScreenContext(
  path: string,
  options: {
    journeys: EmmausScreenJourney[];
    progress: Record<string, EmmausScreenProgress | undefined>;
    getStep: (journeyId: string, day: number) => { title?: string } | undefined;
    lastRead?: EmmausScreenBiblePosition | null;
    translationId?: string;
  },
): FlatContext {
  const { journeys, progress, getStep, lastRead, translationId } = options;

  const bibleReadMatch = path.match(/^\/bible\/read\/([^/]+)\/(\d+)/);
  if (bibleReadMatch) {
    const bookId = bibleReadMatch[1];
    const chapter = Number(bibleReadMatch[2]);
    const samePosition = lastRead?.bookId === bookId && lastRead.chapter === chapter;
    return {
      entryPoint: 'bible',
      bookId,
      bookName: samePosition ? lastRead!.bookName : bookId,
      chapter,
      chapterHeading: samePosition
        ? `${lastRead!.chapterHeading ?? ''}${translationId ? ` · ${translationId.toUpperCase()}` : ''}`.trim()
        : translationId?.toUpperCase(),
    };
  }

  const journeyDayMatch = path.match(/^\/journey\/([^/]+)\/day\/(\d+)/);
  const dailyRhythmDayMatch = path.match(/^\/daily-rhythm\/day\/(\d+)/);
  if (journeyDayMatch || dailyRhythmDayMatch) {
    const journeyId = journeyDayMatch?.[1]
      ?? journeys.find((journey) => journey.journeyType === 'daily-rhythm')?.id;
    const day = Number(journeyDayMatch?.[2] ?? dailyRhythmDayMatch?.[1]);
    if (journeyId && Number.isInteger(day) && day > 0) {
      const journey = journeys.find((item) => item.id === journeyId);
      return {
        entryPoint: journey?.journeyType === 'walk' || journey?.journeyType === 'core' || journey?.journeyType === 'daily-rhythm'
          ? 'walk'
          : 'journeys',
        journeyId,
        journeyTitle: journey?.title,
        journeyType: journey?.journeyType,
        currentDay: day,
        chapterHeading: getStep(journeyId, day)?.title,
      };
    }
  }

  const journeyDetailMatch = path.match(/^\/journeys\/([^/]+)/);
  if (journeyDetailMatch && journeyDetailMatch[1] !== 'explore' && journeyDetailMatch[1] !== 'collections') {
    const journey = journeys.find((item) => item.id === journeyDetailMatch[1]);
    const currentDay = Math.max(1, progress[journeyDetailMatch[1]]?.currentDay ?? 1);
    return {
      entryPoint: journey?.journeyType === 'walk' || journey?.journeyType === 'core' ? 'walk' : 'journeys',
      journeyId: journeyDetailMatch[1],
      journeyTitle: journey?.title,
      journeyType: journey?.journeyType,
      currentDay,
      chapterHeading: getStep(journeyDetailMatch[1], currentDay)?.title,
    };
  }

  if (path === '/walk') {
    const walk = journeys.find((journey) =>
      journey.journeyType === 'walk' || journey.journeyType === 'core' || journey.journeyType === 'daily-rhythm',
    );
    if (walk) {
      const currentDay = Math.max(1, progress[walk.id]?.currentDay ?? 1);
      return {
        entryPoint: 'walk',
        journeyId: walk.id,
        journeyTitle: walk.title,
        journeyType: walk.journeyType,
        currentDay,
        chapterHeading: getStep(walk.id, currentDay)?.title,
      };
    }
    return { entryPoint: 'walk' };
  }

  const sermonMatch = path.match(/^\/sermon\/([^/]+)/);
  if (sermonMatch) {
    return { entryPoint: 'sermons', sermonId: sermonMatch[1] };
  }

  if (path.startsWith('/sermon-companion/')) {
    const companion = getActiveSermonCompanionContext();
    return {
      entryPoint: 'sermons',
      sermonId: companion?.sermonId,
      sermonTitle: companion?.sermonTitle,
      scriptureReference: companion?.scriptureReference,
    };
  }

  if (path.startsWith('/bible')) {
    return lastRead
      ? {
          entryPoint: 'bible',
          bookId: lastRead.bookId,
          bookName: lastRead.bookName,
          chapter: lastRead.chapter,
          chapterHeading: lastRead.chapterHeading,
        }
      : { entryPoint: 'bible' };
  }

  if (path === '/journeys') return { entryPoint: 'journeys' };
  return { entryPoint: 'personal' };
}