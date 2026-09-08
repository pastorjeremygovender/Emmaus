/**
 * SermonCompanionPreviousDays — Previous Days list for a Sermon Companion.
 *
 * Route: /sermon-companion/:id/previous
 *
 * Thin page: loads companion data from the API and renders the shared
 * PreviousDaysScreen component.
 *
 * Back navigation uses ?source= (standard return-context convention).
 * Steps opened from this screen receive ?source=sermonCompanionPrevious&sourceId=<id>
 * so the completion card shows "Back to Previous Steps".
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { PreviousDaysScreen, type PreviousDayEntry } from '@/components/PreviousDaysScreen';
import { goBackOrFallback, resolveReturn } from '@/lib/return-context';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface SCEntry {
  id: string;
  dayNumber: number;
  title: string;
  scriptureReference: string;
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

export default function SermonCompanionPreviousDays() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const companionId = params.id ?? '';

  const qs       = new URLSearchParams(window.location.search);
  // Accept both ?source= (current) and legacy ?from= so old links and bookmarks keep working.
  const source   = qs.get('source') ?? qs.get('from');
  const sourceId = qs.get('sourceId');
  const { path: backPath, label: backLabel } = resolveReturn(source, sourceId, '/journeys?tab=sermons');

  const [companion, setCompanion] = useState<MemberCompanion | null>(null);
  const [loading, setLoading]     = useState(true);

  const load = useCallback(async () => {
    if (!companionId || !user?.id) return;
    try {
      const res = await fetch(`${BASE}/api/sermon-companions/${companionId}/member`, {
        credentials: 'include',
      });
      if (res.ok) setCompanion(await res.json());
    } catch {
      // ignore — empty-state handled below
    } finally {
      setLoading(false);
    }
  }, [companionId, user?.id]);

  useEffect(() => { load(); }, [load]);

  const completedSet = new Set(companion?.progress?.completedDays ?? []);

  // All published entries are accessible — members can open any step freely.
  const currentDay = companion?.progress?.currentDay ?? 1;
  const entries: PreviousDayEntry[] = (companion?.entries ?? [])
    .filter(e => e.status === 'Published' && e.dayNumber < currentDay)
    .sort((a, b) => b.dayNumber - a.dayNumber)
    .map(e => ({
      dayNumber: e.dayNumber,
      label: `Step ${e.dayNumber}`,
      title: e.title || `Step ${e.dayNumber}`,
      subtitle: e.scriptureReference || undefined,
      status: completedSet.has(e.dayNumber) ? 'completed' : 'current',
    }));

  const openDay = (day: number) =>
    setLocation(`/sermon-companion/${companionId}/day/${day}?source=sermonCompanionPrevious&sourceId=${companionId}`);

  return (
    <PreviousDaysScreen
      contentTitle={companion?.title ?? 'Sermon Companion'}
      entries={entries}
      loading={loading}
      onBack={() => goBackOrFallback(backPath, setLocation)}
      onReviewDay={openDay}
      onContinueDay={openDay}
      backLabel={backLabel}
      screenTitle="All Steps"
      emptyMessage="No previous companion steps are available yet."
    />
  );
}
