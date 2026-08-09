/**
 * SermonCompanionOverview — landing page for a Sermon Companion.
 *
 * Route: /sermon-companion/:id/overview?source=...
 *
 * Sections (per spec):
 *   1. Sermon Identity  — speaker, date, scripture, theme
 *   2. Introduction     — personalised from sermon summary (or generic fallback)
 *   3. Listen / Watch / Read  — conditional action row
 *   4. Progress card    — "2 of 5 Steps Completed · Next: Step 3 — Title"
 *   5. CTA button
 *   6. Step list        — all steps tappable once started
 *   7. Related Resources — Ask Emmaus, Bible reader link
 *
 * Source-aware back:
 *   ?source=today / walk       → /walk
 *   ?source=nextStepsSermons   → /journeys?tab=sermons  (default)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  ArrowLeft, BookOpen, Calendar, CheckCircle2, Circle, Play,
  Youtube, FileText, User, Hash, Loader2, AlertCircle, RefreshCw,
  MessageSquare, X, ChevronRight,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { FavouriteButton } from '@/components/FavouriteButton';
import { useAuth } from '@/contexts/AuthContext';
import {
  setActiveSermonCompanionContext,
} from '@/lib/sermon-companion-context';
import { recordView } from '@/lib/history-api';
import {
  setPendingContext,
  setReturnDestination,
  sourceSectionFromPath,
} from '@/lib/emmaus-pending';
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

// ─── Types ────────────────────────────────────────────────────────────────────

interface SermonMeta {
  sermonId: string;
  speaker: string;
  sermonDate: string;
  scriptureReference: string;
  mainTheme: string;
  summary: string;
  series: string;
  youtubeUrl: string;
  hasAudio: boolean;
  hasTranscript: boolean;
}

interface SCEntry {
  id: string;
  dayNumber: number;
  title: string;
  scriptureReference: string;
  status: string;
  /** Timestamped YouTube URL or plain MM:SS string. */
  sermonLink?: string | null;
}

interface SCProgress {
  currentDay: number;
  completedDays: number[];
}

