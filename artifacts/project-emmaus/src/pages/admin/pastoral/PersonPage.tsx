/**
 * PersonPage.tsx — Discipleship Profile (Checkpoint 3).
 *
 * Thin orchestrator: loads all data in parallel, renders
 * independent section components, handles all action callbacks.
 *
 * Section order (shepherding priority):
 *   1. Hero Summary
 *   2. Discipleship Timeline
 *   3. Spiritual Rhythm
 *   4. Attendance Rhythm
 *   5. Life Milestones
 *   6. Current Discipleship
 *   7. Pastoral Care  (inline — care alerts + visits)
 *   8. Attendance History
 *   9. Administrative Details
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, Bell, Calendar, X, AlertCircle, Loader2,
  MapPin, Clock, Activity, Star, BookOpen, CalendarDays,
  Shield, CheckCircle2,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

import HeroSummaryCard     from './profile/HeroSummaryCard';
import JourneyTimeline     from './profile/JourneyTimeline';
import SpiritualRhythm     from './profile/SpiritualRhythm';
import AttendanceRhythm    from './profile/AttendanceRhythm';
import LifeMilestones      from './profile/LifeMilestones';
import CurrentDiscipleship from './profile/CurrentDiscipleship';
import AttendanceHistory   from './profile/AttendanceHistory';
import AdminDetails        from './profile/AdminDetails';

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  person: api.UnifiedPerson;
  onBack: () => void;
}

// ── Section shell ─────────────────────────────────────────────────────────────

function Section({ title, icon: Icon, iconColor, children }: {
  title: string; icon: React.ElementType; iconColor?: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Icon size={11} className={iconColor ?? 'text-gray-400'} />
        <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide flex-shrink-0">{title}</h3>
        <div className="flex-1 h-px bg-gray-100 ml-1" />
      </div>
      {children}
    </section>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: string, opts?: Intl.DateTimeFormatOptions) {
  const date = new Date(d.includes('T') ? d : d + 'T12:00:00');
  return date.toLocaleDateString('en-ZA', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PersonPage({ person, onBack }: Props) {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

  // ── Data state ─────────────────────────────────────────────────────────────
  const [history,      setHistory]      = useState<api.AttendanceHistoryItem[]>([]);
  const [expectations, setExpectations] = useState<api.AttendanceExpectation[]>([]);
  const [meetingTypes, setMeetingTypes] = useState<api.MeetingType[]>([]);
  const [allPeople,    setAllPeople]    = useState<api.UnifiedPerson[]>([]);
  const [visits,       setVisits]       = useState<api.VisitHistoryItem[]>([]);
  const [careSignals,  setCareSignals]  = useState<api.CareSignal[]>([]);
  const [snapshot,     setSnapshot]     = useState<api.PersonProfileSummary | null>(null);
  const [discipleship, setDiscipleship] = useState<api.DiscipleshipSummary | null>(null);
  const [timeline,     setTimeline]     = useState<api.TimelineEvent[]>([]);
  const [rhythm,       setRhythm]       = useState<api.RhythmDay[]>([]);
  const [attRhythm,    setAttRhythm]    = useState<api.MonthlyAttendance[]>([]);
  const [milestones,   setMilestones]   = useState<api.MilestoneItem[]>([]);

  // ── Loading state (independent per section) ────────────────────────────────
  const [coreLoading, setCoreLoading] = useState(true);
  const [snapLoading, setSnapLoading] = useState(true);
  const [discLoading, setDiscLoading] = useState(true);
  const [tlLoading,   setTlLoading]   = useState(true);
  const [rLoading,    setRLoading]    = useState(true);
  const [arLoading,   setArLoading]   = useState(true);
  const [milLoading,  setMilLoading]  = useState(true);

  const [saveMsg, setSaveMsg]   = useState('');
  const [isLinked, setLinked]   = useState(person.isLinked);
  const [linkedId, setLinkedId] = useState(person.linkedUserId);

  // ── Pastoral care modal state (inline) ────────────────────────────────────
  const [scheduleSignalId, setScheduleSignalId] = useState<string | null>(null);
  const [scheduleDate,     setScheduleDate]     = useState('');
  const [scheduleReason,   setScheduleReason]   = useState('');
  const [scheduleSaving,   setScheduleSaving]   = useState(false);
  const [scheduleError,    setScheduleError]    = useState('');
  const [dismissingId,     setDismissingId]     = useState<string | null>(null);

  const flash = (msg: string) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2500); };

  // ── Independent load functions ─────────────────────────────────────────────

  const loadCore = useCallback(async () => {
    setCoreLoading(true);
    try {
      const [hist, exps, types, people, vis, sigs] = await Promise.all([
        api.getAttendanceHistory(auth, person.id, person.personType, 30),
        api.getExpectations(auth, person.id, person.personType),
        api.listMeetingTypes(auth),
        api.listPeople(auth),
        api.getVisitHistory(auth, person.id),
        api.listCareSignals(auth, { personId: person.id, includesDismissed: false }),
      ]);
      setHistory(hist); setExpectations(exps); setMeetingTypes(types);
      setAllPeople(people); setVisits(vis); setCareSignals(sigs);
    } catch { /* handled per section */ }
    finally { setCoreLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  const loadSnapshot = useCallback(async () => {
    setSnapLoading(true);
    try { setSnapshot(await api.getProfileSummary(auth, person.id, person.personType)); }
    catch { }
    finally { setSnapLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  const loadDiscipleship = useCallback(async () => {
    setDiscLoading(true);
    try { setDiscipleship(await api.getDiscipleshipSummary(auth, person.id, person.personType)); }
    catch { }
    finally { setDiscLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  const loadTimeline = useCallback(async () => {
    setTlLoading(true);
    try { setTimeline(await api.getJourneyTimeline(auth, person.id, person.personType)); }
    catch { }
    finally { setTlLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  const loadRhythm = useCallback(async () => {
    setRLoading(true);
    try { setRhythm(await api.getSpiritualRhythm(auth, person.id, person.personType)); }
    catch { }
    finally { setRLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  const loadAttRhythm = useCallback(async () => {
    setArLoading(true);
    try { setAttRhythm(await api.getAttendanceRhythm(auth, person.id, person.personType)); }
    catch { }
    finally { setArLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  const loadMilestones = useCallback(async () => {
    setMilLoading(true);
    try { setMilestones(await api.listMilestones(auth, person.id, person.personType)); }
    catch { }
    finally { setMilLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  useEffect(() => {
    loadCore(); loadSnapshot(); loadDiscipleship();
    loadTimeline(); loadRhythm(); loadAttRhythm(); loadMilestones();
  }, [loadCore, loadSnapshot, loadDiscipleship, loadTimeline, loadRhythm, loadAttRhythm, loadMilestones]);

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleDismissSignal = async (signalId: string) => {
    setDismissingId(signalId);
    try {
      await api.dismissCareSignal(auth, signalId);
      setCareSignals(prev => prev.filter(s => s.id !== signalId));
      flash('Alert dismissed');
      loadSnapshot();
    } catch { flash('Dismiss failed'); }
    finally { setDismissingId(null); }
  };

  const handleScheduleVisit = async () => {
    if (!scheduleSignalId || !scheduleDate) return;
    setScheduleSaving(true); setScheduleError('');
    try {
      await api.scheduleVisit(auth, scheduleSignalId, scheduleDate, scheduleReason);
      setScheduleSignalId(null); setScheduleDate(''); setScheduleReason('');
      flash('Visit scheduled');
      await Promise.all([loadCore(), loadSnapshot()]);
    } catch (err: unknown) {
      setScheduleError(err instanceof Error ? err.message : 'Schedule failed.');
    } finally { setScheduleSaving(false); }
  };

  const handleAddExpectation = async (mtId: string, exp: api.Expectation, notes: string) => {
    await api.setExpectation(auth, person.id, person.personType, mtId, exp, notes);
    await loadCore(); flash('Expectation saved');
  };

  const handleRemoveExpectation = async (mtId: string) => {
    await api.removeExpectation(auth, person.id, person.personType, mtId);
    setExpectations(prev => prev.filter(e => e.meetingTypeId !== mtId));
    flash('Expectation removed');
  };

  const handleLink = async (emmausId: string) => {
    await api.linkPersonToUser(auth, person.id, emmausId);
    setLinked(true); setLinkedId(emmausId);
    flash('Account linked');
    await Promise.all([loadSnapshot(), loadDiscipleship(), loadTimeline(), loadRhythm()]);
  };

  const handleAddMilestone = async (
    milestoneType: string, title: string, milestoneDate: string, notes: string,
  ) => {
    await api.createMilestone(auth, person.id, person.personType, {
      milestoneType, title,
      ...(milestoneDate ? { milestoneDate } : {}),
      ...(notes ? { notes } : {}),
    });
    await Promise.all([loadMilestones(), loadTimeline()]);
    flash('Milestone saved');
  };

  const handleDeleteMilestone = async (id: string) => {
    await api.deleteMilestone(auth, person.id, person.personType, id);
    setMilestones(prev => prev.filter(m => m.id !== id));
    await loadTimeline();
    flash('Milestone removed');
  };

  // ── Derived values ─────────────────────────────────────────────────────────
  const upcomingVisits = visits.filter(
    v => v.visitDate && new Date(v.visitDate + 'T12:00:00') >= new Date()
  );

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* Header */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-[15px] font-semibold text-gray-900 truncate">{person.fullName}</h2>
          {person.email && <p className="text-[11px] text-gray-400 truncate mt-0.5">{person.email}</p>}
        </div>
        {saveMsg && (
          <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium shrink-0">
            <CheckCircle2 size={11} /> {saveMsg}
          </span>
        )}
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6 max-w-2xl">

        {/* 1. Hero Summary */}
        <HeroSummaryCard
          person={person}
          snapshot={snapshot}
          discipleship={discipleship}
          careSignals={careSignals}
          loading={snapLoading}
        />

        {/* 2. Discipleship Timeline */}
        <Section title="Discipleship Timeline" icon={Clock} iconColor="text-teal-600">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
            <JourneyTimeline events={timeline} loading={tlLoading} />
          </div>
        </Section>

        {/* 3. Spiritual Rhythm */}
        <Section title="Spiritual Rhythm" icon={Activity} iconColor="text-teal-500">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
            <SpiritualRhythm days={rhythm} loading={rLoading} />
          </div>
        </Section>

        {/* 4. Attendance Rhythm */}
        <Section title="Attendance Rhythm" icon={CalendarDays} iconColor="text-blue-500">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
            <AttendanceRhythm months={attRhythm} loading={arLoading} />
          </div>
        </Section>

        {/* 5. Life Milestones */}
        <Section title="Life Milestones" icon={Star} iconColor="text-yellow-500">
          <div className="bg-white border border-gray-200 rounded-xl px-4 py-4">
            <LifeMilestones
              milestones={milestones}
              onAdd={handleAddMilestone}
              onDelete={handleDeleteMilestone}
              loading={milLoading}
            />
          </div>
        </Section>

        {/* 6. Current Discipleship */}
        <Section title="Current Discipleship" icon={BookOpen} iconColor="text-teal-600">
          <CurrentDiscipleship discipleship={discipleship} loading={discLoading} />
        </Section>

        {/* 7. Pastoral Care (inline) */}
        <Section title="Pastoral Care" icon={Shield} iconColor="text-rose-500">
          <div className="space-y-3">

            {/* Open care alerts */}
            {coreLoading ? (
              <div className="flex items-center gap-2 py-3 text-gray-400">
                <Loader2 size={13} className="animate-spin" />
                <span className="text-[12px]">Loading…</span>
              </div>
            ) : careSignals.length > 0 ? (
              <div className="bg-white border border-rose-200 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-rose-100 bg-rose-50">
                  <Bell size={11} className="text-rose-500" />
                  <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">Open Alerts</span>
                  <span className="ml-auto flex items-center justify-center w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold">
                    {careSignals.length}
                  </span>
                </div>
                <div className="divide-y divide-rose-50">
                  {careSignals.map(sig => (
                    <div key={sig.id} className="px-4 py-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-900">Missed a service</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {sig.meetingTypeName ?? 'Service'}
                            {sig.sessionDate && <> · {fmt(sig.sessionDate, { day: 'numeric', month: 'long' })}</>}
                          </p>
                        </div>
                        <span className="text-[9px] text-rose-400 font-medium shrink-0 mt-0.5">
                          {fmt(sig.createdAt, { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setScheduleSignalId(sig.id); setScheduleDate(''); setScheduleReason(''); setScheduleError(''); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-[11px] font-medium hover:bg-teal-700"
                        >
                          <Calendar size={11} /> Schedule visit
                        </button>
                        <button
                          onClick={() => handleDismissSignal(sig.id)}
                          disabled={dismissingId === sig.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-[11px] font-medium hover:bg-gray-200 disabled:opacity-40"
                        >
                          {dismissingId === sig.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />}
                          Dismiss
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-2">
                <CheckCircle2 size={14} className="text-teal-500 shrink-0" />
                <p className="text-[12px] text-gray-500">No open care alerts.</p>
              </div>
            )}

            {/* Visits */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <MapPin size={11} className="text-teal-600" />
                <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Visits</span>
                {upcomingVisits.length > 0 && (
                  <span className="ml-auto text-[11px] text-teal-600 font-medium">{upcomingVisits.length} upcoming</span>
                )}
              </div>
              {visits.length === 0 ? (
                <p className="px-4 py-3 text-[12px] text-gray-400">No visits scheduled yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {visits.map(v => {
                    const d = v.visitDate ? new Date(v.visitDate + 'T12:00:00') : null;
                    const isPast = d ? d < new Date() : false;
                    return (
                      <div key={v.id} className="flex items-start gap-3 px-4 py-3">
                        {d ? (
                          <div className={`text-center border rounded-lg px-2 py-1.5 w-11 shrink-0 ${isPast ? 'bg-gray-50 border-gray-100' : 'bg-teal-50 border-teal-100'}`}>
                            <p className={`text-[9px] font-semibold uppercase ${isPast ? 'text-gray-400' : 'text-teal-500'}`}>
                              {d.toLocaleString('en', { month: 'short' })}
                            </p>
                            <p className={`text-[15px] font-bold leading-none ${isPast ? 'text-gray-700' : 'text-teal-700'}`}>{d.getDate()}</p>
                          </div>
                        ) : <div className="w-11 shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-900">{v.reason || 'Pastoral visit'}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">Scheduled by {v.scheduledBy} · {fmt(v.scheduledAt)}</p>
                        </div>
                        <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${isPast ? 'bg-gray-100 text-gray-500' : 'bg-teal-50 text-teal-700'}`}>
                          {isPast ? 'Past' : 'Upcoming'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </Section>

        {/* 8. Attendance History (collapsed by default) */}
        <AttendanceHistory history={history} loading={coreLoading} />

        {/* 9. Administrative Details (collapsed by default) */}
        <AdminDetails
          person={person}
          expectations={expectations}
          meetingTypes={meetingTypes}
          allPeople={allPeople}
          isLinked={isLinked}
          linkedId={linkedId}
          onAddExpectation={handleAddExpectation}
          onRemoveExpectation={handleRemoveExpectation}
          onLink={handleLink}
        />

        <div className="h-6" />
      </div>

      {/* Schedule visit modal */}
      {scheduleSignalId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-gray-900">Schedule a Visit</h3>
              <button onClick={() => setScheduleSignalId(null)} className="text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Visit Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={e => setScheduleDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 10)}
                  className={inp}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Purpose <span className="font-normal normal-case text-gray-400">(optional)</span>
                </label>
                <input
                  value={scheduleReason}
                  onChange={e => setScheduleReason(e.target.value)}
                  placeholder="e.g. Pastoral check-in"
                  className={inp}
                />
              </div>
            </div>
            {scheduleError && (
              <p className="flex items-center gap-1.5 text-[12px] text-red-600">
                <AlertCircle size={12} /> {scheduleError}
              </p>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setScheduleSignalId(null)}
                className="px-4 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100"
              >Cancel</button>
              <button
                onClick={handleScheduleVisit}
                disabled={!scheduleDate || scheduleSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 disabled:opacity-40"
              >
                {scheduleSaving ? <Loader2 size={13} className="animate-spin" /> : <Calendar size={13} />}
                Schedule Visit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
