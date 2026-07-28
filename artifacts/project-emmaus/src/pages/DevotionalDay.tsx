/**
 * DevotionalDay — member reading page for a single devotional entry.
 *
 * Route: /devotional/:seriesId/day/:day
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { Loader2, ArrowLeft, ChevronLeft } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { DevotionalReading } from '@/components/DevotionalReading';
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

  const load = useCallback(async () => {
    if (!seriesId) return;
    try {
      const [d, p] = await Promise.all([
        getSeriesWithEntries(seriesId),
        getProgress(seriesId),
      ]);
      setSeriesData(d);

      // Auto-start if the member hasn't started this series yet
      if (!p) {
        const started = await startSeries(seriesId);
        setProgress(started);
      } else {
        setProgress(p);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [seriesId]);

  useEffect(() => { load(); }, [load]);

  const entry = seriesData?.entries.find(e => e.dayNumber === day);
  const totalEntries = seriesData?.entries.filter(e => e.status === 'Published').length ?? 0;

  const handleContinue = async () => {
    if (!seriesId) return;
    setCompleting(true);
    try {
      const updated = await markDayComplete(seriesId, day);
      setProgress(updated);
      // Navigate to next day or back to walk
      const nextDay = day + 1;
      const hasNext = seriesData?.entries.some(e => e.dayNumber === nextDay && e.status === 'Published');
      if (hasNext) {
        setLocation(`/devotional/${seriesId}/day/${nextDay}`);
      } else {
        setLocation('/walk');
      }
    } catch {
      setCompleting(false);
    }
  };

  const alreadyCompleted = progress?.completedDays?.includes(day) ?? false;
  const returnPath = `/devotional/${seriesId}/day/${day}`;

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!seriesData || !entry) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6">
        <p className="text-muted-foreground text-sm">This devotional isn't available.</p>
        <Button variant="outline" onClick={() => setLocation('/walk')}>
          Back to Today
        </Button>
      </div>
    );
  }

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
        memberName={user?.preferredName}
        returnPath={returnPath}
        actionButton={
          alreadyCompleted ? (
            <div className="w-full text-center py-4">
              <p className="text-sm text-muted-foreground">You've completed today's devotional.</p>
              <button
                onClick={() => setLocation('/walk')}
                className="mt-2 text-sm text-primary font-medium hover:underline"
              >
                Back to Today
              </button>
            </div>
          ) : (
            <Button
              className="w-full h-14 text-[17px] font-semibold rounded-2xl"
              onClick={handleContinue}
              disabled={completing}
            >
              {completing ? <Loader2 size={18} className="animate-spin" /> : 'Continue'}
            </Button>
          )
        }
      />

      <BottomNav />
    </div>
  );
}
