/**
 * Next Steps — three-tab member content library.
 *
 * Tabs (exact order, spec-locked):
 *   1. Daily Devotionals
 *   2. Journeys
 *   3. Sermon Companions
 *
 * All grouping and eligibility is determined server-side via GET /api/next-steps.
 * This component renders only — no publication rules here.
 *
 * Route: /journeys
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocation } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { EmmausContentCard } from '@/components/EmmausContentCard';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
// daily-gate import removed — all non-Daily-Rhythm content is now self-paced.
import JourneyStartModal from '@/components/JourneyStartModal';
import { useRooms } from '@/contexts/RoomsContext';
import {
  X, Pause, MoreHorizontal, Loader2,
  BookHeart, Mic2, Map,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Journey } from '@/contexts/JourneyContext';
import {
  fetchNextSteps,
  startSeries,
  type NextStepsData,
  type NextStepsItem,
  type ContentType,
  type JourneyCollectionGroup,
} from '@/lib/next-steps-api';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'devotionals' | 'journeys' | 'sermons';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  journey:             'Journey',
  'bible-study':       'Bible Study',
  'sermon-devotional': 'Sermon Companion',
  'daily-devotional':  'Daily Devotional',
};

function dayLabel(n?: number): string | null {
  if (!n) return null;
  return `${n} ${n === 1 ? 'Day' : 'Days'}`;
}

function sessionTab(): TabId {
  // Prefer ?tab= URL param — set when returning from content so the right tab opens.
  try {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab === 'devotionals' || urlTab === 'journeys' || urlTab === 'sermons') return urlTab as TabId;
  } catch { /* ignore */ }
  // Fall back to last-used tab from sessionStorage.
  try {
    const saved = sessionStorage.getItem('next-steps-tab');
    if (saved === 'devotionals' || saved === 'journeys' || saved === 'sermons') return saved as TabId;
  } catch { /* ignore */ }
  return 'devotionals';
}

function saveTab(tab: TabId) {
  try { sessionStorage.setItem('next-steps-tab', tab); } catch { /* ignore */ }
}

// ─── Shared UI atoms ─────────────────────────────────────────────────────────

function SectionLabel({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      {icon && <span className="text-muted-foreground/60">{icon}</span>}
      <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {children}
      </h2>
    </div>
  );
}

function CollectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
        {title}
      </h3>
      {description && (
        <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug">{description}</p>
      )}
    </div>
  );
}

function ContentTypeChip({ contentType }: { contentType: ContentType }) {
  return (
    <span className="text-[10px] font-semibold text-primary uppercase tracking-widest">
      {CONTENT_TYPE_LABELS[contentType]}
    </span>
  );
}

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

function CoverThumb({ url, title, className = '' }: { url?: string; title: string; className?: string }) {
  const [err, setErr] = useState(false);
  const initials = title.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
  if (!url || err) {
    return (
      <div className={`bg-primary/8 flex items-center justify-center ${className}`}>
        <span className="text-primary/30 text-[18px] font-medium select-none">{initials}</span>
      </div>
    );
  }
  return <img src={url} alt="" className={`object-cover ${className}`} onError={() => setErr(true)} />;
}

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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-16 text-center">
      <p className="text-[14px] text-muted-foreground">{message}</p>
    </div>
  );
}

// ─── More menu ────────────────────────────────────────────────────────────────

