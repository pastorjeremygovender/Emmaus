import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import {
  listEmmausAccounts,
  type EmmausAccount,
} from '@/lib/pastoral-api';
import { AdminTable, Th, Td, PageHeader, AdminBtn } from './shared';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export default function AdminUsers() {
  const { user } = useAuth();
  const { journeys } = useJourney();
  const [accounts, setAccounts] = useState<EmmausAccount[]>([]);
  const [selected, setSelected] = useState<EmmausAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    listEmmausAccounts({ userId: user.id, userRole: user.role })
      .then((nextAccounts) => {
        if (!cancelled) setAccounts(nextAccounts);
      })
      .catch((err) => {
        if (!cancelled) {
          setAccounts([]);
          setError(err instanceof Error ? err.message : 'Could not load Emmaus accounts.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, refreshKey]);

  const journeyName = (id?: string | null) =>
    id ? (journeys.find(j => j.id === id)?.title ?? id) : '—';

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <PageHeader
        title="Members"
        subtitle={loading ? 'Loading verified accounts…' : `${accounts.length} verified account${accounts.length === 1 ? '' : 's'}`}
      />

      {error && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <AdminBtn size="sm" variant="secondary" onClick={() => setRefreshKey((key) => key + 1)}>
            Try again
          </AdminBtn>
        </div>
      )}

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
          {!loading && !error && accounts.length === 0 && (
            <tr>
              <Td colSpan={8}>
                <div className="py-8 text-center">
                  <p className="text-sm font-medium text-gray-700">No verified Emmaus accounts yet</p>
                  <p className="mt-1 text-xs text-gray-400">
                    A member will appear here after their email is verified and their Emmaus account is created.
                  </p>
                </div>
              </Td>
            </tr>
          )}
          {accounts.map(u => (
            <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
              <Td><span className="font-medium text-gray-900">{u.preferredName}</span></Td>
              <Td><span className="text-gray-500 text-xs">{u.email}</span></Td>
              <Td>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  u.role === 'superAdmin'
                    ? 'bg-purple-100 text-purple-800'
                    : u.role === 'admin'
                      ? 'bg-teal-100 text-teal-800'
                      : 'bg-gray-100 text-gray-600'
                }`}>
                  {u.role}
                </span>
              </Td>
              <Td>
                <span className="text-sm text-gray-600 max-w-[160px] truncate block">
                  {u.currentJourneyTitle ?? journeyName(u.currentJourneyId)}
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
              <SummaryCard label="Reflections saved" value={String(selected.reflectionCount)} />
              <SummaryCard label="Joined" value={formatDate(selected.joinedAt)} />
            </div>

            <div className="space-y-2">
              <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Active Journey</h3>
              <p className="text-sm text-gray-700">
                {selected.currentJourneyTitle ?? journeyName(selected.currentJourneyId)}
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
