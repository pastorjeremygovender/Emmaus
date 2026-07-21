import React from 'react';
import { useMediaStudio } from '@/contexts/MediaStudioContext';
import { StatusBadge, AdminBtn, AdminTable, Th, Td } from '../shared';
import type { MediaKit } from '@/lib/media-studio-types';

type Props = {
  onCreateKit: () => void;
  onOpenKit: (kitId: string) => void;
  onCalendar: () => void;
};

function statCount(kits: MediaKit[], status: string) {
  return kits.filter(k => k.status === status).length;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MediaStudioDashboard({ onCreateKit, onOpenKit, onCalendar }: Props) {
  const { kits, assets } = useMediaStudio();

  // Upcoming scheduled assets (those with a scheduledDay or scheduledAt)
  const scheduled = assets
    .filter(a => a.status === 'Scheduled' || a.scheduledDay)
    .slice(0, 5);

  const totalAssets = assets.length;
  const draftAssets = assets.filter(a => a.status === 'Draft').length;
  const approvedAssets = assets.filter(a => a.status === 'Approved').length;
  const publishedAssets = assets.filter(a => a.status === 'Published').length;

  const recentKits = [...kits].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">🎬 Media Studio</h1>
          <p className="text-sm text-gray-500 mt-1">
            One sermon. An entire week of ministry content.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <AdminBtn variant="secondary" onClick={onCalendar}>📅 Media Calendar</AdminBtn>
          <AdminBtn variant="primary" onClick={onCreateKit}>✨ Create Media Kit</AdminBtn>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Kits',     value: kits.length,      color: 'text-gray-900' },
          { label: 'Draft',          value: statCount(kits, 'Draft'),         color: 'text-gray-600' },
          { label: 'Pastoral Review',value: statCount(kits, 'Pastoral Review'), color: 'text-amber-700' },
          { label: 'Approved',       value: statCount(kits, 'Approved'),      color: 'text-blue-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-5 py-4">
            <p className={`text-[26px] font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5 uppercase tracking-wide">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Asset status row */}
      <div className="grid grid-cols-3 md:grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total Assets',    value: totalAssets,     color: 'text-gray-700' },
          { label: 'Assets: Draft',   value: draftAssets,     color: 'text-gray-500' },
          { label: 'Assets: Approved',value: approvedAssets,  color: 'text-blue-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className={`text-[22px] font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Recent Media Kits */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Media Kits</h2>
        {recentKits.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <p className="text-gray-400 text-sm mb-4">No media kits yet.</p>
            <AdminBtn variant="primary" onClick={onCreateKit}>✨ Create your first Media Kit</AdminBtn>
          </div>
        ) : (
          <AdminTable>
            <thead>
              <tr>
                <Th>Kit Title</Th>
                <Th>Source</Th>
                <Th>Assets</Th>
                <Th>Status</Th>
                <Th>Updated</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {recentKits.map(kit => (
                <tr key={kit.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                  <Td>
                    <button
                      onClick={() => onOpenKit(kit.id)}
                      className="text-teal-700 font-medium hover:underline text-left"
                    >
                      {kit.title}
                    </button>
                  </Td>
                  <Td>
                    <span className="capitalize text-gray-500">{kit.sourceType}</span>
                    <p className="text-[11px] text-gray-400 truncate max-w-[180px]">{kit.sourceTitle}</p>
                  </Td>
                  <Td className="text-gray-500">{kit.assetIds.length}</Td>
                  <Td><StatusBadge status={kit.status} /></Td>
                  <Td className="text-gray-400 text-[12px]">{fmtDate(kit.updatedAt)}</Td>
                  <Td>
                    <AdminBtn size="sm" variant="ghost" onClick={() => onOpenKit(kit.id)}>Open</AdminBtn>
                  </Td>
                </tr>
              ))}
            </tbody>
          </AdminTable>
        )}
      </div>

      {/* Upcoming scheduled */}
      {scheduled.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Upcoming Scheduled Posts</h2>
          <div className="space-y-2">
            {scheduled.map(asset => {
              const kit = kits.find(k => k.assetIds.includes(asset.id));
              return (
                <div key={asset.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-purple-600 font-semibold text-[12px] flex-shrink-0">
                      {asset.scheduledDay ?? '—'}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 font-medium capitalize">
                        {asset.type.replace(/-/g, ' ')}
                      </p>
                      {kit && (
                        <p className="text-[11px] text-gray-400 truncate">{kit.sourceTitle}</p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={asset.status} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-[11px] text-gray-300 mt-10 text-center">
        Nothing is published automatically. All content follows Draft → Pastoral Review → Approved → Scheduled → Published.
      </p>
    </div>
  );
}
