/**
 * SermonCompanionReader — member reading page for a single sermon companion day.
 *
 * Route: /sermon-companion/:id/day/:day
 *
 * Sermon companions are AI-generated 5-day devotionals linked to a specific sermon.
 * Progress is tracked via the sermon_companion_progress system (separate from
 * journey progress). The page auto-starts a progress record on first visit.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { Loader2, ChevronLeft, CheckCircle2 } from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { DevotionalReading } from '@/components/DevotionalReading';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

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
          This sermon companion is not available.
        </p>
        <Button variant="outline" size="sm" onClick={() => setLocation('/journeys')}>
          Back to Next Steps
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
        <Button variant="outline" size="sm" onClick={() => setLocation('/journeys')}>
          Back to Next Steps
        </Button>
        <BottomNav />
      </div>
    );
  }

  // ── Main reading view ──

  // Primary action button shown inside DevotionalReading
  const actionButton = isAlreadyCompleted ? (
    <Button
      variant="outline"
      className="w-full rounded-2xl"
      onClick={() => setLocation('/journeys')}
    >
      Back to Next Steps
    </Button>
  ) : (
    <Button
      className="w-full rounded-2xl"
      onClick={handleFinish}
      disabled={completing || justCompleted}
    >
      {completing
        ? <><Loader2 size={16} className="animate-spin mr-2" />Saving…</>
        : justCompleted
          ? <><CheckCircle2 size={16} className="mr-2" />Completed</>
          : 'Finished'
      }
    </Button>
  );

  return (
    <div className="min-h-[100dvh] bg-background pb-28">
      {/* Back navigation */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/40">
        <div className="max-w-[480px] mx-auto px-4 h-12 flex items-center gap-2">
          <button
            onClick={() => setLocation('/journeys')}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -ml-1"
          >
            <ChevronLeft size={16} />
            Next Steps
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

      {/* Completion footer */}
      {justCompleted && (
        <div className="max-w-[480px] mx-auto px-5 mt-6 mb-4">
          <div className="bg-teal-50 border border-teal-200 rounded-2xl px-5 py-4 text-center space-y-3">
            <CheckCircle2 size={20} className="text-teal-600 mx-auto" />
            <p className="text-sm font-medium text-teal-800">Day {day} complete</p>
            {day < companion.numberOfDays ? (
              <p className="text-xs text-teal-600">
                Day {day + 1} will be here tomorrow.
              </p>
            ) : (
              <p className="text-xs text-teal-600">
                You've completed all {companion.numberOfDays} days. Well done.
              </p>
            )}
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-teal-300 text-teal-700 hover:bg-teal-100"
              onClick={() => setLocation('/journeys')}
            >
              Back to Next Steps
            </Button>
          </div>
        </div>
      )}

      <BottomNav />
    </div>
  );
}
