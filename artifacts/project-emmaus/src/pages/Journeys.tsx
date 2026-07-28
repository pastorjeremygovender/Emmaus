/**
 * Next Steps — unified member discovery experience.
 *
 * All grouping and eligibility is determined by the server via GET /api/next-steps.
 * This component is responsible only for rendering sections and handling user actions.
 *
 * Section order:
 *   1. Recommended for You
 *   2. Daily Devotionals
 *   3. This Week's Sermon  (+ Browse Previous Sermons)
 *   4. Journeys
 *   5. Bible Studies
 *   6. Recently Added
 *
 * Route: /journeys
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { useDailyGate, isGatedByDailyGate } from '@/lib/daily-gate';
import JourneyStartModal from '@/components/JourneyStartModal';
import { useRooms } from '@/contexts/RoomsContext';
import {
  X, Pause, MoreHorizontal, ChevronDown, ChevronUp, Loader2,
  BookOpen, Mic2, BookHeart, Map,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Journey } from '@/contexts/JourneyContext';
import {
  fetchNextSteps,
  startSeries,
  type NextStepsData,
  type NextStepsItem,
  type ContentType,
} from '@/lib/next-steps-api';

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-muted-foreground/60">{icon}</span>}
      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {children}
      </h2>
    </div>
  );
}

// ─── Content-type chip ────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  journey:            'Journey',
  'bible-study':      'Bible Study',
  'sermon-devotional':'Sermon Devotional',
  'daily-devotional': 'Daily Devotional',
};

function ContentTypeChip({ contentType }: { contentType: ContentType }) {
  return (
    <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">
      {CONTENT_TYPE_LABELS[contentType]}
    </span>
  );
}

// ─── Member state pill ────────────────────────────────────────────────────────

function StatePill({ state }: { state: NextStepsItem['memberProgressState'] }) {
  if (state === 'not-started') return null;
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
      state === 'completed'
        ? 'bg-primary/10 text-primary'
        : 'bg-amber-50 text-amber-700 border border-amber-200'
    }`}>
      {state === 'completed' ? 'Completed' : 'In Progress'}
    </span>
  );
}

// ─── Cover thumbnail ──────────────────────────────────────────────────────────

function CoverThumb({
  url,
  title,
  className = '',
}: {
  url?: string;
  title: string;
  className?: string;
}) {
  const [err, setErr] = useState(false);
  const initials = title
    .split(' ')
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase();
  if (!url || err) {
    return (
      <div className={`bg-primary/8 flex items-center justify-center ${className}`}>
        <span className="text-primary/30 text-[18px] font-medium select-none">{initials}</span>
      </div>
    );
  }
  return (
    <img
      src={url}
      alt=""
      className={`object-cover ${className}`}
      onError={() => setErr(true)}
    />
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3 animate-pulse">
      <div className="h-3 w-20 rounded bg-muted" />
      <div className="h-5 w-2/3 rounded bg-muted" />
      <div className="h-3 w-1/2 rounded bg-muted" />
      <div className="h-10 rounded-xl bg-muted mt-1" />
    </div>
  );
}

// ─── More menu ────────────────────────────────────────────────────────────────

function MoreMenu({
  onPause,
  onDetails,
}: {
  onPause: () => void;
  onDetails: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        aria-label="More actions"
      >
        <MoreHorizontal size={17} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-9 z-30 bg-background border border-border rounded-xl shadow-lg py-1 w-48"
          >
            <button
              onClick={() => { setOpen(false); onPause(); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2"
            >
              <Pause size={14} className="text-muted-foreground" /> Pause Journey
            </button>
            <button
              onClick={() => { setOpen(false); onDetails(); }}
              className="w-full text-left px-4 py-2.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors"
            >
              View Details
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Pause dialog ─────────────────────────────────────────────────────────────

function PauseDialog({
  title,
  onPause,
  onCancel,
}: {
  title: string;
  onPause: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-medium text-foreground leading-snug pr-3">
            Pause {title}?
          </h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Your progress and responses will be kept exactly as they are. You can resume whenever you're ready.
        </p>
        <div className="flex gap-3">
          <Button className="flex-1 h-11 rounded-xl" onClick={onPause}>Pause Journey</Button>
          <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={onCancel}>Not now</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Journey limit dialog ─────────────────────────────────────────────────────

function JourneyLimitDialog({ onCancel }: { onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-medium text-foreground leading-snug pr-3">
            You're already walking through five journeys.
          </h2>
          <button onClick={onCancel} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          To begin another one, pause or complete one of your current journeys.
        </p>
        <Button
          variant="ghost"
          className="w-full h-11 rounded-xl text-muted-foreground"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Switch devotional dialog ─────────────────────────────────────────────────

function SwitchDevotionalDialog({
  currentTitle,
  newTitle,
  onKeep,
  onSwitch,
}: {
  currentTitle: string;
  newTitle: string;
  onKeep: () => void;
  onSwitch: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-4 shadow-xl">
        <h2 className="text-[18px] font-medium text-foreground leading-snug">
          You're currently reading {currentTitle}.
        </h2>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Would you like to make <strong>{newTitle}</strong> your current Daily Devotional instead?
          Your progress in {currentTitle} will be kept.
        </p>
        <div className="flex flex-col gap-2.5">
          <Button variant="outline" className="w-full h-11 rounded-xl" onClick={onKeep}>
            Keep {currentTitle}
          </Button>
          <Button className="w-full h-11 rounded-xl" onClick={onSwitch}>
            Start {newTitle}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ item }: { item: NextStepsItem }) {
  const { memberProgressState, metadata } = item;
  if (memberProgressState !== 'in-progress' || !metadata.durationDays) return null;
  // We don't have exact completedDays count from the server response,
  // so just show a subtle "in progress" indicator without a specific %.
  return (
    <div className="mx-4 mt-0.5">
      <div className="h-0.5 rounded-full bg-primary/20 overflow-hidden">
        <div className="h-full rounded-full bg-primary/40 w-1/3" />
      </div>
    </div>
  );
}

// ─── Standard discovery card ──────────────────────────────────────────────────
// Used for: Journeys, Bible Studies, and in-section Recommended items.

function DiscoveryCard({
  item,
  onAction,
  onPause,
  onDetails,
  isGated,
  onGate,
  enrollmentState,
}: {
  item: NextStepsItem;
  onAction: () => void;
  onPause?: () => void;
  onDetails?: () => void;
  isGated?: boolean;
  onGate?: () => void;
  enrollmentState?: string | null;
}) {
  const dur = item.metadata.durationDays
    ? `${item.metadata.durationDays} ${item.metadata.durationDays === 1 ? 'Day' : 'Days'}`
    : null;

  const actionLabel = enrollmentState === 'paused' && item.memberProgressState === 'in-progress'
    ? `Resume ${CONTENT_TYPE_LABELS[item.contentType]}`
    : item.primaryActionLabel;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      <div className="flex">
        <div className="w-14 shrink-0 min-h-[68px]">
          <CoverThumb
            url={item.metadata.coverImageUrl}
            title={item.title}
            className="w-full h-full rounded-l-2xl"
          />
        </div>
        <div className="flex-1 min-w-0 px-4 pt-3.5 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1 space-y-0.5">
              <div className="flex items-center gap-2 flex-wrap">
                <ContentTypeChip contentType={item.contentType} />
                <StatePill state={item.memberProgressState} />
              </div>
              <h3 className="text-[15px] font-medium text-foreground leading-snug">
                {item.title}
              </h3>
              <div className="flex items-center gap-x-2 text-[12px] text-muted-foreground flex-wrap">
                {dur && <span>{dur}</span>}
                {item.metadata.difficulty && (
                  <>
                    <span className="opacity-30">·</span>
                    <span>{item.metadata.difficulty}</span>
                  </>
                )}
              </div>
            </div>
            {item.memberProgressState === 'in-progress' && onPause && onDetails && (
              <MoreMenu onPause={onPause} onDetails={onDetails} />
            )}
          </div>
        </div>
      </div>

      <ProgressBar item={item} />

      <div className="px-4 pb-4 pt-3">
        {isGated && item.memberProgressState === 'in-progress' ? (
          <Button
            variant="outline"
            className="w-full h-10 rounded-xl text-[13px]"
            onClick={onGate}
          >
            Complete today's 10 Minutes with Jesus first
          </Button>
        ) : (
          <Button
            className="w-full h-10 rounded-xl text-[14px]"
            variant={item.memberProgressState === 'not-started' ? 'outline' : 'default'}
            onClick={onAction}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Daily Devotional card ────────────────────────────────────────────────────

function DevotionalCard({
  item,
  onAction,
  starting,
}: {
  item: NextStepsItem;
  onAction: () => void;
  starting: boolean;
}) {
  const dur = item.metadata.durationDays
    ? `${item.metadata.durationDays} Days`
    : null;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            <BookHeart size={12} className="text-primary shrink-0" />
            <ContentTypeChip contentType="daily-devotional" />
          </div>
          <StatePill state={item.memberProgressState} />
        </div>
        <p className="text-[16px] font-medium text-foreground leading-snug">{item.title}</p>
        {item.description && (
          <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2">
            {item.description}
          </p>
        )}
        {dur && <p className="text-[12px] text-muted-foreground">{dur}</p>}
      </div>
      <Button
        className="w-full h-10 rounded-xl text-[14px]"
        variant={item.memberProgressState === 'not-started' ? 'outline' : 'default'}
        onClick={onAction}
        disabled={starting}
      >
        {starting ? <Loader2 size={14} className="animate-spin" /> : item.primaryActionLabel}
      </Button>
    </div>
  );
}

// ─── Sermon devotional card ────────────────────────────────────────────────────

function SermonCard({
  item,
  onAction,
}: {
  item: NextStepsItem;
  onAction: () => void;
}) {
  const dur = item.metadata.durationDays
    ? `${item.metadata.durationDays} Days`
    : null;

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <Mic2 size={12} className="text-primary shrink-0" />
          <ContentTypeChip contentType="sermon-devotional" />
          <StatePill state={item.memberProgressState} />
        </div>
        <p className="text-[17px] font-medium text-foreground leading-snug">{item.title}</p>
        {item.metadata.scriptureReference && (
          <p className="text-[12px] text-muted-foreground font-medium">
            {item.metadata.scriptureReference}
          </p>
        )}
        {item.description && (
          <p className="text-[13px] text-muted-foreground leading-relaxed line-clamp-2">
            {item.description}
          </p>
        )}
        {dur && <p className="text-[12px] text-muted-foreground">{dur}</p>}
      </div>
      <Button className="w-full h-10 rounded-xl text-[14px]" onClick={onAction}>
        {item.primaryActionLabel}
      </Button>
    </div>
  );
}

// ─── Compact row (Previous Sermons, Recently Added) ───────────────────────────

function CompactRow({
  item,
  onAction,
  starting,
}: {
  item: NextStepsItem;
  onAction: () => void;
  starting?: boolean;
}) {
  return (
    <div className="px-4 py-3 rounded-xl border border-border bg-card flex items-center justify-between gap-3">
      <div className="flex-1 min-w-0">
        <ContentTypeChip contentType={item.contentType} />
        <p className="text-[14px] font-medium text-foreground truncate">{item.title}</p>
        {item.memberProgressState !== 'not-started' && (
          <div className="mt-0.5">
            <StatePill state={item.memberProgressState} />
          </div>
        )}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-9 rounded-xl text-[13px] shrink-0"
        onClick={onAction}
        disabled={starting}
      >
        {starting
          ? <Loader2 size={13} className="animate-spin" />
          : item.memberProgressState === 'completed' ? 'Review'
          : item.memberProgressState === 'in-progress' ? 'Continue'
          : 'Begin'}
      </Button>
    </div>
  );
}

// ─── Recommended item — thin wrapper that picks the right card ────────────────

function RecommendedCard({
  item,
  onJourneyAction,
  onDevotionalAction,
  starting,
}: {
  item: NextStepsItem;
  onJourneyAction: (item: NextStepsItem) => void;
  onDevotionalAction: (item: NextStepsItem) => void;
  starting: boolean;
}) {
  if (item.contentType === 'daily-devotional') {
    return (
      <DevotionalCard
        item={item}
        onAction={() => onDevotionalAction(item)}
        starting={starting}
      />
    );
  }
  if (item.contentType === 'sermon-devotional') {
    return <SermonCard item={item} onAction={() => onJourneyAction(item)} />;
  }
  return <DiscoveryCard item={item} onAction={() => onJourneyAction(item)} />;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Journeys() {
  const { journeys, progress, startJourney } = useJourney();
  const { user } = useAuth();
  const { startSharedJourney } = useRooms();
  const [, setLocation] = useLocation();
  const { getState, pauseJourney, canActivateMore } = useEnrollment();
  const { gateClear } = useDailyGate();

  // ── API data ─────────────────────────────────────────────────────────────

  const [data, setData] = useState<NextStepsData | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const currentCompanionId = useMemo<string | undefined>(() => {
    try {
      const raw = localStorage.getItem('emmaus_admin_settings');
      return raw ? (JSON.parse(raw)?.currentWeeklySermonCompanionId ?? undefined) : undefined;
    } catch { return undefined; }
  }, []);

  const reload = useCallback(async () => {
    setApiLoading(true);
    setApiError(null);
    try {
      const result = await fetchNextSteps({
        userId: user?.id,
        currentCompanionId,
      });
      setData(result);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setApiLoading(false);
    }
  }, [user?.id, currentCompanionId]);

  useEffect(() => { reload(); }, [reload]);

  // ── Journey dialog state ──────────────────────────────────────────────────

  const [pendingItem,      setPendingItem]      = useState<NextStepsItem | null>(null);
  const [pauseTargetId,    setPauseTargetId]    = useState<string | null>(null);
  const [showLimitDialog,  setShowLimitDialog]  = useState(false);

  // ── Devotional state ──────────────────────────────────────────────────────

  const [startingDevId,   setStartingDevId]   = useState<string | null>(null);
  const [switchTarget,    setSwitchTarget]    = useState<NextStepsItem | null>(null);

  // ── Sermon section ────────────────────────────────────────────────────────

  const [showPreviousSermons, setShowPreviousSermons] = useState(false);

  // ── Journey action handler ────────────────────────────────────────────────

  function handleJourneyAction(item: NextStepsItem) {
    // Navigate directly if already started
    if (item.memberProgressState !== 'not-started') {
      setLocation(item.route);
      return;
    }
    // Check enrollment limit for non-exempt journey types
    const journey = journeys.find(j => j.id === item.id);
    if (journey && !isExemptJourney(journey)) {
      const startedIds = new Set(Object.keys(progress));
      if (!canActivateMore(journeys, startedIds)) {
        setShowLimitDialog(true);
        return;
      }
    }
    setPendingItem(item);
  }

  function handleStartAlone() {
    if (!pendingItem) return;
    startJourney(pendingItem.id);
    setLocation(`/journey/${pendingItem.id}/day/1`);
    setPendingItem(null);
    reload();
  }

  function handleStartWithRoom(roomId: string) {
    if (!pendingItem || !user) return;
    startJourney(pendingItem.id);
    startSharedJourney(roomId, pendingItem.id, user.id);
    setLocation(`/journey/${pendingItem.id}/day/1`);
    setPendingItem(null);
    reload();
  }

  // ── Devotional action handler ─────────────────────────────────────────────

  function handleDevotionalAction(item: NextStepsItem) {
    // If already in progress or completed, navigate directly
    if (item.memberProgressState !== 'not-started') {
      setLocation(item.route);
      return;
    }
    // If another devotional is already active, show switch dialog
    const activeDevotional = data?.dailyDevotionals.find(
      d => d.memberProgressState === 'in-progress',
    );
    if (activeDevotional && activeDevotional.id !== item.id) {
      setSwitchTarget(item);
      return;
    }
    doStartDevotional(item);
  }

  async function doStartDevotional(item: NextStepsItem) {
    if (!user) return;
    setStartingDevId(item.id);
    try {
      await startSeries(item.id, { userId: user.id });
      await reload();
      setLocation(`/devotional/${item.id}/day/1`);
    } catch {
      // non-fatal
    } finally {
      setStartingDevId(null);
      setSwitchTarget(null);
    }
  }

  // ── Daily-gate check ──────────────────────────────────────────────────────

  function isItemGated(item: NextStepsItem): boolean {
    if (gateClear || item.memberProgressState !== 'in-progress') return false;
    const journey = journeys.find(j => j.id === item.id);
    return !!journey && isGatedByDailyGate(journey) && getState(item.id) === 'active';
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-10">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="space-y-1">
          <h1 className="text-[28px] font-sans font-medium tracking-tight text-foreground">
            Next Steps
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Choose something that will help you take your next step with Jesus.
          </p>
        </header>

        {/* ── Loading ──────────────────────────────────────────────────────── */}
        {apiLoading && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {!apiLoading && apiError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-5 space-y-3">
            <p className="text-[14px] text-destructive">{apiError}</p>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        {/* ── Content ──────────────────────────────────────────────────────── */}
        {!apiLoading && data && (
          <>
            {/* 1. Recommended for You */}
            {data.recommended.length > 0 && (
              <section className="space-y-3">
                <SectionLabel>Recommended for You</SectionLabel>
                <div className="space-y-3">
                  {data.recommended.map(item => (
                    <RecommendedCard
                      key={item.id}
                      item={item}
                      onJourneyAction={handleJourneyAction}
                      onDevotionalAction={handleDevotionalAction}
                      starting={startingDevId === item.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 2. Daily Devotionals */}
            {data.dailyDevotionals.length > 0 && (
              <section className="space-y-3">
                <SectionLabel icon={<BookHeart size={13} />}>Daily Devotionals</SectionLabel>
                <div className="space-y-3">
                  {data.dailyDevotionals.map(item => (
                    <DevotionalCard
                      key={item.id}
                      item={item}
                      onAction={() => handleDevotionalAction(item)}
                      starting={startingDevId === item.id}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 3. This Week's Sermon */}
            {data.currentSermonDevotional && (
              <section className="space-y-3">
                <SectionLabel icon={<Mic2 size={13} />}>This Week's Sermon</SectionLabel>
                <SermonCard
                  item={data.currentSermonDevotional}
                  onAction={() => handleJourneyAction(data.currentSermonDevotional!)}
                />
                {data.previousSermonDevotionals.length > 0 && (
                  <div>
                    <button
                      onClick={() => setShowPreviousSermons(p => !p)}
                      className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground transition-colors py-1"
                    >
                      Browse Previous Sermons
                      {showPreviousSermons ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                    </button>
                    <AnimatePresence>
                      {showPreviousSermons && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden mt-2 space-y-2"
                        >
                          {data.previousSermonDevotionals.map(item => (
                            <CompactRow
                              key={item.id}
                              item={item}
                              onAction={() => handleJourneyAction(item)}
                            />
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </section>
            )}

            {/* 4. Journeys */}
            {data.journeys.length > 0 && (
              <section className="space-y-3">
                <SectionLabel icon={<Map size={13} />}>Journeys</SectionLabel>
                <div className="space-y-3">
                  {data.journeys.map(item => (
                    <DiscoveryCard
                      key={item.id}
                      item={item}
                      onAction={() => handleJourneyAction(item)}
                      onPause={() => setPauseTargetId(item.id)}
                      onDetails={() => setLocation(`/journeys/${item.id}`)}
                      isGated={isItemGated(item)}
                      onGate={() => setLocation('/walk')}
                      enrollmentState={getState(item.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 5. Bible Studies */}
            {data.bibleStudies.length > 0 && (
              <section className="space-y-3">
                <SectionLabel icon={<BookOpen size={13} />}>Bible Studies</SectionLabel>
                <div className="space-y-3">
                  {data.bibleStudies.map(item => (
                    <DiscoveryCard
                      key={item.id}
                      item={item}
                      onAction={() => handleJourneyAction(item)}
                      onPause={() => setPauseTargetId(item.id)}
                      onDetails={() => setLocation(`/journeys/${item.id}`)}
                      enrollmentState={getState(item.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* 6. Recently Added */}
            {data.recentlyAdded.length > 0 && (
              <section className="space-y-3">
                <SectionLabel>Recently Added</SectionLabel>
                <div className="space-y-2">
                  {data.recentlyAdded.map(item => (
                    <CompactRow
                      key={item.id}
                      item={item}
                      onAction={() =>
                        item.contentType === 'daily-devotional'
                          ? handleDevotionalAction(item)
                          : handleJourneyAction(item)
                      }
                      starting={startingDevId === item.id}
                    />
                  ))}
                </div>
              </section>
            )}

          </>
        )}

      </main>

      <BottomNav />

      {/* Journey start modal */}
      {pendingItem && (
        <JourneyStartModal
          journeyId={pendingItem.id}
          journeyTitle={pendingItem.title}
          onClose={() => setPendingItem(null)}
          onStartAlone={handleStartAlone}
          onStartWithRoom={handleStartWithRoom}
        />
      )}

      {/* Pause dialog */}
      {pauseTargetId && (
        <PauseDialog
          title={journeys.find(j => j.id === pauseTargetId)?.title ?? 'this journey'}
          onPause={() => { pauseJourney(pauseTargetId); setPauseTargetId(null); }}
          onCancel={() => setPauseTargetId(null)}
        />
      )}

      {/* Journey limit dialog */}
      {showLimitDialog && (
        <JourneyLimitDialog onCancel={() => setShowLimitDialog(false)} />
      )}

      {/* Switch devotional dialog */}
      {switchTarget && (() => {
        const active = data?.dailyDevotionals.find(d => d.memberProgressState === 'in-progress');
        if (!active) return null;
        return (
          <SwitchDevotionalDialog
            currentTitle={active.title}
            newTitle={switchTarget.title}
            onKeep={() => setSwitchTarget(null)}
            onSwitch={() => doStartDevotional(switchTarget)}
          />
        );
      })()}

    </div>
  );
}
