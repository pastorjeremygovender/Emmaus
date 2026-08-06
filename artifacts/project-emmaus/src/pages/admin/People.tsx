/**
 * People — discipleship hub for Members, Rooms, Prayer, Attendance, and Care.
 *
 * Checkpoint 1: Attendance tab is live (Meeting Types, Sessions, Register).
 *               Members tab now has a "All People" sub-view backed by the
 *               pastoral API alongside the existing Emmaus Accounts view.
 */

import React, { useState, useEffect } from 'react';
import {
  Users, DoorOpen, HeartHandshake, ClipboardList, Heart, Zap, Settings, Loader2,
} from 'lucide-react';
import AdminUsers from './Users';
import AdminRooms from './AdminRooms';
import PrayerRequests from './PrayerRequests';
import AttendanceSection from './pastoral/AttendanceSection';
import PastoralPeople from './pastoral/PastoralPeople';
import PersonPage from './pastoral/PersonPage';
import CareSection from './pastoral/CareSection';
import SignalsDashboard from './pastoral/signals/SignalsDashboard';
import SignalSettings from './pastoral/signals/SignalSettings';
import type { UnifiedPerson, PersonType } from '@/lib/pastoral-api';
import { listPeople } from '@/lib/pastoral-api';
import { useAuth } from '@/contexts/AuthContext';

export type PeopleTab = 'members' | 'rooms' | 'prayer' | 'attendance' | 'care' | 'signals' | 'signal-settings';

const TABS: { id: PeopleTab; label: string; Icon: React.ElementType }[] = [
  { id: 'members',         label: 'Members',    Icon: Users },
  { id: 'rooms',           label: 'Rooms',      Icon: DoorOpen },
  { id: 'prayer',          label: 'Prayer',     Icon: HeartHandshake },
  { id: 'attendance',      label: 'Attendance', Icon: ClipboardList },
  { id: 'care',            label: 'Care',       Icon: Heart },
  { id: 'signals',         label: 'Signals',    Icon: Zap },
  { id: 'signal-settings', label: 'Settings',   Icon: Settings },
];

type MembersSubView = 'emmaus' | 'all-people';

interface Props {
  activeTab: PeopleTab;
  onTabChange: (tab: PeopleTab) => void;
  /** When set, bypass the tab list and open this person's profile directly. */
  overridePerson?: { personId: string; personType: PersonType; personName?: string };
  /** Called when the user presses back on the overridePerson profile. Defaults to navigating to the members tab. */
  onOverridePersonBack?: () => void;
}

/**
 * Members tab — two sub-views:
 *   Emmaus Accounts → existing AdminUsers (role management, registered users)
 *   All People      → unified PastoralPeople list (Emmaus + attendance-only)
 */
