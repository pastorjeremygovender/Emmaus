import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useJourney } from '@/contexts/JourneyContext';
import {
  getAccountLifecycle,
  listEmmausAccounts,
  reinstateEmmausAccount,
  removeEmmausAccount,
  type AccountLifecycleEvent,
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
  const [view, setView] = useState<'active' | 'removed'>('active');
  const [removalTarget, setRemovalTarget] = useState<EmmausAccount | null>(null);
  const [removalMode, setRemovalMode] = useState<'retain' | 'permanent'>('retain');
  const [confirmationEmail, setConfirmationEmail] = useState('');
  const [reinstateTarget, setReinstateTarget] = useState<EmmausAccount | null>(null);
  const [history, setHistory] = useState<AccountLifecycleEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);
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
    listEmmausAccounts({ userId: user.id, userRole: user.role }, view)
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
  }, [user?.id, user?.role, view, refreshKey]);

  useEffect(() => {
    if (!selected || selected.accountStatus !== 'removed' || user?.role !== 'superAdmin') {
      setHistory([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    getAccountLifecycle({ userId: user.id, userRole: user.role }, selected.id)
      .then((events) => {
        if (!cancelled) setHistory(events);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => { cancelled = true; };
  }, [selected?.id, selected?.accountStatus, user?.id, user?.role]);

  const journeyName = (id?: string | null) =>
    id ? (journeys.find(j => j.id === id)?.title ?? id) : '—';
  const canManage = user?.role === 'superAdmin';

  const refresh = () => setRefreshKey((key) => key + 1);

  const remove = async () => {
    if (!user || !removalTarget) return;
    setSaving(true);
    setActionError('');
    try {
      await removeEmmausAccount(
        { userId: user.id, userRole: user.role },
        removalTarget.id,
        {
          mode: removalMode,
          ...(removalMode === 'permanent' ? { confirmationEmail } : {}),
        },
      );
      setRemovalTarget(null);
      setSelected(null);
      setConfirmationEmail('');
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not remove this member.');
    } finally {
      setSaving(false);
    }
  };

  const reinstate = async () => {
    if (!user || !reinstateTarget) return;
    setSaving(true);
    setActionError('');
    try {
      await reinstateEmmausAccount(
        { userId: user.id, userRole: user.role },
        reinstateTarget.id,
      );
      setReinstateTarget(null);
      setSelected(null);
      refresh();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not reinstate this member.');
    } finally {
      setSaving(false);
    }
  };

  const openRemoval = (account: EmmausAccount) => {
    setActionError('');
    setRemovalMode('retain');
    setConfirmationEmail('');
    setRemovalTarget(account);
  };

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <PageHeader
        title={view === 'active' ? 'Members' : 'Removed members'}
        subtitle={loading
          ? 'Loading verified accounts…'
          : view === 'active'
            ? `${accounts.length} active verified account${accounts.length === 1 ? '' : 's'}`
            : `${accounts.length} retained account${accounts.length === 1 ? '' : 's'} ready to reinstate`}
      />

      {canManage && (
        <div className="mb-5 flex flex-wrap gap-2" role="tablist" aria-label="Member account status">
          <AdminBtn
            size="sm"
            variant={view === 'active' ? 'primary' : 'secondary'}
            onClick={() => { setView('active'); setSelected(null); setActionError(''); }}
          >
            Active members
          </AdminBtn>
          <AdminBtn
            size="sm"
            variant={view === 'removed' ? 'primary' : 'secondary'}
            onClick={() => { setView('removed'); setSelected(null); setActionError(''); }}
          >
            Removed members
          </AdminBtn>
        </div>
      )}

      {error && (
        <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <AdminBtn size="sm" variant="secondary" onClick={refresh}>
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
                  <p className="text-sm font-medium text-gray-700">
                    {view === 'active' ? 'No active verified Emmaus accounts yet' : 'No removed member accounts'}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {view === 'active'
                      ? 'A member will appear here after their email is verified and their Emmaus account is created.'
                      : 'Members removed while retaining data will appear here until they are reinstated.'}
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
                <div className="flex justify-end gap-1">
                  <AdminBtn size="sm" variant="ghost" onClick={() => setSelected(u)}>Summary</AdminBtn>
                  {canManage && view === 'active' && u.role === 'user' && (
                    <AdminBtn size="sm" variant="danger" onClick={() => openRemoval(u)}>Remove</AdminBtn>
                  )}
                  {canManage && view === 'removed' && (
                    <AdminBtn size="sm" variant="primary" onClick={() => { setActionError(''); setReinstateTarget(u); }}>
                      Reinstate
                    </AdminBtn>
                  )}
                </div>
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

            {selected.accountStatus === 'removed' && (
              <div className="space-y-2 border-t border-gray-100 pt-4">
                <h3 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Account history</h3>
                {historyLoading ? (
                  <p className="text-sm text-gray-400">Loading history…</p>
                ) : history.length === 0 ? (
                  <p className="text-sm text-gray-400">No lifecycle actions recorded yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {history.map((event) => (
                      <li key={event.id} className="text-xs text-gray-600">
                        <span className="font-medium text-gray-800">
                          {event.action === 'removed' ? 'Removed — data retained' : 'Reinstated'}
                        </span>
                        <span className="block text-gray-400">
                          {new Date(event.occurredAt).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2">
              {canManage && selected.accountStatus === 'active' && selected.role === 'user' && (
                <AdminBtn variant="danger" onClick={() => openRemoval(selected)}>Remove member</AdminBtn>
              )}
              {canManage && selected.accountStatus === 'removed' && (
                <AdminBtn variant="primary" onClick={() => { setActionError(''); setReinstateTarget(selected); }}>
                  Reinstate
                </AdminBtn>
              )}
              <AdminBtn variant="secondary" onClick={() => setSelected(null)}>Close</AdminBtn>
            </div>
          </div>
        </div>
      )}

      {removalTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-5" role="dialog" aria-modal="true" aria-labelledby="remove-member-title">
            <div>
              <h2 id="remove-member-title" className="font-semibold text-gray-900 text-[18px]">Remove {removalTarget.preferredName}?</h2>
              <p className="mt-1 text-sm text-gray-500">{removalTarget.email}</p>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-gray-800">Choose what happens to their data</legend>
              <label className={`block rounded-xl border p-4 cursor-pointer ${removalMode === 'retain' ? 'border-teal-600 bg-teal-50/50' : 'border-gray-200'}`}>
                <input className="sr-only" type="radio" name="remove-mode" checked={removalMode === 'retain'} onChange={() => setRemovalMode('retain')} />
                <span className="block text-sm font-semibold text-gray-900">Retain data and remove access</span>
                <span className="mt-1 block text-xs leading-5 text-gray-600">
                  Recommended. The member is signed out and cannot return until reinstated. Their progress, Bible activity, rooms, reflections, and linked care records stay intact.
                </span>
              </label>
              <label className={`block rounded-xl border p-4 cursor-pointer ${removalMode === 'permanent' ? 'border-red-500 bg-red-50/60' : 'border-gray-200'}`}>
                <input className="sr-only" type="radio" name="remove-mode" checked={removalMode === 'permanent'} onChange={() => setRemovalMode('permanent')} />
                <span className="block text-sm font-semibold text-red-800">Delete permanently</span>
                <span className="mt-1 block text-xs leading-5 text-red-700">
                  This removes the member’s account and supported personal Emmaus records. It cannot be undone or reinstated.
                </span>
              </label>
            </fieldset>

            {removalMode === 'permanent' && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
                <label htmlFor="permanent-delete-email" className="block text-sm font-medium text-red-900">
                  Type {removalTarget.email} to confirm permanent deletion
                </label>
                <input
                  id="permanent-delete-email"
                  value={confirmationEmail}
                  onChange={(event) => setConfirmationEmail(event.target.value)}
                  className="w-full rounded-lg border border-red-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-500"
                  autoComplete="off"
                />
              </div>
            )}

            {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <AdminBtn variant="secondary" disabled={saving} onClick={() => setRemovalTarget(null)}>Cancel</AdminBtn>
              <AdminBtn
                variant={removalMode === 'permanent' ? 'danger' : 'primary'}
                disabled={saving || (removalMode === 'permanent' && confirmationEmail.trim().toLowerCase() !== removalTarget.email.toLowerCase())}
                onClick={remove}
              >
                {saving ? 'Working…' : removalMode === 'permanent' ? 'Delete permanently' : 'Remove and retain data'}
              </AdminBtn>
            </div>
          </div>
        </div>
      )}

      {reinstateTarget && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5" role="dialog" aria-modal="true" aria-labelledby="reinstate-member-title">
            <div>
              <h2 id="reinstate-member-title" className="font-semibold text-gray-900 text-[18px]">Reinstate {reinstateTarget.preferredName}?</h2>
              <p className="mt-2 text-sm leading-6 text-gray-600">
                Their original Emmaus account will be reactivated. All preserved journeys, devotionals, Bible activity, rooms, reflections, and linked records will be available again.
              </p>
            </div>
            {actionError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>}
            <div className="flex justify-end gap-2">
              <AdminBtn variant="secondary" disabled={saving} onClick={() => setReinstateTarget(null)}>Cancel</AdminBtn>
              <AdminBtn variant="primary" disabled={saving} onClick={reinstate}>
                {saving ? 'Reinstating…' : 'Reinstate member'}
              </AdminBtn>
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
