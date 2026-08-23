/**
 * BibleContentGenerator
 *
 * Admin tool for generating Bible study content using AI.
 * Generates book introductions, chapter overviews, or full-chapter batches
 * (overview + all passage notes). Content enters as Draft, never auto-publishes.
 */

import { useEffect, useMemo, useState } from 'react';
import { getApiUrl } from '@/lib/api';
import { BIBLE_BOOKS } from '@/lib/bible-data';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sparkles, BookOpen, ChevronDown, Check,
  Loader2, AlertCircle, CheckCircle2, RefreshCw, Pause, Play, RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Types ────────────────────────────────────────────────────────────────────

type GenerateType = 'book-intro' | 'chapter-overview' | 'chapter-batch';

type GenerationResult = {
  type: GenerateType;
  bookId: string;
  chapter?: number;
  overview?: unknown;
  record?: unknown;
  passages?: unknown[];
};

type BookStats = {
  bookId: string;
  totalChapters: number;
  bookIntroStatus: string | null;
  chaptersWithOverview: number;
  chaptersWithPassages: number;
};

type GenerationJob = {
  id: string;
  scope: 'book-intros' | 'study-sheets' | 'both';
  force: boolean;
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed';
  total: number;
  completed: number;
  skipped: number;
  failed: number;
  queued: number;
  running: number;
  failed_items: number;
};

const BOOKS = BIBLE_BOOKS.map(book => ({
  id: book.id,
  name: book.name,
  chapters: book.chapters,
}));

