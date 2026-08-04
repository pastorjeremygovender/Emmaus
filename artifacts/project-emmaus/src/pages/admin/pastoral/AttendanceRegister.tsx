/**
 * AttendanceRegister.tsx — Fast manual attendance register for a single session.
 *
 * Design principles (per spec):
 * - Never defaults every person to Absent.
 * - A person with no record stays "unrecorded" until intentionally marked.
 * - Saves continuously; shows clear confirmation.
 * - Prevents duplicate records (upsert on server).
 * - Supports bulk-mark on selection.
 * - Corrections preserve audit history (handled server-side).
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowLeft, Search, Plus, Users, CheckCircle2, Loader2,
  AlertCircle, X, UserCheck, Clock, MapPin, RotateCcw,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  session: api.MeetingSession;
  onBack: () => void;
}

interface PersonRow {
  personId: string;
  personType: api.PersonType;
  name: string;
  email: string | null;
  subType: string;
  status: api.AttendanceStatus | null;  // null = unrecorded
  saving: boolean;
}

const STATUSES: api.AttendanceStatus[] = ['present', 'visitor', 'apology', 'absent', 'not_expected'];

const STATUS_LABELS: Record<api.AttendanceStatus, string> = {
  present: 'Present', visitor: 'Visitor', apology: 'Apology',
  absent: 'Absent', not_expected: 'Not Expected',
};

const STATUS_STYLE: Record<api.AttendanceStatus, string> = {
  present:      'bg-green-100 text-green-800 border-green-200',
  visitor:      'bg-blue-100 text-blue-700 border-blue-200',
  apology:      'bg-yellow-100 text-yellow-800 border-yellow-200',
  absent:       'bg-red-100 text-red-700 border-red-200',
  not_expected: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function AttendanceRegister({ session, onBack }: Props) {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

  const [rows, setRows]               = useState<PersonRow[]>([]);
  const [allPeople, setAllPeople]     = useState<api.UnifiedPerson[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [search, setSearch]           = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving]   = useState(false);
  const [saveConfirm, setSaveConfirm] = useState('');
  const saveConfirmTimer              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [restoring, setRestoring]     = useState(false);
  const [sessionStatus, setSessionStatus] = useState<api.SessionStatus>(session.status);

  // Add visitor / new person modal
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newName, setNewName]             = useState('');
  const [newEmail, setNewEmail]           = useState('');
  const [newPhone, setNewPhone]           = useState('');
  const [newType, setNewType]             = useState<'attendance_only' | 'visitor'>('visitor');
  const [addingSaving, setAddingSaving]   = useState(false);
  const [addError, setAddError]           = useState('');

  // Link person modal
  const [linkPersonId, setLinkPersonId]     = useState<string | null>(null);
  const [linkQuery, setLinkQuery]           = useState('');
  const [linkSaving, setLinkSaving]         = useState(false);
  const [linkError, setLinkError]           = useState('');

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await api.restoreSession(auth, session.id);
      setSessionStatus('completed');
      flash('Session restored');
    } catch {
      flash('Could not restore session — please try again');
    } finally {
      setRestoring(false);
    }
  };

  const flash = (msg: string) => {
    setSaveConfirm(msg);
    if (saveConfirmTimer.current != null) clearTimeout(saveConfirmTimer.current);
    saveConfirmTimer.current = setTimeout(() => setSaveConfirm(''), 2500);
  };

  const rowKey = (r: PersonRow) => `${r.personType}:${r.personId}`;

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [people, register] = await Promise.all([
        api.listPeople(auth),
        api.getRegister(auth, session.id),
      ]);
      setAllPeople(people);

      // Build a status map from existing records
      const statusMap = new Map<string, api.AttendanceStatus>();
      for (const rec of register) {
        statusMap.set(`${rec.personType}:${rec.personId}`, rec.status);
      }

      // Build rows: all people in the system + anyone in the register not yet in the list
      const knownKeys = new Set<string>();
      const built: PersonRow[] = people.map(p => {
        const k = `${p.personType}:${p.id}`;
        knownKeys.add(k);
        return {
          personId:   p.id,
          personType: p.personType,
          name:       p.fullName,
          email:      p.email,
          subType:    p.subType,
          status:     statusMap.get(k) ?? null,
          saving:     false,
        };
      });

      // Add register entries for anyone not in the people list (edge case: deactivated person)
      for (const rec of register) {
        const k = `${rec.personType}:${rec.personId}`;
        if (!knownKeys.has(k)) {
          built.push({
            personId:   rec.personId,
            personType: rec.personType,
            name:       rec.personName ?? rec.personId,
            email:      rec.personEmail ?? null,
            subType:    rec.personType === 'emmaus_user' ? 'emmaus_user' : 'attendance_only',
            status:     rec.status,
            saving:     false,
          });
        }
      }

      setRows(built);
    } catch { setError('Could not load attendance register.'); }
    finally { setLoading(false); }
  }, [session.id, auth.userId]);

  useEffect(() => { load(); }, [load]);

  const markOne = async (row: PersonRow, status: api.AttendanceStatus) => {
    // Optimistic update
    setRows(prev => prev.map(r =>
      rowKey(r) === rowKey(row) ? { ...r, status, saving: true } : r
    ));
    try {
      await api.recordAttendance(auth, session.id, row.personId, row.personType, status);
      setRows(prev => prev.map(r =>
        rowKey(r) === rowKey(row) ? { ...r, saving: false } : r
      ));
      flash('Attendance saved');
    } catch {
      // Revert
      setRows(prev => prev.map(r =>
        rowKey(r) === rowKey(row) ? { ...r, saving: false } : r
      ));
      flash('Save failed — please try again');
    }
  };

  const toggleSelect = (key: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const bulkMark = async (status: api.AttendanceStatus) => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    const targets = rows.filter(r => selectedIds.has(rowKey(r)));
    // Optimistic
    setRows(prev => prev.map(r => selectedIds.has(rowKey(r)) ? { ...r, status, saving: true } : r));
    try {
      await Promise.all(
        targets.map(r => api.recordAttendance(auth, session.id, r.personId, r.personType, status))
      );
      setRows(prev => prev.map(r => selectedIds.has(rowKey(r)) ? { ...r, saving: false } : r));
      setSelectedIds(new Set());
      flash(`${targets.length} record${targets.length > 1 ? 's' : ''} saved`);
    } catch {
      setRows(prev => prev.map(r => selectedIds.has(rowKey(r)) ? { ...r, saving: false } : r));
      flash('Bulk save failed — please try again');
    } finally { setBulkSaving(false); }
  };

  const handleAddPerson = async () => {
    if (!newName.trim()) { setAddError('Name is required.'); return; }
    setAddingSaving(true); setAddError('');
    try {
      const person = await api.createPastoralPerson(auth, {
        fullName: newName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        personType: newType,
      });
      setShowAddPerson(false); setNewName(''); setNewEmail(''); setNewPhone('');
      // Immediately mark as present in the register
      await api.recordAttendance(auth, session.id, person.id, 'pastoral_person', 'visitor');
      flash('Visitor added and marked as Visitor');
      await load();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to add person.');
    } finally { setAddingSaving(false); }
  };

  const handleLink = async (emmausEmail: string) => {
    if (!linkPersonId) return;
    setLinkSaving(true); setLinkError('');
    try {
      await api.linkPersonToUser(auth, linkPersonId, emmausEmail);
      setLinkPersonId(null); setLinkQuery('');
      flash('Person linked to Emmaus account');
      await load();
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : 'Link failed.');
    } finally { setLinkSaving(false); }
  };

  // Filtered + sorted display list
  const q = search.toLowerCase().trim();
  const filtered = rows.filter(r =>
    !q ||
    r.name.toLowerCase().includes(q) ||
    (r.email?.toLowerCase().includes(q) ?? false)
  );

  // Sort: recorded first, then alphabetical
  const sorted = [...filtered].sort((a, b) => {
    if ((a.status !== null) !== (b.status !== null)) return a.status !== null ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  // Totals
  const totals = rows.reduce((acc, r) => {
    if (r.status) acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<api.AttendanceStatus, number>);
  const recorded = rows.filter(r => r.status !== null).length;

  // Emmaus users for link search
  const emmausMatches = linkQuery.length > 1
    ? allPeople.filter(p =>
        p.personType === 'emmaus_user' &&
        (p.fullName.toLowerCase().includes(linkQuery.toLowerCase()) ||
         (p.email?.toLowerCase().includes(linkQuery.toLowerCase()) ?? false))
      ).slice(0, 8)
    : [];

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';
  const sInp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 space-y-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-[15px] font-semibold text-gray-900 truncate">
              {session.meetingTypeName ?? 'Meeting'} — Register
            </h2>
            <div className="flex items-center gap-3 text-[11px] text-gray-400 mt-0.5 flex-wrap">
              <span>{new Date(session.sessionDate + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
              {session.startTime && <span className="flex items-center gap-1"><Clock size={9} />{session.startTime}</span>}
              {session.location  && <span className="flex items-center gap-1"><MapPin size={9} />{session.location}</span>}
            </div>
          </div>
          <button
            onClick={() => { setShowAddPerson(true); setAddError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-[12px] font-medium hover:bg-teal-100 transition-colors shrink-0">
            <Plus size={12} /> Add Visitor
          </button>
        </div>

        {/* Totals strip */}
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-gray-500">{recorded} recorded of {rows.length}</span>
          {(['present','visitor','apology','absent'] as api.AttendanceStatus[]).map(s =>
            (totals[s] ?? 0) > 0 ? (
              <span key={s} className={`px-2 py-0.5 rounded-full border font-medium ${STATUS_STYLE[s]}`}>
                {totals[s]} {STATUS_LABELS[s]}
              </span>
            ) : null
          )}
          {saveConfirm && (
            <span className="ml-auto flex items-center gap-1 text-green-600 font-medium">
              <CheckCircle2 size={11} /> {saveConfirm}
            </span>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search people…"
            className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Bulk actions — visible when rows are selected */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 flex-wrap py-1">
            <span className="text-[12px] text-gray-500 font-medium">{selectedIds.size} selected:</span>
            {(['present','visitor','apology','absent','not_expected'] as api.AttendanceStatus[]).map(s => (
              <button key={s} onClick={() => bulkMark(s)} disabled={bulkSaving}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors disabled:opacity-40 ${STATUS_STYLE[s]}`}>
                {STATUS_LABELS[s]}
              </button>
            ))}
            <button onClick={() => setSelectedIds(new Set())}
              className="ml-auto px-2 py-1 rounded-lg text-[11px] text-gray-500 hover:bg-gray-100 transition-colors">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* ── Cancelled banner ───────────────────────────────────────────────── */}
      {sessionStatus === 'cancelled' && (
        <div className="shrink-0 mx-4 mt-3 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-red-700">This session has been cancelled</p>
            <p className="text-[12px] text-red-500 mt-0.5">
              Attendance records are preserved but hidden from reports. Restore the session to make them active again.
            </p>
          </div>
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-[12px] font-medium hover:bg-amber-100 disabled:opacity-40 transition-colors shrink-0">
            {restoring ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
            Restore
          </button>
        </div>
      )}

      {/* ── List ───────────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
        ) : error ? (
          <p className="flex items-center gap-2 text-[13px] text-red-600 p-6"><AlertCircle size={14} />{error}</p>
        ) : sorted.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Users size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-[14px]">{search ? 'No matches found.' : 'No people to show.'}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {sorted.map(row => {
              const key = rowKey(row);
              const selected = selectedIds.has(key);
              return (
                <div
                  key={key}
                  className={`flex items-center gap-3 px-4 py-3 transition-colors ${selected ? 'bg-teal-50' : 'hover:bg-gray-50/50'}`}>

                  {/* Checkbox */}
                  <input type="checkbox" checked={selected} onChange={() => toggleSelect(key)}
                    className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 shrink-0" />

                  {/* Person info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[13px] font-medium text-gray-900">{row.name}</span>
                      {row.subType === 'visitor' && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-50 text-[9px] font-semibold text-blue-600 uppercase tracking-wide">Visitor</span>
                      )}
                      {row.personType === 'pastoral_person' && !row.email && (
                        <button
                          onClick={() => { setLinkPersonId(row.personId); setLinkQuery(''); setLinkError(''); }}
                          className="flex items-center gap-0.5 text-[10px] text-teal-600 hover:underline">
                          <UserCheck size={9} /> Link account
                        </button>
                      )}
                    </div>
                    {row.email && <p className="text-[11px] text-gray-400 truncate">{row.email}</p>}
                  </div>

                  {/* Status buttons */}
                  <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                    {row.saving ? (
                      <Loader2 size={14} className="animate-spin text-teal-500 mx-2" />
                    ) : (
                      STATUSES.map(s => (
                        <button
                          key={s}
                          onClick={() => markOne(row, s)}
                          title={STATUS_LABELS[s]}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all ${
                            row.status === s
                              ? STATUS_STYLE[s] + ' ring-1 ring-current'
                              : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
                          }`}>
                          {/* Abbreviate on mobile */}
                          <span className="hidden sm:inline">{STATUS_LABELS[s]}</span>
                          <span className="sm:hidden">{s === 'not_expected' ? 'N/E' : STATUS_LABELS[s].slice(0, 3)}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Add visitor modal ──────────────────────────────────────────────── */}
      {showAddPerson && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-gray-900">Add Person</h3>
              <button onClick={() => setShowAddPerson(false)} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Full Name *</label>
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="First and last name" className={inp} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Email</label>
                <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="Optional" className={inp} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Phone</label>
                <input value={newPhone} onChange={e => setNewPhone(e.target.value)} placeholder="Optional" className={inp} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Type</label>
                <select value={newType} onChange={e => setNewType(e.target.value as typeof newType)} className={sInp}>
                  <option value="visitor">Visitor (first time)</option>
                  <option value="attendance_only">Regular attender (no Emmaus account)</option>
                </select>
              </div>
            </div>
            {addError && <p className="flex items-center gap-1.5 text-[12px] text-red-600"><AlertCircle size={12} />{addError}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setShowAddPerson(false)} className="px-4 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
              <button onClick={handleAddPerson} disabled={addingSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 disabled:opacity-40 transition-colors">
                {addingSaving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                Add & Mark Visitor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Link account modal ─────────────────────────────────────────────── */}
      {linkPersonId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-gray-900">Link to Emmaus Account</h3>
              <button onClick={() => setLinkPersonId(null)} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <p className="text-[13px] text-gray-500">Search for an existing Emmaus user to link this person's record.</p>
            <input
              value={linkQuery} onChange={e => setLinkQuery(e.target.value)}
              placeholder="Search by name or email…"
              className={inp} />
            {emmausMatches.length > 0 && (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {emmausMatches.map(p => (
                  <button key={p.id} onClick={() => handleLink(p.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-teal-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-gray-900 truncate">{p.fullName}</p>
                      {p.email && <p className="text-[11px] text-gray-400 truncate">{p.email}</p>}
                    </div>
                    {linkSaving ? <Loader2 size={12} className="animate-spin text-teal-500" /> : null}
                  </button>
                ))}
              </div>
            )}
            {linkQuery.length > 1 && emmausMatches.length === 0 && (
              <p className="text-[12px] text-gray-400 text-center">No matches found.</p>
            )}
            {linkError && <p className="flex items-center gap-1.5 text-[12px] text-red-600"><AlertCircle size={12} />{linkError}</p>}
            <div className="flex justify-end">
              <button onClick={() => setLinkPersonId(null)} className="px-4 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
