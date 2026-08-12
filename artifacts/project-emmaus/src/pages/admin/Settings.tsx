import React, { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAdmin } from '@/contexts/AdminContext';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import { ChurchSettings } from '@/lib/admin-demo-data';
import {
  UnsavedBanner, SaveMessage, PageHeader, Field,
  TextInput, AdminBtn, ConfirmDialog,
} from './shared';
import {
  isDevModeAuthorized,
  isDevelopmentMode,
  getDevModeEnabled,
  setDevModeEnabled,
  logDevAction,
  getDevAuditLog,
  clearDevAuditLog,
  type DevAuditEntry,
} from '@/lib/dev-mode';
import { FlaskConical, ChevronDown, Video, Mic } from 'lucide-react';
import { getVoiceSettings, updateVoiceSettings, type VoiceSettings } from '@/lib/voice-client';
import { apiGetVideoSettings, apiUpdateVideoSettings } from '@/lib/rooms-api';

// ─── Rooms & Video settings section ──────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  group_leader: 'Group Leader',
  pastor:       'Pastor',
  admin:        'Admin',
  superAdmin:   'Super Admin',
};

type VidSettings = {
  videoEnabled: boolean;
  maxConcurrentRooms: number;
  maxParticipantsPerRoom: number;
  maxDurationMinutes: number;
  allowedRoles: string[];
};

