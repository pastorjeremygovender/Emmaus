/**
 * SermonCompanionNavigatorPage — shown when a member taps an in-progress
 * Sermon Companion card on Today's Steps. Shows all steps as a scrollable
 * list using the same layout as Walk/Journey/Devotional navigators.
 *
 * Route: /sermon-companion/:id/navigate
 */

import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { goBackOrFallback } from '@/lib/return-context';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

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
    goBackOrFallback('/walk', setLocation);
  }

  if (loading || !companion) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const published = companion.entries
    .filter(e => e.status === 'Published')
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const completedSet = new Set<number>(companion.progress?.completedDays ?? []);

  // Current = first uncompleted step; if all done, pin to last
  const currentDayNumber = (() => {
    const next = published.find(e => !completedSet.has(e.dayNumber));
    if (next) return next.dayNumber;
    return published.length > 0 ? published[published.length - 1].dayNumber : null;
  })();

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
            <p className="text-sm font-semibold text-foreground">Choose a step to read</p>
          </div>
        </div>
      </div>

      {/* Step list */}
      <main className="flex-1 px-4 pt-5 pb-4">
        {published.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No steps available yet.</p>
        ) : (
          <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
            {published.map((entry, idx) => {
              const done      = completedSet.has(entry.dayNumber);
              const isCurrent = entry.dayNumber === currentDayNumber && !done;

              return (
                <button
                  key={entry.id}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 transition-colors text-left ${
                    isCurrent
                      ? 'bg-primary/5 hover:bg-primary/10 active:bg-primary/15'
                      : 'bg-card hover:bg-muted/40 active:bg-muted/60'
                  }`}
                  onClick={() => setLocation(`/sermon-companion/${id}/day/${entry.dayNumber}?source=nextStepsSermons`)}
                  aria-label={
                    isCurrent
                      ? `Up next: Step ${entry.dayNumber}${entry.title ? ` — ${entry.title}` : ''}`
                      : done
                        ? `Review: Step ${entry.dayNumber}${entry.title ? ` — ${entry.title}` : ''}`
                        : `Step ${entry.dayNumber}${entry.title ? ` — ${entry.title}` : ''}`
                  }
                >
                  <span className={`text-[12px] font-medium w-6 shrink-0 mt-0.5 ${done || isCurrent ? 'text-primary' : 'text-muted-foreground'}`}>
                    {idx + 1}
                  </span>
                  <span className={`flex-1 text-[14px] leading-snug ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {entry.title || `Step ${entry.dayNumber}`}
                  </span>
                  <span className={`ml-auto text-[11px] font-medium shrink-0 mt-0.5 ${isCurrent ? 'text-primary' : done ? 'text-primary' : 'text-muted-foreground'}`}>
                    {isCurrent ? 'Up next →' : done ? 'Review →' : '→'}
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
