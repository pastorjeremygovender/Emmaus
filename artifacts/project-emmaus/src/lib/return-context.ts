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
 *   walk / today               → /walk                       (My Emmaus)
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
  walk:                 { path: '/walk',                     label: 'My Emmaus'      },
  today:                { path: '/walk',                     label: 'My Emmaus'      },
  nextSteps:            { path: '/journeys',                 label: 'Discover'       },  // legacy
  nextStepsDevotionals: { path: '/journeys?tab=devotionals', label: 'Discover'       },
  nextStepsJourneys:    { path: '/journeys?tab=journeys',    label: 'Discover'       },
  nextStepsWalks:       { path: '/journeys?tab=walks',       label: 'Discover'       },
  nextStepsSermons:     { path: '/journeys?tab=sermons',     label: 'Discover'       },
  journeys:             { path: '/journeys',                 label: 'Discover'       },  // legacy
  myJourney:            { path: '/my-journey',               label: 'My Journey'     },
};

const EMMAUS_HISTORY_MARKER = '__emmausHistory';
const EMMAUS_HISTORY_DEPTH = '__emmausHistoryDepth';
const HISTORY_INSTALL_MARKER = '__emmausHistoryTrackingInstalled';

type EmmausHistoryState = {
  [EMMAUS_HISTORY_MARKER]?: true;
  [EMMAUS_HISTORY_DEPTH]?: number;
  [key: string]: unknown;
};

function asHistoryState(state: unknown): EmmausHistoryState | null {
  return state && typeof state === 'object'
    ? state as EmmausHistoryState
    : null;
}

function historyDepth(state: unknown): number | null {
  const parsed = asHistoryState(state);
  if (parsed?.[EMMAUS_HISTORY_MARKER] !== true) return null;
  const value = parsed[EMMAUS_HISTORY_DEPTH];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function markHistoryState(state: unknown, depth: number): EmmausHistoryState {
  const base = asHistoryState(state) ?? {};
  return {
    ...base,
    [EMMAUS_HISTORY_MARKER]: true,
    [EMMAUS_HISTORY_DEPTH]: depth,
  };
}

/**
 * Mark the browser history entries created by the SPA.
 *
 * Wouter intentionally calls pushState/replaceState with a null state. A
 * marker and monotonic depth let Back distinguish an earlier Emmaus route from
 * an unrelated browser entry without changing any of the route URLs.
 */
export function installAppHistoryTracking(): () => void {
  if (typeof window === 'undefined') return () => {};

  const appHistory = window.history as History & {
    [HISTORY_INSTALL_MARKER]?: boolean;
  };
  if (appHistory[HISTORY_INSTALL_MARKER]) return () => {};

  const initialDepth = historyDepth(appHistory.state) ?? 0;
  appHistory.replaceState(
    markHistoryState(appHistory.state, initialDepth),
    '',
    window.location.href,
  );

  const originalPushState = appHistory.pushState;
  const originalReplaceState = appHistory.replaceState;

  appHistory.pushState = function pushState(state, title, url) {
    const currentDepth = historyDepth(appHistory.state) ?? 0;
    return originalPushState.call(
      this,
      markHistoryState(state, currentDepth + 1),
      title,
      url,
    );
  };

  appHistory.replaceState = function replaceState(state, title, url) {
    const currentDepth = historyDepth(appHistory.state) ?? 0;
    return originalReplaceState.call(
      this,
      markHistoryState(state, currentDepth),
      title,
      url,
    );
  };

  Object.defineProperty(appHistory, HISTORY_INSTALL_MARKER, {
    value: true,
    configurable: true,
  });

  return () => {
    appHistory.pushState = originalPushState;
    appHistory.replaceState = originalReplaceState;
    delete appHistory[HISTORY_INSTALL_MARKER];
  };
}

function sameCurrentRoute(target: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const resolved = new URL(target, window.location.href);
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    return `${resolved.pathname}${resolved.search}${resolved.hash}` === current;
  } catch {
    return false;
  }
}

/**
 * Pop exactly one earlier in-app history entry.
 *
 * A direct/deep-linked page has depth 0, so its safe fallback is replaced
 * rather than pushed. That prevents pressing Back after the fallback from
 * returning to the page that just redirected. Self-target fallbacks are a
 * no-op instead of creating a circular route.
 */
