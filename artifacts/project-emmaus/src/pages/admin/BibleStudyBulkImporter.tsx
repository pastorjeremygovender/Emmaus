import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Upload,
  AlertCircle,
  CheckCircle2,
  FileText,
  AlertTriangle,
  History,
  ChevronDown,
  ChevronRight,
  BookOpen,
  ArrowRight,
  X,
  Loader2
} from 'lucide-react';
import { getApiUrl } from '@/lib/api';
import { getBibleBook } from '@/lib/bible-data';
import { Link } from 'wouter';

export interface ConflictPreview {
  valid: boolean;
  books: PreviewBook[];
  totalPassages: number;
  totalFieldValues: number;
  fieldCounts: Record<string, number>;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  conflicts: {
    existingOverviews: number;
    existingPassages: number;
    publishedRecords: number;
  };
}

export interface PreviewBook {
  bookId: string;
  valid: boolean;
  chapters: PreviewChapter[];
}

export interface PreviewChapter {
  key: string;
  chapterNumber: number;
  title?: string;
  chapterOverview?: string;
  valid: boolean;
  passages: PreviewPassage[];
  conflicts: {
    overview: { exists: boolean; status?: string };
    existingPassages: number;
    publishedPassages: number;
  };
}

export interface PreviewPassage {
  verseStart: number;
  verseEnd?: number;
  referenceRaw: string;
  fields: Record<string, string>;
  valid: boolean;
  conflict: {
    exists: boolean;
    status?: string;
    verseEnd?: number;
    overlapCount?: number;
    exactRange?: boolean;
  };
}

export interface Diagnostic {
  lineNumber: number;
  code: string;
  message: string;
}

interface ImportHistoryRecord {
  id: string;
  imported_by: string;
  books: string[];
  chapters: Array<{ bookId: string; chapter: number }>;
  passage_count: number;
  conflict_mode: string;
  target_status: string;
  status: string;
  result: ImportResult | null;
  created_at: string;
  completed_at: string;
}

interface ImportResult {
  importId: string;
  status: 'Completed' | 'Partial' | 'Failed';
  counts: {
    created: number;
    replaced: number;
    merged: number;
    skipped: number;
    published: number;
    errored: number;
  };
  chapters: Array<{
    key: string;
    bookId: string;
    chapter: number;
    status: 'Completed' | 'Failed';
    error?: string;
  }>;
  firstChapter: { bookId: string; chapter: number } | null;
}

interface BibleStudyBulkImporterProps {
  onReturnToNotes?: () => void;
}

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}

