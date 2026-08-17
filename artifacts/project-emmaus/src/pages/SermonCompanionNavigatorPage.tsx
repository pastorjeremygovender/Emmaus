/**
 * SermonCompanionNavigatorPage — shown when a member taps an in-progress
 * Sermon Companion card on Today's Steps. Shows Previous / Current / Next
 * days so the member can choose where to read.
 *
 * Route: /sermon-companion/:id/navigate
 */

import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft, CheckCircle2, ChevronRight } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ── Types (mirrors SermonCompanionReader internal types) ──────────────────────

interface SCEntry {
  id: string;
  dayNumber: number;
  title: string;
  status: string;
}

interface SCProgress {
  currentDay: number;
  completedDays: number[];
}

interface MemberCompanion {
  id: string;
  title: string;
  numberOfDays: number;
  entries: SCEntry[];
  progress: SCProgress | null;
}

// ── Card components (same visual design as StepNavigatorPage) ─────────────────

interface CardEntry {
  dayNumber: number;
  label: string;
  title?: string | null;
}

function PrevCard({ entry, onClick }: { entry: CardEntry; onClick: () => void }) {
  return (
    <button
      className="w-full text-left rounded-2xl border border-border bg-muted/30 px-5 py-4 transition-all active:scale-[0.98]"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
            ← Previous
          </p>
          <p className="text-sm font-medium text-foreground/75 truncate">
            {entry.label}{entry.title ? ` · ${entry.title}` : ''}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 opacity-50" />
      </div>
    </button>
  );
}

function CurrentCard({ entry, onClick }: { entry: CardEntry; onClick: () => void }) {
  return (
    <button
      className="w-full text-left rounded-2xl border-2 border-primary bg-primary/5 px-5 py-5 transition-all active:scale-[0.98] shadow-sm"
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <span className="inline-block text-[10px] font-bold text-primary uppercase tracking-widest mb-2">
            ● Current
          </span>
          <p className="text-base font-bold text-foreground leading-snug">{entry.label}</p>
          {entry.title && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{entry.title}</p>
          )}
        </div>
        <span className="flex-shrink-0 inline-flex items-center gap-1 bg-primary text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full mt-0.5 whitespace-nowrap">
          Open <ChevronRight className="w-3 h-3" />
        </span>
      </div>
    </button>
  );
}

function NextCard({ entry, onClick }: { entry: CardEntry; onClick: () => void }) {
  return (
    <button
      className="w-full text-left rounded-2xl border border-border bg-background px-5 py-4 transition-all active:scale-[0.98]"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
            Next →
          </p>
          <p className="text-sm font-medium text-foreground/75 truncate">
            {entry.label}{entry.title ? ` · ${entry.title}` : ''}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
    </button>
  );
}

function EmptySlot({ role }: { role: 'previous' | 'next' }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/50 px-5 py-4 opacity-40 pointer-events-none">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-0.5">
        {role === 'previous' ? '← Previous' : 'Next →'}
      </p>
      <p className="text-sm text-muted-foreground">
        {role === 'previous' ? 'This is the beginning' : 'More coming soon'}
      </p>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function SermonCompanionNavigatorPage() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [companion, setCompanion] = useState<MemberCompanion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`${BASE}/api/sermon-companions/${id}/member`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((data: MemberCompanion | null) => { if (data) setCompanion(data); })
      .catch(() => {/* non-fatal */})
      .finally(() => setLoading(false));
  }, [id]);

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else setLocation('/walk');
  }

  function navigate(dayNumber: number) {
    setLocation(`/sermon-companion/${id}/day/${dayNumber}?source=navigate`);
  }

  if (loading || !companion) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const prog = companion.progress;

  // Sort published entries
  const published = companion.entries
    .filter(e => e.status === 'Published')
    .sort((a, b) => a.dayNumber - b.dayNumber);

  // Use completion-based current index — same approach as DevotionalNavigatorPage.
  // currentDay from the DB is not reliably updated as members progress, so we
  // find the first uncompleted entry instead. If all are done, pin to the last.
  const completedSet = new Set<number>(prog?.completedDays ?? []);
  const resolvedIdx = (() => {
    const nextIdx = published.findIndex(e => !completedSet.has(e.dayNumber));
    if (nextIdx !== -1) return nextIdx;
    return published.length - 1; // all done — pin to last
  })();

  const currentIdx = published.length > 0 ? resolvedIdx : -1;
  const prevEntry  = currentIdx > 0 ? published[currentIdx - 1] : null;
  const currEntry  = currentIdx >= 0 ? published[currentIdx] : null;
  const nextEntry  = currentIdx >= 0 && currentIdx < published.length - 1 ? published[currentIdx + 1] : null;

  const completedCount = completedSet.size;
  const totalCount     = published.length;

  function toCard(e: SCEntry): CardEntry {
    return { dayNumber: e.dayNumber, label: `Step ${e.dayNumber}`, title: e.title };
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={goBack}
            className="p-1.5 -ml-1.5 rounded-full hover:bg-muted transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{companion.title}</p>
            <p className="text-sm font-semibold text-foreground">Where would you like to read?</p>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 px-4 pt-6 pb-4 flex flex-col gap-3">
        {prevEntry ? (
          <PrevCard entry={toCard(prevEntry)} onClick={() => navigate(prevEntry.dayNumber)} />
        ) : (
          <EmptySlot role="previous" />
        )}

        {currEntry ? (
          <CurrentCard entry={toCard(currEntry)} onClick={() => navigate(currEntry.dayNumber)} />
        ) : (
          <div className="rounded-2xl border-2 border-border bg-muted/20 px-5 py-5 text-center opacity-60">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">● Current</p>
            <p className="text-sm text-muted-foreground">No content available yet</p>
          </div>
        )}

        {nextEntry ? (
          <NextCard entry={toCard(nextEntry)} onClick={() => navigate(nextEntry.dayNumber)} />
        ) : (
          <EmptySlot role="next" />
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="px-4 pb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progress</span>
            <span>{completedCount} of {totalCount} steps completed</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (completedCount / totalCount) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* View all link */}
      <div className="px-4 pb-4 text-center">
        <button
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
          onClick={() => setLocation(`/sermon-companion/${id}/previous`)}
        >
          View all steps
        </button>
      </div>

      <BottomNav />
    </div>
  );
}