export function goBackOrFallback(
  fallback: string,
  setLocation: (path: string, options?: { replace?: boolean }) => void,
): void {
  if (sameCurrentRoute(fallback)) return;

  const depth = historyDepth(window.history.state);
  if (depth !== null && depth > 0) {
    window.history.back();
  } else {
    setLocation(fallback, { replace: true });
  }
}

/** Infer a short label from a route path for the fallback case. */
function pathLabel(path: string): string {
  if (path === '/walk')              return 'My Emmaus';
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
  content?: 'devotional' | 'sermon',
): { path: string; label: string } {
  const normalizeLabel = (result: { path: string; label: string }) => {
    if (content && (source === 'walk' || source === 'today') && result.path === '/walk') {
      return { ...result, label: 'Back to My Emmaus' };
    }
    if (content === 'sermon' && result.path.startsWith('/journeys?tab=')) {
      return { ...result, label: 'Back to Discover' };
    }
    if (content === 'devotional' &&
        (source == null || source === 'nextStepsJourneys' || source === 'nextStepsSermons')) {
      return result.path.startsWith('/journeys')
        ? { ...result, label: 'Back to Discover' }
        : result;
    }
    return result;
  };

  if (!source) {
    return normalizeLabel({ path: fallback, label: pathLabel(fallback) });
  }

  if (source === 'journeyDetail') {
    if (sourceId) return normalizeLabel({ path: `/journeys/${sourceId}`, label: 'Journey' });
    return normalizeLabel({ path: '/journeys?tab=journeys', label: 'Discover' });
  }

  if (source === 'collectionDetail') {
    if (sourceId) return normalizeLabel({ path: `/journeys/collections/${sourceId}`, label: 'Collection' });
    return normalizeLabel({ path: '/journeys?tab=journeys', label: 'Discover' });
  }

  // Journey Previous Steps — back returns to that journey's previous-steps list.
  if (source === 'journeyPrevious') {
    if (sourceId) return normalizeLabel({ path: `/journey/${sourceId}/previous`, label: 'Previous Steps' });
    return normalizeLabel({ path: '/journeys?tab=journeys', label: 'Discover' });
  }

  // Devotional Previous Days — back returns to that devotional series' previous-days list.
  if (source === 'devotionalPrevious') {
    if (sourceId) return normalizeLabel({ path: `/devotional/${sourceId}/previous`, label: 'Previous Steps' });
    return normalizeLabel({ path: '/journeys?tab=devotionals', label: 'Discover' });
  }

  // Sermon Companion Previous Steps — back returns to that companion's previous-steps list.
  if (source === 'sermonCompanionPrevious') {
    if (sourceId) return normalizeLabel({ path: `/sermon-companion/${sourceId}/previous`, label: 'Previous Steps' });
    return normalizeLabel({ path: '/journeys?tab=sermons', label: 'Discover' });
  }

  // Daily Rhythm Previous Days — back returns to the daily rhythm previous-days list.
  if (source === 'dailyRhythmPrevious') {
    return normalizeLabel({ path: '/daily-rhythm/previous', label: 'Previous Steps' });
  }

  // Group context — content opened via a Group's "Today's Study" card.
  // Back returns to that specific Group, never to personal Next Steps.
  if (source === 'room') {
    if (sourceId) return normalizeLabel({ path: `/rooms/${sourceId}`, label: 'Group' });
    return normalizeLabel({ path: '/rooms', label: 'My Groups' });
  }

  // Sermon companion opened from the Sermon Home page. Keep this distinct
  // from the Sermons discovery tab so the member returns to the sermon they
  // were actually viewing.
  if (source === 'sermonHome') {
    if (sourceId) return normalizeLabel({ path: `/sermon/${sourceId}`, label: "This Week's Sermon" });
    return normalizeLabel({ path: '/journeys?tab=sermons', label: 'Discover' });
  }

  const mapped = SOURCE_MAP[source];
  if (mapped) return normalizeLabel(mapped);

  // Unrecognised source — use fallback
  return normalizeLabel({ path: fallback, label: pathLabel(fallback) });
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
