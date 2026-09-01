/**
 * PersonPage.tsx — calm pastoral person record.
 *
 * Keeps the existing pastoral data loaders and actions in one place while
 * presenting the record as a quiet, pastor-friendly set of sections.
 *
 * Only Contact Information is open on first visit. Every other section stays
 * available without turning the profile into a dashboard.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowLeft, Bell, Calendar, X, AlertCircle, Loader2,
  MapPin, Star, BookOpen, CalendarDays, Shield, CheckCircle2,
  ClipboardCheck, ShieldCheck, ChevronDown, ChevronUp, Phone, Mail,
} from 'lucide-react';
import * as api from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

import CareSignalsSection from './profile/CareSignalsSection';
import LifeMilestones from './profile/LifeMilestones';
import CurrentDiscipleship from './profile/CurrentDiscipleship';
import AttendanceHistory from './profile/AttendanceHistory';
import AdminDetails from './profile/AdminDetails';
import { CareHistorySection } from '../workflows/CareHistorySection';

interface Props {
  person: api.UnifiedPerson;
  onBack: () => void;
  scrollToCareSignals?: boolean;
}

function fmt(d: string | null | undefined, opts?: Intl.DateTimeFormatOptions) {
  if (!d) return '—';
  const date = new Date(d.includes('T') ? d : d + 'T12:00:00');
  return date.toLocaleDateString('en-ZA', opts ?? { day: 'numeric', month: 'short', year: 'numeric' });
}

type SectionKey =
  | 'contact'
  | 'attendance'
  | 'discipleship'
  | 'volunteering'
  | 'moments'
  | 'care'
  | 'administrative'
  | 'leadership';

function CollapsibleSection({
  title,
  icon: Icon,
  iconColor = 'text-gray-400',
  sectionKey,
  openSections,
  onToggle,
  children,
  sectionRef,
}: {
  title: string;
  icon: React.ElementType;
  iconColor?: string;
  sectionKey: SectionKey;
  openSections: Record<SectionKey, boolean>;
  onToggle: (key: SectionKey) => void;
  children: React.ReactNode;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const expanded = openSections[sectionKey];

  return (
    <section ref={sectionRef} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(sectionKey)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
      >
        <Icon size={15} className={iconColor} />
        <span className="flex-1 text-[14px] font-semibold text-gray-800">{title}</span>
        {expanded
          ? <ChevronUp size={15} className="text-gray-400" />
          : <ChevronDown size={15} className="text-gray-400" />}
      </button>
      {expanded && <div className="border-t border-gray-100 px-4 py-4">{children}</div>}
    </section>
  );
}

function ContactRow({
  label,
  value,
  action,
}: {
  label: string;
  value: string | null | undefined;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 py-2.5 first:pt-0 last:pb-0">
      <span className="w-36 shrink-0 text-[12px] text-gray-400">{label}</span>
      <span className={`flex-1 min-w-0 text-[13px] ${value ? 'text-gray-800' : 'text-gray-400 italic'}`}>
        {value || 'Not yet provided'}
      </span>
      {action}
    </div>
  );
}

const PERSON_STATUS: Record<api.UnifiedPerson['subType'], string> = {
  emmaus_user: 'Emmaus',
  attendance_only: 'Attender',
  visitor: 'Visitor',
};

const STATUS_PILL: Record<string, string> = {
  present: 'bg-green-50 text-green-700',
  visitor: 'bg-blue-50 text-blue-700',
  apology: 'bg-yellow-50 text-yellow-700',
  absent: 'bg-red-50 text-red-600',
  not_expected: 'bg-gray-100 text-gray-500',
};

const STATUS_LABEL: Record<string, string> = {
  present: 'Present',
  visitor: 'Visitor',
  apology: 'Apology',
  absent: 'Absent',
  not_expected: 'Not expected',
};

function RecentAttendance({
  history,
  loading,
}: {
  history: api.AttendanceHistoryItem[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-gray-400">
        <Loader2 size={13} className="animate-spin" />
        <span className="text-[12px]">Loading recent attendance…</span>
      </div>
    );
  }

  if (history.length === 0) {
    return <p className="text-[12px] text-gray-400">No attendance records yet.</p>;
  }

  return (
    <div className="divide-y divide-gray-100">
      {history.slice(0, 3).map((item) => (
        <div key={`${item.sessionId}-${item.sessionDate}`} className="flex items-center gap-3 py-2.5 first:pt-0">
          <div className="w-8 h-8 rounded-lg bg-gray-50 flex items-center justify-center text-[11px] font-semibold text-gray-500 shrink-0">
            {new Date(item.sessionDate + 'T12:00:00').getDate()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] text-gray-800 truncate">{item.meetingTypeName}</p>
            <p className="text-[11px] text-gray-400">
              {new Date(item.sessionDate + 'T12:00:00').toLocaleDateString('en-ZA', {
                weekday: 'short',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${STATUS_PILL[item.status] ?? 'bg-gray-100 text-gray-500'}`}>
            {STATUS_LABEL[item.status] ?? item.status}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function PersonPage({ person, onBack, scrollToCareSignals }: Props) {
  const { user } = useAuth();
  const auth: api.AuthHeaders = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };
  const pKey = api.personKey(person.id, person.personType);
  const careSignalsRef = useRef<HTMLDivElement>(null);

  const [history, setHistory] = useState<api.AttendanceHistoryItem[]>([]);
  const [expectations, setExpectations] = useState<api.AttendanceExpectation[]>([]);
  const [meetingTypes, setMeetingTypes] = useState<api.MeetingType[]>([]);
  const [allPeople, setAllPeople] = useState<api.UnifiedPerson[]>([]);
  const [visits, setVisits] = useState<api.VisitHistoryItem[]>([]);
  const [careSignals, setCareSignals] = useState<api.CareSignal[]>([]);
  const [snapshot, setSnapshot] = useState<api.PersonProfileSummary | null>(null);
  const [discipleship, setDiscipleship] = useState<api.DiscipleshipSummary | null>(null);
  const [milestones, setMilestones] = useState<api.MilestoneItem[]>([]);

  const [coreLoading, setCoreLoading] = useState(true);
  const [snapLoading, setSnapLoading] = useState(true);
  const [discLoading, setDiscLoading] = useState(true);
  const [milLoading, setMilLoading] = useState(true);
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    contact: true,
    attendance: false,
    discipleship: false,
    volunteering: false,
    moments: false,
    care: false,
    administrative: false,
    leadership: false,
  });

  const [saveMsg, setSaveMsg] = useState('');
  const [isLinked, setLinked] = useState(person.isLinked);
  const [linkedId, setLinkedId] = useState(person.linkedUserId);

  type LeaderSource = 'admin_role' | 'pastoral_role' | 'explicit' | 'none';
  const [leaderAuthorized, setLeaderAuthorized] = useState<boolean | null>(null);
  const [leaderSource, setLeaderSource] = useState<LeaderSource>('none');
  const [leaderSaving, setLeaderSaving] = useState(false);

  const [scheduleSignalId, setScheduleSignalId] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleReason, setScheduleReason] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const [markingDoneId, setMarkingDoneId] = useState<string | null>(null);
  const [doneNote, setDoneNote] = useState('');
  const [doneSaving, setDoneSaving] = useState(false);

  const flash = (msg: string) => { setSaveMsg(msg); setTimeout(() => setSaveMsg(''), 2500); };

  const loadCore = useCallback(async () => {
    setCoreLoading(true);
    try {
      const [hist, exps, types, people, vis, sigs] = await Promise.all([
        api.getAttendanceHistory(auth, person.id, person.personType, 30),
        api.getExpectations(auth, person.id, person.personType),
        api.listMeetingTypes(auth),
        api.listPeople(auth),
        api.getVisitHistory(auth, pKey),
        api.listCareSignals(auth, { personId: person.id, includesDismissed: false }),
      ]);
      setHistory(hist);
      setExpectations(exps);
      setMeetingTypes(types);
      setAllPeople(people);
      setVisits(vis);
      setCareSignals(sigs);
    } catch {
      // Each profile section renders its own empty state.
    } finally {
      setCoreLoading(false);
    }
  }, [person.id, person.personType, auth.userId]);

  const loadSnapshot = useCallback(async () => {
    setSnapLoading(true);
    try {
      setSnapshot(await api.getProfileSummary(auth, person.id, person.personType));
    } catch {
      // Snapshot is supplementary to the profile.
    } finally {
      setSnapLoading(false);
    }
  }, [person.id, person.personType, auth.userId]);

  const loadDiscipleship = useCallback(async () => {
    setDiscLoading(true);
    try {
      setDiscipleship(await api.getDiscipleshipSummary(auth, person.id, person.personType));
    } catch {
      // The section will remain available with its empty state.
    } finally {
      setDiscLoading(false);
    }
  }, [person.id, person.personType, auth.userId]);

  const loadMilestones = useCallback(async () => {
    setMilLoading(true);
    try {
      setMilestones(await api.listMilestones(auth, person.id, person.personType));
    } catch {
      // The section will remain available with its empty state.
    } finally {
      setMilLoading(false);
    }
  }, [person.id, person.personType, auth.userId]);

  useEffect(() => {
    loadCore();
    loadSnapshot();
    loadDiscipleship();
    loadMilestones();
  }, [loadCore, loadSnapshot, loadDiscipleship, loadMilestones]);

  const leaderTargetId =
    person.personType === 'emmaus_user'
      ? person.id
      : isLinked && linkedId
      ? linkedId
      : null;

  useEffect(() => {
    if (!leaderTargetId) return;
    fetch(`/api/rooms/admin/persons/${encodeURIComponent(leaderTargetId)}/leader-access`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { authorized: boolean; source: LeaderSource } | null) => {
        if (!d) return;
        setLeaderAuthorized(d.authorized);
        setLeaderSource(d.source);
      })
      .catch(() => {});
  }, [leaderTargetId, user?.id]);

  const handleLeaderAccessToggle = async () => {
    if (!leaderTargetId || leaderSaving) return;
    const next = !leaderAuthorized;
    setLeaderSaving(true);
    try {
      const r = await fetch(
        `/api/rooms/admin/persons/${encodeURIComponent(leaderTargetId)}/leader-access`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ authorized: next }),
        },
      );
      const d: { authorized: boolean; source: LeaderSource } = await r.json();
      setLeaderAuthorized(d.authorized);
      setLeaderSource(d.source);
      flash(next ? 'Leader access granted' : 'Leader access removed');
    } catch {
      flash('Save failed');
    } finally {
      setLeaderSaving(false);
    }
  };

  useEffect(() => {
    if (!scrollToCareSignals) return;
    setOpenSections(prev => ({ ...prev, care: true }));
    const t = setTimeout(() => {
      careSignalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 350);
    return () => clearTimeout(t);
  }, [scrollToCareSignals]);

  const toggleSection = (key: SectionKey) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const openPastoralCare = () => {
    setOpenSections(prev => ({ ...prev, care: true }));
    setTimeout(() => {
      careSignalsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const handleDismissSignal = async (signalId: string) => {
    setDismissingId(signalId);
    try {
      await api.dismissCareSignal(auth, signalId);
      setCareSignals(prev => prev.filter(s => s.id !== signalId));
      flash('Alert dismissed');
      loadSnapshot();
    } catch {
      flash('Dismiss failed');
    } finally {
      setDismissingId(null);
    }
  };

  const handleScheduleVisit = async () => {
    if (!scheduleSignalId || !scheduleDate) return;
    setScheduleSaving(true);
    setScheduleError('');
    try {
      await api.scheduleVisit(auth, scheduleSignalId, scheduleDate, scheduleReason);
      setScheduleSignalId(null);
      setScheduleDate('');
      setScheduleReason('');
      flash('Visit scheduled');
      await Promise.all([loadCore(), loadSnapshot()]);
    } catch (err: unknown) {
      setScheduleError(err instanceof Error ? err.message : 'Schedule failed.');
    } finally {
      setScheduleSaving(false);
    }
  };

  const handleMarkDone = async (visitId: string) => {
    setDoneSaving(true);
    try {
      await api.completeVisit(auth, visitId, person.id, doneNote.trim());
      setMarkingDoneId(null);
      setDoneNote('');
      const updated = await api.getVisitHistory(auth, pKey);
      setVisits(updated);
      flash('Visit marked as done');
    } catch {
      flash('Save failed');
    } finally {
      setDoneSaving(false);
    }
  };

  const handleAddExpectation = async (mtId: string, exp: api.Expectation, notes: string) => {
    await api.setExpectation(auth, person.id, person.personType, mtId, exp, notes);
    await loadCore();
    flash('Expectation saved');
  };

  const handleRemoveExpectation = async (mtId: string) => {
    await api.removeExpectation(auth, person.id, person.personType, mtId);
    setExpectations(prev => prev.filter(e => e.meetingTypeId !== mtId));
    flash('Expectation removed');
  };

  const handleLink = async (emmausId: string) => {
    await api.linkPersonToUser(auth, person.id, emmausId);
    setLinked(true);
    setLinkedId(emmausId);
    flash('Account linked');
    await Promise.all([loadSnapshot(), loadDiscipleship()]);
  };

  const handleAddMilestone = async (
    milestoneType: string, title: string, milestoneDate: string, notes: string,
  ) => {
    await api.createMilestone(auth, person.id, person.personType, {
      milestoneType,
      title,
      ...(milestoneDate ? { milestoneDate } : {}),
      ...(notes ? { notes } : {}),
    });
    await loadMilestones();
    flash('Milestone saved');
  };

  const handleDeleteMilestone = async (id: string) => {
    await api.deleteMilestone(auth, person.id, person.personType, id);
    setMilestones(prev => prev.filter(m => m.id !== id));
    flash('Milestone removed');
  };

  const upcomingVisits = visits.filter(
    v => !v.isCompleted && v.visitDate && new Date(v.visitDate + 'T12:00:00') >= new Date(),
  );
  const openCareCount = Math.max(
    careSignals.length,
    snapshot?.openCareSignalCount ?? 0,
  );

  const inp = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 bg-white';

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="shrink-0 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to people"
          className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[18px] font-semibold text-gray-900 truncate">{person.fullName}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-700">
              {person.isLinked || person.subType === 'emmaus_user' ? 'Emmaus' : PERSON_STATUS[person.subType]}
            </span>
            <span className="text-[11px] text-gray-400">Pastoral record</span>
          </div>
        </div>
        {saveMsg && (
          <span className="flex items-center gap-1 text-[11px] text-green-600 font-medium shrink-0">
            <CheckCircle2 size={11} /> {saveMsg}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 max-w-3xl">
        {!coreLoading && !snapLoading && openCareCount > 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-rose-100 bg-rose-50/70 px-4 py-3">
            <Bell size={15} className="text-rose-500 shrink-0" />
            <p className="flex-1 min-w-0 text-[13px] text-rose-800">
              {person.fullName} may need your attention.
            </p>
            <button
              type="button"
              onClick={openPastoralCare}
              className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-[11px] font-medium text-rose-700 shadow-sm ring-1 ring-rose-200 hover:bg-rose-100 transition-colors"
            >
              Open Pastoral Care
            </button>
          </div>
        )}

        <CollapsibleSection
          title="Contact Information"
          icon={Phone}
          iconColor="text-teal-600"
          sectionKey="contact"
          openSections={openSections}
          onToggle={toggleSection}
        >
          <div className="divide-y divide-gray-100">
            <ContactRow
              label="Phone"
              value={person.phone}
              action={person.phone ? (
                <a href={`tel:${person.phone}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-teal-700 hover:text-teal-900">
                  <Phone size={12} /> Call
                </a>
              ) : undefined}
            />
            <ContactRow
              label="Email"
              value={person.email}
              action={person.email ? (
                <a href={`mailto:${person.email}`} className="inline-flex items-center gap-1 text-[12px] font-medium text-teal-700 hover:text-teal-900">
                  <Mail size={12} /> Email
                </a>
              ) : undefined}
            />
            <ContactRow label="Physical address" value={null} />
            <ContactRow label="Date of birth" value={null} />
            <ContactRow label="ICC membership" value={null} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Attendance"
          icon={CalendarDays}
          iconColor="text-blue-500"
          sectionKey="attendance"
          openSections={openSections}
          onToggle={toggleSection}
        >
          <div className="space-y-4">
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Recent attendance</p>
              <RecentAttendance history={history} loading={coreLoading} />
            </div>
            <AttendanceHistory history={history} loading={coreLoading} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Discipleship"
          icon={BookOpen}
          iconColor="text-teal-600"
          sectionKey="discipleship"
          openSections={openSections}
          onToggle={toggleSection}
        >
          <CurrentDiscipleship discipleship={discipleship} loading={discLoading} />
        </CollapsibleSection>

        <CollapsibleSection
          title="Volunteering"
          icon={Star}
          iconColor="text-amber-500"
          sectionKey="volunteering"
          openSections={openSections}
          onToggle={toggleSection}
        >
          {(() => {
            const servingMilestones = milestones.filter(m =>
              ['started_serving', 'serving', 'volunteering'].includes(m.milestoneType),
            );
            return servingMilestones.length === 0 ? (
              <p className="text-[13px] text-gray-400">Not recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {servingMilestones.map(m => (
                  <div key={m.id}>
                    <p className="text-[13px] font-medium text-gray-800">{m.title}</p>
                    {m.milestoneDate && <p className="mt-0.5 text-[11px] text-gray-400">{fmt(m.milestoneDate)}</p>}
                    {m.notes && <p className="mt-1 text-[12px] text-gray-500">{m.notes}</p>}
                  </div>
                ))}
              </div>
            );
          })()}
        </CollapsibleSection>

        <CollapsibleSection
          title="Significant Moments"
          icon={Calendar}
          iconColor="text-violet-500"
          sectionKey="moments"
          openSections={openSections}
          onToggle={toggleSection}
        >
          <div className="rounded-xl border border-gray-100 bg-gray-50/50 px-4 py-4">
            <LifeMilestones milestones={milestones} onAdd={handleAddMilestone} onDelete={handleDeleteMilestone} loading={milLoading} />
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          title="Pastoral Care"
          icon={Shield}
          iconColor="text-rose-500"
          sectionKey="care"
          openSections={openSections}
          onToggle={toggleSection}
          sectionRef={careSignalsRef}
        >
          <div className="space-y-4">
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
                  <span className="ml-auto flex items-center justify-center w-4 h-4 rounded-full bg-rose-500 text-white text-[9px] font-bold">{careSignals.length}</span>
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
                        <span className="text-[9px] text-rose-400 font-medium shrink-0 mt-0.5">{fmt(sig.createdAt, { day: 'numeric', month: 'short' })}</span>
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
                          {dismissingId === sig.id ? <Loader2 size={11} className="animate-spin" /> : <X size={11} />} Dismiss
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

            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/60">
                <MapPin size={11} className="text-teal-600" />
                <span className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">Visits</span>
                {upcomingVisits.length > 0 && <span className="ml-auto text-[11px] text-teal-600 font-medium">{upcomingVisits.length} upcoming</span>}
              </div>
              {visits.length === 0 ? (
                <p className="px-4 py-3 text-[12px] text-gray-400">No visits scheduled yet.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {visits.map(v => {
                    const d = v.visitDate ? new Date(v.visitDate + 'T12:00:00') : null;
                    const isPast = d ? d < new Date() : false;
                    const isMarkingThis = markingDoneId === v.id;
                    return (
                      <div key={v.id} className="px-4 py-3 space-y-2">
                        <div className="flex items-start gap-3">
                          {d ? (
                            <div className={`text-center border rounded-lg px-2 py-1.5 w-11 shrink-0 ${v.isCompleted ? 'bg-green-50 border-green-100' : isPast ? 'bg-gray-50 border-gray-100' : 'bg-teal-50 border-teal-100'}`}>
                              <p className={`text-[9px] font-semibold uppercase ${v.isCompleted ? 'text-green-500' : isPast ? 'text-gray-400' : 'text-teal-500'}`}>{d.toLocaleString('en', { month: 'short' })}</p>
                              <p className={`text-[15px] font-bold leading-none ${v.isCompleted ? 'text-green-700' : isPast ? 'text-gray-700' : 'text-teal-700'}`}>{d.getDate()}</p>
                            </div>
                          ) : <div className="w-11 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] font-medium text-gray-900">{v.reason || 'Pastoral visit'}</p>
                            <p className="text-[11px] text-gray-400 mt-0.5">Scheduled by {v.scheduledBy} · {fmt(v.scheduledAt)}</p>
                            {v.isCompleted && v.completedNote && <p className="text-[12px] text-gray-600 mt-1 italic">"{v.completedNote}"</p>}
                            {v.isCompleted && v.completedAt && <p className="text-[11px] text-green-600 mt-0.5">Done · {fmt(v.completedAt)}</p>}
                          </div>
                          <div className="shrink-0 flex flex-col items-end gap-1.5 mt-0.5">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${v.isCompleted ? 'bg-green-100 text-green-700' : isPast ? 'bg-gray-100 text-gray-500' : 'bg-teal-50 text-teal-700'}`}>
                              {v.isCompleted ? 'Done' : isPast ? 'Past' : 'Upcoming'}
                            </span>
                            {!v.isCompleted && (
                              <button onClick={() => { setMarkingDoneId(isMarkingThis ? null : v.id); setDoneNote(''); }} className="flex items-center gap-1 text-[11px] text-teal-600 hover:text-teal-800 transition-colors">
                                <ClipboardCheck size={11} /> Mark done
                              </button>
                            )}
                          </div>
                        </div>
                        {isMarkingThis && (
                          <div className="pl-14 space-y-2">
                            <textarea value={doneNote} onChange={e => setDoneNote(e.target.value)} placeholder="Add a visit note (optional)…" rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[12px] resize-none focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500" />
                            <div className="flex justify-end gap-2">
                              <button onClick={() => { setMarkingDoneId(null); setDoneNote(''); }} className="px-3 py-1.5 rounded-lg text-[12px] text-gray-600 hover:bg-gray-100 transition-colors">Cancel</button>
                              <button onClick={() => handleMarkDone(v.id)} disabled={doneSaving} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 text-white text-[12px] font-medium hover:bg-green-700 disabled:opacity-40 transition-colors">
                                {doneSaving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />} Save
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <details className="rounded-xl border border-gray-200 bg-gray-50/50">
              <summary className="cursor-pointer px-4 py-3 text-[12px] font-medium text-gray-700 hover:text-gray-900">Detailed care signals and actions</summary>
              <div className="border-t border-gray-200 p-3">
                <CareSignalsSection personId={person.id} personType={person.personType} auth={auth} />
              </div>
            </details>

            <div className="rounded-xl border border-gray-200 bg-white px-4 py-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Follow-up notes and tasks</p>
              <CareHistorySection
                auth={{ "x-user-id": user?.id ?? "", "x-user-role": user?.role ?? "admin" }}
                personId={person.id}
                personType={person.personType}
              />
            </div>
          </div>
        </CollapsibleSection>

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
        >
          {leaderTargetId && (
            <CollapsibleSection
              title="Group Leadership"
              icon={ShieldCheck}
              iconColor="text-teal-600"
              sectionKey="leadership"
              openSections={openSections}
              onToggle={toggleSection}
            >
              <div className="space-y-3">
                {leaderAuthorized === null ? (
                  <div className="flex items-center gap-2 text-gray-400">
                    <Loader2 size={13} className="animate-spin" />
                    <span className="text-[13px]">Loading…</span>
                  </div>
                ) : (
                  <>
                    {(leaderSource === 'admin_role' || leaderSource === 'pastoral_role') && (
                      <div className="flex items-start gap-2 bg-teal-50 border border-teal-100 rounded-lg px-3 py-2.5">
                        <ShieldCheck size={13} className="text-teal-600 mt-0.5 shrink-0" />
                        <p className="text-[12px] text-teal-700 leading-relaxed">
                          {leaderSource === 'admin_role' ? 'Authorized automatically as a Church Admin.' : 'Authorized automatically as a Pastor.'}
                        </p>
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-gray-900">Authorized Group Leader</p>
                        <p className="text-[12px] text-gray-500 mt-0.5 leading-relaxed">
                          {leaderAuthorized ? 'Can start live gatherings and use leader tools in their Rooms.' : 'Rooms work for discussion and shared progress only.'}
                        </p>
                      </div>
                      <button
                        onClick={handleLeaderAccessToggle}
                        disabled={leaderSaving || leaderSource === 'admin_role' || leaderSource === 'pastoral_role'}
                        aria-pressed={leaderAuthorized}
                        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-teal-500/40 ${leaderAuthorized ? 'bg-teal-600' : 'bg-gray-200'} disabled:opacity-50 disabled:cursor-default`}
                      >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${leaderAuthorized ? 'translate-x-5' : 'translate-x-0'}`} />
                        {leaderSaving && <span className="absolute inset-0 flex items-center justify-center"><Loader2 size={11} className="text-white animate-spin" /></span>}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </CollapsibleSection>
          )}
        </AdminDetails>

        <div className="h-6" />
      </div>

      {scheduleSignalId && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-[15px] font-semibold text-gray-900">Schedule a Visit</h3>
              <button onClick={() => setScheduleSignalId(null)} className="text-gray-400 hover:text-gray-700"><X size={16} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Visit Date</label>
                <input type="date" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} className={inp} />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Purpose <span className="font-normal normal-case text-gray-400">(optional)</span></label>
                <input value={scheduleReason} onChange={e => setScheduleReason(e.target.value)} placeholder="e.g. Pastoral check-in" className={inp} />
              </div>
            </div>
            {scheduleError && <p className="flex items-center gap-1.5 text-[12px] text-red-600"><AlertCircle size={12} /> {scheduleError}</p>}
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setScheduleSignalId(null)} className="px-4 py-2 rounded-lg text-[13px] text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={handleScheduleVisit} disabled={!scheduleDate || scheduleSaving} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 text-white text-[13px] font-medium hover:bg-teal-700 disabled:opacity-40">
                {scheduleSaving ? <Loader2 size={13} className="animate-spin" /> : <Calendar size={13} />} Schedule Visit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}