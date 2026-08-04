/**
 * PersonPage.tsx — Discipleship Profile (Checkpoint 2).
 *
 * Primary question: "How is this person doing spiritually, and should
 * someone lovingly follow up?"
 *
 * Section order (shepherding priority):
 *   1. Spiritual Snapshot   — at-a-glance engagement health
 *   2. Emmaus Journey       — Walks, Rooms, Daily Rhythm, Sermon Companions
 *   3. Pastoral Care        — open alerts + scheduled / past visits
 *   4. Attendance           — history + meeting expectations
 *   5. Profile & Admin      — contact details, account linking
 *
 * Architecture: each section is a self-contained block. Adding future
 * sections (Serving, Prayer Requests, Pastoral Notes) means adding one
 * block here — nothing else changes.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ArrowLeft, CalendarDays, UserCheck, Plus, Trash2,
  Loader2, AlertCircle, CheckCircle2, X,
  BookOpen, Users, Heart, Mic, MapPin,
  Bell, Activity, Clock, ChevronDown, ChevronUp,
  TrendingDown, HelpCircle, Shield, Calendar,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  person: api.UnifiedPerson;
  onBack: () => void;
}

// ── Style constants ──────────────────────────────────────────────────────────

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

const ENGAGEMENT: Record<api.PersonProfileSummary['engagementStatus'], {
  label: string; bg: string; border: string;
  badge: string; dot: string; icon: React.ElementType;
  prompt: string | null;
}> = {
  active: {
    label: 'Actively Engaged',
    bg: 'bg-teal-50', border: 'border-teal-200',
    badge: 'bg-teal-100 text-teal-800', dot: 'bg-teal-400',
    icon: Activity, prompt: null,
  },
  fading: {
    label: 'Engagement Fading',
    bg: 'bg-amber-50', border: 'border-amber-200',
    badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-400',
    icon: TrendingDown,
    prompt: 'This person\'s engagement has been quieter lately. A gentle check-in could mean a lot.',
  },
  needs_care: {
    label: 'Needs Follow-up',
    bg: 'bg-rose-50', border: 'border-rose-200',
    badge: 'bg-rose-100 text-rose-800', dot: 'bg-rose-500',
    icon: Bell,
    prompt: 'There are open care alerts for this person. Consider reaching out.',
  },
  unknown: {
    label: 'No Data Yet',
    bg: 'bg-gray-50', border: 'border-gray-200',
    badge: 'bg-gray-100 text-gray-600', dot: 'bg-gray-300',
    icon: HelpCircle, prompt: null,
  },
};

const SUBTYPE_BADGE: Record<string, string> = {
  emmaus_user:     'bg-teal-50 text-teal-700',
  attendance_only: 'bg-gray-100 text-gray-600',
  visitor:         'bg-blue-50 text-blue-700',
};
const SUBTYPE_LABEL: Record<string, string> = {
  emmaus_user:     'Emmaus User',
  attendance_only: 'Regular Attender',
  visitor:         'Visitor',
};

// ── Utility helpers ──────────────────────────────────────────────────────────

function daysAgoLabel(days: number | null): string {
  if (days === null) return '—';
  if (days === 0)    return 'Today';
  if (days === 1)    return 'Yesterday';
  if (days < 7)     return `${days} days ago`;
  if (days < 14)    return '1 week ago';
  if (days < 30)    return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60)    return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}

function relDays(isoDate: string | null | undefined): number | null {
  if (!isoDate) return null;
  const d = new Date(isoDate.includes('T') ? isoDate : isoDate + 'T12:00:00');
  return Math.floor((Date.now() - d.getTime()) / 86_400_000);
}

function fmt(
  dateStr: string | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  if (!dateStr) return '—';
  return new Date(dateStr.includes('T') ? dateStr : dateStr + 'T12:00:00')
    .toLocaleDateString('en-ZA', opts);
}

// ── Section shell — consistent visual chrome for every section ───────────────

function Section({
  title, icon: Icon, iconColor, action, children,
}: {
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={12} className={iconColor ?? 'text-gray-400'} />
        <h3 className="flex-1 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

// ── Card shell — consistent white bordered card used inside sections ──────────

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({
  icon: Icon, iconColor, label, count,
}: {
  icon: React.ElementType; iconColor?: string; label: string; count?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
      <Icon size={11} className={iconColor ?? 'text-gray-500'} />
      <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">{label}</span>
      {count !== undefined && (
        <span className="ml-auto text-[11px] text-gray-400">{count}</span>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
export default function PersonPage({ person, onBack }: Props) {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };
  const pKey = api.personKey(person.id, person.personType);

  // ── Data state ─────────────────────────────────────────────────────────────
  const [history,      setHistory]      = useState<api.AttendanceHistoryItem[]>([]);
  const [expectations, setExpectations] = useState<api.AttendanceExpectation[]>([]);
  const [meetingTypes, setMeetingTypes] = useState<api.MeetingType[]>([]);
  const [visits,       setVisits]       = useState<api.VisitHistoryItem[]>([]);
  const [careSignals,  setCareSignals]  = useState<api.CareSignal[]>([]);
  const [snapshot,     setSnapshot]     = useState<api.PersonProfileSummary | null>(null);
  const [discipleship, setDiscipleship] = useState<api.DiscipleshipSummary | null>(null);

  // ── Loading / error state ──────────────────────────────────────────────────
  const [loading,            setLoading]            = useState(true);
  const [snapshotLoading,    setSnapshotLoading]    = useState(true);
  const [discipleshipLoading,setDiscipleshipLoading]= useState(false);
  const [error,              setError]              = useState('');

  // ── Link modal state ───────────────────────────────────────────────────────
  const [showLink,  setShowLink]  = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [allPeople, setAllPeople] = useState<api.UnifiedPerson[]>([]);
  const [linkSaving,setLinkSaving]= useState(false);
  const [linkError, setLinkError] = useState('');
  const [linked,    setLinked]    = useState(person.isLinked);
  const [linkedId,  setLinkedId]  = useState(person.linkedUserId);
  const [saveMsg,   setSaveMsg]   = useState('');

  // ── Add expectation state ──────────────────────────────────────────────────
  const [showAddExp,   setShowAddExp]   = useState(false);
  const [newMtId,      setNewMtId]      = useState('');
  const [newExp,       setNewExp]       = useState<api.Expectation>('expected');
  const [newExpNotes,  setNewExpNotes]  = useState('');
  const [addExpSaving, setAddExpSaving] = useState(false);

  // ── Schedule visit state ───────────────────────────────────────────────────
  const [scheduleSignalId, setScheduleSignalId] = useState<string | null>(null);
  const [scheduleDate,     setScheduleDate]     = useState('');
  const [scheduleReason,   setScheduleReason]   = useState('');
  const [scheduleSaving,   setScheduleSaving]   = useState(false);
  const [scheduleError,    setScheduleError]    = useState('');
  const [dismissingId,     setDismissingId]     = useState<string | null>(null);

  // ── History expand ─────────────────────────────────────────────────────────
  const [showAllHistory, setShowAllHistory] = useState(false);

  // ── Load functions ─────────────────────────────────────────────────────────

  const loadSnapshot = useCallback(async () => {
    setSnapshotLoading(true);
    try {
      const s = await api.getProfileSummary(auth, person.id, person.personType);
      setSnapshot(s);
    } catch { /* non-critical — snapshot is decorative */ }
    finally { setSnapshotLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  const loadDiscipleship = useCallback(async () => {
    setDiscipleshipLoading(true);
    try {
      const s = await api.getDiscipleshipSummary(auth, person.id, person.personType);
      setDiscipleship(s);
    } catch { /* non-critical */ }
    finally { setDiscipleshipLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [hist, exps, types, allP, vis, sigs] = await Promise.all([
        api.getAttendanceHistory(auth, person.id, person.personType, 30),
        api.getExpectations(auth, person.id, person.personType),
        api.listMeetingTypes(auth),
        api.listPeople(auth),
        api.getVisitHistory(auth, person.id),
        api.listCareSignals(auth, { personId: person.id, includesDismissed: false }),
      ]);
      setHistory(hist);
      setExpectations(exps);
      setMeetingTypes(types);
      setAllPeople(allP);
      setVisits(vis);
      setCareSignals(sigs);
      if (types.length > 0 && !newMtId) setNewMtId(types[0].id);
    } catch { setError('Could not load person details.'); }
    finally { setLoading(false); }
  }, [person.id, person.personType, auth.userId]);

  useEffect(() => {
    load();
    loadSnapshot();
  }, [load, loadSnapshot]);

  useEffect(() => {
    if (person.personType === 'emmaus_user' || linked) {
      loadDiscipleship();
    }
  }, [linked, loadDiscipleship, person.personType]);

  // ── Helper: flash a save confirmation ─────────────────────────────────────
  const flash = (msg: string) => {
    setSaveMsg(msg);
    setTimeout(() => setSaveMsg(''), 2500);
  };

  const reloadAll = useCallback(async () => {
    await Promise.all([load(), loadSnapshot()]);
    if (person.personType === 'emmaus_user' || linked) loadDiscipleship();
  }, [load, loadSnapshot, loadDiscipleship, linked, person.personType]);

  // ── Action handlers ────────────────────────────────────────────────────────

  const handleLink = async (emmausId: string) => {
    if (!person.id || person.personType !== 'pastoral_person') return;
    setLinkSaving(true); setLinkError('');
    try {
      await api.linkPersonToUser(auth, person.id, emmausId);
      setLinked(true); setLinkedId(emmausId);
      setShowLink(false);
      flash('Linked to Emmaus account');
      await reloadAll();
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
      await load(); flash('Expectation saved');
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

  const handleDismissSignal = async (signalId: string) => {
    setDismissingId(signalId);
    try {
      await api.dismissCareSignal(auth, signalId);
      setCareSignals(prev => prev.filter(s => s.id !== signalId));
      await loadSnapshot();
      flash('Alert dismissed');
    } catch { flash('Dismiss failed'); }
    finally { setDismissingId(null); }
  };

  const handleScheduleVisit = async () => {
    if (!scheduleSignalId || !scheduleDate) return;
    setScheduleSaving(true); setScheduleError('');
    try {
      await api.scheduleVisit(auth, scheduleSignalId, scheduleDate, scheduleReason);
      setScheduleSignalId(null);
      setScheduleDate(''); setScheduleReason('');
      await reloadAll();
      flash('Visit scheduled');
    } catch (err: unknown) {
      setScheduleError(err instanceof Error ? err.message : 'Schedule failed.');
    } finally { setScheduleSaving(false); }
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  const emmausMatches = linkQuery.length > 1
    ? allPeople.filter(p =>
        p.personType === 'emmaus_user' &&
        (p.fullName.toLowerCase().includes(linkQuery.toLowerCase()) ||
         (p.email?.toLowerCase().includes(linkQuery.toLowerCase()) ?? false))
      ).slice(0, 6)
    : [];

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';
  const visibleHistory = showAllHistory ? history : history.slice(0, 6);
  const hasEmmaus = person.personType === 'emmaus_user' || linked;
  const eng = snapshot ? ENGAGEMENT[snapshot.engagementStatus] : null;
  const upcomingVisits = visits.filter(v => v.visitDate && new Date(v.visitDate + 'T12:00:00') >= new Date());

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[15px] font-semibold text-gray-900 truncate">{person.fullName}</h2>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wide ${SUBTYPE_BADGE[person.subType]}`}>
              {SUBTYPE_LABEL[person.subType]}
            </span>
          </div>
          {person.email && (
            <p className="text-[11px] text-gray-400 truncate mt-0.5">{person.email}</p>
          )}
        </div>
        {saveMsg && (
          <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium shrink-0">
            <CheckCircle2 size={11} /> {saveMsg}
          </span>
        )}
      </div>

      {/* ── Scrollable body ───────────────────────────────────────────────── */}
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

            {/* ── 1. SPIRITUAL SNAPSHOT ──────────────────────────────────── */}
            <div className={`rounded-xl border p-4 transition-colors ${
              eng ? `${eng.bg} ${eng.border}` : 'bg-gray-50 border-gray-200'
            }`}>
              {snapshotLoading || !snapshot || !eng ? (
                <div className="flex items-center gap-2 text-[12px] text-gray-400">
                  <Loader2 size={12} className="animate-spin" />
                  Loading spiritual profile…
                </div>
              ) : (() => {
                const EngIcon = eng.icon;
                return (
                  <>
                    {/* Status badge row */}
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${eng.badge}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${eng.dot}`} />
                        <EngIcon size={11} />
                        {eng.label}
                      </span>
                      {snapshot.openCareSignalCount > 0 && (
                        <span className="text-[11px] font-medium text-rose-600">
                          {snapshot.openCareSignalCount} open alert{snapshot.openCareSignalCount !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>

                    {/* Contextual pastoral prompt */}
                    {eng.prompt && (
                      <p className="text-[12px] text-gray-600 mb-3 leading-relaxed italic">
                        {eng.prompt}
                      </p>
                    )}

                    {/* Three key stats */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                          Last at church
                        </p>
                        <p className="text-[12px] font-semibold text-gray-800">
                          {daysAgoLabel(snapshot.daysSinceLastAttendance)}
                        </p>
                        {snapshot.lastAttendanceDate && (
                          <p className="text-[10px] text-gray-400">
                            {fmt(snapshot.lastAttendanceDate, { day: 'numeric', month: 'short' })}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                          Active walk
                        </p>
                        {snapshot.activeWalkTitle ? (
                          <>
                            <p className="text-[12px] font-semibold text-gray-800 leading-tight line-clamp-1">
                              {snapshot.activeWalkTitle}
                            </p>
                            {snapshot.activeWalkProgress && (
                              <p className="text-[10px] text-gray-400">{snapshot.activeWalkProgress}</p>
                            )}
                          </>
                        ) : (
                          <p className="text-[12px] text-gray-400">None</p>
                        )}
                      </div>
                      <div>
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                          Emmaus activity
                        </p>
                        <p className="text-[12px] font-semibold text-gray-800">
                          {daysAgoLabel(relDays(snapshot.lastEmmausActivityDate))}
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* ── 2. EMMAUS JOURNEY ──────────────────────────────────────── */}
            {hasEmmaus && (
              <Section title="Emmaus Journey" icon={BookOpen} iconColor="text-teal-600">
                {discipleshipLoading ? (
                  <div className="flex items-center gap-2 py-4 text-[12px] text-gray-400">
                    <Loader2 size={13} className="animate-spin" /> Loading activity…
                  </div>
                ) : !discipleship ? (
                  <p className="text-[12px] text-gray-400 py-2">Could not load Emmaus activity.</p>
                ) : !discipleship.available ? (
                  <p className="text-[12px] text-gray-400 py-2">
                    No Emmaus account linked — activity data not available.
                  </p>
                ) : (
                  <div className="space-y-3">

                    {/* Walks */}
                    <Card>
                      <CardHeader
                        icon={BookOpen} iconColor="text-teal-600" label="Walks"
                        count={`${discipleship.journeys.filter(j => j.status !== 'completed').length} active`}
                      />
                      {discipleship.journeys.length === 0 ? (
                        <p className="px-4 py-3 text-[12px] text-gray-400">No walks in progress.</p>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {discipleship.journeys.map(j => {
                            const pct  = j.totalDays > 0 ? Math.round((j.completedDays / j.totalDays) * 100) : 0;
                            const done = j.status === 'completed';
                            return (
                              <div key={j.journeyId} className="px-4 py-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-gray-900 truncate">{j.title}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                      {done
                                        ? 'Completed'
                                        : `Day ${j.currentDay}${j.totalDays > 0 ? ` of ${j.totalDays}` : ''}`}
                                      {j.updatedAt && (
                                        <> · Last active {fmt(j.updatedAt, { day: 'numeric', month: 'short' })}</>
                                      )}
                                    </p>
                                  </div>
                                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                    done              ? 'bg-green-50 text-green-700' :
                                    j.status === 'active' ? 'bg-teal-50 text-teal-700' :
                                    'bg-gray-100 text-gray-500'
                                  }`}>
                                    {done ? 'Done' : j.status}
                                  </span>
                                </div>
                                {j.totalDays > 0 && (
                                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${done ? 'bg-green-400' : 'bg-teal-400'}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>

                    {/* Rooms */}
                    <Card>
                      <CardHeader
                        icon={Users} iconColor="text-purple-600" label="Rooms"
                        count={`${discipleship.rooms.length} room${discipleship.rooms.length !== 1 ? 's' : ''}`}
                      />
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
                                    Joined {fmt(r.joinedAt)}
                                  </p>
                                )}
                              </div>
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                r.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-500'
                              }`}>
                                {r.role === 'admin' ? 'Leader' : 'Member'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>

                    {/* Daily Rhythm */}
                    {discipleship.devotionals.length > 0 && (
                      <Card>
                        <CardHeader icon={Heart} iconColor="text-rose-500" label="Daily Rhythm" />
                        <div className="divide-y divide-gray-100">
                          {discipleship.devotionals.map(d => (
                            <div key={d.seriesId} className="flex items-center gap-3 px-4 py-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-gray-900 truncate">{d.title}</p>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  {d.completedCount} day{d.completedCount !== 1 ? 's' : ''} completed
                                  {d.updatedAt && (
                                    <> · {fmt(d.updatedAt, { day: 'numeric', month: 'short' })}</>
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
                      </Card>
                    )}

                    {/* Sermon Companions */}
                    {discipleship.sermonCompanions.length > 0 && (
                      <Card>
                        <CardHeader icon={Mic} iconColor="text-amber-600" label="Sermon Companions" />
                        <div className="divide-y divide-gray-100">
                          {discipleship.sermonCompanions.map(sc => {
                            const pct = sc.totalDays > 0
                              ? Math.round((sc.completedCount / sc.totalDays) * 100)
                              : 0;
                            return (
                              <div key={sc.companionId} className="px-4 py-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-medium text-gray-900 truncate">{sc.title}</p>
                                    <p className="text-[11px] text-gray-400 mt-0.5">
                                      {sc.completedCount}
                                      {sc.totalDays > 0 ? ` of ${sc.totalDays}` : ''} days
                                      {sc.updatedAt && (
                                        <> · {fmt(sc.updatedAt, { day: 'numeric', month: 'short' })}</>
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
                      </Card>
                    )}

                  </div>
                )}
              </Section>
            )}

            {/* ── 3. PASTORAL CARE ───────────────────────────────────────── */}
            <Section title="Pastoral Care" icon={Shield} iconColor="text-rose-500">
              <div className="space-y-3">

                {/* Open care alerts */}
                {careSignals.length > 0 ? (
                  <div className="bg-white border border-rose-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-rose-100 bg-rose-50">
                      <Bell size={11} className="text-rose-500" />
                      <span className="text-[11px] font-semibold text-rose-700 uppercase tracking-wide">
                        Open Alerts
                      </span>
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
                                {sig.sessionDate && (
                                  <> · {fmt(sig.sessionDate, { day: 'numeric', month: 'long' })}</>
                                )}
                              </p>
                            </div>
                            <span className="text-[9px] text-rose-400 font-medium shrink-0 mt-0.5">
                              {fmt(sig.createdAt, { day: 'numeric', month: 'short' })}
                            </span>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setScheduleSignalId(sig.id);
                                setScheduleDate('');
                                setScheduleReason('');
                                setScheduleError('');
                              }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-[11px] font-medium hover:bg-teal-700 transition-colors"
                            >
                              <Calendar size={11} /> Schedule visit
                            </button>
                            <button
                              onClick={() => handleDismissSignal(sig.id)}
                              disabled={dismissingId === sig.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 text-[11px] font-medium hover:bg-gray-200 transition-colors disabled:opacity-40"
                            >
                              {dismissingId === sig.id
                                ? <Loader2 size={11} className="animate-spin" />
                                : <X size={11} />}
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
                <Card>
                  <CardHeader
                    icon={MapPin} iconColor="text-teal-600" label="Visits"
                    count={upcomingVisits.length > 0
                      ? `${upcomingVisits.length} upcoming`
                      : visits.length > 0 ? `${visits.length} total` : undefined}
                  />
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
                              <div className={`text-center border rounded-lg px-2.5 py-1.5 w-12 shrink-0 ${
                                isPast ? 'bg-gray-50 border-gray-100' : 'bg-teal-50 border-teal-100'
                              }`}>
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
                                {fmt(v.scheduledAt)}
                              </p>
                            </div>
                            <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              isPast ? 'bg-gray-100 text-gray-500' : 'bg-teal-50 text-teal-700'
                            }`}>
                              {isPast ? 'Past' : 'Upcoming'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>

              </div>
            </Section>

            {/* ── 4. ATTENDANCE ──────────────────────────────────────────── */}
            <Section
              title="Attendance"
              icon={CalendarDays}
              iconColor="text-blue-500"
              action={
                <button
                  onClick={() => setShowAddExp(v => !v)}
                  className="flex items-center gap-1 text-[12px] text-teal-600 hover:text-teal-800 transition-colors"
                >
                  <Plus size={12} /> Expectation
                </button>
              }
            >
              {/* Add expectation form */}
              {showAddExp && (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Meeting
                      </label>
                      <select
                        value={newMtId}
                        onChange={e => setNewMtId(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-teal-500"
                      >
                        {meetingTypes.map(mt => (
                          <option key={mt.id} value={mt.id}>{mt.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        Expectation
                      </label>
                      <select
                        value={newExp}
                        onChange={e => setNewExp(e.target.value as api.Expectation)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] bg-white focus:outline-none focus:border-teal-500"
                      >
                        <option value="expected">Normally attends</option>
                        <option value="not_expected">Not expected</option>
                      </select>
                    </div>
                  </div>
                  <input
                    value={newExpNotes}
                    onChange={e => setNewExpNotes(e.target.value)}
                    placeholder="Optional note (e.g. Youth participant)"
                    className={inp}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowAddExp(false)}
                      className="px-3 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-100"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddExpectation}
                      disabled={addExpSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-[12px] font-medium hover:bg-teal-700 disabled:opacity-40"
                    >
                      {addExpSaving ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* Expectations list */}
              {expectations.length > 0 && (
                <Card>
                  <div className="divide-y divide-gray-100">
                    {expectations.map(e => (
                      <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium text-gray-900">{e.meetingTypeName}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              e.expectation === 'expected'
                                ? 'bg-green-50 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            }`}>
                              {e.expectation === 'expected' ? 'Normally attends' : 'Not expected'}
                            </span>
                            {e.notes && (
                              <span className="text-[11px] text-gray-400">{e.notes}</span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveExpectation(e.meetingTypeId)}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {/* Attendance history */}
              {history.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <CalendarDays size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-[12px]">No attendance recorded yet.</p>
                </div>
              ) : (
                <>
                  <Card>
                    <div className="divide-y divide-gray-100">
                      {visibleHistory.map((h, i) => {
                        const d = new Date(h.sessionDate + 'T12:00:00');
                        return (
                          <div key={i} className="flex items-center gap-3 px-4 py-3">
                            <div className="text-center bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 w-12 shrink-0">
                              <p className="text-[9px] font-semibold text-gray-400 uppercase">
                                {d.toLocaleString('en', { month: 'short' })}
                              </p>
                              <p className="text-[16px] font-bold text-gray-800 leading-none">
                                {d.getDate()}
                              </p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-gray-900">{h.meetingTypeName}</p>
                              <p className="text-[11px] text-gray-400">
                                {d.toLocaleDateString('en-ZA', {
                                  weekday: 'short', day: 'numeric',
                                  month: 'long', year: 'numeric',
                                })}
                              </p>
                            </div>
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_PILL[h.status]}`}>
                              {STATUS_LABEL[h.status]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                  {history.length > 6 && (
                    <button
                      onClick={() => setShowAllHistory(v => !v)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 text-[12px] text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      {showAllHistory
                        ? <><ChevronUp size={12} /> Show less</>
                        : <><ChevronDown size={12} /> Show all {history.length} records</>}
                    </button>
                  )}
                </>
              )}
            </Section>

            {/* ── 5. PROFILE & ADMIN ─────────────────────────────────────── */}
            <Section title="Profile & Admin" icon={UserCheck} iconColor="text-gray-400">
              <Card>
                {/* Contact details */}
                <div className="px-4 py-3 space-y-1.5 text-[13px]">
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
                    <span className="text-gray-900 font-medium">{SUBTYPE_LABEL[person.subType]}</span>
                  </div>
                </div>

                {/* Emmaus account linking (pastoral_person only) */}
                {person.personType === 'pastoral_person' && (
                  <div className="px-4 py-3 border-t border-gray-100">
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
                        <button
                          onClick={() => { setShowLink(true); setLinkError(''); setLinkQuery(''); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-[12px] font-medium hover:bg-teal-100 transition-colors"
                        >
                          <UserCheck size={12} /> Link Account
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </Section>

            {/* Bottom padding */}
            <div className="h-4" />

          </>
        )}
      </div>

      {/* ── Link-to-Emmaus modal ─────────────────────────────────────────── */}
      {showLink && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-gray-900">Link to Emmaus Account</h3>
              <button onClick={() => setShowLink(false)} className="text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>
            <input
              value={linkQuery}
              onChange={e => setLinkQuery(e.target.value)}
              placeholder="Search by name or email…"
              className={inp}
            />
            {emmausMatches.length > 0 && (
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {emmausMatches.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleLink(p.id)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-teal-50 transition-colors"
                  >
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
            {linkError && (
              <p className="flex items-center gap-1.5 text-[12px] text-red-600">
                <AlertCircle size={12} /> {linkError}
              </p>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setShowLink(false)}
                className="px-4 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Schedule visit modal ─────────────────────────────────────────── */}
      {scheduleSignalId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-gray-900">Schedule a Visit</h3>
              <button
                onClick={() => setScheduleSignalId(null)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                  Visit Date
                </label>
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
              >
                Cancel
              </button>
              <button
                onClick={handleScheduleVisit}
                disabled={!scheduleDate || scheduleSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 disabled:opacity-40"
              >
                {scheduleSaving
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Calendar size={13} />}
                Schedule Visit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