const GEN_TYPES: { id: GenerateType; label: string; description: string }[] = [
  {
    id: 'book-intro',
    label: 'Book Introduction',
    description: 'Author, date, themes, outline, key passages, how it points to Jesus.',
  },
  {
    id: 'chapter-overview',
    label: 'Chapter Overview',
    description: 'Summary, themes, people, locations, key verse, and passage divisions.',
  },
  {
    id: 'chapter-batch',
    label: 'Full Chapter (Overview + Passages)',
    description: 'Chapter overview plus study notes for every natural passage in the chapter.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Select({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[12px] font-medium text-gray-600 mb-1.5">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-[14px] text-gray-800 pr-8 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 disabled:opacity-50"
        >
          {options.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

function ResultSummary({ result }: { result: GenerationResult }) {
  if (result.type === 'book-intro') {
    type OutlineItem = { section?: string; chapters?: string; description?: string };
    type RecordShape = {
      book_name?: string;
      testament?: string;
      genre?: string;
      author_attribution?: string;
      date_range?: string;
      original_audience?: string;
      historical_setting?: string;
      purpose?: string;
      major_themes?: string[];
      key_people?: string[];
      key_places?: string[];
      outline?: OutlineItem[];
      key_passages?: string[];
      points_to_jesus?: string;
      interpretation_notes?: string;
    };
    const rec = result.record as RecordShape | undefined;
    const textFields: Array<[string, string | undefined]> = [
      ['Author / Attribution', rec?.author_attribution],
      ['Original Audience', rec?.original_audience],
      ['Historical Setting', rec?.historical_setting],
      ['Purpose', rec?.purpose],
      ['How This Points to Jesus', rec?.points_to_jesus],
      ['Interpretation Notes', rec?.interpretation_notes],
    ];
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle2 size={16} />
          <span className="text-[14px] font-semibold">Book introduction generated as Draft</span>
        </div>
        {rec && (
          <div className="bg-gray-50 rounded-lg p-3 text-[13px] space-y-1">
            {rec.genre ? <p><span className="text-gray-500">Genre: </span>{rec.genre}</p> : null}
            {rec.testament ? <p><span className="text-gray-500">Testament: </span>{rec.testament}</p> : null}
            {rec.date_range ? <p><span className="text-gray-500">Date: </span>{rec.date_range}</p> : null}
            {rec.major_themes && rec.major_themes.length > 0 ? (
              <p><span className="text-gray-500">Themes: </span>{rec.major_themes.slice(0, 4).join(', ')}</p>
            ) : null}
          </div>
        )}
        {rec && (
          <details className="border border-gray-200 rounded-lg">
            <summary className="cursor-pointer px-3 py-2.5 text-[12px] font-semibold text-gray-700">
              View all populated fields
            </summary>
            <div className="border-t border-gray-100 px-3 py-3 space-y-3 text-[12px]">
              {textFields.map(([label, value]) => value ? (
                <div key={label}>
                  <p className="font-medium text-gray-500 mb-0.5">{label}</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{value}</p>
                </div>
              ) : null)}
              {rec.major_themes?.length ? (
                <div>
                  <p className="font-medium text-gray-500 mb-0.5">Major Themes</p>
                  <p className="text-gray-700">{rec.major_themes.join(', ')}</p>
                </div>
              ) : null}
              {rec.key_people?.length ? (
                <div>
                  <p className="font-medium text-gray-500 mb-0.5">Key People</p>
                  <p className="text-gray-700">{rec.key_people.join(', ')}</p>
                </div>
              ) : null}
              {rec.key_places?.length ? (
                <div>
                  <p className="font-medium text-gray-500 mb-0.5">Key Places</p>
                  <p className="text-gray-700">{rec.key_places.join(', ')}</p>
                </div>
              ) : null}
              {rec.key_passages?.length ? (
                <div>
                  <p className="font-medium text-gray-500 mb-0.5">Key Passages</p>
                  <p className="text-gray-700">{rec.key_passages.join(', ')}</p>
                </div>
              ) : null}
              {rec.outline?.length ? (
                <div>
                  <p className="font-medium text-gray-500 mb-1">Outline</p>
                  <div className="space-y-1.5">
                    {rec.outline.map((item, index) => (
                      <div key={`${item.section ?? 'section'}-${index}`} className="text-gray-700">
                        <span className="font-medium">{item.section}</span>
                        {item.chapters ? ` (${item.chapters})` : ''}
                        {item.description ? ` — ${item.description}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </details>
        )}
      </div>
    );
  }

  if (result.type === 'chapter-overview') {
    type OvShape = { summary?: string; passage_divisions?: unknown[] };
    const ov = result.overview as OvShape | undefined;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle2 size={16} />
          <span className="text-[14px] font-semibold">Chapter overview generated as Draft</span>
        </div>
        {ov && (
          <div className="bg-gray-50 rounded-lg p-3 text-[13px] space-y-1">
            {ov.summary ? (
              <p className="text-gray-700">{ov.summary.slice(0, 200)}{ov.summary.length > 200 ? '…' : ''}</p>
            ) : null}
            {ov.passage_divisions ? (
              <p><span className="text-gray-500">Passages identified: </span>{ov.passage_divisions.length}</p>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  // chapter-batch
  type BatchOvShape = { passage_divisions?: Array<{ title?: string; verse_start?: number; verse_end?: number }> };
  const ov = result.overview as BatchOvShape | undefined;
  const passages = result.passages ?? [];
  const divs = ov?.passage_divisions ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-green-700">
        <CheckCircle2 size={16} />
        <span className="text-[14px] font-semibold">
          Chapter overview + {passages.length} passage{passages.length !== 1 ? 's' : ''} generated as Draft
        </span>
      </div>
      {divs.length > 0 && (
        <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Passages</p>
          {(divs as Array<{ title?: string; verse_start?: number; verse_end?: number }>).map((d, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <Check size={11} className="text-green-500 shrink-0" />
              <span className="text-gray-700">
                v{d.verse_start}–{d.verse_end} — {d.title}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[12px] text-gray-500">
        Review each record in Bible Study admin before publishing.
      </p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  initialBookId?: string;
}

export default function BibleContentGenerator({ initialBookId }: Props) {
  const { user } = useAuth();

  const [bookId, setBookId] = useState(initialBookId ?? 'luke');
  const [chapter, setChapter] = useState(1);
  const [genType, setGenType] = useState<GenerateType>('chapter-batch');
  const [force, setForce] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<BookStats[]>([]);
  const [bulkScope, setBulkScope] = useState<'book-intros' | 'study-sheets' | 'both'>('both');
  const [bulkForce, setBulkForce] = useState(false);
  const [bulkJob, setBulkJob] = useState<GenerationJob | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(getApiUrl('/api/bible/study-stats'))
      .then(response => response.ok ? response.json() : [])
      .then(data => {
        if (!cancelled) setStats(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // The generator remains usable if coverage stats are temporarily unavailable.
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadJobs = async () => {
      try {
        const response = await fetch(getApiUrl('/api/bible/generation-jobs'));
        if (!response.ok) return;
        const data = await response.json() as { jobs?: GenerationJob[] };
        const latest = data.jobs?.[0];
        if (!cancelled && latest && ['queued', 'running', 'paused'].includes(latest.status)) {
          setBulkJob(latest);
        }
      } catch {
        // The single-item generator remains usable if the queue is unavailable.
      }
    };
    void loadJobs();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!bulkJob || !['queued', 'running'].includes(bulkJob.status)) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const response = await fetch(getApiUrl(`/api/bible/generation-jobs/${bulkJob.id}`));
        if (!response.ok) return;
        const data = await response.json() as {
          job: GenerationJob;
          counts?: Record<string, number>;
        };
        if (!cancelled) {
          setBulkJob({
            ...data.job,
            queued: data.counts?.queued ?? 0,
            running: data.counts?.running ?? 0,
            failed_items: data.counts?.failed ?? 0,
          });
        }
      } catch {
        // Polling retries on the next interval.
      }
    };
    const timer = window.setInterval(() => { void poll(); }, 2500);
    void poll();
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [bulkJob?.id, bulkJob?.status]);

  const statByBook = useMemo(
    () => new Map(stats.map(stat => [stat.bookId, stat])),
    [stats],
  );

  function isComplete(book: typeof BOOKS[number]) {
    const stat = statByBook.get(book.id);
    if (!stat) return false;
    // Draft content still needs review and must not be presented as complete.
    if (genType === 'book-intro') return stat.bookIntroStatus === 'Published';
    if (genType === 'chapter-overview') {
      return stat.chaptersWithOverview >= book.chapters;
    }
    return stat.chaptersWithOverview >= book.chapters
      && stat.chaptersWithPassages >= book.chapters;
  }

  const orderedBooks = useMemo(() => {
    return [...BOOKS].sort((a, b) => Number(isComplete(a)) - Number(isComplete(b)));
  }, [genType, statByBook]);

  useEffect(() => {
    if (initialBookId && BOOKS.some(book => book.id === initialBookId)) {
      setBookId(initialBookId);
      return;
    }
    const firstIncomplete = orderedBooks.find(book => !isComplete(book));
    if (firstIncomplete) setBookId(firstIncomplete.id);
  }, [initialBookId, orderedBooks, genType]);

  const selectedBook = BOOKS.find(b => b.id === bookId) ?? BOOKS[0];
  const chapterOptions = Array.from({ length: selectedBook.chapters }, (_, i) => ({
    value: String(i + 1),
    label: `Chapter ${i + 1}`,
  }));

  const needsChapter = genType !== 'book-intro';

  async function generate() {
    setGenerating(true);
    setError(null);
    setResult(null);

    try {
      const body: Record<string, unknown> = { type: genType, bookId, force };
      if (needsChapter) body.chapter = chapter;

      const r = await fetch(getApiUrl('/api/bible/generate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: 'Generation failed' }));
        setError((err as { error?: string }).error ?? 'Generation failed');
        return;
      }

      const data = await r.json();
      setResult({ type: genType, bookId, chapter: needsChapter ? chapter : undefined, ...data });
    } catch {
      setError('Network error — please try again.');
    } finally {
      setGenerating(false);
    }
  }

  async function startBulkGeneration() {
    setBulkLoading(true);
    setBulkMessage(null);
    try {
      const response = await fetch(getApiUrl('/api/bible/generation-jobs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: bulkScope, force: bulkForce }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setBulkMessage((data as { error?: string }).error ?? 'Could not start bulk generation.');
        return;
      }
      setBulkJob({
        ...(data as GenerationJob),
        queued: Number(data.total ?? 0),
        running: 0,
        failed_items: 0,
      });
      setBulkMessage('Bulk generation queued. You can leave this page and return later.');
    } catch {
      setBulkMessage('Network error — could not start bulk generation.');
    } finally {
      setBulkLoading(false);
    }
  }

  async function updateBulkJob(action: 'pause' | 'resume' | 'retry') {
    if (!bulkJob) return;
    setBulkLoading(true);
    try {
      const response = await fetch(getApiUrl(`/api/bible/generation-jobs/${bulkJob.id}/${action}`), { method: 'POST' });
      if (!response.ok) throw new Error();
      setBulkMessage(action === 'pause' ? 'Generation paused.' : action === 'retry' ? 'Failed items re-queued.' : 'Generation resumed.');
      const refreshed = await fetch(getApiUrl(`/api/bible/generation-jobs/${bulkJob.id}`));
      if (refreshed.ok) {
        const data = await refreshed.json();
        setBulkJob({
          ...data.job,
          queued: data.counts?.queued ?? 0,
          running: data.counts?.running ?? 0,
          failed_items: data.counts?.failed ?? 0,
        });
      }
    } catch {
      setBulkMessage('Could not update this generation job.');
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h2 className="text-[17px] font-semibold text-gray-900 mb-1">Bible Content Generator</h2>
        <p className="text-[13px] text-gray-500">
          Generate study content using AI. All output enters as <strong>Draft</strong> and must be reviewed before publishing.
        </p>
      </div>

      <div className="space-y-4">
        {/* Resumable all-books generation */}
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-[13px] font-semibold text-slate-800">Generate across all 66 books</p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Resumable, one book/chapter at a time. Existing Draft, In Review, and Published records are protected by default.
              </p>
            </div>
            <BookOpen size={17} className="text-teal-600 shrink-0" />
          </div>
          <div className="grid sm:grid-cols-[1fr_auto] gap-2">
            <Select
              label="Bulk scope"
              value={bulkScope}
              onChange={v => setBulkScope(v as typeof bulkScope)}
              options={[
                { value: 'both', label: 'Book intros + chapter study sheets' },
                { value: 'book-intros', label: 'Book introductions only' },
                { value: 'study-sheets', label: 'Chapter study sheets only' },
              ]}
              disabled={bulkLoading || Boolean(bulkJob && ['queued', 'running'].includes(bulkJob.status))}
            />
            <Button
              onClick={startBulkGeneration}
              disabled={bulkLoading || Boolean(bulkJob && ['queued', 'running'].includes(bulkJob.status))}
              className="self-end bg-slate-800 hover:bg-slate-900 text-white"
            >
              {bulkLoading ? <Loader2 size={15} className="mr-2 animate-spin" /> : <Sparkles size={15} className="mr-2" />}
              Start bulk run
            </Button>
          </div>
          <label className="flex items-center gap-2 mt-3 text-[12px] text-slate-600">
            <input type="checkbox" checked={bulkForce} onChange={e => setBulkForce(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-teal-600" />
            Regenerate existing Draft/In Review content (Published content is never overwritten)
          </label>
          {bulkJob && (
            <div className="mt-4 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between text-[12px] mb-1.5">
                <span className="font-medium text-slate-700">
                  {bulkJob.status === 'completed' ? 'Run complete' : `Run ${bulkJob.status}`}
                </span>
                <span className="text-slate-500">{bulkJob.completed + bulkJob.skipped}/{bulkJob.total}</span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-teal-600 rounded-full transition-all" style={{ width: `${bulkJob.total ? Math.min(100, ((bulkJob.completed + bulkJob.skipped) / bulkJob.total) * 100) : 0}%` }} />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[11px] text-slate-500">
                <span>{bulkJob.completed} generated</span><span>{bulkJob.skipped} skipped</span><span>{bulkJob.failed} failed</span>
                {bulkJob.running > 0 && <span>{bulkJob.running} running</span>}
              </div>
              <div className="flex gap-2 mt-3">
                {bulkJob.status === 'paused' ? (
                  <Button size="sm" variant="outline" onClick={() => updateBulkJob('resume')} disabled={bulkLoading}><Play size={13} className="mr-1" />Resume</Button>
                ) : ['queued', 'running'].includes(bulkJob.status) ? (
                  <Button size="sm" variant="outline" onClick={() => updateBulkJob('pause')} disabled={bulkLoading}><Pause size={13} className="mr-1" />Pause</Button>
                ) : null}
                {bulkJob.failed > 0 && (
                  <Button size="sm" variant="outline" onClick={() => updateBulkJob('retry')} disabled={bulkLoading}><RotateCcw size={13} className="mr-1" />Retry failed</Button>
                )}
              </div>
            </div>
          )}
          {bulkMessage && <p className="mt-2 text-[12px] text-teal-700">{bulkMessage}</p>}
        </div>

        {/* Generation type */}
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1.5">What to generate</label>
          <div className="space-y-2">
            {GEN_TYPES.map(gt => (
              <button
                key={gt.id}
                onClick={() => setGenType(gt.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-colors ${
                  genType === gt.id
                    ? 'border-teal-500 bg-teal-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                  genType === gt.id ? 'border-teal-600 bg-teal-600' : 'border-gray-300'
                }`}>
                  {genType === gt.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div>
                  <p className={`text-[13px] font-semibold ${genType === gt.id ? 'text-teal-800' : 'text-gray-700'}`}>
                    {gt.label}
                  </p>
                  <p className="text-[12px] text-gray-500 mt-0.5">{gt.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Book + Chapter selectors */}
        <div className={`grid gap-3 ${needsChapter ? 'grid-cols-2' : 'grid-cols-1'}`}>
          <Select
            label="Book"
            value={bookId}
            onChange={v => { setBookId(v); setChapter(1); setResult(null); }}
            options={orderedBooks.map(b => ({
              value: b.id,
              label: isComplete(b)
                ? `✓ ${b.name} — published`
                : statByBook.get(b.id)?.bookIntroStatus === 'Draft' && genType === 'book-intro'
                  ? `${b.name} — Draft to review`
                  : `${b.name} — needs work`,
            }))}
            disabled={generating}
          />
          {needsChapter && (
            <Select
              label="Chapter"
              value={String(chapter)}
              onChange={v => { setChapter(Number(v)); setResult(null); }}
              options={chapterOptions}
              disabled={generating}
            />
          )}
        </div>

        {/* Force overwrite */}
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={force}
            onChange={e => setForce(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          <span className="text-[13px] text-gray-600">
            Regenerate even if content already exists
            <span className="text-gray-400"> (Published records are always protected)</span>
          </span>
        </label>

        {/* Generate button */}
        <Button
          onClick={generate}
          disabled={generating}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white"
        >
          {generating ? (
            <>
              <Loader2 size={16} className="mr-2 animate-spin" />
              Generating… this may take up to 30 seconds
            </>
          ) : (
            <>
              <Sparkles size={16} className="mr-2" />
              Generate {GEN_TYPES.find(g => g.id === genType)?.label}
            </>
          )}
        </Button>

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2.5 p-3 bg-rose-50 border border-rose-200 rounded-lg">
            <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
            <p className="text-[13px] text-rose-700">{error}</p>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="p-4 bg-white border border-gray-200 rounded-xl">
            <ResultSummary result={result} />
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setResult(null)}
                className="text-[12px]"
              >
                Generate Another
              </Button>
              {needsChapter && chapter < selectedBook.chapters && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setChapter(c => c + 1);
                    setResult(null);
                  }}
                  className="text-[12px] text-teal-700 border-teal-300 hover:bg-teal-50"
                >
                  <RefreshCw size={12} className="mr-1.5" />
                  Next Chapter ({chapter + 1})
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="mt-6 p-4 bg-amber-50 border border-amber-100 rounded-xl">
        <p className="text-[12px] font-semibold text-amber-800 mb-1">Workflow reminder</p>
        <p className="text-[12px] text-amber-700 leading-[1.6]">
          All generated content starts as <strong>Draft</strong>. Review each record in Bible Study admin,
          edit where needed, then publish. Book introductions appear in the <strong>Book Intros</strong> tab.
          Full-chapter generation keeps suggested cross-references with each passage note; they do not appear
          in the separate canonical <strong>Cross References</strong> table until added there. Never approve without reading — AI can occasionally misstate dates,
          people, or make forced connections.
        </p>
      </div>
    </div>
  );
}
