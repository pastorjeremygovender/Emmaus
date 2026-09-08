import type { Journey, Progress, Step } from '@/contexts/JourneyContext';
import type { Collection } from '@/lib/collections-api';

export type StartedJourney = {
  journey: Journey;
  prog: Progress;
  currentStep: Step | null;
  totalPublishedSteps: number;
};

export type CollectionJourneyCard = {
  collection: Collection;
  active: StartedJourney;
  children: StartedJourney[];
};

function compareActiveChild(a: StartedJourney, b: StartedJourney): number {
  const started = b.prog.startedAt.localeCompare(a.prog.startedAt);
  if (started !== 0) return started;
  const progress = b.prog.currentDay - a.prog.currentDay;
  if (progress !== 0) return progress;
  return a.journey.id.localeCompare(b.journey.id);
}

export function projectTodaysJourneys(
  started: StartedJourney[],
  collections: Collection[],
): {
  standaloneWalks: StartedJourney[];
  standaloneJourneys: StartedJourney[];
  collectionCards: CollectionJourneyCard[];
} {
  const collectionById = new Map(collections.map(collection => [collection.id, collection]));
  const grouped = new Map<string, StartedJourney[]>();
  const standaloneWalks: StartedJourney[] = [];
  const standaloneJourneys: StartedJourney[] = [];

  for (const item of started) {
    const collectionId = item.journey.collectionId;
    if (collectionId) {
      const existing = grouped.get(collectionId) ?? [];
      existing.push(item);
      grouped.set(collectionId, existing);
      continue;
    }

    if (item.journey.journeyType === 'walk') standaloneWalks.push(item);
    else standaloneJourneys.push(item);
  }

  const collectionCards = [...grouped.entries()]
    .map(([collectionId, children]) => {
      const collection = collectionById.get(collectionId);
      const sortedChildren = [...children].sort(compareActiveChild);
      if (!collection) {
        standaloneJourneys.push(...sortedChildren);
        return null;
      }
      return { collection, active: sortedChildren[0], children: sortedChildren };
    })
    .filter((card): card is CollectionJourneyCard => card !== null)
    .sort((a, b) => a.collection.title.localeCompare(b.collection.title));

  return { standaloneWalks, standaloneJourneys, collectionCards };
}