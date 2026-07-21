import React from 'react';
import { useJourney } from '@/contexts/JourneyContext';
import { useAdmin } from '@/contexts/AdminContext';
import { DEMO_RECENT_ACTIVITY } from '@/lib/admin-demo-data';
import type { AdminNav } from '../Admin';

type Props = { onNavigate: (nav: AdminNav) => void };

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1">
      <div className="text-[28px] font-semibold text-gray-900">{value}</div>
      <div className="text-sm font-medium text-gray-700">{label}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}

const ACTIVITY_ICONS: Record<string, string> = {
  progress: '🚶',
  prayer: '🙏',
  published: '✅',
  user: '👤',
  journey: '📖',
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

  // Count completions in last 7 days (demo: estimate from progress)
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
        <StatCard label="Total users" value={totalUsers} />
        <StatCard label="Active last 7 days" value={activeUsers} />
        <StatCard label="Journey completions" value={completions} sub="Last 7 days" />
        <StatCard label="Open prayer requests" value={openPrayers} />
        <StatCard
          label="Companion drafts awaiting review"
          value={draftCompanions}
        />
        <StatCard label="Published journeys" value={publishedJourneys} />
      </div>

      {/* Recent activity */}
      <section>
        <h2 className="text-[13px] font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Recent Activity
        </h2>
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {DEMO_RECENT_ACTIVITY.map(item => (
            <div key={item.id} className="flex items-start gap-3 px-5 py-4">
              <span className="text-[18px] mt-0.5 flex-shrink-0">{ACTIVITY_ICONS[item.type] ?? '📌'}</span>
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