interface MemberCompanion {
  id: string;
  title: string;
  /** Admin-authored companion-level introduction (from sermon_companion.description). */
  description: string;
  numberOfDays: number;
  entries: SCEntry[];
  progress: SCProgress | null;
  publishedAt?: string | null;
  sermon?: SermonMeta | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

/** Extract display label from a sermonLink value (YouTube URL with ?t= or plain MM:SS). */
function sermonLinkLabel(sermonLink?: string | null): string | null {
  if (!sermonLink) return null;
  if (sermonLink.startsWith('http')) {
    try {
      const t = new URL(sermonLink).searchParams.get('t');
      if (t) {
        const secs = parseInt(t.replace(/s$/i, ''), 10);
        if (!isNaN(secs) && secs >= 0) {
          const m = Math.floor(secs / 60);
          const s = secs % 60;
          return `${m}:${String(s).padStart(2, '0')}`;
        }
      }
    } catch { /* ignore */ }
    return null;
  }
  if (/^\d+:\d{2}$/.test(sermonLink.trim())) return sermonLink.trim();
  return null;
}
/**
 * Extract a playback timestamp (seconds) from a YouTube-style URL or a plain
 * "MM:SS" / "H:MM:SS" string stored in sermonLink.
 * Returns null if no timestamp can be parsed.
 */
function parseSermonLinkTimestamp(
  link: string | undefined,
): { seconds: number; display: string } | null {
  if (!link) return null;

  // ?t=1122 or &t=1122
  const tParam = link.match(/[?&]t=(\d+)/);
  if (tParam) {
    const secs = parseInt(tParam[1], 10);
    if (!isNaN(secs)) {
      const m = Math.floor(secs / 60);
      const s = secs % 60;
      return { seconds: secs, display: `${m}:${s.toString().padStart(2, '0')}` };
    }
  }

  // Standalone "MM:SS" or "H:MM:SS" string
  const hhmmss = link.match(/^(\d+):(\d{2}):(\d{2})$/);
  if (hhmmss) {
    const secs = parseInt(hhmmss[1], 10) * 3600
      + parseInt(hhmmss[2], 10) * 60
      + parseInt(hhmmss[3], 10);
    return { seconds: secs, display: link };
  }
  const mmss = link.match(/^(\d+):(\d{2})$/);
  if (mmss) {
    const secs = parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
    return { seconds: secs, display: link };
  }

  return null;
}

// ─── StepRow ──────────────────────────────────────────────────────────────────

function StepRow({
  stepNumber, title, scripture, sermonLink, status, onClick,
}: {
  stepNumber: number;
  title: string;
  scripture?: string;
  sermonLink?: string | null;
  status: 'completed' | 'current' | 'upcoming';
  onClick?: () => void;
}) {
  const ts = parseSermonLinkTimestamp(sermonLink ?? undefined);

  return (
    <button
      type="button"
      onClick={onClick ?? undefined}
      disabled={!onClick}
      className={[
        'w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors',
        onClick
          ? 'hover:bg-primary/5 active:bg-primary/10 cursor-pointer'
          : 'cursor-default opacity-60',
      ].join(' ')}
    >
      {/* Status icon */}
      <div className="flex-shrink-0 mt-0.5">
        {status === 'completed' ? (
          <CheckCircle2 size={18} className="text-primary" />
        ) : status === 'current' ? (
          <div className="w-[18px] h-[18px] rounded-full border-2 border-primary bg-primary/10 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-primary" />
          </div>
        ) : (
          <Circle size={18} className="text-muted-foreground/40" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={[
          'text-[11px] font-semibold uppercase tracking-wide mb-0.5',
          status === 'upcoming' ? 'text-muted-foreground' : 'text-primary',
        ].join(' ')}>
          Step {stepNumber}
        </p>
        <p className={[
          'text-[14px] font-medium leading-snug',
          status === 'upcoming' ? 'text-muted-foreground' : 'text-foreground',
        ].join(' ')}>
          {title || `Step ${stepNumber}`}
        </p>
        {scripture && (
          <p className="text-[12px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <BookOpen size={10} className="shrink-0" /> {scripture}
          </p>
        )}
        {ts && status !== 'upcoming' && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">
            From this week's sermon · {ts.display}
          </p>
        )}
      </div>

      {onClick && (
        <ChevronRight size={14} className="text-muted-foreground shrink-0 mt-1" />
      )}
    </button>
  );
}

// ─── TranscriptModal ──────────────────────────────────────────────────────────

function TranscriptModal({
  companionId,
  onClose,
}: {
  companionId: string;
  onClose: () => void;
}) {
  const [text, setText]     = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr]       = useState('');

  useEffect(() => {
    fetch(`${BASE}/api/sermon-companions/${companionId}/transcript`, {
      credentials: 'include',
    })
      .then(r => { if (!r.ok) throw new Error('unavailable'); return r.json(); })
      .then(d => setText(d.transcript ?? ''))
      .catch(() => setErr('Transcript not available.'))
      .finally(() => setLoading(false));
  }, [companionId]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 flex items-end"
      onClick={onClose}
    >
      <div
        className="w-full bg-background rounded-t-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 shrink-0 border-b border-border">
          <p className="text-[15px] font-semibold">Sermon Transcript</p>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground"
          >
            <X size={18} />
          </button>
        </div>
        {/* Content */}
        <div className="overflow-y-auto px-5 py-4 flex-1">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 size={20} className="animate-spin text-muted-foreground" />
            </div>
          ) : err ? (
            <p className="text-[14px] text-muted-foreground text-center py-8">{err}</p>
          ) : (
            <p className="text-[14px] leading-relaxed text-foreground whitespace-pre-wrap">
              {text}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SermonCompanionOverview() {
  const params        = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user }      = useAuth();

  const companionId   = params.id ?? '';
  const source        = new URLSearchParams(window.location.search).get('source') ?? 'nextStepsSermons';
  const { path: backPath, label: backLabel } = resolveBack(source);

  const [companion, setCompanion] = useState<MemberCompanion | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [starting, setStarting]   = useState(false);

  // Listen inline player
  const [audioUrl, setAudioUrl]     = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Transcript modal
  const [showTranscript, setShowTranscript] = useState(false);

  // §1 — Always start at the top when the companion changes
  useEffect(() => { window.scrollTo(0, 0); }, [companionId]);

  // ── Data load ─────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!companionId || !user?.id) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BASE}/api/sermon-companions/${companionId}/member`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MemberCompanion = await res.json();
      setCompanion(data);

      // Record history view (fire-and-forget)
      recordView({
        contentType: 'sermon-companion',
        contentId: companionId,
        contentTitle: data.title,
        contentRoute: `/sermon-companion/${companionId}/overview`,
      });

      // Broadcast sermon context to the floating Ask Emmaus button
      const { sermonTitle } = parseTitle(data.title);
      setActiveSermonCompanionContext({
        companionId,
        sermonId:           data.sermon?.sermonId,
        sermonTitle:        data.sermon?.summary ? sermonTitle : data.title,
        scriptureReference: data.sermon?.scriptureReference,
      });
    } catch {
      setError("We couldn't load this companion.");
    } finally {
      setLoading(false);
    }
  }, [companionId, user?.id]);

  useEffect(() => { load(); }, [load]);

  // Clear context when leaving the page
  useEffect(() => {
    return () => setActiveSermonCompanionContext(null);
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────

  const entries      = (companion?.entries ?? [])
    .filter(e => e.status === 'Published')
    .sort((a, b) => a.dayNumber - b.dayNumber);

  const totalSteps      = entries.length || companion?.numberOfDays || 5;
  const completedSet    = new Set(companion?.progress?.completedDays ?? []);
  const currentDay      = companion?.progress?.currentDay ?? 1;
  const isStarted       = companion?.progress !== null && companion?.progress !== undefined;
  const isComplete      = isStarted && completedSet.size >= totalSteps;
  const completedCount  = completedSet.size;

  const { sermonTitle, subtitle } = parseTitle(companion?.title ?? '');
  const sermon                    = companion?.sermon ?? null;

  // §3 — Companion intro: admin-written description > sermon summary > generic fallback
  const introText = companion?.description?.trim() || sermon?.summary?.trim() || null;

  // §6 — Related scriptures: unique non-empty references across all published entries
  const relatedScriptures = Array.from(
    new Set(
      entries
        .map(e => e.scriptureReference?.trim())
        .filter((s): s is string => !!s),
    ),
  );

  const nextEntry = !isComplete
    ? entries.find(e => e.dayNumber === currentDay)
    : null;

  const ctaLabel = isComplete ? 'Review Companion'
    : isStarted ? 'Continue Companion'
    : 'Start Companion';

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleCTA = async () => {
    if (isStarted) {
      const targetDay = isComplete ? 1 : currentDay;
      setLocation(`/sermon-companion/${companionId}/day/${targetDay}?source=${source}`);
      return;
    }
    setStarting(true);
    try {
      await fetch(`${BASE}/api/sermon-companions/${companionId}/progress/start`, {
        method: 'POST', credentials: 'include',
      });
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

  const handleListen = async () => {
    if (audioUrl) {
      // Toggle play/pause if already loaded
      if (audioRef.current) {
        audioRef.current.paused
          ? audioRef.current.play()
          : audioRef.current.pause();
      }
      return;
    }
    if (!sermon?.sermonId) return;
    setAudioLoading(true);
    try {
      const res = await fetch(
        `${BASE}/api/sermons/${sermon.sermonId}/audio-url`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('unavailable');
      const { url } = await res.json();
      setAudioUrl(url);
    } catch {
      // Gracefully suppress; button will remain visible but player won't appear
    } finally {
      setAudioLoading(false);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col pb-page-safe">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation(backPath); }} className="p-1.5 -ml-1 rounded-lg hover:bg-muted/60 text-muted-foreground" aria-label="Go back">
            <ArrowLeft size={18} />
          </button>
          <p className="text-[11px] font-semibold tracking-widest text-primary uppercase">
            SERMON COMPANION
          </p>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-muted-foreground" />
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────

  if (error || !companion) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col pb-page-safe">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
          <button onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation(backPath); }} className="p-1.5 -ml-1 rounded-lg hover:bg-muted/60 text-muted-foreground" aria-label="Go back">
            <ArrowLeft size={18} />
          </button>
          <p className="text-[11px] font-semibold tracking-widest text-primary uppercase">
            SERMON COMPANION
          </p>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 px-6 text-center max-w-xs">
            <AlertCircle size={28} className="text-muted-foreground/30" />
            <p className="text-[15px] font-medium text-foreground">{error || 'Companion not found.'}</p>
            <div className="flex gap-3">
              <button onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation(backPath); }} className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border text-[13px] text-muted-foreground hover:bg-muted/60">
                <ArrowLeft size={13} /> {backLabel}
              </button>
              <button onClick={load} className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] hover:bg-primary/90">
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

  const showListen = !!(sermon?.hasAudio && sermon?.sermonId);
  const showWatch  = !!sermon?.youtubeUrl;
  const showRead   = !!sermon?.hasTranscript;
  const hasActions = showListen || showWatch || showRead;

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation(backPath); }}
          className="p-1.5 -ml-1 rounded-lg hover:bg-muted/60 transition-colors text-muted-foreground"
          aria-label={`Back to ${backLabel}`}
        >
          <ArrowLeft size={18} />
        </button>
        <p className="text-[11px] font-semibold tracking-widest text-primary uppercase flex-1 truncate">
          SERMON COMPANION
        </p>
      </header>

      <main className="px-5 pt-6 max-w-[480px] mx-auto space-y-5 pb-10">

        {/* ── §1 + §2: THIS WEEK'S SERMON identity block ─────────────────── */}
        <div className="space-y-3">
          <p className="text-[11px] font-semibold tracking-widest text-primary uppercase">
            THIS WEEK'S SERMON
          </p>

          <div className="flex items-start gap-2">
            <h1 className="flex-1 text-[24px] font-bold text-foreground leading-tight">
              {sermonTitle || companion.title}
            </h1>
            <FavouriteButton
              contentType="sermon-companion"
              contentId={companionId}
              contentTitle={companion.title}
              contentRoute={`/sermon-companion/${companionId}/overview`}
              className="mt-0.5 shrink-0"
              size={18}
            />
          </div>

          {(sermon?.speaker || sermon?.sermonDate) && (
            <div className="space-y-0.5">
              {sermon?.speaker && (
                <p className="text-[15px] text-foreground font-medium">{sermon.speaker}</p>
              )}
              {sermon?.sermonDate && (
                <p className="text-[14px] text-muted-foreground">{formatDate(sermon.sermonDate)}</p>
              )}
            </div>
          )}

          {(sermon?.scriptureReference || sermon?.mainTheme) && (
            <div className="space-y-2 pt-1">
              {sermon?.scriptureReference && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                    Main Scripture
                  </p>
                  <p className="text-[14px] text-foreground">{sermon.scriptureReference}</p>
                </div>
              )}
              {sermon?.mainTheme && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">
                    Main Theme
                  </p>
                  <p className="text-[14px] text-foreground leading-snug">{sermon.mainTheme}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── §3. Introduction ────────────────────────────────────────────── */}
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          {introText ??
            `A ${totalSteps}-step companion based on this week's sermon — designed to help you reflect, respond and live it out.`}
        </p>

        {/* ── 4. Listen / Watch / Read ───────────────────────────────────── */}
        {hasActions && (
          <div className="space-y-2">
            <div className="flex gap-2 flex-wrap">
              {showListen && (
                <button
                  onClick={handleListen}
                  disabled={audioLoading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted/60 transition-colors disabled:opacity-50"
                >
                  {audioLoading
                    ? <Loader2 size={13} className="animate-spin" />
                    : <Play size={13} className="text-primary fill-primary" />}
                  Listen
                </button>
              )}
              {showWatch && (
                <a
                  href={sermon!.youtubeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted/60 transition-colors"
                >
                  <Youtube size={13} className="text-red-500" />
                  Watch
                </a>
              )}
              {showRead && (
                <button
                  onClick={() => setShowTranscript(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted/60 transition-colors"
                >
                  <FileText size={13} className="text-muted-foreground" />
                  Read
                </button>
              )}
            </div>

            {/* Inline audio player — appears after presigned URL is fetched */}
            {audioUrl && (
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                autoPlay
                className="w-full h-10 rounded-xl accent-primary"
                style={{ colorScheme: 'light' }}
              />
            )}
          </div>
        )}

        {/* ── 5. Progress card ───────────────────────────────────────────── */}
        {isStarted && (
          <div className={`rounded-2xl border px-4 py-3.5 space-y-2 ${
            isComplete ? 'bg-primary/5 border-primary/20' : 'bg-muted/40 border-border'
          }`}>
            {isComplete ? (
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-primary shrink-0" />
                <p className="text-[13px] font-semibold text-primary">
                  All {totalSteps} steps completed
                </p>
              </div>
            ) : (
              <>
                {/* Counts */}
                <div className="flex items-baseline justify-between">
                  <p className="text-[13px] font-semibold text-foreground">
                    {completedCount} of {totalSteps} Steps Completed
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {Math.round((completedCount / totalSteps) * 100)}%
                  </p>
                </div>
                {/* Progress bar */}
                <div className="h-1 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.round((completedCount / totalSteps) * 100)}%` }}
                  />
                </div>
                {/* Next step label */}
                {nextEntry && (
                  <p className="text-[12px] text-muted-foreground">
                    Next:{' '}
                    <span className="font-medium text-foreground">
                      Step {nextEntry.dayNumber}
                    </span>
                    {nextEntry.title ? ` — ${nextEntry.title}` : ''}
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── 6. CTA button ──────────────────────────────────────────────── */}
        <button
          type="button"
          onClick={handleCTA}
          disabled={starting}
          className="w-full h-12 rounded-2xl bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-[15px] font-semibold transition-colors flex items-center justify-center gap-2"
        >
          {starting
            ? <><Loader2 size={15} className="animate-spin" /> Starting…</>
            : ctaLabel}
        </button>

        {/* ── 7. Step list ───────────────────────────────────────────────── */}
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-1">
            The {totalSteps} Steps
          </p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60">
            {entries.length > 0 ? (
              entries.map(entry => {
                const isCompleted = completedSet.has(entry.dayNumber);
                const isCurrent   = isStarted && !isComplete && entry.dayNumber === currentDay;
                const stepStatus  = isCompleted ? 'completed' : isCurrent ? 'current' : 'upcoming';
                // All steps become tappable once the companion is started
                const canNavigate = isStarted;

                return (
                  <StepRow
                    key={entry.id}
                    stepNumber={entry.dayNumber}
                    title={entry.title}
                    scripture={entry.scriptureReference || undefined}
                    sermonLink={entry.sermonLink}
                    status={stepStatus}
                    onClick={
                      canNavigate
                        ? () => setLocation(`/sermon-companion/${companionId}/day/${entry.dayNumber}?source=${source}`)
                        : undefined
                    }
                  />
                );
              })
            ) : (
              Array.from({ length: totalSteps }, (_, i) => (
                <StepRow key={i} stepNumber={i + 1} title="" status="upcoming" />
              ))
            )}
          </div>
        </div>

        {/* ── View Previous Steps ────────────────────────────────────────── */}
        {isStarted && completedCount > 0 && (
          <button
            type="button"
            onClick={() => setLocation(`/sermon-companion/${companionId}/previous?from=${source}`)}
            className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors"
          >
            View Previous Steps →
          </button>
        )}

        {/* ── §6 + §7: CONTINUE EXPLORING ────────────────────────────────── */}
        <div className="space-y-2 pt-2">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
            Continue Exploring
          </p>
          <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border/60">

            {/* §7 — Ask Emmaus with sermon context pre-loaded */}
            <button
              onClick={() => {
                const ctx = {
                  entryPoint: 'personal' as const,
                  sermonId: sermon?.sermonId,
                  sermonTitle: sermonTitle || companion.title,
                  scriptureReference: sermon?.scriptureReference,
                  chapterHeading: sermonTitle || companion.title,
                  userName: user?.preferredName,
                };
                setPendingContext(ctx);
                setReturnDestination({
                  pathname: `/sermon-companion/${companionId}/overview?source=${source}`,
                  scrollY: window.scrollY,
                  sourceSection: sourceSectionFromPath(window.location.pathname),
                });
                setLocation('/personal/ask-emmaus');
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/60 transition-colors"
            >
              <MessageSquare size={15} className="text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-foreground">Ask Emmaus about this sermon</p>
                <p className="text-[12px] text-muted-foreground">
                  {sermonTitle ? `Discussing: ${sermonTitle}` : 'Get deeper insights, questions answered'}
                </p>
              </div>
              <ChevronRight size={14} className="text-muted-foreground shrink-0" />
            </button>

            {/* §6 — Related Scriptures: unique refs from published companion steps */}
            {relatedScriptures.length > 0 && (
              <div className="px-4 py-3.5">
                <div className="flex items-start gap-3">
                  <BookOpen size={15} className="text-primary shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-foreground mb-2">Related Scriptures</p>
                    <div className="flex flex-wrap gap-1.5">
                      {relatedScriptures.map(ref => (
                        <button
                          key={ref}
                          onClick={() => setLocation('/bible')}
                          className="px-2.5 py-1 rounded-lg bg-primary/8 border border-primary/15 text-[12px] font-medium text-primary hover:bg-primary/14 transition-colors"
                        >
                          {ref}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Open main sermon scripture in Bible reader */}
            {sermon?.scriptureReference && !relatedScriptures.includes(sermon.scriptureReference) && (
              <button
                onClick={() => setLocation('/bible')}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/60 transition-colors"
              >
                <BookOpen size={15} className="text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-foreground">
                    Open {sermon.scriptureReference} in Bible
                  </p>
                  <p className="text-[12px] text-muted-foreground">
                    Highlights, cross-references, study notes
                  </p>
                </div>
                <ChevronRight size={14} className="text-muted-foreground shrink-0" />
              </button>
            )}
          </div>
        </div>

      </main>

      <BottomNav />

      {/* ── Transcript modal ──────────────────────────────────────────────── */}
      {showTranscript && (
        <TranscriptModal
          companionId={companionId}
          onClose={() => setShowTranscript(false)}
        />
      )}
    </div>
  );
}
