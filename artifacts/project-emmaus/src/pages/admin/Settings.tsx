import React, { useState, useCallback } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { ChurchSettings } from '@/lib/admin-demo-data';
import { UnsavedBanner, SaveMessage, PageHeader, Field, TextInput, AdminBtn } from './shared';

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
      </div>
    </div>
  );
}
