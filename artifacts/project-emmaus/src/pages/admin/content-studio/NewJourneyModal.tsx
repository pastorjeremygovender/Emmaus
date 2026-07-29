/**
 * NewJourneyModal — Creation choice screen
 *
 * Two paths:
 *   "Build with AI"  → JourneyBuilderWizard (guided AI builder)
 *   "Start from scratch" → immediate blank Journey creation (existing flow)
 */

import React, { useEffect, useState } from 'react';
import {
  X, Sparkles, PenLine, BookOpen, Headphones, Heart,
  Users, Layers, ArrowRight, Loader2,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAuth } from '@/contexts/AuthContext';
import { listCollections } from '@/lib/collections-api';
import type { Collection } from '@/lib/collections-api';
import { Field } from '../shared';
import JourneyBuilderWizard from './JourneyBuilderWizard';

interface Props {
  onClose: () => void;
  onCreated: (journeyId: string) => void;
  /** Pre-selects the collection dropdown when opening from a collection context */
  defaultCollectionId?: string;
}

type Mode = 'choice' | 'scratch' | 'builder';

const CONTENT_TYPES = [
  { id: 'daily-devotional', label: 'Daily Devotional', icon: <BookOpen size={16} />, desc: 'Scripture + reflection + prayer, one step per day' },
  { id: 'sermon-companion', label: 'Sermon Companion', icon: <Headphones size={16} />, desc: 'Deepens a specific message or sermon series' },
  { id: 'bible-study', label: 'Bible Study', icon: <Layers size={16} />, desc: 'Observation, interpretation, and application per step' },
  { id: 'prayer-journey', label: 'Prayer Journey', icon: <Heart size={16} />, desc: 'Guided prayer practices and contemplative steps' },
  { id: 'small-group', label: 'Small Group', icon: <Users size={16} />, desc: 'Discussion questions and group activities' },
  { id: 'core', label: 'Core Discipleship', icon: <PenLine size={16} />, desc: 'Foundational faith formation curriculum' },
];

const TYPE_OPTIONS = ['core', 'companion', 'series', 'course'];

export default function NewJourneyModal({ onClose, onCreated, defaultCollectionId }: Props) {
  const { user } = useAuth();
  const { addJourney } = useJourney();
  const [mode, setMode] = useState<Mode>('choice');
  const [selectedType, setSelectedType] = useState<string>('daily-devotional');
  const [collections, setCollections] = useState<Collection[]>([]);

  // Scratch form — pre-fill collectionId when opened from a collection context
  const [scratchForm, setScratchForm] = useState({
    title: '', description: '', journeyType: 'core', collectionId: defaultCollectionId ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    listCollections().then(setCollections).catch(() => {});
  }, []);

  const patchScratch = (k: keyof typeof scratchForm, v: string) =>
    setScratchForm(f => ({ ...f, [k]: v }));

  const handleCreateScratch = async () => {
    if (!scratchForm.title.trim()) { setError('Title is required.'); return; }
    setSaving(true); setError('');
    try {
      const created = await addJourney({
        id: '', title: scratchForm.title.trim(),
        description: scratchForm.description,
        journeyType: scratchForm.journeyType,
        status: 'Draft', durationDays: 0,
        churchWide: false, overloadExempt: false,
        updatedAt: new Date().toISOString(),
        ...(scratchForm.collectionId ? { collectionId: scratchForm.collectionId } : {}),
      });
      onCreated(created.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create journey');
      setSaving(false);
    }
  };

  // ── Builder mode ────────────────────────────────────────────────────────────

  if (mode === 'builder') {
    return (
      <JourneyBuilderWizard
        initialContentType={selectedType}
        userId={user?.id}
        collections={collections}
        onClose={onClose}
        onCreated={onCreated}
      />
    );
  }

  // ── Scratch form ────────────────────────────────────────────────────────────

  if (mode === 'scratch') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
          <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMode('choice')}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 mr-1"
                title="Back"
              >
                <ArrowRight size={14} className="rotate-180" />
              </button>
              <h2 className="text-base font-semibold text-gray-900">New Journey</h2>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
              <X size={16} />
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <Field label="Title *">
              <input
                type="text"
                value={scratchForm.title}
                onChange={e => patchScratch('title', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateScratch()}
                placeholder="e.g. 10 Minutes with Jesus"
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={scratchForm.description}
                onChange={e => patchScratch('description', e.target.value)}
                placeholder="Brief description for this journey…"
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type">
                <select
                  value={scratchForm.journeyType}
                  onChange={e => patchScratch('journeyType', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                >
                  {TYPE_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </Field>
              {collections.length > 0 && (
                <Field label="Collection">
                  <select
                    value={scratchForm.collectionId}
                    onChange={e => patchScratch('collectionId', e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                  >
                    <option value="">None</option>
                    {collections.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
            <button onClick={() => setMode('choice')} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
              Back
            </button>
            <button
              onClick={handleCreateScratch}
              disabled={saving || !scratchForm.title.trim()}
              className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Creating…' : 'Create Journey'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Choice screen ────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Create a Journey</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 grid grid-cols-[1fr_1px_1fr] gap-0">
          {/* Left: AI Builder */}
          <div className="pr-6 space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-500 flex items-center justify-center">
                <Sparkles size={14} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Build with AI</p>
                <p className="text-xs text-gray-500">Answer a few questions — Emmaus writes the draft</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              Choose a content type and the wizard will create a fully structured Journey — real Scripture, real Blocks, and real sermon sources from your archive. Saved as Draft for you to review and edit.
            </p>

            {/* Content type picker */}
            <div className="space-y-1.5">
              {CONTENT_TYPES.map(ct => (
                <button
                  key={ct.id}
                  onClick={() => setSelectedType(ct.id)}
                  className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    selectedType === ct.id
                      ? 'bg-teal-50 ring-1 ring-teal-300'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <span className={`mt-0.5 flex-shrink-0 ${selectedType === ct.id ? 'text-teal-600' : 'text-gray-400'}`}>
                    {ct.icon}
                  </span>
                  <div>
                    <p className={`text-xs font-medium ${selectedType === ct.id ? 'text-teal-700' : 'text-gray-700'}`}>
                      {ct.label}
                    </p>
                    <p className="text-[11px] text-gray-400 leading-relaxed">{ct.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setMode('builder')}
              className="w-full flex items-center justify-center gap-2 py-2.5 bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium rounded-xl transition-colors"
            >
              <Sparkles size={14} />
              Start Building
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Divider */}
          <div className="bg-gray-100 mx-0" />

          {/* Right: Start from scratch */}
          <div className="pl-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-gray-100 flex items-center justify-center">
                <PenLine size={14} className="text-gray-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Start from scratch</p>
                <p className="text-xs text-gray-500">Blank canvas, you write everything</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 leading-relaxed mb-6">
              Create an empty Journey and build your steps manually using the block editor. Full creative control from the first word.
            </p>

            <button
              onClick={() => setMode('scratch')}
              className="w-full flex items-center justify-center gap-2 py-2.5 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-xl transition-colors mt-auto"
            >
              <PenLine size={14} />
              Start from Scratch
            </button>

            {/* Import placeholder */}
            <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-dashed border-gray-200">
              <p className="text-[11px] text-gray-400 text-center">
                Import from CSV — coming soon
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
