/**
 * Sessions.tsx — Admin UI for creating and managing dated meeting sessions.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus, CalendarDays, Clock, MapPin, CheckCircle, XCircle,
  Loader2, AlertCircle, ChevronRight, Users, RotateCcw,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';
import { isPastoralSessionVisible } from '@/lib/pastoral-visibility';

interface Props {
  onOpenRegister: (session: api.MeetingSession) => void;
}

export default function Sessions({ onOpenRegister }: Props) {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

  const [sessions, setSessions]       = useState<api.MeetingSession[]>([]);
  const [types, setTypes]             = useState<api.MeetingType[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [showCreate, setShowCreate]   = useState(false);
  const [saving, setSaving]           = useState(false);
  const [saveError, setSaveError]     = useState('');
  const [filterType, setFilterType]   = useState('');

  const [form, setForm] = useState({
    meetingTypeId: '', sessionDate: new Date().toISOString().slice(0, 10),
    startTime: '', location: '', notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [s, t] = await Promise.all([
        api.listSessions(auth, { meetingTypeId: filterType || undefined, limit: 50 }),
        api.listMeetingTypes(auth),
      ]);
      setSessions(s); setTypes(t);
      if (!form.meetingTypeId && t.length > 0) setForm(f => ({ ...f, meetingTypeId: t[0].id }));
    } catch { setError('Could not load sessions.'); }
    finally { setLoading(false); }
  }, [auth.userId, filterType]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    if (!form.meetingTypeId || !form.sessionDate) { setSaveError('Meeting type and date are required.'); return; }
    setSaving(true); setSaveError('');
    try {
      await api.createSession(auth, {
        meetingTypeId: form.meetingTypeId,
        sessionDate:   form.sessionDate,
        startTime:     form.startTime || undefined,
        location:      form.location.trim() || undefined,
        notes:         form.notes.trim() || undefined,
      });
      setShowCreate(false);
      await load();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : 'Save failed.');
    } finally { setSaving(false); }
  };

  const handleStatusChange = async (s: api.MeetingSession, status: api.SessionStatus) => {
    if (status === 'cancelled') {
      const result = await api.cancelSession(auth, s.id, false);
      if ('requiresConfirmation' in result) {
        const confirmed = window.confirm(
          `${result.error}\n\nThe records will be preserved but hidden from reports until the session is restored. Cancel anyway?`
        );
        if (!confirmed) return;
        try { await api.cancelSession(auth, s.id, true); await load(); }
        catch { setError('Could not cancel session.'); }
        return;
      }
      await load();
      return;
    }
    try { await api.updateSession(auth, s.id, { status }); await load(); }
    catch { setError('Could not update session.'); }
  };

  const handleRestore = async (s: api.MeetingSession) => {
    try { await api.restoreSession(auth, s.id); await load(); }
    catch { setError('Could not restore session.'); }
  };

  const inp  = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';
  const sInp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';

  const statusBadge: Record<api.SessionStatus, string> = {
    scheduled:  'bg-blue-50  text-blue-700',
    completed:  'bg-green-50 text-green-700',
    cancelled:  'bg-red-50   text-red-600',
  };

  const totalAttendees = (s: api.MeetingSession) =>
    (s.presentCount ?? 0) + (s.visitorCount ?? 0) + (s.apologyCount ?? 0) + (s.absentCount ?? 0);

  const visibleSessions = sessions.filter(isPastoralSessionVisible);

  return (
    <div className="p-5 max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold text-gray-900">Meeting Sessions</h2>
          <p className="text-[12px] text-gray-500 mt-0.5">Dated instances of meeting types</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {types.length > 0 && (
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-[12px] bg-white focus:outline-none focus:border-teal-500">
              <option value="">All types</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <button onClick={() => { setShowCreate(true); setSaveError(''); }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 transition-colors">
            <Plus size={13} /> New Session
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 space-y-4">
          <h3 className="text-[14px] font-semibold text-gray-800">New Session</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Meeting Type *</label>
              <select value={form.meetingTypeId} onChange={e => setForm(f => ({ ...f, meetingTypeId: e.target.value }))} className={sInp}>
                <option value="">— Select —</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Date *</label>
              <input type="date" value={form.sessionDate} onChange={e => setForm(f => ({ ...f, sessionDate: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Start Time</label>
              <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className={inp} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Location</label>
              <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                placeholder="e.g. Main Auditorium" className={inp} />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={2} placeholder="Optional notes" className={`${inp} resize-none`} />
          </div>
          {saveError && <p className="flex items-center gap-1.5 text-[12px] text-red-600"><AlertCircle size={12} />{saveError}</p>}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
            <button onClick={handleCreate} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 disabled:opacity-40 transition-colors">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Create Session
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : error ? (
        <p className="flex items-center gap-2 text-[13px] text-red-600 py-8"><AlertCircle size={14} />{error}</p>
      ) : visibleSessions.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <CalendarDays size={28} className="mx-auto mb-3 opacity-30" />
          <p className="text-[14px]">No sessions yet.</p>
          <p className="text-[12px] mt-1">Create a session to start recording attendance.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visibleSessions.map(s => (
            <div key={s.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Left: date block */}
                <div className="text-center bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 w-14 shrink-0">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase">
                    {new Date(s.sessionDate + 'T12:00:00').toLocaleString('en', { month: 'short' })}
                  </p>
                  <p className="text-[20px] font-bold text-gray-800 leading-none">
                    {new Date(s.sessionDate + 'T12:00:00').getDate()}
                  </p>
                  <p className="text-[9px] text-gray-400">
                    {new Date(s.sessionDate + 'T12:00:00').toLocaleString('en', { weekday: 'short' })}
                  </p>
                </div>

                {/* Centre: info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[14px] font-medium text-gray-900">{s.meetingTypeName ?? 'Meeting'}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusBadge[s.status]}`}>
                      {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400 flex-wrap">
                    {s.startTime && (
                      <span className="flex items-center gap-1"><Clock size={10} />{s.startTime}</span>
                    )}
                    {s.location && (
                      <span className="flex items-center gap-1"><MapPin size={10} />{s.location}</span>
                    )}
                    {totalAttendees(s) > 0 && (
                      <span className="flex items-center gap-1">
                        <Users size={10} />
                        {s.presentCount ?? 0}P
                        {(s.visitorCount ?? 0) > 0 ? ` · ${s.visitorCount}V` : ''}
                        {(s.apologyCount ?? 0) > 0 ? ` · ${s.apologyCount}A` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {s.status === 'scheduled' && (
                    <>
                      <button onClick={() => handleStatusChange(s, 'completed')} title="Mark completed"
                        className="p-1.5 rounded-lg hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors">
                        <CheckCircle size={15} />
                      </button>
                      <button onClick={() => handleStatusChange(s, 'cancelled')} title="Cancel session"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                        <XCircle size={15} />
                      </button>
                    </>
                  )}
                  {s.status === 'completed' && (
                    <button onClick={() => handleStatusChange(s, 'cancelled')} title="Cancel session"
                      className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <XCircle size={15} />
                    </button>
                  )}
                  {s.status === 'cancelled' && (
                    <button
                      onClick={() => onOpenRegister(s)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-[12px] font-medium hover:bg-amber-100 transition-colors">
                      <RotateCcw size={11} /> View / Restore
                    </button>
                  )}
                  {s.status !== 'cancelled' && (
                    <button
                      onClick={() => onOpenRegister(s)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-[12px] font-medium hover:bg-teal-100 transition-colors">
                      Register <ChevronRight size={12} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
