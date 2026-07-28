/**
 * ExploreJourneys — Journey Discovery screen.
 * Route: /journeys/explore
 *
 * Collections are the primary discovery method.
 * Featured Journeys (churchWide) appear below Collections.
 * Search works across title, description, category, keywords.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import JourneyStartModal from '@/components/JourneyStartModal';
import { useRooms } from '@/contexts/RoomsContext';
import { listCollections, type CollectionSummary } from '@/lib/collections-api';
import { ChevronLeft, Search, X, Bookmark, BookmarkCheck, ArrowRight } from 'lucide-react';
import type { Journey } from '@/contexts/JourneyContext';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rhythmLabel(j: Journey): string {
  const dur = (j.estimatedDuration ?? '').toLowerCase();
  if (dur.includes('daily') || dur.includes('per day')) return 'Daily';
  if (dur.includes('weekly') || dur.includes('per week')) return 'Weekly';
  if (dur.includes('guided')) return 'Guided';
  return 'Self-paced';
}

function durationLabel(j: Journey): string | null {
  if (!j.durationDays || j.durationDays <= 0) return null;
  return `${j.durationDays} ${j.durationDays === 1 ? 'Day' : 'Days'}`;
}

function timeLabel(j: Journey): string | null {
  if (!j.estimatedDuration) return null;
  const m = j.estimatedDuration.match(/(\d+)\s*(min|minute|hour)/i);
  if (!m) return null;
  const n = parseInt(m[1]);
  const unit = m[2].toLowerCase().startsWith('h') ? 'hour' : 'minute';
  return `About ${n} ${unit}${n !== 1 ? 's' : ''} per step`;
}

function matchesSearch(j: Journey, q: string): boolean {
  if (!q) return true;
  const fields = [
    j.title,
    j.description,
    j.subtitle,
    (j as any).category,
    (j as any).keywords,
    (j as any).scriptureReference,
  ].filter(Boolean).join(' ').toLowerCase();
  return fields.includes(q);
}

// ─── Cover image ──────────────────────────────────────────────────────────────

function CoverThumb({
  url, title, className = '',
}: { url?: string; title: string; className?: string }) {
  const [err, setErr] = useState(false);
  const initials = title.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  if (!url || err) {
    return (
      <div className={`bg-primary/8 flex items-center justify-center ${className}`}>
        <span className="text-primary/30 text-[18px] font-medium select-none">{initials}</span>
      </div>
    );
  }
  return (
    <img
      src={url} alt=""
      className={`object-cover ${className}`}
      onError={() => setErr(true)}
      loading="lazy"
    />
  );
}

// ─── Collection card ──────────────────────────────────────────────────────────

function CollectionCard({ c, onPress }: { c: CollectionSummary; onPress: () => void }) {
  return (
    <div
      className="w-full rounded-2xl border border-border bg-card overflow-hidden hover:border-primary/30 transition-all"
    >
      <div className="flex items-stretch">
        {/* Cover strip */}
        <div className="w-20 shrink-0 min-h-[88px]">
          <CoverThumb
            url={c.coverImageUrl}
            title={c.title}
            className="w-full h-full"
          />
        </div>
        {/* Body */}
        <div className="flex-1 min-w-0 px-4 py-4 flex flex-col justify-between gap-2">
          <div>
            <p className="text-[16px] font-medium text-foreground leading-snug">{c.title}</p>
            {c.description && (
              <p className="text-[13px] text-muted-foreground mt-1 leading-snug line-clamp-2">
                {c.description}
              </p>
            )}
            <p className="text-[12px] text-muted-foreground mt-1">
              {c.journeyCount} {c.journeyCount === 1 ? 'Journey' : 'Journeys'}
            </p>
          </div>
          <button
            onClick={onPress}
            className="self-start flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            aria-label={`View ${c.title} collection`}
          >
            View Collection <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Journey card (for search results + featured) ─────────────────────────────

