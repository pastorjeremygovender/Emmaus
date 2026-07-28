/**
 * DevotionalDay — member reading page for a single devotional entry.
 *
 * Route: /devotional/:seriesId/day/:day
 *
 * Completion behaviour:
 *   - Tapping "Finished" marks the current day complete and shows ReadingCompletionFooter
 *     in-page; the member then taps "Back to Today's Steps" to navigate to /walk.
 *   - The app never navigates forward to the next day on button press.
 *   - Day availability is calendar-derived on Walk.tsx; this page is read-only once
 *     a day is completed (replay / review mode).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { Loader2, ChevronLeft } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { DevotionalReading } from '@/components/DevotionalReading';
import { ReadingCompletionFooter } from '@/components/ReadingCompletionFooter';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import {
  getSeriesWithEntries,
  getProgress,
  startSeries,
  markDayComplete,
  type SeriesWithEntries,
  type DevotionalProgress,
} from '@/lib/devotionals-api';
import { resolveDisplayName } from '@/components/DailyRhythmReading';

export default function DevotionalDay() {
  const params = useParams<{ seriesId: string; day: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const seriesId = params.seriesId;
  const day = parseInt(params.day ?? '1', 10);

  const [seriesData, setSeriesData] = useState<SeriesWithEntries | null>(null);
  const [progress, setProgress] = useState<DevotionalProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // In-page completion state — shown after a successful save, before the member
  // taps "Back to Today's Steps". Prevents immediate auto-navigation.
  const [justCompleted, setJustCompleted] = useState(false);

  const load = useCallback(async () => {
    if (!seriesId) return;
    const auth = user?.id ? { userId: user.id } : undefined;
    try {
      const [d, p] = await Promise.all([
        getSeriesWithEntries(seriesId, auth),
        getProgress(seriesId, auth),
      ]);
      setSeriesData(d);

      // Auto-start as a fallback if the member navigated here directly
      if (!p) {
        const started = await startSeries(seriesId, auth);
        setProgress(started);
      } else {
        setProgress(p);
      }
    } catch {
      // ignore — loading errors shown via empty state below
    } finally {
      setLoading(false);
    }
  }, [seriesId, user?.id]);

  useEffect(() => {
    setJustCompleted(false); // reset if the member navigates to a different day
  }, [day]);

  useEffect(() => { load(); }, [load]);

  const entry = seriesData?.entries.find(e => e.dayNumber === day);
  const totalEntries = seriesData?.entries.filter(e => e.status === 'Published').length ?? 0;

  // This day has already been completed in a prior session — replay mode.
  const alreadyCompleted = progress?.completedDays?.includes(day) ?? false;

  /**
   * Handle "Finished" — marks the current day complete then shows the
   * ReadingCompletionFooter in-page. Never navigates forward to the next day.
   */
  const handleFinished = async () => {
    if (!seriesId || completing) return;
    setSaveError(false);
    setCompleting(true);
    const auth = user?.id ? { userId: user.id } : undefined;
    try {
      const updated = await markDayComplete(seriesId, day, auth);
      setProgress(updated);
      setJustCompleted(true);
    } catch {
      // Restore button so the member can try again — never leave it spinning.
      setCompleting(false);
      setSaveError(true);
    }
  };

  const returnPath = `/devotional/${seriesId}/day/${day}`;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Not found / not available ──────────────────────────────────────────────
  if (!seriesData || !entry) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-muted-foreground text-sm text-center">
          This devotional isn't available yet.
        </p>
        <Button variant="outline" onClick={() => setLocation('/walk')}>
          Back to Today's Steps
        </Button>
      </div>
    );
  }

  // ── Action button ──────────────────────────────────────────────────────────

  let actionButton: React.ReactNode;

  if (justCompleted || alreadyCompleted) {
    // Completed this session or returning to an already-completed day (replay)
    actionButton = (
      <ReadingCompletionFooter
        completedToday={justCompleted || alreadyCompleted}
        onReturn={() => setLocation('/walk')}
      />
    );
  } else {
    // First-time reading — show "Finished" button with loading + error states
    actionButton = (
      <div className="space-y-2">
        {saveError && (
          <p className="text-center text-sm text-destructive">
            Something went wrong. Please try again.
          </p>
        )}
        <Button
          className="w-full h-14 text-[17px] font-semibold rounded-2xl"
          onClick={handleFinished}
          disabled={completing}
        >
          {completing ? <Loader2 size={18} className="animate-spin" /> : 'Finished'}
        </Button>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {/* Nav bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-2 max-w-[640px] mx-auto">
        <button
          onClick={() => setLocation('/walk')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} /> Today
        </button>
        {totalEntries > 1 && (
          <button
            onClick={() => setLocation(`/devotional/${seriesId}/previous`)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Previous days
          </button>
        )}
      </div>

      {/* Reading */}
      <DevotionalReading
        seriesTitle={seriesData.title}
        dayNumber={day}
        title={entry.title}
        greeting={entry.greeting ?? ''}
        scripture={entry.scriptureReference ?? ''}
        considerThis={entry.considerThis ?? ''}
        prayer={entry.prayer ?? ''}
        nextStep={entry.nextStep ?? ''}
        closing={entry.closing ?? ''}
        memberName={resolveDisplayName(user?.preferredName)}
        returnPath={returnPath}
        actionButton={actionButton}
      />

      <BottomNav />
    </div>
  );
}
