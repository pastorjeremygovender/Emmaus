/**
 * DevotionalPreviousDays — Previous Days list for a Daily Devotional series.
 *
 * Route: /devotional/:seriesId/previous
 *
 * Thin page: loads devotional data from the API and renders the shared
 * PreviousDaysScreen component.
 *
 * Back navigation:
 *   ?from=walk  → /walk     (Today's Steps)
 *   default     → /journeys (Next Steps)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { isDevelopmentMode } from '@/lib/dev-mode';
import { calcAvailableDaySelfPaced } from '@/lib/devotional-calendar';
import { resolveReturn } from '@/lib/return-context';
import {
  getSeriesWithEntries,
  getProgress,
  type SeriesWithEntries,
  type DevotionalProgress,
} from '@/lib/devotionals-api';
import { PreviousDaysScreen, type PreviousDayEntry } from '@/components/PreviousDaysScreen';

export default function DevotionalPreviousDays() {
  const params = useParams<{ seriesId: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const seriesId = params.seriesId;

  const from = new URLSearchParams(window.location.search).get('from');
  const { path: backPath, label: backLabel } = resolveReturn(from, null, '/journeys?tab=devotionals');

  const [seriesData, setSeriesData] = useState<SeriesWithEntries | null>(null);
  const [progress, setProgress]     = useState<DevotionalProgress | null>(null);
  const [loading, setLoading]       = useState(true);

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
      // ignore — empty-state handled below
    } finally {
      setLoading(false);
    }
  }, [seriesId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const devMode = isDevelopmentMode(user ?? undefined);

  const publishedEntries = (seriesData?.entries ?? []).filter(e => e.status === 'Published');
  const maxPublishedDay  = publishedEntries.length > 0
    ? Math.max(...publishedEntries.map(e => e.dayNumber))
    : 1;
  // Self-paced: show all entries up to and including the member's next available day.
  const completedDays = progress?.completedDays ?? [];
  const availableDay = calcAvailableDaySelfPaced(completedDays, maxPublishedDay, devMode);

  const completedSet = new Set(progress?.completedDays ?? []);

  const entries: PreviousDayEntry[] = publishedEntries
    .filter(e => e.dayNumber <= availableDay)
    .sort((a, b) => b.dayNumber - a.dayNumber)
    .map(e => ({
      dayNumber: e.dayNumber,
      title: e.title || `Day ${e.dayNumber}`,
      subtitle: e.scriptureReference || undefined,
      status: completedSet.has(e.dayNumber) ? 'completed' : 'current',
    }));

  return (
    <PreviousDaysScreen
      contentTitle={seriesData?.title ?? 'Daily Devotional'}
      entries={entries}
      loading={loading}
      onBack={() => { if (window.history.length > 1) window.history.back(); else setLocation(backPath); }}
      onReviewDay={(day) =>
        setLocation(`/devotional/${seriesId}/day/${day}?source=${from ?? 'nextStepsDevotionals'}`)
      }
      backLabel={backLabel}
      emptyMessage="No previous entries are available yet."
    />
  );
}
