/**
 * DevotionalNavigatorPage — shown when a member taps a Daily Devotional card
 * from Today's Steps or Discover. Shows the full list of entries so the member
 * can choose where to read, using the same layout as the Walk steps list.
 *
 * Route: /devotional/:seriesId/navigate
 *
 * IMPORTANT — why we use getAllProgress() not getProgress():
 *   The devotional_progress.current_day column is seeded at 1 when a series
 *   starts and is NEVER updated when markDayComplete() runs (only completedDays
 *   is appended). Relying on currentDay would always show "Entry 1" as current.
 *   Instead we compute the current entry by finding the first published entry
 *   whose dayNumber is not yet in completedDays.
 *
 *   We also use getAllProgress() (the aggregate endpoint, same as Walk.tsx)
 *   rather than the per-series getProgress() endpoint to avoid stale cache hits.
 */

import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft } from 'lucide-react';
import {
  getSeriesWithEntries,
  getAllProgress,
  type DevotionalProgress,
  type SeriesWithEntries,
} from '@/lib/devotionals-api';
import { getDevotionalLabel } from '@/lib/step-label';
import { BottomNav } from '@/components/BottomNav';

function resolveCurrentDayNumber(
  sorted: SeriesWithEntries['entries'],
  completedSet: Set<number>,
): number | null {
  const next = sorted.find(e => !completedSet.has(e.dayNumber));
  if (next) return next.dayNumber;
  // All complete — pin to last entry
  return sorted.length > 0 ? sorted[sorted.length - 1].dayNumber : null;
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
      getAllProgress(auth),
    ])
      .then(([s, allProg]) => {
        setSeries(s);
        setProgress(allProg.find(p => p.seriesId === seriesId) ?? null);
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setLoading(false));
  }, [seriesId, user?.id]);

  function goBack() {
    if (window.history.length > 1) window.history.back();
    else setLocation('/walk');
  }

  if (loading || !series) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const sorted = series.entries
    .filter(e => e.status === 'Published')
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const completedSet = new Set<number>(progress?.completedDays ?? []);
  const currentDayNumber = resolveCurrentDayNumber(sorted, completedSet);

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
            <p className="text-sm font-semibold text-foreground">Choose a reading</p>
          </div>
        </div>
      </div>

      {/* Entry list */}
      <main className="flex-1 px-4 pt-5 pb-4">
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No entries available yet.</p>
        ) : (
          <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
            {sorted.map((entry, idx) => {
              const done     = completedSet.has(entry.dayNumber);
              const isCurrent = entry.dayNumber === currentDayNumber;
              const label    = getDevotionalLabel({ dayNumber: entry.dayNumber, displayLabel: entry.displayLabel });

              return (
                <button
                  key={entry.dayNumber}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 transition-colors text-left ${
                    isCurrent && !done
                      ? 'bg-primary/5 hover:bg-primary/10 active:bg-primary/15'
                      : 'bg-card hover:bg-muted/40 active:bg-muted/60'
                  }`}
                  onClick={() => setLocation(`/devotional/${seriesId}/day/${entry.dayNumber}?source=navigate`)}
                  aria-label={
                    isCurrent && !done
                      ? `Up next: ${label}${entry.title ? ` — ${entry.title}` : ''}`
                      : done
                        ? `Review: ${label}${entry.title ? ` — ${entry.title}` : ''}`
                        : `${label}${entry.title ? ` — ${entry.title}` : ''}`
                  }
                >
                  <span className={`text-[12px] font-medium w-6 shrink-0 mt-0.5 ${done || (isCurrent && !done) ? 'text-primary' : 'text-muted-foreground'}`}>
                    {idx + 1}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`text-[14px] leading-snug block ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {label}
                    </span>
                    {entry.title && (
                      <span className={`text-[12px] leading-snug block mt-0.5 ${done ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                        {entry.title}
                      </span>
                    )}
                  </span>
                  <span className={`ml-auto text-[11px] font-medium shrink-0 mt-0.5 ${isCurrent && !done ? 'text-primary' : done ? 'text-primary' : 'text-muted-foreground'}`}>
                    {isCurrent && !done ? 'Up next →' : done ? 'Review →' : '→'}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
