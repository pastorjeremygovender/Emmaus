/**
 * People — discipleship hub for Members, Rooms, Prayer, Attendance, and Care.
 *
 * Each subsection reuses the existing component without any re-implementation.
 * This component is purely a navigation shell.
 */

import React from 'react';
import {
  Users, DoorOpen, HeartHandshake, ClipboardList, Heart,
} from 'lucide-react';
import AdminUsers from './Users';
import AdminRooms from './AdminRooms';
import PrayerRequests from './PrayerRequests';

export type PeopleTab = 'members' | 'rooms' | 'prayer' | 'attendance' | 'care';

const TABS: { id: PeopleTab; label: string; Icon: React.ElementType }[] = [
  { id: 'members',    label: 'Members',    Icon: Users },
  { id: 'rooms',      label: 'Rooms',      Icon: DoorOpen },
  { id: 'prayer',     label: 'Prayer',     Icon: HeartHandshake },
  { id: 'attendance', label: 'Attendance', Icon: ClipboardList },
  { id: 'care',       label: 'Care',       Icon: Heart },
];

interface Props {
  activeTab: PeopleTab;
  onTabChange: (tab: PeopleTab) => void;
}

function AttendancePlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-28 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mb-5">
        <ClipboardList size={26} className="text-teal-400" />
      </div>
      <h2 className="text-[17px] font-semibold text-gray-900 mb-2">Attendance</h2>
      <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
        QR check-in, guests, households and attendance reports will appear here.
      </p>
      <span className="mt-4 inline-block px-3 py-1 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">
        Coming soon
      </span>
    </div>
  );
}

function CarePlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-28 px-6 text-center">
      <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-5">
        <Heart size={26} className="text-rose-400" />
      </div>
      <h2 className="text-[17px] font-semibold text-gray-900 mb-2">Care</h2>
      <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
        Pastoral follow-up, people requesting prayer, journey inactivity alerts, and care reminders will appear here.
      </p>
      <span className="mt-4 inline-block px-3 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-medium">
        Coming soon
      </span>
    </div>
  );
}

export default function People({ activeTab, onTabChange }: Props) {
  const renderContent = () => {
    switch (activeTab) {
      case 'members':    return <AdminUsers />;
      case 'rooms':      return <AdminRooms />;
      case 'prayer':     return <PrayerRequests />;
      case 'attendance': return <AttendancePlaceholder />;
      case 'care':       return <CarePlaceholder />;
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tab bar */}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto" role="tabpanel">
        {renderContent()}
      </div>
    </div>
  );
}
