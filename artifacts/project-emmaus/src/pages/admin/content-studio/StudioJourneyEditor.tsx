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

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
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
type SelectedView = 'overview' | 'introduction' | number; // number = step day (1-based)
type RightTab = 'preview' | 'settings';
type PreviewSize = 'phone' | 'tablet' | 'desktop';

interface Props {
  journeyId: string;
  onBack: () => void;
  onLegacyEditor: () => void;
}

// ─── Journey scaffold ─────────────────────────────────────────────────────────
// The scaffold is computed dynamically from the journey's actual steps so it
// handles any length — 3-day, 5-day, 10-day, AI-generated, or manually built.
// JOURNEY_SCAFFOLD_DEFAULT is the static fallback used before steps load.

type ScaffoldSection = { readonly day: number; readonly label: string; readonly shortLabel: string };

const JOURNEY_SCAFFOLD_DEFAULT: ScaffoldSection[] = [
  { day: 0, label: 'Walk Introduction', shortLabel: 'I' },
  { day: 1, label: 'Day 1',             shortLabel: '1' },
  { day: 2, label: 'Day 2',             shortLabel: '2' },
  { day: 3, label: 'Day 3',             shortLabel: '3' },
  { day: 4, label: 'Day 4',             shortLabel: '4' },
  { day: 5, label: 'Day 5',             shortLabel: '5' },
  { day: 6, label: 'Walk Complete',     shortLabel: '✓' },
];

function getSectionLabel(day: number, scaffold: ScaffoldSection[] = JOURNEY_SCAFFOLD_DEFAULT): string {
  return scaffold.find(s => s.day === day)?.label ?? (day === 0 ? 'Walk Introduction' : `Day ${day}`);
}

/** Returns the day number of the section that follows `currentDay`, or null if it is the last. */
function getNextScaffoldDay(currentDay: number, scaffold: ScaffoldSection[]): number | null {
  const idx = scaffold.findIndex(s => s.day === currentDay);
  if (idx === -1 || idx >= scaffold.length - 1) return null;
  return scaffold[idx + 1].day;
}

/**
 * A section is clickable when it already has content, or it is the very next
 * section after all previous ones are complete (sequential unlock).
 *
 * Journey Introduction (day 0) is always clickable — it is the entry point for
 * every journey and is stored on the journey record, not as a step.
 * Day 1 is unlocked once the intro has been saved (introIsComplete).
 * Subsequent days are unlocked once the preceding day is COMPLETE (has content).
 * A step that was opened but is still empty stays accessible but doesn't unlock later days.
 */

/**
 * A step is complete when it has been saved with meaningful content in at least one
 * key authoring field.  Existence alone (the step row was created by opening the section)
 * is NOT enough — this prevents empty sections from appearing as done.
 */
function isStepComplete(step: StepWithBlocks | undefined | null): boolean {
  if (!step) return false;
  // Block-based steps (AI-generated or block editor): any saved blocks = written
  if (step.blocks && step.blocks.length > 0) return true;
  // Legacy field-based steps
  return Boolean(
    step.devotional?.trim()  ||   // Reflection
    step.actionStep?.trim()  ||   // Today's Step
    step.prayerPrompt?.trim() ||  // Prayer
    step.mentorIntro?.trim()      // Welcome
  );
}

