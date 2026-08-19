/**
 * BibleProgressDashboard
 *
 * Shows coverage stats per book for the 6 target books.
 * Provides a quick view of how much content has been generated,
 * reviewed, and published.
 */

import { useState, useEffect, useCallback } from 'react';
import { getApiUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  BookOpen, CheckCircle2, Clock, Loader2,
  TrendingUp, AlertCircle, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

type BookStats = {
  bookId: string;
  totalChapters: number;
  bookIntroStatus: string | null;
  overviewsTotal: number;
  overviewsDraft: number;
  overviewsInReview: number;
  overviewsPublished: number;
  passagesTotal: number;
  passagesDraft: number;
  passagesInReview: number;
  passagesPublished: number;
  chaptersWithOverview: number;
  chaptersWithPassages: number;
};

const BOOK_NAMES: Record<string, string> = {
  luke: 'Luke',
  acts: 'Acts',
  romans: 'Romans',
  '1corinthians': '1 Corinthians',
  '2corinthians': '2 Corinthians',
  psalms: 'Psalms',
};

const STATUS_DOT: Record<string, string> = {
  Published:  'bg-green-500',
  'In Review':'bg-amber-400',
  Draft:      'bg-gray-400',
  null:       'bg-gray-200',
};

function pct(n: number, total: number) {
  if (total === 0) return 0;
  return Math.round((n / total) * 100);
}

function ProgressBar({ value, colour = 'bg-teal-500' }: { value: number; colour?: string }) {
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${colour}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  onGenerate?: (bookId: string) => void;
}

export default function BibleProgressDashboard({ onGenerate }: Props) {
  const { user } = useAuth();
  const [stats, setStats] = useState<BookStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<string | null>(null); // bookId being bulk-published

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(getApiUrl('/api/bible/study-stats'));
      if (!r.ok) throw new Error('Failed to load stats');
      setStats(await r.json());
    } catch {
      setError('Could not load progress stats.');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  async function publishAllInReview(bookId: string) {
    setPublishing(bookId);
    try {
      // Bulk publish all In Review passages
      const notes = await fetch(getApiUrl(`/api/bible/study-notes/admin?bookId=${bookId}`))
        .then(r => r.json()) as { id: string; status: string }[];

      const inReviewIds = notes.filter(n => n.status === 'In Review').map(n => n.id);
      if (inReviewIds.length > 0) {
        await fetch(getApiUrl('/api/bible/study-notes/admin/bulk/status'), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids: inReviewIds, status: 'Published' }),
        });
      }
      // P2-9: also publish all In Review overviews for this book (previously missing)
      await fetch(getApiUrl('/api/bible/chapter-overviews/admin/book-status'), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bookId, status: 'Published' }),
      });
      await load();
    } finally {
      setPublishing(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={24} className="text-teal-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <AlertCircle size={24} className="text-rose-500" />
        <p className="text-sm text-gray-600">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>Retry</Button>
      </div>
    );
  }

  const totalPublished = stats.reduce((a, s) => a + s.passagesPublished + s.overviewsPublished, 0);
  const totalDraft = stats.reduce((a, s) => a + s.passagesDraft + s.overviewsDraft, 0);
  const totalInReview = stats.reduce((a, s) => a + s.passagesInReview + s.overviewsInReview, 0);

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{totalPublished}</p>
          <p className="text-[12px] text-green-600 mt-0.5">Published</p>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-amber-700">{totalInReview}</p>
          <p className="text-[12px] text-amber-600 mt-0.5">In Review</p>
        </div>
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gray-700">{totalDraft}</p>
          <p className="text-[12px] text-gray-500 mt-0.5">Draft</p>
        </div>
      </div>

      {/* Per-book stats */}
      <div className="space-y-3">
        {stats.map(s => {
          const bookName = BOOK_NAMES[s.bookId] ?? s.bookId;
          const overviewPct = pct(s.chaptersWithOverview, s.totalChapters);
          const passagePct = pct(s.chaptersWithPassages, s.totalChapters);
          const publishedPct = s.passagesTotal > 0
            ? pct(s.passagesPublished, s.passagesTotal)
            : 0;
          const hasInReview = s.overviewsInReview > 0 || s.passagesInReview > 0;

          return (
            <div key={s.bookId} className="border border-gray-200 rounded-xl p-4 bg-white">
              {/* Book header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookOpen size={16} className="text-teal-600" />
                  <span className="font-semibold text-[15px] text-gray-900">{bookName}</span>
                  <span className="text-[12px] text-gray-400">{s.totalChapters} chapters</span>
                </div>
                <div className="flex items-center gap-2">
                  {/* Book intro status */}
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${STATUS_DOT[s.bookIntroStatus ?? 'null'] ?? 'bg-gray-200'}`} />
                    <span className="text-[11px] text-gray-500">Intro</span>
                  </div>
                  {hasInReview && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] px-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                      disabled={publishing === s.bookId}
                      onClick={() => publishAllInReview(s.bookId)}
                    >
                      {publishing === s.bookId
                        ? <Loader2 size={10} className="animate-spin mr-1" />
                        : <CheckCircle2 size={10} className="mr-1" />}
                      Publish In Review
                    </Button>
                  )}
                  {onGenerate && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-[11px] px-2 text-teal-700 hover:bg-teal-50"
                      onClick={() => onGenerate(s.bookId)}
                    >
                      <TrendingUp size={10} className="mr-1" /> Generate
                    </Button>
                  )}
                </div>
              </div>

              {/* Progress rows */}
              <div className="space-y-2.5">
                <div>
                  <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                    <span className="flex items-center gap-1">
                      <Clock size={10} /> Chapter Overviews
                    </span>
                    <span>{s.chaptersWithOverview} / {s.totalChapters} ({overviewPct}%)</span>
                  </div>
                  <ProgressBar value={overviewPct} colour="bg-blue-400" />
                </div>
                <div>
                  <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                    <span className="flex items-center gap-1">
                      <BookOpen size={10} /> Chapters with Passages
                    </span>
                    <span>{s.chaptersWithPassages} / {s.totalChapters} ({passagePct}%)</span>
                  </div>
                  <ProgressBar value={passagePct} colour="bg-teal-400" />
                </div>
                {s.passagesTotal > 0 && (
                  <div>
                    <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 size={10} /> Published Passages
                      </span>
                      <span>{s.passagesPublished} / {s.passagesTotal} ({publishedPct}%)</span>
                    </div>
                    <ProgressBar value={publishedPct} colour="bg-green-500" />
                  </div>
                )}
              </div>

              {/* Status breakdown */}
              {s.passagesTotal > 0 && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                  {[
                    { label: 'Published', count: s.passagesPublished, dot: 'bg-green-500' },
                    { label: 'In Review', count: s.passagesInReview, dot: 'bg-amber-400' },
                    { label: 'Draft', count: s.passagesDraft, dot: 'bg-gray-400' },
                  ].filter(x => x.count > 0).map(x => (
                    <div key={x.label} className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full ${x.dot}`} />
                      <span className="text-[11px] text-gray-600">{x.count} {x.label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={load} className="text-[12px] text-gray-500">
          <RefreshCw size={12} className="mr-1.5" /> Refresh
        </Button>
      </div>
    </div>
  );
}
