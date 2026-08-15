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

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { Loader2, ChevronLeft, Play, Users } from 'lucide-react';
import { HearEmmausButton } from '@/components/emmaus/HearEmmausButton';
import { BottomNav } from '@/components/BottomNav';
import { SermonCompanionReading } from '@/components/SermonCompanionReading';
import { FavouriteButton } from '@/components/FavouriteButton';
import { EmmausCompletionCard } from '@/components/EmmausCompletionCard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { resolveNextEntry } from '@/lib/resolve-next-entry';
import { dismissBadge } from '@/lib/badge-api';
import { setActiveSermonCompanionContext } from '@/lib/sermon-companion-context';
import { recordView } from '@/lib/history-api';
import { StudyTogetherSheet } from '@/components/StudyTogetherSheet';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ─── Source-aware return helpers ──────────────────────────────────────────────

function resolveReturn(source: string | null, sourceId?: string | null): { path: string; label: string } {
  if (source === 'sermonHome' && sourceId)
    return { path: `/sermon/${sourceId}`, label: "This Week's Sermon" };
  if (source === 'today' || source === 'walk')
    return { path: '/walk', label: "Back to Today's Steps" };
  if (source === 'nextStepsDevotionals')
    return { path: '/journeys?tab=devotionals', label: 'Back to Discover' };
  if (source === 'nextStepsJourneys')
    return { path: '/journeys?tab=journeys', label: 'Back to Discover' };
  // nextStepsSermons, nextSteps (legacy), or unknown → Sermon Companions tab
  return { path: '/journeys?tab=sermons', label: 'Back to Discover' };
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
  /** Timestamped YouTube URL linking to the sermon moment this entry reflects on. */
  sermonLink?: string | null;
  /** Optional share image — object-storage path. Members see "Take this with you" card. */
  shareImageUrl?: string | null;
}

interface SCProgress {
  currentDay: number;
  completedDays: number[];
}

interface SermonMeta {
  sermonId: string;
  hasAudio: boolean;
  youtubeUrl: string;
  scriptureReference?: string;
}

