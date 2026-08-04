/**
 * PersonPage.tsx — Basic person profile (Checkpoint 1).
 *
 * Shows: basic details, linked Emmaus account, attendance expectations,
 * attendance history. Full discipleship profile comes in Checkpoint 2.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, CalendarDays, UserCheck, Plus, Trash2,
  Loader2, AlertCircle, CheckCircle2, X,
  BookOpen, Users, Heart, Mic, MapPin,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  person: api.UnifiedPerson;
  onBack: () => void;
}

const STATUS_PILL: Record<api.AttendanceStatus, string> = {
  present:      'bg-green-100 text-green-700',
  visitor:      'bg-blue-100 text-blue-700',
  apology:      'bg-yellow-100 text-yellow-700',
  absent:       'bg-red-100 text-red-600',
  not_expected: 'bg-gray-100 text-gray-500',
};
const STATUS_LABEL: Record<api.AttendanceStatus, string> = {
  present: 'Present', visitor: 'Visitor', apology: 'Apology',
  absent: 'Absent', not_expected: 'Not Expected',
};

export default function PersonPage({ person, onBack }: Props) {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

  const pKey  = api.personKey(person.id, person.personType);

  const [history, setHistory]         = useState<api.AttendanceHistoryItem[]>([]);
  const [expectations, setExpectations] = useState<api.AttendanceExpectation[]>([]);
  const [meetingTypes, setMeetingTypes] = useState<api.MeetingType[]>([]);
  const [visits, setVisits]           = useState<api.VisitHistoryItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [discipleship, setDiscipleship] = useState<api.DiscipleshipSummary | null>(null);
  const [discipleshipLoading, setDiscipleshipLoading] = useState(false);

  // Link modal
  const [showLink, setShowLink]   = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [allPeople, setAllPeople] = useState<api.UnifiedPerson[]>([]);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError]   = useState('');
  const [linked, setLinked]         = useState(person.isLinked);
  const [linkedId, setLinkedId]     = useState(person.linkedUserId);
  const [saveMsg, setSaveMsg]       = useState('');

  // Add expectation
  const [showAddExp, setShowAddExp]     = useState(false);
  const [newMtId, setNewMtId]           = useState('');
  const [newExp, setNewExp]             = useState<api.Expectation>('expected');
  const [newExpNotes, setNewExpNotes]   = useState('');
  const [addExpSaving, setAddExpSaving] = useState(false);

  const loadDiscipleship = useCallback(async () => {
    setDiscipleshipLoading(true);
    try {
      const summary = await api.getDiscipleshipSummary(auth, person.id, person.personType);
      setDiscipleship(summary);
    } catch { /* non-critical — silently omit */ }
    finally { setDiscipleshipLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [hist, exps, types, allP, vis] = await Promise.all([
        api.getAttendanceHistory(auth, person.id, person.personType, 30),
        api.getExpectations(auth, person.id, person.personType),
        api.listMeetingTypes(auth),
        api.listPeople(auth),
        api.getVisitHistory(auth, person.id),
      ]);
      setHistory(hist);
      setExpectations(exps);
      setMeetingTypes(types);
      setAllPeople(allP);
      setVisits(vis);
      if (types.length > 0 && !newMtId) setNewMtId(types[0].id);
    } catch { setError('Could not load person details.'); }
    finally { setLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  useEffect(() => { load(); }, [load]);

  // Fetch/re-fetch discipleship summary whenever eligibility changes (incl. after linking)
  useEffect(() => {
    if (person.personType === 'emmaus_user' || linked) {
      loadDiscipleship();
    }
  }, [linked, loadDiscipleship, person.personType]);

  const flash = (msg: string) => {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(''), 2500);
  };

  const handleLink = async (emmausId: string) => {
    if (!person.id || person.personType !== 'pastoral_person') return;
    setLinkSaving(true); setLinkError('');
    try {
      await api.linkPersonToUser(auth, person.id, emmausId);
      setLinked(true); setLinkedId(emmausId);
      setShowLink(false);
      flash('Linked to Emmaus account');
    } catch (err: unknown) {
      setLinkError(err instanceof Error ? err.message : 'Link failed.');
    } finally { setLinkSaving(false); }
  };

  const handleAddExpectation = async () => {
    if (!newMtId) return;
    setAddExpSaving(true);
    try {
      await api.setExpectation(auth, person.id, person.personType, newMtId, newExp, newExpNotes);
      setShowAddExp(false); setNewExpNotes('');
      await load();
      flash('Expectation saved');
    } catch { flash('Save failed'); }
    finally { setAddExpSaving(false); }
  };

  const handleRemoveExpectation = async (meetingTypeId: string) => {
    try {
      await api.removeExpectation(auth, person.id, person.personType, meetingTypeId);
      setExpectations(prev => prev.filter(e => e.meetingTypeId !== meetingTypeId));
      flash('Expectation removed');
    } catch { flash('Remove failed'); }
  };

  const emmausMatches = linkQuery.length > 1
    ? allPeople.filter(p =>
        p.personType === 'emmaus_user' &&
        (p.fullName.toLowerCase().includes(linkQuery.toLowerCase()) ||
         (p.email?.toLowerCase().includes(linkQuery.toLowerCase()) ?? false))
      ).slice(0, 6)
    : [];

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';

  const subTypeBadge: Record<string, string> = {
    emmaus_user:     'bg-teal-50 text-teal-700',
    attendance_only: 'bg-gray-100 text-gray-600',
    visitor:         'bg-blue-50 text-blue-700',
  };
  const subTypeLabel: Record<string, string> = {
    emmaus_user:     'Emmaus User',
    attendance_only: 'Regular Attender',
    visitor:         'Visitor',
  };

  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-gray-900 truncate">{person.fullName}</h2>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${subTypeBadge[person.subType]}`}>
              {subTypeLabel[person.subType]}
            </span>
          </div>
          {person.email && <p className="text-[11px] text-gray-400 truncate mt-0.5">{person.email}</p>}
        </div>
        {saveMsg && (
          <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium shrink-0">
            <CheckCircle2 size={11} /> {saveMsg}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 max-w-2xl">

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={18} className="animate-spin text-gray-400" />
          </div>
        ) : error ? (
          <p className="flex items-center gap-2 text-[13px] text-red-600">
            <AlertCircle size={14} /> {error}
          </p>
        ) : (
          <>
            {/* ── Profile Summary ────────────────────────────────────────── */}
            <section className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
              <div className="px-4 py-3">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">Profile</h3>
                <div className="space-y-1.5 text-[13px]">
                  {person.email && (
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Email</span>
                      <span className="text-gray-900 font-medium truncate">{person.email}</span>
                    </div>
                  )}
                  {person.phone && (
                    <div className="flex justify-between gap-2">
                      <span className="text-gray-500">Phone</span>
                      <span className="text-gray-900 font-medium">{person.phone}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-gray-500">Type</span>
                    <span className="text-gray-900 font-medium">{subTypeLabel[person.subType]}</span>
                  </div>
                </div>
              </div>

              {/* Emmaus account link */}
              {person.personType === 'pastoral_person' && (
                <div className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-medium text-gray-700">Emmaus Account</p>
                      {linked ? (
                        <p className="text-[11px] text-teal-600 mt-0.5 flex items-center gap-1">
                          <UserCheck size={11} /> Linked to {linkedId}
                        </p>
                      ) : (
                        <p className="text-[11px] text-gray-400 mt-0.5">Not yet linked</p>
                      )}
                    </div>
                    {!linked && (
                      <button onClick={() => { setShowLink(true); setLinkError(''); setLinkQuery(''); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-[12px] font-medium hover:bg-teal-100 transition-colors">
                        <UserCheck size={12} /> Link Account
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ── Attendance Expectations ────────────────────────────────── */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Attendance Expectations</h3>
                <button onClick={() => setShowAddExp(v => !v)}
                  className="flex items-center gap-1 text-[12px] text-teal-600 hover:text-teal-800 transition-colors">
                  <Plus size={12} /> Add
                </button>
              </div>

              {showAddExp && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Meeting Type</label>
                      <select value={newMtId} onChange={e => setNewMtId(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-teal-500">
                        {meetingTypes.map(mt => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Expectation</label>
                      <select value={newExp} onChange={e => setNewExp(e.target.value as api.Expectation)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-teal-500">
                        <option value="expected">Normally attends</option>
                        <option value="not_expected">Not expected</option>
                      </select>
                    </div>
                  </div>
                  <input value={newExpNotes} onChange={e => setNewExpNotes(e.target.value)}
                    placeholder="Optional note (e.g. Youth participant)" className={inp} />
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setShowAddExp(false)} className="px-3 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-100">Cancel</button>
                    <button onClick={handleAddExpectation} disabled={addExpSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-[12px] font-medium hover:bg-teal-700 disabled:opacity-40">
                      {addExpSaving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                      Save
                    </button>
                  </div>
                </div>
              )}

              {expectations.length === 0 ? (
                <p className="text-[12px] text-gray-400 py-2">No expectations set. This data will power care signals in Checkpoint 4.</p>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {expectations.map(e => (
                    <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-900">{e.meetingTypeName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${e.expectation === 'expected' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {e.expectation === 'expected' ? 'Normally attends' : 'Not expected'}
                          </span>
                          {e.notes && <span className="text-[11px] text-gray-400">{e.notes}</span>}
                        </div>
                      </div>
                      <button onClick={() => handleRemoveExpectation(e.meetingTypeId)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Attendance History ─────────────────────────────────────── */}
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Attendance History</h3>
              {history.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CalendarDays size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-[12px]">No attendance recorded yet.</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {history.map((h, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div className="text-center bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 w-12 shrink-0">
                        <p className="text-[9px] font-semibold text-gray-400 uppercase">
                          {new Date(h.sessionDate + 'T12:00:00').toLocaleString('en', { month: 'short' })}
                        </p>
                        <p className="text-[16px] font-bold text-gray-800 leading-none">
                          {new Date(h.sessionDate + 'T12:00:00').getDate()}
                        </p>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-900">{h.meetingTypeName}</p>
                        <p className="text-[11px] text-gray-400">
                          {new Date(h.sessionDate + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_PILL[h.status]}`}>
                        {STATUS_LABEL[h.status]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Visits ────────────────────────────────────────────────── */}
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Visits Scheduled</h3>
              {visits.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <MapPin size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-[12px]">No visits have been scheduled yet.</p>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
                  {visits.map((v) => {
                    const d = v.visitDate ? new Date(v.visitDate + 'T12:00:00') : null;
                    const isPast = d ? d < new Date() : false;
                    return (
                      <div key={v.id} className="flex items-start gap-3 px-4 py-3">
                        {d ? (
                          <div className={`text-center border rounded-lg px-2.5 py-1.5 w-12 shrink-0 ${isPast ? 'bg-gray-50 border-gray-100' : 'bg-teal-50 border-teal-100'}`}>
                            <p className={`text-[9px] font-semibold uppercase ${isPast ? 'text-gray-400' : 'text-teal-500'}`}>
                              {d.toLocaleString('en', { month: 'short' })}
                            </p>
                            <p className={`text-[16px] font-bold leading-none ${isPast ? 'text-gray-700' : 'text-teal-700'}`}>
                              {d.getDate()}
                            </p>
                            <p className={`text-[9px] ${isPast ? 'text-gray-400' : 'text-teal-400'}`}>
                              {d.getFullYear()}
                            </p>
                          </div>
                        ) : (
                          <div className="w-12 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-900">
                            {v.reason || 'Pastoral visit'}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            Scheduled by {v.scheduledBy}
                            {' · '}
                            {new Date(v.scheduledAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                        <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${isPast ? 'bg-gray-100 text-gray-500' : 'bg-teal-50 text-teal-700'}`}>
                          {isPast ? 'Past' : 'Upcoming'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Discipleship ──────────────────────────────────────────── */}
            {(person.personType === 'emmaus_user' || linked) && (
              <section className="space-y-2">
                <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Discipleship</h3>

                {discipleshipLoading ? (
                  <div className="flex items-center gap-2 py-4 text-[12px] text-gray-400">
                    <Loader2 size={13} className="animate-spin" /> Loading activity…
                  </div>
                ) : !discipleship ? (
                  <p className="text-[12px] text-gray-400 py-2">Could not load discipleship data.</p>
                ) : !discipleship.available ? (
                  <p className="text-[12px] text-gray-400 py-2">No linked Emmaus account — no discipleship data available.</p>
                ) : (
                  <div className="space-y-3">

                    {/* Walks */}
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                        <BookOpen size={12} className="text-teal-600" />
                        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Walks</span>
                        <span className="ml-auto text-[11px] text-gray-400">{discipleship.journeys.length} active</span>
                      </div>
                      {discipleship.journeys.length === 0 ? (
                        <p className="px-4 py-3 text-[12px] text-gray-400">No walks in progress.</p>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {discipleship.journeys.map(j => {
                            const pct = j.totalDays > 0 ? Math.round((j.completedDays / j.totalDays) * 100) : 0;
                            const isComplete = j.status === 'completed';
                            return (
                              <div key={j.journeyId} className="px-4 py-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-gray-900 truncate">{j.title}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                      {isComplete
                                        ? 'Completed'
                                        : `Day ${j.currentDay}${j.totalDays > 0 ? ` of ${j.totalDays}` : ''}`}
                                      {j.updatedAt && (
                                        <> · Last active {new Date(j.updatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</>
                                      )}
                                    </p>
                                  </div>
                                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                    isComplete ? 'bg-green-50 text-green-700' :
                                    j.status === 'active' ? 'bg-teal-50 text-teal-700' : 'bg-gray-100 text-gray-500'
                                  }`}>
                                    {isComplete ? 'Done' : j.status}
                                  </span>
                                </div>
                                {j.totalDays > 0 && (
                                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${isComplete ? 'bg-green-400' : 'bg-teal-400'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Rooms */}
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                        <Users size={12} className="text-purple-600" />
                        <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Rooms</span>
                        <span className="ml-auto text-[11px] text-gray-400">{discipleship.rooms.length} room{discipleship.rooms.length !== 1 ? 's' : ''}</span>
                      </div>
                      {discipleship.rooms.length === 0 ? (
                        <p className="px-4 py-3 text-[12px] text-gray-400">Not a member of any room.</p>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {discipleship.rooms.map(r => (
                            <div key={r.roomId} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-gray-900 truncate">{r.roomName}</p>
                                {r.joinedAt && (
                                  <p className="text-[11px] text-gray-400 mt-0.5">
                                    Joined {new Date(r.joinedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </p>
                                )}
                              </div>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${r.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-500'}`}>
                                {r.role === 'admin' ? 'Leader' : 'Member'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Devotionals */}
                    {discipleship.devotionals.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                          <Heart size={12} className="text-rose-500" />
                          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Devotionals</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {discipleship.devotionals.map(d => (
                            <div key={d.seriesId} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-gray-900 truncate">{d.title}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {d.completedCount} day{d.completedCount !== 1 ? 's' : ''} completed
                                  {d.updatedAt && (
                                    <> · {new Date(d.updatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</>
                                  )}
                                </p>
                              </div>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                d.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-rose-50 text-rose-700'
                              }`}>
                                {d.status === 'completed' ? 'Done' : 'Active'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Sermon Companions */}
                    {discipleship.sermonCompanions.length > 0 && (
                      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50">
                          <Mic size={12} className="text-amber-600" />
                          <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Sermon Companions</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {discipleship.sermonCompanions.map(sc => {
                            const pct = sc.totalDays > 0 ? Math.round((sc.completedCount / sc.totalDays) * 100) : 0;
                            return (
                              <div key={sc.companionId} className="px-4 py-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-gray-900 truncate">{sc.title}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                      {sc.completedCount}{sc.totalDays > 0 ? ` of ${sc.totalDays}` : ''} days
                                      {sc.updatedAt && (
                                        <> · {new Date(sc.updatedAt).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })}</>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                {sc.totalDays > 0 && (
                                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div className="h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Link modal */}
      {showLink && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-gray-900">Link to Emmaus Account</h3>
              <button onClick={() => setShowLink(false)} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <input value={linkQuery} onChange={e => setLinkQuery(e.target.value)}
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
                    {linkSaving && <Loader2 size={12} className="animate-spin text-teal-500" />}
                  </button>
                ))}
              </div>
            )}
            {linkQuery.length > 1 && emmausMatches.length === 0 && (
              <p className="text-[12px] text-gray-400 text-center">No Emmaus users found.</p>
            )}
            {linkError && <p className="flex items-center gap-1.5 text-[12px] text-red-600"><AlertCircle size={12} />{linkError}</p>}
            <div className="flex justify-end">
              <button onClick={() => setShowLink(false)} className="px-4 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
