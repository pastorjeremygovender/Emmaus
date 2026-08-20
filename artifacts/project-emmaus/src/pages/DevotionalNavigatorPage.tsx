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
import { ArrowLeft, FolderOpen } from 'lucide-react';
import {
  getSeriesWithEntries,
  getAllProgress,
  listDevotionalEntryGroups,
  type DevotionalProgress,
  type SeriesWithEntries,
  type DevotionalEntryGroup,
} from '@/lib/devotionals-api';
import { getDevotionalLabel } from '@/lib/step-label';
import { BottomNav } from '@/components/BottomNav';

function BrowseModeToggle({
  value,
  onChange,
}: {
  value: 'groups' | 'all';
  onChange: (value: 'groups' | 'all') => void;
}) {
  return (
    <div className="inline-flex items-center rounded-xl border border-border bg-muted/30 p-1" role="group" aria-label="Browse mode">
      <button type="button" onClick={() => onChange('groups')} aria-pressed={value === 'groups'}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${value === 'groups' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
        View Groups
      </button>
      <button type="button" onClick={() => onChange('all')} aria-pressed={value === 'all'}
        className={`rounded-lg px-3 py-1.5 text-xs font-medium ${value === 'all' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
        View All
      </button>
    </div>
  );
}

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
  const { groupId } = useParams<{ seriesId: string; groupId?: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [series, setSeries] = useState<SeriesWithEntries | null>(null);
  const [progress, setProgress] = useState<DevotionalProgress | null>(null);
  const [groups, setGroups] = useState<DevotionalEntryGroup[]>([]);
  const [browseMode, setBrowseMode] = useState<'groups' | 'all'>('groups');
  const [loading, setLoading] = useState(true);
  const selectedGroup = groups.find(group => group.id === groupId) ?? null;

  useEffect(() => {
    if (!seriesId || !user?.id) return;
    const auth = { userId: user.id };

    Promise.all([
      getSeriesWithEntries(seriesId, auth),
      getAllProgress(auth),
      listDevotionalEntryGroups(seriesId, auth).catch(() => [] as DevotionalEntryGroup[]),
    ])
      .then(([s, allProg, entryGroups]) => {
        setSeries(s);
        setProgress(allProg.find(p => p.seriesId === seriesId) ?? null);
        setGroups(entryGroups);
      })
      .catch(() => {/* non-fatal */})
      .finally(() => setLoading(false));
  }, [seriesId, user?.id]);

  function goBack() {
    if (groupId) {
      setLocation(`/devotional/${seriesId}/navigate`);
      return;
    }
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

  const sorted = (selectedGroup?.items ?? series.entries)
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
            <p className="text-sm font-semibold text-foreground">{selectedGroup?.title ?? 'Choose a reading'}</p>
          </div>
          {!groupId && <BrowseModeToggle value={browseMode} onChange={setBrowseMode} />}
        </div>
      </div>

      {/* Entry list */}
      <main className="flex-1 px-4 pt-5 pb-4">
        {!groupId && browseMode === 'groups' && groups.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Choose a group to browse its devotional days.</p>
            <div className="grid grid-cols-1 gap-3">
              {groups.map(group => (
                <button
                  key={group.id}
                  onClick={() => setLocation(`/devotional/${seriesId}/navigate/group/${encodeURIComponent(group.id)}`)}
                  className="w-full flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-4 text-left hover:bg-muted/40 active:bg-muted/60 transition-colors"
                >
                  <span className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <FolderOpen size={18} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[15px] font-semibold text-foreground truncate">{group.title}</span>
                    <span className="block text-xs text-muted-foreground mt-0.5">{group.items.length} devotional {group.items.length === 1 ? 'day' : 'days'}</span>
                    {group.description && <span className="block text-xs text-muted-foreground mt-1 truncate">{group.description}</span>}
                  </span>
                  <span className="text-xs text-primary">Open →</span>
                </button>
              ))}
              <button
                onClick={() => setLocation(`/devotional/${seriesId}/navigate`)}
                className="w-full flex items-center gap-3 rounded-2xl border border-dashed border-border px-4 py-3.5 text-left hover:bg-muted/40 transition-colors"
              >
                <span className="flex-1 text-sm text-muted-foreground">Browse all devotional days</span>
                <span className="text-xs text-primary">Open →</span>
              </button>
            </div>
          </div>
        ) : sorted.length === 0 ? (
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
