/**
 * HeroSummaryCard — the primary at-a-glance view of a person's discipleship health.
 * Renders in under 1 second with a visible loading skeleton.
 */
import React from 'react';
import { UserCheck, Activity, TrendingDown, Bell, HelpCircle, BookOpen, Users } from 'lucide-react';
import type {
  UnifiedPerson, PersonProfileSummary, DiscipleshipSummary, CareSignal,
} from '@/lib/pastoral-api';

interface Props {
  person: UnifiedPerson;
  snapshot: PersonProfileSummary | null;
  discipleship: DiscipleshipSummary | null;
  careSignals: CareSignal[];
  loading?: boolean;
}

const ENGAGEMENT = {
  active:     { label: 'Actively Engaged',  bg: 'bg-teal-50',  border: 'border-teal-200',  badge: 'bg-teal-500',  icon: Activity },
  fading:     { label: 'Engagement Fading', bg: 'bg-amber-50', border: 'border-amber-200', badge: 'bg-amber-400', icon: TrendingDown },
  needs_care: { label: 'Needs Follow-up',   bg: 'bg-rose-50',  border: 'border-rose-200',  badge: 'bg-rose-500',  icon: Bell },
  unknown:    { label: 'New / No Data',     bg: 'bg-gray-50',  border: 'border-gray-200',  badge: 'bg-gray-400',  icon: HelpCircle },
} as const;

const TREND_PILL = {
  consistent: 'bg-green-50 text-green-700',
  improving:  'bg-teal-50 text-teal-700',
  declining:  'bg-rose-50 text-rose-700',
  new:        'bg-blue-50 text-blue-700',
  unknown:    'bg-gray-50 text-gray-500',
} as const;

const TREND_LABEL = {
  consistent: 'Consistent attender',
  improving:  'Attendance improving',
  declining:  'Attendance declining',
  new:        'New attendee',
  unknown:    '',
} as const;

function initials(name: string) {
  return name.split(' ').slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}

function fmt(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!iso) return '—';
  return new Date(iso.includes('T') ? iso : iso + 'T12:00:00').toLocaleDateString('en-ZA', opts);
}

function daysLabel(days: number | null) {
  if (days === null) return 'Never recorded';
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 60) return '1 month ago';
  return `${Math.floor(days / 30)} months ago`;
}

export default function HeroSummaryCard({ person, snapshot, discipleship, careSignals, loading }: Props) {
  const eng = snapshot ? ENGAGEMENT[snapshot.engagementStatus] : ENGAGEMENT.unknown;
  const EngIcon = eng.icon;
  const hasEmmaus = person.personType === 'emmaus_user' || person.isLinked;

  const activeWalks = discipleship?.available
    ? discipleship.journeys.filter(j => j.status !== 'completed' && j.status !== 'paused')
    : [];
  const activeRooms = discipleship?.available ? discipleship.rooms : [];

  return (
    <div className={`rounded-2xl border overflow-hidden ${eng.bg} ${eng.border}`}>
      {/* ── Avatar + name row ────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4 flex items-start gap-4">
        {/* Avatar */}
        <div className="shrink-0 w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center shadow-sm">
          <span className="text-[20px] font-bold text-gray-700">{initials(person.fullName)}</span>
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <h2 className="text-[18px] font-bold text-gray-900 leading-tight truncate">{person.fullName}</h2>
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            {/* Engagement badge */}
            <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-white text-[10px] font-semibold ${eng.badge}`}>
              <EngIcon size={10} />
              {eng.label}
            </span>

            {/* Trend badge */}
            {snapshot && snapshot.attendanceTrend !== 'unknown' && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${TREND_PILL[snapshot.attendanceTrend]}`}>
                {TREND_LABEL[snapshot.attendanceTrend]}
              </span>
            )}

            {/* Emmaus linked badge */}
            {hasEmmaus && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/70 text-teal-700 text-[10px] font-medium border border-teal-200">
                <UserCheck size={10} /> Emmaus
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Quick stat grid ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 border-t border-white/60 divide-x divide-white/60">
        <div className="px-4 py-3">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Last at church</p>
          <p className="text-[13px] font-semibold text-gray-900 mt-0.5">
            {loading ? '…' : daysLabel(snapshot?.daysSinceLastAttendance ?? null)}
          </p>
          {snapshot?.lastAttendanceDate && (
            <p className="text-[10px] text-gray-400">{fmt(snapshot.lastAttendanceDate, { day: 'numeric', month: 'short' })}</p>
          )}
        </div>

        <div className="px-4 py-3">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <BookOpen size={9} /> Walks
          </p>
          {loading ? (
            <p className="text-[13px] font-semibold text-gray-900 mt-0.5">…</p>
          ) : activeWalks.length > 0 ? (
            <>
              <p className="text-[13px] font-semibold text-gray-900 mt-0.5 leading-tight line-clamp-1">
                {activeWalks[0].title}
              </p>
              <p className="text-[10px] text-gray-400">
                Day {activeWalks[0].currentDay}
                {activeWalks.length > 1 && ` +${activeWalks.length - 1} more`}
              </p>
            </>
          ) : snapshot?.completedWalkCount && snapshot.completedWalkCount > 0 ? (
            <p className="text-[13px] font-semibold text-gray-900 mt-0.5">
              {snapshot.completedWalkCount} completed
            </p>
          ) : (
            <p className="text-[13px] text-gray-400 mt-0.5">None active</p>
          )}
        </div>

        <div className="px-4 py-3">
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1">
            <Users size={9} /> Groups
          </p>
          {loading ? (
            <p className="text-[13px] font-semibold text-gray-900 mt-0.5">…</p>
          ) : activeRooms.length > 0 ? (
            <>
              <p className="text-[13px] font-semibold text-gray-900 mt-0.5 leading-tight line-clamp-1">
                {activeRooms[0].roomName}
              </p>
              {activeRooms.length > 1 && (
                <p className="text-[10px] text-gray-400">+{activeRooms.length - 1} more</p>
              )}
            </>
          ) : (
            <p className="text-[13px] text-gray-400 mt-0.5">No groups</p>
          )}
        </div>
      </div>

      {/* ── Pastoral summary ─────────────────────────────────────────────── */}
      {!loading && snapshot?.pastoralSummary && (
        <div className="px-5 py-3 border-t border-white/60 bg-white/40">
          <p className="text-[12px] text-gray-600 leading-relaxed italic">
            "{snapshot.pastoralSummary}"
          </p>
        </div>
      )}

      {/* ── Open care alerts banner ──────────────────────────────────────── */}
      {!loading && careSignals.length > 0 && (
        <div className="px-5 py-2 bg-rose-500 flex items-center gap-2">
          <Bell size={12} className="text-white shrink-0" />
          <p className="text-[11px] text-white font-medium">
            {careSignals.length} open care alert{careSignals.length !== 1 ? 's' : ''} — pastoral follow-up recommended
          </p>
        </div>
      )}
    </div>
  );
}
