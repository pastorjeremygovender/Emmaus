/**
 * Discover — member content exploration library.
 *
 * Tabs (exact order):
 *   1. Walks          — standalone walks; each card opens that Walk directly
 *   2. Journeys       — discipleship pathways (collections)
 *   3. Daily Devotionals
 *   4. Sermon Companions
 *
 * Hierarchy: Journey → Walk → Steps
 *
 * All grouping and eligibility is determined server-side via GET /api/next-steps.
 * This component renders only — no publication rules here.
 *
 * Route: /journeys
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { useDailyGate } from '@/lib/daily-gate';
import JourneyStartSheet from '@/components/JourneyStartSheet';
import { useRooms } from '@/contexts/RoomsContext';
import { apiStartShared } from '@/lib/rooms-api';
import {
  X, Pause, MoreHorizontal, ChevronRight,
  BookHeart, Mic2, Map as MapIcon,
} from 'lucide-react';
import { UnifiedEmmausInput } from '@/components/UnifiedEmmausInput';
import { motion, AnimatePresence } from 'framer-motion';
import type { Journey } from '@/contexts/JourneyContext';
import {
  fetchNextSteps,
  startSeries,
  resumeEngagement,
  type NextStepsData,
  type NextStepsItem,
  type ContentType,
  type JourneyCollectionGroup,
} from '@/lib/next-steps-api';
import { dismissBadge } from '@/lib/badge-api';

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = 'walks' | 'journeys' | 'devotionals' | 'sermons';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  journey:             'Walk',
  'bible-study':       'Bible Study',
  'sermon-devotional': 'Sermon Companion',
  'daily-devotional':  'Daily Devotional',
};

function dayLabel(n?: number): string | null {
  if (!n) return null;
  return `${n} ${n === 1 ? 'Day' : 'Days'}`;
}

// ─── Tab persistence ──────────────────────────────────────────────────────────

const TAB_KEY = 'emmaus_discover_tab';
function sessionTab(): TabId { try { return (sessionStorage.getItem(TAB_KEY) as TabId) ?? 'walks'; } catch { return 'walks'; } }
function saveTab(id: TabId) { try { sessionStorage.setItem(TAB_KEY, id); } catch { /* ignore */ } }

// ─── Tab bar ──────────────────────────────────────────────────────────────────

const TABS: { id: TabId; icon: React.ElementType; label: string }[] = [
  { id: 'walks',       icon: MapIcon,    label: 'Walks'       },
  { id: 'journeys',    icon: BookHeart,  label: 'Journeys'    },
  { id: 'devotionals', icon: BookHeart,  label: 'Devotionals' },
  { id: 'sermons',     icon: Mic2,       label: 'Sermons'     },
];