function MembersTab() {
  const [subView, setSubView] = useState<MembersSubView>('all-people');
  const [selectedPerson, setSelectedPerson] = useState<UnifiedPerson | null>(null);
  const [scrollToSignals, setScrollToSignals] = useState(false);

  const handleSelectPerson = (person: UnifiedPerson, hasSignals?: boolean) => {
    setSelectedPerson(person);
    setScrollToSignals(hasSignals ?? false);
  };

  const handleBack = () => {
    setSelectedPerson(null);
    setScrollToSignals(false);
  };

  if (subView === 'all-people' && selectedPerson) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <PersonPage
          person={selectedPerson}
          onBack={handleBack}
          scrollToCareSignals={scrollToSignals}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-tab bar */}
      <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-6 pt-2 pb-0">
        <div className="flex items-center gap-1">
          {([
            { id: 'all-people' as MembersSubView, label: 'All People' },
            { id: 'emmaus'     as MembersSubView, label: 'Emmaus Accounts' },
          ]).map(({ id, label }) => (
            <button
              key={id}
              onClick={() => { setSubView(id); handleBack(); }}
              className={`px-3 py-1.5 text-[12px] font-medium rounded-t-lg border-b-2 transition-colors -mb-px whitespace-nowrap ${
                subView === id
                  ? 'border-teal-600 text-teal-700 bg-white'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {subView === 'emmaus'     && <AdminUsers />}
        {subView === 'all-people' && (
          <PastoralPeople onSelectPerson={handleSelectPerson} />
        )}
      </div>
    </div>
  );
}

export default function People({ activeTab, onTabChange, overridePerson, onOverridePersonBack }: Props) {
  const { user } = useAuth();
  const [signalsSelectedPerson, setSignalsSelectedPerson] = useState<UnifiedPerson | null>(null);

  // Full UnifiedPerson fetched when navigating via overridePerson deep-link.
  // null = still loading; false = fetch done but person not found (fall back to synthetic).
  const [resolvedOverridePerson, setResolvedOverridePerson] = useState<UnifiedPerson | null | false>(null);

  useEffect(() => {
    if (!overridePerson) {
      setResolvedOverridePerson(null);
      return;
    }

    // Reset to "loading" whenever the target identity changes.
    setResolvedOverridePerson(null);

    let cancelled = false;
    const auth = { userId: user?.id ?? '', userRole: user?.role ?? 'admin' };

    listPeople(auth)
      .then(people => {
        if (cancelled) return;
        const found = people.find(
          p => p.id === overridePerson.personId && p.personType === overridePerson.personType,
        );
        // `false` signals "fetch complete, not found" so we can render the synthetic fallback.
        setResolvedOverridePerson(found ?? false);
      })
      .catch(() => {
        if (!cancelled) setResolvedOverridePerson(false);
      });

    return () => { cancelled = true; };
  }, [overridePerson?.personId, overridePerson?.personType, user?.id]);

  // Deep-link from Pastoral Dashboard → open a person directly, bypassing tabs.
  //
  // We defer mounting <PersonPage> until the full record is available because
  // PersonPage latches person.isLinked / person.linkedUserId into local state on
  // first render — switching from a synthetic record to the resolved one after mount
  // would leave those state values stale and corrupt the Administrative Details UI.
  //
  // While the fetch is in flight (resolvedOverridePerson === null) we show a spinner.
  // If the fetch completes without finding the person (=== false) we fall back to the
  // synthetic record so the profile still opens (PersonPage re-fetches section data).
  if (overridePerson) {
    const handleBack = onOverridePersonBack ?? (() => onTabChange('members'));

    // Still fetching.
    if (resolvedOverridePerson === null) {
      return (
        <div className="flex flex-col h-full min-h-0 items-center justify-center gap-2 text-gray-400">
          <Loader2 size={20} className="animate-spin" />
          <span className="text-[13px]">Loading profile…</span>
        </div>
      );
    }

    // Resolved (or fell back to synthetic).
    const syntheticPerson: UnifiedPerson = {
      id: overridePerson.personId,
      sourceId: overridePerson.personId,
      personType: overridePerson.personType,
      fullName: overridePerson.personName ?? 'Unknown',
      email: null,
      phone: null,
      linkedUserId: null,
      isLinked: false,
      subType: overridePerson.personType === 'emmaus_user' ? 'emmaus_user' : 'attendance_only',
      lastAttendanceDate: null,
      lastAttendanceStatus: null,
      churchId: '',
    };
    const personToShow = resolvedOverridePerson || syntheticPerson;

    return (
      <div className="flex flex-col h-full min-h-0">
        <PersonPage
          key={`${personToShow.id}:${personToShow.personType}`}
          person={personToShow}
          onBack={handleBack}
        />
      </div>
    );
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'members':    return <MembersTab />;
      case 'rooms':      return <AdminRooms />;
      case 'prayer':     return <PrayerRequests />;
      case 'attendance': return <AttendanceSection />;
      case 'care':       return <CareSection />;
      case 'signals':
        if (signalsSelectedPerson) {
          return (
            <PersonPage
              person={signalsSelectedPerson}
              onBack={() => setSignalsSelectedPerson(null)}
            />
          );
        }
        return <SignalsDashboard onOpenProfile={setSignalsSelectedPerson} />;
      case 'signal-settings':
        return <SignalSettings />;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Top tab bar */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200">
        <div
          className="flex items-center gap-1 px-6 pt-4 pb-0 overflow-x-auto scrollbar-none"
          role="tablist"
          aria-label="People sections"
        >
          {TABS.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={active}
                onClick={() => onTabChange(id)}
                className={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors -mb-px whitespace-nowrap ${
                  active
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
                }`}
              >
                <Icon size={14} />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content area — must be flex-1 + overflow-hidden so inner lists can scroll */}
      <div className="flex-1 overflow-hidden min-h-0" role="tabpanel">
        {renderContent()}
      </div>
    </div>
  );
}
