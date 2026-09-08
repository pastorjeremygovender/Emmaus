import type {
  DiscipleshipDevotional,
  DiscipleshipJourney,
  DiscipleshipRoom,
  DiscipleshipSermonCompanion,
  DiscipleshipSummary,
} from '@/lib/pastoral-api';

export type JourneyCategory = 'dailyRhythm' | 'walk' | 'journey' | 'ignored';

export interface DiscipleshipAllocation {
  dailyRhythm: DiscipleshipJourney[];
  dailyDevotionals: DiscipleshipDevotional[];
  sermonCompanions: DiscipleshipSermonCompanion[];
  walksInProgress: DiscipleshipJourney[];
  journeysInProgress: DiscipleshipJourney[];
  completedWalks: DiscipleshipJourney[];
  completedJourneys: DiscipleshipJourney[];
  groups: DiscipleshipRoom[];
}

/**
 * Journey type is the authoritative category. Titles are deliberately not
 * consulted, so a Walk and a Group with the same display name stay distinct.
 */
export function classifyJourney(journey: DiscipleshipJourney): JourneyCategory {
  const type = journey.journeyType.trim().toLowerCase();
  if (type === 'daily-rhythm') return 'dailyRhythm';
  if (type === 'companion') return 'ignored';
  if (journey.collectionId) return 'journey';
  if (type === 'walk') return 'walk';
  return 'journey';
}

function isCompleted(status: string): boolean {
  return status.trim().toLowerCase() === 'completed';
}

function isPaused(status: string): boolean {
  return status.trim().toLowerCase() === 'paused';
}

export function allocateDiscipleship(
  summary: Extract<DiscipleshipSummary, { available: true }>,
): DiscipleshipAllocation {
  const dailyRhythm: DiscipleshipJourney[] = [];
  const walksInProgress: DiscipleshipJourney[] = [];
  const journeysInProgress: DiscipleshipJourney[] = [];
  const completedWalks: DiscipleshipJourney[] = [];
  const completedJourneys: DiscipleshipJourney[] = [];

  for (const journey of summary.journeys) {
    const category = classifyJourney(journey);
    if (isCompleted(journey.status)) {
      if (category === 'walk') completedWalks.push(journey);
      if (category === 'journey') completedJourneys.push(journey);
      continue;
    }
    if (isPaused(journey.status)) continue;

    if (category === 'dailyRhythm') dailyRhythm.push(journey);
    if (category === 'walk') walksInProgress.push(journey);
    if (category === 'journey') journeysInProgress.push(journey);
  }

  return {
    dailyRhythm,
    dailyDevotionals: summary.devotionals.filter(d => !isCompleted(d.status)),
    sermonCompanions: summary.sermonCompanions,
    walksInProgress,
    journeysInProgress,
    completedWalks,
    completedJourneys,
    groups: summary.rooms,
  };
}