function JourneyCard({
  journey, isSaved, enrollState,
  onStart, onSave, onDetails,
}: {
  journey: Journey;
  isSaved: boolean;
  enrollState: 'none' | 'active' | 'paused' | 'completed' | 'saved';
  onStart: () => void;
  onSave: () => void;
  onDetails: () => void;
}) {
  const dur    = durationLabel(journey);
  const rhythm = rhythmLabel(journey);
  const time   = timeLabel(journey);

  const actionLabel =
    enrollState === 'active'    ? 'Continue'         :
    enrollState === 'paused'    ? 'Continue Journey' :
    enrollState === 'completed' ? 'Review'           :
    'Open Journey';

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex">
        <div className="w-16 shrink-0 min-h-[88px]">
          <CoverThumb url={journey.coverImageUrl} title={journey.title} className="w-full h-full" />
        </div>
        <div className="flex-1 min-w-0 px-4 py-4 space-y-1">
          <button onClick={onDetails} className="text-left w-full">
            <h3 className="text-[16px] font-medium text-foreground leading-snug line-clamp-2">
              {journey.title}
            </h3>
          </button>
          {journey.description && (
            <p className="text-[12px] text-muted-foreground leading-snug line-clamp-2">
              {journey.description}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
            {dur    && <span>{dur}</span>}
            {rhythm && <><span className="opacity-30">·</span><span>{rhythm}</span></>}
            {time   && <><span className="opacity-30">·</span><span>{time}</span></>}
          </div>
        </div>
      </div>
      <div className="px-4 pb-4 pt-1 flex gap-2">
        <Button
          className="flex-1 h-10 rounded-xl text-[14px]"
          variant="outline"
          onClick={onStart}
        >
          {actionLabel}
        </Button>
        <button
          onClick={onSave}
          className="h-10 w-10 flex items-center justify-center rounded-xl border border-border hover:border-primary/30 transition-colors text-muted-foreground hover:text-primary shrink-0"
          aria-label={isSaved ? 'Remove from saved' : 'Save for later'}
        >
          {isSaved
            ? <BookmarkCheck size={16} className="text-primary" />
            : <Bookmark size={16} />}
        </button>
        <button
          onClick={onDetails}
          className="h-10 px-3 flex items-center justify-center rounded-xl border border-border hover:border-primary/30 transition-colors text-[13px] text-muted-foreground hover:text-foreground shrink-0"
          aria-label={`View details for ${journey.title}`}
        >
          Details
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExploreJourneys() {
  const { journeys, progress, startJourney } = useJourney();
  const { user } = useAuth();
  const { startSharedJourney } = useRooms();
  const [, setLocation] = useLocation();
  const { getState, saveForLater, canActivateMore } = useEnrollment();

  const [rawQuery, setRawQuery]               = useState('');
  const [query, setQuery]                     = useState('');
  const [collections, setCollections]         = useState<CollectionSummary[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);
  const [pendingJourneyId, setPendingJourneyId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setQuery(rawQuery.trim().toLowerCase()), 280);
    return () => clearTimeout(t);
  }, [rawQuery]);

  // Lazy-load collections
  useEffect(() => {
    listCollections()
      .then(setCollections)
      .catch(() => setCollections([]))
      .finally(() => setCollectionsLoading(false));
  }, []);

  const publishedJourneys = useMemo(
    () => journeys.filter(j => j.status === 'Published'),
    [journeys]
  );

  const startedIds = useMemo(() => new Set(Object.keys(progress)), [progress]);

  // Non-exempt growth journeys
  const growthJourneys = useMemo(
    () => publishedJourneys.filter(j => !isExemptJourney(j)),
    [publishedJourneys]
  );

  // Featured: churchWide journeys, max 5 (admin-curated)
  const featured = useMemo(
    () => growthJourneys.filter(j => j.churchWide).slice(0, 5),
    [growthJourneys]
  );

  // Search results (when query is active)
  const searchResults = useMemo(() => {
    if (!query) return [];
    return growthJourneys.filter(j => matchesSearch(j, query));
  }, [growthJourneys, query]);

  // Handlers
  const handleStart = useCallback((journeyId: string) => {
    const j = journeys.find(x => x.id === journeyId);
    if (!j) return;
    const state = getState(journeyId);
    if (state === 'active') {
      setLocation(`/journey/${journeyId}/day/${progress[journeyId]?.currentDay ?? 1}`);
      return;
    }
    if (state === 'paused') {
      setLocation(`/journey/${journeyId}/day/${progress[journeyId]?.currentDay ?? 1}`);
      return;
    }
    if ((state as string) === 'completed') {
      setLocation(`/journey/${journeyId}/day/1`);
      return;
    }
    if (!isExemptJourney(j) && !canActivateMore(journeys, startedIds)) {
      // Show limit hint — navigate to detail so they can manage
      setLocation(`/journeys/${journeyId}`);
      return;
    }
    setPendingJourneyId(journeyId);
  }, [journeys, getState, progress, canActivateMore, startedIds, setLocation]);

  const handleSave = useCallback((journeyId: string) => {
    saveForLater(journeyId);
  }, [saveForLater]);

  function handleStartAlone() {
    if (!pendingJourneyId) return;
    startJourney(pendingJourneyId);
    setLocation(`/journey/${pendingJourneyId}/day/1`);
    setPendingJourneyId(null);
  }

  function handleStartWithRoom(roomId: string) {
    if (!pendingJourneyId || !user) return;
    startJourney(pendingJourneyId);
    startSharedJourney(roomId, pendingJourneyId, user.id);
    setLocation(`/journey/${pendingJourneyId}/day/1`);
    setPendingJourneyId(null);
  }

  const pendingJourney = journeys.find(j => j.id === pendingJourneyId) ?? null;

  function JourneyCardConnected({ journey }: { journey: Journey }) {
    const state   = getState(journey.id);
    const isSaved = state === 'saved';
    return (
      <JourneyCard
        journey={journey}
        isSaved={isSaved}
        enrollState={state as any}
        onStart={() => handleStart(journey.id)}
        onSave={() => handleSave(journey.id)}
        onDetails={() => setLocation(`/journeys/${journey.id}`)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-5 pt-12 pb-3">
          <button
            onClick={() => setLocation('/journeys')}
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0"
            aria-label="Back to Journeys"
          >
            <ChevronLeft size={22} className="text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-[20px] font-semibold text-foreground tracking-tight">
              Explore Journeys
            </h1>
          </div>
        </div>

        {/* Sub-heading — visible only when not searching */}
        {!query && (
          <p className="px-5 pb-3 text-[14px] text-muted-foreground leading-relaxed">
            Discover guided pathways to help you grow with Jesus.
          </p>
        )}

        {/* Search bar */}
        <div className="px-5 pb-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
            />
            <input
              type="search"
              value={rawQuery}
              onChange={e => setRawQuery(e.target.value)}
              placeholder="Search journeys..."
              autoFocus={false}
              autoComplete="off"
              className="w-full h-10 pl-9 pr-9 rounded-xl border border-border bg-muted/40 text-[14px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
              aria-label="Search journeys"
            />
            {rawQuery && (
              <button
                onClick={() => { setRawQuery(''); setQuery(''); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 space-y-8">

        {/* ── Search results ───────────────────────────────────────────── */}
        {query ? (
          <section aria-label="Search results">
            {searchResults.length > 0 ? (
              <div className="space-y-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  {searchResults.length} {searchResults.length === 1 ? 'Journey' : 'Journeys'} found
                </p>
                {searchResults.map(j => (
                  <JourneyCardConnected key={j.id} journey={j} />
                ))}
              </div>
            ) : (
              <div className="py-16 flex flex-col items-center text-center gap-4">
                <p className="text-[15px] text-muted-foreground leading-relaxed max-w-xs">
                  We couldn't find a Journey matching your search.
                </p>
                <Button
                  variant="outline"
                  className="rounded-xl h-10 text-[14px]"
                  onClick={() => { setRawQuery(''); setQuery(''); }}
                >
                  Clear search
                </Button>
              </div>
            )}
          </section>
        ) : (
          <>
            {/* ── Collections ──────────────────────────────────────────── */}
            <section aria-label="Collections">
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                Browse by Topic
              </h2>
              {collectionsLoading ? (
                /* Skeleton */
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-[88px] rounded-2xl bg-muted/40 animate-pulse" />
                  ))}
                </div>
              ) : collections.length === 0 ? (
                <p className="text-[14px] text-muted-foreground py-4">
                  No collections available yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {collections.map(c => (
                    <CollectionCard
                      key={c.id}
                      c={c}
                      onPress={() => setLocation(`/journeys/collections/${c.id}`)}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* ── Featured Journeys ────────────────────────────────────── */}
            {featured.length > 0 && (
              <section aria-label="Featured Journeys">
                <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-4">
                  Featured Journeys
                </h2>
                <div className="space-y-3">
                  {featured.map(j => (
                    <JourneyCardConnected key={j.id} journey={j} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      <BottomNav />

      {/* Journey start modal */}
      {pendingJourney && (
        <JourneyStartModal
          journeyId={pendingJourney.id}
          journeyTitle={pendingJourney.title}
          onStartAlone={handleStartAlone}
          onStartWithRoom={handleStartWithRoom}
          onClose={() => setPendingJourneyId(null)}
        />
      )}
    </div>
  );
}