function TabBar({ active, onChange }: { active: TabId; onChange: (id: TabId) => void }) {
  return (
    <div className="flex border-b border-border -mx-5 px-2 overflow-x-auto scrollbar-none">
      {TABS.map(tab => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={cn(
              'flex items-center gap-1.5 px-3.5 py-3 text-[13px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            <Icon size={13} />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Compact card (matches Today's Steps style) ───────────────────────────────

function DiscoverCompactCard({
  title, subtitle, ctaLabel, onAction,
  badge, state, isGated, onGate, secondaryLabel, onSecondary,
}: {
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onAction?: () => void;
  badge?: string | null;
  state?: NextStepsItem['memberProgressState'];
  isGated?: boolean;
  onGate?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  return (
    <div
      className="bg-card rounded-xl border border-border/50 px-3.5 py-2.5 cursor-pointer hover:border-primary/25 active:opacity-75 transition-colors select-none"
      onClick={isGated ? onGate : onAction}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-[14px] font-semibold text-foreground leading-snug truncate flex-1">
              {title}
            </span>
            {badge && (
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-primary/10 text-primary leading-none">
                {badge}
              </span>
            )}
            {state === 'completed' && (
              <span className="shrink-0 text-[11px] font-medium text-primary">✓</span>
            )}
            {state === 'paused' && (
              <span className="shrink-0 text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500 leading-none">
                Paused
              </span>
            )}
          </div>
          {(subtitle || isGated) && (
            <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1">
              {isGated ? "Complete Today's Steps first" : subtitle}
            </p>
          )}
        </div>
        {isGated ? (
          <span className="shrink-0 text-[12px] text-muted-foreground/50 whitespace-nowrap leading-none">Locked</span>
        ) : (onAction && !ctaLabel) ? (
          <ChevronRight size={15} className="shrink-0 text-muted-foreground/40" aria-hidden="true" />
        ) : ctaLabel ? (
          <ChevronRight size={15} className="shrink-0 text-muted-foreground/40" aria-hidden="true" />
        ) : null}
      </div>
      {!isGated && secondaryLabel && onSecondary && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSecondary(); }}
          className="mt-1.5 text-[11px] text-primary/60 hover:text-primary transition-colors block"
        >
          {secondaryLabel}
        </button>
      )}
    </div>
  );
}

// ─── Shared UI atoms ─────────────────────────────────────────────────────────


function SkeletonCard() {
  return (
    <div className="bg-card rounded-xl border border-border/60 px-3.5 py-3 animate-pulse flex items-center gap-2">
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-2/3 rounded bg-muted" />
        <div className="h-2.5 w-1/2 rounded bg-muted" />
      </div>
      <div className="h-3 w-14 rounded bg-muted shrink-0" />
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


// ─── Cards ────────────────────────────────────────────────────────────────────

function DiscoveryCard({
  item, onAction, onPause, onDetails: _onDetails, isGated, onGate, enrollmentState: _es,
  onViewPreviousSteps, currentDay,
}: {
  item: NextStepsItem;
  onAction: () => void;
  onPause?: () => void;
  onDetails?: () => void;
  isGated?: boolean;
  onGate?: () => void;
  enrollmentState?: string | null;
  onViewPreviousSteps?: () => void;
  currentDay?: number;
}) {
  const total = item.metadata.durationDays ?? 0;
  const state = item.memberProgressState;
  const day   = currentDay ?? 1;

  let subtitle: string | undefined;
  if (state === 'in-progress' || state === 'paused') {
    subtitle = total > 0 ? `Day ${day} of ${total}` : (item.description ?? undefined);
  } else if (state === 'not-started') {
    const parts = [dayLabel(total), item.metadata.difficulty].filter(Boolean);
    subtitle = parts.length ? parts.join(' · ') : (item.description ?? undefined);
  } else {
    subtitle = [dayLabel(total)].filter(Boolean).join(' · ') || (item.description ?? undefined);
  }

  const secondaryLabel = state === 'in-progress' && onPause
    ? 'Pause Walk'
    : onViewPreviousSteps ? 'View Walk Contents' : undefined;
  const onSecondary = state === 'in-progress' && onPause ? onPause : onViewPreviousSteps;

  return (
    <DiscoverCompactCard
      title={item.title}
      subtitle={subtitle}
      ctaLabel={item.primaryActionLabel ?? undefined}
      onAction={onAction}
      badge={item.badge ?? null}
      state={state}
      isGated={isGated}
      onGate={onGate}
      secondaryLabel={secondaryLabel}
      onSecondary={onSecondary}
    />
  );
}

function DevotionalCard({
  item, onAction, starting: _starting, onViewPreviousDays, currentDay, isGated, onGate,
}: {
  item: NextStepsItem;
  onAction: () => void;
  starting: boolean;
  onViewPreviousDays?: () => void;
  currentDay?: number;
  isGated?: boolean;
  onGate?: () => void;
}) {
  const total = item.metadata.durationDays ?? 0;
  const state = item.memberProgressState;
  const day   = currentDay ?? 1;

  let subtitle: string | undefined;
  if (state === 'in-progress' || state === 'paused') {
    subtitle = total > 0 ? `Day ${day} of ${total}` : (item.description ?? undefined);
  } else {
    subtitle = dayLabel(total) ?? (item.description ?? undefined);
  }

  return (
    <DiscoverCompactCard
      title={item.title}
      subtitle={subtitle}
      ctaLabel={isGated ? undefined : (item.primaryActionLabel ?? undefined)}
      onAction={onAction}
      badge={item.badge ?? null}
      state={state}
      isGated={isGated}
      onGate={onGate}
      secondaryLabel={onViewPreviousDays ? 'View Devotional Contents' : undefined}
      onSecondary={onViewPreviousDays}
    />
  );
}

// SermonCard removed — Journeys.tsx now uses the shared SermonCompanionCard component.

// ─── Tab content panels ───────────────────────────────────────────────────────

function DevotionalsPanel({
  items, onAction, startingId, onViewPreviousDays, isGated, onGate, getProgressDay,
}: {
  items: NextStepsItem[];
  onAction: (item: NextStepsItem) => void;
  startingId: string | null;
  onViewPreviousDays: (seriesId: string) => void;
  isGated: boolean;
  onGate: () => void;
  getProgressDay: (id: string) => number;
}) {
  if (items.length === 0) return <EmptyState message="No Daily Devotionals are available yet." />;
  return (
    <div className="space-y-3">
      {items.map(item => (
        <DevotionalCard
          key={item.id}
          item={item}
          onAction={() => onAction(item)}
          starting={startingId === item.id}
          currentDay={item.metadata.currentDay ?? getProgressDay(item.id)}
          isGated={isGated}
          onGate={onGate}
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

// Shared card-list helper used by both JourneysPanel and WalksPanel.
function journeyItemCards(
  items: NextStepsItem[],
  { onAction, onPause, onDetails, isGated, onGate, getEnrollmentState, getProgressDay, onViewPreviousSteps }:
  {
    onAction: (item: NextStepsItem) => void;
    onPause: (id: string) => void;
    onDetails: (id: string) => void;
    isGated: (item: NextStepsItem) => boolean;
    onGate: () => void;
    getEnrollmentState: (id: string) => string | null;
    getProgressDay: (id: string) => number;
    onViewPreviousSteps: (id: string) => void;
  }
) {
  function viewPreviousStepsFor(item: NextStepsItem) {
    if (!item.route.startsWith('/journey/')) return undefined;
    return getProgressDay(item.id) > 1 ? () => onViewPreviousSteps(item.id) : undefined;
  }
  return items.map(item => (
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
      currentDay={getProgressDay(item.id)}
    />
  ));
}

// Journeys tab — one card per Journey (collection).
// Tapping a Journey opens the Collection page (Journey Details), which lists
// every Walk. Only tapping a Walk inside that page opens the Walk itself.
function JourneysPanel({
  collections, onOpenJourney, isGated, onGate,
}: {
  collections: JourneyCollectionGroup[];
  onOpenJourney: (col: JourneyCollectionGroup) => void;
  isGated: boolean;
  onGate: () => void;
}) {
  if (collections.length === 0) return <EmptyState message="No Journeys available yet." />;

  return (
    <div className="space-y-3">
      {collections.map(col => {
        const walkCount  = col.journeys.length;
        const completed  = col.journeys.filter(j => j.memberProgressState === 'completed').length;
        const hasInProgress = col.journeys.some(j => j.memberProgressState === 'in-progress');
        const hasProgress   = completed > 0 || hasInProgress;
        const actionLabel   = hasInProgress ? 'Continue' : 'Open';

        const subtitle = !hasProgress
          ? `${walkCount} ${walkCount === 1 ? 'Walk' : 'Walks'}`
          : completed === walkCount
            ? `${walkCount} ${walkCount === 1 ? 'Walk' : 'Walks'} · Completed`
            : `${completed} of ${walkCount} ${walkCount === 1 ? 'walk' : 'walks'} completed`;

        return (
          <DiscoverCompactCard
            key={col.id}
            title={col.title}
            subtitle={subtitle}
            ctaLabel={isGated ? undefined : actionLabel}
            onAction={() => onOpenJourney(col)}
            state={hasInProgress ? 'in-progress' : completed === walkCount && walkCount > 0 ? 'completed' : 'not-started'}
            isGated={isGated}
            onGate={onGate}
          />
        );
      })}
    </div>
  );
}

// Walks tab — shows standalone walks that are not assigned to any Journey.
function WalksPanel({
  standalone, onAction, onPause, onDetails, isGated, onGate, getEnrollmentState,
  getProgressDay, onViewPreviousSteps,
}: {
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
  if (standalone.length === 0) return <EmptyState message="No Walks available yet." />;
  const cardProps = { onAction, onPause, onDetails, isGated, onGate, getEnrollmentState, getProgressDay, onViewPreviousSteps };
  return (
    <div className="space-y-3">
      {journeyItemCards(standalone, cardProps)}
    </div>
  );
}

function SermonCompanionsPanel({
  current, previous, onAction: _onAction, isGated, onGate, getProgressDay,
}: {
  current: NextStepsItem | null;
  previous: NextStepsItem[];
  onAction: (item: NextStepsItem) => void;
  isGated: boolean;
  onGate: () => void;
  getProgressDay: (id: string) => number;
}) {
  const [, setLocation] = useLocation();

  if (!current && previous.length === 0) {
    return <EmptyState message="No Sermon Companions are available yet." />;
  }

  // Discovery card action label — computed from progress state since the API
  // returns a generic label; we want sermon-specific language here.
  function discoveryActionLabel(state: string, apiLabel: string | null | undefined): string {
    if (state === 'completed') return 'Review Companion';
    if (state === 'in-progress' || state === 'paused') return 'Continue Companion';
    if (state === 'not-started') return 'Start Companion';
    return apiLabel ?? 'Open';
  }

  // Both card tap AND button always navigate to the Overview screen.
  // The overview handles start / continue / review based on progress.
  function overviewRoute(item: NextStepsItem): string {
    return `/sermon-companion/${item.id}/overview?source=nextStepsSermons`;
  }

  function companionCard(item: NextStepsItem, isCurrent: boolean) {
    const state       = item.memberProgressState;
    const actionLabel = discoveryActionLabel(state, item.primaryActionLabel);
    const destination = overviewRoute(item);
    const currentDay  = getProgressDay(item.id);
    const total       = item.metadata.durationDays ?? 0;

    let subtitle: string | undefined;
    if (isCurrent) subtitle = item.metadata.subtitle ?? item.description ?? undefined;
    else if (state === 'in-progress' || state === 'paused') {
      subtitle = total > 0 ? `Day ${currentDay} of ${total}` : (item.metadata.subtitle ?? item.description ?? undefined);
    } else {
      subtitle = total > 0 ? `${total} Steps` : (item.metadata.subtitle ?? item.description ?? undefined);
    }

    return (
      <DiscoverCompactCard
        key={item.id}
        title={item.title}
        subtitle={subtitle}
        ctaLabel={isGated ? undefined : actionLabel}
        onAction={() => setLocation(destination)}
        state={state}
        isGated={isGated}
        onGate={onGate}
      />
    );
  }

  return (
    <div className="space-y-4">
      {current && companionCard(current, true)}
      {previous.map(item => (
        <div key={item.id}>{companionCard(item, false)}</div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Journeys() {
  const { journeys, progress, startJourney } = useJourney();
  const { user } = useAuth();
  const { getMyRooms, loadRooms } = useRooms();
  const [, setLocation] = useLocation();
  const { getState, pauseJourney, canActivateMore } = useEnrollment();

  // ── Unified search/question active state ─────────────────────────────────
  const [discoverActive, setDiscoverActive] = useState(false);

  // ── Tab navigation ────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabId>(sessionTab);
  function handleTabChange(id: TabId) { setActiveTab(id); saveTab(id); }

  // ── API data ─────────────────────────────────────────────────────────────

  const [data, setData] = useState<NextStepsData | null>(null);
  const [apiLoading, setApiLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setApiLoading(true);
    setApiError(null);
    try {
      const result = await fetchNextSteps();
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

  async function handleSermonCompanionAction(item: NextStepsItem) {
    void dismissBadge('companion', item.id);
    if (item.route.startsWith('/sermon-companion/')) {
      if (item.memberProgressState === 'paused') {
        try { await resumeEngagement('sermon-companion', item.id); } catch { /* non-fatal */ }
        await reload();
        return;
      }
      // Append source so the reader knows to return to Next Steps (Sermon Companions tab)
      setLocation(item.route + '?source=nextStepsSermons');
      return;
    }
    handleJourneyAction(item);
  }

  // ── Journey action handler ────────────────────────────────────────────────

  function handleJourneyAction(item: NextStepsItem) {
    void dismissBadge('journey', item.id);
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

  async function handleStartAlone() {
    if (!pendingItem) return;
    const item = pendingItem;
    // Use the backend-computed route rather than hard-coding /day/1.
    // For not-started walks item.route points to day/0 (Walk Introduction) when
    // one exists, otherwise day/1. For in-progress walks it points to the next
    // incomplete step. This satisfies the spec requirement to never hard-code day 1.
    const destination = item.route.includes('?')
      ? `${item.route}&source=nextStepsJourneys`
      : `${item.route}?source=nextStepsJourneys`;
    // Throws on failure — the modal catches this and shows an inline error message.
    await startJourney(item.id);
    setPendingItem(null);
    setLocation(destination);
    reload();
  }

  async function handleStartWithRoom(roomId: string) {
    if (!pendingItem || !user) return;
    const item = pendingItem;
    const destination = item.route.includes('?')
      ? `${item.route}&source=nextStepsJourneys`
      : `${item.route}?source=nextStepsJourneys`;
    // Single atomic call — throws on failure; the sheet surfaces the error inline.
    await apiStartShared(user.id, { journeyId: item.id, roomId });
    await startJourney(item.id); // sync local progress cache (no-op at DB)
    setPendingItem(null);
    setLocation(destination);
    reload();
  }

  async function handleCreateAndStart(roomName: string) {
    if (!pendingItem || !user) return;
    const item = pendingItem;
    const destination = item.route.includes('?')
      ? `${item.route}&source=nextStepsJourneys`
      : `${item.route}?source=nextStepsJourneys`;
    const { roomId } = await apiStartShared(user.id, { journeyId: item.id, roomName });
    await Promise.all([startJourney(item.id), loadRooms()]);
    setPendingItem(null);
    setLocation(destination);
    reload();
  }

  // ── Devotional action handler ─────────────────────────────────────────────

  async function handleDevotionalAction(item: NextStepsItem) {
    void dismissBadge('devotional', item.id);
    if (item.memberProgressState === 'paused') {
      try { await resumeEngagement('devotional', item.id); } catch { /* non-fatal */ }
      await reload();
      return;
    }
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

  // ── Daily gate — all non-Daily-Rhythm content requires 10 Minutes with Jesus ─
  const { gateClear } = useDailyGate();

  // Gate applies to every item in the Discover library. The daily rhythm itself
  // is never shown here, so a simple !gateClear covers all cases.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function isItemGated(_item: NextStepsItem): boolean {
    return !gateClear;
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="px-5 pt-10 max-w-[480px] mx-auto">

        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-[28px] font-sans font-medium tracking-tight text-foreground">
            Discover
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            What would you like to explore?
          </p>
        </header>

        {/* Unified Ask Emmaus / Search input */}
        <UnifiedEmmausInput launchOnly className="mt-4" />

        {/* Tab bar — hidden while search is active */}
        {!discoverActive && <TabBar active={activeTab} onChange={handleTabChange} />}

        {/* Loading skeletons */}
        {!discoverActive && apiLoading && (
          <div className="space-y-2 pt-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        )}

        {/* Error */}
        {!discoverActive && !apiLoading && apiError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-5 space-y-3 mt-4">
            <p className="text-[14px] text-destructive">{apiError}</p>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        {/* Tab content */}
        {!discoverActive && !apiLoading && data && (
          <div className="pt-4 pb-6 space-y-2">
            {activeTab === 'walks' && (
              <WalksPanel
                standalone={data.standaloneJourneys}
                onAction={handleJourneyAction}
                onPause={(id) => setPauseTargetId(id)}
                onDetails={(id) => setLocation(`/journeys/${id}?source=nextStepsWalks`)}
                isGated={isItemGated}
                onGate={() => setLocation('/walk')}
                getEnrollmentState={(id) => getState(id)}
                getProgressDay={(id) => progress[id]?.currentDay ?? 1}
                onViewPreviousSteps={(id) => setLocation(`/journey/${id}/previous?from=nextStepsWalks`)}
              />
            )}
            {activeTab === 'journeys' && (
              <JourneysPanel
                collections={data.journeyCollections}
                onOpenJourney={(col) => setLocation(`/journeys/collections/${col.id}?source=nextStepsJourneys`)}
                isGated={!gateClear}
                onGate={() => setLocation('/walk')}
              />
            )}
            {activeTab === 'devotionals' && (
              <DevotionalsPanel
                items={data.dailyDevotionals}
                onAction={handleDevotionalAction}
                startingId={startingDevId}
                onViewPreviousDays={(id) => setLocation(`/devotional/${id}/previous?from=nextStepsDevotionals`)}
                isGated={!gateClear}
                onGate={() => setLocation('/walk')}
                getProgressDay={(id) => progress[id]?.currentDay ?? 1}
              />
            )}
            {activeTab === 'sermons' && (
              <SermonCompanionsPanel
                current={data.currentSermonCompanion}
                previous={data.previousSermonCompanions}
                onAction={handleSermonCompanionAction}
                isGated={!gateClear}
                onGate={() => setLocation('/walk')}
                getProgressDay={(id) => progress[id]?.currentDay ?? 1}
              />
            )}
          </div>
        )}

      </main>

      <BottomNav />

      {/* Journey start sheet */}
      {pendingItem && (
        <JourneyStartSheet
          journeyTitle={pendingItem.title}
          userRooms={user ? getMyRooms(user.id) : []}
          onStartAlone={handleStartAlone}
          onStartInRoom={handleStartWithRoom}
          onCreateAndStart={handleCreateAndStart}
          onClose={() => setPendingItem(null)}
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
