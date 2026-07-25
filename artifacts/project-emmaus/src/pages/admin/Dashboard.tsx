import React from 'react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAdmin } from '@/contexts/AdminContext';
import { DEMO_RECENT_ACTIVITY } from '@/lib/admin-demo-data';
import { Users, HeartHandshake, DoorOpen, ClipboardList, BookOpen, ArrowRight } from 'lucide-react';
import type { AdminNav } from '../Admin';

type Props = { onNavigate: (nav: AdminNav) => void };

function StatCard({
  label,
  value,
  sub,
  onClick,
}: {
  label: string;
  value: number | string;
  sub?: string;
  onClick?: () => void;
}) {
  const inner = (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1 h-full">
      <div className="text-[28px] font-semibold text-gray-900">{value}</div>
      <div className="text-sm font-medium text-gray-700">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="text-left w-full hover:ring-2 hover:ring-teal-200 rounded-xl transition-shadow focus:outline-none focus:ring-2 focus:ring-teal-300"
      >
        {inner}
      </button>
    );
  }
  return inner;
}

function QuickLink({
  Icon,
  label,
  description,
  onClick,
}: {
  Icon: React.ElementType;
  label: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-4 bg-white rounded-xl border border-gray-200 px-5 py-4 w-full text-left hover:border-teal-200 hover:bg-teal-50/30 transition-colors focus:outline-none focus:ring-2 focus:ring-teal-300"
    >
      <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center flex-shrink-0">
        <Icon size={16} className="text-teal-600" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        <div className="text-xs text-gray-400 mt-0.5 truncate">{description}</div>
      </div>
      <ArrowRight size={14} className="text-gray-300 flex-shrink-0" />
    </button>
  );
}

const ACTIVITY_ICONS: Record<string, string> = {
  progress: '🚶',
  prayer:   '🙏',
  published:'✅',
  user:     '👤',
  journey:  '📖',
};

export default function AdminDashboard({ onNavigate }: Props) {
  const { journeys, progress } = useJourney();
  const { prayerRequests, adminUsers } = useAdmin();

  const publishedJourneys = journeys.filter(j => j.status === 'Published').length;
  const draftCompanions = journeys.filter(
    j => j.journeyType === 'companion' && j.status !== 'Published' && j.status !== 'Archived'
  ).length;
  const openPrayers = prayerRequests.filter(p => p.status === 'new' || p.status === 'acknowledged').length;
  const totalUsers = adminUsers.length;

  const oneWeekAgo = Date.now() - 7 * 86400000;
  const activeUsers = adminUsers.filter(u => new Date(u.lastActiveAt).getTime() > oneWeekAgo).length;
  const completions = Object.values(progress).reduce(
    (sum, p) => sum + (p.lastCompletedAt && new Date(p.lastCompletedAt).getTime() > oneWeekAgo ? 1 : 0),
    0
  );

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-[22px] font-semibold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-400 mt-0.5">Overview of Emmaus activity.</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
        <StatCard
          label="Members"
          value={totalUsers}
          onClick={() => onNavigate({ section: 'people', peopleTab: 'members' })}
        />
        <StatCard
          label="Active last 7 days"
          value={activeUsers}
          onClick={() => onNavigate({ section: 'people', peopleTab: 'members' })}
        />
        <StatCard
          label="Journey completions"
          value={completions}
          sub="Last 7 days"
          onClick={() => onNavigate({ section: 'content-studio' })}
        />
        <StatCard
          label="Open prayer requests"
          value={openPrayers}
          onClick={() => onNavigate({ section: 'people', peopleTab: 'prayer' })}
        />
        <StatCard
          label="Companion drafts awaiting review"
          value={draftCompanions}
          onClick={() => onNavigate({ section: 'content-studio' })}
        />
        <StatCard
          label="Published journeys"
          value={publishedJourneys}
          onClick={() => onNavigate({ section: 'content-studio' })}
        />
      </div>

      {/* Quick links */}
      <section className="mb-10">
        <h2 className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Quick Links
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <QuickLink
            Icon={Users}
            label="Members"
            description="Profiles, journey progress, roles"
            onClick={() => onNavigate({ section: 'people', peopleTab: 'members' })}
          />
          <QuickLink
            Icon={HeartHandshake}
            label="Prayer"
            description="Open requests, pastoral workflow"
            onClick={() => onNavigate({ section: 'people', peopleTab: 'prayer' })}
          />
          <QuickLink
            Icon={DoorOpen}
            label="Rooms"
            description="Groups, invitations, membership"
            onClick={() => onNavigate({ section: 'people', peopleTab: 'rooms' })}
          />
          <QuickLink
            Icon={ClipboardList}
            label="Attendance"
            description="QR check-in and reports"
            onClick={() => onNavigate({ section: 'people', peopleTab: 'attendance' })}
          />
          <QuickLink
            Icon={BookOpen}
            label="Content Studio"
            description="Journeys, sermons, media"
            onClick={() => onNavigate({ section: 'content-studio' })}
          />
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <h2 className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Recent Activity
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {DEMO_RECENT_ACTIVITY.map(item => (
            <div key={item.id} className="flex items-start gap-3 px-5 py-4">
              <span className="text-[18px] mt-0.5 flex-shrink-0">
                {ACTIVITY_ICONS[item.type] ?? '📌'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700">{item.text}</p>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{item.time}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