interface MemberCompanion {
  id: string;
  title: string;
  numberOfDays: number;
  entries: SCEntry[];
  progress: SCProgress | null;
  sermon?: SermonMeta | null;
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

// ─── Timestamp parsing ───────────────────────────────────────────────────────

/**
 * Parse a `sermonLink` value into a displayable MM:SS string and an optional href.
 *
 * Handles two formats stored by the generation pipeline:
 *   • YouTube URL with ?t=Ns  → href = full URL, mmss = "M:SS"
 *   • Plain "M:SS" string     → href = null (no YouTube URL available)
 */
function parseSermonLinkTimestamp(sermonLink: string): {
  href: string | null;
  mmss: string | null;
  seekSeconds: number | null;
} {
  if (!sermonLink) return { href: null, mmss: null, seekSeconds: null };

  // YouTube URL with ?t= parameter
  if (sermonLink.startsWith('http')) {
    try {
      const url = new URL(sermonLink);
      const tParam = url.searchParams.get('t');
      if (tParam) {
        const secs = parseInt(tParam.replace(/s$/i, ''), 10);
        if (!isNaN(secs) && secs >= 0) {
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          return { href: sermonLink, mmss: `${m}:${String(s).padStart(2, '0')}`, seekSeconds: secs };
        }
      }
    } catch { /* malformed URL — fall through */ }
    return { href: sermonLink, mmss: null, seekSeconds: null };
  }

  // Plain MM:SS format (audio-first pipeline, no YouTube URL)
  if (/^\d+:\d{2}$/.test(sermonLink.trim())) {
    const [mStr, sStr] = sermonLink.trim().split(':');
    const seekSeconds = parseInt(mStr, 10) * 60 + parseInt(sStr, 10);
    return { href: null, mmss: sermonLink.trim(), seekSeconds };
  }

  return { href: null, mmss: null, seekSeconds: null };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SermonCompanionReader() {
  const params = useParams<{ id: string; day: string }>();
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const companionId = params.id ?? '';
  const day = parseInt(params.day ?? '1', 10);

  // Read source/sourceId once on mount — query string doesn't change during the page lifetime
  const source   = new URLSearchParams(window.location.search).get('source');
  const sourceId = new URLSearchParams(window.location.search).get('sourceId');

  const { path: returnDest, label: returnLabel } = resolveReturn(source, sourceId);

  const [companion, setCompanion]       = useState<MemberCompanion | null>(null);
  const [progress, setProgress]         = useState<SCProgress | null>(null);
  const [loading, setLoading]           = useState(true);
  const [loadError, setLoadError]       = useState(false);
  const [completing, setCompleting]     = useState(false);
  const [saveError, setSaveError]       = useState(false);
  const [justCompleted, setJustCompleted]         = useState(false);
  const [showStudyTogether, setShowStudyTogether] = useState(false);

  // Inline audio player for audio-first companions (no YouTube URL)
  const audioRef                          = useRef<HTMLAudioElement>(null);
  const [audioUrl, setAudioUrl]           = useState<string | null>(null);
  const [audioLoading, setAudioLoading]   = useState(false);

  const handleSermonTimestampClick = useCallback(async (seekSeconds: number) => {
    const sermonId = companion?.sermon?.sermonId;
    if (!sermonId) return;
    if (audioUrl) {
      // Audio already loaded — seek and play
      if (audioRef.current) {
        audioRef.current.currentTime = seekSeconds;
        audioRef.current.play().catch(() => {});
      }
      return;
    }
    setAudioLoading(true);
    try {
      const res = await fetch(`${BASE}/api/sermons/${sermonId}/audio-url`, { credentials: 'include' });
      if (!res.ok) throw new Error('unavailable');
      const { url } = await res.json();
      setAudioUrl(url);
      // Seek happens via onLoadedMetadata on the audio element
    } catch {
      // Non-fatal — chip remains visible but player won't open
    } finally {
      setAudioLoading(false);
    }
  }, [companion?.sermon?.sermonId, audioUrl]);

  const load = useCallback(async () => {
    if (!companionId || !user?.id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const data = await loadMemberCompanion(companionId);
      setCompanion(data);

      // Broadcast sermon context so the floating Ask Emmaus button can pre-fill
      // the current sermon when the member asks a question from the reader.
      setActiveSermonCompanionContext({
        companionId,
        sermonId:           data.sermon?.sermonId,
        sermonTitle:        data.title,
        scriptureReference: data.sermon?.scriptureReference,
      });

      // Record history view (fire-and-forget)
      recordView({
        contentType: 'sermon-companion',
        contentId: companionId,
        contentTitle: data.title,
        contentRoute: `/sermon-companion/${companionId}/day/${day}`,
      });

      if (!data.progress) {
        // Auto-start on first visit — no confirmation needed, member is already reading
        const started = await startCompanion(companionId);
        setProgress(started);
      } else {
        setProgress(data.progress);
      }
      // Clear UPDATED badge — member has opened the content (fire-and-forget).
      void dismissBadge('companion', companionId);
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

  // Clear sermon context when leaving the reader page
  useEffect(() => {
    return () => setActiveSermonCompanionContext(null);
  }, []);

  // Restore to Today's Steps — clears hidden_from_today when the member opens
  // the content from Next Steps (or any other surface). Fire-and-forget; non-fatal.
  useEffect(() => {
    if (!companionId || !user?.id) return;
    fetch(`${BASE}/api/engagements/sermon-companion/${encodeURIComponent(companionId)}/unhide`, {
      method: 'POST', credentials: 'include',
    }).catch(() => {});
  }, [companionId, user?.id]);

  // Route protection — redirect when the requested day is unavailable:
  //   • day exceeds the final published day (e.g. /day/6 on a 5-day companion)
  //   • entry doesn't exist in the companion's published content
  // Uses replace so Back doesn't loop the user back into the unavailable day.
  useEffect(() => {
    if (!companion) return;
    const publishedDays = companion.entries
      .filter(e => e.status === 'Published')
      .map(e => e.dayNumber);
    if (publishedDays.length === 0) return;
    const maxPublishedDay = Math.max(...publishedDays);
    const entry = companion.entries.find(e => e.dayNumber === day);
    if (day > maxPublishedDay || !entry) {
      setLocation(returnDest, { replace: true });
    }
  // returnDest is computed once from the initial query string — stable ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion, day]);

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

  const rawName = user?.preferredName?.trim();
  const firstName = (rawName && !rawName.includes('@')) ? rawName.split(' ')[0] : undefined;
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
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center gap-4 px-6 text-center pb-page-safe">
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

  // Unavailable day — redirect handled by the route-protection useEffect above.
  if (!entry) return null;

  // ── Main reading view ──

  // Previous days URL — encode back destination so the list knows where to return.
  const prevDaysFrom = source ?? 'nextStepsSermons';
  const prevDaysUrl  = `/sermon-companion/${companionId}/previous?from=${prevDaysFrom}`;
  const hasPreviousDays = day > 1;

  // Primary action button shown inside DevotionalReading
  let actionButton: React.ReactNode;
  if (justCompleted) {
    // Self-paced: next published entry is immediately available after completion.
    // resolveNextEntry enforces the platform rule: Continue only when a valid next item exists.
    const nextEntry = resolveNextEntry(companion.entries, day);
    const hasNextEntry = !!nextEntry;
    const nextUrl = hasNextEntry
      ? `/sermon-companion/${companionId}/day/${nextEntry.dayNumber}?source=${source ?? 'nextStepsSermons'}${sourceId ? `&sourceId=${sourceId}` : ''}`
      : '';
    actionButton = (
      <EmmausCompletionCard
        heading={`Step ${day} complete.`}
        subMessage={
          hasNextEntry
            ? 'The next reflection is available when you\'re ready.'
            : 'May the Lord continue His work in your heart today.'
        }
        onContinue={hasNextEntry ? () => setLocation(nextUrl) : undefined}
        continueLabel={hasNextEntry ? 'Continue to Next Reflection' : undefined}
        returnLabel={returnLabel}
        onReturn={() => { if (window.history.length > 1) window.history.back(); else setLocation(returnDest); }}
        previousDaysLabel="View Previous Reflections →"
        onPreviousDays={hasPreviousDays ? () => setLocation(prevDaysUrl) : undefined}
      />
    );
  } else if (isAlreadyCompleted) {
    // Replay mode — member came from Previous Reflections; no secondary link needed
    actionButton = (
      <EmmausCompletionCard
        heading={`Step ${day} complete.`}
        subMessage="May the Lord continue His work in your heart today."
        returnLabel={returnLabel}
        onReturn={() => { if (window.history.length > 1) window.history.back(); else setLocation(returnDest); }}
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
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      {/* Back navigation */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/40">
        <div className="max-w-[480px] mx-auto px-4 h-12 flex items-center gap-2">
          <button
            onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation(returnDest); }}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors -ml-1 shrink-0"
          >
            <ChevronLeft size={16} />
            {source === 'today' || source === 'walk' ? "Today's Steps" : source === 'sermonHome' ? "This Week's Sermon" : 'Discover'}
          </button>
          <span className="text-muted-foreground/30 mx-1 shrink-0">·</span>
          <span className="text-sm text-muted-foreground truncate flex-1">{companion.title}</span>
          <FavouriteButton
            contentType="sermon-companion"
            contentId={companionId}
            contentTitle={companion.title}
            contentRoute={`/sermon-companion/${companionId}/day/1`}
            className="shrink-0"
          />
          {user && (
            <button
              onClick={() => setShowStudyTogether(true)}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
              aria-label="Study Together"
              title="Study Together"
            >
              <Users size={16} />
            </button>
          )}
        </div>
      </header>

      {/* Sermon timestamp chip — "From this week's sermon · MM:SS" */}
      {entry.sermonLink && (() => {
        const { href, mmss, seekSeconds } = parseSermonLinkTimestamp(entry.sermonLink ?? '');
        if (!href && !mmss) return null;
        const label = mmss
          ? `From this week's sermon · ${mmss}`
          : "From this week's sermon";
        const hasAudio = companion.sermon?.hasAudio && !companion.sermon?.youtubeUrl;
        return (
          <div className="max-w-[480px] mx-auto px-5 pt-4 pb-1 space-y-2">
            {href ? (
              // YouTube companion — deep link to that moment
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-[13px] font-medium hover:bg-teal-100 transition-colors"
              >
                <Play size={11} className="shrink-0 fill-teal-700" />
                {label}
              </a>
            ) : hasAudio && seekSeconds !== null ? (
              // Audio-only companion — seek the inline player to the right moment
              <button
                onClick={() => handleSermonTimestampClick(seekSeconds)}
                disabled={audioLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-teal-50 text-teal-700 text-[13px] font-medium hover:bg-teal-100 transition-colors disabled:opacity-60"
              >
                <Play size={11} className="shrink-0 fill-teal-700" />
                {audioLoading ? 'Loading…' : label}
              </button>
            ) : (
              // No playable media — display only
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-[13px] font-medium">
                <Play size={11} className="shrink-0 fill-gray-600" />
                {label}
              </span>
            )}
            {/* Inline audio player — appears once the signed URL is loaded */}
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                className="w-full rounded-lg"
                onLoadedMetadata={() => {
                  if (audioRef.current && seekSeconds !== null) {
                    audioRef.current.currentTime = seekSeconds;
                    audioRef.current.play().catch(() => {});
                  }
                }}
              />
            )}
          </div>
        );
      })()}

      {/* Reading content */}
      <main className="max-w-[480px] mx-auto">
        <SermonCompanionReading
          companionTitle={companion.title}
          stepNumber={day}
          title={entry.title}
          greeting={entry.greeting}
          scripture={entry.scriptureReference}
          considerThis={entry.reflection}
          prayer={entry.prayer}
          nextStep={entry.nextStep}
          closing={entry.closing}
          memberName={firstName}
          shareImageUrl={entry.shareImageUrl}
          actionButton={actionButton}
          sharePayload={{
            title: companion.title,
            dayTitle: entry.title,
            scripture: entry.scriptureReference ?? undefined,
            greeting: entry.greeting ?? undefined,
            reflection: entry.reflection ?? undefined,
            prayer: entry.prayer ?? undefined,
            nextStep: entry.nextStep ?? undefined,
            closing: entry.closing ?? undefined,
          }}
        />
      </main>

      {/* Save error */}
      {saveError && (
        <p className="text-center text-sm text-destructive px-5 mt-2">
          Could not save progress — tap Finished again.
        </p>
      )}

      <BottomNav />

      {showStudyTogether && user && (
        <StudyTogetherSheet
          defaultName={companion.title}
          userId={user.id}
          contentId={companionId}
          contentType="sermon-companion"
          onClose={() => setShowStudyTogether(false)}
        />
      )}
    </div>
  );
}
