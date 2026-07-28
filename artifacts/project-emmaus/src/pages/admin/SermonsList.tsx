import React from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { useJourney } from '@/contexts/JourneyContext';
import { Plus, Pencil, ExternalLink, BookOpen } from 'lucide-react';
import { StatusBadge, AdminBtn, AdminTable, Th, Td, PageHeader } from './shared';

type Props = {
  onEdit: (id: string) => void;
  onNew: () => void;
  /** Opens the companion for a sermon. Receives (sermonId, companionId). */
  onOpenCompanion: (sermonId: string, companionId: string) => void;
};

const TRANSCRIPT_LABELS = { none: 'None', pending: 'Pending', complete: 'Complete' };

/** A companionJourneyId is a new-style UUID if it matches the UUID pattern. */
function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export default function SermonsList({ onEdit, onNew, onOpenCompanion }: Props) {
  const { sermons } = useAdmin();
  const { journeys } = useJourney();

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <PageHeader
        title="Sermons"
        subtitle={`${sermons.length} sermon${sermons.length !== 1 ? 's' : ''}`}
        action={
          <AdminBtn onClick={onNew} variant="primary">
            <Plus size={15} /> New Sermon
          </AdminBtn>
        }
      />

      <AdminTable>
        <thead>
          <tr>
            <Th>Title</Th>
            <Th>Speaker</Th>
            <Th>Scripture</Th>
            <Th>Transcript</Th>
            <Th>Companion</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sermons.map(s => {
            // Legacy companions use a journey ID; new companions are UUIDs.
            const hasCompanion = !!s.companionJourneyId;
            const companionIsNew = hasCompanion && isUUID(s.companionJourneyId!);
            const legacyCompanion = !companionIsNew && s.companionJourneyId
              ? journeys.find(j => j.id === s.companionJourneyId)
              : null;

            return (
              <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                <Td>
                  <div className="font-medium text-gray-900">{s.title}</div>
                  <div className="text-xs text-gray-400">{s.sermonDate}</div>
                </Td>
                <Td>{s.speaker}</Td>
                <Td>{s.scriptureReference}</Td>
                <Td>
                  <span className="text-xs text-gray-500">
                    {TRANSCRIPT_LABELS[s.transcriptStatus] ?? s.transcriptStatus}
                  </span>
                </Td>
                <Td>
                  {companionIsNew ? (
                    <button
                      onClick={() => onOpenCompanion(s.id, s.companionJourneyId!)}
                      className="text-xs text-teal-700 hover:underline flex items-center gap-1"
                    >
                      <BookOpen size={11} /> View Companion
                    </button>
                  ) : legacyCompanion ? (
                    <button
                      onClick={() => onOpenCompanion(s.id, legacyCompanion.id)}
                      className="text-xs text-teal-700 hover:underline flex items-center gap-1"
                    >
                      <BookOpen size={11} /> {legacyCompanion.title}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </Td>
                <Td><StatusBadge status={s.status} /></Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <AdminBtn size="sm" variant="ghost" onClick={() => onEdit(s.id)}>
                      <Pencil size={13} /> Edit
                    </AdminBtn>
                    {s.youtubeUrl && (
                      <a
                        href={s.youtubeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1.5 text-[13px] text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>
                </Td>
              </tr>
            );
          })}
          {sermons.length === 0 && (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-400">
                No sermons yet. Click "New Sermon" to generate your first draft.
              </td>
            </tr>
          )}
        </tbody>
      </AdminTable>
    </div>
  );
}
