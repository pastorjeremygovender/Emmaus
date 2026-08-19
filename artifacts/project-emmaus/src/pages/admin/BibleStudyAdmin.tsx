/**
 * Bible Study Admin — Content Studio module
 *
 * Allows admins to author and publish study notes for any verse or passage,
 * and manage cross-reference pairs between Bible verses.
 */

import { useState, useEffect } from 'react';
import { getApiUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  BookOpen, Plus, Edit2, Trash2, Eye, EyeOff, ChevronDown, ChevronUp,
  Loader2, Check, X, AlertCircle, Link2,
  Globe, Clock, LetterText, Flame, Lightbulb, Footprints, BookMarked, ScanEye,
  Filter, Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getBibleBook, BIBLE_BOOKS } from '@/lib/bible-data';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { StudySection } from '@/components/VerseStudyPanel';

// ─── Types ────────────────────────────────────────────────────────────────────

type CrossRef = {
  id: string;
  from_book_id: string;
  from_chapter: number;
  from_verse: number;
  to_book_id: string;
  to_chapter: number;
  to_verse: number;
  relationship_note: string;
  created_at: string;
};

const EMPTY_CROSS_REF: Omit<CrossRef, 'id' | 'created_at'> = {
  from_book_id: 'john',
  from_chapter: 3,
  from_verse: 16,
  to_book_id: 'romans',
  to_chapter: 5,
  to_verse: 8,
  relationship_note: '',
};

