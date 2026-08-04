/**
 * People — discipleship hub for Members, Rooms, Prayer, Attendance, and Care.
 *
 * Checkpoint 1: Attendance tab is live (Meeting Types, Sessions, Register).
 *               Members tab now has a "All People" sub-view backed by the
 *               pastoral API alongside the existing Emmaus Accounts view.
 */

import React, { useState } from 'react';
import {
  Users, DoorOpen, HeartHandshake, ClipboardList, Heart,
} from 'lucide-react';
import AdminUsers from './Users';
import AdminRooms from './AdminRooms';
import PrayerRequests from './PrayerRequests';
import AttendanceSection from './pastoral/AttendanceSection';
import PastoralPeople from './pastoral/PastoralPeople';
import PersonPage from './pastoral/PersonPage';
import type { UnifiedPerson } from '@/lib/pastoral-api';

export type PeopleTab = 'members' | 'rooms' | 'prayer' | 'attendance' | 'care';

const TABS: { id: PeopleTab; label: string; Icon: React.ElementType }[] = [
  { id: 'members',    label: 'Members',    Icon: Users },
  { id: 'rooms',      label: 'Rooms',      Icon: DoorOpen },
  { id: 'prayer',     label: 'Prayer',     Icon: HeartHandshake },
  { id: 'attendance', label: 'Attendance', Icon: ClipboardList },
  { id: 'care',       label: 'Care',       Icon: Heart },
];

type MembersSubView = 'emmaus' | 'all-people';

interface Props {
  activeTab: PeopleTab;
  onTabChange: (tab: PeopleTab) => void;
}

function CarePlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-28 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-5">
        <Heart size={26} className="text-rose-400" />
      </div>
      <h2 className="text-[17px] font-semibold text-gray-900 mb-2">Pastoral Care</h2>
      <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
        Care signals, pastoral follow-up, inactivity alerts, and prayer assignment will appear here.
      </p>
      <span className="mt-4 inline-block px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-medium">
        Checkpoint 2
      </span>
    </div>
  );
}

/**
 * Members tab — two sub-views:
 *   Emmaus Accounts → existing AdminUsers (role management, registered users)
 *   All People      → unified PastoralPeople list (Emmaus + attendance-only)
 */
function MembersTab() {
  const [subView, setSubView] = useState<MembersSubView>('all-people');
  const [selectedPerson, setSelectedPerson] = useState<UnifiedPerson | null>(null);

  if (subView === 'all-people' && selectedPerson) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <PersonPage
          person={selectedPerson}
          onBack={() => setSelectedPerson(null)}
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
              onClick={() => { setSubView(id); setSelectedPerson(null); }}
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
          <PastoralPeople onSelectPerson={setSelectedPerson} />
        )}
      </div>
    </div>
  );
}

export default function People({ activeTab, onTabChange }: Props) {
  const renderContent = () => {
    switch (activeTab) {
      case 'members':    return <MembersTab />;
      case 'rooms':      return <AdminRooms />;
      case 'prayer':     return <PrayerRequests />;
      case 'attendance': return <AttendanceSection />;
      case 'care':       return <CarePlaceholder />;
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
