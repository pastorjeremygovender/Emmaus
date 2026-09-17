/**
 * Testing.tsx — Admin-only progress reset page.
 *
 * Provides three reset actions for development and testing:
 *  1. Reset Daily Rhythm — resets to Day 1, user stays enrolled
 *  2. Reset Individual Journey — pick one journey/devotional/companion to reset
 *  3. Reset Everything — returns the account to brand-new member state
 *
 * Only accessible to admin / superAdmin roles. Normal users never see this.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ConfirmDialog, PageHeader } from './shared';
import {
  fetchContentList,
  resetDailyRhythm,
  resetJourney,
  resetEverything,
  clearLocalProgressCache,
  clearDailyOpenMarkers,
  type ResetContentList,
} from '@/lib/admin-reset-api';
import {
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ResetKind = 'journey' | 'devotional' | 'companion';

interface ResetItem {
  id: string;
  title: string;
  kind: ResetKind;
  /** Human-readable category shown in the list */
  category: string;
}

type ActionState = 'idle' | 'loading' | 'done' | 'error';

// ─── Small UI helpers ─────────────────────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
      {children}
    </div>
  );
}

function SectionTitle({ label, sub }: { label: string; sub?: string }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-gray-800">{label}</h2>
      {sub && <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{sub}</p>}
    </div>
  );
}

function StatusPill({ state, errorMsg }: { state: ActionState; errorMsg?: string }) {
  if (state === 'loading') return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500">
      <Loader2 size={12} className="animate-spin" /> Resetting…
    </span>
  );
  if (state === 'done') return (
    <span className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
      <CheckCircle2 size={12} /> Done
    </span>
  );
  if (state === 'error') return (
    <span className="text-xs text-red-600">{errorMsg ?? 'Reset failed'}</span>
  );
  return null;
}

