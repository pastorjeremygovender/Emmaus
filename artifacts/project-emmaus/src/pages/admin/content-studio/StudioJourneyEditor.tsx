/**
 * StudioJourneyEditor — Three-panel journey editor.
 *
 * LEFT  (w-56): Journey title + step list
 * CENTER (flex-1): Block canvas for the selected step
 * RIGHT (w-72): Preview/Settings tabs
 *
 * Blocks are loaded from step.blocks (content.blocks JSONB).
 * First open of a step with no blocks converts canonical fields → blocks.
 * Autosave fires 1.5 s after the last change, writing blocks + canonical extracts.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Plus, ChevronRight, Pencil, Trash2, Eye,
  Save, Check, Clock, AlertCircle, Settings, Layers, Copy,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { Journey, Step } from '@/contexts/JourneyContext';
import { Block, stepToBlocks, blocksToCanonical, createBlock } from '@/lib/blocks';
import BlockCanvas from './BlockCanvas';
import { ConfirmDialog, StatusBadge, AdminBtn } from '../shared';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StepWithBlocks extends Step {
  blocks: Block[];
  isDirty: boolean;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  journeyId: string;
  onBack: () => void;
  onLegacyEditor: () => void;
}

// ─── Step preview (right panel) ───────────────────────────────────────────────

function StepPreview({ step }: { step: StepWithBlocks }) {
  return (
    <div className="p-4 space-y-4 text-sm">
      <div className="font-bold text-gray-800 text-base">{step.title || '(Untitled)'}</div>
      {step.blocks.map(b => (
        <div key={b.id}>
          {b.type === 'paragraph' && (b.content as any).text && (
            <p className="text-gray-700 leading-relaxed">{(b.content as any).text}</p>
          )}
          {b.type === 'heading' && (b.content as any).text && (
            <p className="font-semibold text-gray-800">{(b.content as any).text}</p>
          )}
          {b.type === 'scripture' && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3">
              <div className="font-semibold text-teal-700 text-xs mb-1">{(b.content as any).reference}</div>
              {(b.content as any).text && <p className="text-gray-700 italic">{(b.content as any).text}</p>}
            </div>
          )}
          {b.type === 'reflection' && (b.content as any).question && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-amber-700 mb-1">🪞 Reflect</div>
              <p className="text-gray-700">{(b.content as any).question}</p>
            </div>
          )}
          {b.type === 'prayer' && (b.content as any).text && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-indigo-700 mb-1">🙏 Prayer</div>
              <p className="text-gray-700 italic">{(b.content as any).text}</p>
            </div>
          )}
          {b.type === 'action' && (b.content as any).text && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-green-700 mb-1">✅ Action</div>
              <p className="text-gray-700">{(b.content as any).text}</p>
            </div>
          )}
          {b.type === 'memory-verse' && (b.content as any).text && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <div className="text-xs font-semibold text-yellow-700 mb-1">⭐ Memory Verse · {(b.content as any).reference}</div>
              <p className="text-gray-700 italic">{(b.content as any).text}</p>
            </div>
          )}
          {b.type === 'quote' && (b.content as any).text && (
            <div className="border-l-4 border-gray-300 pl-3 italic text-gray-600">
              {(b.content as any).text}
              {(b.content as any).attribution && (
                <span className="block text-xs text-gray-400 mt-0.5">— {(b.content as any).attribution}</span>
              )}
            </div>
          )}
          {b.type === 'callout' && (b.content as any).text && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 flex gap-2">
              <span>{(b.content as any).emoji || '💡'}</span>
              <p className="text-sm text-gray-700">{(b.content as any).text}</p>
            </div>
          )}
          {b.type === 'divider' && <hr className="border-gray-200" />}
          {b.type === 'completion' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-center">
              <p className="text-emerald-700 font-medium">{(b.content as any).message}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step settings (right panel) ─────────────────────────────────────────────

function StepSettings({ step, onChange }: { step: StepWithBlocks; onChange: (s: Partial<Step>) => void }) {
  return (
    <div className="p-4 space-y-4 text-sm">
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Step Title</label>
        <input
          type="text"
          value={step.title}
          onChange={e => onChange({ title: e.target.value })}
          className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
          placeholder="Day title…"
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Est. Reading Time (min)</label>
        <input
          type="number"
          value={step.estimatedReadingTime ?? ''}
          onChange={e => onChange({ estimatedReadingTime: e.target.value ? Number(e.target.value) : undefined })}
          className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
          min={1}
        />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Translation</label>
        <select
          value={step.preferredTranslation ?? 'NIV'}
          onChange={e => onChange({ preferredTranslation: e.target.value })}
          className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
        >
          {['NIV', 'ESV', 'KJV', 'NKJV', 'NLT', 'CSB'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function StudioJourneyEditor({ journeyId, onBack, onLegacyEditor }: Props) {
  const { getJourney, getStepsForJourney, updateJourney, updateStep, addStep, deleteStep } = useJourney();

  const journey = getJourney(journeyId);
  const rawSteps = getStepsForJourney(journeyId);

  const [stepsWithBlocks, setStepsWithBlocks] = useState<StepWithBlocks[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<'preview' | 'settings'>('settings');
  const [saveStatus, setSaveStatus] = useState<Record<number, SaveStatus>>({});
  const [journeyForm, setJourneyForm] = useState<Partial<Journey>>({});
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [confirmBack, setConfirmBack] = useState(false);

  const autosaveTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const hasUnsaved = stepsWithBlocks.some(s => s.isDirty);

  // Keep a ref to stepsWithBlocks so autosave callbacks always read the latest
  // state rather than a stale closure from when they were scheduled.
  const stepsRef = useRef<StepWithBlocks[]>([]);
  useEffect(() => { stepsRef.current = stepsWithBlocks; }, [stepsWithBlocks]);

  // ─── Initialise steps with blocks ─────────────────────────────────────────

  useEffect(() => {
    const initialised: StepWithBlocks[] = rawSteps.map(step => {
      const existing = stepsWithBlocks.find(s => s.day === step.day);
      if (existing) return existing;
      // Convert canonical fields to blocks on first open
      const savedBlocks = (step as Step & { blocks?: Array<Record<string, unknown>> | null }).blocks;
      const blocks: Block[] = savedBlocks && savedBlocks.length > 0
        ? (savedBlocks as unknown as Block[])
        : stepToBlocks(step);
      return { ...step, blocks, isDirty: false };
    });
    setStepsWithBlocks(initialised);
    if (selectedDay === null && initialised.length > 0) {
      setSelectedDay(initialised[0].day);
    }
  }, [rawSteps.length]); // Only re-run when step count changes

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
    // Always read from the ref so we have the latest state, not a stale closure.
    const stepData = stepsRef.current.find(s => s.day === day);
    if (!stepData) return;
    setSaveStatus(s => ({ ...s, [day]: 'saving' }));
    try {
      const canonical = blocksToCanonical(stepData.blocks);
      const blocks = stepData.blocks as unknown as Array<Record<string, unknown>>;
      await updateStep({
        ...stepData,
        ...canonical,
        devotional: canonical.devotional,
        prayerPrompt: canonical.prayerPrompt,
        actionStep: canonical.actionStep,
        blocks,
      } as Step & { blocks: typeof blocks });
      setStepsWithBlocks(ss => ss.map(s => s.day === day ? { ...s, isDirty: false } : s));
      setSaveStatus(s => ({ ...s, [day]: 'saved' }));
      setTimeout(() => setSaveStatus(s => ({ ...s, [day]: 'idle' })), 2000);
    } catch {
      setSaveStatus(s => ({ ...s, [day]: 'error' }));
    }
  }, [updateStep]); // no longer depends on stepsWithBlocks — reads via ref instead

  const scheduleSave = useCallback((day: number) => {
    if (autosaveTimers.current[day]) clearTimeout(autosaveTimers.current[day]);
    autosaveTimers.current[day] = setTimeout(() => {
      saveStep(day);
    }, 1500);
  }, [saveStep]); // saveStep is now stable

  // ─── Block changes ─────────────────────────────────────────────────────────

  const handleBlocksChange = useCallback((day: number, blocks: Block[]) => {
    setStepsWithBlocks(ss => ss.map(s => s.day === day ? { ...s, blocks, isDirty: true } : s));
    scheduleSave(day);
  }, [scheduleSave]);

  const handleStepMetaChange = useCallback((day: number, changes: Partial<Step>) => {
    setStepsWithBlocks(ss => ss.map(s => s.day === day ? { ...s, ...changes, isDirty: true } as StepWithBlocks : s));
    scheduleSave(day);
  }, [scheduleSave]);

  // ─── Step management ──────────────────────────────────────────────────────

  const handleAddStep = async () => {
    if (!journey) return;
    const nextDay = rawSteps.length > 0 ? Math.max(...rawSteps.map(s => s.day)) + 1 : 1;
    const newStep = await addStep({
      journeyId,
      day: nextDay,
      title: `Day ${nextDay}`,
      mentorIntro: '', scripture: '', devotional: '',
      reflectionQuestion: '', prayerPrompt: '', actionStep: '',
    });
    const blocks: Block[] = [createBlock('paragraph')];
    setStepsWithBlocks(ss => [...ss, { ...newStep, blocks, isDirty: false }]);
    setSelectedDay(nextDay);
  };

  const handleDeleteStep = async (day: number) => {
    await deleteStep(journeyId, day);
    setStepsWithBlocks(ss => ss.filter(s => s.day !== day));
    if (selectedDay === day) {
      const remaining = stepsWithBlocks.filter(s => s.day !== day);
      setSelectedDay(remaining.length > 0 ? remaining[0].day : null);
    }
    setDeleteTarget(null);
  };

  const handleSaveJourney = async () => {
    if (!journey) return;
    await updateJourney({ ...journey, ...journeyForm });
  };

  const handleBackClick = () => {
    if (hasUnsaved) {
      setConfirmBack(true);
    } else {
      onBack();
    }
  };

  // ─── Derived ──────────────────────────────────────────────────────────────

  const selectedStep = stepsWithBlocks.find(s => s.day === selectedDay) ?? null;
  const currentSaveStatus = selectedDay !== null ? (saveStatus[selectedDay] ?? 'idle') : 'idle';

  if (!journey) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        Journey not found.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── LEFT PANEL: Step List ─────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col min-h-0">
        {/* Journey header */}
        <div className="flex-shrink-0 px-3 pt-3 pb-2 border-b border-gray-100">
          <button
            onClick={handleBackClick}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors"
          >
            <ArrowLeft size={13} /> All Journeys
          </button>
          <input
            type="text"
            value={journeyForm.title ?? journey.title}
            onChange={e => setJourneyForm(f => ({ ...f, title: e.target.value }))}
            onBlur={handleSaveJourney}
            className="w-full text-[13px] font-semibold text-gray-900 bg-transparent outline-none border-b border-transparent hover:border-gray-300 focus:border-teal-400 pb-0.5 transition-colors leading-snug"
          />
          <div className="mt-1.5 flex items-center justify-between">
            <StatusBadge status={journey.status} />
            <button
              onClick={onLegacyEditor}
              title="Open in classic editor"
              className="text-[10px] text-gray-400 hover:text-teal-600 flex items-center gap-1"
            >
              <Pencil size={10} /> Classic
            </button>
          </div>
        </div>

        {/* Steps */}
        <div className="flex-1 overflow-y-auto py-2">
          {stepsWithBlocks.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <p className="text-xs text-gray-400">No days yet</p>
            </div>
          ) : (
            stepsWithBlocks.map(s => {
              const active = s.day === selectedDay;
              const dirty = s.isDirty;
              const status = saveStatus[s.day];
              return (
                <button
                  key={s.day}
                  onClick={() => setSelectedDay(s.day)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors group ${
                    active ? 'bg-teal-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`text-[11px] font-bold w-6 flex-shrink-0 ${active ? 'text-teal-700' : 'text-gray-400'}`}>
                    {s.day}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-medium truncate ${active ? 'text-teal-900' : 'text-gray-700'}`}>
                      {s.title || '(Untitled)'}
                    </div>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1">
                    {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Unsaved" />}
                    {status === 'saved' && <Check size={11} className="text-green-500" />}
                    {status === 'error' && <AlertCircle size={11} className="text-red-400" />}
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(s.day); }}
                      className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400 text-gray-300 transition-all"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Add step */}
        <div className="flex-shrink-0 p-2 border-t border-gray-100">
          <button
            onClick={handleAddStep}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-gray-500 hover:text-teal-700 hover:bg-teal-50 rounded-lg transition-colors"
          >
            <Plus size={13} /> Add Day
          </button>
        </div>
      </div>

      {/* ── CENTER PANEL: Block Canvas ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 bg-gray-50">
        {selectedStep ? (
          <>
            {/* Step header */}
            <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-bold text-gray-400 flex-shrink-0">Day {selectedStep.day}</span>
                <input
                  type="text"
                  value={selectedStep.title}
                  onChange={e => handleStepMetaChange(selectedStep.day, { title: e.target.value })}
                  className="flex-1 min-w-0 text-base font-semibold text-gray-900 bg-transparent outline-none border-b border-transparent focus:border-teal-400 pb-0.5 transition-colors"
                  placeholder="Day title…"
                />
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Save status */}
                <div className="text-xs flex items-center gap-1.5">
                  {currentSaveStatus === 'saving' && (
                    <span className="text-gray-400 flex items-center gap-1">
                      <Clock size={12} className="animate-pulse" /> Saving…
                    </span>
                  )}
                  {currentSaveStatus === 'saved' && (
                    <span className="text-green-500 flex items-center gap-1">
                      <Check size={12} /> Saved
                    </span>
                  )}
                  {currentSaveStatus === 'error' && (
                    <span className="text-red-500 flex items-center gap-1">
                      <AlertCircle size={12} /> Save failed
                    </span>
                  )}
                  {selectedStep.isDirty && currentSaveStatus === 'idle' && (
                    <span className="text-amber-500 flex items-center gap-1">
                      <Clock size={12} /> Unsaved
                    </span>
                  )}
                </div>
                <button
                  onClick={() => saveStep(selectedStep.day)}
                  disabled={currentSaveStatus === 'saving'}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
                >
                  <Save size={12} /> Save
                </button>
              </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-8 py-6">
                <BlockCanvas
                  blocks={selectedStep.blocks}
                  onChange={blocks => handleBlocksChange(selectedStep.day, blocks)}
                />
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <Layers size={40} className="text-gray-200 mb-4" />
            <p className="text-sm font-medium text-gray-500">Select a day to edit</p>
            <p className="text-xs text-gray-400 mt-1">Or add a new day using the panel on the left.</p>
          </div>
        )}
      </div>

      {/* ── RIGHT PANEL: Preview / Settings ──────────────────────────────── */}
      {selectedStep && (
        <div className="w-72 flex-shrink-0 bg-white border-l border-gray-200 flex flex-col min-h-0">
          {/* Tabs */}
          <div className="flex-shrink-0 flex border-b border-gray-200">
            {[
              { id: 'preview', label: 'Preview', icon: Eye },
              { id: 'settings', label: 'Settings', icon: Settings },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setRightTab(id as 'preview' | 'settings')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium border-b-2 transition-colors ${
                  rightTab === id
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {rightTab === 'preview' ? (
              <StepPreview step={selectedStep} />
            ) : (
              <StepSettings step={selectedStep} onChange={changes => handleStepMetaChange(selectedStep.day, changes)} />
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      {deleteTarget !== null && (
        <ConfirmDialog
          title="Delete Day"
          message={`Delete Day ${deleteTarget}? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => handleDeleteStep(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {confirmBack && (
        <ConfirmDialog
          title="Unsaved Changes"
          message="Some days have unsaved changes. Leave without saving?"
          confirmLabel="Leave"
          danger
          onConfirm={() => { setConfirmBack(false); onBack(); }}
          onCancel={() => setConfirmBack(false)}
        />
      )}
    </div>
  );
}
