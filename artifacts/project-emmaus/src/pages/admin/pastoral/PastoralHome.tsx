import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, BookOpenCheck, CalendarCheck, CheckCircle2, ChevronRight,
  Loader2, RefreshCw, Sparkles, UserRound, Users,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import * as api from '@/lib/pastoral-api';
import { filterVisiblePastoralPeople } from '@/lib/pastoral-visibility';

interface Props {
  onOpenPeople: () => void;
  onOpenAttendance: () => void;
  onOpenPerson: (personId: string, personType: api.PersonType, personName?: string) => void;
}

const OPEN_STATUSES: api.SignalStatus[] = ['new', 'acknowledged', 'following_up'];

export default function PastoralHome({ onOpenPeople, onOpenAttendance, onOpenPerson }: Props) {
  const { user } = useAuth();
  const auth = useMemo<api.AuthHeaders>(() => ({
    userId: user?.id ?? '',
    userRole: user?.role ?? 'admin',
  }), [user?.id, user?.role]);
  const [stats, setStats] = useState<api.DashTodayStats | null>(null);
  const [signals, setSignals] = useState<api.DiscipleshipSignal[]>([]);
  const [people, setPeople] = useState<api.UnifiedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [today, significant, followUp, attention, allPeople] = await Promise.all([
        api.getDashTodayStats(auth),
        api.listDiscipleshipSignals(auth, { category: 'significant', status: OPEN_STATUSES, limit: 8 }),
        api.listDiscipleshipSignals(auth, { category: 'follow_up', status: OPEN_STATUSES, limit: 8 }),
        api.listDiscipleshipSignals(auth, { category: 'attention', status: OPEN_STATUSES, limit: 8 }),
        api.listPeople(auth),
      ]);
      setStats(today);
      setSignals([...significant, ...followUp, ...attention]
        .sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime())
        .slice(0, 6));
      setPeople(filterVisiblePastoralPeople(allPeople));
    } catch {
      setError('The pastoral briefing could not be loaded. Your register and attendance remain available.');
    } finally {
      setLoading(false);
    }
  }, [auth]);

  useEffect(() => { void load(); }, [load]);

  const emmausPeople = people.filter(p => p.subType === 'emmaus_user').length;
  const attendanceRecorded = (stats?.attendance.sessionCount ?? 0) > 0;
  const firstName = 'Pastor Jeremy';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-7 py-6 sm:py-8 space-y-7">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] sm:text-[25px] font-semibold text-gray-900">Good day, {firstName}</h1>
          <p className="text-[13px] text-gray-400 mt-1">
            {new Date().toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white text-[12px] text-gray-600 hover:bg-gray-50 disabled:opacity-50">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      <section className="rounded-2xl border border-teal-100 bg-teal-50/70 px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2 text-teal-700 mb-2">
          <Sparkles size={16} />
          <h2 className="text-[15px] font-semibold">Your pastoral briefing</h2>
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-[13px] text-teal-700/70 py-2"><Loader2 size={14} className="animate-spin" />Preparing your briefing…</div>
        ) : error ? (
          <p className="flex items-start gap-2 text-[13px] text-amber-700"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</p>
        ) : signals.length === 0 ? (
          <p className="text-[14px] leading-relaxed text-gray-700">Nothing currently needs your attention. Emmaus will keep watching attendance and discipleship activity in the background.</p>
        ) : (
          <p className="text-[14px] leading-relaxed text-gray-700">{signals.length} {signals.length === 1 ? 'person may' : 'people may'} need your attention. The most recent items are shown below.</p>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[16px] font-semibold text-gray-900">May need your attention</h2>
          <span className="text-[12px] text-gray-400">{signals.length || 'None'}</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {!loading && signals.length === 0 ? (
            <div className="flex items-center gap-3 px-5 py-5 text-[13px] text-gray-500">
              <CheckCircle2 size={18} className="text-teal-500" />Nothing needs your attention right now.
            </div>
          ) : signals.map(signal => (
            <button key={signal.id} onClick={() => onOpenPerson(signal.personId, signal.personType, signal.personName)} className="w-full flex items-center gap-3 px-4 py-4 text-left border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors">
              <span className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 shrink-0"><UserRound size={16} /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-[13px] font-medium text-gray-900">{signal.personName || 'Person'}</span>
                <span className="block text-[12px] text-gray-500 mt-0.5 line-clamp-2">{signal.explanation}</span>
              </span>
              <ChevronRight size={15} className="text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <button onClick={onOpenAttendance} className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-200 hover:bg-teal-50/30 transition-colors">
          <CalendarCheck size={17} className="text-teal-600 mb-3" />
          <span className="block text-[12px] text-gray-400">Today’s attendance</span>
          <strong className="block text-[17px] font-semibold text-gray-900 mt-1">{attendanceRecorded ? `${stats?.attendance.present ?? 0} present` : 'Not recorded'}</strong>
          <span className="block text-[11px] text-teal-700 mt-2">Open attendance →</span>
        </button>
        <button onClick={onOpenPeople} className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-200 hover:bg-teal-50/30 transition-colors">
          <Users size={17} className="text-teal-600 mb-3" />
          <span className="block text-[12px] text-gray-400">Church register</span>
          <strong className="block text-[17px] font-semibold text-gray-900 mt-1">{people.length} people</strong>
          <span className="block text-[11px] text-teal-700 mt-2">Find a person →</span>
        </button>
        <button onClick={onOpenPeople} className="text-left bg-white border border-gray-200 rounded-xl p-4 hover:border-teal-200 hover:bg-teal-50/30 transition-colors">
          <BookOpenCheck size={17} className="text-teal-600 mb-3" />
          <span className="block text-[12px] text-gray-400">People on Emmaus</span>
          <strong className="block text-[17px] font-semibold text-gray-900 mt-1">{emmausPeople}</strong>
          <span className="block text-[11px] text-gray-500 mt-2">{stats?.activeWalks ?? 0} active Walks</span>
        </button>
      </section>

      <p className="text-center text-[11px] text-gray-400 pt-2">Emmaus presents observable information. Pastor Jeremy decides how and when to respond.</p>
    </div>
  );
}