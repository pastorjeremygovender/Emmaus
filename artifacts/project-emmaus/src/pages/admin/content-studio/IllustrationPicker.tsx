import { useEffect, useState } from 'react';
import { ImagePlus, Loader2, X, Check } from 'lucide-react';
import {
  listAdminIllustrations,
  updateIllustration,
  type Illustration,
} from '@/lib/illustrations-api';

export const ILLUSTRATION_PLACEMENTS = [
  { value: 'below-scripture', label: 'Scripture' },
  { value: 'below-welcome', label: 'Welcome' },
  { value: 'within-reflection', label: 'Reflection' },
  { value: 'before-consider-this', label: 'Consider This' },
  { value: 'after-reflection', label: 'After reflection' },
] as const;

type Props = {
  contentType: string;
  contentId?: string;
  stepId?: string;
  label?: string;
  compact?: boolean;
  suggestOnly?: boolean;
};

function imageSrc(item: Illustration) {
  return item.displayObjectPath ??
    (item.sourceSvg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(item.sourceSvg)}` : null);
}

export default function IllustrationPicker({
  contentType, contentId, stepId, label = 'Add illustration', compact = false, suggestOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Illustration[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [placement, setPlacement] = useState('after-reflection');
  const [paragraphPosition, setParagraphPosition] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    listAdminIllustrations()
      .then(all => setItems(all.filter(item => item.status === 'Approved')))
      .catch(() => setMessage('Could not load approved illustrations.'))
      .finally(() => setLoading(false));
  }, [open]);

  async function attach(item: Illustration) {
    if (!contentId) return;
    setSaving(item.id);
    setMessage('');
    try {
      await updateIllustration(item.id, {
        contentType,
        contentId,
        stepId: stepId || null,
        placement,
        paragraphPosition: paragraphPosition ? Number(paragraphPosition) : null,
      });
      setMessage('Illustration placed.');
    } catch {
      setMessage('Could not place illustration.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      <button
        type="button"
        disabled={!contentId}
        onClick={() => { setMessage(''); setOpen(true); }}
        className={`inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50 ${compact ? 'px-2 py-1 text-[11px]' : 'px-3 py-2 text-[12px]'}`}
      >
        <ImagePlus size={compact ? 13 : 14} /> {label}
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Choose illustration">
          <section className="max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="font-semibold text-gray-900">Place an approved illustration</h2>
                <p className="mt-0.5 text-xs text-gray-500">This changes placement only; your content text stays untouched.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close illustration picker" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button>
            </header>
            <div className="space-y-4 overflow-y-auto p-5">
              {!suggestOnly && <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px]">
                <label className="text-xs font-medium text-gray-600">Placement
                  <select value={placement} onChange={e => setPlacement(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm">
                    {ILLUSTRATION_PLACEMENTS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label className="text-xs font-medium text-gray-600">Paragraph (optional)
                  <input type="number" min={1} value={paragraphPosition} onChange={e => setParagraphPosition(e.target.value)} placeholder="Any" className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                </label>
              </div>}
              {message && <p className={`rounded-lg px-3 py-2 text-xs ${message.includes('Could') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>{message}</p>}
              {loading ? <div className="flex justify-center py-10"><Loader2 className="animate-spin text-teal-700" /></div> :
                items.length === 0 ? <p className="py-10 text-center text-sm text-gray-500">No approved illustrations are available yet.</p> :
                <div className="grid gap-3 sm:grid-cols-2">{items.map(item => {
                  const src = imageSrc(item);
                  return <article key={item.id} className="overflow-hidden rounded-xl border border-gray-200">
                    <div className="flex h-32 items-center justify-center bg-gray-50">{src && <img src={src} alt={item.alternativeText} className="h-full w-full object-contain" />}</div>
                    <div className="space-y-2 p-3">
                      <p className="truncate text-sm font-medium text-gray-800">{String(item.structuredData?.title ?? item.templateType ?? 'Illustration')}</p>
                      {item.caption && <p className="line-clamp-2 text-xs text-gray-500">{item.caption}</p>}
                      {!suggestOnly && <button type="button" disabled={saving !== null} onClick={() => attach(item)} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                        {saving === item.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Place here
                      </button>}
                    </div>
                  </article>;
                })}</div>}
            </div>
          </section>
        </div>
      )}
    </>
  );
}