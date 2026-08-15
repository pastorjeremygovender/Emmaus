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
import { EmmausContentCard } from '@/components/EmmausContentCard';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { useEnrollment, isExemptJourney } from '@/lib/enrollment';
import { useDailyGate } from '@/lib/daily-gate';
import JourneyStartSheet from '@/components/JourneyStartSheet';
import { useRooms } from '@/contexts/RoomsContext';
import { apiStartShared } from '@/lib/rooms-api';
import {
  X, Pause, MoreHorizontal, Loader2,
  BookHeart, Mic2, Map as MapIcon, Users, ChevronRight,
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

// ─── Section wrapper (matches Today's Steps SectionWrapper style) ─────────────

const DISCOVER_COLORS = {
  emerald: { bg: 'bg-emerald-50/90 border-emerald-200/60', title: 'text-emerald-700', dot: 'bg-emerald-500' },
  amber:   { bg: 'bg-amber-50/90 border-amber-200/60',     title: 'text-amber-700',   dot: 'bg-amber-500'   },
  violet:  { bg: 'bg-violet-50/90 border-violet-200/60',   title: 'text-violet-700',  dot: 'bg-violet-500'  },
} as const;
type DiscoverColor = keyof typeof DISCOVER_COLORS;

function DiscoverSection({
  color, label, children,
}: {
  color: DiscoverColor;
  label: string;
  children: React.ReactNode;
}) {
  const c = DISCOVER_COLORS[color];
  return (
    <motion.section
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className={`rounded-2xl border px-4 pt-3 pb-4 ${c.bg}`}
    >
      <div className="flex items-center gap-1.5 mb-3">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${c.dot}`} />
        <h2 className={`text-[10px] font-bold uppercase tracking-[0.14em] ${c.title}`}>{label}</h2>
      </div>
      {children}
    </motion.section>
  );
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
  if (state === 'paused') {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 bg-slate-100 text-slate-500 border border-slate-200">
        Paused
      </span>
    );
  }
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

/**
 * WalkProgress — replaces the old unlabelled thin bar.
 *
 * Rules (spec):
 *   not-started            → "Not started"
 *   in-progress, ≤10 days  → dot row  ●●○○○  +  "2 of 5 steps completed"
 *   in-progress, >10 days  → "7 of 30 steps completed"  +  labelled bar
 *   completed              → "✓ Completed"
 *
 * completedSteps is derived from currentDay - 1 (currentDay is the NEXT step
 * to do, so all steps before it are done). The Walk Introduction (day 0) and
 * Walk Complete (day 6) are excluded from durationDays so they are not counted.
 */
function WalkProgress({
  item, currentDay,
}: {
  item: NextStepsItem;
  currentDay: number;   // from progress[id]?.currentDay ?? 1
}) {
  const state = item.memberProgressState;
  const total = item.metadata.durationDays ?? 0;

  if (state === 'not-started' || total === 0) {
    return <span className="text-[11px] text-muted-foreground">Not started</span>;
  }

  if (state === 'completed') {
    return (
      <span className="text-[11px] font-medium text-primary flex items-center gap-1">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Completed
      </span>
    );
  }

  // in-progress
  const done = Math.max(0, Math.min(total, currentDay - 1));
  const pct  = total > 0 ? Math.round((done / total) * 100) : 0;

  if (total <= 10) {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-1" aria-label={`${done} of ${total} steps completed`}>
          {Array.from({ length: total }, (_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-colors ${
                i < done ? 'bg-primary' : 'bg-primary/20'
              }`}
            />
          ))}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {done === 0
            ? 'Not started'
            : `${done} of ${total} step${total !== 1 ? 's' : ''} completed`}
        </span>
      </div>
    );
  }

  // long walk — bar + text
  return (
    <div className="space-y-1.5">
      <span className="text-[11px] text-muted-foreground">
        {done === 0
          ? 'Not started'
          : `${done} of ${total} steps completed`}
      </span>
      <div className="h-1 rounded-full bg-primary/20 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function DiscoveryCard({
  item, onAction, onPause, onDetails, isGated, onGate, enrollmentState, onViewPreviousSteps,
  currentDay,
}: {
  item: NextStepsItem;
  onAction: () => void;
  onPause?: () => void;
  onDetails?: () => void;
  isGated?: boolean;
  onGate?: () => void;
  enrollmentState?: string | null;
  onViewPreviousSteps?: () => void;
  /** progress[item.id]?.currentDay ?? 1 — used to compute real step count */
  currentDay?: number;
}) {
  const dur = dayLabel(item.metadata.durationDays);
  const metaParts = [dur, item.metadata.difficulty].filter(Boolean);
  const actionLabel = item.primaryActionLabel ?? undefined;
  const label = (CONTENT_TYPE_LABELS[item.contentType] ?? item.contentType).toUpperCase();

  return (
    <EmmausContentCard
      label={label}
      title={item.title}
      description={item.description}
      metadata={metaParts.join(' · ') || undefined}
      primaryActionLabel={actionLabel}
      onAction={onAction}
      badge={item.badge ?? null}
      headerTrailing={
        item.memberProgressState === 'in-progress' && onPause && onDetails
          ? <MoreMenu onPause={onPause} onDetails={onDetails} />
          : undefined
      }
      progressNode={
        item.metadata.durationDays
          ? <WalkProgress item={item} currentDay={currentDay ?? 1} />
          : undefined
      }
      gatedMessage={
        isGated
          ? "Complete 10 minutes with Jesus to proceed"
          : undefined
      }
      onGate={onGate}
      secondaryAction={
        onViewPreviousSteps
          ? { label: 'View Walk Contents →', onPress: onViewPreviousSteps }
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
  currentDay,
  isGated,
  onGate,
}: {
  item: NextStepsItem;
  onAction: () => void;
  starting: boolean;
  onViewPreviousDays?: () => void;
  currentDay?: number;
  isGated?: boolean;
  onGate?: () => void;
}) {
  const isPaused = item.memberProgressState === 'paused';
  const dur = item.metadata.durationDays;

  return (
    <EmmausContentCard
      label="DAILY DEVOTIONAL"
      title={item.title}
      description={item.description}
      primaryActionLabel={isGated ? undefined : (item.primaryActionLabel ?? undefined)}
      onAction={onAction}
      loading={starting}
      badge={item.badge ?? null}
      headerTrailing={isPaused ? <StatePill state="paused" /> : undefined}
      progressNode={
        dur
          ? <WalkProgress item={item} currentDay={currentDay ?? 1} />
          : undefined
      }
      gatedMessage={isGated ? "Complete 10 minutes with Jesus to proceed" : undefined}
      onGate={onGate}
      secondaryAction={
        onViewPreviousDays
          ? { label: 'View Devotional Contents', onPress: onViewPreviousDays }
          : undefined
      }
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

        // Progress node — dots for ≤ 10 walks, bar for longer collections.
        const progressNode = hasProgress ? (
          <div className="space-y-1.5">
            {walkCount <= 10 ? (
              <div className="flex gap-1" aria-label={`${completed} of ${walkCount} walks completed`}>
                {col.journeys.map((j, i) => (
                  <div
                    key={i}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      j.memberProgressState === 'completed'
                        ? 'bg-primary'
                        : j.memberProgressState === 'in-progress'
                          ? 'bg-primary/40'
                          : 'bg-primary/20'
                    }`}
                  />
                ))}
              </div>
            ) : (
              <div className="h-1 rounded-full bg-primary/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.round((completed / walkCount) * 100)}%` }}
                />
              </div>
            )}
            <span className="text-[11px] text-muted-foreground">
              {completed === walkCount
                ? 'All walks completed'
                : `${completed} of ${walkCount} walk${walkCount !== 1 ? 's' : ''} completed`}
            </span>
          </div>
        ) : undefined;

        return (
          <EmmausContentCard
            key={col.id}
            label="JOURNEY"
            title={col.title}
            description={col.description}
            metadata={`${walkCount} ${walkCount === 1 ? 'Walk' : 'Walks'}`}
            primaryActionLabel={isGated ? undefined : actionLabel}
            onAction={() => onOpenJourney(col)}
            progressNode={progressNode}
            gatedMessage={isGated ? "Complete 10 minutes with Jesus to proceed" : undefined}
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
    const isPaused    = item.memberProgressState === 'paused';
    const displayDesc = item.metadata.subtitle ?? item.description;
    const actionLabel = discoveryActionLabel(item.memberProgressState, item.primaryActionLabel);
    const destination = overviewRoute(item);
    const currentDay  = getProgressDay(item.id);

    return (
      <EmmausContentCard
        label={isCurrent ? "THIS WEEK'S SERMON" : "SERMON COMPANION"}
        title={item.title}
        description={displayDesc}
        metadata={item.metadata.durationDays ? `${item.metadata.durationDays} Steps` : undefined}
        primaryActionLabel={isGated ? undefined : actionLabel}
        onAction={() => setLocation(destination)}
        headerTrailing={isPaused ? <StatePill state="paused" /> : undefined}
        progressNode={
          item.metadata.durationDays
            ? <WalkProgress item={item} currentDay={currentDay} />
            : undefined
        }
        gatedMessage={isGated ? "Complete 10 minutes with Jesus to proceed" : undefined}
        onGate={onGate}
        onCardPress={isGated ? undefined : () => setLocation(destination)}
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

// ─── Tab bar ──────────────────────────────────────────────────────────────────

// (TabBar replaced by stacked DiscoverSection layout)

// ─── Main component ───────────────────────────────────────────────────────────

export default function Journeys() {
  const { journeys, progress, startJourney } = useJourney();
  const { user } = useAuth();
  const { getMyRooms, loadRooms } = useRooms();
  const [, setLocation] = useLocation();
  const { getState, pauseJourney, canActivateMore } = useEnrollment();

  // ── Unified search/question active state ─────────────────────────────────
  const [discoverActive, setDiscoverActive] = useState(false);

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
        <UnifiedEmmausInput
          className="mt-5"
          onActiveChange={setDiscoverActive}
        />

        {/* My Groups — hidden while search is active */}
        {!discoverActive && (() => {
          const myRooms = user ? getMyRooms(user.id) : [];
          if (myRooms.length === 0) return null;
          return (
            <motion.button
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              onClick={() => setLocation('/rooms')}
              className="mt-5 w-full rounded-2xl border bg-blue-50/90 border-blue-200/60 px-4 py-3 flex items-center gap-3 hover:border-blue-300/70 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Users size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-blue-700">My Groups</p>
                <p className="text-[12px] text-blue-600/70 mt-0.5">
                  {myRooms.length} {myRooms.length === 1 ? 'Group' : 'Groups'}
                </p>
              </div>
              <ChevronRight size={15} className="text-blue-500/60 shrink-0" />
            </motion.button>
          );
        })()}

        {/* Loading skeletons */}
        {!discoverActive && apiLoading && (
          <div className="space-y-3 mt-5">
            <div className="rounded-2xl border bg-emerald-50/60 border-emerald-200/40 p-4 space-y-2 animate-pulse">
              <div className="h-2 w-10 rounded bg-emerald-200/60" />
              <SkeletonCard /><SkeletonCard />
            </div>
            <div className="rounded-2xl border bg-amber-50/60 border-amber-200/40 p-4 space-y-2 animate-pulse">
              <div className="h-2 w-14 rounded bg-amber-200/60" />
              <SkeletonCard />
            </div>
            <div className="rounded-2xl border bg-violet-50/60 border-violet-200/40 p-4 space-y-2 animate-pulse">
              <div className="h-2 w-20 rounded bg-violet-200/60" />
              <SkeletonCard />
            </div>
          </div>
        )}

        {/* Error */}
        {!discoverActive && !apiLoading && apiError && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-5 space-y-3 mt-5">
            <p className="text-[14px] text-destructive">{apiError}</p>
            <Button variant="outline" size="sm" className="rounded-xl" onClick={reload}>
              Try again
            </Button>
          </div>
        )}

        {/* Stacked sections — all content always visible */}
        {!discoverActive && !apiLoading && data && (
          <div className="space-y-3 mt-5 pb-4">

            {data.standaloneJourneys.length > 0 && (
              <DiscoverSection color="emerald" label="Walks">
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
              </DiscoverSection>
            )}

            {data.journeyCollections.length > 0 && (
              <DiscoverSection color="amber" label="Journeys">
                <JourneysPanel
                  collections={data.journeyCollections}
                  onOpenJourney={(col) => setLocation(`/journeys/collections/${col.id}?source=nextStepsJourneys`)}
                  isGated={!gateClear}
                  onGate={() => setLocation('/walk')}
                />
              </DiscoverSection>
            )}

            {data.dailyDevotionals.length > 0 && (
              <DiscoverSection color="violet" label="Daily Devotionals">
                <DevotionalsPanel
                  items={data.dailyDevotionals}
                  onAction={handleDevotionalAction}
                  startingId={startingDevId}
                  onViewPreviousDays={(id) => setLocation(`/devotional/${id}/previous?from=nextStepsDevotionals`)}
                  isGated={!gateClear}
                  onGate={() => setLocation('/walk')}
                  getProgressDay={(id) => progress[id]?.currentDay ?? 1}
                />
              </DiscoverSection>
            )}

            {(data.currentSermonCompanion || data.previousSermonCompanions.length > 0) && (
              <DiscoverSection color="amber" label="Sermon Companions">
                <SermonCompanionsPanel
                  current={data.currentSermonCompanion}
                  previous={data.previousSermonCompanions}
                  onAction={handleSermonCompanionAction}
                  isGated={!gateClear}
                  onGate={() => setLocation('/walk')}
                  getProgressDay={(id) => progress[id]?.currentDay ?? 1}
                />
              </DiscoverSection>
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
