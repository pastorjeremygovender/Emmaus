/**
 * DevotionalNavigatorPage — shown when a member taps a Daily Devotional card
 * on Today's Steps. Shows Previous / Current / Next entries so the member can
 * choose where to read instead of being dropped straight into the reading.
 *
 * Route: /devotional/:seriesId/navigate
 */

import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, CheckCircle2, ChevronRight } from 'lucide-react';
import {
  getSeriesWithEntries,
  getProgress,
  type DevotionalEntry,
  type DevotionalProgress,
  type SeriesWithEntries,
} from '@/lib/devotionals-api';
import { getDevotionalLabel } from '@/lib/step-label';
import { BottomNav } from '@/components/BottomNav';

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

function entryToCard(e: DevotionalEntry): CardEntry {
  return {
    dayNumber: e.dayNumber,
    label: getDevotionalLabel({ dayNumber: e.dayNumber, displayLabel: e.displayLabel }),
    title: e.title,
  };
}

export function DevotionalNavigatorPage() {
  const { seriesId } = useParams<{ seriesId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [series, setSeries] = useState<SeriesWithEntries | null>(null);
  const [progress, setProgress] = useState<DevotionalProgress | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!seriesId || !user?.id) return;
    const auth = { userId: user.id };
    Promise.all([
      getSeriesWithEntries(seriesId, auth),
      getProgress(seriesId, auth),
    ])
      .then(([s, p]) => { setSeries(s); setProgress(p); })
      .catch(() => {/* non-fatal — stay on loading state */})
      .finally(() => setLoading(false));
  }, [seriesId, user?.id]);

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else setLocation('/walk');
  }

  function navigate(dayNumber: number) {
    setLocation(`/devotional/${seriesId}/day/${dayNumber}?source=navigate`);
  }

  if (loading || !series) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  // Sort published entries by day number
  const published = series.entries
    .filter(e => e.status === 'Published')
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const currentDay = progress?.currentDay ?? (published[0]?.dayNumber ?? 1);
  // Clamp to last published entry if progress is ahead of content
  const effectiveDay = published.some(e => e.dayNumber === currentDay)
    ? currentDay
    : (published[published.length - 1]?.dayNumber ?? currentDay);

  const currentIdx = published.findIndex(e => e.dayNumber === effectiveDay);
  const prevEntry  = currentIdx > 0 ? published[currentIdx - 1] : null;
  const currEntry  = published[currentIdx] ?? null;
  const nextEntry  = currentIdx >= 0 && currentIdx < published.length - 1 ? published[currentIdx + 1] : null;

  const completedCount = progress?.completedDays.length ?? 0;
  const totalCount     = published.length;

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
            <p className="text-xs text-muted-foreground truncate">{series.title}</p>
            <p className="text-sm font-semibold text-foreground">Where would you like to read?</p>
          </div>
        </div>
      </div>

      {/* Cards */}
      <div className="flex-1 px-4 pt-6 pb-4 flex flex-col gap-3">
        {prevEntry ? (
          <PrevCard entry={entryToCard(prevEntry)} onClick={() => navigate(prevEntry.dayNumber)} />
        ) : (
          <EmptySlot role="previous" />
        )}

        {currEntry ? (
          <CurrentCard entry={entryToCard(currEntry)} onClick={() => navigate(currEntry.dayNumber)} />
        ) : (
          <div className="rounded-2xl border-2 border-border bg-muted/20 px-5 py-5 text-center opacity-60">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1">● Current</p>
            <p className="text-sm text-muted-foreground">No content available yet</p>
          </div>
        )}

        {nextEntry ? (
          <NextCard entry={entryToCard(nextEntry)} onClick={() => navigate(nextEntry.dayNumber)} />
        ) : (
          <EmptySlot role="next" />
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="px-4 pb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>Progress</span>
            <span>{completedCount} of {totalCount} entries completed</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (completedCount / totalCount) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
