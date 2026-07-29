/**
 * StudioJourneyEditor — Notion-inspired writing environment for Journeys.
 *
 * Layout:
 *   LEFT  (collapsible, 240px): Journey overview + step list
 *   CENTER (flex-1): Writing canvas — journey header or block editor
 *   RIGHT (collapsible, 288px): Preview / Settings tabs
 *
 * Design principles:
 *   - One primary action per screen
 *   - White space > buttons
 *   - Writing feels creative, not administrative
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Plus, Trash2, Eye, Check, Clock, AlertCircle,
  Settings, ChevronLeft, ChevronRight, PanelLeftClose,
  PanelLeftOpen, PanelRightClose, PanelRightOpen, BookOpen,
  FileText, Smartphone, Tablet, Monitor, GripVertical, ImageIcon,
  Sparkles, X as XIcon, ChevronDown, ChevronUp, Headphones, Layers, Loader2,
  FolderOpen,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { Journey, Step } from '@/contexts/JourneyContext';
import { getJourney as fetchJourneyById, deleteJourney as apiDeleteJourney } from '@/lib/journeys-api';
import { listCollections, createCollection } from '@/lib/collections-api';
import type { Collection } from '@/lib/collections-api';
import { Block, stepToBlocks, blocksToCanonical, createBlock } from '@/lib/blocks';
import { ConfirmDialog, StatusBadge, ContentStudioToolbar } from '../shared';
import { useAuth } from '@/contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepWithBlocks extends Step {
  blocks: Block[];
  isDirty: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
type SelectedView = 'overview' | number; // number = step day
type RightTab = 'preview' | 'settings';
type PreviewSize = 'phone' | 'tablet' | 'desktop';

interface Props {
  journeyId: string;
  onBack: () => void;
  onLegacyEditor: () => void;
}

// ─── Save indicator ───────────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null;
  return (
    <span className={`flex items-center gap-1.5 text-xs transition-all ${
      status === 'saving' ? 'text-gray-400' :
      status === 'saved'  ? 'text-emerald-600' :
                            'text-red-500'
    }`}>
      {status === 'saving' && <><Clock size={11} className="animate-spin" /> Saving…</>}
      {status === 'saved'  && <><Check size={11} /> Saved</>}
      {status === 'error'  && <><AlertCircle size={11} /> Could not save</>}
    </span>
  );
}

// ─── Journey overview writing header (center panel, overview selected) ────────

function JourneyHeader({
  journey,
  form,
  onPatch,
  onBlur,
}: {
  journey: Journey;
  form: Partial<Journey>;
  onPatch: (k: keyof Journey, v: string) => void;
  onBlur: () => void;
}) {
  return (
    <div className="max-w-2xl mx-auto px-8 pt-12 pb-16 space-y-1">
      {/* Cover image placeholder */}
      <div className="h-36 rounded-2xl bg-gradient-to-br from-teal-50 to-teal-100 border border-teal-100 flex items-center justify-center mb-8 group cursor-pointer hover:from-teal-100 hover:to-teal-200 transition-colors">
        {journey.coverImageUrl ? (
          <img src={journey.coverImageUrl} alt="Cover" className="w-full h-full object-cover rounded-2xl" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-teal-400 group-hover:text-teal-500 transition-colors">
            <ImageIcon size={28} />
            <span className="text-xs font-medium">Add cover image</span>
          </div>
        )}
      </div>

      {/* Title */}
      <input
        type="text"
        value={form.title ?? journey.title}
        onChange={e => onPatch('title', e.target.value)}
        onBlur={onBlur}
        className="w-full text-3xl font-bold text-gray-900 bg-transparent border-none outline-none placeholder:text-gray-300 leading-tight"
        placeholder="Journey title…"
        style={{ fontFamily: '"Crimson Pro", Georgia, serif' }}
      />

      {/* Subtitle */}
      <input
        type="text"
        value={(form as any).subtitle ?? journey.subtitle ?? ''}
        onChange={e => onPatch('subtitle' as keyof Journey, e.target.value)}
        onBlur={onBlur}
        className="w-full text-lg text-gray-500 bg-transparent border-none outline-none placeholder:text-gray-300 mt-1"
        placeholder="Subtitle (optional)…"
      />

      {/* Description */}
      <textarea
        value={(form as any).description ?? journey.description ?? ''}
        onChange={e => onPatch('description' as keyof Journey, e.target.value)}
        onBlur={onBlur}
        rows={4}
        className="w-full mt-6 text-base text-gray-700 bg-transparent border-none outline-none resize-none placeholder:text-gray-300 leading-relaxed"
        placeholder="Describe this journey — who is it for, and what will they discover?"
      />

      {/* Metadata row */}
      <div className="flex items-center gap-6 pt-6 border-t border-gray-100 mt-8">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Duration</label>
          <input
            type="number"
            value={(form as any).durationDays ?? journey.durationDays ?? ''}
            onChange={e => onPatch('durationDays' as keyof Journey, e.target.value)}
            onBlur={onBlur}
            min={1}
            className="w-16 text-sm text-gray-700 border-b border-gray-200 focus:border-teal-400 outline-none bg-transparent text-center pb-0.5"
          />
          <span className="text-xs text-gray-400">days</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-400 uppercase tracking-wide">Type</label>
          <select
            value={(form as any).journeyType ?? journey.journeyType ?? 'core'}
            onChange={e => onPatch('journeyType' as keyof Journey, e.target.value)}
            onBlur={onBlur}
            className="text-sm text-gray-700 border-b border-gray-200 focus:border-teal-400 outline-none bg-transparent pb-0.5"
          >
            {['core', 'companion', 'series', 'course'].map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
      </div>

      {/* Tags */}
      {journey.tags && journey.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-3">
          {journey.tags.map(tag => (
            <span key={tag} className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">{tag}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step preview (right panel) ───────────────────────────────────────────────

const PREVIEW_SIZES: { id: PreviewSize; icon: React.ElementType; label: string; width: string }[] = [
  { id: 'phone',   icon: Smartphone, label: 'Phone',   width: '375px'  },
  { id: 'tablet',  icon: Tablet,     label: 'Tablet',  width: '768px'  },
  { id: 'desktop', icon: Monitor,    label: 'Desktop', width: '100%'   },
];

function StepPreview({ step, size, onSizeChange }: {
  step: StepWithBlocks;
  size: PreviewSize;
  onSizeChange: (s: PreviewSize) => void;
}) {
  return (
    <div className="flex flex-col h-full">
      {/* Viewport switcher */}
      <div className="flex items-center justify-center gap-1 px-4 py-2 border-b border-gray-100">
        {PREVIEW_SIZES.map(({ id, icon: Icon, label }) => (
          <button
            key={id}
            onClick={() => onSizeChange(id)}
            title={label}
            className={`p-1.5 rounded-lg transition-colors ${
              size === id ? 'bg-teal-50 text-teal-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div
          className="mx-auto bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden transition-all"
          style={{ maxWidth: PREVIEW_SIZES.find(s => s.id === size)?.width }}
        >
          <div className="p-5 space-y-4">
            <div className="font-bold text-gray-900 text-base leading-snug" style={{ fontFamily: '"Crimson Pro", Georgia, serif' }}>
              {step.title || 'Untitled Step'}
            </div>
            {step.blocks.map(b => (
              <div key={b.id}>
                {b.type === 'paragraph' && (b.content as any).text && (
                  <p className="text-gray-700 leading-relaxed text-sm">{(b.content as any).text}</p>
                )}
                {b.type === 'heading' && (b.content as any).text && (
                  <p className="font-semibold text-gray-900 text-base">{(b.content as any).text}</p>
                )}
                {b.type === 'scripture' && (
                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                    <div className="font-semibold text-teal-700 text-xs mb-1.5">{(b.content as any).reference}</div>
                    {(b.content as any).text && <p className="text-gray-700 italic text-sm leading-relaxed">{(b.content as any).text}</p>}
                  </div>
                )}
                {b.type === 'reflection' && (b.content as any).question && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                    <div className="text-xs font-semibold text-amber-700 mb-1.5">Reflect</div>
                    <p className="text-gray-700 text-sm">{(b.content as any).question}</p>
                  </div>
                )}
                {b.type === 'prayer' && (b.content as any).text && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4">
                    <div className="text-xs font-semibold text-indigo-700 mb-1.5">Prayer</div>
                    <p className="text-gray-700 italic text-sm leading-relaxed">{(b.content as any).text}</p>
                  </div>
                )}
                {b.type === 'action' && (b.content as any).text && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                    <div className="text-xs font-semibold text-emerald-700 mb-1.5">This week</div>
                    <p className="text-gray-700 text-sm">{(b.content as any).text}</p>
                  </div>
                )}
                {b.type === 'memory-verse' && (b.content as any).text && (
                  <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                    <div className="text-xs font-semibold text-yellow-700 mb-1.5">Remember · {(b.content as any).reference}</div>
                    <p className="text-gray-700 italic text-sm leading-relaxed">{(b.content as any).text}</p>
                  </div>
                )}
                {b.type === 'quote' && (b.content as any).text && (
                  <div className="border-l-4 border-gray-200 pl-4 italic text-gray-600 text-sm leading-relaxed">
                    {(b.content as any).text}
                    {(b.content as any).attribution && (
                      <span className="block text-xs text-gray-400 mt-1 not-italic">— {(b.content as any).attribution}</span>
                    )}
                  </div>
                )}
                {b.type === 'callout' && (b.content as any).text && (
                  <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 flex gap-3">
                    <span className="text-base">{(b.content as any).emoji || '💡'}</span>
                    <p className="text-sm text-gray-700 leading-relaxed">{(b.content as any).text}</p>
                  </div>
                )}
                {b.type === 'divider' && <hr className="border-gray-100" />}
                {b.type === 'completion' && (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                    <p className="text-emerald-700 font-medium text-sm">{(b.content as any).message || 'Well done.'}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Step settings (right panel) ─────────────────────────────────────────────

function StepSettings({ step, onChange }: { step: StepWithBlocks; onChange: (s: Partial<Step>) => void }) {
  return (
    <div className="p-5 space-y-6">
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Reading Time</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={step.estimatedReadingTime ?? ''}
            onChange={e => onChange({ estimatedReadingTime: e.target.value ? Number(e.target.value) : undefined })}
            className="w-20 px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent bg-gray-50"
            min={1}
            placeholder="5"
          />
          <span className="text-sm text-gray-500">minutes</span>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Default Translation</label>
        <select
          value={step.preferredTranslation ?? 'NIV'}
          onChange={e => onChange({ preferredTranslation: e.target.value })}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 focus:border-transparent bg-gray-50"
        >
          {['NIV', 'ESV', 'KJV', 'NKJV', 'NLT', 'CSB', 'BSB'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}

// ─── Journey settings (right panel, overview selected) ───────────────────────

function JourneySettings({ journey, form, onPatch, onBlur }: {
  journey: Journey;
  form: Partial<Journey>;
  onPatch: (k: keyof Journey, v: string | boolean) => void;
  onBlur: () => void;
}) {
  const { user } = useAuth();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newColTitle, setNewColTitle] = useState('');
  const [newColDesc, setNewColDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    listCollections().then(setCollections).catch(() => {});
  }, []);

  const handleCreateCollection = async () => {
    if (!newColTitle.trim()) { setCreateError('Collection name is required.'); return; }
    setCreating(true); setCreateError('');
    try {
      const created = await createCollection(
        { title: newColTitle.trim(), description: newColDesc.trim() || undefined, status: 'Draft' },
        user?.id
      );
      setCollections(prev => [...prev, created]);
      onPatch('collectionId' as keyof Journey, created.id);
      onBlur();
      setShowNewCollection(false);
      setNewColTitle(''); setNewColDesc('');
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : 'Could not create collection');
    } finally {
      setCreating(false);
    }
  };

  const currentCollectionId = (form as any).collectionId ?? (journey as any).collectionId ?? '';

  return (
    <div className="p-5 space-y-6">
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Status</label>
        <select
          value={(form as any).status ?? journey.status}
          onChange={e => { onPatch('status' as keyof Journey, e.target.value); onBlur(); }}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-gray-50"
        >
          {/* Daily Rhythm is a permanent practice — it can only be Draft or Published,
              never archived or moved through a pastoral review workflow. */}
          {(journey.journeyType === 'daily-rhythm'
            ? ['Draft', 'Published']
            : ['Draft', 'Pastoral Review', 'Approved', 'Published', 'Archived']
          ).map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Collection assignment — not shown for Daily Rhythm (it's a single track) */}
      {journey.journeyType !== 'daily-rhythm' && (
        <div>
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Collection</label>
          <select
            value={currentCollectionId}
            onChange={e => { onPatch('collectionId' as keyof Journey, e.target.value); onBlur(); }}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-gray-50"
          >
            <option value="">None (standalone)</option>
            {collections.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          {currentCollectionId && collections.find(c => c.id === currentCollectionId) && (
            <p className="text-[11px] text-purple-600 mt-1.5 flex items-center gap-1">
              <FolderOpen size={10} />
              {collections.find(c => c.id === currentCollectionId)!.title}
            </p>
          )}

          {/* Inline "Create New Collection" */}
          {!showNewCollection ? (
            <button
              type="button"
              onClick={() => setShowNewCollection(true)}
              className="mt-2 text-[11px] text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1 transition-colors"
            >
              <Plus size={11} /> Create New Collection
            </button>
          ) : (
            <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2.5">
              <p className="text-xs font-semibold text-gray-700">New Collection</p>
              <input
                type="text"
                value={newColTitle}
                onChange={e => setNewColTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateCollection()}
                placeholder="Collection name *"
                autoFocus
                className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
              />
              <input
                type="text"
                value={newColDesc}
                onChange={e => setNewColDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-2.5 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
              />
              {createError && <p className="text-[11px] text-red-600">{createError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleCreateCollection}
                  disabled={creating || !newColTitle.trim()}
                  className="flex-1 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating…' : 'Create'}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowNewCollection(false); setNewColTitle(''); setNewColDesc(''); setCreateError(''); }}
                  className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Journey Type</label>
        <select
          value={(form as any).journeyType ?? journey.journeyType}
          onChange={e => { onPatch('journeyType' as keyof Journey, e.target.value); onBlur(); }}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-gray-50"
        >
          {['core', 'companion', 'series', 'course'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Duration (days)</label>
        <input
          type="number"
          value={(form as any).durationDays ?? journey.durationDays ?? ''}
          onChange={e => onPatch('durationDays' as keyof Journey, e.target.value)}
          onBlur={onBlur}
          min={1}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-gray-50"
        />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-gray-700">Church-wide</div>
          <div className="text-xs text-gray-400 mt-0.5">Feature this journey for everyone</div>
        </div>
        <button
          onClick={() => { onPatch('churchWide' as keyof Journey, !(((form as any).churchWide ?? journey.churchWide))); onBlur(); }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            ((form as any).churchWide ?? journey.churchWide) ? 'bg-teal-600' : 'bg-gray-200'
          }`}
        >
          <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            ((form as any).churchWide ?? journey.churchWide) ? 'translate-x-4.5' : 'translate-x-0.5'
          }`} />
        </button>
      </div>
    </div>
  );
}

// ─── Step field editor (center panel, step selected) ─────────────────────────

function StepFieldEditor({
  step,
  titleRef,
  onMetaChange,
}: {
  step: StepWithBlocks;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onMetaChange: (changes: Partial<Step>) => void;
}) {
  const inputCls =
    'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 ' +
    'placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-400/30 ' +
    'focus:border-teal-400 transition-colors bg-white';
  const textareaCls = inputCls + ' resize-y leading-relaxed';

  function FieldBlock({
    label,
    hint,
    children,
  }: {
    label: string;
    hint?: string;
    children: React.ReactNode;
  }) {
    return (
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
          {label}
        </label>
        {children}
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
      <div className="text-[11px] font-semibold text-teal-600 uppercase tracking-widest">
        Step {step.day}
      </div>

      <FieldBlock label="Step Title">
        <input
          ref={titleRef}
          type="text"
          value={step.title}
          onChange={e => onMetaChange({ title: e.target.value })}
          placeholder="Enter step title"
          className={inputCls}
          autoComplete="off"
        />
      </FieldBlock>

      <FieldBlock label="Introduction" hint="Optional opening for this step.">
        <textarea
          value={step.mentorIntro ?? ''}
          onChange={e => onMetaChange({ mentorIntro: e.target.value })}
          rows={3}
          placeholder="Begin this step with…"
          className={textareaCls}
        />
      </FieldBlock>

      <FieldBlock label="Scripture">
        <input
          type="text"
          value={step.scripture ?? ''}
          onChange={e => onMetaChange({ scripture: e.target.value })}
          placeholder="e.g. John 3:16–17"
          className={inputCls + ' font-mono text-[13px]'}
          autoComplete="off"
        />
      </FieldBlock>

      <FieldBlock label="Content">
        <textarea
          value={step.devotional ?? ''}
          onChange={e => onMetaChange({ devotional: e.target.value })}
          rows={8}
          placeholder="The main content for this step…"
          className={textareaCls}
        />
      </FieldBlock>

      <FieldBlock label="Prayer">
        <textarea
          value={step.prayerPrompt ?? ''}
          onChange={e => onMetaChange({ prayerPrompt: e.target.value })}
          rows={4}
          placeholder="Lord,…"
          className={textareaCls}
        />
      </FieldBlock>

      <FieldBlock label="Next Step">
        <textarea
          value={step.actionStep ?? ''}
          onChange={e => onMetaChange({ actionStep: e.target.value })}
          rows={2}
          placeholder="One practical response to this step…"
          className={textareaCls}
        />
      </FieldBlock>
    </div>
  );
}

// ─── AI Review Banner ─────────────────────────────────────────────────────────

function AIReviewBanner({ journey, onDismiss }: { journey: Journey; onDismiss: () => void }) {
  const [showSources, setShowSources] = useState(false);
  const sources = journey.sourcesSummary;

  return (
    <div className="mx-8 mt-6 rounded-2xl border border-teal-200 bg-teal-50 overflow-hidden">
      <div className="flex items-start gap-3 p-4">
        <div className="w-7 h-7 rounded-lg bg-teal-500 flex items-center justify-center flex-shrink-0 mt-0.5">
          <Sparkles size={13} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-teal-900">AI-generated draft — please review</p>
          <p className="text-xs text-teal-700 mt-0.5 leading-relaxed">
            This Journey was created by Emmaus AI. Review each step for accuracy, pastoral tone, and doctrinal soundness before publishing.
            Scripture text was verified at generation time — check any quoted verses match your preferred translation.
          </p>
          {sources && (
            <button
              onClick={() => setShowSources(v => !v)}
              className="flex items-center gap-1 mt-2 text-xs font-medium text-teal-600 hover:text-teal-800 transition-colors"
            >
              {showSources ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showSources ? 'Hide sources' : 'Show sources used'}
            </button>
          )}
        </div>
        <button onClick={onDismiss} className="text-teal-400 hover:text-teal-600 flex-shrink-0">
          <XIcon size={14} />
        </button>
      </div>

      {showSources && sources && (
        <div className="border-t border-teal-100 px-4 py-3 grid grid-cols-3 gap-4">
          {sources.scriptureReferences.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <BookOpen size={10} /> Scripture
              </p>
              {sources.scriptureReferences.map(r => (
                <p key={r} className="text-xs text-teal-800">{r}</p>
              ))}
            </div>
          )}
          {sources.sermonsUsed.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Headphones size={10} /> Sermons
              </p>
              {sources.sermonsUsed.map(s => (
                <div key={s.title} className="mb-1">
                  <p className="text-xs text-teal-800 leading-tight">{s.title}</p>
                  <p className="text-[10px] text-teal-500">{s.date}</p>
                </div>
              ))}
            </div>
          )}
          {sources.generatedSections.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-teal-600 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                <Layers size={10} /> AI-written
              </p>
              {sources.generatedSections.map(s => (
                <p key={s} className="text-xs text-teal-800">{s}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudioJourneyEditor({ journeyId, onBack, onLegacyEditor }: Props) {
  const { getJourney, getStepsForJourney, updateJourney, updateStep, addStep, deleteStep } = useJourney();
  const { user } = useAuth();

  // Try to find the journey in context first (fast path).
  // When navigating immediately after creation, React may not have committed the
  // setJourneys state update yet, so we fall back to a direct API fetch.
  const contextJourney = getJourney(journeyId);
  const [localJourney, setLocalJourney] = useState<Journey | null>(null);
  const [journeyLoading, setJourneyLoading] = useState(!contextJourney);
  const [journeyNotFound, setJourneyNotFound] = useState(false);

  useEffect(() => {
    if (contextJourney) {
      setJourneyLoading(false);
      return;
    }
    setJourneyLoading(true);
    setJourneyNotFound(false);
    fetchJourneyById(journeyId)
      .then(j => {
        setLocalJourney(j as unknown as Journey);
        setJourneyLoading(false);
      })
      .catch(() => {
        setJourneyNotFound(true);
        setJourneyLoading(false);
      });
  }, [journeyId, contextJourney]);

  const journey = contextJourney ?? localJourney;
  const rawSteps = getStepsForJourney(journeyId);

  const [stepsWithBlocks, setStepsWithBlocks] = useState<StepWithBlocks[]>([]);
  const [selectedView, setSelectedView] = useState<SelectedView>('overview');
  const [rightTab, setRightTab] = useState<RightTab>('settings');
  const [previewSize, setPreviewSize] = useState<PreviewSize>('phone');
  const [saveStatus, setSaveStatus] = useState<Record<number, SaveStatus>>({});
  const [journeyForm, setJourneyForm] = useState<Partial<Journey>>({});
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);
  // Journey-level toolbar state
  const [journeySaving, setJourneySaving] = useState<'saving' | 'publishing' | 'unpublishing' | 'deleting' | null>(null);
  const [journeySuccessMsg, setJourneySuccessMsg] = useState('');
  const [journeyErrorMsg, setJourneyErrorMsg] = useState('');
  const [confirmDeleteJourney, setConfirmDeleteJourney] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [aiBannerDismissed, setAiBannerDismissed] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const hasAutoSelectedStep = useRef(false);

  const autosaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const hasUnsaved = stepsWithBlocks.some(s => s.isDirty);

  // Keep a ref to stepsWithBlocks so autosave callbacks always read the latest state.
  const stepsRef = useRef<StepWithBlocks[]>([]);
  useEffect(() => { stepsRef.current = stepsWithBlocks; }, [stepsWithBlocks]);

  // ─── Initialise steps ─────────────────────────────────────────────────────

  useEffect(() => {
    const initialised: StepWithBlocks[] = rawSteps.map(step => {
      const existing = stepsWithBlocks.find(s => s.day === step.day);
      if (existing) return existing;
      const savedBlocks = (step as Step & { blocks?: Array<Record<string, unknown>> | null }).blocks;
      let blocks: Block[];
      let canonicalFromBlocks: Partial<Step> = {};
      if (savedBlocks && savedBlocks.length > 0) {
        // Backfill missing IDs — guards against AI-generated or legacy blocks stored without UUIDs
        blocks = (savedBlocks as unknown as Block[]).map(b =>
          b.id ? b : { ...b, id: crypto.randomUUID() }
        );
        // Extract canonical fields from older block-format steps so the structured editor
        // can display the content immediately without the admin having to re-enter it.
        canonicalFromBlocks = blocksToCanonical(blocks);
      } else {
        blocks = stepToBlocks(step);
      }
      return { ...step, ...canonicalFromBlocks, blocks, isDirty: false };
    });
    setStepsWithBlocks(initialised);

    // Auto-select the first step on initial load so the editor is immediately visible.
    if (!hasAutoSelectedStep.current && initialised.length > 0) {
      hasAutoSelectedStep.current = true;
      setSelectedView(initialised[0].day);
    }
  }, [rawSteps.length]);

  useEffect(() => {
    if (journey) {
      setJourneyForm({
        title: journey.title,
        status: journey.status,
        journeyType: journey.journeyType,
      });
    }
  }, [journeyId]);

  // ─── Autosave ─────────────────────────────────────────────────────────────

  const saveStep = useCallback(async (day: number) => {
    const stepData = stepsRef.current.find(s => s.day === day);
    if (!stepData) return;
    setSaveStatus(s => ({ ...s, [day]: 'saving' }));
    try {
      // Canonical fields are edited directly in StepFieldEditor.
      // Regenerate blocks from canonical so the right-panel preview stays in sync.
      const blocks = stepToBlocks(stepData) as unknown as Array<Record<string, unknown>>;
      await updateStep({
        ...stepData,
        blocks,
      } as Step & { blocks: typeof blocks });
      setStepsWithBlocks(ss => ss.map(s => s.day === day ? { ...s, isDirty: false } : s));
      setSaveStatus(s => ({ ...s, [day]: 'saved' }));
      setTimeout(() => setSaveStatus(s => ({ ...s, [day]: 'idle' })), 2500);
    } catch {
      setSaveStatus(s => ({ ...s, [day]: 'error' }));
    }
  }, [updateStep]);

  const scheduleSave = useCallback((day: number) => {
    if (autosaveTimers.current[day]) clearTimeout(autosaveTimers.current[day]);
    autosaveTimers.current[day] = setTimeout(() => saveStep(day), 1500);
  }, [saveStep]);

  // ─── Block / step changes ─────────────────────────────────────────────────

  const handleBlocksChange = useCallback((day: number, blocks: Block[]) => {
    setStepsWithBlocks(ss => ss.map(s => s.day === day ? { ...s, blocks, isDirty: true } : s));
    scheduleSave(day);
  }, [scheduleSave]);

  const handleStepMetaChange = useCallback((day: number, changes: Partial<Step>) => {
    setStepsWithBlocks(ss => ss.map(s => {
      if (s.day !== day) return s;
      const updated = { ...s, ...changes, isDirty: true } as StepWithBlocks;
      // Keep blocks in sync with canonical fields so the right-panel preview stays live.
      updated.blocks = stepToBlocks(updated);
      return updated;
    }));
    scheduleSave(day);
  }, [scheduleSave]);

  const patchJourney = useCallback((k: keyof Journey, v: string | boolean) => {
    setJourneyForm(f => ({ ...f, [k]: v }));
  }, []);

  // ─── Step management ──────────────────────────────────────────────────────

  const handleAddStep = async () => {
    if (!journey) return;
    const nextDay = rawSteps.length > 0 ? Math.max(...rawSteps.map(s => s.day)) + 1 : 1;
    const newStep = await addStep({
      journeyId,
      day: nextDay,
      title: 'Untitled Step',
      status: 'Draft',
      mentorIntro: '', scripture: '', devotional: '',
      reflectionQuestion: '', prayerPrompt: '', actionStep: '',
    });
    const blocks: Block[] = [createBlock('paragraph')];
    setStepsWithBlocks(ss => [...ss, { ...newStep, blocks, isDirty: false }]);
    setSelectedView(nextDay);
    // Focus the title in the step header after render
    setTimeout(() => titleInputRef.current?.focus(), 100);
  };

  const handleDeleteStep = async (day: number) => {
    await deleteStep(journeyId, day);
    setStepsWithBlocks(ss => ss.filter(s => s.day !== day));
    if (selectedView === day) {
      const remaining = stepsWithBlocks.filter(s => s.day !== day);
      setSelectedView(remaining.length > 0 ? remaining[0].day : 'overview');
    }
    setDeleteTarget(null);
  };

  const handleSaveJourney = useCallback(async () => {
    if (!journey) return;
    await updateJourney({ ...journey, ...journeyForm } as Journey);
  }, [journey, journeyForm, updateJourney]);

  const handleSaveDraftJourney = useCallback(async () => {
    if (!journey) return;
    setJourneySaving('saving');
    setJourneySuccessMsg('');
    setJourneyErrorMsg('');
    try {
      await updateJourney({ ...journey, ...journeyForm } as Journey);
      setJourneySuccessMsg('Draft saved successfully.');
      setTimeout(() => setJourneySuccessMsg(''), 3000);
    } catch {
      setJourneyErrorMsg('Save failed — please try again.');
      setTimeout(() => setJourneyErrorMsg(''), 4000);
    } finally {
      setJourneySaving(null);
    }
  }, [journey, journeyForm, updateJourney]);

  const handlePublishJourney = useCallback(async () => {
    if (!journey) return;
    setJourneySaving('publishing');
    setJourneySuccessMsg('');
    setJourneyErrorMsg('');
    try {
      await updateJourney({ ...journey, ...journeyForm, status: 'Published' } as Journey);
      setJourneyForm(f => ({ ...f, status: 'Published' }));
      setJourneySuccessMsg('Published successfully.');
      setTimeout(() => setJourneySuccessMsg(''), 3000);
    } catch {
      setJourneyErrorMsg('Failed to publish.');
      setTimeout(() => setJourneyErrorMsg(''), 4000);
    } finally {
      setJourneySaving(null);
    }
  }, [journey, journeyForm, updateJourney]);

  const handleUnpublishJourney = useCallback(async () => {
    if (!journey) return;
    setJourneySaving('unpublishing');
    setJourneySuccessMsg('');
    setJourneyErrorMsg('');
    try {
      await updateJourney({ ...journey, ...journeyForm, status: 'Draft' } as Journey);
      setJourneyForm(f => ({ ...f, status: 'Draft' }));
      setJourneySuccessMsg('Unpublished successfully.');
      setTimeout(() => setJourneySuccessMsg(''), 3000);
    } catch {
      setJourneyErrorMsg('Failed to unpublish.');
      setTimeout(() => setJourneyErrorMsg(''), 4000);
    } finally {
      setJourneySaving(null);
    }
  }, [journey, journeyForm, updateJourney]);

  const handleDeleteJourney = useCallback(async () => {
    if (!journey) return;
    setJourneySaving('deleting');
    try {
      await apiDeleteJourney(journey.id, user?.id);
      setConfirmDeleteJourney(false);
      onBack();
    } catch {
      setJourneyErrorMsg('Failed to delete journey.');
      setConfirmDeleteJourney(false);
      setTimeout(() => setJourneyErrorMsg(''), 4000);
    } finally {
      setJourneySaving(null);
    }
  }, [journey, user?.id, onBack]);

  const handleBackClick = () => {
    if (hasUnsaved) setConfirmBack(true);
    else onBack();
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const selectedStep = typeof selectedView === 'number'
    ? (stepsWithBlocks.find(s => s.day === selectedView) ?? null)
    : null;

  const currentSaveStatus: SaveStatus = selectedStep
    ? (saveStatus[selectedStep.day] ?? 'idle')
    : 'idle';

  // Show unsaved indicator only when actively dirty (not during save cycle)
  const showUnsaved = selectedStep?.isDirty && currentSaveStatus === 'idle';

  if (journeyLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm gap-2">
        <Loader2 size={16} className="animate-spin" /> Loading journey…
      </div>
    );
  }

  if (!journey || journeyNotFound) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        Journey not found.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <ContentStudioToolbar
        onBack={handleBackClick}
        title={journey?.title ?? 'Journey'}
        status={journeyForm.status ?? journey?.status}
        isSaving={journeySaving === 'saving'}
        isPublishing={journeySaving === 'publishing' || journeySaving === 'unpublishing'}
        successMessage={journeySuccessMsg}
        errorMessage={journeyErrorMsg}
        onSaveDraft={handleSaveDraftJourney}
        onPublish={handlePublishJourney}
        onUnpublish={handleUnpublishJourney}
        onDelete={() => setConfirmDeleteJourney(true)}
      />

      <div className="flex flex-1 min-h-0 overflow-hidden bg-gray-50">

      {/* ── LEFT PANEL ──────────────────────────────────────────────────────── */}
      <div className={`flex-shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-0 transition-all duration-200 ${leftOpen ? 'w-60' : 'w-10'}`}>
        {leftOpen ? (
          <>
            {/* Collapse button */}
            <div className="flex-shrink-0 flex items-center justify-end px-3 pt-3 pb-2">
              <button
                onClick={() => setLeftOpen(false)}
                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Collapse sidebar"
              >
                <PanelLeftClose size={14} />
              </button>
            </div>

            {/* Journey section */}
            <div className="flex-shrink-0 px-2 pb-2">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-1 mb-1">Journey</div>
              <button
                onClick={() => setSelectedView('overview')}
                className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors ${
                  selectedView === 'overview'
                    ? 'bg-teal-50 text-teal-800'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <BookOpen size={13} className={selectedView === 'overview' ? 'text-teal-600' : 'text-gray-400'} />
                <span className="text-[13px] font-medium truncate">Overview</span>
              </button>
              <button
                onClick={() => { setSelectedView('overview'); setRightTab('settings'); setRightOpen(true); }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <FileText size={13} className="text-gray-400" />
                <span className="text-[13px] font-medium truncate">Journey Settings</span>
              </button>
            </div>

            <div className="mx-3 border-t border-gray-100" />

            {/* Steps section */}
            <div className="flex-shrink-0 px-2 pt-2 pb-1">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-1">Steps</div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
              {stepsWithBlocks.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs text-gray-400 leading-relaxed px-2">
                    This Journey is ready for its first step.
                  </p>
                </div>
              ) : (
                stepsWithBlocks.map(s => {
                  const active = selectedView === s.day;
                  const status = saveStatus[s.day];
                  return (
                    <button
                      key={s.day}
                      onClick={() => setSelectedView(s.day)}
                      className={`w-full flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-left transition-colors group ${
                        active ? 'bg-teal-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      {/* Day number */}
                      <span className={`text-[11px] font-bold w-5 flex-shrink-0 tabular-nums ${
                        active ? 'text-teal-600' : 'text-gray-400'
                      }`}>
                        {s.day}
                      </span>
                      {/* Title */}
                      <div className="flex-1 min-w-0">
                        <div className={`text-[13px] font-medium truncate leading-tight ${
                          active ? 'text-teal-900' : 'text-gray-700'
                        }`}>
                          {s.title || 'Untitled Step'}
                        </div>
                        {s.estimatedReadingTime && (
                          <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                            <Clock size={9} /> {s.estimatedReadingTime} min
                          </div>
                        )}
                      </div>
                      {/* Status indicators */}
                      <div className="flex-shrink-0 flex items-center gap-1">
                        {s.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved" />}
                        {status === 'saved' && <Check size={10} className="text-emerald-500" />}
                        {status === 'error' && <AlertCircle size={10} className="text-red-400" />}
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteTarget(s.day); }}
                          className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-300 transition-all"
                          title="Delete step"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Add Step */}
            <div className="flex-shrink-0 px-2 pb-3 border-t border-gray-100 pt-2">
              <button
                onClick={handleAddStep}
                className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors font-medium"
              >
                <Plus size={13} /> Add Step
              </button>
            </div>
          </>
        ) : (
          /* Collapsed state */
          <div className="flex flex-col items-center py-3 gap-2 h-full">
            <button
              onClick={() => setLeftOpen(true)}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
              title="Expand sidebar"
            >
              <PanelLeftOpen size={14} />
            </button>
            <div className="flex-1 flex flex-col items-center gap-1 overflow-hidden pt-1">
              {stepsWithBlocks.map(s => (
                <button
                  key={s.day}
                  onClick={() => { setSelectedView(s.day); setLeftOpen(true); }}
                  title={s.title}
                  className={`w-7 h-7 rounded-lg text-[11px] font-bold transition-colors ${
                    selectedView === s.day
                      ? 'bg-teal-50 text-teal-700'
                      : 'text-gray-400 hover:bg-gray-100'
                  }`}
                >
                  {s.day}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── CENTER PANEL ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        {/* Center top bar */}
        <div className="flex-shrink-0 bg-white border-b border-gray-100 px-6 py-2.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {!leftOpen && (
              <button onClick={() => setLeftOpen(true)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                <PanelLeftOpen size={14} />
              </button>
            )}
            {selectedView === 'overview' ? (
              <div className="flex items-center gap-2">
                <StatusBadge status={journey.status} />
                <span className="text-xs text-gray-400">{journey.durationDays} days</span>
              </div>
            ) : selectedStep ? (
              <span className="text-sm font-semibold text-gray-700 truncate">
                Step {selectedStep.day}
                {selectedStep.title ? ` — ${selectedStep.title}` : ''}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Autosave status */}
            {selectedStep && (
              <>
                {showUnsaved && (
                  <span className="text-xs text-amber-500 flex items-center gap-1">
                    <Clock size={11} /> Unsaved
                  </span>
                )}
                <SaveIndicator status={currentSaveStatus} />
              </>
            )}

            {/* Right panel toggle */}
            {!rightOpen && (
              <button
                onClick={() => setRightOpen(true)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Open panel"
              >
                <PanelRightOpen size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Writing area */}
        {selectedView === 'overview' ? (
          <div className="flex-1 overflow-y-auto bg-white">
            {/* AI Review banner */}
            {journey.aiGenerated && !aiBannerDismissed && (
              <AIReviewBanner
                journey={journey}
                onDismiss={() => setAiBannerDismissed(true)}
              />
            )}
            <JourneyHeader
              journey={journey}
              form={journeyForm}
              onPatch={patchJourney}
              onBlur={handleSaveJourney}
            />
          </div>
        ) : selectedStep ? (
          <div className="flex-1 overflow-y-auto bg-white">
            <StepFieldEditor
              step={selectedStep}
              titleRef={titleInputRef}
              onMetaChange={changes => handleStepMetaChange(selectedStep.day, changes)}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 bg-white">
            <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
              <BookOpen size={24} className="text-gray-300" />
            </div>
            <p className="text-sm font-medium text-gray-500">Select a step to begin writing</p>
            <p className="text-xs text-gray-400 mt-1">Or add a step using the sidebar.</p>
            <button
              onClick={handleAddStep}
              className="mt-5 px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded-xl hover:bg-teal-700 transition-colors"
            >
              Add First Step
            </button>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL ─────────────────────────────────────────────────────── */}
      {rightOpen && (
        <div className="w-72 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col min-h-0">
          {/* Tabs + collapse */}
          <div className="flex-shrink-0 flex items-center border-b border-gray-100">
            <div className="flex flex-1">
              {[
                { id: 'preview' as const,  label: 'Preview',  icon: Eye },
                { id: 'settings' as const, label: 'Settings', icon: Settings },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setRightTab(id)}
                  className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-colors ${
                    rightTab === id
                      ? 'border-teal-600 text-teal-700'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
                >
                  <Icon size={12} /> {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => setRightOpen(false)}
              className="px-2 py-3 text-gray-400 hover:text-gray-600 transition-colors"
              title="Collapse panel"
            >
              <PanelRightClose size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === 'preview' ? (
              selectedStep ? (
                <StepPreview
                  step={selectedStep}
                  size={previewSize}
                  onSizeChange={setPreviewSize}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                  <p className="text-xs text-gray-400">Select a step to preview it.</p>
                </div>
              )
            ) : selectedView === 'overview' ? (
              <JourneySettings
                journey={journey}
                form={journeyForm}
                onPatch={patchJourney}
                onBlur={handleSaveJourney}
              />
            ) : selectedStep ? (
              <StepSettings
                step={selectedStep}
                onChange={changes => handleStepMetaChange(selectedStep.day, changes)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-48 text-center px-6">
                <p className="text-xs text-gray-400">Select a step to see settings.</p>
              </div>
            )}
          </div>
        </div>
      )}

      </div>{/* end flex-1 min-h-0 panels wrapper */}

      {/* Dialogs */}
      {deleteTarget !== null && (
        <ConfirmDialog
          title="Remove Step"
          message={`Remove Day ${deleteTarget}? This cannot be undone.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => handleDeleteStep(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {confirmBack && (
        <ConfirmDialog
          title="Discard your unsaved changes?"
          message="Your changes will be lost."
          confirmLabel="Discard Changes"
          danger
          onConfirm={() => { setConfirmBack(false); onBack(); }}
          onCancel={() => setConfirmBack(false)}
        />
      )}
      {confirmDeleteJourney && (
        <ConfirmDialog
          title="Delete Journey?"
          message="This journey and all its steps will be permanently deleted. This cannot be undone."
          confirmLabel={journeySaving === 'deleting' ? 'Deleting…' : 'Delete Permanently'}
          danger
          onConfirm={handleDeleteJourney}
          onCancel={() => setConfirmDeleteJourney(false)}
        />
      )}
    </div>
  );
}
