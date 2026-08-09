/**
 * JourneyDetail — member-facing Walk overview.
 * Route: /journeys/:id
 *
 * Layout (spec order):
 *   Back → Collection name (h1) → Walk title (secondary) →
 *   Progress → Continue → Steps
 */

import { useState, useMemo, useEffect, useCallback } from 'react';
import { useLocation, useParams } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { useDailyGate, isGatedByDailyGate } from '@/lib/daily-gate';
import JourneyStartSheet from '@/components/JourneyStartSheet';
import { useRooms } from '@/contexts/RoomsContext';
import { apiStartShared } from '@/lib/rooms-api';
import { getCollection } from '@/lib/collections-api';
import { ChevronLeft, Bookmark, BookmarkCheck, CheckCircle2, Users } from 'lucide-react';
import { FavouriteButton } from '@/components/FavouriteButton';
import { resolveReturn } from '@/lib/return-context';
import { apiLinkJourney } from '@/lib/rooms-api';
import { RoomPickerSheet } from '@/components/RoomPickerSheet';
import { StudyTogetherSheet } from '@/components/StudyTogetherSheet';
import type { Journey } from '@/contexts/JourneyContext';

// ─── Main component ───────────────────────────────────────────────────────────

export default function JourneyDetail() {
  const params = useParams<{ id: string }>();
  const journeyId = params.id;
  const [, setLocation] = useLocation();
  const { journeys, progress, startJourney, getStepsForJourney, loading } = useJourney();
  const { user } = useAuth();
  const { getState, saveForLater, resumeJourney, canActivateMore } = useEnrollment();
  const { gateClear, coreJourney: coreJ } = useDailyGate();
  const { getMyRooms, loadRooms, loadRoomDetail, getRoomDetail } = useRooms();

  // Read return context from URL — set by the navigation caller.
  const source   = new URLSearchParams(window.location.search).get('source');
  const sourceId = new URLSearchParams(window.location.search).get('sourceId');

  // When navigating into a lesson, pass our own back-context through so that
  // "Back to Walk" from the completion screen (and the lesson back arrow) can
  // return here with source params intact — allowing this page's back arrow to
  // correctly resolve to the right parent.
  const backContextSuffix = source
    ? `&backSource=${encodeURIComponent(source)}&backSourceId=${encodeURIComponent(sourceId ?? '')}`
    : '';

  const [pendingStart, setPendingStart]       = useState(false);
  const [showLimitMsg, setShowLimitMsg]       = useState(false);
  const [collectionName, setCollectionName]   = useState<string | null>(null);
  const [showRoomPicker, setShowRoomPicker]   = useState(false);
  const [showStudyTogether, setShowStudyTogether] = useState(false);

  const journey = journeys.find(j => j.id === journeyId);
  const prog = journey ? progress[journey.id] : undefined;
  const startedIds = useMemo(() => new Set(Object.keys(progress)), [progress]);
  // Exclude completion steps — they are their own content type (Walk Complete page),
  // not numbered lessons. durationDays on the journey is already recomputed
  // to exclude them, so progress and isFinalStep calculations remain consistent.
  const steps = journey
    ? getStepsForJourney(journey.id).filter(s => !s.isCompletionStep)
    : [];

  const enrollState = journey ? getState(journey.id) : 'active';
  const isStarted   = !!prog;
  const isCompleted = prog && journey ? prog.completedDays.length >= journey.durationDays : false;
  const isSaved     = enrollState === 'saved';
  const isPaused    = enrollState === 'paused' && isStarted;
  const isActive    = enrollState === 'active' && isStarted && !isCompleted;

  // ── Step helpers ──────────────────────────────────────────────────────────
  // Steps are already filtered to Published for member roles by JourneyContext.
  // Use these instead of hardcoded day numbers so the Continue button always
  // lands on a real published step, even when day numbering has gaps.
  const firstStepDay = steps[0]?.day ?? 1;
  /** Next unfinished published step day. Falls back to firstStepDay when all are done. */
  const nextUnfinishedDay = prog
    ? (steps.find(s => !prog.completedDays.includes(s.day))?.day ?? firstStepDay)
    : firstStepDay;

  // Fetch collection name for the page heading (h1 = collection, secondary = walk title)
  useEffect(() => {
    if (!journey?.collectionId) return;
    getCollection(journey.collectionId)
      .then(col => setCollectionName(col?.title ?? null))
      .catch(() => {});
  }, [journey?.collectionId]);

  // Auto-unhide — opening a Walk from Next Steps (or anywhere) restores it to
  // Today's Steps. This is fire-and-forget; the member doesn't need to wait for it.
  useEffect(() => {
    if (!journey || !prog || !user) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(
      `${base}/api/engagements/journey/${encodeURIComponent(journey.id)}/unhide`,
      { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } },
    ).catch(() => { /* non-fatal */ });
  }, [journey?.id, !!prog, !!user]);

  // Pre-fetch room details so we can detect if this journey is already linked to a room.
  // Runs whenever the user's room list changes (e.g. after sign-in or room join).
  const userRooms = user ? getMyRooms(user.id) : [];
  useEffect(() => {
    if (!journey || userRooms.length === 0) return;
    userRooms.forEach(room => loadRoomDetail(room.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [journey?.id, userRooms.length]);

  // Derived: first room that already has this journey linked.
  const matchingRoomId = (() => {
    if (!journey) return null;
    for (const room of userRooms) {
      const detail = getRoomDetail(room.id);
      if (detail?.linkedJourneys.some(lj => lj.journeyId === journey.id)) {
        return room.id;
      }
    }
    return null;
  })();

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background pb-page-safe">
        <main className="px-5 pt-6 max-w-[480px] mx-auto space-y-6">
          <div className="h-5 w-1/4 rounded bg-muted animate-pulse" />
          <div className="h-8 w-2/3 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-1/2 rounded bg-muted animate-pulse" />
          <div className="h-12 rounded-xl bg-muted animate-pulse" />
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="min-h-[100dvh] bg-background pb-page-safe flex items-center justify-center">
        <div className="text-center space-y-3 px-5">
          <p className="text-[16px] text-foreground font-medium">This Journey isn't available yet.</p>
          <Button variant="outline" onClick={() => window.history.length > 1 ? window.history.back() : setLocation('/journeys')}>Back</Button>
        </div>
        <BottomNav />
      </div>
    );
  }

  // Daily gate — applies to non-exempt, non-override growth journeys.
  // Never gated when the content was opened from a Group — group study is
  // independent of personal Daily Rhythm progression.
  const isGated = !gateClear && source !== 'room' && isGatedByDailyGate(journey ?? { journeyType: '' } as any);

  function openCore() {
    if (!coreJ) { setLocation('/walk'); return; }
    if (!progress[coreJ.id]) startJourney(coreJ.id);
    const p = progress[coreJ.id];
    setLocation(`/journey/${coreJ.id}/day/${p?.currentDay ?? 1}?source=journeyDetail&sourceId=${coreJ.id}`);
  }

  function handlePrimaryAction() {
    if (!journey) return;
    // Gate check — before core is done, redirect non-exempt journeys to core
    if (isGated && !isCompleted) { openCore(); return; }
    // Navigate to the next unfinished published step (not prog.currentDay which may point
    // to a deleted or Draft step and trigger the JourneyDay route-guard bounce).
    if (isActive) {
      setLocation(`/journey/${journey.id}/day/${nextUnfinishedDay}?source=journeyDetail&sourceId=${journey.id}${backContextSuffix}`);
      return;
    }
    if (isPaused) {
      if (canActivateMore(journeys, startedIds)) {
        resumeJourney(journey.id);
        setLocation(`/journey/${journey.id}/day/${nextUnfinishedDay}?source=journeyDetail&sourceId=${journey.id}${backContextSuffix}`);
      } else { setShowLimitMsg(true); }
      return;
    }
    // Completed: open the dedicated Walk Complete page.
    if (isCompleted) {
      setLocation(`/journey/${journey.id}/complete?source=journeyDetail&sourceId=${journey.id}`);
      return;
    }
    if (!isExemptJourney(journey) && !canActivateMore(journeys, startedIds)) {
      setShowLimitMsg(true); return;
    }
    setPendingStart(true);
  }

  async function handleStartAlone() {
    if (!journey) return;
    // Throws on failure — the modal catches this and shows an inline error message.
    await startJourney(journey.id);
    setLocation(`/journey/${journey.id}/day/${firstStepDay}?source=journeyDetail&sourceId=${journey.id}${backContextSuffix}`);
    setPendingStart(false);
  }

  async function handleStartWithRoom(roomId: string) {
    if (!journey || !user) return;
    // Single atomic call: link journey + start progress in one DB transaction.
    // Throws on failure — the sheet catches this and shows an inline error.
    await apiStartShared(user.id, { journeyId: journey.id, roomId });
    // Sync the local progress cache (DB already has the record; this is a no-op at the DB level).
    await startJourney(journey.id);
    setLocation(`/journey/${journey.id}/day/${firstStepDay}?source=journeyDetail&sourceId=${journey.id}${backContextSuffix}`);
    setPendingStart(false);
  }

  async function handleCreateAndStart(roomName: string) {
    if (!journey || !user) return;
    // Single atomic call: create room + link journey + start progress in one DB transaction.
    const { roomId } = await apiStartShared(user.id, { journeyId: journey.id, roomName });
    // Sync frontend caches: progress (no-op at DB) + rooms list (shows the new room).
    await Promise.all([startJourney(journey.id), loadRooms()]);
    setLocation(`/journey/${journey.id}/day/${firstStepDay}?source=journeyDetail&sourceId=${journey.id}${backContextSuffix}`);
    setPendingStart(false);
  }

  function toggleSave() {
    if (!journey) return;
    if (isSaved) resumeJourney(journey.id);
    else saveForLater(journey.id);
  }

  async function handleLinkToRoom(roomId: string) {
    if (!journey || !user) throw new Error('Not available');
    // Throws on failure — RoomPickerSheet catches this and shows inline error.
    await apiLinkJourney(user.id, roomId, journey.id);
    // Invalidate the cached room detail so the room page reflects the new link.
    await loadRoomDetail(roomId);
  }

  // All self-paced journeys use "Continue" regardless of started/paused/completed state.
  // The gated case (isGated) only applies to Daily Rhythm (journeyType === 'core').
  const primaryLabel =
    (isGated && !isCompleted) ? 'Complete today\'s 10 Minutes with Jesus' :
                                 'Continue';

  const backDest = resolveReturn(source, sourceId, '/journeys?tab=journeys');

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="px-5 pt-6 max-w-[480px] mx-auto space-y-6">

        {/* ── Back button ───────────────────────────────────────────── */}
        <button
          onClick={() => setLocation(backDest.path)}
          className="flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground transition-colors -ml-0.5"
          aria-label="Back"
        >
          <ChevronLeft size={17} />
          {backDest.label}
        </button>

        {/* ── Page heading: collection name as h1, walk title secondary ─ */}
        <div className="space-y-0.5">
          <div className="flex items-start gap-2">
            <h1 className="flex-1 text-[26px] font-sans font-medium tracking-tight text-foreground leading-snug">
              {collectionName ?? journey.title}
            </h1>
            <FavouriteButton
              contentType="journey"
              contentId={journey.id}
              contentTitle={journey.title}
              contentRoute={`/journeys/${journey.id}`}
              className="mt-1 shrink-0"
            />
          </div>
          {/* Walk title shown as compact secondary label when it differs from the collection name */}
          {collectionName && collectionName !== journey.title && (
            <p className="text-[13px] text-muted-foreground">{journey.title}</p>
          )}
        </div>

        {/* ── Progress (if started) ─────────────────────────────────── */}
        {isActive && prog && (() => {
          const nextStep = steps.find(s => s.day === nextUnfinishedDay);
          return (
            <div className="space-y-2 p-4 rounded-xl bg-primary/5 border border-primary/15">
              <p className="text-[13px] font-medium text-primary">Step {prog.currentDay} of {journey.durationDays}</p>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round((prog.completedDays.length / (journey.durationDays || 1)) * 100)}%` }}
                />
              </div>
              {nextStep?.title && (
                <p className="text-[12px] text-primary/70 truncate">Up next: {nextStep.title}</p>
              )}
            </div>
          );
        })()}
        {isPaused && prog && (
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <p className="text-[13px] text-muted-foreground">Paused at Step {prog.currentDay} of {journey.durationDays}</p>
          </div>
        )}
        {isCompleted && (() => {
          const maxCompletedDay = prog ? Math.max(...prog.completedDays) : null;
          const lastStep = maxCompletedDay !== null ? steps.find(s => s.day === maxCompletedDay) : null;
          return (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2.5">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={17} className="text-emerald-600 shrink-0" />
                <p className="text-[14px] font-semibold text-emerald-800">Walk Completed</p>
              </div>
              <p className="text-[13px] text-emerald-700">
                {journey.durationDays} {journey.durationDays === 1 ? 'step' : 'steps'} completed
              </p>
              {lastStep?.title && (
                <div>
                  <p className="text-[11px] text-emerald-600/70 uppercase tracking-wide font-medium">Last completed</p>
                  <p className="text-[13px] text-emerald-800 mt-0.5 leading-snug">{lastStep.title}</p>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Journey limit message ─────────────────────────────────── */}
        {showLimitMsg && (
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-[14px] text-amber-900 leading-relaxed">
              You're already walking through five journeys. To begin another one, pause or complete one of your current journeys.
            </p>
            <button
              className="mt-2 text-[13px] text-amber-700 font-medium hover:underline"
              onClick={() => { setShowLimitMsg(false); setLocation('/journeys'); }}
            >
              Manage My Journeys →
            </button>
          </div>
        )}

        {/* ── Primary action + save ─────────────────────────────────── */}
        {/* Completed walks show no Continue — the Walk is done. Members can
            review any step from the list below, or open Walk Contents. */}
        {!isCompleted && (
          <div className="space-y-2.5">
            <Button
              className="w-full h-12 rounded-xl font-medium"
              style={{ fontSize: isGated ? '14px' : '16px' }}
              onClick={handlePrimaryAction}
            >
              {primaryLabel}
            </Button>
            {isGated && (
              <p className="text-[12px] text-muted-foreground text-center leading-snug">
                Begin with today's time with Jesus. Your Journey will be ready afterwards.
              </p>
            )}
            {!isStarted && (
              <button
                onClick={toggleSave}
                className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-[14px] text-muted-foreground hover:text-foreground border border-border hover:border-primary/30 transition-all"
                aria-label={isSaved ? 'Remove from saved' : 'Save for later'}
              >
                {isSaved
                  ? <><BookmarkCheck size={16} className="text-primary" /> Saved</>
                  : <><Bookmark size={16} /> Save for later</>}
              </button>
            )}
          </div>
        )}

        {/* ── Room / Study Together — shown when walking ───────────── */}
        {/* Already linked to a group → Open Group shortcut */}
        {matchingRoomId && (
          <button
            onClick={() => setLocation(`/rooms/${matchingRoomId}`)}
            className="flex items-center gap-2 text-[13px] text-primary font-medium hover:text-primary/80 transition-colors"
          >
            <Users size={13} />
            Open Group →
          </button>
        )}
        {/* Has other rooms but this walk isn't linked → retroactive link */}
        {(isStarted || isCompleted) && !matchingRoomId && userRooms.length > 0 && (
          <div className="flex items-center justify-between py-1">
            <span className="text-[13px] text-muted-foreground flex items-center gap-1.5">
              <Users size={13} />
              Walking this with others?
            </span>
            <button
              onClick={() => setShowRoomPicker(true)}
              className="text-[13px] font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Add to a Group →
            </button>
          </div>
        )}
        {/* No rooms at all → offer to create one (Study Together) */}
        {(isStarted || isCompleted) && !matchingRoomId && userRooms.length === 0 && (
          <div className="flex items-center justify-between py-1">
            <span className="text-[13px] text-muted-foreground flex items-center gap-1.5">
              <Users size={13} />
              Studying with others?
            </span>
            <button
              onClick={() => setShowStudyTogether(true)}
              className="text-[13px] font-medium text-primary hover:text-primary/80 transition-colors"
            >
              Study Together →
            </button>
          </div>
        )}

        {/* ── Steps ────────────────────────────────────────────────── */}
        {steps.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Steps
            </h2>
            <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
              {steps.map(s => {
                const done = prog?.completedDays.includes(s.day);
                // Show "Up next" only when the journey is in progress (started but not fully completed)
                const isUpNext = isStarted && !isCompleted && s.day === nextUnfinishedDay;
                return (
                  <button
                    key={s.day}
                    className={`w-full flex items-start gap-3 px-4 py-3.5 transition-colors text-left ${
                      isUpNext
                        ? 'bg-primary/5 hover:bg-primary/10 active:bg-primary/15'
                        : 'bg-card hover:bg-muted/40 active:bg-muted/60'
                    }`}
                    onClick={() => setLocation(`/journey/${journey.id}/day/${s.day}?source=journeyDetail&sourceId=${journey.id}${backContextSuffix}`)}
                    aria-label={isUpNext ? `Up next: step ${s.day}: ${s.title || `Step ${s.day}`}` : done ? `Review step ${s.day}: ${s.title || `Step ${s.day}`}` : `Go to step ${s.day}: ${s.title || `Step ${s.day}`}`}
                  >
                    <span className={`text-[12px] font-medium w-6 shrink-0 mt-0.5 ${done || isUpNext ? 'text-primary' : 'text-muted-foreground'}`}>
                      {s.day}
                    </span>
                    <span className={`text-[14px] leading-snug flex-1 ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {s.title || `Step ${s.day}`}
                    </span>
                    <span className={`ml-auto text-[11px] font-medium shrink-0 ${isUpNext ? 'text-primary' : done ? 'text-primary' : 'text-muted-foreground'}`}>
                      {isUpNext ? 'Up next →' : done ? 'Review →' : '→'}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

      </main>

      <BottomNav />

      {pendingStart && (
        <JourneyStartSheet
          journeyTitle={journey.title}
          userRooms={userRooms}
          onStartAlone={handleStartAlone}
          onStartInRoom={handleStartWithRoom}
          onCreateAndStart={handleCreateAndStart}
          onClose={() => setPendingStart(false)}
          initialStep={matchingRoomId ? 'room-list' : 'main'}
          preSelectedRoomId={matchingRoomId ?? undefined}
          showRoomNudge={!!matchingRoomId}
        />
      )}

      {showRoomPicker && (
        <RoomPickerSheet
          rooms={userRooms}
          onSelect={handleLinkToRoom}
          onClose={() => setShowRoomPicker(false)}
          title="Add Walk to a Group"
        />
      )}

      {showStudyTogether && user && (
        <StudyTogetherSheet
          defaultName={journey.title}
          userId={user.id}
          contentId={journey.id}
          contentType="journey"
          onClose={() => setShowStudyTogether(false)}
        />
      )}
    </div>
  );
}
