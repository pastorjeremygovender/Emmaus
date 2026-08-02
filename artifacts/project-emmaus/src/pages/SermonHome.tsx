/**
 * SermonHome — Member-facing canonical sermon page.
 *
 * Route: /sermon/:id
 *
 * Shows a published canonical sermon: title, speaker, date, scripture,
 * Big Idea, summary, YouTube Watch link, Bible passage link, Companion CTA,
 * and Ask Emmaus shortcut.
 *
 * Navigation sources:
 *   - Next Steps companion card passes ?companionRoute= so we can show
 *     a "Continue Companion" / "Review Companion" CTA.
 */

import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import {
  ArrowLeft, ExternalLink, BookOpen, Mic2, Calendar,
  Loader2, AlertCircle, MessageCircle, ChevronRight,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

interface CanonicalSermon {
  id: string;
  title: string;
  speaker: string;
  sermonDate: string;
  series: string;
  scriptureReference: string;
  scriptureBookIds: string[];
  scriptureChapters: number[];
  youtubeUrl: string;
  audioPath: string;
  summary: string;
  mainTheme: string;
  themes: string[];
  keywords: string[];
  companionId?: string | null;
  status: string;
}

function formatDate(raw: string): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** Derive a clean Bible reader route from the sermon's scripture reference. */
function bibleRoute(bookIds: string[], chapters: number[]): string | null {
  if (!bookIds.length || !chapters.length) return null;
  return `/bible/read/${encodeURIComponent(bookIds[0])}/${chapters[0]}`;
}

export default function SermonHome() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();

  // Parse companion route passed by the Journeys card
  const companionRoute = (() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('companionRoute');
      return raw ? decodeURIComponent(raw) : null;
    } catch { return null; }
  })();
  // Derive label: "Review Companion" when all days are done (route → /previous), else "Continue Companion"
  const companionLabel = companionRoute?.includes('/previous') ? 'Review Companion' : 'Continue Companion';

  const [sermon, setSermon]   = useState<CanonicalSermon | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (!params.id) return;
    setLoading(true);
    fetch(`${BASE}/api/sermons/${encodeURIComponent(params.id)}`, {
      credentials: 'include',
    })
      .then(r => {
        if (r.status === 404) throw new Error('not_found');
        if (!r.ok) throw new Error('server_error');
        return r.json() as Promise<CanonicalSermon>;
      })
      .then(data => { setSermon(data); setLoading(false); })
      .catch(err => {
        setError(err.message === 'not_found' ? 'This sermon isn\'t available.' : 'Something went wrong loading this sermon.');
        setLoading(false);
      });
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !sermon) {
    return (
      <div className="min-h-[100dvh] bg-background pb-page-safe">
        <div className="flex items-center justify-center flex-col gap-3 pt-20 px-6 text-center">
          <AlertCircle size={28} className="text-gray-300" />
          <p className="text-sm text-gray-500">{error || 'Sermon not found.'}</p>
          <button onClick={() => setLocation('/journeys')} className="mt-2 text-sm text-teal-600 hover:underline">
            Back to Next Steps
          </button>
        </div>
        <BottomNav />
      </div>
    );
  }

  const passageRoute = bibleRoute(sermon.scriptureBookIds, sermon.scriptureChapters);
  const askQuery     = sermon.scriptureReference
    ? `Tell me about the sermon on ${sermon.scriptureReference}${sermon.title ? ` — "${sermon.title}"` : ''}`
    : sermon.title;

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-gray-100 px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => setLocation('/journeys')}
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

        {/* ── Title + metadata ─────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h1 className="text-[22px] font-bold text-gray-900 leading-tight">{sermon.title}</h1>

          <div className="flex flex-wrap gap-3 text-[13px] text-gray-500">
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
            <p className="text-[12px] text-gray-400 uppercase tracking-wide font-medium">{sermon.series}</p>
          )}
        </div>

        {/* ── Big Idea / Summary ───────────────────────────────────────────────── */}
        {(sermon.mainTheme || sermon.summary) && (
          <div className="bg-teal-50 border border-teal-100 rounded-2xl px-4 py-4">
            {sermon.mainTheme && (
              <p className="text-[11px] font-semibold tracking-widest text-teal-500 uppercase mb-1.5">Big Idea</p>
            )}
            <p className="text-[15px] text-gray-800 leading-relaxed">
              {sermon.mainTheme || sermon.summary}
            </p>
            {sermon.mainTheme && sermon.summary && (
              <p className="mt-2 text-[13px] text-gray-500 leading-relaxed">{sermon.summary}</p>
            )}
          </div>
        )}

        {/* ── Actions ──────────────────────────────────────────────────────────── */}
        <div className="space-y-3">

          {/* Continue / Review Companion */}
          {companionRoute && (
            <button
              onClick={() => setLocation(companionRoute)}
              className="flex items-center justify-between w-full px-4 py-3.5 rounded-2xl bg-teal-600 hover:bg-teal-700 transition-colors text-white"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={15} className="text-white" />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-semibold">{companionLabel}</p>
                  <p className="text-[11px] text-white/70">Daily devotional guide</p>
                </div>
              </div>
              <ChevronRight size={16} className="text-white/70" />
            </button>
          )}

          {/* Watch on YouTube */}
          {sermon.youtubeUrl && (
            <a
              href={sermon.youtubeUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between w-full px-4 py-3.5 rounded-2xl border border-gray-200 hover:border-red-200 hover:bg-red-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-red-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </div>
                <div>
                  <p className="text-[13px] font-medium text-gray-800">Watch</p>
                  <p className="text-[11px] text-gray-400">Full sermon on YouTube</p>
                </div>
              </div>
              <ExternalLink size={14} className="text-gray-400 group-hover:text-red-500 transition-colors" />
            </a>
          )}

          {/* Read in Bible */}
          {passageRoute && (
            <button
              onClick={() => setLocation(passageRoute)}
              className="flex items-center justify-between w-full px-4 py-3.5 rounded-2xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={15} className="text-teal-600" />
                </div>
                <div className="text-left">
                  <p className="text-[13px] font-medium text-gray-800">Read</p>
                  <p className="text-[11px] text-gray-400">{sermon.scriptureReference}</p>
                </div>
              </div>
              <ChevronRight size={14} className="text-gray-400 group-hover:text-teal-500 transition-colors" />
            </button>
          )}

          {/* Ask Emmaus */}
          <button
            onClick={() => setLocation(`/personal/ask-emmaus`)}
            className="flex items-center justify-between w-full px-4 py-3.5 rounded-2xl border border-gray-200 hover:border-teal-300 hover:bg-teal-50 transition-colors group"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                <MessageCircle size={15} className="text-gray-600" />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-medium text-gray-800">Ask Emmaus</p>
                <p className="text-[11px] text-gray-400">Questions about this sermon</p>
              </div>
            </div>
            <ChevronRight size={14} className="text-gray-400 group-hover:text-teal-500 transition-colors" />
          </button>
        </div>

        {/* ── Themes ───────────────────────────────────────────────────────────── */}
        {sermon.themes.length > 0 && (
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-gray-400 uppercase mb-2">Themes</p>
            <div className="flex flex-wrap gap-1.5">
              {sermon.themes.map(theme => (
                <span key={theme} className="px-2.5 py-1 bg-gray-100 text-gray-600 text-[12px] rounded-full">
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
