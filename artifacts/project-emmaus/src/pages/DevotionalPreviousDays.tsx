/**
 * DevotionalPreviousDays — member's history of completed/unlocked devotional entries.
 *
 * Route: /devotional/:seriesId/previous
 *
 * Shows only entries the member has calendar-unlocked (dayNumber <= availableDay).
 * In Development Mode all published entries are shown.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { ChevronLeft, BookHeart, Loader2 } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { useAuth } from '@/contexts/AuthContext';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { calcAvailableDay } from '@/lib/devotional-calendar';
import {
  getSeriesWithEntries,
  getProgress,
  type SeriesWithEntries,
  type DevotionalProgress,
} from '@/lib/devotionals-api';

export default function DevotionalPreviousDays() {
  const params = useParams<{ seriesId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const seriesId = params.seriesId;

  const [seriesData, setSeriesData] = useState<SeriesWithEntries | null>(null);
  const [progress, setProgress] = useState<DevotionalProgress | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!seriesId) return;
    const auth = user?.id ? { userId: user.id } : undefined;
    try {
      const [d, p] = await Promise.all([
        getSeriesWithEntries(seriesId, auth),
        getProgress(seriesId, auth),
      ]);
      setSeriesData(d);
      setProgress(p);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [seriesId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const devMode = isDevelopmentMode(user ?? undefined);

  // Calendar-derived available day — same rule used by Walk.tsx
  const publishedEntries = (seriesData?.entries ?? []).filter(e => e.status === 'Published');
  const maxPublishedDay  = publishedEntries.length > 0
    ? Math.max(...publishedEntries.map(e => e.dayNumber))
    : 1;
  const availableDay = progress
    ? calcAvailableDay(progress.startedAt, maxPublishedDay, devMode)
    : 1;

  // Only show entries the member has unlocked; sort most-recent first.
  const visibleEntries = publishedEntries
    .filter(e => e.dayNumber <= availableDay)
    .sort((a, b) => b.dayNumber - a.dayNumber);

  const completedDays = new Set(progress?.completedDays ?? []);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      {/* Nav */}
      <div className="flex items-center px-5 pt-4 pb-2 max-w-[480px] mx-auto">
        <button
          onClick={() => setLocation('/walk')}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft size={16} /> Today
        </button>
      </div>

      <main className="px-5 pt-6 pb-8 max-w-[480px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2.5 mb-1">
            <BookHeart size={18} className="text-primary" />
            <p className="text-[13px] font-medium text-muted-foreground">
              {seriesData?.title ?? 'Devotionals'}
            </p>
          </div>
          <h1 className="text-[24px] font-semibold text-foreground leading-snug">
            Previous Days
          </h1>
        </div>

        {/* Entry list */}
        {visibleEntries.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No entries available yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleEntries.map(entry => {
              const done = completedDays.has(entry.dayNumber);
              return (
                <button
                  key={entry.id}
                  onClick={() => setLocation(`/devotional/${seriesId}/day/${entry.dayNumber}`)}
                  className="w-full flex items-center gap-3 bg-card border border-border rounded-2xl px-4 py-3.5 text-left hover:bg-muted/40 transition-colors"
                >
                  {/* Day number */}
                  <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center flex-shrink-0 text-[12px] font-semibold text-muted-foreground">
                    {entry.dayNumber}
                  </div>

                  {/* Entry info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-foreground leading-snug truncate">
                      {entry.title || `Day ${entry.dayNumber}`}
                    </p>
                    {entry.scriptureReference && (
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        {entry.scriptureReference}
                      </p>
                    )}
                  </div>

                  {/* Completion indicator */}
                  {done && (
                    <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                  )}
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
