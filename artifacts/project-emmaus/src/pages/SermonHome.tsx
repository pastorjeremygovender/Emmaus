/**
 * SermonHome — Member-facing canonical sermon page.
 *
 * Route: /sermon/:id
 *
 * Shows a published canonical sermon: title, speaker, date, scripture,
 * Big Idea, summary, YouTube Watch, Bible passage, Companion CTA,
 * Ask Emmaus shortcut.
 *
 * Companion CTA sources (first wins):
 *   1. sermon.companionId from the API (preferred — always present for linked sermons)
 *   2. ?companionRoute= URL param passed by Journeys.tsx card navigation
 *
 * Error / edge cases handled gracefully — this page NEVER renders blank.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  ArrowLeft, ExternalLink, BookOpen, Mic2, Calendar,
  Loader2, AlertCircle, MessageCircle, ChevronRight, RefreshCw,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');

interface CanonicalSermon {
  id: string;
  title: string;
  speaker?: string | null;
  sermonDate?: string | null;
  series?: string | null;
  scriptureReference?: string | null;
  scriptureBookIds?: string[] | null;
  scriptureChapters?: number[] | null;
  youtubeUrl?: string | null;
  audioPath?: string | null;
  summary?: string | null;
  mainTheme?: string | null;
  themes?: string[] | null;
  keywords?: string[] | null;
  transcript?: string | null;
  transcriptStatus?: string | null;
  status: string;
  companionId?: string | null;
  publishedAt?: string | null;
}

function formatDate(raw: string | null | undefined): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function bibleRoute(
  bookIds: string[] | null | undefined,
  chapters: number[] | null | undefined
): string | null {
  if (!bookIds?.length || !chapters?.length) return null;
  return `/bible/read/${encodeURIComponent(bookIds[0])}/${chapters[0]}`;
}

/** Extract ?companionRoute= from the browser search string safely. */
function getCompanionRouteFromSearch(): string | null {
  try {
    const raw = new URLSearchParams(window.location.search).get('companionRoute');
    return raw ? decodeURIComponent(raw) : null;
  } catch {
    return null;
  }
}

// ─── Action row button ────────────────────────────────────────────────────────

interface ActionRowProps {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  sublabel?: string;
  rightIcon?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  primary?: boolean;
}

