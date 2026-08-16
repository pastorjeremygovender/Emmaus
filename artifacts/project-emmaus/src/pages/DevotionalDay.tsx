/**
 * DevotionalDay — member reading page for a single devotional entry.
 *
 * Route: /devotional/:seriesId/day/:day
 *
 * Source-aware return (spec §4):
 *   Pass ?source=today      → "Back to Today's Steps" → /walk
 *   Pass ?source=nextSteps  → "Back to Next Steps"    → /journeys
 *   Default (no param)      → Today's Steps (daily devotionals default to Walk)
 *
 * Completion behaviour:
 *   - Tapping "Finished" marks the current day complete and shows JourneyCompletionPanel
 *     in-page; the member then taps the source-aware return button (or the back arrow).
 *   - The app never navigates forward to the next day on button press.
 *   - Day availability is calendar-derived on Walk.tsx; this page is read-only once
 *     a day is completed (replay / review mode).
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import { Loader2, ArrowLeft, Users, List } from 'lucide-react';
import { HearEmmausButton } from '@/components/emmaus/HearEmmausButton';
import { BottomNav } from '@/components/BottomNav';
import { DevotionalReading } from '@/components/DevotionalReading';
import { getDevotionalLabel } from '@/lib/step-label';
import { FavouriteButton } from '@/components/FavouriteButton';
import { EmmausCompletionCard } from '@/components/EmmausCompletionCard';
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
import { resolveNextEntry } from '@/lib/resolve-next-entry';
import { dismissBadge } from '@/lib/badge-api';
import { StudyTogetherSheet } from '@/components/StudyTogetherSheet';

// ─── Source-aware return helpers ──────────────────────────────────────────────

function resolveReturn(source: string | null, sourceId?: string | null): { path: string; label: string } {
  // Previous-days review — back returns to that series' previous-days list
  if (source === 'devotionalPrevious') {
    if (sourceId) return { path: `/devotional/${sourceId}/previous`, label: 'Previous Steps' };
    return { path: '/journeys?tab=devotionals', label: 'Discover' };
  }
  if (source === 'nextStepsDevotionals' || source === 'nextSteps')
    return { path: '/journeys?tab=devotionals', label: 'Discover' };
  if (source === 'nextStepsJourneys')
    return { path: '/journeys?tab=journeys', label: 'Back to Discover' };
  if (source === 'nextStepsSermons')
    return { path: '/journeys?tab=sermons', label: 'Back to Discover' };
  if (source === 'today' || source === 'walk')
    return { path: '/walk', label: "Back to Today's Steps" };
  // Fallback for deep links with no source — default to devotionals tab
  if (!source) return { path: '/journeys?tab=devotionals', label: 'Back to Discover' };
  return { path: '/walk', label: "Back to Today's Steps" };
}

export default function DevotionalDay() {
  const params = useParams<{ seriesId: string; day: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const seriesId = params.seriesId;
  const day = parseInt(params.day ?? '1', 10);

  // Read source/sourceId once on mount — query string doesn't change during the page lifetime
  const source   = new URLSearchParams(window.location.search).get('source');
  const sourceId = new URLSearchParams(window.location.search).get('sourceId');
  const { path: returnPath, label: returnLabel } = resolveReturn(source, sourceId);

  const [seriesData, setSeriesData] = useState<SeriesWithEntries | null>(null);
  const [progress, setProgress] = useState<DevotionalProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState(false);
  const [saveError, setSaveError] = useState(false);
  // In-page completion state — shown after a successful save, before the member
  // taps the return button. Prevents immediate auto-navigation.
  const [justCompleted, setJustCompleted]         = useState(false);
  const [showStudyTogether, setShowStudyTogether] = useState(false);

  const load = useCallback(async () => {
    if (!seriesId) return;
    const auth = user?.id ? { userId: user.id } : undefined;
    try {
      const [d, p] = await Promise.all([
        getSeriesWithEntries(seriesId, auth),
        getProgress(seriesId, auth),
      ]);
      setSeriesData(d);
      // Record history view (fire-and-forget)
      if (d?.title) {
        const { recordView } = await import('@/lib/history-api');
        recordView({
          contentType: 'devotional',
          contentId: seriesId,
          contentTitle: d.title,
          contentRoute: `/devotional/${seriesId}/day/${day}`,
        });
      }

      // Auto-start as a fallback if the member navigated here directly
      if (!p) {
        const started = await startSeries(seriesId, auth);
        setProgress(started);
      } else {
        setProgress(p);
      }
      // Clear UPDATED badge — member has opened the content (fire-and-forget).
      void dismissBadge('devotional', seriesId);
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

  // Restore to Today's Steps — clears hidden_from_today when the member opens
  // the content from Next Steps (or any other surface). Fire-and-forget; non-fatal.
  useEffect(() => {
    if (!seriesId || !user?.id) return;
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    fetch(`${base}/api/engagements/devotional/${encodeURIComponent(seriesId)}/unhide`, {
      method: 'POST', credentials: 'include',
    }).catch(() => {});
  }, [seriesId, user?.id]);

  // Derive entry/published list before the route-guard effect so TypeScript
  // can see them as stable values and they aren't in the temporal dead zone.
  const entry = seriesData?.entries.find(e => e.dayNumber === day);
  const publishedEntries = seriesData?.entries.filter(e => e.status === 'Published') ?? [];
  const totalEntries = publishedEntries.length;

  // Route guard — redirect instead of dead-ending when this day is unavailable.
  // Fires after loading completes; silently replaces history so Back works cleanly.
  useEffect(() => {
    if (!loading && (!seriesData || !entry)) {
      setLocation(returnPath, { replace: true });
    }
    // returnPath derives from the source URL param at mount — intentionally stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, seriesData, entry]);

  // This day has already been completed in a prior session — replay mode.
  const alreadyCompleted = progress?.completedDays?.includes(day) ?? false;

  /**
   * Handle "Finished" — marks the current day complete then shows the
   * JourneyCompletionPanel in-page. Never navigates forward to the next day.
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

  const devotionalReturnPath = `/devotional/${seriesId}/day/${day}`;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  // ── Not found / not available — redirect handled by useEffect above ─────────
  // The loading guard above already handles the loading state, so this is
  // only reached when loading is false. Omit !loading so TypeScript can
  // narrow seriesData and entry for the remainder of the component.
  if (!seriesData || !entry) return null;

  // ── Action button ──────────────────────────────────────────────────────────

  let actionButton: React.ReactNode;

  if (justCompleted || alreadyCompleted) {
    // Completed this session or returning to an already-completed day (replay)
    // Self-paced: next published entry is available immediately after completion.
    // resolveNextEntry enforces the platform rule: Continue only when a valid next item exists.
    const nextEntry = resolveNextEntry(seriesData.entries, day);
    const hasNextEntry = !!nextEntry;
    // Previous entries navigation — encode the back destination.
    const prevDaysUrl = `/devotional/${seriesId}/previous?source=${source ?? 'nextStepsDevotionals'}${sourceId ? `&sourceId=${sourceId}` : ''}`;
    const nextUrl = hasNextEntry
      ? `/devotional/${seriesId}/day/${nextEntry.dayNumber}?source=${source ?? 'nextStepsDevotionals'}${sourceId ? `&sourceId=${sourceId}` : ''}`
      : '';
    actionButton = (
      <EmmausCompletionCard
        heading="Devotional complete."
        subMessage={
          hasNextEntry
            ? 'Continue when you\'re ready.'
            : 'May the Lord continue His work in your heart today.'
        }
        onContinue={hasNextEntry ? () => setLocation(nextUrl) : undefined}
        continueLabel={hasNextEntry ? 'Continue to Next Devotional' : undefined}
        returnLabel={returnLabel}
        onReturn={() => { if (window.history.length > 1) window.history.back(); else setLocation(returnPath); }}
        previousDaysLabel="View Devotional Contents"
        onPreviousDays={justCompleted || alreadyCompleted ? () => setLocation(prevDaysUrl) : undefined}
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
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      {/* Sticky header — matches Walk step reader pattern */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">

          {/* Back — arrow only, no text label */}
          <button
            onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation(returnPath); }}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>

          {/* Centered series title + day label */}
          <div className="flex-1 min-w-0 text-center px-3">
            <div className="font-medium text-sm text-foreground truncate leading-tight">{seriesData.title}</div>
            <div className="text-[12px] text-muted-foreground">{getDevotionalLabel(entry)}</div>
          </div>

          {/* Right actions — icon-only */}
          <div className="flex items-center justify-end">
            <FavouriteButton
              contentType="devotional"
              contentId={seriesId!}
              contentTitle={seriesData.title}
              contentRoute={`/devotional/${seriesId}/day/1`}
              className="shrink-0"
            />
            {totalEntries > 1 && (
              <button
                onClick={() => setLocation(`/devotional/${seriesId}/previous?source=${source ?? 'nextStepsDevotionals'}${sourceId ? `&sourceId=${sourceId}` : ''}`)}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="All Devotionals"
                title="All Devotionals"
              >
                <List size={18} />
              </button>
            )}
            {user && (
              <button
                onClick={() => setShowStudyTogether(true)}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Study Together"
                title="Study Together"
              >
                <Users size={18} />
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Reading */}
      <DevotionalReading
        seriesTitle={seriesData.title}
        dayNumber={day}
        displayLabel={getDevotionalLabel(entry)}
        title={entry.title}
        greeting={entry.greeting ?? ''}
        scripture={entry.scriptureReference ?? ''}
        considerThis={entry.considerThis ?? ''}
        prayer={entry.prayer ?? ''}
        nextStep={entry.nextStep ?? ''}
        closing={entry.closing ?? ''}
        memberName={resolveDisplayName(user?.preferredName)}
        shareImageUrl={entry.shareImageUrl}
        returnPath={devotionalReturnPath}
        actionButton={actionButton}
        sharePayload={{
          title: seriesData.title,
          dayTitle: entry.title,
          scripture: entry.scriptureReference ?? undefined,
          greeting: entry.greeting ?? undefined,
          reflection: entry.considerThis ?? undefined,
          prayer: entry.prayer ?? undefined,
          nextStep: entry.nextStep ?? undefined,
          closing: entry.closing ?? undefined,
        }}
      />

      <BottomNav />

      {showStudyTogether && user && (
        <StudyTogetherSheet
          defaultName={seriesData.title}
          userId={user.id}
          contentId={seriesId}
          contentType="devotional"
          onClose={() => setShowStudyTogether(false)}
        />
      )}
    </div>
  );
}
