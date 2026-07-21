import React, { useState } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { useJourney } from '@/contexts/JourneyContext';
import { AdminUser } from '@/lib/admin-demo-data';
import { AdminTable, Th, Td, PageHeader, AdminBtn } from './shared';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function AdminUsers() {
  const { adminUsers } = useAdmin();
  const { journeys } = useJourney();
  const [selected, setSelected] = useState<AdminUser | null>(null);

  const journeyName = (id?: string) => id ? (journeys.find(j => j.id === id)?.title ?? id) : '—';

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <PageHeader title="Users" subtitle={`${adminUsers.length} accounts`} />

      <AdminTable>
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Role</Th>
            <Th>Current journey</Th>
            <Th>Day</Th>
            <Th>Walking</Th>
            <Th>Last active</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {adminUsers.map(u => (
            <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
              <Td><span className="font-medium text-gray-900">{u.preferredName}</span></Td>
              <Td><span className="text-gray-500 text-xs">{u.email}</span></Td>
              <Td>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  u.role === 'admin' ? 'bg-teal-100 text-teal-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {u.role}
                </span>
              </Td>
              <Td>
                <span className="text-sm text-gray-600 max-w-[160px] truncate block">
                  {journeyName(u.currentJourneyId)}
                </span>
              </Td>
              <Td>{u.currentDay ?? '—'}</Td>
              <Td>
                {u.daysWalking === 1 ? '1 day' : `${u.daysWalking} days`}
              </Td>
              <Td>
                <span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(u.lastActiveAt)}</span>
              </Td>
              <Td className="text-right">
                <AdminBtn size="sm" variant="ghost" onClick={() => setSelected(u)}>Summary</AdminBtn>
              </Td>
            </tr>
          ))}
        </tbody>
      </AdminTable>

      {/* User summary modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-gray-900 text-[17px]">{selected.preferredName}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{selected.email}</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SummaryCard label="Days walking" value={String(selected.daysWalking)} />
              <SummaryCard label="Completed journeys" value={String(selected.completedJourneys.length)} />
              <SummaryCard label="Prayer requests" value={String(selected.prayerRequestCount)} />
              <SummaryCard label="Reflections saved" value={String(selected.reflectionCount)} />
            </div>

            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Active Journey</h3>
              <p className="text-sm text-gray-700">
                {journeyName(selected.currentJourneyId)}
                {selected.currentDay ? ` — Day ${selected.currentDay}` : ''}
              </p>
            </div>

            {selected.completedJourneys.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Completed Journeys</h3>
                <ul className="space-y-1">
                  {selected.completedJourneys.map(id => (
                    <li key={id} className="text-sm text-gray-700">✓ {journeyName(id)}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-xs text-gray-400 pt-1">
              Last active: {new Date(selected.lastActiveAt).toLocaleString()}
            </div>

            <div className="flex justify-end">
              <AdminBtn variant="secondary" onClick={() => setSelected(null)}>Close</AdminBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 space-y-1">
      <div className="text-[22px] font-semibold text-gray-900">{value}</div>
      <div className="text-xs text-gray-400">{label}</div>
    </div>
  );
}