function ActionRow({
  icon, iconBg, label, sublabel, rightIcon, onClick, href, primary,
}: ActionRowProps) {
  const cls = `flex items-center justify-between w-full px-4 py-3.5 rounded-2xl border transition-colors group text-left ${
    primary
      ? 'border-transparent bg-teal-600 hover:bg-teal-700'
      : 'border-gray-200 hover:border-teal-300 hover:bg-teal-50'
  }`;
  const content = (
    <>
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          {icon}
        </div>
        <div className="text-left">
          <p className={`text-[13px] font-semibold ${primary ? 'text-white' : 'text-gray-800'}`}>
            {label}
          </p>
          {sublabel && (
            <p className={`text-[11px] ${primary ? 'text-white/70' : 'text-gray-400'}`}>
              {sublabel}
            </p>
          )}
        </div>
      </div>
      {rightIcon ?? (
        <ChevronRight
          size={14}
          className={primary
            ? 'text-white/70'
            : 'text-gray-400 group-hover:text-teal-500 transition-colors'
          }
        />
      )}
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SermonHome() {
  const params              = useParams<{ id: string }>();
  const [, setLocation]     = useLocation();

  const [sermon, setSermon]   = useState<CanonicalSermon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // Read the source back-destination from URL so the back button returns correctly.
  // Companion route is also read here — it's set when Journeys.tsx navigates here.
  const companionRouteFromUrl = getCompanionRouteFromSearch();

  const fetchSermon = useCallback(() => {
    if (!params.id) {
      setError('No sermon ID in URL.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');

    fetch(`${BASE}/api/sermons/${encodeURIComponent(params.id)}`, {
      credentials: 'include',
    })
      .then(r => {
        if (r.status === 404) throw new Error('not_found');
        if (!r.ok) throw new Error('server_error');
        return r.json() as Promise<CanonicalSermon>;
      })
      .then(data => {
        setSermon(data);
        setLoading(false);
      })
      .catch(err => {
        const msg = (err as Error).message;
        setError(
          msg === 'not_found'
            ? "This sermon isn't available yet."
            : "We couldn't load this sermon. Please try again."
        );
        setLoading(false);
      });
  }, [params.id]);

  useEffect(() => { fetchSermon(); }, [fetchSermon]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col pb-page-safe">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => history.back()}
            className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <p className="text-[11px] font-semibold tracking-widest text-teal-600 uppercase">
            SERMON
          </p>
        </header>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
        <BottomNav />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error || !sermon) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col pb-page-safe">
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => history.back()}
            className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
            aria-label="Go back"
          >
            <ArrowLeft size={18} />
          </button>
          <p className="text-[11px] font-semibold tracking-widest text-teal-600 uppercase">
            SERMON
          </p>
        </header>

        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 px-6 text-center max-w-xs">
            <AlertCircle size={28} className="text-gray-300" />
            <p className="text-[15px] text-gray-700 font-medium">
              {error || 'Sermon not found.'}
            </p>
            <p className="text-[13px] text-gray-400 leading-relaxed">
              This might be a sermon that isn't published yet, or a link that's no longer valid.
            </p>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => history.back()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <ArrowLeft size={13} /> Back
              </button>
              <button
                onClick={fetchSermon}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-[13px] transition-colors"
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

  // ── Derive companion navigation ──────────────────────────────────────────
  // Prefer the URL param (passed from Journeys.tsx which knows the current day).
  // Fall back to sermon.companionId navigating to day 1 (reader handles redirect).
  const companionRoute: string | null =
    companionRouteFromUrl ??
    (sermon.companionId ? `/sermon-companion/${sermon.companionId}/day/1` : null);

  const isCompanionComplete = companionRouteFromUrl?.includes('/previous') ?? false;
  const companionLabel      = isCompanionComplete ? 'Review Companion' : 'Continue Companion';

  const passageRoute = bibleRoute(sermon.scriptureBookIds, sermon.scriptureChapters);
  const themes       = Array.isArray(sermon.themes) ? sermon.themes : [];
  const hasAudio     = !!(sermon.audioPath?.trim());
  const hasYoutube   = !!(sermon.youtubeUrl?.trim());
  const hasSummary   = !!(sermon.summary?.trim() || sermon.mainTheme?.trim());

  // ── Full render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => history.back()}
          className="p-1.5 -ml-1 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
          aria-label="Go back"
        >
          <ArrowLeft size={18} />
        </button>
        <p className="text-[11px] font-semibold tracking-widest text-teal-600 uppercase truncate flex-1">
          THIS WEEK'S SERMON
        </p>
      </header>

      <main className="px-5 pt-6 pb-8 max-w-[480px] mx-auto space-y-6">

        {/* ── Title + metadata ─────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h1 className="text-[22px] font-bold text-gray-900 leading-tight">
            {sermon.title || 'Untitled Sermon'}
          </h1>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-gray-500">
            {sermon.speaker && (
              <span className="flex items-center gap-1.5">
                <Mic2 size={13} className="text-gray-400" />
                {sermon.speaker}
              </span>
            )}
            {sermon.sermonDate && (
              <span className="flex items-center gap-1.5">
                <Calendar size={13} className="text-gray-400" />
                {formatDate(sermon.sermonDate)}
              </span>
            )}
          </div>

          {sermon.scriptureReference && (
            <div className="flex items-center gap-1.5 text-[13px] text-teal-700 font-medium">
              <BookOpen size={13} />
              {sermon.scriptureReference}
            </div>
          )}

          {sermon.series && (
            <p className="text-[12px] text-gray-400 uppercase tracking-wide font-medium">
              {sermon.series}
            </p>
          )}
        </div>

        {/* ── Big Idea / Summary ─────────────────────────────────────────── */}
        {hasSummary && (
          <div className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-4">
            {sermon.mainTheme && (
              <p className="text-[11px] font-semibold tracking-widest text-teal-500 uppercase mb-1.5">
                Big Idea
              </p>
            )}
            <p className="text-[15px] text-gray-800 leading-relaxed">
              {sermon.mainTheme || sermon.summary}
            </p>
            {sermon.mainTheme && sermon.summary && (
              <p className="mt-2 text-[13px] text-gray-500 leading-relaxed">
                {sermon.summary}
              </p>
            )}
          </div>
        )}

        {/* No audio/content yet — legacy companion still works */}
        {!hasSummary && !hasYoutube && !hasAudio && (
          <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-4 text-center">
            <p className="text-[13px] text-gray-400">
              Audio, video and summary are not yet available for this sermon.
            </p>
          </div>
        )}

        {/* ── Actions ────────────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Continue / Review Companion — PRIMARY when present */}
          {companionRoute && (
            <ActionRow
              primary
              onClick={() => setLocation(companionRoute)}
              iconBg="bg-white/20"
              icon={<BookOpen size={15} className="text-white" />}
              label={companionLabel}
              sublabel="Daily devotional guide"
            />
          )}

          {/* Watch on YouTube */}
          {hasYoutube && (
            <ActionRow
              href={sermon.youtubeUrl!}
              iconBg="bg-red-100"
              icon={
                <svg className="w-4 h-4 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              }
              label="Watch"
              sublabel="Full sermon on YouTube"
              rightIcon={<ExternalLink size={14} className="text-gray-400 group-hover:text-red-500 transition-colors" />}
            />
          )}

          {/* Read in Bible */}
          {passageRoute && (
            <ActionRow
              onClick={() => setLocation(passageRoute)}
              iconBg="bg-teal-100"
              icon={<BookOpen size={15} className="text-teal-600" />}
              label="Read"
              sublabel={sermon.scriptureReference ?? 'Open passage'}
            />
          )}

          {/* Ask Emmaus */}
          <ActionRow
            onClick={() => setLocation('/personal/ask-emmaus')}
            iconBg="bg-gray-100"
            icon={<MessageCircle size={15} className="text-gray-600" />}
            label="Ask Emmaus"
            sublabel="Questions about this sermon"
          />
        </div>

        {/* ── Themes ──────────────────────────────────────────────────────── */}
        {themes.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-2">
              Themes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {themes.map(theme => (
                <span
                  key={theme}
                  className="px-2.5 py-1 bg-gray-100 text-gray-600 text-[12px] rounded-full"
                >
                  {theme}
                </span>
              ))}
            </div>
          </div>
        )}
      </main>

      <BottomNav />
    </div>
  );
}
