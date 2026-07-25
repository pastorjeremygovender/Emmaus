import React, { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getCollection, createCollection, updateCollection } from '@/lib/collections-api';
import { useAuth } from '@/contexts/AuthContext';
import { Field, AdminBtn, SaveMessage } from '../shared';

interface Props {
  collectionId?: string;
  onBack: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS = ['Draft', 'Published', 'Archived'];

export default function CollectionEditor({ collectionId, onBack, onSaved }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(!!collectionId);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [form, setForm] = useState({
    title: '',
    description: '',
    coverImageUrl: '',
    status: 'Draft',
    tags: '',
  });

  useEffect(() => {
    if (!collectionId) return;
    getCollection(collectionId)
      .then(c => {
        if (c) setForm({
          title: c.title,
          description: c.description ?? '',
          coverImageUrl: c.coverImageUrl ?? '',
          status: c.status,
          tags: (c.tags ?? []).join(', '),
        });
      })
      .finally(() => setLoading(false));
  }, [collectionId]);

  const patch = <K extends keyof typeof form>(k: K, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaveState('saving');
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
      const payload = {
        title: form.title.trim(),
        description: form.description,
        coverImageUrl: form.coverImageUrl || undefined,
        status: form.status,
        tags,
      };
      if (collectionId) {
        await updateCollection(collectionId, payload, user?.id);
      } else {
        await createCollection(payload, user?.id);
      }
      setSaveState('saved');
      setTimeout(onSaved, 600);
    } catch {
      setSaveState('error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={20} className="animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="p-2 -ml-2 hover:bg-gray-100 rounded-lg text-gray-500">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold text-gray-900">
          {collectionId ? 'Edit Collection' : 'New Collection'}
        </h2>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
        <Field label="Title *">
          <input
            type="text"
            value={form.title}
            onChange={e => patch('title', e.target.value)}
            placeholder="e.g. Lent 2025 Series"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={form.description}
            onChange={e => patch('description', e.target.value)}
            placeholder="Short description visible to users…"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
          />
        </Field>
        <Field label="Status">
          <select
            value={form.status}
            onChange={e => patch('status', e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
          >
            {STATUS_OPTIONS.map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>
        <Field label="Tags (comma-separated)">
          <input
            type="text"
            value={form.tags}
            onChange={e => patch('tags', e.target.value)}
            placeholder="e.g. Lent, Prayer, Series"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
        </Field>
        <Field label="Cover Image URL">
          <input
            type="text"
            value={form.coverImageUrl}
            onChange={e => patch('coverImageUrl', e.target.value)}
            placeholder="https://…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
        </Field>

        {saveState === 'error' && (
          <p className="text-sm text-red-600">Save failed — please try again.</p>
        )}

        <div className="flex items-center justify-between pt-2">
          <AdminBtn variant="secondary" onClick={onBack}>Cancel</AdminBtn>
          <div className="flex items-center gap-3">
            <SaveMessage state={saveState} />
            <AdminBtn variant="primary" onClick={handleSave} disabled={!form.title.trim() || saveState === 'saving'}>
              {saveState === 'saving' ? 'Saving…' : collectionId ? 'Save Changes' : 'Create Collection'}
            </AdminBtn>
          </div>
        </div>
      </div>
    </div>
  );
}
