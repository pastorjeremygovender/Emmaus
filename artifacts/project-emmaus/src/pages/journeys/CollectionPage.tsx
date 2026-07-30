/**
 * CollectionPage — member-facing Collection detail screen.
 * Route: /journeys/collections/:id
 *
 * Shows all Published Journeys belonging to this collection,
 * with full Journey cards and Save / Start actions.
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useParams, useLocation, useSearch } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import JourneyStartModal from '@/components/JourneyStartModal';
import { useRooms } from '@/contexts/RoomsContext';
import { getCollection, getCollectionJourneys } from '@/lib/collections-api';
import type { Collection } from '@/lib/collections-api';
import { checkJourneysHaveIntro } from '@/lib/journeys-api';
import { ChevronLeft, Bookmark, BookmarkCheck } from 'lucide-react';
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

// ─── Collection cover banner ──────────────────────────────────────────────────

function CollectionBanner({ collection }: { collection: Collection }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <div className="relative h-40 w-full overflow-hidden">
      {collection.coverImageUrl && !imgErr ? (
        <img
          src={collection.coverImageUrl}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setImgErr(true)}
        />
      ) : (
        <div className="w-full h-full bg-gradient-to-br from-primary/16 to-primary/4" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
    </div>
  );
}

// ─── Journey card ─────────────────────────────────────────────────────────────

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

  // Self-paced content always uses "Continue" regardless of enrollment state.
  const actionLabel = 'Continue';

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

export default function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const search = useSearch();
  // Resolve back destination from the ?source= param so that navigating here
  // from the Journeys tab (?source=nextStepsJourneys) returns to /journeys?tab=journeys
  // rather than /journeys/explore.
  const backDestination = (() => {
    try {
      const source = new URLSearchParams(search).get('source');
      if (source === 'nextStepsJourneys') return '/journeys?tab=journeys';
    } catch { /* ignore */ }
    return '/journeys/explore';
  })();
  const { journeys, progress, startJourney } = useJourney();
  const { user } = useAuth();
  const { startSharedJourney } = useRooms();
  const { getState, saveForLater, canActivateMore } = useEnrollment();

  const [collection, setCollection]           = useState<Collection | null>(null);
  const [journeyIds, setJourneyIds]           = useState<string[]>([]);
  const [loading, setLoading]                 = useState(true);
  const [pendingJourneyId, setPendingJourneyId] = useState<string | null>(null);
  const [journeysWithIntro, setJourneysWithIntro] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getCollection(id),
      getCollectionJourneys(id),
    ])
      .then(([col, items]) => {
        setCollection(col);
        const ids = items.map(i => i.id);
        setJourneyIds(ids);
        // Pre-fetch which journeys have a Walk Introduction (day=0) so
        // handleStartAlone / handleStartWithRoom can route to the right step.
        checkJourneysHaveIntro(ids)
          .then(introSet => setJourneysWithIntro(introSet))
          .catch(() => { /* non-fatal: defaults to day/1 */ });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const publishedJourneys = useMemo(
    () => journeys.filter(j => j.status === 'Published'),
    [journeys]
  );

  const startedIds = useMemo(() => new Set(Object.keys(progress)), [progress]);

  const collectionJourneys = useMemo(
    () => publishedJourneys.filter(j => journeyIds.includes(j.id)),
    [publishedJourneys, journeyIds]
  );

  /** Returns day/0 for walks that have a Walk Introduction, otherwise day/1. */
  const startDayFor = useCallback(
    (journeyId: string) => (journeysWithIntro.has(journeyId) ? 0 : 1),
    [journeysWithIntro],
  );

  const handleStart = useCallback((journeyId: string) => {
    const j = journeys.find(x => x.id === journeyId);
    if (!j) return;
    // Guard: only treat as started when a real DB progress record exists.
    // getState() defaults to 'active' for any journey not in localStorage —
    // that default must never be used to infer the journey has been opened.
    if (startedIds.has(journeyId)) {
      // Resume at the actual next incomplete step.
      setLocation(`/journey/${journeyId}/day/${progress[journeyId]?.currentDay ?? startDayFor(journeyId)}`);
      return;
    }
    // Not yet started — check enrollment capacity, then open the start modal.
    if (!isExemptJourney(j) && !canActivateMore(journeys, startedIds)) {
      setLocation(`/journeys/${journeyId}`);
      return;
    }
    setPendingJourneyId(journeyId);
  }, [journeys, progress, canActivateMore, startedIds, startDayFor, setLocation]);

  async function handleStartAlone() {
    if (!pendingJourneyId) return;
    const id = pendingJourneyId;
    const day = startDayFor(id);
    // Throws on failure — the modal catches this and shows an inline error message.
    await startJourney(id);
    setPendingJourneyId(null);
    setLocation(`/journey/${id}/day/${day}`);
  }

  async function handleStartWithRoom(roomId: string) {
    if (!pendingJourneyId || !user) return;
    const id = pendingJourneyId;
    const day = startDayFor(id);
    // Throws on failure — the modal catches this and shows an inline error message.
    await startJourney(id);
    startSharedJourney(roomId, id, user.id);
    setPendingJourneyId(null);
    setLocation(`/journey/${id}/day/${day}`);
  }

  const pendingJourney = journeys.find(j => j.id === pendingJourneyId) ?? null;

  // ── Not found ──────────────────────────────────────────────────────────────
  if (!loading && !collection) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-6 px-8 text-center pb-24">
        <p className="text-[15px] text-muted-foreground leading-relaxed">
          We couldn't find that collection.
        </p>
        <Button
          variant="outline"
          className="rounded-xl h-10"
          onClick={() => setLocation(backDestination)}
        >
          Go Back
        </Button>
        <BottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center gap-3 px-5 pt-12 pb-4">
          <button
            onClick={() => setLocation(backDestination)}
            className="h-9 w-9 flex items-center justify-center rounded-full hover:bg-muted transition-colors shrink-0"
            aria-label="Back"
          >
            <ChevronLeft size={22} className="text-foreground" />
          </button>
          <h1 className="text-[20px] font-semibold text-foreground tracking-tight truncate flex-1">
            {loading ? '' : (collection?.title ?? 'Collection')}
          </h1>
        </div>
      </div>

      {loading ? (
        /* Skeleton */
        <div className="px-5 pt-6 space-y-4">
          <div className="h-5 w-2/3 rounded-lg bg-muted/50 animate-pulse" />
          <div className="h-4 w-full rounded-lg bg-muted/40 animate-pulse" />
          <div className="h-4 w-4/5 rounded-lg bg-muted/40 animate-pulse" />
          <div className="pt-4 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-[120px] rounded-2xl bg-muted/30 animate-pulse" />
            ))}
          </div>
        </div>
      ) : collection && (
        <>
          {/* Cover banner */}
          <CollectionBanner collection={collection} />

          {/* Collection info */}
          <div className="px-5 -mt-10 relative z-10 space-y-1 pb-4">
            <h2 className="text-[22px] font-semibold text-foreground tracking-tight">
              {collection.title}
            </h2>
            {collection.description && (
              <p className="text-[14px] text-muted-foreground leading-relaxed">
                {collection.description}
              </p>
            )}
            <p className="text-[12px] text-muted-foreground">
              {collectionJourneys.length} {collectionJourneys.length === 1 ? 'Walk' : 'Walks'}
            </p>
          </div>

          {/* Journey list */}
          <div className="px-5 space-y-3">
            {collectionJourneys.length === 0 ? (
              <p className="text-[14px] text-muted-foreground py-8 text-center">
                No Walks in this journey yet.
              </p>
            ) : (
              collectionJourneys.map(j => {
                const state = getState(j.id);
                return (
                  <JourneyCard
                    key={j.id}
                    journey={j}
                    isSaved={state === 'saved'}
                    enrollState={state as any}
                    onStart={() => handleStart(j.id)}
                    onSave={() => saveForLater(j.id)}
                    onDetails={() => setLocation(`/journeys/${j.id}`)}
                  />
                );
              })
            )}
          </div>
        </>
      )}

      <BottomNav />

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
