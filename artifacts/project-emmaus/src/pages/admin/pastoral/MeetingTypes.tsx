/**
 * MeetingTypes.tsx — Admin UI for creating and managing meeting types.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Pencil, Check, X, ToggleLeft, ToggleRight, AlertCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

const CATEGORIES = ['general','sunday','midweek','youth','recovery','training','special'];
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

interface FormState {
  name: string;
  category: string;
  description: string;
  usualDay: string;
  usualTime: string;
  responsibleMinistry: string;
  trackAttendance: boolean;
  careSignalEnabled: boolean;
  isSensitive: boolean;
}

const EMPTY: FormState = {
  name: '', category: 'general', description: '',
  usualDay: '', usualTime: '', responsibleMinistry: '',
  trackAttendance: true, careSignalEnabled: false, isSensitive: false,
};

export default function MeetingTypes() {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

  const [types, setTypes]         = useState<api.MeetingType[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editId, setEditId]       = useState<string | null>(null);
  const [form, setForm]           = useState<FormState>(EMPTY);
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setTypes(await api.listMeetingTypes(auth, includeInactive)); }
    catch { setError('Could not load meeting types.'); }
    finally { setLoading(false); }
  }, [auth.userId, includeInactive]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(EMPTY); setEditId(null); setShowCreate(true); setSaveError(''); };
  const openEdit   = (mt: api.MeetingType) => {
    setForm({
      name: mt.name, category: mt.category, description: mt.description,
      usualDay: mt.usualDay ?? '', usualTime: mt.usualTime ?? '',
      responsibleMinistry: mt.responsibleMinistry ?? '',
      trackAttendance: mt.trackAttendance, careSignalEnabled: mt.careSignalEnabled,
      isSensitive: mt.isSensitive,
    });
    setEditId(mt.id); setShowCreate(false); setSaveError('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError('Name is required.'); return; }
    setSaving(true); setSaveError('');
    try {
      const payload = {
        name: form.name.trim(),
        category: form.category,
        description: form.description.trim(),
        usualDay: form.usualDay || undefined,
        usualTime: form.usualTime || undefined,
        responsibleMinistry: form.responsibleMinistry.trim() || undefined,
        trackAttendance: form.trackAttendance,
        careSignalEnabled: form.careSignalEnabled,
        isSensitive: form.isSensitive,
      };
      if (editId) {
        await api.updateMeetingType(auth, editId, payload);
      } else {
        await api.createMeetingType(auth, payload);
      }
      setShowCreate(false); setEditId(null);
      await load();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (mt: api.MeetingType) => {
    try { await api.updateMeetingType(auth, mt.id, { isActive: !mt.isActive }); await load(); }
    catch { setError('Could not update meeting type.'); }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</label>
      {children}
    </div>
  );

  const inp  = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';
  const sInp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';

  const FormPanel = () => (
    <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
      <h3 className="text-[14px] font-semibold text-gray-800">{editId ? 'Edit Meeting Type' : 'New Meeting Type'}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Name *">
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="e.g. Sunday Morning" className={inp} />
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={sInp}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
        </Field>
        <Field label="Usual Day">
          <select value={form.usualDay} onChange={e => setForm(f => ({ ...f, usualDay: e.target.value }))} className={sInp}>
            <option value="">— Not set —</option>
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>
        <Field label="Usual Time">
          <input type="time" value={form.usualTime} onChange={e => setForm(f => ({ ...f, usualTime: e.target.value }))} className={inp} />
        </Field>
        <Field label="Responsible Ministry">
          <input value={form.responsibleMinistry} onChange={e => setForm(f => ({ ...f, responsibleMinistry: e.target.value }))}
            placeholder="e.g. Worship Team" className={inp} />
        </Field>
      </div>

      <Field label="Description">
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          rows={2} placeholder="Optional description" className={`${inp} resize-none`} />
      </Field>

      <div className="space-y-2.5">
        {([
          ['trackAttendance',   'Track attendance for this meeting type'],
          ['careSignalEnabled', 'Generate care signals for missed attendance (Checkpoint 4)'],
          ['isSensitive',       'Sensitive programme — restricted visibility'],
        ] as [keyof FormState, string][]).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2.5 cursor-pointer">
            <input type="checkbox" checked={form[k] as boolean}
              onChange={e => setForm(f => ({ ...f, [k]: e.target.checked }))}
              className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
            <span className="text-[13px] text-gray-700">{label}</span>
          </label>
        ))}
      </div>

      {saveError && (
        <p className="flex items-center gap-1.5 text-[12px] text-red-600">
          <AlertCircle size={12} /> {saveError}
        </p>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <button onClick={() => { setShowCreate(false); setEditId(null); }}
          className="px-4 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100 transition-colors">
          Cancel
        </button>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 disabled:opacity-40 transition-colors">
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          {editId ? 'Save Changes' : 'Create'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-5 max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold text-gray-900">Meeting Types</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">Reusable templates for creating dated sessions</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-gray-500 cursor-pointer">
            <input type="checkbox" checked={includeInactive}
              onChange={e => setIncludeInactive(e.target.checked)}
              className="rounded border-gray-300 text-teal-600" />
            Show inactive
          </label>
          <button onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 transition-colors">
            <Plus size={13} /> New Type
          </button>
        </div>
      </div>

      {showCreate && !editId && <FormPanel />}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      ) : error ? (
        <p className="flex items-center gap-2 text-[13px] text-red-600 py-8">
          <AlertCircle size={14} /> {error}
        </p>
      ) : types.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-[14px]">No meeting types yet.</p>
          <p className="text-[12px] mt-1">Create one to start tracking attendance.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {types.map(mt => (
            <div key={mt.id} className={`border rounded-xl overflow-hidden ${mt.isActive ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100'}`}>
              {/* Header row */}
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[14px] font-medium ${mt.isActive ? 'text-gray-900' : 'text-gray-400'}`}>{mt.name}</span>
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-gray-500 uppercase tracking-wide">{mt.category}</span>
                    {mt.isSensitive && <span className="px-2 py-0.5 rounded-full bg-red-50 text-[10px] font-medium text-red-600">Sensitive</span>}
                    {!mt.isActive && <span className="px-2 py-0.5 rounded-full bg-gray-200 text-[10px] font-medium text-gray-400">Inactive</span>}
                  </div>
                  {(mt.usualDay || mt.usualTime) && (
                    <p className="text-[12px] text-gray-400 mt-0.5">
                      {[mt.usualDay, mt.usualTime].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setExpandedId(expandedId === mt.id ? null : mt.id)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                    {expandedId === mt.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  <button onClick={() => openEdit(mt)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => handleToggleActive(mt)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors"
                    title={mt.isActive ? 'Deactivate' : 'Activate'}>
                    {mt.isActive ? <ToggleRight size={16} className="text-teal-600" /> : <ToggleLeft size={16} />}
                  </button>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === mt.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-1.5">
                  {mt.description && <p className="text-[13px] text-gray-600">{mt.description}</p>}
                  <div className="flex flex-wrap gap-3 text-[12px] text-gray-500">
                    <span>Track attendance: <b className="text-gray-700">{mt.trackAttendance ? 'Yes' : 'No'}</b></span>
                    <span>Care signals: <b className="text-gray-700">{mt.careSignalEnabled ? 'Yes' : 'Checkpoint 4'}</b></span>
                    {mt.responsibleMinistry && <span>Ministry: <b className="text-gray-700">{mt.responsibleMinistry}</b></span>}
                  </div>
                </div>
              )}

              {editId === mt.id && <div className="border-t border-gray-100 p-4"><FormPanel /></div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