function MoreMenu({ onPause, onDetails }: { onPause: () => void; onDetails: () => void }) {
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

// ─── Modal dialogs ────────────────────────────────────────────────────────────

function PauseDialog({ title, onPause, onCancel }: { title: string; onPause: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-background rounded-2xl border border-border p-6 max-w-sm w-full space-y-5 shadow-xl">
        <div className="flex items-start justify-between">
          <h2 className="text-[18px] font-medium text-foreground leading-snug pr-3">Pause {title}?</h2>
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
        <Button variant="ghost" className="w-full h-11 rounded-xl text-muted-foreground" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function SwitchDevotionalDialog({
  currentTitle, newTitle, onKeep, onSwitch,
}: { currentTitle: string; newTitle: string; onKeep: () => void; onSwitch: () => void }) {
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
          <Button variant="outline" className="w-full h-11 rounded-xl" onClick={onKeep}>Keep {currentTitle}</Button>
          <Button className="w-full h-11 rounded-xl" onClick={onSwitch}>Start {newTitle}</Button>
        </div>
      </div>
    </div>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({ item }: { item: NextStepsItem }) {
  if (item.memberProgressState !== 'in-progress' || !item.metadata.durationDays) return null;
  return (
    <div className="mx-4 mt-0.5">
      <div className="h-0.5 rounded-full bg-primary/20 overflow-hidden">
        <div className="h-full rounded-full bg-primary/40 w-1/3" />
      </div>
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function DiscoveryCard({
  item, onAction, onPause, onDetails, isGated, onGate, enrollmentState, onViewPreviousSteps,
}: {
  item: NextStepsItem;
  onAction: () => void;
  onPause?: () => void;
  onDetails?: () => void;
  isGated?: boolean;
  onGate?: () => void;
  enrollmentState?: string | null;
  onViewPreviousSteps?: () => void;
}) {
  const dur = dayLabel(item.metadata.durationDays);
  const metaParts = [dur, item.metadata.difficulty].filter(Boolean);
  // Self-paced content always uses "Continue" regardless of enrollment state.
  // The backend already returns "Continue" from next-steps.ts; this ensures
  // the paused-override no longer replaces it with "Continue Journey".
  const actionLabel = item.primaryActionLabel;
  const label = (CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType).toUpperCase();

  return (
    <EmmausContentCard
      label={label}
      title={item.title}
      description={item.description}
      metadata={metaParts.join(' · ') || undefined}
      primaryActionLabel={actionLabel}
      onAction={onAction}
      headerTrailing={
        item.memberProgressState === 'in-progress' && onPause && onDetails
          ? <MoreMenu onPause={onPause} onDetails={onDetails} />
          : undefined
      }
      progressPercent={item.memberProgressState === 'in-progress' ? 33 : undefined}
      gatedMessage={
        isGated && item.memberProgressState === 'in-progress'
          ? "Complete today's 10 Minutes with Jesus first"
          : undefined
      }
      onGate={onGate}
      secondaryAction={
        onViewPreviousSteps
          ? { label: 'View Previous Steps →', onPress: onViewPreviousSteps }
          : undefined
      }
    />
  );
}

function DevotionalCard({
  item,
  onAction,
  starting,
  onViewPreviousDays,
}: {
  item: NextStepsItem;
  onAction: () => void;
  starting: boolean;
  onViewPreviousDays?: () => void;
}) {
  const dur = dayLabel(item.metadata.durationDays);
  return (
    <EmmausContentCard
      label="DAILY DEVOTIONAL"
      title={item.title}
      description={item.description}
      metadata={dur || undefined}
      primaryActionLabel={item.primaryActionLabel}
      onAction={onAction}
      loading={starting}
      secondaryAction={
        onViewPreviousDays
          ? { label: 'View Previous Entries →', onPress: onViewPreviousDays }
          : undefined
      }
    />
  );
}

// SermonCard removed — Journeys.tsx now uses the shared SermonCompanionCard component.

// ─── Tab content panels ───────────────────────────────────────────────────────

function DevotionalsPanel({
  items, onAction, startingId, onViewPreviousDays,
}: {
  items: NextStepsItem[];
  onAction: (item: NextStepsItem) => void;
  startingId: string | null;
  onViewPreviousDays: (seriesId: string) => void;
}) {
  if (items.length === 0) return <EmptyState message="No Daily Devotionals are available yet." />;
  return (
    <div className="space-y-4 pt-6">
      {items.map(item => (
        <DevotionalCard
          key={item.id}
          item={item}
          onAction={() => onAction(item)}
          starting={startingId === item.id}
          onViewPreviousDays={
            item.memberProgressState !== 'not-started'
              ? () => onViewPreviousDays(item.id)
              : undefined
          }
        />
      ))}
    </div>
  );
}

function JourneysPanel({
  collections, standalone, onAction, onPause, onDetails, isGated, onGate, getEnrollmentState,
  getProgressDay, onViewPreviousSteps,
}: {
  collections: JourneyCollectionGroup[];
  standalone: NextStepsItem[];
  onAction: (item: NextStepsItem) => void;
  onPause: (id: string) => void;
  onDetails: (id: string) => void;
  isGated: (item: NextStepsItem) => boolean;
  onGate: () => void;
  getEnrollmentState: (id: string) => string | null;
  getProgressDay: (id: string) => number;
  onViewPreviousSteps: (id: string) => void;
}) {
  const hasContent = collections.length > 0 || standalone.length > 0;
  if (!hasContent) return <EmptyState message="No Journeys are available yet." />;

  function viewPreviousStepsFor(item: NextStepsItem) {
    // Only show for journey-table items with /journey/ routes (not sermon-companions)
    if (!item.route.startsWith('/journey/')) return undefined;
    return getProgressDay(item.id) > 1 ? () => onViewPreviousSteps(item.id) : undefined;
  }

  return (
    <div className="space-y-8 pt-6">
      {collections.map(col => (
        <section key={col.id}>
          <CollectionHeading title={col.title} description={col.description} />
          <div className="space-y-3">
            {col.journeys.map(item => (
              <DiscoveryCard
                key={item.id}
                item={item}
                onAction={() => onAction(item)}
                onPause={() => onPause(item.id)}
                onDetails={() => onDetails(item.id)}
                isGated={isGated(item)}
                onGate={onGate}
                enrollmentState={getEnrollmentState(item.id)}
                onViewPreviousSteps={viewPreviousStepsFor(item)}
              />
            ))}
          </div>
        </section>
      ))}

      {standalone.length > 0 && (
        <section>
          <div className="mb-3">
            <SectionLabel>Standalone</SectionLabel>
          </div>
          <div className="space-y-3">
            {standalone.map(item => (
              <DiscoveryCard
                key={item.id}
                item={item}
                onAction={() => onAction(item)}
                onPause={() => onPause(item.id)}
                onDetails={() => onDetails(item.id)}
                isGated={isGated(item)}
                onGate={onGate}
                enrollmentState={getEnrollmentState(item.id)}
                onViewPreviousSteps={viewPreviousStepsFor(item)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SermonCompanionsPanel({
  current, previous, onAction, onViewPreviousDays,
}: {
  current: NextStepsItem | null;
  previous: NextStepsItem[];
  onAction: (item: NextStepsItem) => void;
  onViewPreviousDays: (id: string) => void;
}) {
  if (!current && previous.length === 0) {
    return <EmptyState message="No Sermon Companions are available yet." />;
  }

  function previousDaysAction(item: NextStepsItem) {
    if (!item.route.startsWith('/sermon-companion/')) return undefined;
    if (item.memberProgressState === 'not-started') return undefined;
    return { label: 'View Previous Reflections →', onPress: () => onViewPreviousDays(item.id) };
  }

  return (
    <div className="space-y-8 pt-6">
      {current && (
        <section className="space-y-3">
          <SectionLabel icon={<Mic2 size={13} />}>This Week's Sermon</SectionLabel>
          <EmmausContentCard
            label="SERMON COMPANION"
            title={current.title}
            description={current.description}
            metadata={current.metadata.durationDays ? `${current.metadata.durationDays} Days` : '5 Days'}
            primaryActionLabel={current.primaryActionLabel}
            onAction={() => onAction(current)}
            secondaryAction={previousDaysAction(current)}
          />
        </section>
      )}

      {previous.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Previous Sermon Companions</SectionLabel>
          <div className="space-y-3">
            {previous.map(item => (
              <EmmausContentCard
                key={item.id}
                label="SERMON COMPANION"
                title={item.title}
                description={item.description}
                metadata={item.metadata.durationDays ? `${item.metadata.durationDays} Days` : '5 Days'}
                primaryActionLabel={item.primaryActionLabel}
                onAction={() => onAction(item)}
                secondaryAction={previousDaysAction(item)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string }[] = [
  { id: 'devotionals', label: 'Daily Devotionals' },
  { id: 'journeys',    label: 'Journeys'           },
  { id: 'sermons',     label: 'Sermon Companions'  },
];

function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="flex border-b border-border -mx-5 px-5 mt-6 overflow-x-auto scrollbar-none" role="tablist">
      {TABS.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={`flex-shrink-0 pb-2.5 pt-1 px-1 mr-6 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap -mb-px ${
              isActive
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Journeys() {
  const { journeys, progress, startJourney } = useJourney();
  const { user } = useAuth();
  const { startSharedJourney } = useRooms();
  const [, setLocation] = useLocation();
  const { getState, pauseJourney, canActivateMore } = useEnrollment();

  // ── Tab state ─────────────────────────────────────────────────────────────

  const [activeTab, setActiveTab] = useState<TabId>(sessionTab);

  const handleTabChange = (id: TabId) => {
    setActiveTab(id);
    saveTab(id);
  };

  // ── API data ─────────────────────────────────────────────────────────────

  const [data, setData] = useState<NextStepsData | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setApiLoading(true);
    setApiError(null);
    try {
      const result = await fetchNextSteps({ userId: user?.id });
      setData(result);
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setApiLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { reload(); }, [reload]);

  // ── Journey dialog state ──────────────────────────────────────────────────

  const [pendingItem,     setPendingItem]     = useState<NextStepsItem | null>(null);
  const [pauseTargetId,   setPauseTargetId]   = useState<string | null>(null);
  const [showLimitDialog, setShowLimitDialog] = useState(false);

  // ── Devotional state ──────────────────────────────────────────────────────

  const [startingDevId, setStartingDevId] = useState<string | null>(null);
  const [switchTarget,  setSwitchTarget]  = useState<NextStepsItem | null>(null);

  // ── Sermon companion action handler ──────────────────────────────────────
  // Sermon companions from the sermon_companion table (AI-generated pipeline) use
  // /sermon-companion/ routes and a separate progress system. They bypass the
  // journey enrollment limit and start automatically on the reading page.
  // Companions that are journeys-table-based (slug IDs, /journey/ routes) fall
  // through to handleJourneyAction which uses the standard journey flow.

  function handleSermonCompanionAction(item: NextStepsItem) {
    if (item.route.startsWith('/sermon-companion/')) {
      // Append source so the reader knows to return to Next Steps (Sermon Companions tab)
      setLocation(item.route + '?source=nextStepsSermons');
      return;
    }
    handleJourneyAction(item);
  }

  // ── Journey action handler ────────────────────────────────────────────────

  function handleJourneyAction(item: NextStepsItem) {
    if (item.memberProgressState !== 'not-started') {
      setLocation(item.route + '?source=nextStepsJourneys');
      return;
    }
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
    setLocation(`/journey/${pendingItem.id}/day/1?source=nextStepsJourneys`);
    setPendingItem(null);
    reload();
  }

  function handleStartWithRoom(roomId: string) {
    if (!pendingItem || !user) return;
    startJourney(pendingItem.id);
    startSharedJourney(roomId, pendingItem.id, user.id);
    setLocation(`/journey/${pendingItem.id}/day/1?source=nextStepsJourneys`);
    setPendingItem(null);
    reload();
  }

  // ── Devotional action handler ─────────────────────────────────────────────

  function handleDevotionalAction(item: NextStepsItem) {
    if (item.memberProgressState !== 'not-started') {
      setLocation(item.route + '?source=nextStepsDevotionals');
      return;
    }
    const activeDevotional = data?.dailyDevotionals.find(d => d.memberProgressState === 'in-progress');
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
      setLocation(`/devotional/${item.id}/day/1?source=nextStepsDevotionals`);
    } catch { /* non-fatal */ }
    finally {
      setStartingDevId(null);
      setSwitchTarget(null);
    }
  }

  // ── Pacing: all content (except Daily Rhythm) is self-paced ──────────────
  // The daily gate (requiring 10 Minutes with Jesus before other journeys)
  // has been removed per the permanent self-paced progression rule.
  // Daily Rhythm remains calendar-paced in its own card; Growth Journeys,
  // Devotionals, and Sermon Companions are never gated here.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function isItemGated(_item: NextStepsItem): boolean {
    return false;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-5 pt-10 max-w-[480px] mx-auto">

        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-[28px] font-sans font-medium tracking-tight text-foreground">
            Next Steps
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Choose something that will help you take your next step with Jesus.
          </p>
        </header>

        {/* Tab bar */}
        <TabBar active={activeTab} onChange={handleTabChange} />

        {/* Loading */}
        {apiLoading && (
          <div className="space-y-4 pt-6">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* Error */}
        {!apiLoading && apiError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-5 space-y-3 mt-6">
            <p className="text-[14px] text-destructive">{apiError}</p>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        {/* Tab content */}
        {!apiLoading && data && (
          <>
            {activeTab === 'devotionals' && (
              <DevotionalsPanel
                items={data.dailyDevotionals}
                onAction={handleDevotionalAction}
                startingId={startingDevId}
                onViewPreviousDays={(id) => setLocation(`/devotional/${id}/previous?from=nextStepsDevotionals`)}
              />
            )}

            {activeTab === 'journeys' && (
              <JourneysPanel
                collections={data.journeyCollections}
                standalone={data.standaloneJourneys}
                onAction={handleJourneyAction}
                onPause={(id) => setPauseTargetId(id)}
                onDetails={(id) => setLocation(`/journeys/${id}?source=nextStepsJourneys`)}
                isGated={isItemGated}
                onGate={() => setLocation('/walk')}
                getEnrollmentState={(id) => getState(id)}
                getProgressDay={(id) => progress[id]?.currentDay ?? 1}
                onViewPreviousSteps={(id) => setLocation(`/journey/${id}/previous?from=nextStepsJourneys`)}
              />
            )}

            {activeTab === 'sermons' && (
              <SermonCompanionsPanel
                current={data.currentSermonCompanion}
                previous={data.previousSermonCompanions}
                onAction={handleSermonCompanionAction}
                onViewPreviousDays={(id) => setLocation(`/sermon-companion/${id}/previous?from=nextStepsSermons`)}
              />
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
          title={journeys.find((j: Journey) => j.id === pauseTargetId)?.title ?? 'this journey'}
          onPause={() => { pauseJourney(pauseTargetId); setPauseTargetId(null); }}
          onCancel={() => setPauseTargetId(null)}
        />
      )}

      {/* Journey limit dialog */}
      {showLimitDialog && <JourneyLimitDialog onCancel={() => setShowLimitDialog(false)} />}

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
