/**
 * AttendanceSection.tsx — Attendance tab shell with Meeting Types / Sessions / Register sub-views.
 */

import React, { useState } from 'react';
import { Settings2, CalendarDays, ShieldCheck } from 'lucide-react';
import MeetingTypes from './MeetingTypes';
import Sessions from './Sessions';
import AttendanceRegister from './AttendanceRegister';
import PastoralAuditLog from './PastoralAuditLog';
import type { MeetingSession } from '@/lib/pastoral-api';

type SubView = 'types' | 'sessions' | 'register' | 'audit';

export default function AttendanceSection() {
  const [subView, setSubView]             = useState<SubView>('sessions');
  const [activeSession, setActiveSession] = useState<MeetingSession | null>(null);

  if (subView === 'register' && activeSession) {
    return (
      <AttendanceRegister
        session={activeSession}
        onBack={() => { setSubView('sessions'); setActiveSession(null); }}
      />
    );
  }

  const tabs: { id: SubView; label: string; Icon: React.ElementType }[] = [
    { id: 'sessions', label: 'Sessions',      Icon: CalendarDays },
    { id: 'types',    label: 'Meeting Types', Icon: Settings2 },
    { id: 'audit',    label: 'Audit Log',     Icon: ShieldCheck },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sub-tabs */}
      <div className="shrink-0 border-b border-gray-200 bg-white px-6 pt-3 pb-0">
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setSubView(id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium border-b-2 whitespace-nowrap transition-colors -mb-px ${
                subView === id
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
              }`}>
              <Icon size={13} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {subView === 'types'    && <MeetingTypes />}
        {subView === 'audit'    && <PastoralAuditLog />}
        {subView === 'sessions' && (
          <Sessions
            onOpenRegister={(session) => {
              setActiveSession(session);
              setSubView('register');
            }}
          />
        )}
      </div>
    </div>
  );
}