function ResetBtn({
  onClick,
  danger = false,
  disabled = false,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        danger
          ? 'bg-red-600 text-white hover:bg-red-700'
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Testing() {
  const { user } = useAuth();

  // ── Auth guard ─────────────────────────────────────────────────────────────
  if (!user || (user.role !== 'admin' && user.role !== 'superAdmin')) {
    return (
      <div className="p-8 text-center text-sm text-gray-500">
        You do not have permission to view this page.
      </div>
    );
  }

  const auth = { userId: user.id, userRole: user.role };

  // ── Content list (for section 2) ───────────────────────────────────────────
  const [content, setContent] = useState<ResetContentList | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);

  const loadContent = useCallback(async () => {
    try {
      setContentError(null);
      const list = await fetchContentList(auth);
      setContent(list);
    } catch (err) {
      setContentError(err instanceof Error ? err.message : 'Failed to load content');
    }
  }, [user.id, user.role]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadContent(); }, [loadContent]);

  // ── Section 1: Daily Rhythm ────────────────────────────────────────────────
  const [rhythmState, setRhythmState] = useState<ActionState>('idle');
  const [rhythmError, setRhythmError] = useState<string | undefined>();
  const [rhythmConfirm, setRhythmConfirm] = useState(false);
  const [dailyOpenState, setDailyOpenState] = useState<ActionState>('idle');
  const [dailyOpenError, setDailyOpenError] = useState<string | undefined>();

  const handleDailyOpenReset = () => {
    try {
      clearDailyOpenMarkers();
      setDailyOpenError(undefined);
      setDailyOpenState('done');
    } catch (err) {
      setDailyOpenError(err instanceof Error ? err.message : 'Reset failed');
      setDailyOpenState('error');
    }
  };

  const handleRhythmReset = async () => {
    setRhythmConfirm(false);
    setRhythmState('loading');
    setRhythmError(undefined);
    try {
      await resetDailyRhythm(auth);
      clearLocalProgressCache(auth.userId);
      setRhythmState('done');
    } catch (err) {
      setRhythmError(err instanceof Error ? err.message : 'Reset failed');
      setRhythmState('error');
    }
  };

  // ── Section 2: Individual Journey ─────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<ResetItem | null>(null);
  const [journeyStates, setJourneyStates] = useState<Record<string, ActionState>>({});
  const [journeyErrors, setJourneyErrors] = useState<Record<string, string>>({});

  const setJourneyState = (id: string, state: ActionState) =>
    setJourneyStates(prev => ({ ...prev, [id]: state }));
  const setJourneyError = (id: string, msg: string) =>
    setJourneyErrors(prev => ({ ...prev, [id]: msg }));

  const handleJourneyReset = async () => {
    if (!selectedItem) return;
    const { id, kind } = selectedItem;
    setSelectedItem(null);
    setJourneyState(id, 'loading');
    setJourneyErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
    try {
      await resetJourney(id, kind, auth);
      clearLocalProgressCache(auth.userId);
      setJourneyState(id, 'done');
    } catch (err) {
      setJourneyError(id, err instanceof Error ? err.message : 'Reset failed');
      setJourneyState(id, 'error');
    }
  };

  // ── Section 3: Reset Everything ───────────────────────────────────────────
  const [everythingState, setEverythingState] = useState<ActionState>('idle');
  const [everythingError, setEverythingError] = useState<string | undefined>();
  const [everythingConfirm1, setEverythingConfirm1] = useState(false);
  const [everythingConfirm2, setEverythingConfirm2] = useState(false);

  const handleEverythingReset = async () => {
    setEverythingConfirm2(false);
    setEverythingState('loading');
    setEverythingError(undefined);
    try {
      await resetEverything(auth);
      clearLocalProgressCache(auth.userId);
      // Also reset section states so the page reflects the clean slate
      setRhythmState('idle');
      setJourneyStates({});
      setJourneyErrors({});
      setEverythingState('done');
      // Re-fetch content list so counts are fresh
      loadContent();
    } catch (err) {
      setEverythingError(err instanceof Error ? err.message : 'Reset failed');
      setEverythingState('error');
    }
  };

  // ── Build the reset item list ──────────────────────────────────────────────
  const buildItems = (): ResetItem[] => {
    if (!content) return [];
    const items: ResetItem[] = [];

    // Regular journeys
    for (const j of content.journeys) {
      const isDailyRhythm =
        j.journeyType === 'daily-rhythm' || j.journeyType === 'core';
      items.push({
        id: j.id,
        title: j.title,
        kind: 'journey',
        category: isDailyRhythm ? 'Daily Rhythm' : 'Journey',
      });
    }

    // Devotionals
    for (const d of content.devotionals) {
      items.push({ id: d.id, title: d.title, kind: 'devotional', category: 'Devotional' });
    }

    // Sermon Companions
    for (const c of content.companions) {
      items.push({ id: c.id, title: c.title, kind: 'companion', category: 'Sermon Companion' });
    }

    return items;
  };

  const items = buildItems();

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Confirm: Daily Rhythm */}
      {rhythmConfirm && (
        <ConfirmDialog
          title="Reset Daily Rhythm?"
          message="This will return Day 1 to Day 1 and clear all completion history for Daily Rhythm. This cannot be undone."
          confirmLabel="Reset"
          danger
          onConfirm={handleRhythmReset}
          onCancel={() => setRhythmConfirm(false)}
        />
      )}

      {/* Confirm: Individual Journey */}
      {selectedItem && (
        <ConfirmDialog
          title={`Reset ${selectedItem.title}?`}
          message="Progress and completion history for this journey will be removed. This cannot be undone."
          confirmLabel="Reset"
          danger
          onConfirm={handleJourneyReset}
          onCancel={() => setSelectedItem(null)}
        />
      )}

      {/* Confirm 1: Reset Everything (initial) */}
      {everythingConfirm1 && (
        <ConfirmDialog
          title="Reset everything?"
          message="All journeys, devotionals, sermon companions, streaks, and completion history will be removed. Your account, profile, and settings are untouched. This cannot be undone."
          confirmLabel="Yes, continue"
          danger
          onConfirm={() => { setEverythingConfirm1(false); setEverythingConfirm2(true); }}
          onCancel={() => setEverythingConfirm1(false)}
        />
      )}

      {/* Confirm 2: Reset Everything (second check) */}
      {everythingConfirm2 && (
        <ConfirmDialog
          title="Are you absolutely sure?"
          message="This will permanently remove all progress for this account and return it to a first-time member state."
          confirmLabel="Reset everything"
          danger
          onConfirm={handleEverythingReset}
          onCancel={() => setEverythingConfirm2(false)}
        />
      )}

      <div className="max-w-2xl">
        <div className="p-6 lg:p-8 space-y-6">
          <PageHeader
            title="Testing"
            subtitle="Reset progress for your admin account during development and testing. These actions affect only this account."
          />

          {/* ── Section 1: Daily Rhythm ─────────────────────────────────────── */}
          <SectionCard>
            <SectionTitle
              label="Reset Daily Rhythm"
              sub="Returns Daily Rhythm to Day 1 and clears all completion history. Day 1 becomes available immediately. No other journeys are affected."
            />
            <div className="flex items-center gap-4 pt-1">
              <ResetBtn
                onClick={() => { setRhythmState('idle'); setRhythmConfirm(true); }}
                disabled={rhythmState === 'loading'}
              >
                <span className="flex items-center gap-1.5">
                  <RotateCcw size={13} />
                  Reset Daily Rhythm
                </span>
              </ResetBtn>
              <StatusPill state={rhythmState} errorMsg={rhythmError} />
            </div>
          </SectionCard>

          {/* ── Section 1b: Daily open marker ───────────────────────────────── */}
          <SectionCard>
            <SectionTitle
              label="Prepare Next Member Launch"
              sub="Clears the splash-session flag in this browser so the normal next launch can be checked from a clean state. Progress and completion history are not changed."
            />
            <div className="flex items-center gap-4 pt-1">
              <ResetBtn
                onClick={handleDailyOpenReset}
                disabled={dailyOpenState === 'loading'}
              >
                <span className="flex items-center gap-1.5">
                  <RotateCcw size={13} />
                  Prepare Normal Launch Test
                </span>
              </ResetBtn>
              <StatusPill state={dailyOpenState} errorMsg={dailyOpenError} />
            </div>
          </SectionCard>

          {/* ── Section 2: Individual Journey ──────────────────────────────────── */}
          <SectionCard>
            <SectionTitle
              label="Reset Individual Journey"
              sub="Select a journey, devotional, or sermon companion to reset. All other journeys are left untouched."
            />

            {contentError && (
              <p className="text-xs text-red-600">{contentError}</p>
            )}

            {!content && !contentError && (
              <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                <Loader2 size={12} className="animate-spin" /> Loading…
              </div>
            )}

            {content && items.length === 0 && (
              <p className="text-xs text-gray-400 py-2">No published content found.</p>
            )}

            {content && items.length > 0 && (
              <div className="divide-y divide-gray-100 -mx-1">
                {items.map(item => {
                  const state = journeyStates[item.id] ?? 'idle';
                  const errMsg = journeyErrors[item.id];
                  return (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-1 py-3"
                    >
                      {/* Category badge */}
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-gray-400 w-24">
                        {item.category}
                      </span>

                      {/* Title */}
                      <span className="flex-1 text-sm text-gray-800 truncate">
                        {item.title}
                      </span>

                      {/* Status or button */}
                      {state === 'loading' ? (
                        <Loader2 size={14} className="animate-spin text-gray-400 shrink-0" />
                      ) : state === 'done' ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600 font-medium shrink-0">
                          <CheckCircle2 size={12} /> Reset
                        </span>
                      ) : state === 'error' ? (
                        <span className="text-xs text-red-600 shrink-0 max-w-[120px] truncate">
                          {errMsg ?? 'Failed'}
                        </span>
                      ) : (
                        <button
                          onClick={() => setSelectedItem(item)}
                          className="shrink-0 flex items-center gap-1 text-xs text-gray-500 hover:text-red-600 transition-colors font-medium"
                        >
                          Reset
                          <ChevronRight size={12} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          {/* ── Section 3: Reset Everything ─────────────────────────────────────── */}
          <div className="bg-red-50 rounded-xl border border-red-200 p-6 space-y-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
              <div>
                <h2 className="text-sm font-semibold text-red-900">Reset Everything</h2>
                <p className="text-xs text-red-700 mt-0.5 leading-relaxed">
                  Returns this account to a first-time member state. Removes all
                  journeys, devotionals, sermon companions, streaks, and completion
                  history. Your account, profile, login, settings, and notification
                  preferences are not affected. Requires two confirmations.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <ResetBtn
                danger
                onClick={() => { setEverythingState('idle'); setEverythingConfirm1(true); }}
                disabled={everythingState === 'loading'}
              >
                <span className="flex items-center gap-1.5">
                  <RotateCcw size={13} />
                  Reset Everything
                </span>
              </ResetBtn>
              <StatusPill state={everythingState} errorMsg={everythingError} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
