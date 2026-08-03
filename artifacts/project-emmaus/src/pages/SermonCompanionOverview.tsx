/**
 * SermonCompanionOverview — landing page for a Sermon Companion.
 *
 * Route: /sermon-companion/:id/overview?source=...
 *
 * Shown when the user taps the discovery card in Next Steps OR
 * the completed card in Today's Steps. Never opens the step reader directly.
 *
 * Source-aware back:
 *   ?source=today / walk       → /walk       (Today's Steps)
 *   ?source=nextStepsSermons   → /journeys?tab=sermons  (default)
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  ArrowLeft, BookOpen, Calendar, CheckCircle2, Circle,
  Loader2, AlertCircle, RefreshCw,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { useAuth } from '@/contexts/AuthContext';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ─── Types ────────────────────────────────────────────────────────────────────

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
  publishedAt?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseTitle(full: string): { sermonTitle: string; subtitle: string | null } {
  if (full.includes(': ')) {
    const idx = full.indexOf(': ');
    return {
      sermonTitle: full.slice(0, idx).trim(),
      subtitle: full.slice(idx + 2).trim() || null,
    };
  }
  return { sermonTitle: full.trim(), subtitle: null };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function resolveBack(source: string | null): { path: string; label: string } {
  if (source === 'today' || source === 'walk')
    return { path: '/walk', label: "Today's Steps" };
  return { path: '/journeys?tab=sermons', label: 'Sermon Companions' };
}

// ─── Step row ─────────────────────────────────────────────────────────────────

function StepRow({
  stepNumber, title, scripture, status, onClick,
}: {
  stepNumber: number;
  title: string;
  scripture?: string;
  status: 'completed' | 'current' | 'upcoming';
  onClick?: () => void;
}) {
  const isClickable = status !== 'upcoming' && !!onClick;
  return (
    <button
      type="button"
      disabled={!isClickable}
      onClick={isClickable ? onClick : undefined}
      className={`w-full flex items-start gap-3 px-4 py-3.5 rounded-xl transition-colors text-left ${
        isClickable
          ? 'hover:bg-gray-50 active:bg-gray-100 cursor-pointer'
          : 'cursor-default'
      }`}
    >
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        {status === 'completed' ? (
          <CheckCircle2 size={18} className="text-teal-500" />
        ) : status === 'current' ? (
          <div className="w-[18px] h-[18px] rounded-full border-2 border-teal-500 bg-teal-50 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-teal-500" />
          </div>
        ) : (
          <Circle size={18} className="text-gray-300" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-[11px] font-semibold uppercase tracking-wide mb-0.5 ${
          status === 'upcoming' ? 'text-gray-400' : 'text-teal-600'
        }`}>
          Step {stepNumber}
        </p>
        <p className={`text-[14px] font-medium leading-snug ${
          status === 'upcoming' ? 'text-gray-400' : 'text-gray-800'
        }`}>
          {title || `Step ${stepNumber}`}
        </p>
        {scripture && status !== 'upcoming' && (
          <p className="text-[12px] text-gray-400 mt-0.5 flex items-center gap-1">
            <BookOpen size={11} /> {scripture}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SermonCompanionOverview() {
  const params                    = useParams<{ id: string }>();
  const [, setLocation]           = useLocation();
  const { user }                  = useAuth();

  const companionId               = params.id ?? '';
  const source                    = new URLSearchParams(window.location.search).get('source') ?? 'nextStepsSermons';
  const { path: backPath, label: backLabel } = resolveBack(source);

  const [companion, setCompanion] = useState<MemberCompanion | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [starting, setStarting]   = useState(false);

  const load = useCallback(async () => {
    if (!companionId || !user?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE}/api/sermon-companions/${companionId}/member`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCompanion(await res.json());
    } catch {
      setError("We couldn't load this companion.");
    } finally {
      setLoading(false);
    }
  }, [companionId, user?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const entries = (companion?.entries ?? [])
    .filter(e => e.status === 'Published')
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const totalSteps      = entries.length || companion?.numberOfDays || 5;
  const completedSet    = new Set(companion?.progress?.completedDays ?? []);
  const currentDay      = companion?.progress?.currentDay ?? 1;
  const isStarted       = companion?.progress !== null && companion?.progress !== undefined;
  const isComplete      = isStarted && completedSet.size >= totalSteps;
  const completedCount  = completedSet.size;

  const { sermonTitle, subtitle } = parseTitle(companion?.title ?? '');

  const ctaLabel = isComplete
    ? 'Review Companion'
    : isStarted
      ? 'Continue Companion'
      : 'Start Companion';

  const handleCTA = async () => {
    if (isStarted) {
      // Navigate to the next/current step
      const targetDay = isComplete ? 1 : currentDay;
      setLocation(`/sermon-companion/${companionId}/day/${targetDay}?source=${source}`);
      return;
    }
    // Start the companion for the first time
    setStarting(true);
    try {
      await fetch(`${BASE}/api/sermon-companions/${companionId}/progress/start`, {
        method: 'POST',
        credentials: 'include',
      });
      // Unhide from Today's Steps so it appears there
      fetch(
        `${BASE}/api/engagements/sermon-companion/${encodeURIComponent(companionId)}/unhide`,
        { method: 'POST', credentials: 'include' }
      ).catch(() => {});
      setLocation(`/sermon-companion/${companionId}/day/1?source=${source}`);
    } catch {
      setStarting(false);
      setError('Could not start companion. Please try again.');
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col pb-page-safe">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation(backPath)}
            className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <p className="text-[11px] font-semibold tracking-widest text-teal-600 uppercase">
            THIS WEEK'S SERMON
          </p>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error || !companion) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col pb-page-safe">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation(backPath)}
            className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <p className="text-[11px] font-semibold tracking-widest text-teal-600 uppercase">
            THIS WEEK'S SERMON
          </p>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 px-6 text-center max-w-xs">
            <AlertCircle size={28} className="text-gray-300" />
            <p className="text-[15px] font-medium text-gray-700">{error || 'Companion not found.'}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setLocation(backPath)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50"
              >
                <ArrowLeft size={13} /> {backLabel}
              </button>
              <button
                onClick={load}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-600 text-white text-[13px] hover:bg-teal-700"
              >
                <RefreshCw size={13} /> Try Again
              </button>
            </div>
          </div>
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Full render ───────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setLocation(backPath)}
          className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          aria-label={`Back to ${backLabel}`}
        >
          <ArrowLeft size={18} />
        </button>
        <p className="text-[11px] font-semibold tracking-widest text-teal-600 uppercase flex-1 truncate">
          THIS WEEK'S SERMON
        </p>
      </header>

      <main className="px-5 pt-6 pb-10 max-w-[480px] mx-auto space-y-6">

        {/* ── Title block ─────────────────────────────────────────────── */}
        <div className="space-y-1.5">
          <h1 className="text-[22px] font-bold text-gray-900 leading-tight">
            {sermonTitle || companion.title}
          </h1>
          {subtitle && (
            <p className="text-[15px] text-teal-700 font-medium">{subtitle}</p>
          )}
          {companion.publishedAt && (
            <p className="text-[13px] text-gray-400 flex items-center gap-1.5">
              <Calendar size={13} /> {formatDate(companion.publishedAt)}
            </p>
          )}
        </div>

        {/* ── Description ─────────────────────────────────────────────── */}
        <p className="text-[14px] text-gray-600 leading-relaxed">
          A {totalSteps}-step companion based on this week's sermon — designed to help you reflect, respond and live it out.
        </p>

        {/* ── Progress if started ─────────────────────────────────────── */}
        {isStarted && (
          <div className={`rounded-2xl border px-4 py-3 ${
            isComplete
              ? 'bg-teal-50 border-teal-200'
              : 'bg-gray-50 border-gray-100'
          }`}>
            {isComplete ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-teal-500 flex-shrink-0" />
                <p className="text-[13px] font-medium text-teal-700">
                  All {totalSteps} steps completed
                </p>
              </div>
            ) : (
              <p className="text-[13px] text-gray-600">
                <span className="font-semibold">{completedCount} of {totalSteps}</span> steps completed
                {currentDay <= totalSteps && (
                  <span className="text-gray-400"> · Next: Step {currentDay}</span>
                )}
              </p>
            )}
          </div>
        )}

        {/* ── CTA button ──────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleCTA}
          disabled={starting}
          className="w-full h-12 rounded-2xl bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-[15px] font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {starting
            ? <><Loader2 size={15} className="animate-spin" /> Starting…</>
            : ctaLabel
          }
        </button>

        {/* ── Step list ───────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2 px-1">
            The {totalSteps} Steps
          </p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-gray-100">
            {entries.length > 0 ? (
              entries.map(entry => {
                const isCompleted = completedSet.has(entry.dayNumber);
                const isCurrent   = isStarted && !isComplete && entry.dayNumber === currentDay;
                const stepStatus  = isCompleted ? 'completed' : isCurrent ? 'current' : 'upcoming';

                return (
                  <StepRow
                    key={entry.id}
                    stepNumber={entry.dayNumber}
                    title={entry.title}
                    scripture={entry.scriptureReference || undefined}
                    status={stepStatus}
                    onClick={
                      isCompleted || isCurrent
                        ? () => setLocation(`/sermon-companion/${companionId}/day/${entry.dayNumber}?source=${source}`)
                        : undefined
                    }
                  />
                );
              })
            ) : (
              // Placeholder rows when entries aren't loaded yet
              Array.from({ length: totalSteps }, (_, i) => (
                <StepRow
                  key={i}
                  stepNumber={i + 1}
                  title=""
                  status="upcoming"
                />
              ))
            )}
          </div>
        </div>

        {/* ── View Previous Steps ─────────────────────────────────────── */}
        {isStarted && completedCount > 0 && (
          <button
            type="button"
            onClick={() => setLocation(`/sermon-companion/${companionId}/previous?from=${source}`)}
            className="w-full text-center text-[13px] text-gray-500 hover:text-gray-800 transition-colors"
          >
            View Previous Steps →
          </button>
        )}

      </main>

      <BottomNav />
    </div>
  );
}
