/**
 * return-context — shared source-aware navigation utility for Project Emmaus.
 *
 * PERMANENT RULE: The back arrow returns the member to the same meaningful
 * place from which the navigation was initiated. Never default to /walk
 * unless that is genuinely the source.
 *
 * How to use:
 *   1. When navigating TO content, call encodeSource() and append its result:
 *        setLocation(`/journey/${id}/day/1${encodeSource('nextStepsJourneys')}`)
 *   2. On the content page, read source/sourceId from the URL once on mount:
 *        const source   = new URLSearchParams(window.location.search).get('source');
 *        const sourceId = new URLSearchParams(window.location.search).get('sourceId');
 *   3. Call resolveReturn() to get the back destination:
 *        const { path, label } = resolveReturn(source, sourceId, '/journeys?tab=journeys');
 *   4. Use <EmmausBackButton> (components/EmmausBackButton.tsx) which wraps this automatically.
 *
 * Source key → destination mapping:
 *   walk / today               → /walk                       (Today's Steps)
 *   nextSteps                  → /journeys                   (legacy; devotionals default)
 *   nextStepsDevotionals       → /journeys?tab=devotionals
 *   nextStepsJourneys          → /journeys?tab=journeys
 *   nextStepsWalks             → /journeys?tab=walks
 *   nextStepsSermons           → /journeys?tab=sermons
 *   journeyDetail              → /journeys/:sourceId                          (requires sourceId)
 *   collectionDetail           → /journeys/collections/:sourceId              (requires sourceId)
 *   myJourney                  → /my-journey
 *   journeys (legacy)          → /journeys
 *   journeyPrevious            → /journey/:sourceId/previous                  (requires sourceId)
 *   devotionalPrevious         → /devotional/:sourceId/previous               (requires sourceId)
 *   sermonCompanionPrevious    → /sermon-companion/:sourceId/previous         (requires sourceId)
 *   dailyRhythmPrevious        → /daily-rhythm/previous
 */

export type SourceKey =
  | 'walk'
  | 'today'
  | 'nextSteps'
  | 'nextStepsDevotionals'
  | 'nextStepsJourneys'
  | 'nextStepsWalks'
  | 'nextStepsSermons'
  | 'journeyDetail'
  | 'collectionDetail'
  | 'myJourney'
  | 'room'
  | 'sermonHome'
  | 'journeyPrevious'
  | 'devotionalPrevious'
  | 'sermonCompanionPrevious'
  | 'dailyRhythmPrevious';

const SOURCE_MAP: Record<string, { path: string; label: string }> = {
  walk:                 { path: '/walk',                     label: "Today's Steps"  },
  today:                { path: '/walk',                     label: "Today's Steps"  },
  nextSteps:            { path: '/journeys',                 label: 'Discover'       },  // legacy
  nextStepsDevotionals: { path: '/journeys?tab=devotionals', label: 'Discover'       },
  nextStepsJourneys:    { path: '/journeys?tab=journeys',    label: 'Discover'       },
  nextStepsWalks:       { path: '/journeys?tab=walks',       label: 'Discover'       },
  nextStepsSermons:     { path: '/journeys?tab=sermons',     label: 'Discover'       },
  journeys:             { path: '/journeys',                 label: 'Discover'       },  // legacy
  myJourney:            { path: '/my-journey',               label: 'My Journey'     },
};

/** Infer a short label from a route path for the fallback case. */
function pathLabel(path: string): string {
  if (path === '/walk')              return "Today's Steps";
  if (path.startsWith('/journeys'))  return 'Discover';
  if (path === '/my-journey')        return 'My Journey';
  if (path === '/bible')             return 'My Bible';
  return 'Back';
}

/**
 * Resolve a source key (from ?source= URL param) to a { path, label }
 * return destination.
 *
 * @param source    — value of ?source= from the URL
 * @param sourceId  — value of ?sourceId= (required for 'journeyDetail')
 * @param fallback  — content-specific safe route when source is absent/unknown.
 *                    Provide the most appropriate parent for the content type:
 *                      Daily Rhythm  → '/walk'
 *                      Devotional    → '/journeys?tab=devotionals'
 *                      Journey       → '/journeys?tab=journeys'
 *                      Sermon Comp.  → '/journeys?tab=sermons'
 *                      Bible         → '/bible'
 */
export function resolveReturn(
  source: string | null | undefined,
  sourceId?: string | null,
  fallback = '/walk',
): { path: string; label: string } {
  if (!source) {
    return { path: fallback, label: pathLabel(fallback) };
  }

  if (source === 'journeyDetail') {
    if (sourceId) return { path: `/journeys/${sourceId}`, label: 'Journey' };
    return { path: '/journeys?tab=journeys', label: 'Discover' };
  }

  if (source === 'collectionDetail') {
    if (sourceId) return { path: `/journeys/collections/${sourceId}`, label: 'Collection' };
    return { path: '/journeys?tab=journeys', label: 'Discover' };
  }

  // Journey Previous Steps — back returns to that journey's previous-steps list.
  if (source === 'journeyPrevious') {
    if (sourceId) return { path: `/journey/${sourceId}/previous`, label: 'Previous Steps' };
    return { path: '/journeys?tab=journeys', label: 'Discover' };
  }

  // Devotional Previous Days — back returns to that devotional series' previous-days list.
  if (source === 'devotionalPrevious') {
    if (sourceId) return { path: `/devotional/${sourceId}/previous`, label: 'Previous Steps' };
    return { path: '/journeys?tab=devotionals', label: 'Discover' };
  }

  // Sermon Companion Previous Steps — back returns to that companion's previous-steps list.
  if (source === 'sermonCompanionPrevious') {
    if (sourceId) return { path: `/sermon-companion/${sourceId}/previous`, label: 'Previous Steps' };
    return { path: '/journeys?tab=sermons', label: 'Discover' };
  }

  // Daily Rhythm Previous Days — back returns to the daily rhythm previous-days list.
  if (source === 'dailyRhythmPrevious') {
    return { path: '/daily-rhythm/previous', label: 'Previous Steps' };
  }

  // Group context — content opened via a Group's "Today's Study" card.
  // Back returns to that specific Group, never to personal Next Steps.
  if (source === 'room') {
    if (sourceId) return { path: `/rooms/${sourceId}`, label: 'Group' };
    return { path: '/rooms', label: 'My Groups' };
  }

  const mapped = SOURCE_MAP[source];
  if (mapped) return mapped;

  // Unrecognised source — use fallback
  return { path: fallback, label: pathLabel(fallback) };
}

/**
 * Build a query string for encoding the current page as a return destination.
 *
 * Example: encodeSource('nextStepsJourneys') → '?source=nextStepsJourneys'
 * Example: encodeSource('journeyDetail', 'coming-to-jesus') → '?source=journeyDetail&sourceId=coming-to-jesus'
 */
export function encodeSource(key: SourceKey | string, sourceId?: string): string {
  let qs = `?source=${encodeURIComponent(key)}`;
  if (sourceId) qs += `&sourceId=${encodeURIComponent(sourceId)}`;
  return qs;
}
