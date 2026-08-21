import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FolderPlus, Loader2, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  createDevotionalEntryGroup,
  deleteDevotionalEntryGroup,
  listDevotionalEntryGroups,
  saveDevotionalEntryGroupItems,
  updateDevotionalEntryGroup,
  type AdminAuth,
  type DevotionalEntry,
  type DevotionalEntryGroup,
} from '@/lib/devotionals-api';

interface Props {
  seriesId: string;
  entries: DevotionalEntry[];
  auth?: AdminAuth;
}

export default function DevotionalEntryGroupsPanel({ seriesId, entries, auth }: Props) {
  const [groups, setGroups] = useState<DevotionalEntryGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftStatus, setDraftStatus] = useState('Draft');

  const load = useCallback(async () => {
    try {
      const result = await listDevotionalEntryGroups(seriesId, auth);
      setGroups(result);
      if (selectedId && !result.some(group => group.id === selectedId)) setSelectedId(null);
    } catch {
      toast.error('Could not load entry groups');
    } finally {
      setLoading(false);
    }
  }, [seriesId, auth?.userId, auth?.userRole, selectedId]);

  useEffect(() => { load(); }, [load]);

  const selected = groups.find(group => group.id === selectedId) ?? null;
  const entryById = useMemo(() => new Map(entries.map(entry => [entry.id, entry])), [entries]);
  const orderedSelectedEntries = selectedEntryIds
    .map(id => entryById.get(id))
    .filter((entry): entry is DevotionalEntry => Boolean(entry));

  function chooseGroup(group: DevotionalEntryGroup) {
    setSelectedId(group.id);
    setDraftTitle(group.title);
    setDraftDescription(group.description ?? '');
    setDraftStatus(group.status);
    setSelectedEntryIds(group.items.map(entry => entry.id));
  }

  async function createGroup() {
    const title = newTitle.trim();
    if (!title) return;
    setSaving(true);
    try {
      const group = await createDevotionalEntryGroup(seriesId, {
        title,
        displayOrder: groups.length,
      }, auth);
      setNewTitle('');
      await load();
      chooseGroup({ ...group, items: [] });
      toast.success(`${title} group created`);
    } catch {
      toast.error('Could not create group');
    } finally {
      setSaving(false);
    }
  }

  function toggleEntry(entryId: string) {
    setSelectedEntryIds(current =>
      current.includes(entryId) ? current.filter(id => id !== entryId) : [...current, entryId],
    );
  }

  async function changeStatus(nextStatus: string) {
    if (!selected || nextStatus === selected.status) {
      setDraftStatus(nextStatus);
      return;
    }
    const previousStatus = selected.status;
    setDraftStatus(nextStatus);
    setSaving(true);
    try {
      const updated = await updateDevotionalEntryGroup(seriesId, selected.id, { status: nextStatus }, auth);
      setGroups(current => current.map(group => group.id === updated.id ? { ...group, status: updated.status } : group));
      toast.success(`Group ${nextStatus.toLowerCase()}`);
    } catch (error) {
      setDraftStatus(previousStatus);
      toast.error(error instanceof Error ? error.message : 'Could not update group visibility');
    } finally {
      setSaving(false);
    }
  }

  function moveEntry(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= selectedEntryIds.length) return;
    setSelectedEntryIds(current => {
      const copy = [...current];
      [copy[index], copy[next]] = [copy[next], copy[index]];
      return copy;
    });
  }

  async function saveGroup() {
    if (!selected) return;
    setSaving(true);
    try {
      await updateDevotionalEntryGroup(seriesId, selected.id, {
        title: draftTitle.trim() || selected.title,
        description: draftDescription,
        status: draftStatus,
      }, auth);
      await saveDevotionalEntryGroupItems(seriesId, selected.id, selectedEntryIds, auth);
      await load();
      toast.success('Group saved');
    } catch {
      toast.error('Could not save group');
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup() {
    if (!selected || !window.confirm(`Delete the ${selected.title} group? Entries will not be deleted.`)) return;
    setSaving(true);
    try {
      await deleteDevotionalEntryGroup(seriesId, selected.id, auth);
      setSelectedId(null);
      await load();
      toast.success('Group deleted');
    } catch {
      toast.error('Could not delete group');
    } finally {
      setSaving(false);
    }
  }

  async function moveGroup(index: number, direction: -1 | 1) {
    const next = index + direction;
    if (next < 0 || next >= groups.length) return;
    const current = groups[index];
    const target = groups[next];
    try {
      await Promise.all([
        updateDevotionalEntryGroup(seriesId, current.id, { displayOrder: target.displayOrder }, auth),
        updateDevotionalEntryGroup(seriesId, target.id, { displayOrder: current.displayOrder }, auth),
      ]);
      await load();
    } catch {
      toast.error('Could not reorder groups');
    }
  }

  if (loading) {
    return <div className="border border-gray-200 rounded-2xl bg-white p-5 text-sm text-gray-400 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading entry groups…</div>;
  }

  return (
    <section className="border border-teal-100 rounded-2xl bg-teal-50/30 p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Entry groups</h3>
          <p className="text-xs text-gray-500 mt-0.5">Organise days into January, February, themes, or any order you choose.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <input
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void createGroup(); }}
            placeholder="New group name"
            className="min-h-10 flex-1 sm:w-40 border border-gray-200 rounded-xl bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
          <button onClick={() => void createGroup()} disabled={saving || !newTitle.trim()} className="min-h-10 px-3 rounded-xl bg-teal-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5">
            <FolderPlus size={14} /> Add
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <p className="text-xs text-gray-500 bg-white border border-dashed border-gray-200 rounded-xl p-4 text-center">No entry groups yet. Create January to get started.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(12rem,16rem)_1fr] gap-3">
          <div className="space-y-2">
            {groups.map((group, index) => (
              <div key={group.id} className={`flex items-center gap-1 rounded-xl border bg-white p-1.5 ${selectedId === group.id ? 'border-teal-400 ring-1 ring-teal-200' : 'border-gray-200'}`}>
                <button onClick={() => chooseGroup(group)} className="min-w-0 flex-1 text-left px-2 py-2">
                  <span className="block text-sm font-medium text-gray-800 truncate">{group.title}</span>
                  <span className="block text-[11px] text-gray-400">{group.items.length} entr{group.items.length === 1 ? 'y' : 'ies'} · {group.status}</span>
                </button>
                <button aria-label={`Move ${group.title} up`} onClick={() => void moveGroup(index, -1)} disabled={index === 0} className="p-1.5 text-gray-400 disabled:opacity-30"><ChevronUp size={14} /></button>
                <button aria-label={`Move ${group.title} down`} onClick={() => void moveGroup(index, 1)} disabled={index === groups.length - 1} className="p-1.5 text-gray-400 disabled:opacity-30"><ChevronDown size={14} /></button>
              </div>
            ))}
          </div>

          {selected && (
            <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 space-y-2">
                  <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-300" />
                  <input value={draftDescription} onChange={e => setDraftDescription(e.target.value)} placeholder="Optional description" className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-teal-300" />
                </div>
                <button onClick={() => setSelectedId(null)} aria-label="Close group editor" className="p-1.5 text-gray-400 hover:text-gray-700"><X size={16} /></button>
              </div>
              <div className="flex items-center justify-between gap-2 mb-3">
                <label className="text-xs text-gray-500 flex items-center gap-2">
                  Visibility
          <select value={draftStatus} onChange={e => void changeStatus(e.target.value)} disabled={saving} className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-xs disabled:opacity-60">
                    <option value="Draft">Draft</option>
                    <option value="Published">Published</option>
                    <option value="Archived">Archived</option>
                  </select>
                </label>
                <button onClick={() => void deleteGroup()} disabled={saving} className="text-xs text-red-600 hover:text-red-700 flex items-center gap-1"><Trash2 size={13} /> Delete group</button>
              </div>

              <p className="text-xs font-medium text-gray-600 mb-2">Ordered entries in this group</p>
              <div className="space-y-1.5 mb-4">
                {orderedSelectedEntries.length === 0 && <p className="text-xs text-gray-400 border border-dashed rounded-lg p-3 text-center">Select entries below.</p>}
                {orderedSelectedEntries.map((entry, index) => (
                  <div key={entry.id} className="flex items-center gap-2 border border-gray-100 rounded-lg px-2 py-1.5">
                    <span className="text-[11px] text-gray-400 w-5">{index + 1}</span>
                    <span className="flex-1 min-w-0 text-xs text-gray-700 truncate">Day {entry.dayNumber} · {entry.title || 'Untitled'}</span>
                    <button onClick={() => moveEntry(index, -1)} disabled={index === 0} className="p-1 text-gray-400 disabled:opacity-30"><ChevronUp size={13} /></button>
                    <button onClick={() => moveEntry(index, 1)} disabled={index === orderedSelectedEntries.length - 1} className="p-1 text-gray-400 disabled:opacity-30"><ChevronDown size={13} /></button>
                  </div>
                ))}
              </div>

              <p className="text-xs font-medium text-gray-600 mb-2">Add or remove entries</p>
              <div className="max-h-44 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                {entries.map(entry => (
                  <label key={entry.id} className="flex items-center gap-2 px-2.5 py-2 text-xs text-gray-700 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={selectedEntryIds.includes(entry.id)} onChange={() => toggleEntry(entry.id)} className="rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                    <span className="text-gray-400 w-8">Day {entry.dayNumber}</span>
                    <span className="truncate">{entry.title || 'Untitled'}</span>
                    <span className="ml-auto text-[10px] text-gray-400">{entry.status}</span>
                  </label>
                ))}
              </div>
              <button onClick={() => void saveGroup()} disabled={saving} className="mt-4 min-h-10 px-4 rounded-xl bg-teal-600 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save group
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}