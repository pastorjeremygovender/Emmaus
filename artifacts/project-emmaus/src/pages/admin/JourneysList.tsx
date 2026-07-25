import React, { useState, useMemo, useRef } from 'react';
import { useJourney } from '@/contexts/JourneyContext';
import { Plus, Eye, Pencil, Archive, Copy, Upload, Download, Sparkles, Search, X, Tag } from 'lucide-react';
import { StatusBadge, AdminBtn, AdminTable, Th, Td, ConfirmDialog, PageHeader } from './shared';
import type { Journey } from '@/contexts/JourneyContext';
import { exportJourneysAsCsv } from '@/lib/journeys-api';
import { useAuth } from '@/contexts/AuthContext';
import JourneyCsvImport from './JourneyCsvImport';
import JourneyAiGenerator from './JourneyAiGenerator';

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  onEdit: (id: string) => void;
  onNew: () => void;
  onPreview: (id: string, day: number) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function typeLabel(t: string) {
  return t === 'companion' ? 'Companion' : 'Core';
}

const STATUS_ORDER: Record<string, number> = {
  Published: 0, Approved: 1, 'Pastoral Review': 2, Draft: 3, Archived: 4,
};

// Collect all unique tags across journeys
function collectTags(journeys: Journey[]): string[] {
  const set = new Set<string>();
  journeys.forEach(j => (j.tags ?? []).forEach(t => set.add(t)));
  return Array.from(set).sort();
}

// ─── Export helper ────────────────────────────────────────────────────────────

