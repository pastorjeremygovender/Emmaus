import React, { useState } from 'react';
import { useJourney } from '@/contexts/JourneyContext';
import { Plus, Eye, Pencil, Archive, Copy } from 'lucide-react';
import { StatusBadge, AdminBtn, AdminTable, Th, Td, ConfirmDialog, PageHeader } from './shared';
import type { Journey } from '@/contexts/JourneyContext';

type Props = {
  onEdit: (id: string) => void;
  onNew: () => void;
  onPreview: (id: string, day: number) => void;
};

function typeLabel(t: string) {
  return t === 'companion' ? 'Companion' : 'Core';
}

export default function JourneysList({ onEdit, onNew, onPreview }: Props) {
  const { journeys, addJourney, updateJourney } = useJourney();
  const [archiveTarget, setArchiveTarget] = useState<Journey | null>(null);

  const handleArchive = (j: Journey) => {
    updateJourney({ ...j, status: 'Archived' });
    setArchiveTarget(null);
  };

  const handleDuplicate = (j: Journey) => {
    const newId = `${j.id}-copy-${Date.now()}`;
    addJourney({
      ...j,
      id: newId,
      title: `${j.title} (Copy)`,
      status: 'Draft',
      publishedAt: undefined,
    });
  };

  const sorted = [...journeys].sort((a, b) => {
    const order: Record<string, number> = { Published: 0, Approved: 1, 'Pastoral Review': 2, Draft: 3, Archived: 4 };
    return (order[a.status] ?? 5) - (order[b.status] ?? 5);
  });

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <PageHeader
        title="Journeys"
        subtitle={`${journeys.filter(j => j.status === 'Published').length} published`}
        action={
          <AdminBtn onClick={onNew} variant="primary">
            <Plus size={15} /> New Journey
          </AdminBtn>
        }
      />

      <AdminTable>
        <thead>
          <tr>
            <Th>Title</Th>
            <Th>Type</Th>
            <Th>Days</Th>
            <Th>Status</Th>
            <Th>Last updated</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sorted.map(j => (
            <tr key={j.id} className={`hover:bg-gray-50/50 transition-colors ${j.status === 'Archived' ? 'opacity-50' : ''}`}>
              <Td>
                <span className="font-medium text-gray-900">{j.title}</span>
              </Td>
              <Td>{typeLabel(j.journeyType)}</Td>
              <Td>{j.durationDays}</Td>
              <Td><StatusBadge status={j.status} /></Td>
              <Td>
                <span className="text-gray-400">
                  {j.updatedAt ? new Date(j.updatedAt).toLocaleDateString() : '—'}
                </span>
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <AdminBtn size="sm" variant="ghost" onClick={() => onPreview(j.id, 1)}>
                    <Eye size={13} /> Preview
                  </AdminBtn>
                  <AdminBtn size="sm" variant="ghost" onClick={() => onEdit(j.id)}>
                    <Pencil size={13} /> Edit
                  </AdminBtn>
                  <AdminBtn size="sm" variant="ghost" onClick={() => handleDuplicate(j)}>
                    <Copy size={13} />
                  </AdminBtn>
                  {j.status !== 'Archived' && (
                    <AdminBtn size="sm" variant="ghost" onClick={() => setArchiveTarget(j)}>
                      <Archive size={13} />
                    </AdminBtn>
                  )}
                </div>
              </Td>
            </tr>
          ))}
          {journeys.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                No journeys yet. Create your first journey.
              </td>
            </tr>
          )}
        </tbody>
      </AdminTable>

      {archiveTarget && (
        <ConfirmDialog
          title="Archive Journey"
          message={`Archive "${archiveTarget.title}"? It will no longer appear in the user app but its data will be preserved.`}
          confirmLabel="Archive"
          danger
          onConfirm={() => handleArchive(archiveTarget)}
          onCancel={() => setArchiveTarget(null)}
        />
      )}
    </div>
  );
}
