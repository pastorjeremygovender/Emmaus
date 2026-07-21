import React, { useState } from 'react';
import { useMediaStudio } from '@/contexts/MediaStudioContext';
import { computeKitStatus } from '@/lib/media-studio-types';
import { StatusBadge, AdminBtn, AdminTable, Th, Td, ConfirmDialog } from '../shared';

type Props = {
  onCreateKit: () => void;
  onOpenKit: (kitId: string) => void;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function MediaStudioDashboard({ onCreateKit, onOpenKit }: Props) {
  const { kits, assets, resetDemoData } = useMediaStudio();
  const [confirmReset, setConfirmReset] = useState(false);

  const sortedKits = [...kits].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-[22px] font-semibold text-gray-900">🎬 Media Studio</h1>
          <p className="text-sm text-gray-500 mt-1">
            One sermon. A week of ministry content. Nothing publishes automatically.
          </p>
        </div>
        <AdminBtn variant="primary" onClick={onCreateKit}>✨ Create Media Kit</AdminBtn>
      </div>

      {/* Kit list */}
      {sortedKits.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-gray-400 text-sm mb-4">No media kits yet.</p>
          <AdminBtn variant="primary" onClick={onCreateKit}>✨ Create your first Media Kit</AdminBtn>
        </div>
      ) : (
        <AdminTable>
          <thead>
            <tr>
              <Th>Sermon</Th>
              <Th>Source</Th>
              <Th>Assets</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {sortedKits.map(kit => {
              const kitAssets = assets.filter(a => a.kitId === kit.id);
              const derived = computeKitStatus(kitAssets, kit.status);
              return (
                <tr key={kit.id} className="border-t border-gray-50 hover:bg-gray-50/60 transition-colors">
                  <Td>
                    <button
                      onClick={() => onOpenKit(kit.id)}
                      className="text-teal-700 font-medium hover:underline text-left"
                    >
                      {kit.sourceTitle}
                      {kit.version > 1 && (
                        <span className="ml-2 text-[11px] text-gray-400 font-normal">v{kit.version}</span>
                      )}
                    </button>
                    {kit.sourceScripture && (
                      <p className="text-[11px] text-gray-400 mt-0.5">{kit.sourceScripture}</p>
                    )}
                  </Td>
                  <Td>
                    <span className="capitalize text-gray-500 text-sm">{kit.sourceType.replace(/-/g, ' ')}</span>
                  </Td>
                  <Td className="text-gray-500 text-sm">{kit.assetIds.length}</Td>
                  <Td><StatusBadge status={derived} /></Td>
                  <Td className="text-gray-400 text-[12px]">{fmtDate(kit.updatedAt)}</Td>
                  <Td>
                    <AdminBtn size="sm" variant="ghost" onClick={() => onOpenKit(kit.id)}>Open</AdminBtn>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </AdminTable>
      )}

      {/* Reset demo data */}
      <div className="mt-10 pt-8 border-t border-gray-100">
        <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">Demo</p>
        <p className="text-sm text-gray-400 mb-3">
          Remove all media kits and assets. Sermons and journeys are not affected.
        </p>
        <AdminBtn variant="secondary" onClick={() => setConfirmReset(true)}>
          Reset Media Studio Demo Data
        </AdminBtn>
      </div>

      {confirmReset && (
        <ConfirmDialog
          title="Reset Media Studio Demo Data?"
          message="All media kits and assets will be permanently removed. Sermons and journeys are not affected. This cannot be undone."
          confirmLabel="Reset"
          danger
          onConfirm={() => { resetDemoData(); setConfirmReset(false); }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
}
