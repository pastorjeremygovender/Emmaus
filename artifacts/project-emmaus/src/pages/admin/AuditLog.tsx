import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { PageHeader } from './shared';
import { RefreshCw, ChevronDown } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string;
  content_type: string;
  content_id: string;
  action: string;
  performed_by: string;
  performed_at: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CONTENT_TYPE_LABELS: Record<string, string> = {
  journey: 'Journey',
  journey_step: 'Step',
  devotional_series: 'Devotional Series',
  devotional_entry: 'Devotional Entry',
  sermon_companion: 'Sermon Companion',
  sermon_companion_entry: 'Companion Entry',
  room: 'Room',
};

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  create:           { label: 'Created',           color: 'bg-green-100 text-green-800' },
  edit:             { label: 'Edited',             color: 'bg-blue-100 text-blue-800' },
  publish:          { label: 'Published',          color: 'bg-teal-100 text-teal-800' },
  unpublish:        { label: 'Unpublished',        color: 'bg-yellow-100 text-yellow-800' },
  archive:          { label: 'Archived',           color: 'bg-gray-100 text-gray-700' },
  delete:           { label: 'Deleted',            color: 'bg-orange-100 text-orange-800' },
  permanent_delete: { label: 'Permanently Deleted', color: 'bg-red-100 text-red-800' },
  restore:          { label: 'Restored',           color: 'bg-purple-100 text-purple-800' },
};

const ALL_TYPES = [
  { value: '', label: 'All types' },
  { value: 'journey', label: 'Journeys' },
  { value: 'journey_step', label: 'Steps' },
  { value: 'devotional_series', label: 'Devotional Series' },
  { value: 'devotional_entry', label: 'Devotional Entries' },
  { value: 'sermon_companion', label: 'Sermon Companions' },
  { value: 'sermon_companion_entry', label: 'Companion Entries' },
  { value: 'room', label: 'Rooms' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatAbsolute(iso: string): string {
  return new Date(iso).toLocaleString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function getContentTitle(entry: AuditEntry): string {
  const prev = entry.previous_state;
  const next = entry.new_state;
  const title = (next as { title?: string } | null)?.title
    ?? (prev as { title?: string } | null)?.title;
  return title ? String(title) : entry.content_id;
}

// ─── Detail Drawer ─────────────────────────────────────────────────────────

function DetailDrawer({
  entry,
  onClose,
}: {
  entry: AuditEntry;
  onClose: () => void;
}) {
  const action = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'bg-gray-100 text-gray-700' };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white shadow-xl flex flex-col h-full border-l border-gray-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-200 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-gray-900 truncate">
              {getContentTitle(entry)}
            </div>
            <div className="text-[12px] text-gray-500 mt-0.5">
              {CONTENT_TYPE_LABELS[entry.content_type] ?? entry.content_type} · {entry.content_id}
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1 rounded hover:bg-gray-100 text-gray-400"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Metadata */}
        <div className="px-5 py-4 border-b border-gray-100 space-y-2 text-[13px]">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${action.color}`}>
              {action.label}
            </span>
          </div>
          <div className="text-gray-600">
            <span className="font-medium">When:</span>{' '}
            {formatAbsolute(entry.performed_at)}
          </div>
          <div className="text-gray-600">
            <span className="font-medium">By:</span>{' '}
            <span className="font-mono text-[11px]">{entry.performed_by}</span>
          </div>
        </div>

        {/* State diff */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {entry.previous_state && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Previous State
              </div>
              <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto whitespace-pre-wrap text-gray-700">
                {JSON.stringify(entry.previous_state, null, 2)}
              </pre>
            </div>
          )}
          {entry.new_state && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                New State
              </div>
              <pre className="text-[11px] bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto whitespace-pre-wrap text-gray-700">
                {JSON.stringify(entry.new_state, null, 2)}
              </pre>
            </div>
          )}
          {!entry.previous_state && !entry.new_state && (
            <p className="text-[13px] text-gray-400">No state snapshot recorded for this event.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AuditLog() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('');
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const BASE = import.meta.env.BASE_URL ?? '/';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('contentType', typeFilter);

      const res = await fetch(
        `${BASE}api/admin/audit-log${params.size > 0 ? '?' + params.toString() : ''}`,
        {
          headers: {
            'X-User-Id': user?.id ?? '',
            'X-User-Role': user?.role ?? 'admin',
          },
        },
      );
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json() as { entries: AuditEntry[] };
      setEntries(data.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [BASE, typeFilter, user]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="max-w-5xl">
      <div className="p-6 lg:p-8 space-y-6">
        <PageHeader
          title="Audit Log"
          action={
            <button
              onClick={() => void load()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          }
        />

        {/* Filter bar */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-gray-200 text-[13px] text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {ALL_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
          {entries.length > 0 && !loading && (
            <span className="text-[12px] text-gray-400">
              {entries.length} event{entries.length !== 1 ? 's' : ''} (most recent first)
            </span>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading && (
            <div className="p-8 text-center text-[13px] text-gray-400">Loading audit log…</div>
          )}
          {error && (
            <div className="p-8 text-center text-[13px] text-red-500">{error}</div>
          )}
          {!loading && !error && entries.length === 0 && (
            <div className="p-8 text-center text-[13px] text-gray-400">
              No audit events found. Admin content changes will appear here.
            </div>
          )}
          {!loading && !error && entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wide w-36">When</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wide">Content</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wide w-28">Type</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wide w-36">Action</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-[11px] uppercase tracking-wide w-40">By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {entries.map(entry => {
                    const action = ACTION_LABELS[entry.action] ?? { label: entry.action, color: 'bg-gray-100 text-gray-700' };
                    return (
                      <tr
                        key={entry.id}
                        onClick={() => setSelected(entry)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap" title={formatAbsolute(entry.performed_at)}>
                          {formatRelative(entry.performed_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900 truncate max-w-xs">
                            {getContentTitle(entry)}
                          </div>
                          <div className="text-[11px] text-gray-400 font-mono truncate max-w-xs">
                            {entry.content_id}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {CONTENT_TYPE_LABELS[entry.content_type] ?? entry.content_type}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium ${action.color}`}>
                            {action.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 font-mono text-[11px] truncate max-w-[160px]">
                          {entry.performed_by}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <p className="text-[11px] text-gray-400 text-center">
          Showing up to 200 most recent events · Click any row for details
        </p>
      </div>

      {selected && (
        <DetailDrawer
          entry={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
