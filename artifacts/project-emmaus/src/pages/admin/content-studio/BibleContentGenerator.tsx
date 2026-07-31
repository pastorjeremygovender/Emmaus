/**
 * BibleContentGenerator
 *
 * Admin tool for generating Bible study content using AI.
 * Generates book introductions, chapter overviews, or full-chapter batches
 * (overview + all passage notes). Content enters as Draft, never auto-publishes.
 */

import { useState } from 'react';
import { getApiUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sparkles, BookOpen, ChevronDown, Check,
  Loader2, AlertCircle, CheckCircle2, RefreshCw,
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

const BOOKS: { id: string; name: string; chapters: number }[] = [
  { id: 'luke',         name: 'Luke',           chapters: 24  },
  { id: 'acts',         name: 'Acts',           chapters: 28  },
  { id: 'romans',       name: 'Romans',         chapters: 16  },
  { id: '1corinthians', name: '1 Corinthians',  chapters: 16  },
  { id: '2corinthians', name: '2 Corinthians',  chapters: 13  },
  { id: 'psalms',       name: 'Psalms',         chapters: 150 },
];

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
    type RecordShape = { genre?: string; testament?: string; date_range?: string; major_themes?: string[] };
    const rec = result.record as RecordShape | undefined;
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
          'x-user-id': user?.id ?? '',
          'x-user-role': (user as { role?: string })?.role ?? '',
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

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h2 className="text-[17px] font-semibold text-gray-900 mb-1">Bible Content Generator</h2>
        <p className="text-[13px] text-gray-500">
          Generate study content using AI. All output enters as <strong>Draft</strong> and must be reviewed before publishing.
        </p>
      </div>

      <div className="space-y-4">
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
            options={BOOKS.map(b => ({ value: b.id, label: b.name }))}
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
            <span className="text-gray-400"> (won't overwrite Published records unless checked)</span>
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
          edit where needed, then publish. Never approve without reading — AI can occasionally misstate dates,
          people, or make forced connections.
        </p>
      </div>
    </div>
  );
}
