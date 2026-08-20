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
import { ChevronLeft, FolderOpen } from 'lucide-react';
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
import { BrowseModeToggle } from '@/components/BrowseModeToggle';
import { ContentStepList } from '@/components/ContentStepList';

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
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="px-5 pt-6 pb-4 max-w-[480px] mx-auto space-y-6">
        <button
          onClick={goBack}
          className="flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground transition-colors -ml-0.5"
          aria-label="Back"
        >
          <ChevronLeft size={17} />
          {groupId ? series.title : 'Back'}
        </button>

        <div className="space-y-0.5">
          <h1 className="text-[26px] font-sans font-medium tracking-tight text-foreground leading-snug">
            {series.title}
          </h1>
          <p className="text-[13px] text-muted-foreground">
            {selectedGroup?.title ?? 'Choose a reading'}
          </p>
        </div>

        {!groupId && browseMode === 'groups' ? (
          groups.length === 0 ? (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Groups</h2>
                <BrowseModeToggle value={browseMode} onChange={setBrowseMode} />
              </div>
              <div className="rounded-2xl border border-dashed border-border px-5 py-10 text-center">
              <FolderOpen size={20} className="mx-auto text-muted-foreground/60" />
              <p className="mt-3 text-sm text-muted-foreground">No devotional groups are available yet.</p>
              <button
                type="button"
                className="mt-3 text-sm font-medium text-primary hover:underline"
                onClick={() => setBrowseMode('all')}
              >
                View all devotional days
              </button>
              </div>
            </section>
          ) : (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Groups</h2>
                <BrowseModeToggle value={browseMode} onChange={setBrowseMode} />
              </div>
              <div className="grid grid-cols-1 gap-3">
                {groups.map(group => (
                  <button
                    key={group.id}
                    onClick={() => setLocation(`/devotional/${seriesId}/navigate/group/${encodeURIComponent(group.id)}`)}
                    className="w-full flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5 text-left hover:border-primary/25 hover:bg-muted/40 active:bg-muted/60 transition-colors"
                  >
                    <span className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <FolderOpen size={17} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[14px] font-semibold text-foreground truncate">{group.title}</span>
                      <span className="block text-[11px] text-muted-foreground mt-0.5">{group.items.length} devotional {group.items.length === 1 ? 'day' : 'days'}</span>
                      {group.description && <span className="block text-[11px] text-muted-foreground mt-1 truncate">{group.description}</span>}
                    </span>
                    <span className="text-[11px] font-medium text-primary shrink-0">Open →</span>
                  </button>
                ))}
              </div>
            </section>
          )
        ) : sorted.length === 0 ? (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Days</h2>
              {!groupId && <BrowseModeToggle value={browseMode} onChange={setBrowseMode} />}
            </div>
            <p className="text-sm text-muted-foreground text-center py-8">No entries available yet.</p>
          </section>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                {groupId ? 'Days' : 'All days'}
              </h2>
              {!groupId && <BrowseModeToggle value={browseMode} onChange={setBrowseMode} />}
            </div>
            <ContentStepList
              items={sorted.map((entry, idx) => {
                const done = completedSet.has(entry.dayNumber);
                const isCurrent = entry.dayNumber === currentDayNumber;
                const label = getDevotionalLabel({ dayNumber: entry.dayNumber, displayLabel: entry.displayLabel });
                return {
                  id: entry.dayNumber,
                  index: idx + 1,
                  title: label,
                  subtitle: entry.title,
                  completed: done,
                  current: isCurrent && !done,
                  ariaLabel: isCurrent && !done
                    ? `Up next: ${label}${entry.title ? ` — ${entry.title}` : ''}`
                    : done
                      ? `Review: ${label}${entry.title ? ` — ${entry.title}` : ''}`
                      : `${label}${entry.title ? ` — ${entry.title}` : ''}`,
                  onClick: () => setLocation(`/devotional/${seriesId}/day/${entry.dayNumber}?source=navigate`),
                };
              })}
            />
          </section>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