function VideoSettingsSection() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<VidSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  useEffect(() => {
    if (!user) return;
    apiGetVideoSettings(user.id).then(setSettings).catch(() => {});
  }, [user]);

  async function patch<K extends keyof VidSettings>(key: K, value: VidSettings[K]) {
    if (!settings || !user) return;
    const next: VidSettings = { ...settings, [key]: value };
    setSettings(next);
    setSaving(true);
    try {
      const updated = await apiUpdateVideoSettings(user.id, { [key]: value });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch { /* non-fatal */ }
    finally { setSaving(false); }
  }

  if (!settings) return null;

  const ALL_ROLES = ['group_leader', 'pastor', 'admin', 'superAdmin'];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Video size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Groups &amp; Video Settings</h2>
        </div>
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {saved  && <span className="text-xs text-green-600">Saved</span>}
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">
        Video Rooms require LiveKit integration (Step 2 — not yet active). These settings
        will enforce cost limits and permission controls when video is enabled.
      </p>

      {/* Enable / disable video */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.videoEnabled}
          onChange={e => patch('videoEnabled', e.target.checked)}
          className="w-4 h-4 rounded"
        />
        <div>
          <div className="text-sm font-medium text-gray-700">Video Rooms enabled</div>
          <div className="text-xs text-gray-400">
            When off, no user can start or join a LiveKit video session.
          </div>
        </div>
      </label>

      {/* Limits */}
      <div className="grid grid-cols-3 gap-4">
        <Field label="Max concurrent rooms">
          <input
            type="number"
            min={1}
            max={100}
            value={settings.maxConcurrentRooms}
            onChange={e => patch('maxConcurrentRooms', Number(e.target.value))}
            className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>
        <Field label="Max participants / room">
          <input
            type="number"
            min={2}
            max={500}
            value={settings.maxParticipantsPerRoom}
            onChange={e => patch('maxParticipantsPerRoom', Number(e.target.value))}
            className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>
        <Field label="Max duration (min)">
          <input
            type="number"
            min={15}
            max={480}
            value={settings.maxDurationMinutes}
            onChange={e => patch('maxDurationMinutes', Number(e.target.value))}
            className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>
      </div>

      {/* Allowed roles */}
      <Field label="Who can start video">
        <div className="flex flex-wrap gap-3 pt-1">
          {ALL_ROLES.map(role => (
            <label key={role} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.allowedRoles.includes(role)}
                onChange={e => {
                  const next = e.target.checked
                    ? [...settings.allowedRoles, role]
                    : settings.allowedRoles.filter(r => r !== role);
                  patch('allowedRoles', next);
                }}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-gray-700">{ROLE_LABELS[role] ?? role}</span>
            </label>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Members can always join authorised meetings but cannot start video unless granted a role above.
        </p>
      </Field>

      {/* Room type legend */}
      <div className="pt-2 border-t border-gray-100 space-y-2">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Group Types</p>
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
          <div><span className="font-medium text-gray-700">Personal</span> — any member, no video</div>
          <div><span className="font-medium text-gray-700">Ministry</span> — Group Leader+, video allowed</div>
          <div><span className="font-medium text-gray-700">Leadership</span> — Pastor+, private</div>
          <div><span className="font-medium text-gray-700">Church Service</span> — future: reserved</div>
        </div>
      </div>
    </div>
  );
}

// ─── Emmaus Voice settings section ───────────────────────────────────────────

const VOICE_OPTIONS: { value: string; label: string }[] = [
  { value: 'nova',    label: 'Nova (warm, calm)' },
  { value: 'shimmer', label: 'Shimmer (gentle, bright)' },
  { value: 'alloy',   label: 'Alloy (neutral)' },
  { value: 'echo',    label: 'Echo (clear, confident)' },
  { value: 'fable',   label: 'Fable (expressive)' },
  { value: 'onyx',    label: 'Onyx (deep, authoritative)' },
];

function VoiceSettingsSection() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<VoiceSettings | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    getVoiceSettings(user.id).then(setSettings).catch(() => {});
  }, [user]);

  async function patch<K extends keyof VoiceSettings>(key: K, value: VoiceSettings[K]) {
    if (!settings || !user) return;
    const next: VoiceSettings = { ...settings, [key]: value };
    setSettings(next);
    setSaving(true);
    setError(null);
    try {
      const updated = await updateVoiceSettings(user.id, { [key]: value });
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Emmaus Voice Settings</h2>
        </div>
        {saving && <span className="text-xs text-gray-400">Saving…</span>}
        {saved  && <span className="text-xs text-green-600">Saved</span>}
      </div>

      <p className="text-xs text-gray-400 leading-relaxed">
        Voice mode lets members speak their questions and hear Emmaus respond in a natural voice.
        Uses OpenAI Whisper for transcription and TTS for spoken responses.
      </p>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      {/* Enable / disable */}
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={e => patch('enabled', e.target.checked)}
          className="w-4 h-4 rounded"
        />
        <div>
          <div className="text-sm font-medium text-gray-700">Voice mode enabled</div>
          <div className="text-xs text-gray-400">
            When off, the mic button and "Hear Emmaus" feature are disabled for all members.
          </div>
        </div>
      </label>

      {/* Voice selection */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block">
          Voice
        </label>
        <select
          value={settings.voice}
          onChange={e => patch('voice', e.target.value as VoiceSettings['voice'])}
          className="w-full h-9 rounded-lg border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        >
          {VOICE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400">Nova and Shimmer are recommended for a warm, pastoral feel.</p>
      </div>

      {/* Speed */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide block">
          Speed: {settings.speed.toFixed(1)}×
        </label>
        <input
          type="range"
          min={0.5}
          max={2.0}
          step={0.1}
          value={settings.speed}
          onChange={e => patch('speed', Number(e.target.value))}
          className="w-full"
        />
        <div className="flex justify-between text-xs text-gray-400">
          <span>0.5× (slower)</span>
          <span>2.0× (faster)</span>
        </div>
      </div>
    </div>
  );
}

// ─── Church settings section ──────────────────────────────────────────────────

export default function AdminSettings() {
  const { settings, updateSettings } = useAdmin();
  const [form, setForm] = useState<ChurchSettings>({ ...settings });
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const patch = (k: keyof ChurchSettings, v: unknown) => {
    setForm(f => ({ ...f, [k]: v }));
    setIsDirty(true);
  };

  const handleSave = useCallback(() => {
    setSaveState('saving');
    updateSettings(form);
    setIsDirty(false);
    setSaveState('saved');
    setTimeout(() => setSaveState('idle'), 2500);
  }, [form, updateSettings]);

  return (
    <div className="max-w-2xl">
      {isDirty && <UnsavedBanner onDiscard={() => { setIsDirty(false); setForm({ ...settings }); }} />}

      <div className="p-6 lg:p-8 space-y-6">
        <PageHeader
          title="Settings"
          action={
            <div className="flex items-center gap-3">
              <SaveMessage state={saveState} />
              <AdminBtn variant="primary" onClick={handleSave}>Save Settings</AdminBtn>
            </div>
          }
        />

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-700">Church Identity</h2>

          <Field label="Church name">
            <TextInput value={form.churchName} onChange={e => patch('churchName', e.target.value)} />
          </Field>
          <Field label="Tagline">
            <TextInput value={form.tagline} onChange={e => patch('tagline', e.target.value)} />
          </Field>
          <Field label="Contact email">
            <TextInput type="email" value={form.contactEmail} onChange={e => patch('contactEmail', e.target.value)} />
          </Field>
          <Field label="Website">
            <TextInput type="url" value={form.website} onChange={e => patch('website', e.target.value)} />
          </Field>
          <Field label="YouTube channel URL">
            <TextInput type="url" value={form.youtubeChannelUrl} onChange={e => patch('youtubeChannelUrl', e.target.value)} />
          </Field>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          <h2 className="text-sm font-semibold text-gray-700">App Behaviour</h2>

          <Field label="Primary accent colour">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={form.primaryAccentColor}
                onChange={e => patch('primaryAccentColor', e.target.value)}
                className="w-10 h-10 rounded border border-gray-200 cursor-pointer p-0.5"
              />
              <TextInput
                value={form.primaryAccentColor}
                onChange={e => patch('primaryAccentColor', e.target.value)}
                className="font-mono w-36"
              />
            </div>
          </Field>

          <Field label="Default notification time">
            <TextInput
              type="time"
              value={form.defaultNotificationTime}
              onChange={e => patch('defaultNotificationTime', e.target.value)}
              className="w-40"
            />
            <p className="text-xs text-gray-400 mt-1">Placeholder only — push delivery not yet implemented.</p>
          </Field>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.weeklySermonCompanionEnabled}
              onChange={e => patch('weeklySermonCompanionEnabled', e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <div>
              <div className="text-sm font-medium text-gray-700">Weekly Sermon Companion enabled</div>
              <div className="text-xs text-gray-400">Show the Companion Journey in the user home screen each week.</div>
            </div>
          </label>
        </div>

        <div className="flex gap-3">
          <AdminBtn variant="secondary" onClick={() => { setIsDirty(false); setForm({ ...settings }); }}>
            Discard changes
          </AdminBtn>
          <AdminBtn variant="primary" onClick={handleSave}>Save Settings</AdminBtn>
        </div>

        {/* Development section — visible only to authorised admin/superAdmin accounts */}
        <DevSection />

        {/* Rooms & Video Settings section */}
        <VideoSettingsSection />

        {/* Emmaus Voice Settings section */}
        <VoiceSettingsSection />
      </div>
    </div>
  );
}

// ─── Development section ──────────────────────────────────────────────────────

function DevSection() {
  const { user } = useAuth();
  const { journeys, getStepsForJourney, progress, resetProgress, markStepIncomplete, completeStep } = useJourney();
  const [, setLocation] = useLocation();

  // Not shown to normal members.
  if (!isDevModeAuthorized(user) || !user) return null;

  const userId  = user.id;
  const devOn   = isDevelopmentMode(user);
  const [, forceRender] = useState(0);
  const rerender = () => forceRender(n => n + 1);

  // Resolve Daily Rhythm journey + steps for pickers.
  const coreJourney = journeys.find(
    j => (j.journeyType === 'daily-rhythm' || j.journeyType === 'core') && j.status === 'Published'
  );
  const journeyId   = coreJourney?.id ?? '';
  const prog        = journeyId ? progress[journeyId] : undefined;
  const currentDay  = prog?.currentDay ?? 1;

  const publishedDays = coreJourney
    ? getStepsForJourney(coreJourney.id)
        .filter(s => s.status === 'Published')
        .sort((a, b) => a.day - b.day)
    : [];

  // Local state
  const [previewDay, setPreviewDay]         = useState<number>(publishedDays[0]?.day ?? 1);
  const [markCompleteDay, setMarkCompleteDay] = useState<number>(currentDay);
  const [markIncompleteDay, setMarkIncompleteDay] = useState<number>(Math.max(1, currentDay - 1));
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [actionMsg, setActionMsg]           = useState('');
  const [auditLog, setAuditLog]             = useState<DevAuditEntry[]>(() => getDevAuditLog(userId));

  // Keep day selectors in sync when progress changes.
  useEffect(() => {
    setMarkCompleteDay(currentDay);
    setMarkIncompleteDay(Math.max(1, currentDay - 1));
  }, [currentDay]);

  const flash = (msg: string) => {
    setActionMsg(msg);
    setTimeout(() => setActionMsg(''), 3000);
  };

  const refreshAudit = () => setAuditLog(getDevAuditLog(userId));

  // ── Toggle dev mode ─────────────────────────────────────────────────────────
  const handleToggle = () => {
    const next = !getDevModeEnabled(userId);
    setDevModeEnabled(userId, next);
    rerender();
    refreshAudit();
  };

  // ── Open a day in the reader ────────────────────────────────────────────────
  const handlePreviewDay = () => {
    if (!previewDay) return;
    logDevAction(userId, 'preview_day_opened', { newState: String(previewDay) });
    refreshAudit();
    setLocation(`/daily-rhythm/day/${previewDay}` as `/${string}`);
  };

  // ── Preview presets ─────────────────────────────────────────────────────────
  const handlePreviewFirstTime = () => {
    logDevAction(userId, 'preset_first_time_member');
    refreshAudit();
    setLocation('/daily-rhythm/day/1' as `/${string}`);
  };

  const handlePreviewReturning = () => {
    logDevAction(userId, 'preset_returning_member');
    refreshAudit();
    setLocation('/walk' as `/${string}`);
  };

  // ── Mark day complete ───────────────────────────────────────────────────────
  const handleMarkComplete = async () => {
    if (!journeyId) return;
    try {
      const prev = JSON.stringify({ currentDay, completedDays: prog?.completedDays });
      completeStep(journeyId, markCompleteDay, '');
      logDevAction(userId, 'mark_day_complete', {
        previousState: prev,
        newState: `day=${markCompleteDay}`,
      });
      refreshAudit();
      flash(`Day ${markCompleteDay} marked complete.`);
    } catch {
      flash('Failed to mark day complete.');
    }
  };

  // ── Mark day incomplete ─────────────────────────────────────────────────────
  const handleMarkIncomplete = async () => {
    if (!journeyId) return;
    try {
      const prev = JSON.stringify({ currentDay, completedDays: prog?.completedDays });
      await markStepIncomplete(journeyId, markIncompleteDay);
      logDevAction(userId, 'mark_day_incomplete', {
        previousState: prev,
        newState: `day=${markIncompleteDay}`,
      });
      refreshAudit();
      flash(`Day ${markIncompleteDay} marked incomplete.`);
    } catch {
      flash('Failed to mark day incomplete.');
    }
  };

  // ── Reset progress ──────────────────────────────────────────────────────────
  const handleReset = async () => {
    setShowResetConfirm(false);
    if (!journeyId) return;
    try {
      const prev = JSON.stringify({ currentDay, completedDays: prog?.completedDays });
      await resetProgress(journeyId);
      logDevAction(userId, 'progress_reset', {
        previousState: prev,
        newState: 'currentDay=1,completedDays=[]',
      });
      refreshAudit();
      flash('Test progress reset to Day 1.');
    } catch {
      flash('Failed to reset progress.');
    }
  };

  const devEnabled = getDevModeEnabled(userId);

  return (
    <>
      {/* Confirm dialog */}
      {showResetConfirm && (
        <ConfirmDialog
          title="Reset your Daily Rhythm test progress?"
          message="This affects only your development account. Your progress will return to Day 1."
          confirmLabel="Reset Test Progress"
          danger
          onConfirm={handleReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      <div className="bg-amber-50 rounded-xl border border-amber-200 p-6 space-y-6">
        {/* Section header */}
        <div className="flex items-center gap-2">
          <FlaskConical size={16} className="text-amber-600 shrink-0" />
          <h2 className="text-sm font-semibold text-amber-900">Development</h2>
        </div>

        {/* ── Toggle ─────────────────────────────────────────────────────────── */}
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="text-sm font-medium text-gray-800">Development Mode</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Temporarily bypass member scheduling restrictions while testing Emmaus.
            </div>
          </div>
          <button
            onClick={handleToggle}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${
              devEnabled ? 'bg-amber-500' : 'bg-gray-200'
            }`}
            role="switch"
            aria-checked={devEnabled}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform ${
                devEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Status indicator */}
        {devEnabled && (
          <div className="flex items-center gap-2 text-xs text-amber-700 font-medium">
            <FlaskConical size={12} />
            <span className="uppercase tracking-wide">Development Mode is ON</span>
          </div>
        )}

        {/* ── Preview Day ─────────────────────────────────────────────────────── */}
        {publishedDays.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-amber-200">
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Preview Day</div>
            <p className="text-xs text-gray-500">
              Open any published Daily Rhythm day in the member reader.
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <select
                  value={previewDay}
                  onChange={e => setPreviewDay(Number(e.target.value))}
                  className="w-full appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm pr-8 focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  {publishedDays.map(s => (
                    <option key={s.day} value={s.day}>
                      Day {s.day} — {s.title}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-3 text-gray-400 pointer-events-none" />
              </div>
              <AdminBtn variant="primary" onClick={handlePreviewDay}>
                Open Day →
              </AdminBtn>
            </div>
          </div>
        )}

        {/* ── Preview presets ──────────────────────────────────────────────────── */}
        <div className="space-y-3 pt-2 border-t border-amber-200">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Preview Presets</div>
          <div className="flex flex-wrap gap-2">
            <AdminBtn variant="secondary" onClick={handlePreviewFirstTime}>
              Preview as First-Time Member
            </AdminBtn>
            <AdminBtn variant="secondary" onClick={handlePreviewReturning}>
              Preview as Returning Member
            </AdminBtn>
          </div>
        </div>

        {/* ── Test progress tools ──────────────────────────────────────────────── */}
        <div className="space-y-4 pt-2 border-t border-amber-200">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Test Progress Tools</div>

          {journeyId ? (
            <>
              <div className="text-xs text-gray-500">
                Your progress: Day {currentDay}{prog ? ` · completed ${prog.completedDays.length} days` : ''}
              </div>

              {/* Mark Complete */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-32 shrink-0">Mark Day Complete</label>
                <select
                  value={markCompleteDay}
                  onChange={e => setMarkCompleteDay(Number(e.target.value))}
                  className="flex-1 appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  {publishedDays.map(s => (
                    <option key={s.day} value={s.day}>Day {s.day} — {s.title}</option>
                  ))}
                </select>
                <AdminBtn variant="secondary" onClick={handleMarkComplete}>
                  Mark Complete
                </AdminBtn>
              </div>

              {/* Mark Incomplete */}
              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-600 w-32 shrink-0">Mark Day Incomplete</label>
                <select
                  value={markIncompleteDay}
                  onChange={e => setMarkIncompleteDay(Number(e.target.value))}
                  className="flex-1 appearance-none bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber-400"
                >
                  {publishedDays.map(s => (
                    <option key={s.day} value={s.day}>Day {s.day} — {s.title}</option>
                  ))}
                </select>
                <AdminBtn variant="secondary" onClick={handleMarkIncomplete}>
                  Mark Incomplete
                </AdminBtn>
              </div>

              {/* Reset */}
              <div className="pt-1">
                <AdminBtn variant="danger" onClick={() => setShowResetConfirm(true)}>
                  Reset My Daily Rhythm Test Progress
                </AdminBtn>
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400">No Daily Rhythm journey found.</p>
          )}

          {/* Feedback message */}
          {actionMsg && (
            <div className="text-xs text-amber-700 font-medium">{actionMsg}</div>
          )}
        </div>

        {/* ── Audit log ────────────────────────────────────────────────────────── */}
        {auditLog.length > 0 && (
          <div className="space-y-3 pt-2 border-t border-amber-200">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Audit Log</div>
              <button
                onClick={() => { clearDevAuditLog(userId); setAuditLog([]); }}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Clear
              </button>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {auditLog.slice(0, 20).map(entry => (
                <div key={entry.id} className="flex gap-3 text-xs text-gray-500">
                  <span className="text-gray-300 shrink-0">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="font-medium text-gray-700">{entry.action}</span>
                  {entry.newState && (
                    <span className="text-gray-400 truncate">{entry.newState}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
