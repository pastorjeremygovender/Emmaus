/**
 * SermonCompanionPreviousDays — Previous Days list for a Sermon Companion.
 *
 * Route: /sermon-companion/:id/previous
 *
 * Thin page: loads companion data from the API and renders the shared
 * PreviousDaysScreen component.
 *
 * Back navigation:
 *   ?from=walk  → /walk     (Today's Steps)
 *   default     → /journeys (Next Steps)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { PreviousDaysScreen, type PreviousDayEntry } from '@/components/PreviousDaysScreen';
import { resolveReturn } from '@/lib/return-context';

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

  const from = new URLSearchParams(window.location.search).get('from');
  const { path: backPath, label: backLabel } = resolveReturn(from, null, '/journeys?tab=sermons');

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

  const completedSet  = new Set(companion?.progress?.completedDays ?? []);
  const currentDay    = companion?.progress?.currentDay ?? 1;

  const entries: PreviousDayEntry[] = (companion?.entries ?? [])
    .filter(e => e.status === 'Published' && e.dayNumber < currentDay)
    .sort((a, b) => b.dayNumber - a.dayNumber)
    .map(e => ({
      dayNumber: e.dayNumber,
      title: e.title || `Step ${e.dayNumber}`,
      subtitle: e.scriptureReference || undefined,
      status: completedSet.has(e.dayNumber) ? 'completed' : 'current',
    }));

  const sourceParam = `?source=${from ?? 'nextStepsSermons'}`;

  return (
    <PreviousDaysScreen
      contentTitle={companion?.title ?? 'Sermon Companion'}
      entries={entries}
      loading={loading}
      onBack={() => setLocation(backPath)}
      onReviewDay={(day) =>
        setLocation(`/sermon-companion/${companionId}/day/${day}${sourceParam}`)
      }
      backLabel={backLabel}
      screenTitle="Previous Steps"
      emptyMessage="No previous companion steps are available yet."
    />
  );
}
