/**
 * BibleContentStudio
 *
 * Top-level Bible Study module inside Content Studio.
 * Three sub-views:
 *   - Progress Dashboard
 *   - Content Generator (AI)
 *   - Book Introductions (list + editor)
 */

import { useState } from 'react';
import { getApiUrl } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import {
  TrendingUp, Sparkles, BookOpen, Plus, Edit2, Trash2,
  Loader2, ChevronDown, ChevronUp, Check, X, AlertCircle,
  Globe, Calendar, Users, MapPin, ArrowRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import BibleProgressDashboard from './BibleProgressDashboard';
import BibleContentGenerator from './BibleContentGenerator';

// ─── Types ────────────────────────────────────────────────────────────────────

type SubView = 'progress' | 'generator' | 'book-intros';

type BookIntro = {
  id: string;
  book_id: string;
  book_name: string;
  testament: string;
  genre: string;
  author_attribution: string;
  date_range: string;
  original_audience: string;
  historical_setting: string;
  purpose: string;
  major_themes: string[];
  key_people: string[];
  key_places: string[];
  outline: Array<{ section: string; chapters: string; description: string }>;
  key_passages: string[];
  points_to_jesus: string;
  interpretation_notes: string;
  status: 'Draft' | 'In Review' | 'Published' | 'Archived';
  updated_at: string;
};

const BOOK_IDS = ['luke', 'acts', 'romans', '1corinthians', '2corinthians', 'psalms'];

const STATUS_COLOURS: Record<string, string> = {
  Draft:       'bg-gray-100 text-gray-600',
  'In Review': 'bg-amber-100 text-amber-700',
  Published:   'bg-green-100 text-green-700',
  Archived:    'bg-rose-100 text-rose-700',
};

const STATUS_OPTIONS = ['Draft', 'In Review', 'Published', 'Archived'];

// ─── Book Intro Editor ────────────────────────────────────────────────────────

function BookIntroEditor({
  intro,
  onSave,
  onCancel,
}: {
  intro: Partial<BookIntro> & { book_id?: string };
  onSave: (data: Partial<BookIntro>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<BookIntro>>({
    book_id: '', book_name: '', testament: '', genre: '', author_attribution: '',
    date_range: '', original_audience: '', historical_setting: '', purpose: '',
    major_themes: [], key_people: [], key_places: [], outline: [], key_passages: [],
    points_to_jesus: '', interpretation_notes: '', status: 'Draft',
    ...intro,
  });
  const [arrayInputs, setArrayInputs] = useState<Record<string, string>>({
    major_themes: ((intro.major_themes ?? []) as string[]).join(', '),
    key_people: ((intro.key_people ?? []) as string[]).join(', '),
    key_places: ((intro.key_places ?? []) as string[]).join(', '),
    key_passages: ((intro.key_passages ?? []) as string[]).join(', '),
  });

  const field = (
    key: keyof BookIntro,
    label: string,
    multiline = false,
    placeholder = ''
  ) => (
    <div>
      <label className="block text-[12px] font-medium text-gray-600 mb-1">{label}</label>
      {multiline ? (
        <textarea
          value={(form[key] as string) ?? ''}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          rows={3}
          className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 resize-none"
        />
      ) : (
        <input
          type="text"
          value={(form[key] as string) ?? ''}
          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
        />
      )}
    </div>
  );

  const arrayField = (key: 'major_themes' | 'key_people' | 'key_places' | 'key_passages', label: string, placeholder = '') => (
    <div>
      <label className="block text-[12px] font-medium text-gray-600 mb-1">
        {label} <span className="text-gray-400">(comma-separated)</span>
      </label>
      <input
        type="text"
        value={arrayInputs[key]}
        onChange={e => {
          const val = e.target.value;
          setArrayInputs(a => ({ ...a, [key]: val }));
          setForm(f => ({ ...f, [key]: val.split(',').map(s => s.trim()).filter(Boolean) }));
        }}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1">Book ID</label>
          <select
            value={form.book_id ?? ''}
            onChange={e => setForm(f => ({ ...f, book_id: e.target.value }))}
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          >
            <option value="">Select book…</option>
            {BOOK_IDS.map(id => <option key={id} value={id}>{id}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[12px] font-medium text-gray-600 mb-1">Status</label>
          <select
            value={form.status ?? 'Draft'}
            onChange={e => setForm(f => ({ ...f, status: e.target.value as BookIntro['status'] }))}
            className="w-full px-3 py-2 text-[13px] border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30"
          >
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {field('book_name', 'Book Name', false, 'e.g. Luke')}
        {field('testament', 'Testament', false, 'New Testament or Old Testament')}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {field('genre', 'Genre', false, 'e.g. Gospel, History, Epistle')}
        {field('date_range', 'Date Range', false, 'e.g. AD 60–80')}
      </div>
      {field('author_attribution', 'Author / Attribution', false, 'Traditional or debated attribution')}
      {field('original_audience', 'Original Audience', false)}
      {field('historical_setting', 'Historical Setting', true)}
      {field('purpose', 'Purpose', true)}
      {arrayField('major_themes', 'Major Themes', 'Salvation, Grace, Inclusion')}
      {arrayField('key_people', 'Key People', 'Jesus, Paul, Luke')}
      {arrayField('key_places', 'Key Places', 'Jerusalem, Rome, Corinth')}
      {arrayField('key_passages', 'Key Passages', 'Luke 4:18, Luke 15:11-32')}
      {field('points_to_jesus', 'How This Points to Jesus', true)}
      {field('interpretation_notes', 'Interpretation Notes', true, 'Leave empty if none')}

      <div className="flex gap-2 pt-2">
        <Button onClick={() => onSave(form)} className="bg-teal-600 hover:bg-teal-700 text-white flex-1">
          <Check size={14} className="mr-1.5" /> Save
        </Button>
        <Button variant="outline" onClick={onCancel}>
          <X size={14} className="mr-1.5" /> Cancel
        </Button>
      </div>
    </div>
  );
}

// ─── Book Intros list ─────────────────────────────────────────────────────────

function BookIntrosList() {
  const { user } = useAuth();
  const [intros, setIntros] = useState<BookIntro[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // id or 'new'
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const headers = {
    'Content-Type': 'application/json',
  };

  async function load() {
    setLoading(true);
    try {
      const r = await fetch(getApiUrl('/api/bible/book-intro/admin'), { headers });
      setIntros(r.ok ? await r.json() : []);
    } finally {
      setLoading(false);
    }
  }

  useState(() => { load(); });

  async function save(data: Partial<BookIntro>) {
    setSaving(true);
    setError(null);
    try {
      const url = getApiUrl('/api/bible/book-intro/admin' + (editing !== 'new' ? `/${editing}` : ''));
      const method = editing === 'new' ? 'POST' : 'PUT';
      const r = await fetch(url, { method, headers, body: JSON.stringify(data) });
      if (!r.ok) { setError('Save failed'); return; }
      setEditing(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function updateStatus(id: string, status: string) {
    await fetch(getApiUrl(`/api/bible/book-intro/admin/${id}/status`), {
      method: 'PATCH', headers, body: JSON.stringify({ status }),
    });
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this book introduction?')) return;
    await fetch(getApiUrl(`/api/bible/book-intro/admin/${id}`), { method: 'DELETE', headers });
    await load();
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-teal-600" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-gray-500">{intros.length} book introduction{intros.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => setEditing('new')} className="bg-teal-600 hover:bg-teal-700 text-white">
          <Plus size={14} className="mr-1.5" /> Add Introduction
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-[13px]">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {editing === 'new' && (
        <div className="p-4 border border-teal-200 bg-teal-50/30 rounded-xl">
          <p className="text-[13px] font-semibold text-gray-800 mb-3">New Book Introduction</p>
          <BookIntroEditor intro={{}} onSave={save} onCancel={() => setEditing(null)} />
        </div>
      )}

      {intros.length === 0 && editing !== 'new' && (
        <div className="py-12 text-center">
          <BookOpen size={24} className="text-gray-300 mx-auto mb-3" />
          <p className="text-[14px] text-gray-500">No book introductions yet.</p>
          <p className="text-[12px] text-gray-400 mt-1">Use the generator to create them, or add manually.</p>
        </div>
      )}

      <div className="space-y-3">
        {intros.map(intro => (
          <div key={intro.id}>
            {editing === intro.id ? (
              <div className="p-4 border border-teal-200 bg-teal-50/30 rounded-xl">
                <BookIntroEditor
                  intro={intro}
                  onSave={save}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <div className="border border-gray-200 rounded-xl p-4 bg-white">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-[15px] text-gray-900">{intro.book_name || intro.book_id}</span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLOURS[intro.status] ?? ''}`}>
                        {intro.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[12px] text-gray-500">
                      {intro.genre && <span className="flex items-center gap-1"><Globe size={11} /> {intro.genre}</span>}
                      {intro.testament && <span>{intro.testament}</span>}
                      {intro.date_range && <span className="flex items-center gap-1"><Calendar size={11} /> {intro.date_range}</span>}
                    </div>
                    {intro.major_themes?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {intro.major_themes.slice(0, 4).map((t, i) => (
                          <span key={i} className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {intro.status !== 'Published' && (
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] text-green-700 hover:bg-green-50"
                        onClick={() => updateStatus(intro.id, 'Published')}>
                        <Check size={11} className="mr-1" /> Publish
                      </Button>
                    )}
                    {intro.status === 'Published' && (
                      <Button size="sm" variant="ghost" className="h-7 text-[11px] text-gray-500 hover:bg-gray-50"
                        onClick={() => updateStatus(intro.id, 'Draft')}>
                        Unpublish
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-gray-700"
                      onClick={() => setEditing(intro.id)}>
                      <Edit2 size={13} />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-300 hover:text-rose-500"
                      onClick={() => remove(intro.id)}>
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  initialSubView?: SubView;
  initialBookId?: string;
}

const SUB_TABS: { id: SubView; label: string; Icon: React.ElementType }[] = [
  { id: 'progress',    label: 'Progress',    Icon: TrendingUp },
  { id: 'generator',   label: 'Generator',   Icon: Sparkles   },
  { id: 'book-intros', label: 'Book Intros', Icon: BookOpen   },
];

export default function BibleContentStudio({ initialSubView = 'progress', initialBookId }: Props) {
  const [view, setView] = useState<SubView>(initialSubView);
  const [generatorBookId, setGeneratorBookId] = useState<string | undefined>(initialBookId);

  function goToGenerator(bookId: string) {
    setGeneratorBookId(bookId);
    setView('generator');
  }

  return (
    <div>
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 px-6 py-2 border-b border-gray-100 bg-gray-50">
        {SUB_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setView(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              view === id
                ? 'bg-teal-50 text-teal-700'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-6">
        {view === 'progress' && (
          <BibleProgressDashboard onGenerate={goToGenerator} />
        )}
        {view === 'generator' && (
          <BibleContentGenerator initialBookId={generatorBookId} />
        )}
        {view === 'book-intros' && (
          <BookIntrosList />
        )}
      </div>
    </div>
  );
}
