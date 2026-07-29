/**
 * SermonCompanionReader — member reading page for a single sermon companion day.
 *
 * Route: /sermon-companion/:id/day/:day
 *
 * Source-aware return (spec §4):
 *   Pass ?source=today      → "Back to Today's Steps" → /walk
 *   Pass ?source=nextSteps  → "Back to Next Steps"    → /journeys  (default)
 *
 * Sermon companions are AI-generated 5-day devotionals linked to a specific sermon.
 * Progress is tracked via the sermon_companion_progress system (separate from
 * journey progress). The page auto-starts a progress record on first visit.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { Loader2, ChevronLeft } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { DevotionalReading } from '@/components/DevotionalReading';
import { EmmausCompletionCard } from '@/components/EmmausCompletionCard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ─── Source-aware return helpers ──────────────────────────────────────────────

function resolveReturn(source: string | null): { path: string; label: string } {
  if (source === 'today') return { path: '/walk', label: "Back to Today's Steps" };
  return { path: '/journeys', label: 'Back to Next Steps' };
}

// ─── API types ────────────────────────────────────────────────────────────────

interface SCEntry {
  id: string;
  dayNumber: number;
  title: string;
  scriptureReference: string;
  greeting: string;
  reflection: string;
  prayer: string;
  nextStep: string;
  closing: string;
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

// ─── API helpers ──────────────────────────────────────────────────────────────

async function loadMemberCompanion(id: string): Promise<MemberCompanion> {
  const res = await fetch(`${BASE}/api/sermon-companions/${id}/member`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Companion unavailable (${res.status})`);
  return res.json();
}

async function startCompanion(id: string): Promise<SCProgress> {
  const res = await fetch(`${BASE}/api/sermon-companions/${id}/progress/start`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Could not start companion (${res.status})`);
  return res.json();
}

async function completeDayApi(id: string, dayNumber: number): Promise<SCProgress> {
  const res = await fetch(`${BASE}/api/sermon-companions/${id}/progress/complete-day`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ dayNumber }),
  });
  if (!res.ok) throw new Error(`Could not mark day complete (${res.status})`);
  return res.json();
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SermonCompanionReader() {
  const params = useParams<{ id: string; day: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const companionId = params.id ?? '';
  const day = parseInt(params.day ?? '1', 10);

  // Read source once on mount — query string doesn't change during the page lifetime
  const source = new URLSearchParams(window.location.search).get('source');
  const { path: returnDest, label: returnLabel } = resolveReturn(source);

  const [companion, setCompanion]       = useState<MemberCompanion | null>(null);
  const [progress, setProgress]         = useState<SCProgress | null>(null);
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState(false);
  const [completing, setCompleting]     = useState(false);
  const [saveError, setSaveError]       = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const load = useCallback(async () => {
    if (!companionId || !user?.id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const data = await loadMemberCompanion(companionId);
      setCompanion(data);

      if (!data.progress) {
        // Auto-start on first visit — no confirmation needed, member is already reading
        const started = await startCompanion(companionId);
        setProgress(started);
      } else {
        setProgress(data.progress);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [companionId, user?.id]);

  useEffect(() => {
    setJustCompleted(false);
    setSaveError(false);
  }, [day]);

  useEffect(() => { load(); }, [load]);

  const handleFinish = async () => {
    if (!companionId || completing) return;
    setCompleting(true);
    setSaveError(false);
    try {
      const updated = await completeDayApi(companionId, day);
      setProgress(updated);
      setJustCompleted(true);
    } catch {
      setSaveError(true);
    } finally {
      setCompleting(false);
    }
  };

  const firstName = user?.preferredName?.split(' ')[0] ?? 'Friend';
  const entry     = companion?.entries.find(e => e.dayNumber === day);
  const isAlreadyCompleted = (progress?.completedDays ?? []).includes(day) && !justCompleted;

  // ── Loading ──

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Error / not found ──

  if (loadError || !companion) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center pb-24">
        <p className="text-muted-foreground text-sm">
          This sermon companion is not available right now.
        </p>
        <p className="text-xs text-muted-foreground/70">
          The companion may still be generating. Please check back in a moment.
        </p>
        <Button variant="outline" size="sm" onClick={() => setLocation(returnDest)}>
          {returnLabel}
        </Button>
        <BottomNav />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center pb-24">
        <p className="text-muted-foreground text-sm">
          Day {day} is not available yet.
        </p>
        {day < companion.numberOfDays && (
          <p className="text-xs text-muted-foreground/70">
            Each day unlocks after you complete the previous one.
          </p>
        )}
        <Button variant="outline" size="sm" onClick={() => setLocation(returnDest)}>
          {returnLabel}
        </Button>
        <BottomNav />
      </div>
    );
  }

  // ── Main reading view ──

  // Previous days URL — encode back destination so the list knows where to return.
  const prevDaysFrom = source === 'today' ? 'walk' : 'journeys';
  const prevDaysUrl  = `/sermon-companion/${companionId}/previous?from=${prevDaysFrom}`;
  const hasPreviousDays = day > 1;

  // Primary action button shown inside DevotionalReading
  let actionButton: React.ReactNode;
  if (justCompleted) {
    actionButton = (
      <EmmausCompletionCard
        heading={`Day ${day} complete.`}
        subMessage={
          companion && day < companion.numberOfDays
            ? `Day ${day + 1} will be here tomorrow.`
            : 'May the Lord continue His work in your heart today.'
        }
        returnLabel={returnLabel}
        onReturn={() => setLocation(returnDest)}
        onPreviousDays={hasPreviousDays ? () => setLocation(prevDaysUrl) : undefined}
      />
    );
  } else if (isAlreadyCompleted) {
    // Replay mode — member came from Previous Days; no secondary link needed
    actionButton = (
      <EmmausCompletionCard
        heading={`Day ${day} complete.`}
        subMessage="May the Lord continue His work in your heart today."
        returnLabel={returnLabel}
        onReturn={() => setLocation(returnDest)}
      />
    );
  } else {
    actionButton = (
      <Button
        className="w-full rounded-2xl"
        onClick={handleFinish}
        disabled={completing}
      >
        {completing
          ? <><Loader2 size={16} className="animate-spin mr-2" />Saving…</>
          : 'Finished'
        }
      </Button>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-36">
      {/* Back navigation */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/40">
        <div className="max-w-[480px] mx-auto px-4 h-12 flex items-center gap-2">
          <button
            onClick={() => setLocation(returnDest)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -ml-1"
          >
            <ChevronLeft size={16} />
            {source === 'today' ? "Today's Steps" : 'Next Steps'}
          </button>
          <span className="text-muted-foreground/30 mx-1">·</span>
          <span className="text-sm text-muted-foreground truncate">{companion.title}</span>
        </div>
      </header>

      {/* Reading content */}
      <main className="max-w-[480px] mx-auto">
        <DevotionalReading
          seriesTitle={companion.title}
          dayNumber={day}
          title={entry.title}
          greeting={entry.greeting}
          scripture={entry.scriptureReference}
          considerThis={entry.reflection}
          prayer={entry.prayer}
          nextStep={entry.nextStep}
          closing={entry.closing}
          memberName={firstName}
          actionButton={actionButton}
        />
      </main>

      {/* Save error */}
      {saveError && (
        <p className="text-center text-sm text-destructive px-5 mt-2">
          Could not save progress — tap Finished again.
        </p>
      )}

      <BottomNav />
    </div>
  );
}