export default function BibleStudyBulkImporter({
  onReturnToNotes,
}: BibleStudyBulkImporterProps) {
  const [open, setOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [preview, setPreview] = useState<ConflictPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'skip' | 'replace' | 'merge'>('skip');
  const [selectedChapters, setSelectedChapters] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'input' | 'preview' | 'result' | 'history'>('input');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [history, setHistory] = useState<ImportHistoryRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const sourceRevisionRef = useRef(0);
  const previewRevisionRef = useRef<number | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null);

  // Changing text invalidates preview
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    sourceRevisionRef.current += 1;
    previewRevisionRef.current = null;
    previewAbortRef.current?.abort();
    setLoading(false);
    setInputText(e.target.value);
    setPreview(null);
    setSelectedChapters(new Set());
    if (view === 'preview') setView('input');
  };

  const clearAll = () => {
    sourceRevisionRef.current += 1;
    previewRevisionRef.current = null;
    previewAbortRef.current?.abort();
    setLoading(false);
    setInputText('');
    setPreview(null);
    setError(null);
    setResult(null);
    setView('input');
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(getApiUrl('/api/bible/study-import/history'));
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open]);

  useEffect(() => () => previewAbortRef.current?.abort(), []);

  const handlePreview = async () => {
    if (!inputText.trim()) return;
    const sourceRevision = sourceRevisionRef.current;
    previewAbortRef.current?.abort();
    const controller = new AbortController();
    previewAbortRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/bible/study-import/preview'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, `Preview failed (${res.status})`));
      }
      const data: ConflictPreview = await res.json();
      if (sourceRevisionRef.current !== sourceRevision) return;
      setPreview(data);
      previewRevisionRef.current = sourceRevision;
      
      // Auto-select valid chapters
      const valid = new Set<string>();
      data.books.forEach(b => {
        b.chapters.forEach(c => {
          if (c.valid) valid.add(c.key);
        });
      });
      setSelectedChapters(valid);
      setView('preview');
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Failed to generate preview');
    } finally {
      if (sourceRevisionRef.current === sourceRevision) setLoading(false);
    }
  };

  const handleImport = async (targetStatus: 'Draft' | 'Published') => {
    if (
      !preview ||
      selectedChapters.size === 0 ||
      previewRevisionRef.current !== sourceRevisionRef.current
    ) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(getApiUrl('/api/bible/study-import'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          selectedChapterKeys: Array.from(selectedChapters),
          mode,
          targetStatus
        }),
      });
      if (!res.ok) {
        throw new Error(await readApiError(res, `Import failed (${res.status})`));
      }
      const data: ImportResult = await res.json();
      setResult(data);
      setView('result');
      loadHistory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to run import');
    } finally {
      setLoading(false);
    }
  };

  const toggleChapter = (key: string) => {
    const next = new Set(selectedChapters);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelectedChapters(next);
  };

  const toggleExpand = (key: string) => {
    const next = new Set(expandedChapters);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedChapters(next);
  };

  const hasPublishedConflicts = useMemo(() => {
    if (!preview) return false;
    for (const b of preview.books) {
      for (const c of b.chapters) {
        if (selectedChapters.has(c.key) && (c.conflicts.publishedPassages > 0 || c.conflicts.overview.status === 'Published')) {
          return true;
        }
      }
    }
    return false;
  }, [preview, selectedChapters]);

  const renderDiagnostics = (diagnostics: Diagnostic[], type: 'error' | 'warning') => {
    if (!diagnostics || diagnostics.length === 0) return null;
    return (
      <div className={`mt-4 rounded-xl border p-4 space-y-3 ${type === 'error' ? 'bg-destructive/5 border-destructive/20 text-destructive' : 'bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-500'}`}>
        <div className="flex items-center gap-2 font-semibold">
          {type === 'error' ? <AlertCircle size={16} /> : <AlertTriangle size={16} />}
          {diagnostics.length} {type === 'error' ? 'Errors' : 'Warnings'}
        </div>
        <ul className="text-sm space-y-1.5 max-h-40 overflow-y-auto pr-2">
          {diagnostics.map((d, i) => (
            <li key={i} className="flex min-w-0 gap-2 items-start" data-testid={`diagnostic-${type}-${i}`}>
              <span className="font-mono text-xs opacity-60 mt-0.5 w-12 shrink-0">L{d.lineNumber}</span>
              <div className="min-w-0 break-words [overflow-wrap:anywhere]">
                <span className="font-semibold text-xs opacity-80 mr-1.5">[{d.code}]</span>
                {d.message}
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  const formatModeDesc = (m: string) => {
    if (m === 'skip') return 'Keep existing notes, skip incoming duplicates';
    if (m === 'replace') return 'Replace importer-owned Study fields with the incoming content';
    return 'Fill only empty Study fields; keep existing populated fields';
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2" data-testid="button-bulk-import-trigger">
          <Upload size={16} />
          Bulk Import
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-1rem)] max-w-[95vw] h-[95vh] p-0 flex flex-col overflow-hidden bg-card" data-testid="dialog-bulk-importer">
        <div className="flex items-center justify-between gap-2 px-3 sm:px-6 py-3 sm:py-4 border-b shrink-0 bg-background/50 backdrop-blur-sm">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <div className="hidden sm:flex w-10 h-10 bg-primary/10 rounded-xl items-center justify-center shrink-0">
              <BookOpen size={20} className="text-primary" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base sm:text-lg">Bulk Bible Study Import</DialogTitle>
              <DialogDescription className="text-xs leading-snug">Import chapter overviews and Study notes from structured text</DialogDescription>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView('history')}
              className={view === 'history' ? 'bg-muted' : ''}
              data-testid="button-import-history"
            >
              <History size={16} className="sm:mr-2" />
              <span className="hidden sm:inline">History</span>
            </Button>
          </div>
        </div>

        <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-muted/20">
          <div className="max-w-5xl mx-auto w-full min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
            
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive p-4 rounded-xl flex items-center gap-3 text-sm">
                <AlertCircle size={16} />
                <span className="flex-1 font-medium">{error}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setError(null)}
                  className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                  aria-label="Dismiss error"
                  data-testid="button-dismiss-import-error"
                >
                  <X size={16} />
                </Button>
              </div>
            )}

            {view === 'history' && (
              <div className="space-y-6" data-testid="view-history">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">Import History</h3>
                  <Button variant="outline" size="sm" onClick={() => setView('input')} data-testid="button-back-to-input">
                    New Import
                  </Button>
                </div>
                {historyLoading ? (
                  <div className="py-12 text-center text-muted-foreground bg-background rounded-xl border">
                    <Loader2 size={28} className="mx-auto mb-3 animate-spin" />
                    <p>Loading import history…</p>
                  </div>
                ) : history.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground bg-background rounded-xl border border-dashed">
                    <History size={32} className="mx-auto mb-3 opacity-20" />
                    <p>No imports yet.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {history.map(h => (
                      <div key={h.id} className="bg-background border rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-4 text-sm" data-testid={`history-item-${h.id}`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">{new Date(h.created_at).toLocaleString()}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${h.status === 'Completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : h.status === 'Partial' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-destructive/10 text-destructive'}`}>
                              {h.status}
                            </span>
                          </div>
                  <div className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            <span>{h.books.length} books, {h.chapters.length} chapters</span>
                            <span>{h.passage_count} passages</span>
                            <span className="capitalize">Mode: {h.conflict_mode}</span>
                            <span>By: {h.imported_by}</span>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs md:w-[400px] shrink-0 text-center">
                          <div className="bg-muted/50 p-2 rounded-lg">
                            <div className="font-bold text-foreground">{h.result?.counts?.created || 0}</div>
                            <div className="text-muted-foreground">New</div>
                          </div>
                          <div className="bg-muted/50 p-2 rounded-lg">
                            <div className="font-bold text-foreground">{h.result?.counts?.replaced || 0}</div>
                            <div className="text-muted-foreground">Repl</div>
                          </div>
                          <div className="bg-muted/50 p-2 rounded-lg">
                            <div className="font-bold text-foreground">{h.result?.counts?.merged || 0}</div>
                            <div className="text-muted-foreground">Mrgd</div>
                          </div>
                          <div className="bg-muted/50 p-2 rounded-lg">
                            <div className="font-bold text-foreground">{h.result?.counts?.skipped || 0}</div>
                            <div className="text-muted-foreground">Skip</div>
                          </div>
                          <div className="bg-green-500/10 p-2 rounded-lg text-green-700 dark:text-green-400">
                            <div className="font-bold">{h.result?.counts?.published || 0}</div>
                            <div>Pub</div>
                          </div>
                          <div className="bg-destructive/10 p-2 rounded-lg text-destructive">
                            <div className="font-bold">{h.result?.counts?.errored || 0}</div>
                            <div>Err</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === 'result' && result && (
              <div className="space-y-6" data-testid="view-result">
                <div className="bg-background rounded-2xl border p-8 text-center space-y-4">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto ${result.status === 'Failed' ? 'bg-destructive/10 text-destructive' : result.status === 'Partial' ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'}`}>
                    {result.status === 'Failed' ? <AlertCircle size={32} /> : result.status === 'Partial' ? <AlertTriangle size={32} /> : <CheckCircle2 size={32} />}
                  </div>
                  <h2 className="text-2xl font-bold">Import {result.status}</h2>
                  
                  <div className="grid grid-cols-2 md:grid-cols-6 gap-4 max-w-3xl mx-auto pt-4">
                    <div className="bg-muted/30 border rounded-xl p-4">
                      <div className="text-2xl font-bold" data-testid="result-count-created">{result.counts.created}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Created</div>
                    </div>
                    <div className="bg-muted/30 border rounded-xl p-4">
                      <div className="text-2xl font-bold" data-testid="result-count-replaced">{result.counts.replaced}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Replaced</div>
                    </div>
                    <div className="bg-muted/30 border rounded-xl p-4">
                      <div className="text-2xl font-bold" data-testid="result-count-merged">{result.counts.merged}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Merged</div>
                    </div>
                    <div className="bg-muted/30 border rounded-xl p-4">
                      <div className="text-2xl font-bold" data-testid="result-count-skipped">{result.counts.skipped}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Skipped</div>
                    </div>
                    <div className="bg-green-500/10 border-green-500/20 border rounded-xl p-4 text-green-700 dark:text-green-400">
                      <div className="text-2xl font-bold" data-testid="result-count-published">{result.counts.published}</div>
                      <div className="text-xs font-medium uppercase tracking-wider mt-1 opacity-80">Published</div>
                    </div>
                    <div className="bg-destructive/10 border-destructive/20 border rounded-xl p-4 text-destructive">
                      <div className="text-2xl font-bold" data-testid="result-count-errors">{result.counts.errored}</div>
                      <div className="text-xs font-medium uppercase tracking-wider mt-1 opacity-80">Errors</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 pt-6">
                    <Button variant="outline" onClick={clearAll} data-testid="button-start-another">
                      Start Another Batch
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setOpen(false);
                        onReturnToNotes?.();
                      }}
                      data-testid="button-return-to-notes"
                    >
                      Return to Notes
                    </Button>
                    {result.firstChapter && (
                      <Button asChild className="gap-2" data-testid="button-view-first-chapter">
                        <Link href={`/bible/read/${result.firstChapter.bookId}/${result.firstChapter.chapter}`}>
                          View First Chapter
                          <ArrowRight size={16} />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>

                {result.chapters && result.chapters.filter(c => c.status === 'Failed').length > 0 && (
                  <div className="bg-background border rounded-xl overflow-hidden">
                    <div className="p-4 border-b bg-muted/30 font-semibold">
                      Chapter Import Issues
                    </div>
                    <div className="divide-y">
                      {result.chapters.filter(c => c.status === 'Failed').map(c => (
                        <div key={c.key} className="p-4">
                          <div className="font-semibold mb-2">{c.key} - {c.status}</div>
                          <p className="text-sm text-destructive">
                            {c.error || 'The chapter could not be imported.'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {view === 'input' && (
              <div className="grid lg:grid-cols-[1fr_300px] gap-6" data-testid="view-input">
                <div className="space-y-4 flex flex-col h-[calc(100vh-12rem)] min-h-[500px] min-w-0">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
                    <Label htmlFor="import-text" className="text-base font-semibold">Content to Import</Label>
                    <div className="flex gap-2 w-full sm:w-auto">
                      <Button variant="ghost" size="sm" onClick={clearAll} disabled={!inputText} data-testid="button-clear-text">
                        Clear
                      </Button>
                      <Button onClick={handlePreview} disabled={!inputText || loading} className="gap-2 flex-1 sm:flex-none" data-testid="button-parse-preview">
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        {!loading && <FileText size={16} />}
                        Parse & Preview
                      </Button>
                    </div>
                  </div>
                  <Textarea 
                    id="import-text"
                    value={inputText}
                    onChange={handleTextChange}
                    className="flex-1 font-mono text-sm resize-none bg-background p-4"
                    placeholder={`BOOK: John
CHAPTER: 1
TITLE: The Word Became Flesh
CHAPTER_OVERVIEW: John introduces Jesus as the eternal Word.

PASSAGE: John 1:1-5
EXPLANATION: Jesus existed before creation and is fully God.
KEY_TRUTH: Jesus is the eternal Word.
REFLECTION_QUESTION: What does this reveal about Jesus?
RELATED_SCRIPTURES: Genesis 1:1; Colossians 1:15-17`}
                    data-testid="textarea-import-content"
                  />
                </div>
                <div className="bg-background border rounded-xl p-5 space-y-4 h-fit">
                  <h3 className="font-semibold border-b pb-2">Format Guide</h3>
                  <div className="text-sm space-y-3 text-muted-foreground">
                    <p>Start with <code className="bg-muted px-1 rounded text-foreground">BOOK: John</code>, then <code className="bg-muted px-1 rounded text-foreground">CHAPTER: 1</code>.</p>
                    <p>Optional chapter fields:</p>
                    <ul className="list-disc list-inside pl-2 space-y-1 text-xs">
                      <li><code className="text-foreground">TITLE:</code></li>
                      <li><code className="text-foreground">CHAPTER_OVERVIEW:</code></li>
                    </ul>
                    <p className="mt-4">Define each range with <code className="bg-muted px-1 rounded text-foreground">PASSAGE: John 3:16-18</code>.</p>
                    <p>Add passage fields immediately after:</p>
                    <ul className="list-disc list-inside pl-2 space-y-1 text-xs">
                      <li><code className="text-foreground">EXPLANATION:</code></li>
                      <li><code className="text-foreground">PASSAGE_CONTEXT:</code></li>
                      <li><code className="text-foreground">HISTORICAL_NOTE:</code></li>
                      <li><code className="text-foreground">ORIGINAL_LANGUAGE_NOTE:</code></li>
                      <li><code className="text-foreground">JESUS_CONNECTION:</code></li>
                      <li><code className="text-foreground">PRACTICAL_APPLICATION:</code></li>
                      <li><code className="text-foreground">KEY_TRUTH:</code></li>
                      <li><code className="text-foreground">REFLECTION_QUESTION:</code></li>
                      <li><code className="text-foreground">RELATED_SCRIPTURES:</code></li>
                    </ul>
                    <p className="pt-4 text-xs opacity-70">Values may continue across lines. Optional fields may be omitted.</p>
                  </div>
                </div>
              </div>
            )}

            {view === 'preview' && preview && (
              <div className="grid min-w-0 lg:grid-cols-[minmax(0,1fr)_320px] gap-6" data-testid="view-preview">
                <div className="space-y-6 min-w-0">
                  {/* Summary Cards */}
                  <div className="grid min-w-0 grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                    <div className="min-w-0 bg-background border rounded-xl p-4">
                      <div className="text-2xl font-bold">{preview.books.length}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Books</div>
                    </div>
                    <div className="min-w-0 bg-background border rounded-xl p-4">
                      <div className="text-2xl font-bold">{preview.books.reduce((acc, b) => acc + b.chapters.length, 0)}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Chapters</div>
                    </div>
                    <div className="min-w-0 bg-background border rounded-xl p-4">
                      <div className="text-2xl font-bold">{preview.totalPassages}</div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Passages</div>
                    </div>
                    <div className="min-w-0 bg-background border rounded-xl p-4">
                      <div className="text-2xl font-bold">
                        {preview.conflicts.existingOverviews + preview.conflicts.existingPassages}
                      </div>
                      <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider mt-1">Conflicts</div>
                    </div>
                  </div>

                  {renderDiagnostics(preview.errors, 'error')}
                  {renderDiagnostics(preview.warnings, 'warning')}

                  {Object.keys(preview.fieldCounts).length > 0 && (
                    <div className="bg-background border rounded-xl p-4" data-testid="preview-field-counts">
                      <div className="flex items-center justify-between gap-4 mb-3">
                        <h3 className="font-semibold">Populated Study fields</h3>
                        <span className="text-sm text-muted-foreground">
                          {preview.totalFieldValues} values
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(preview.fieldCounts).map(([field, count]) => (
                          <span
                            key={field}
                            className="bg-muted px-2.5 py-1 rounded-full text-xs text-muted-foreground"
                            data-testid={`field-count-${field}`}
                          >
                            {field.replaceAll('_', ' ')}: <strong className="text-foreground">{count}</strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Chapters List */}
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <h3 className="font-semibold text-lg flex flex-wrap items-center gap-2">
                        Chapters to Import
                        <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full text-xs">{selectedChapters.size} selected</span>
                      </h3>
                      <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <Button className="flex-1 sm:flex-none" variant="outline" size="sm" onClick={() => setView('input')} data-testid="button-edit-import-text">Edit Source</Button>
                        <Button className="flex-1 sm:flex-none" variant="outline" size="sm" onClick={() => setSelectedChapters(new Set())} data-testid="button-deselect-all">Deselect All</Button>
                        <Button variant="outline" size="sm" onClick={() => {
                          const all = new Set<string>();
                          preview.books.forEach(b => b.chapters.forEach(c => { if(c.valid) all.add(c.key); }));
                          setSelectedChapters(all);
                        }} className="flex-1 sm:flex-none" data-testid="button-select-all-valid">Select Valid</Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {preview.books.map(b => (
                        <div key={b.bookId} className="space-y-3">
                          <h4 className="font-medium text-muted-foreground flex items-center gap-2 px-1">
                            {getBibleBook(b.bookId)?.name || b.bookId}
                          </h4>
                          {b.chapters.map(c => (
                            <div key={c.key} className={`bg-background border rounded-xl overflow-hidden transition-colors ${selectedChapters.has(c.key) ? 'border-primary/50 ring-1 ring-primary/20' : 'opacity-80'}`} data-testid={`chapter-card-${c.key}`}>
                              <div className="flex items-center gap-3 p-3">
                                <Checkbox 
                                  checked={selectedChapters.has(c.key)} 
                                  onCheckedChange={() => toggleChapter(c.key)}
                                  disabled={!c.valid}
                                  id={`chk-${c.key}`}
                                  data-testid={`checkbox-chapter-${c.key}`}
                                />
                                <button 
                                  className="flex-1 min-w-0 flex items-center gap-2 sm:gap-4 text-left"
                                  onClick={() => toggleExpand(c.key)}
                                  data-testid={`button-expand-chapter-${c.key}`}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold break-words">
                                      Chapter {c.chapterNumber}
                                      {c.title && <span className="text-muted-foreground font-normal ml-2">— {c.title}</span>}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-1">
                                      <span>{c.passages.length} passages</span>
                                      {(c.conflicts.existingPassages > 0 || c.conflicts.overview.exists) && (
                                        <span className="text-amber-600 dark:text-amber-500 flex items-center gap-1">
                                          <AlertTriangle size={12} />
                                          {c.conflicts.existingPassages + (c.conflicts.overview.exists ? 1 : 0)} conflicts
                                        </span>
                                      )}
                          {(c.conflicts.publishedPassages > 0 || c.conflicts.overview.status === 'Published') && (
                                        <span className="text-destructive flex items-center gap-1">
                                          <AlertCircle size={12} />
                                           {c.conflicts.publishedPassages + (c.conflicts.overview.status === 'Published' ? 1 : 0)} published records affected
                                        </span>
                                      )}
                                      {!c.valid && <span className="text-destructive font-medium">Invalid data</span>}
                                    </div>
                                  </div>
                                  <div className="text-muted-foreground shrink-0 p-2 hover:bg-muted rounded-lg transition-colors">
                                    {expandedChapters.has(c.key) ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                  </div>
                                </button>
                              </div>
                              
                              {expandedChapters.has(c.key) && (
                                <div className="border-t bg-muted/10 p-4 space-y-4">
                                  {c.chapterOverview && (
                                    <div className="text-sm">
                                      <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground block mb-1">Overview</span>
                                      <p className="text-muted-foreground line-clamp-2">{c.chapterOverview}</p>
                                    </div>
                                  )}
                                  {c.passages.length > 0 && (
                                    <div className="space-y-2">
                                      <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground block">Passages</span>
                                      <div className="grid gap-2">
                                        {c.passages.map((p, idx) => (
                                          <div key={idx} className="bg-background border rounded-lg p-3 text-sm flex flex-col sm:flex-row gap-3">
                                            <div className="font-semibold shrink-0 sm:w-24 break-words">{p.referenceRaw}</div>
                                            <div className="flex-1 min-w-0">
                                              <div className="flex flex-wrap gap-1.5 mb-1.5">
                                                {Object.keys(p.fields).map(f => (
                                                  <span key={f} className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">{f}</span>
                                                ))}
                                              </div>
                                              {p.conflict.exists && (
                                                <div className="text-xs flex items-center gap-1 mt-1 font-medium text-amber-600 dark:text-amber-500">
                                                  <AlertTriangle size={12} />
                                                  {p.conflict.exactRange
                                                    ? `Existing matching range (${p.conflict.status || 'current status'})`
                                                    : `Overlaps ${p.conflict.overlapCount || 1} existing range${(p.conflict.overlapCount || 1) === 1 ? '' : 's'}`}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Sidebar Controls */}
                <div className="space-y-6">
                  <div className="bg-background border rounded-xl p-5 space-y-6 lg:sticky lg:top-6">
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">Conflict Strategy</Label>
                      <p className="text-xs text-muted-foreground mb-3">{formatModeDesc(mode)}</p>
                      <RadioGroup
                        value={mode}
                        onValueChange={(value) => setMode(value as 'skip' | 'replace' | 'merge')}
                        data-testid="radio-conflict-mode"
                      >
                        <div className="flex items-center space-x-2 bg-muted/50 p-2.5 rounded-lg">
                          <RadioGroupItem value="skip" id="mode-skip" data-testid="radio-mode-skip" />
                          <Label htmlFor="mode-skip" className="flex-1 cursor-pointer">Skip Existing</Label>
                        </div>
                        <div className="flex items-center space-x-2 bg-muted/50 p-2.5 rounded-lg">
                          <RadioGroupItem value="replace" id="mode-replace" data-testid="radio-mode-replace" />
                          <Label htmlFor="mode-replace" className="flex-1 cursor-pointer">Replace Study Content</Label>
                        </div>
                        <div className="flex items-center space-x-2 bg-muted/50 p-2.5 rounded-lg">
                          <RadioGroupItem value="merge" id="mode-merge" data-testid="radio-mode-merge" />
                          <Label htmlFor="mode-merge" className="flex-1 cursor-pointer">Merge Empty Fields</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="pt-4 border-t space-y-4">
                      {hasPublishedConflicts && mode !== 'skip' && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg flex gap-2">
                          <AlertCircle size={16} className="shrink-0 mt-0.5" />
                          <p>Your selection affects published records. Modifying these changes live member content.</p>
                        </div>
                      )}
                      
                      <div className="space-y-2">
                        <Button 
                          className="w-full" 
                          disabled={selectedChapters.size === 0 || loading || !preview.valid}
                          onClick={() => handleImport('Draft')}
                          data-testid="button-import-draft"
                        >
                          {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                          Import as Draft
                        </Button>
                        <Button 
                          className="w-full bg-green-600 hover:bg-green-700 text-white" 
                          disabled={selectedChapters.size === 0 || loading || !preview.valid}
                          onClick={() => setPublishConfirmOpen(true)}
                          data-testid="button-import-publish"
                        >
                          {loading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                          Import & Publish
                        </Button>
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        {selectedChapters.size} chapter{selectedChapters.size !== 1 ? 's' : ''} selected
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
      <AlertDialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <AlertDialogContent data-testid="dialog-confirm-publish-import">
          <AlertDialogHeader>
            <AlertDialogTitle>Publish imported Study content?</AlertDialogTitle>
            <AlertDialogDescription>
              This will make imported or updated Study records available to members
              as soon as each chapter transaction completes. Existing sermon links,
              Bible text, and member notes are not changed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-publish-import">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleImport('Published')}
              data-testid="button-confirm-publish-import"
            >
              Import & Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