async function triggerCsvDownload(csv: string, filename: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function JourneysList({ onEdit, onNew, onPreview }: Props) {
  const { journeys, duplicateJourney, updateJourney, refreshJourneys } = useJourney();
  const { user } = useAuth();
  const [archiveTarget, setArchiveTarget] = useState<Journey | null>(null);

  // Search & filter state
  const [searchQ, setSearchQ] = useState('');
  const [activeTags, setActiveTags] = useState<string[]>([]);

  // Modal state
  const [showImport, setShowImport] = useState(false);
  const [showAi, setShowAi] = useState(false);

  // Export state
  const [exporting, setExporting] = useState(false);

  // Duplication busy state (prevent double-click)
  const duplicatingRef = useRef<Set<string>>(new Set());
  const [duplicatingIds, setDuplicatingIds] = useState<Set<string>>(new Set());

  // ─── Computed ──────────────────────────────────────────────────────────────

  const allTags = useMemo(() => collectTags(journeys), [journeys]);

  const filtered = useMemo(() => {
    let list = [...journeys].sort((a, b) => (STATUS_ORDER[a.status] ?? 5) - (STATUS_ORDER[b.status] ?? 5));
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.description?.toLowerCase().includes(q) ||
        (j.tags ?? []).some(t => t.toLowerCase().includes(q))
      );
    }
    if (activeTags.length) {
      list = list.filter(j =>
        activeTags.every(tag => (j.tags ?? []).map(t => t.toLowerCase()).includes(tag.toLowerCase()))
      );
    }
    return list;
  }, [journeys, searchQ, activeTags]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleArchive = async (j: Journey) => {
    try { await updateJourney({ ...j, status: 'Archived' }); }
    catch (err) { console.error('Archive failed:', err); }
    setArchiveTarget(null);
  };

  const handleDuplicate = async (j: Journey) => {
    if (duplicatingRef.current.has(j.id)) return;
    duplicatingRef.current.add(j.id);
    setDuplicatingIds(s => new Set([...s, j.id]));
    try {
      const copy = await duplicateJourney(j.id);
      onEdit(copy.id);  // open the copy in the editor immediately
    } catch (err) {
      console.error('Duplicate failed:', err);
    } finally {
      duplicatingRef.current.delete(j.id);
      setDuplicatingIds(s => { const next = new Set(s); next.delete(j.id); return next; });
    }
  };

  const handleExportAll = async () => {
    setExporting(true);
    try {
      const csv = await exportJourneysAsCsv(undefined, user?.id);
      await triggerCsvDownload(csv, `all-journeys-${Date.now()}.csv`);
    } catch (err) { console.error('Export failed:', err); }
    finally { setExporting(false); }
  };

  const handleExportFiltered = async () => {
    if (!filtered.length) return;
    setExporting(true);
    try {
      const ids = filtered.map(j => j.id);
      const csv = await exportJourneysAsCsv(ids, user?.id);
      const label = searchQ || activeTags.join('-') || 'filtered';
      await triggerCsvDownload(csv, `journeys-${label}-${Date.now()}.csv`);
    } catch (err) { console.error('Export failed:', err); }
    finally { setExporting(false); }
  };

  const toggleTag = (tag: string) => {
    setActiveTags(ts => ts.includes(tag) ? ts.filter(t => t !== tag) : [...ts, tag]);
  };

  const handleImported = async (journeyIds: string[]) => {
    await refreshJourneys();
    setShowImport(false);
    if (journeyIds.length === 1) onEdit(journeyIds[0]);
  };

  const handleAiGenerated = async (journeyId: string) => {
    await refreshJourneys();
    setShowAi(false);
    onEdit(journeyId);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  const publishedCount = journeys.filter(j => j.status === 'Published').length;

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <PageHeader
        title="Journeys"
        subtitle={`${publishedCount} published`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            {/* AI Generator */}
            <AdminBtn onClick={() => setShowAi(true)} variant="secondary">
              <Sparkles size={14} className="text-violet-500" /> Generate
            </AdminBtn>

            {/* Import */}
            <AdminBtn onClick={() => setShowImport(true)} variant="secondary">
              <Upload size={14} /> Import CSV
            </AdminBtn>

            {/* Export */}
            <div className="relative group">
              <AdminBtn
                onClick={filtered.length < journeys.length ? handleExportFiltered : handleExportAll}
                variant="secondary"
                disabled={exporting || journeys.length === 0}
              >
                <Download size={14} /> {exporting ? 'Exporting…' : 'Export CSV'}
              </AdminBtn>
              {/* Export submenu on hover — only when there's a filter active */}
              {filtered.length < journeys.length && !exporting && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-100 rounded-xl shadow-lg z-20 py-1 min-w-[160px] hidden group-hover:block">
                  <button onClick={handleExportFiltered} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    Export filtered ({filtered.length})
                  </button>
                  <button onClick={handleExportAll} className="w-full text-left px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    Export all ({journeys.length})
                  </button>
                </div>
              )}
            </div>

            {/* New journey */}
            <AdminBtn onClick={onNew} variant="primary">
              <Plus size={15} /> New Journey
            </AdminBtn>
          </div>
        }
      />

      {/* Search & tag filters */}
      <div className="mb-4 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            type="search"
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Search by title, description, or tag…"
            className="w-full pl-9 pr-8 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20 focus:border-[#7C3AED] bg-white"
          />
          {searchQ && (
            <button onClick={() => setSearchQ('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Tag chips */}
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <Tag size={11} className="text-gray-300 flex-shrink-0" />
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                className={`text-xs px-2.5 py-0.5 rounded-full border transition-colors ${
                  activeTags.includes(tag)
                    ? 'bg-[#7C3AED] border-[#7C3AED] text-white'
                    : 'border-gray-200 text-gray-500 hover:border-[#7C3AED]/40 hover:text-[#7C3AED]'
                }`}
              >
                {tag}
              </button>
            ))}
            {activeTags.length > 0 && (
              <button onClick={() => setActiveTags([])} className="text-xs text-gray-400 hover:text-gray-600 ml-1">
                Clear
              </button>
            )}
          </div>
        )}

        {/* Search result count */}
        {(searchQ || activeTags.length > 0) && (
          <p className="text-xs text-gray-400">
            {filtered.length} of {journeys.length} journey{journeys.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

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
          {filtered.map(j => (
            <tr key={j.id} className={`hover:bg-gray-50/50 transition-colors ${j.status === 'Archived' ? 'opacity-50' : ''}`}>
              <Td>
                <div>
                  <span className="font-medium text-gray-900">{j.title}</span>
                  {j.tags && j.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {j.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[10px] px-1.5 py-0 rounded-full bg-gray-100 text-gray-500">{tag}</span>
                      ))}
                      {j.tags.length > 3 && <span className="text-[10px] text-gray-400">+{j.tags.length - 3}</span>}
                    </div>
                  )}
                </div>
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
                  <AdminBtn
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDuplicate(j)}
                    disabled={duplicatingIds.has(j.id)}
                    title="Duplicate journey with all steps"
                  >
                    {duplicatingIds.has(j.id) ? (
                      <span className="text-[10px] text-gray-400">Copying…</span>
                    ) : (
                      <Copy size={13} />
                    )}
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
          {filtered.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">
                {searchQ || activeTags.length ? 'No journeys match your search.' : 'No journeys yet. Create your first journey.'}
              </td>
            </tr>
          )}
        </tbody>
      </AdminTable>

      {/* Archive confirm */}
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

      {/* CSV Import modal */}
      {showImport && (
        <JourneyCsvImport
          onClose={() => setShowImport(false)}
          onImported={handleImported}
        />
      )}

      {/* AI Generator modal */}
      {showAi && (
        <JourneyAiGenerator
          onClose={() => setShowAi(false)}
          onGenerated={handleAiGenerated}
        />
      )}
    </div>
  );
}
