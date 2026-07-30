/**
 * NewCollectionModal — single-step creation wizard for Journey Collections.
 *
 * Follows the same modal shell as NewJourneyModal (the reference pattern):
 *  • Fixed modal, max-h = 100dvh − padding — never clips the viewport
 *  • Header: ← Cancel | centred title | ✕ Close — always visible
 *  • Step progress pill (single step, always filled)
 *  • Scrollable content area only
 *  • Sticky footer with single primary CTA
 *
 * After creation the caller receives the new collection ID via `onCreated`
 * and should navigate to the full CollectionEditor for further editing.
 */

import React, { useState } from 'react';
import { ArrowLeft, X, FolderOpen, Loader2 } from 'lucide-react';
import { createCollection } from '@/lib/collections-api';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  onClose: () => void;
  onCreated: (collectionId: string) => void;
}

export default function NewCollectionModal({ onClose, onCreated }: Props) {
  const { user } = useAuth();

  const [form, setForm] = useState({
    title:       '',
    description: '',
    tags:        '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const patch = (k: keyof typeof form, v: string) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleCreate = async () => {
    if (!form.title.trim()) { setError('Title is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
      const created = await createCollection(
        { title: form.title.trim(), description: form.description, status: 'Draft', tags },
        user?.id,
      );
      onCreated((created as { id: string }).id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create collection.');
      setSaving(false);
    }
  };

  const primaryDisabled = !form.title.trim() || saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[calc(100dvh-2rem)]">

        {/* ── Header — always visible ──────────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center px-5 pt-5 pb-4 border-b border-gray-100">
          {/* Cancel — fixed width so title stays centred */}
          <button
            onClick={onClose}
            aria-label="Cancel"
            className="flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors w-20 flex-shrink-0"
          >
            <ArrowLeft size={14} />
            Cancel
          </button>

          {/* Step title — centred */}
          <h2 className="flex-1 text-[15px] font-semibold text-gray-900 text-center">
            New Collection
          </h2>

          {/* Close — fixed width, right-aligned */}
          <div className="w-20 flex-shrink-0 flex justify-end">
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Step progress — single filled pill ───────────────────────────── */}
        <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3.5 pb-1">
          <div className="h-[3px] rounded-full flex-1 bg-teal-500" />
        </div>

        {/* ── Scrollable content ────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4">
          <div className="space-y-4">

            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                <FolderOpen size={17} className="text-teal-600" />
              </div>
              <p className="text-[13px] text-gray-500 leading-relaxed">
                Group related journeys together. You can add journeys to this collection after creating it.
              </p>
            </div>

            {/* Title */}
            <div>
              <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                Title
                <span className="text-red-500 ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={e => patch('title', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !primaryDisabled) handleCreate(); }}
                placeholder="e.g. Lent 2025 Series"
                autoFocus
                className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                Description
                <span className="ml-1.5 text-[11px] font-normal text-gray-400">optional</span>
              </label>
              <textarea
                value={form.description}
                onChange={e => patch('description', e.target.value)}
                placeholder="A short description visible to users…"
                rows={2}
                className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent resize-none"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-[13px] font-semibold text-gray-800 mb-1.5">
                Tags
                <span className="ml-1.5 text-[11px] font-normal text-gray-400">optional · comma-separated</span>
              </label>
              <input
                type="text"
                value={form.tags}
                onChange={e => patch('tags', e.target.value)}
                placeholder="e.g. Lent, Prayer, Series"
                className="w-full px-3.5 py-2.5 text-[14px] text-gray-900 placeholder:text-gray-400 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent"
              />
            </div>

            {error && (
              <p className="text-[13px] text-red-600 font-medium">{error}</p>
            )}
          </div>
        </div>

        {/* ── Footer — always visible ───────────────────────────────────────── */}
        <div className="flex-shrink-0 px-5 py-4 border-t border-gray-100">
          <button
            onClick={handleCreate}
            disabled={primaryDisabled}
            className="w-full h-12 rounded-2xl text-[15px] font-semibold transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed bg-teal-600 hover:bg-teal-700 text-white"
          >
            {saving
              ? <><Loader2 size={15} className="animate-spin" /><span>Creating…</span></>
              : <span>Create Collection</span>
            }
          </button>
        </div>

      </div>
    </div>
  );
}
