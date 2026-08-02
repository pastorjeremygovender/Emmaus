/**
 * Next Steps — four-tab member content library.
 *
 * Tabs (exact order, spec-locked):
 *   1. Daily Devotionals
 *   2. Walks      — standalone walks; each card opens that Walk directly
 *   3. Journeys   — discipleship pathways (collections); each card opens the Journey detail page
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
// daily-gate import removed — all non-Daily-Rhythm content is now self-paced.
import JourneyStartSheet from '@/components/JourneyStartSheet';
import { useRooms } from '@/contexts/RoomsContext';
import { apiStartShared } from '@/lib/rooms-api';
import {
  X, Pause, MoreHorizontal, Loader2,
  BookHeart, Mic2, Map, Users, ChevronRight,
} from 'lucide-react';
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

type TabId = 'devotionals' | 'journeys' | 'walks' | 'sermons';

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

function sessionTab(): TabId {
  // Prefer ?tab= URL param — set when returning from content so the right tab opens.
  try {
    const urlTab = new URLSearchParams(window.location.search).get('tab');
    if (urlTab === 'devotionals' || urlTab === 'journeys' || urlTab === 'walks' || urlTab === 'sermons') return urlTab as TabId;
  } catch { /* ignore */ }
  // Fall back to last-used tab from sessionStorage.
  try {
    const saved = sessionStorage.getItem('next-steps-tab');
    if (saved === 'devotionals' || saved === 'journeys' || saved === 'walks' || saved === 'sermons') return saved as TabId;
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
        isGated && item.memberProgressState === 'in-progress'
          ? "Complete today's 10 Minutes with Jesus first"
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
}: {
  item: NextStepsItem;
  onAction: () => void;
  starting: boolean;
  onViewPreviousDays?: () => void;
}) {
  const isPaused = item.memberProgressState === 'paused';
  // description is already progress-aware ("Day N of M · Title", "N of N completed",
  // "Day 1 of M") — computed server-side to match Today's Steps exactly.
  // No separate metadata label is needed; the day count lives in description.
  return (
    <EmmausContentCard
      label="DAILY DEVOTIONAL"
      title={item.title}
      description={item.description}
      primaryActionLabel={item.primaryActionLabel ?? undefined}
      onAction={onAction}
      loading={starting}
      badge={item.badge ?? null}
      headerTrailing={isPaused ? <StatePill state="paused" /> : undefined}
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
  collections, onOpenJourney,
}: {
  collections: JourneyCollectionGroup[];
  onOpenJourney: (col: JourneyCollectionGroup) => void;
}) {
  if (collections.length === 0) return <EmptyState message="No Journeys available yet." />;

  return (
    <div className="space-y-3 pt-6">
      {collections.map(col => {
        const walkCount = col.journeys.length;
        const hasInProgress = col.journeys.some(j => j.memberProgressState === 'in-progress');
        // "Continue" when a Walk is in-progress, "Open" otherwise (not-started or all complete).
        const actionLabel = hasInProgress ? 'Continue' : 'Open';

        return (
          <EmmausContentCard
            key={col.id}
            label="JOURNEY"
            title={col.title}
            description={col.description}
            metadata={`${walkCount} ${walkCount === 1 ? 'Walk' : 'Walks'}`}
            primaryActionLabel={actionLabel}
            onAction={() => onOpenJourney(col)}
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
    <div className="space-y-3 pt-6">
      {journeyItemCards(standalone, cardProps)}
    </div>
  );
}

function SermonCompanionsPanel({
  current, previous, onAction,
}: {
  current: NextStepsItem | null;
  previous: NextStepsItem[];
  onAction: (item: NextStepsItem) => void;
}) {
  const [, setLocation] = useLocation();

  // Build a companionId → canonicalSermonId lookup from published canonical sermons.
  // Used to route the current-week card to SermonHome instead of the companion reader.
  const [canonicalMap, setCanonicalMap] = React.useState<Map<string, string>>(new Map());
  React.useEffect(() => {
    fetch('/api/sermons', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((sermons: Array<{ id: string; companionId?: string | null }>) => {
        const m = new Map<string, string>();
        for (const s of sermons) {
          if (s.companionId) m.set(s.companionId, s.id);
        }
        setCanonicalMap(m);
      })
      .catch(() => {/* non-fatal — fall back to companion reader */});
  }, []);

  if (!current && previous.length === 0) {
    return <EmptyState message="No Sermon Companions are available yet." />;
  }

  function companionCard(item: NextStepsItem, isCurrent: boolean) {
    const isPaused = item.memberProgressState === 'paused';
    const actionLabel = item.primaryActionLabel ?? undefined;

    // When a canonical sermon is linked to this companion, tap the whole card
    // to navigate to SermonHome. Pass the companion route as a query param so
    // SermonHome can offer a "Continue Companion" CTA.
    const canonicalSermonId = canonicalMap.get(item.id);
    const onCardPress = isCurrent && canonicalSermonId
      ? () => {
          const companionRoute = encodeURIComponent(item.route);
          setLocation(`/sermon/${canonicalSermonId}?companionRoute=${companionRoute}`);
        }
      : undefined;

    return (
      <EmmausContentCard
        label={isCurrent ? "THIS WEEK'S SERMON" : "SERMON COMPANION"}
        title={item.title}
        description={item.description}
        metadata={item.metadata.durationDays ? `${item.metadata.durationDays} Days` : undefined}
        primaryActionLabel={actionLabel}
        onAction={actionLabel ? () => { onAction(item); } : undefined}
        headerTrailing={isPaused ? <StatePill state="paused" /> : undefined}
        onCardPress={onCardPress}
      />
    );
  }

  return (
    <div className="space-y-8 pt-6">
      {current && (
        <section className="space-y-3">
          <SectionLabel icon={<Mic2 size={13} />}>This Week's Sermon</SectionLabel>
          {companionCard(current, true)}
        </section>
      )}

      {previous.length > 0 && (
        <section className="space-y-3">
          <SectionLabel>Previous Sermon Companions</SectionLabel>
          <div className="space-y-3">
            {previous.map(item => (
              <div key={item.id}>{companionCard(item, false)}</div>
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
  { id: 'walks',       label: 'Walks'             },
  { id: 'journeys',    label: 'Journeys'          },
  { id: 'sermons',     label: 'Sermon Companions' },
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
  const { getMyRooms, loadRooms } = useRooms();
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
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="px-5 pt-10 max-w-[480px] mx-auto">

        {/* Header */}
        <header className="space-y-1">
          <h1 className="text-[28px] font-sans font-medium tracking-tight text-foreground">
            Next Steps
          </h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Choose something to continue walking with Jesus.
          </p>
          <p className="text-[13px] text-muted-foreground/80 leading-relaxed mt-0.5">
            Anything you start will appear on Today's Steps until you finish, pause or hide it.
          </p>
        </header>

        {/* My Rooms — prominent entry point */}
        {(() => {
          const myRooms = user ? getMyRooms(user.id) : [];
          return (
            <button
              onClick={() => setLocation('/rooms')}
              className="mt-5 w-full flex items-center gap-3 p-4 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Users size={17} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-foreground">My Rooms</p>
                <p className="text-[12px] text-muted-foreground">
                  {myRooms.length > 0
                    ? `${myRooms.length} ${myRooms.length === 1 ? 'Room' : 'Rooms'}`
                    : 'Walk journeys together with others'}
                </p>
              </div>
              <ChevronRight size={16} className="text-muted-foreground shrink-0" />
            </button>
          );
        })()}

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
                onOpenJourney={(col) => {
                  // Always open the Journey Details (CollectionPage) — never skip
                  // directly to a Walk or lesson. The member chooses their Walk there.
                  setLocation(`/journeys/collections/${col.id}?source=nextStepsJourneys`);
                }}
              />
            )}

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

            {activeTab === 'sermons' && (
              <SermonCompanionsPanel
                current={data.currentSermonCompanion}
                previous={data.previousSermonCompanions}
                onAction={handleSermonCompanionAction}
              />
            )}
          </>
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