type StudyNote = {
  id: string;
  book_id: string;
  chapter: number;
  verse_start: number;
  verse_end: number | null;
  title: string;
  content: string;
  context_note: string;
  historical_note: string;
  original_language_note: string;
  jesus_connection: string;
  apply_it: string;
  key_truth: string;
  reflection_question: string;
  related_scriptures: string;
  status: 'Draft' | 'In Review' | 'Published' | 'Archived';
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

const STATUS_COLOURS: Record<string, string> = {
  Draft:      'bg-muted text-muted-foreground',
  'In Review':'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400',
  Published:  'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400',
  Archived:   'bg-rose-100 dark:bg-rose-950/30 text-rose-700 dark:text-rose-400',
};

const EMPTY_FORM: Omit<StudyNote, 'id' | 'created_by' | 'updated_by' | 'created_at' | 'updated_at'> = {
  book_id: 'john',
  chapter: 1,
  verse_start: 1,
  verse_end: null,
  title: '',
  content: '',
  context_note: '',
  historical_note: '',
  original_language_note: '',
  jesus_connection: '',
  apply_it: '',
  key_truth: '',
  reflection_question: '',
  related_scriptures: '',
  status: 'Draft',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function refLabel(n: StudyNote) {
  const book = getBibleBook(n.book_id);
  const name = book?.name ?? n.book_id;
  const verseRange = n.verse_end && n.verse_end !== n.verse_start
    ? `${n.verse_start}–${n.verse_end}`
    : String(n.verse_start);
  return `${name} ${n.chapter}:${verseRange}`;
}

// ─── Editor form ──────────────────────────────────────────────────────────────

function StudyNoteForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: Partial<StudyNote>;
  onSave: (data: Partial<StudyNote>) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState({ ...EMPTY_FORM, ...initial });
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['content']));
  const [previewOpen, setPreviewOpen] = useState(false);

  function toggle(key: string) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function field(
    key: keyof typeof form,
    label: string,
    placeholder: string,
    sectionKey?: string
  ) {
    const isExpanded = !sectionKey || expandedSections.has(sectionKey);
    return (
      <div className="border border-border rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => sectionKey && toggle(sectionKey)}
          className={[
            'w-full flex items-center justify-between px-4 py-3 bg-muted/30 text-left',
            sectionKey ? 'cursor-pointer hover:bg-muted/50' : 'cursor-default',
          ].join(' ')}
        >
          <span className="text-[13px] font-semibold text-foreground">{label}</span>
          {sectionKey && (
            isExpanded
              ? <ChevronUp size={14} className="text-muted-foreground" />
              : <ChevronDown size={14} className="text-muted-foreground" />
          )}
        </button>
        {isExpanded && (
          <textarea
            value={String(form[key] ?? '')}
            onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            rows={4}
            className="w-full resize-none px-4 py-3 text-[14px] bg-background focus:outline-none focus:ring-1 focus:ring-primary"
          />
        )}
      </div>
    );
  }

  const bookOptions = (BIBLE_BOOKS ?? []).map((b: { id: string; name: string }) => (
    <option key={b.id} value={b.id}>{b.name}</option>
  ));

  return (
    <div className="space-y-4">
      {/* Reference row */}
      <div className="grid grid-cols-4 gap-2">
        <div className="col-span-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1">Book</label>
          <select
            value={form.book_id}
            onChange={e => setForm(f => ({ ...f, book_id: e.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {bookOptions}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1">Chapter</label>
          <input
            type="number" min={1}
            value={form.chapter}
            onChange={e => setForm(f => ({ ...f, chapter: Number(e.target.value) }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1">Verse(s)</label>
          <div className="flex gap-1 items-center">
            <input
              type="number" min={1}
              value={form.verse_start}
              onChange={e => setForm(f => ({ ...f, verse_start: Number(e.target.value) }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span className="text-muted-foreground text-[12px] shrink-0">–</span>
            <input
              type="number" min={form.verse_start}
              value={form.verse_end ?? ''}
              placeholder="end"
              onChange={e => setForm(f => ({ ...f, verse_end: e.target.value ? Number(e.target.value) : null }))}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>
      </div>

      {/* Title */}
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1">Title <span className="text-muted-foreground/50">(optional)</span></label>
        <input
          type="text"
          value={form.title}
          onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          placeholder="e.g. The Word became flesh"
          className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>

      {/* Status */}
      <div>
        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1">Status</label>
        <select
          value={form.status}
          onChange={e => setForm(f => ({ ...f, status: e.target.value as StudyNote['status'] }))}
          className="rounded-xl border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {['Draft', 'In Review', 'Published', 'Archived'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Content sections — ordered to match spec */}
      <div className="space-y-3">
        {field('content',              'Explanation',        'What does this verse/passage mean? Write a clear explanation…',             'content')}
        {field('context_note',         'Passage Context',    'What comes before and after? How does this fit the narrative?',             'context_note')}
        {field('key_truth',            'Key Truth',          'What is the central truth or principle of this passage?',                   'key_truth')}
        {field('reflection_question',  'Reflection',         'A question that invites the reader to personally reflect…',                 'reflection_question')}
        {field('apply_it',             'Practical Application', 'What practical step can a reader take from this today?',                'apply_it')}
        {field('related_scriptures',   'Related Scriptures', 'e.g. John 3:16, Romans 5:8 — comma-separated references',                 'related_scriptures')}
        {field('historical_note',      'Historical Background', 'What cultural or historical details help us understand this?',          'historical_note')}
        {field('original_language_note', 'Original Language', 'Significant Hebrew/Greek word insights or nuances…',                     'original_language_note')}
        {field('jesus_connection',     'How This Points to Jesus', 'How does this verse or passage point toward Christ?',                'jesus_connection')}
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 flex-wrap">
        <Button
          onClick={() => onSave(form)}
          disabled={saving}
          className="rounded-xl gap-2"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          {saving ? 'Saving…' : 'Save note'}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setPreviewOpen(true)}
          className="rounded-xl gap-2"
        >
          <ScanEye size={15} />
          Preview
        </Button>
        <Button variant="ghost" onClick={onCancel} className="rounded-xl">
          Cancel
        </Button>
      </div>

      {/* Preview dialog — renders the note exactly as members see it */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg w-full max-h-[85dvh] flex flex-col p-0 overflow-hidden rounded-2xl">
          <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/50 shrink-0">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-primary uppercase tracking-widest mb-1">
                  Preview — {(() => {
                    const book = getBibleBook(form.book_id);
                    const name = book?.name ?? form.book_id;
                    const verseRange = form.verse_end && form.verse_end !== form.verse_start
                      ? `${form.verse_start}–${form.verse_end}`
                      : String(form.verse_start);
                    return `${name} ${form.chapter}:${verseRange}`;
                  })()}
                </p>
                <DialogTitle className="text-[15px] font-bold text-foreground leading-snug">
                  {form.title || <span className="text-muted-foreground italic font-normal">No title</span>}
                </DialogTitle>
              </div>
            </div>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5">
              <ScanEye size={11} />
              This is how the note will appear to members
            </p>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-5 pb-8">
            {/* Check if any content exists */}
            {!(form.content || form.context_note || form.key_truth || form.reflection_question ||
               form.apply_it || form.related_scriptures || form.historical_note ||
               form.original_language_note || form.jesus_connection) ? (
              <div className="py-10 text-center">
                <BookOpen size={28} className="text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-[14px] text-muted-foreground">No content to preview yet.</p>
                <p className="text-[13px] text-muted-foreground mt-1">Fill in at least one section to see a preview.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/50 pt-2">
                <StudySection icon={<BookOpen size={17} />}      title="Explanation"              content={form.content}                defaultOpen />
                <StudySection icon={<Globe size={17} />}         title="Passage Context"          content={form.context_note} />
                <StudySection icon={<Flame size={17} />}         title="Key Truth"                content={form.key_truth} />
                <StudySection icon={<Lightbulb size={17} />}     title="Reflection"               content={form.reflection_question} />
                <StudySection icon={<Footprints size={17} />}    title="Practical Application"    content={form.apply_it} />
                <StudySection icon={<Link2 size={17} />}         title="Related Scriptures"       content={form.related_scriptures} />
                <StudySection icon={<Clock size={17} />}         title="Historical Background"    content={form.historical_note} />
                <StudySection icon={<LetterText size={17} />}    title="Original Language"        content={form.original_language_note} />
                <StudySection icon={<BookMarked size={17} />}    title="How This Points to Jesus" content={form.jesus_connection} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Cross Reference Admin ────────────────────────────────────────────────────

function CrossRefAdmin({ headers }: { headers: Record<string, string> }) {
  const [refs, setRefs] = useState<CrossRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_CROSS_REF });
  const [filterBook, setFilterBook] = useState('');

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = getApiUrl(
        filterBook
          ? `/api/bible/cross-references/admin?bookId=${filterBook}`
          : '/api/bible/cross-references/admin'
      );
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      setRefs(await res.json());
    } catch {
      setError('Failed to load cross references');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterBook]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    setSaving(true);
    try {
      const res = await fetch(getApiUrl('/api/bible/cross-references/admin'), {
        method: 'POST',
        headers,
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setCreating(false);
      setForm({ ...EMPTY_CROSS_REF });
      await load();
    } catch {
      setError('Failed to create cross reference');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this cross reference? This cannot be undone.')) return;
    try {
      await fetch(getApiUrl(`/api/bible/cross-references/admin/${id}`), {
        method: 'DELETE', headers,
      });
      await load();
    } catch {
      setError('Failed to delete cross reference');
    }
  }

  const bookOptions = (BIBLE_BOOKS ?? []).map((b: { id: string; name: string }) => (
    <option key={b.id} value={b.id}>{b.name}</option>
  ));

  function crossRefLabel(r: CrossRef) {
    const fromBook = getBibleBook(r.from_book_id);
    const toBook = getBibleBook(r.to_book_id);
    const from = `${fromBook?.name ?? r.from_book_id} ${r.from_chapter}:${r.from_verse}`;
    const to = `${toBook?.name ?? r.to_book_id} ${r.to_chapter}:${r.to_verse}`;
    return `${from} ↔ ${to}`;
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-[13px]">
          <AlertCircle size={15} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
        </div>
      )}

      {/* Create form */}
      {creating ? (
        <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4">
          <p className="text-[13px] font-semibold text-primary uppercase tracking-widest">New Cross Reference</p>

          <div className="space-y-3">
            {/* From verse */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">From Verse</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-[10px] text-muted-foreground block mb-1">Book</label>
                  <select
                    value={form.from_book_id}
                    onChange={e => setForm(f => ({ ...f, from_book_id: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-2 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {bookOptions}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Chapter</label>
                  <input type="number" min={1}
                    value={form.from_chapter}
                    onChange={e => setForm(f => ({ ...f, from_chapter: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-border bg-background px-2 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Verse</label>
                  <input type="number" min={1}
                    value={form.from_verse}
                    onChange={e => setForm(f => ({ ...f, from_verse: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-border bg-background px-2 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* To verse */}
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-2">To Verse</p>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="text-[10px] text-muted-foreground block mb-1">Book</label>
                  <select
                    value={form.to_book_id}
                    onChange={e => setForm(f => ({ ...f, to_book_id: e.target.value }))}
                    className="w-full rounded-xl border border-border bg-background px-2 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {bookOptions}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Chapter</label>
                  <input type="number" min={1}
                    value={form.to_chapter}
                    onChange={e => setForm(f => ({ ...f, to_chapter: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-border bg-background px-2 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-1">Verse</label>
                  <input type="number" min={1}
                    value={form.to_verse}
                    onChange={e => setForm(f => ({ ...f, to_verse: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-border bg-background px-2 py-2 text-[13px] focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Note */}
            <div>
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block mb-1">
                Relationship note <span className="text-muted-foreground/50">(optional)</span>
              </label>
              <input type="text"
                value={form.relationship_note}
                onChange={e => setForm(f => ({ ...f, relationship_note: e.target.value }))}
                placeholder="e.g. Both speak of God's love for sinners"
                className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button onClick={handleCreate} disabled={saving} className="rounded-xl gap-2">
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? 'Saving…' : 'Add reference'}
            </Button>
            <Button variant="ghost" onClick={() => setCreating(false)} className="rounded-xl">Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <Button onClick={() => setCreating(true)} className="rounded-xl gap-2">
            <Plus size={16} />Add reference
          </Button>
          <select
            value={filterBook}
            onChange={e => setFilterBook(e.target.value)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All books</option>
            {(BIBLE_BOOKS ?? []).map((b: { id: string; name: string }) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <span className="text-[13px] text-muted-foreground">
            {refs.length} {refs.length === 1 ? 'reference' : 'references'}
          </span>
        </div>
      )}

      {/* List */}
      {!creating && (
        loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="text-primary animate-spin" />
          </div>
        ) : refs.length === 0 ? (
          <div className="py-12 text-center">
            <Link2 size={32} className="text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-[14px] text-muted-foreground">No cross references yet.</p>
            <p className="text-[13px] text-muted-foreground mt-1">Add pairs to link related verses in the study panel.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {refs.map(ref => (
              <div key={ref.id} className="flex items-start gap-3 p-4 rounded-2xl border border-border bg-card">
                <div className="w-8 h-8 bg-primary/10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Link2 size={14} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-foreground">{crossRefLabel(ref)}</p>
                  {ref.relationship_note && (
                    <p className="text-[12px] text-muted-foreground mt-0.5 italic">{ref.relationship_note}</p>
                  )}
                </div>
                <button
                  onClick={() => handleDelete(ref.id)}
                  title="Delete"
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BibleStudyAdmin({ defaultTab = 'notes' }: { defaultTab?: 'notes' | 'crossrefs' }) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'notes' | 'crossrefs'>(defaultTab);
  const [notes, setNotes] = useState<StudyNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Partial<StudyNote> | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterBook, setFilterBook] = useState('');
  const [filterMissing, setFilterMissing] = useState(false);

  const headers = {
    'Content-Type': 'application/json',
  };

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const url = getApiUrl(
        filterBook
          ? `/api/bible/study-notes/admin?bookId=${filterBook}`
          : '/api/bible/study-notes/admin'
      );
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`${res.status}`);
      setNotes(await res.json());
    } catch {
      setError('Failed to load study notes');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [filterBook]); // eslint-disable-line react-hooks/exhaustive-deps

  // Derived: notes missing at least one AI-enrichment field
  const missingCount = notes.filter(n =>
    !n.key_truth || !n.reflection_question || !n.related_scriptures
  ).length;
  const displayedNotes = filterMissing
    ? notes.filter(n => !n.key_truth || !n.reflection_question || !n.related_scriptures)
    : notes;

  async function handleSave(data: Partial<StudyNote>) {
    setSaving(true);
    try {
      const isNew = !data.id;
      const url = getApiUrl(isNew ? '/api/bible/study-notes/admin' : `/api/bible/study-notes/admin/${data.id}`);
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers,
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setEditing(null);
      setCreating(false);
      await load();
    } catch {
      setError('Failed to save study note');
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusChange(note: StudyNote, status: string) {
    try {
      const url = getApiUrl(`/api/bible/study-notes/admin/${note.id}/status`);
      await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
      });
      await load();
    } catch {
      setError('Failed to update status');
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this study note? This cannot be undone.')) return;
    try {
      await fetch(getApiUrl(`/api/bible/study-notes/admin/${id}`), {
        method: 'DELETE', headers,
      });
      await load();
    } catch {
      setError('Failed to delete study note');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
            <BookOpen size={20} className="text-primary" />
          </div>
          <div>
            <h2 className="text-[17px] font-bold text-foreground">Bible Study</h2>
            <p className="text-[13px] text-muted-foreground mt-0.5">
              Author study notes and cross references for members
            </p>
          </div>
        </div>
        {activeTab === 'notes' && !creating && !editing && (
          <Button
            onClick={() => { setCreating(true); setEditing(null); }}
            className="rounded-xl gap-2 shrink-0"
          >
            <Plus size={16} />New note
          </Button>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-border/50">
        <button
          onClick={() => setActiveTab('notes')}
          className={[
            'flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors',
            activeTab === 'notes'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <BookOpen size={15} />
          Study Notes
        </button>
        <button
          onClick={() => setActiveTab('crossrefs')}
          className={[
            'flex items-center gap-2 px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors',
            activeTab === 'crossrefs'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          <Link2 size={15} />
          Cross References
        </button>
      </div>

      {/* Cross References tab */}
      {activeTab === 'crossrefs' && (
        <CrossRefAdmin headers={headers} />
      )}

      {/* Study Notes tab */}
      {activeTab === 'notes' && (
        <>
          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-destructive/10 text-destructive text-[13px]">
              <AlertCircle size={15} />
              {error}
              <button onClick={() => setError(null)} className="ml-auto"><X size={14} /></button>
            </div>
          )}

          {/* Create form */}
          {creating && (
            <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4">
              <p className="text-[13px] font-semibold text-primary uppercase tracking-widest">New Study Note</p>
              <StudyNoteForm
                initial={{}}
                onSave={handleSave}
                onCancel={() => setCreating(false)}
                saving={saving}
              />
            </div>
          )}

          {/* Enrichment completeness banner */}
          {!creating && !editing && notes.length > 0 && (
            <div className={[
              'flex items-center gap-3 px-4 py-3 rounded-xl text-[13px]',
              missingCount === 0
                ? 'bg-green-50 dark:bg-green-950/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                : 'bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800',
            ].join(' ')}>
              <Sparkles size={15} className="shrink-0" />
              <span className="flex-1">
                {missingCount === 0
                  ? `All ${notes.length} notes have Key Truth, Reflection, and Related Scriptures.`
                  : `${missingCount} of ${notes.length} notes are missing at least one AI-enrichment field.`}
              </span>
              {missingCount > 0 && (
                <button
                  onClick={() => setFilterMissing(v => !v)}
                  className={[
                    'text-[12px] font-semibold px-2.5 py-1 rounded-lg transition-colors',
                    filterMissing
                      ? 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
                      : 'bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-800',
                  ].join(' ')}
                >
                  {filterMissing ? 'Show all' : 'Show incomplete'}
                </button>
              )}
            </div>
          )}

          {/* Filter */}
          {!creating && !editing && (
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={filterBook}
                onChange={e => setFilterBook(e.target.value)}
                className="rounded-xl border border-border bg-background px-3 py-2 text-[14px] focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All books</option>
                {(BIBLE_BOOKS ?? []).map((b: { id: string; name: string }) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              {filterMissing && (
                <button
                  onClick={() => setFilterMissing(false)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[13px] font-medium"
                >
                  <Filter size={13} />
                  Incomplete only
                  <X size={12} className="ml-0.5" />
                </button>
              )}
              <span className="text-[13px] text-muted-foreground">
                {displayedNotes.length} {displayedNotes.length === 1 ? 'note' : 'notes'}
                {filterMissing && notes.length !== displayedNotes.length && ` of ${notes.length}`}
              </span>
            </div>
          )}

          {/* List */}
          {!creating && (
            loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="text-primary animate-spin" />
              </div>
            ) : displayedNotes.length === 0 ? (
              <div className="py-12 text-center">
                <BookOpen size={32} className="text-muted-foreground/30 mx-auto mb-3" />
                {filterMissing ? (
                  <>
                    <p className="text-[14px] text-muted-foreground">All notes are fully enriched.</p>
                    <p className="text-[13px] text-muted-foreground mt-1">Every note has a Key Truth, Reflection, and Related Scriptures.</p>
                  </>
                ) : (
                  <>
                    <p className="text-[14px] text-muted-foreground">No study notes yet.</p>
                    <p className="text-[13px] text-muted-foreground mt-1">Create your first note to add study content to the Bible reader.</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-2.5">
                {displayedNotes.map(note => (
                  <div key={note.id}>
                    {editing?.id === note.id ? (
                      <div className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4">
                        <p className="text-[13px] font-semibold text-primary uppercase tracking-widest">
                          Editing — {refLabel(note)}
                        </p>
                        <StudyNoteForm
                          initial={editing}
                          onSave={handleSave}
                          onCancel={() => setEditing(null)}
                          saving={saving}
                        />
                      </div>
                    ) : (
                      <div className={[
                        'flex items-start gap-3 p-4 rounded-2xl border bg-card hover:border-border/70 transition-colors',
                        (!note.key_truth || !note.reflection_question || !note.related_scriptures)
                          ? 'border-amber-200 dark:border-amber-800'
                          : 'border-border',
                      ].join(' ')}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-[14px] font-semibold text-foreground">{refLabel(note)}</p>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATUS_COLOURS[note.status]}`}>
                              {note.status}
                            </span>
                          </div>
                          {note.title && (
                            <p className="text-[13px] text-muted-foreground mt-0.5 truncate">{note.title}</p>
                          )}
                          {note.content && (
                            <p className="text-[13px] text-muted-foreground mt-1 line-clamp-2">{note.content}</p>
                          )}
                          {/* AI enrichment field indicators */}
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {[
                              { label: 'Key Truth', value: note.key_truth },
                              { label: 'Reflection', value: note.reflection_question },
                              { label: 'Scriptures', value: note.related_scriptures },
                            ].map(({ label, value }) => (
                              <span
                                key={label}
                                className={[
                                  'text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1',
                                  value
                                    ? 'bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400'
                                    : 'bg-amber-100 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400',
                                ].join(' ')}
                              >
                                {value ? <Check size={9} /> : <X size={9} />}
                                {label}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Publish / Unpublish toggle */}
                          {note.status === 'Published' ? (
                            <button
                              onClick={() => handleStatusChange(note, 'Draft')}
                              title="Unpublish"
                              className="p-2 rounded-lg text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                            >
                              <EyeOff size={16} />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleStatusChange(note, 'Published')}
                              title="Publish"
                              className="p-2 rounded-lg text-muted-foreground hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                            >
                              <Eye size={16} />
                            </button>
                          )}
                          <button
                            onClick={() => { setEditing(note); setCreating(false); }}
                            title="Edit"
                            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(note.id)}
                            title="Delete"
                            className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
