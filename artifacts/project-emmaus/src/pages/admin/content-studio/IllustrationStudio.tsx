import { useEffect, useMemo, useState } from 'react';
import { Check, ImagePlus, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import {
  approveIllustration, createIllustration, listAdminIllustrations, removeIllustration,
  unapproveIllustration, updateIllustration, type Illustration,
} from '@/lib/illustrations-api';

const templates = [
  ['bible-map', 'Bible Map'], ['timeline', 'Timeline'], ['book-outline', 'Five-Part Book Outline'],
  ['journey-route', 'Journey Route'], ['teaching-diagram', 'Teaching Diagram'],
  ['comparison', 'Comparison'], ['people-groups', 'People Groups'], ['custom-diagram', 'Custom Diagram'],
];
const placements = [
  ['below-scripture', 'Below Scripture'], ['below-welcome', 'Below Welcome'],
  ['within-reflection', 'Within Reflection'], ['after-reflection', 'After Reflection'],
  ['before-consider-this', 'Before Consider This'],
];

export default function IllustrationStudio() {
  const [items, setItems] = useState<Illustration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ contentType: 'journey-step', contentId: '', stepId: '', title: '', templateType: 'teaching-diagram', items: '', alternativeText: '', caption: '', placement: 'after-reflection' });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<Illustration | null>(null);

  const refresh = () => { setLoading(true); listAdminIllustrations().then(setItems).catch((e) => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(refresh, []);
  const preview = useMemo(() => editing?.sourceSvg ?? null, [editing]);
  const updateForm = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function add() {
    if (!form.contentId.trim() || !form.alternativeText.trim()) { setError('Content ID and alternative text are required.'); return; }
    setSaving(true); setError('');
    try {
      await createIllustration({
        contentType: form.contentType, contentId: form.contentId.trim(), stepId: form.stepId.trim() || undefined,
        illustrationType: 'accurate-visual', templateType: form.templateType,
        structuredData: { title: form.title || 'Teaching visual', items: form.items.split('\n').map((x) => x.trim()).filter(Boolean) },
        alternativeText: form.alternativeText, caption: form.caption || undefined, placement: form.placement,
      });
      setForm((current) => ({ ...current, contentId: '', stepId: '', title: '', items: '', alternativeText: '', caption: '' }));
      refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not save illustration'); } finally { setSaving(false); }
  }
  async function action(work: () => Promise<unknown>) { setError(''); try { await work(); refresh(); } catch (e) { setError(e instanceof Error ? e.message : 'Illustration action failed'); } }

  return (
    <div className="min-h-full bg-gray-50 p-4 md:p-7">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-xs font-semibold uppercase tracking-widest text-teal-700">Content Studio</p><h1 className="mt-1 text-2xl font-semibold text-gray-900">Illustration Studio</h1><p className="mt-1 max-w-2xl text-sm text-gray-500">Create accurate teaching visuals from approved labels. Nothing is visible to members until you approve it.</p></div>
          <button type="button" onClick={refresh} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700"><RefreshCw size={15} /> Refresh</button>
        </div>
        {error && <div role="alert" className="mb-4 flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={16} /></button></div>}
        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm md:p-6">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><Plus size={18} className="text-teal-700" /> Add Accurate Visual</h2>
          <p className="mb-4 mt-1 text-xs text-gray-500">Labels are rendered into a controlled SVG; AI is not used for maps or diagrams.</p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="text-xs text-gray-600">Content type<input value={form.contentType} onChange={(e) => updateForm('contentType', e.target.value)} className="field" /></label>
            <label className="text-xs text-gray-600">Content ID *<input value={form.contentId} onChange={(e) => updateForm('contentId', e.target.value)} placeholder="journey or study ID" className="field" /></label>
            <label className="text-xs text-gray-600">Step ID (optional)<input value={form.stepId} onChange={(e) => updateForm('stepId', e.target.value)} className="field" /></label>
            <label className="text-xs text-gray-600">Template<select value={form.templateType} onChange={(e) => updateForm('templateType', e.target.value)} className="field">{templates.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label className="text-xs text-gray-600">Title<input value={form.title} onChange={(e) => updateForm('title', e.target.value)} placeholder="e.g. Jesus' Journey Toward Jerusalem" className="field" /></label>
            <label className="text-xs text-gray-600">Placement<select value={form.placement} onChange={(e) => updateForm('placement', e.target.value)} className="field">{placements.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
            <label className="text-xs text-gray-600 md:col-span-2">Labels (one per line)<textarea value={form.items} onChange={(e) => updateForm('items', e.target.value)} rows={3} placeholder="Galilee&#10;Samaria&#10;Jerusalem" className="field resize-none" /></label>
            <label className="text-xs text-gray-600">Alternative text *<textarea value={form.alternativeText} onChange={(e) => updateForm('alternativeText', e.target.value)} rows={2} className="field resize-none" /></label>
            <label className="text-xs text-gray-600">Caption (optional)<textarea value={form.caption} onChange={(e) => updateForm('caption', e.target.value)} rows={2} className="field resize-none" /></label>
          </div>
          <button type="button" disabled={saving} onClick={add} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 className="animate-spin" size={16} /> : <ImagePlus size={16} />} Save as Draft</button>
        </section>
        <section className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-4 py-4"><h2 className="font-semibold text-gray-900">Illustration library</h2></div>
          {loading ? <div className="flex justify-center p-10"><Loader2 className="animate-spin text-teal-700" /></div> : items.length === 0 ? <p className="p-8 text-center text-sm text-gray-500">No illustrations yet.</p> : <div className="divide-y divide-gray-100">{items.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-4 p-4"><div className="flex h-20 w-28 items-center justify-center overflow-hidden rounded-xl border bg-gray-50">{item.sourceSvg && <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.sourceSvg)}`} alt="" className="h-full w-full object-contain" />}</div><div className="min-w-[180px] flex-1"><p className="font-medium text-gray-900">{String(item.structuredData?.title ?? item.templateType ?? 'Illustration')}</p><p className="text-xs text-gray-500">{item.contentType} · {item.contentId}{item.stepId ? ` · ${item.stepId}` : ''}</p><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${item.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{item.status}</span></div><div className="flex gap-2">{item.status === 'Approved' ? <button type="button" onClick={() => action(() => unapproveIllustration(item.id))} className="action-btn"><X size={15} /> Unapprove</button> : <button type="button" onClick={() => action(() => approveIllustration(item.id))} className="action-btn"><Check size={15} /> Approve</button>}<button type="button" onClick={() => setEditing(item)} className="action-btn"><Pencil size={15} /> Preview</button><button type="button" onClick={() => action(() => removeIllustration(item.id))} className="action-btn text-red-600"><Trash2 size={15} /> Remove</button></div></article>)}</div>}
        </section>
      </div>
      {editing && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Illustration preview"><div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="font-semibold">Preview illustration</h2><button onClick={() => setEditing(null)} aria-label="Close preview"><X /></button></div>{preview && <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(preview)}`} alt={editing.alternativeText} className="w-full rounded-xl border" />}<p className="mt-3 text-sm text-gray-600">{editing.caption || 'No caption'}</p><button type="button" onClick={() => setEditing(null)} className="mt-4 rounded-xl bg-gray-100 px-4 py-2 text-sm">Close</button></div></div>}
      <style>{`.field{display:block;width:100%;margin-top:.35rem;border:1px solid #e5e7eb;border-radius:.75rem;padding:.65rem .75rem;font-size:.875rem;outline:none}.field:focus{border-color:#0f766e;box-shadow:0 0 0 3px #0f766e22}.action-btn{display:inline-flex;align-items:center;gap:.35rem;border:1px solid #e5e7eb;border-radius:.65rem;padding:.5rem .65rem;font-size:.75rem;color:#4b5563;background:#fff}.action-btn:hover{background:#f0fdfa;color:#0f766e}`}</style>
    </div>
  );
}