function isSectionClickable(
  sectionDay: number,
  stepsWithBlocks: StepWithBlocks[],
  introIsComplete: boolean,
  scaffold: ScaffoldSection[],
): boolean {
  if (sectionDay === 0) return true; // Intro always accessible
  // A section that's already been opened stays accessible regardless of content.
  if (stepsWithBlocks.some(s => s.day === sectionDay)) return true;
  // For sequential unlock, ALL preceding sections must be COMPLETE (not just opened).
  const idx = scaffold.findIndex(s => s.day === sectionDay);
  return scaffold.slice(0, idx).every(s => {
    if (s.day === 0) return introIsComplete;
    return isStepComplete(stepsWithBlocks.find(step => step.day === s.day));
  });
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
        placeholder="Walk title…"
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
        placeholder="Describe this walk — who is it for, and what will they discover?"
      />

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

function JourneySettings({ journey, form, onPatch, onBlur, onSaveNow }: {
  journey: Journey;
  form: Partial<Journey>;
  onPatch: (k: keyof Journey, v: string | boolean) => void;
  onBlur: () => void;
  onSaveNow: (k: keyof Journey, v: string | boolean | null | undefined) => void;
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
    if (!newColTitle.trim()) { setCreateError('Journey name is required.'); return; }
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
          <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Journey</label>
          <select
            value={currentCollectionId}
            onChange={e => { onPatch('collectionId' as keyof Journey, e.target.value); onBlur(); }}
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-gray-50"
          >
            <option value="">None (standalone walk)</option>
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
              <Plus size={11} /> Create New Journey
            </button>
          ) : (
            <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200 space-y-2.5">
              <p className="text-xs font-semibold text-gray-700">New Journey</p>
              <input
                type="text"
                value={newColTitle}
                onChange={e => setNewColTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateCollection()}
                placeholder="Journey name *"
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
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Walk Type</label>
        <select
          value={(form as any).journeyType ?? journey.journeyType}
          onChange={e => { onPatch('journeyType' as keyof Journey, e.target.value); onBlur(); }}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-gray-50"
        >
          {['core', 'companion', 'series', 'course'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Step Label</label>
        <select
          value={(form as any).stepLabelPrefix ?? (journey as any).stepLabelPrefix ?? ''}
          onChange={e => onSaveNow('stepLabelPrefix' as keyof Journey, e.target.value || null)}
          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-gray-50"
        >
          <option value="">Auto (Day for Daily Rhythm, Step for Walks)</option>
          <option value="Day">Day (Day 1, Day 2, …)</option>
          <option value="Step">Step (Step 1, Step 2, …)</option>
        </select>
        <p className="text-[11px] text-gray-400 mt-1">Per-step display labels can be set in the day editor.</p>
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

      {/* Theme Colour */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Theme Colour</label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={(form as any).themeColor ?? (journey as any).themeColor ?? '#14B8A6'}
            onChange={e => onPatch('themeColor' as keyof Journey, e.target.value)}
            onBlur={onBlur}
            className="h-9 w-14 rounded-lg border border-gray-200 cursor-pointer bg-gray-50 p-0.5"
            title="Pick a brand colour for this Walk"
          />
          <input
            type="text"
            value={(form as any).themeColor ?? (journey as any).themeColor ?? ''}
            onChange={e => {
              const v = e.target.value;
              if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onPatch('themeColor' as keyof Journey, v);
            }}
            onBlur={onBlur}
            placeholder="#14B8A6"
            maxLength={7}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-gray-50"
          />
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5">Hex colour used for future branded Walk experiences.</p>
      </div>

      {/* Version (read-only) */}
      <div>
        <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Version</label>
        <div className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl">
          <span className="text-sm text-gray-700 font-medium">v{(journey as any).version ?? 1}</span>
          <span className="text-[11px] text-gray-400">— increments automatically on each publish</span>
        </div>
      </div>
    </div>
  );
}

// ─── FieldBlock ───────────────────────────────────────────────────────────────
// IMPORTANT: This MUST remain a module-level component, never defined inside
// another component's render function.  Defining it inside StepFieldEditor
// causes React to treat it as a new type on every render, unmounting and
// remounting the DOM node — destroying cursor position, focus, and scroll state
// after every keystroke or autosave.

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

// ─── Step field editor (center panel, step selected) ─────────────────────────

function StepFieldEditor({
  step,
  titleRef,
  scaffold,
  onMetaChange,
  onSaveDraft,
  onContinue,
}: {
  step: StepWithBlocks;
  titleRef: React.RefObject<HTMLInputElement | null>;
  scaffold: ScaffoldSection[];
  onMetaChange: (changes: Partial<Step>) => void;
  onSaveDraft: () => void;
  /** null for the last section (Journey Complete) */
  onContinue: (() => void) | null;
}) {
  const inputCls =
    'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 ' +
    'placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-400/30 ' +
    'focus:border-teal-400 transition-colors bg-white';
  const textareaCls = inputCls + ' resize-y leading-relaxed';

  const nextDay = getNextScaffoldDay(step.day, scaffold);
  const continueLabel = nextDay !== null ? getSectionLabel(nextDay, scaffold) : null;

  return (
    <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
      <div className="text-[11px] font-semibold text-teal-600 uppercase tracking-widest">
        {getSectionLabel(step.day, scaffold)}
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

      <FieldBlock label="Welcome" hint="Optional opening paragraph for this step.">
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

      <FieldBlock label="Consider This">
        <textarea
          value={step.devotional ?? ''}
          onChange={e => onMetaChange({ devotional: e.target.value })}
          rows={8}
          placeholder="The main devotional reflection for this day…"
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

      <FieldBlock label="Your Next Step">
        <textarea
          value={step.actionStep ?? ''}
          onChange={e => onMetaChange({ actionStep: e.target.value })}
          rows={2}
          placeholder="One practical response to this step…"
          className={textareaCls}
        />
      </FieldBlock>

      <FieldBlock label="Closing" hint="Optional send-off at the bottom of the reading.">
        <textarea
          value={step.closingText ?? ''}
          onChange={e => onMetaChange({ closingText: e.target.value })}
          rows={2}
          placeholder="Walk with grace today."
          className={textareaCls}
        />
      </FieldBlock>

      <FieldBlock label="Looking Ahead" hint="One short paragraph introducing tomorrow's journey.">
        <textarea
          value={step.lookingAhead ?? ''}
          onChange={e => onMetaChange({ lookingAhead: e.target.value })}
          rows={3}
          placeholder="Tomorrow we'll explore…"
          className={textareaCls}
        />
      </FieldBlock>

      {/* ── Navigation buttons ────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
        <button
          onClick={onSaveDraft}
          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-all"
        >
          Save Draft
        </button>
        {onContinue && continueLabel && (
          <button
            onClick={onContinue}
            className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm"
          >
            Continue to {continueLabel} <ChevronRight size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Journey Introduction editor ──────────────────────────────────────────────
// Focused, distraction-free editor for the Journey Introduction.
// Saves to journey.introductionContent (metadata JSONB) — NOT as a step.
// Only shows: section heading, one large content textarea, Save Draft,
// Save & Continue to Day 1.

function JourneyIntroEditor({
  content,
  onChange,
  onSaveDraft,
  onContinue,
  saveStatus,
}: {
  content: string;
  onChange: (v: string) => void;
  onSaveDraft: () => void;
  onContinue: () => void;
  saveStatus: SaveStatus;
}) {
  const saving = saveStatus === 'saving';
  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <div className="text-[11px] font-semibold text-teal-600 uppercase tracking-widest mb-6">
        Walk Introduction
      </div>

      <textarea
        value={content}
        onChange={e => onChange(e.target.value)}
        rows={20}
        autoFocus
        placeholder="Begin the walk here. Welcome the reader, set the scene, and invite them to open their heart to what lies ahead…"
        className="w-full border border-gray-200 rounded-xl px-5 py-4 text-base text-gray-800 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-400/30 focus:border-teal-400 transition-colors bg-white resize-y leading-relaxed"
      />

      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={onSaveDraft}
          disabled={saving}
          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Could not save — try again' : 'Save Draft'}
        </button>
        <button
          onClick={onContinue}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm disabled:opacity-50"
        >
          Save and Continue to Day 1 <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

// ─── Journey Complete editor ──────────────────────────────────────────────────
// Journey Complete is NOT a normal journey step. It marks the end of the whole
// journey regardless of how many days it contains.  It has its own dedicated
// set of fields: Title, Congratulations, Closing Prayer, Recommended Next
// Journey (journey picker), and an optional Completion Message.
//
// Step fields (title, congratulations/devotional, closing prayer/prayerPrompt)
// are saved by the existing autosave path.  Journey-level fields
// (nextJourneyId, completionMessage) are saved explicitly via onSaveDraft.

function JourneyCompleteEditor({
  step,
  onStepChange,
  nextJourneyId,
  onNextJourneyIdChange,
  completionMessage,
  onCompletionMessageChange,
  allJourneys,
  currentJourneyId,
  onSaveDraft,
  saveStatus,
}: {
  step: StepWithBlocks;
  onStepChange: (changes: Partial<Step>) => void;
  nextJourneyId: string;
  onNextJourneyIdChange: (id: string) => void;
  completionMessage: string;
  onCompletionMessageChange: (msg: string) => void;
  allJourneys: Journey[];
  currentJourneyId: string;
  onSaveDraft: () => void;
  saveStatus: SaveStatus;
}) {
  const saving = saveStatus === 'saving';
  const inputCls =
    'w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-800 ' +
    'placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-teal-400/30 ' +
    'focus:border-teal-400 transition-colors bg-white';
  const textareaCls = inputCls + ' resize-y leading-relaxed';
  const selectCls = inputCls + ' cursor-pointer';

  const otherJourneys = allJourneys.filter(j => j.id !== currentJourneyId && j.title);
  const selectedJourneyTitle = otherJourneys.find(j => j.id === nextJourneyId)?.title;

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 space-y-6">
      <div className="text-[11px] font-semibold text-teal-600 uppercase tracking-widest">
        Walk Complete
      </div>

      <FieldBlock label="Title">
        <input
          type="text"
          value={step.title}
          onChange={e => onStepChange({ title: e.target.value })}
          placeholder="Walk Complete"
          className={inputCls}
          autoComplete="off"
        />
      </FieldBlock>

      <FieldBlock label="Congratulations" hint="Celebrate what God has been teaching the reader and encourage them to keep walking with Jesus.">
        <textarea
          value={step.devotional ?? ''}
          onChange={e => onStepChange({ devotional: e.target.value })}
          rows={8}
          autoFocus
          placeholder="Congratulate the reader on completing this walk…"
          className={textareaCls}
        />
      </FieldBlock>

      <FieldBlock label="Closing Prayer" hint="Thank God for what He has done during the walk and ask Him to continue His work.">
        <textarea
          value={step.prayerPrompt ?? ''}
          onChange={e => onStepChange({ prayerPrompt: e.target.value })}
          rows={5}
          placeholder="Lord,…"
          className={textareaCls}
        />
      </FieldBlock>

      <FieldBlock label="Recommended Next Walk" hint="Displayed in the app as: Continue to [Walk Name] →">
        <select
          value={nextJourneyId}
          onChange={e => onNextJourneyIdChange(e.target.value)}
          className={selectCls}
        >
          <option value="">— None —</option>
          {otherJourneys.map(j => (
            <option key={j.id} value={j.id}>{j.title}</option>
          ))}
        </select>
        {selectedJourneyTitle && (
          <p className="text-xs text-teal-700 mt-1.5 flex items-center gap-1">
            <ChevronRight size={12} />
            Continue to {selectedJourneyTitle}
          </p>
        )}
      </FieldBlock>

      <FieldBlock label="Completion Message" hint="Optional short message shown after the user completes the journey.">
        <textarea
          value={completionMessage}
          onChange={e => onCompletionMessageChange(e.target.value)}
          rows={2}
          placeholder={`e.g. "Well done. Keep walking with Jesus."`}
          className={textareaCls}
        />
      </FieldBlock>

      <div className="flex items-center gap-3 pt-4 border-t border-gray-100">
        <button
          onClick={onSaveDraft}
          disabled={saving}
          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-50"
        >
          {saving ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'error' ? 'Could not save — try again' : 'Save Draft'}
        </button>
      </div>
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
            This Walk was created by Emmaus AI. Review each step for accuracy, pastoral tone, and doctrinal soundness before publishing.
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

// ─── Guided progress panel (center panel, overview selected) ─────────────────

function GuidedProgressPanel({
  stepsWithBlocks,
  introIsComplete,
  onOpenSection,
  scaffold,
}: {
  stepsWithBlocks: StepWithBlocks[];
  introIsComplete: boolean;
  onOpenSection: (day: number) => void;
  scaffold: ScaffoldSection[];
}) {
  const totalSections = scaffold.length;
  const completedCount = scaffold.filter(s =>
    s.day === 0 ? introIsComplete : isStepComplete(stepsWithBlocks.find(step => step.day === s.day))
  ).length;
  const allComplete = completedCount === totalSections;

  const nextSection = scaffold.find(s => {
    const complete = s.day === 0 ? introIsComplete : isStepComplete(stepsWithBlocks.find(step => step.day === s.day));
    return !complete && isSectionClickable(s.day, stepsWithBlocks, introIsComplete, scaffold);
  });

  return (
    <div className="max-w-2xl mx-auto px-8 pt-8 pb-16">
      <div className="mb-5">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
          Progress
        </div>
        <p className="text-sm text-gray-500">
          {completedCount === 0
            ? "This journey hasn't been written yet."
            : `${completedCount} of ${totalSections} sections written.`}
        </p>
      </div>

      <div className="space-y-1.5 mb-8">
        {scaffold.map(section => {
          const started = section.day === 0 ? introIsComplete : isStepComplete(stepsWithBlocks.find(s => s.day === section.day));
          const clickable = isSectionClickable(section.day, stepsWithBlocks, introIsComplete, scaffold);
          return (
            <button
              key={section.day}
              onClick={() => clickable && onOpenSection(section.day)}
              disabled={!clickable}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left ${
                started
                  ? 'bg-teal-50 border-teal-200 hover:bg-teal-100'
                  : clickable
                  ? 'bg-white border-gray-200 hover:bg-gray-50'
                  : 'bg-gray-50/60 border-gray-100 opacity-50 cursor-default'
              }`}
            >
              <span className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                started ? 'border-teal-500 bg-teal-500' : 'border-gray-300 bg-white'
              }`}>
                {started && <Check size={9} className="text-white" strokeWidth={3} />}
              </span>
              <span className={`text-sm font-medium ${
                started ? 'text-teal-900' : clickable ? 'text-gray-700' : 'text-gray-400'
              }`}>
                {section.label}
              </span>
              {started && (
                <span className="ml-auto text-[11px] text-teal-600 flex items-center gap-0.5">
                  Edit <ChevronRight size={11} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!allComplete && nextSection && (
        <button
          onClick={() => onOpenSection(nextSection.day)}
          className="flex items-center gap-2 px-6 py-3 bg-teal-600 text-white text-sm font-semibold rounded-xl hover:bg-teal-700 active:scale-[0.98] transition-all shadow-sm"
        >
          <ChevronRight size={15} />
          {completedCount === 0 ? 'Start Walk Introduction' : `Write ${nextSection.label}`}
        </button>
      )}
      {allComplete && (
        <div className="flex items-center gap-2 text-sm text-teal-700 font-medium bg-teal-50 border border-teal-200 rounded-xl px-5 py-3">
          <Check size={15} className="text-teal-600" />
          All sections written — ready to publish.
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudioJourneyEditor({ journeyId, onBack, onLegacyEditor }: Props) {
  const { journeys: allJourneys, getJourney, getStepsForJourney, updateJourney, updateStep, addStep, deleteStep } = useJourney();
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

  // Dynamic scaffold — built from actual steps so any journey length works correctly.
  // Falls back to the 5-day default while steps are still loading.
  const journeyScaffold = useMemo<ScaffoldSection[]>(() => {
    const lessonDays = rawSteps
      .filter(s => !s.isCompletionStep && s.day > 0)
      .sort((a, b) => a.day - b.day)
      .map(s => ({ day: s.day, label: `Day ${s.day}`, shortLabel: `${s.day}` } as ScaffoldSection));

    if (lessonDays.length === 0) return JOURNEY_SCAFFOLD_DEFAULT;

    const completionStep = rawSteps.find(s => s.isCompletionStep);
    const lastLessonDay = lessonDays[lessonDays.length - 1].day;
    const completionDay = completionStep?.day ?? lastLessonDay + 1;

    return [
      { day: 0, label: 'Walk Introduction', shortLabel: 'I' },
      ...lessonDays,
      { day: completionDay, label: 'Walk Complete', shortLabel: '✓' },
    ];
  }, [rawSteps]);

  // Ref so callbacks don't need to be recreated when the scaffold changes.
  const scaffoldRef = useRef<ScaffoldSection[]>(journeyScaffold);
  useEffect(() => { scaffoldRef.current = journeyScaffold; }, [journeyScaffold]);

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
  // Smart Content Indicators: notify members of new/updated content on publish.
  // Defaults ON for first publish; admin can uncheck for silent updates.
  const [notifyMembers, setNotifyMembers] = useState(true);
  const [confirmDeleteJourney, setConfirmDeleteJourney] = useState(false);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(false); // Closed by default — editor gets the full width
  const [aiBannerDismissed, setAiBannerDismissed] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // ─── Journey Introduction state ───────────────────────────────────────────
  const [introContent, setIntroContent] = useState('');
  const [introSaveStatus, setIntroSaveStatus] = useState<SaveStatus>('idle');

  // ─── Journey Complete state ────────────────────────────────────────────────
  // nextJourneyId and completionMessage live on the journey record (metadata
  // JSONB), not on the step.  Step fields (title, congratulations/devotional,
  // closing prayer/prayerPrompt) are handled by the standard autosave path.
  const [completeNextJourneyId, setCompleteNextJourneyId] = useState('');
  const [completeMessage, setCompleteMessage] = useState('');
  const [completeSaveStatus, setCompleteSaveStatus] = useState<SaveStatus>('idle');

  const autosaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const hasUnsaved = stepsWithBlocks.some(s => s.isDirty);

  // Keep a ref to stepsWithBlocks so autosave callbacks always read the latest state.
  const stepsRef = useRef<StepWithBlocks[]>([]);
  useEffect(() => { stepsRef.current = stepsWithBlocks; }, [stepsWithBlocks]);

  // Sync introContent whenever the journey record is (re-)loaded from the server.
  useEffect(() => {
    setIntroContent(journey?.introductionContent ?? '');
  }, [journey?.introductionContent]);

  // Sync Journey Complete journey-level fields on load.
  useEffect(() => {
    setCompleteNextJourneyId(journey?.nextJourneyId ?? '');
    setCompleteMessage(journey?.completionMessage ?? '');
  }, [journey?.id]); // key on id — sync once per journey, not on every save

  // The intro is "complete" when the journey record already has non-empty saved content.
  const introIsComplete = Boolean(journey?.introductionContent?.trim());

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

  // Saves a single field immediately, bypassing the async state cycle.
  // Use this for select/toggle controls that call both onPatch and onBlur in
  // the same event handler — the regular pattern races against setState.
  const saveJourneyNow = useCallback(async (k: keyof Journey, v: string | boolean | null | undefined) => {
    if (!journey) return;
    setJourneyForm(f => ({ ...f, [k]: v }));
    await updateJourney({ ...journey, ...journeyForm, [k]: v } as Journey);
  }, [journey, journeyForm, updateJourney]);

  // ─── Step management ──────────────────────────────────────────────────────

  const handleOpenSection = useCallback(async (sectionDay: number) => {
    if (!journey) return;
    // Journey Introduction is stored on the journey record, not as a step.
    // Route directly to the 'introduction' view without creating any step.
    if (sectionDay === 0) {
      setSelectedView('introduction');
      return;
    }
    // If the step already exists just navigate to it.
    if (stepsRef.current.some(s => s.day === sectionDay)) {
      setSelectedView(sectionDay);
      return;
    }
    // Otherwise create it using the scaffold label as the initial title.
    const label = getSectionLabel(sectionDay, scaffoldRef.current);
    const newStep = await addStep({
      journeyId,
      day: sectionDay,
      title: label,
      status: 'Draft',
      mentorIntro: '', scripture: '', devotional: '',
      reflectionQuestion: '', prayerPrompt: '', actionStep: '', lookingAhead: '',
      closingText: '',
    });
    const blocks: Block[] = [createBlock('paragraph')];
    setStepsWithBlocks(ss => [...ss, { ...newStep, blocks, isDirty: false }]);
    setSelectedView(sectionDay);
    setTimeout(() => titleInputRef.current?.focus(), 100);
  }, [journey, journeyId, addStep]);

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

  // ─── Introduction save ────────────────────────────────────────────────────
  // Saves introContent to journey.introductionContent via the PATCH endpoint.
  // Awaited before advancing to Day 1 so the record exists on the server
  // before the author navigates away.
  const handleSaveIntro = useCallback(async () => {
    if (!journey) return;
    setIntroSaveStatus('saving');
    try {
      await updateJourney({ ...journey, introductionContent: introContent } as Journey);
      setIntroSaveStatus('saved');
      setTimeout(() => setIntroSaveStatus('idle'), 2500);
    } catch {
      setIntroSaveStatus('error');
      setTimeout(() => setIntroSaveStatus('idle'), 3000);
    }
  }, [journey, introContent, updateJourney]);

  const handleSaveAndContinueIntro = useCallback(async () => {
    await handleSaveIntro();
    // Open Day 1 — creates the step if it doesn't exist yet.
    await handleOpenSection(1);
  }, [handleSaveIntro, handleOpenSection]);

  // ─── Journey Complete save ────────────────────────────────────────────────
  // Saves the step fields (title, congratulations/devotional, closing prayer/
  // prayerPrompt) AND the journey-level fields (nextJourneyId, completionMessage)
  // in a single atomic action triggered by "Save Draft" in JourneyCompleteEditor.
  // Step fields are also kept in sync by the background autosave, but the
  // explicit Save Draft ensures both sides flush together.
  const handleSaveComplete = useCallback(async () => {
    if (!journey) return;
    setCompleteSaveStatus('saving');
    try {
      await Promise.all([
        saveStep(6),
        updateJourney({
          ...journey,
          nextJourneyId: completeNextJourneyId || undefined,
          completionMessage: completeMessage || undefined,
        } as Journey),
      ]);
      setCompleteSaveStatus('saved');
      setTimeout(() => setCompleteSaveStatus('idle'), 2500);
    } catch {
      setCompleteSaveStatus('error');
      setTimeout(() => setCompleteSaveStatus('idle'), 3000);
    }
  }, [journey, completeNextJourneyId, completeMessage, saveStep, updateJourney]);

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
      await updateJourney({ ...journey, ...journeyForm, status: 'Published', notifyMembers } as unknown as Journey);
      setJourneySaving(null);
      toast.success('Walk published successfully.');
      onBack();
    } catch {
      setJourneyErrorMsg('Failed to publish.');
      setTimeout(() => setJourneyErrorMsg(''), 4000);
      setJourneySaving(null);
    }
  }, [journey, journeyForm, updateJourney, onBack, notifyMembers]);

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

  /** Save the current section's content then navigate into the next scaffold section. */
  const handleSaveAndAdvance = useCallback(async (currentDay: number) => {
    await saveStep(currentDay);
    const nextDay = getNextScaffoldDay(currentDay, scaffoldRef.current);
    if (nextDay !== null) {
      await handleOpenSection(nextDay);
    }
  }, [saveStep, handleOpenSection]);

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
        extraActions={
          (journeyForm.status ?? journey?.status) !== 'Published' ? (
            <label className="flex items-center gap-1.5 text-[12px] text-gray-500 cursor-pointer select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={notifyMembers}
                onChange={e => setNotifyMembers(e.target.checked)}
                className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
              />
              Notify members
            </label>
          ) : undefined
        }
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
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-1 mb-1">Walk</div>
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
                <span className="text-[13px] font-medium truncate">Walk Settings</span>
              </button>
            </div>

            <div className="mx-3 border-t border-gray-100" />

            {/* Content section — dynamic scaffold based on actual steps */}
            <div className="flex-shrink-0 px-2 pt-2 pb-1">
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest px-1">Content</div>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
              {journeyScaffold.map(section => {
                const step = section.day !== 0 ? stepsWithBlocks.find(s => s.day === section.day) : undefined;
                const started = section.day === 0 ? introIsComplete : isStepComplete(step);
                const active = section.day === 0 ? selectedView === 'introduction' : selectedView === section.day;
                const clickable = isSectionClickable(section.day, stepsWithBlocks, introIsComplete, journeyScaffold);
                const status = step ? saveStatus[step.day] : undefined;
                return (
                  <button
                    key={section.day}
                    onClick={() => clickable && handleOpenSection(section.day)}
                    disabled={!clickable}
                    className={`w-full flex items-center gap-2 px-2 py-2.5 rounded-lg text-left transition-colors group ${
                      active
                        ? 'bg-teal-50'
                        : clickable
                        ? 'hover:bg-gray-50'
                        : 'opacity-40 cursor-default'
                    }`}
                  >
                    {/* Completion dot */}
                    <span className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      started ? 'border-teal-500 bg-teal-500' : 'border-gray-300 bg-white'
                    }`}>
                      {started && <Check size={8} className="text-white" strokeWidth={3} />}
                    </span>
                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <div className={`text-[13px] font-medium truncate leading-tight ${
                        active ? 'text-teal-900' : started ? 'text-gray-700' : 'text-gray-400'
                      }`}>
                        {section.label}
                      </div>
                      {step?.estimatedReadingTime && (
                        <div className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                          <Clock size={9} /> {step.estimatedReadingTime} min
                        </div>
                      )}
                    </div>
                    {/* Autosave indicators */}
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {step?.isDirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" title="Unsaved" />}
                      {status === 'saved' && <Check size={10} className="text-emerald-500" />}
                      {status === 'error' && <AlertCircle size={10} className="text-red-400" />}
                    </div>
                  </button>
                );
              })}
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
              {journeyScaffold.map(section => {
                const started = section.day === 0 ? introIsComplete : isStepComplete(stepsWithBlocks.find(s => s.day === section.day));
                const clickable = isSectionClickable(section.day, stepsWithBlocks, introIsComplete, journeyScaffold);
                return (
                  <button
                    key={section.day}
                    onClick={() => { if (clickable) { handleOpenSection(section.day); setLeftOpen(true); } }}
                    disabled={!clickable}
                    title={section.label}
                    className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-colors relative ${
                      (section.day === 0 ? selectedView === 'introduction' : selectedView === section.day)
                        ? 'bg-teal-50 text-teal-700'
                        : started
                        ? 'text-gray-600 hover:bg-gray-100'
                        : clickable
                        ? 'text-gray-400 hover:bg-gray-100'
                        : 'text-gray-200 cursor-default'
                    }`}
                  >
                    {section.shortLabel}
                    {started && selectedView !== section.day && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-teal-400" />
                    )}
                  </button>
                );
              })}
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
                <span className="text-xs text-gray-400">{rawSteps.filter(s => !s.isCompletionStep && s.day > 0).length || journey.durationDays} days</span>
              </div>
            ) : selectedView === 'introduction' ? (
              <span className="text-sm font-semibold text-gray-700 truncate">Journey Introduction</span>
            ) : selectedStep ? (
              <span className="text-sm font-semibold text-gray-700 truncate">
                {getSectionLabel(selectedStep.day, journeyScaffold)}
                {selectedStep.title && selectedStep.title !== getSectionLabel(selectedStep.day, journeyScaffold)
                  ? ` — ${selectedStep.title}` : ''}
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Autosave status */}
            {selectedView === 'introduction' ? (
              <SaveIndicator status={introSaveStatus} />
            ) : selectedStep?.isCompletionStep ? (
              <SaveIndicator status={completeSaveStatus} />
            ) : selectedStep ? (
              <>
                {showUnsaved && (
                  <span className="text-xs text-amber-500 flex items-center gap-1">
                    <Clock size={11} /> Unsaved
                  </span>
                )}
                <SaveIndicator status={currentSaveStatus} />
              </>
            ) : null}

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
            <div className="border-t border-gray-100" />
            <GuidedProgressPanel
              stepsWithBlocks={stepsWithBlocks}
              introIsComplete={introIsComplete}
              onOpenSection={handleOpenSection}
              scaffold={journeyScaffold}
            />
          </div>
        ) : selectedView === 'introduction' ? (
          /* Journey Introduction — stored on the journey record, not as a step */
          <div className="flex-1 overflow-y-auto bg-white">
            <JourneyIntroEditor
              content={introContent}
              onChange={setIntroContent}
              onSaveDraft={handleSaveIntro}
              onContinue={handleSaveAndContinueIntro}
              saveStatus={introSaveStatus}
            />
          </div>
        ) : selectedStep?.isCompletionStep ? (
          /* Journey Complete — dedicated completion editor */
          <div className="flex-1 overflow-y-auto bg-white">
            <JourneyCompleteEditor
              step={selectedStep}
              onStepChange={changes => handleStepMetaChange(selectedStep.day, changes)}
              nextJourneyId={completeNextJourneyId}
              onNextJourneyIdChange={setCompleteNextJourneyId}
              completionMessage={completeMessage}
              onCompletionMessageChange={setCompleteMessage}
              allJourneys={allJourneys}
              currentJourneyId={journeyId}
              onSaveDraft={handleSaveComplete}
              saveStatus={completeSaveStatus}
            />
          </div>
        ) : selectedStep ? (
          /* Days 1–5 — full structured field editor */
          <div className="flex-1 overflow-y-auto bg-white">
            <StepFieldEditor
              step={selectedStep}
              titleRef={titleInputRef}
              scaffold={journeyScaffold}
              onMetaChange={changes => handleStepMetaChange(selectedStep.day, changes)}
              onSaveDraft={() => saveStep(selectedStep.day)}
              onContinue={
                getNextScaffoldDay(selectedStep.day, journeyScaffold) !== null
                  ? () => handleSaveAndAdvance(selectedStep.day)
                  : null
              }
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-white">
            <Loader2 size={18} className="animate-spin text-gray-300" />
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
                onSaveNow={saveJourneyNow}
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
          title="Remove Section"
          message={`Remove "${getSectionLabel(deleteTarget, scaffoldRef.current)}"? This cannot be undone.`}
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
