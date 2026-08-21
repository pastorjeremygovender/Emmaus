import { useCallback, useEffect, useMemo, useState } from 'react';
import { FolderPlus, Loader2, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createDailyRhythmGroup,
  deleteDailyRhythmGroup,
  listDailyRhythmGroups,
  saveDailyRhythmGroupItems,
  updateDailyRhythmGroup,
  type DailyRhythmGroup,
  type Step,
} from '@/lib/journeys-api';

export default function DailyRhythmGroupsPanel({ journeyId, steps }: { journeyId: string; steps: Step[] }) {
  const [groups, setGroups] = useState<DailyRhythmGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('Draft');
  const [selectedStepIds, setSelectedStepIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await listDailyRhythmGroups(journeyId);
      setGroups(result);
      if (selectedId && !result.some(group => group.id === selectedId)) setSelectedId(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not load Daily Rhythm groups');
    }
  }, [journeyId, selectedId]);

  useEffect(() => { void load(); }, [load]);
  const selected = groups.find(group => group.id === selectedId) ?? null;
  const selectableSteps = useMemo(() => steps.filter(step => step.id && !step.isCompletionStep).sort((a, b) => a.day - b.day), [steps]);

  function choose(group: DailyRhythmGroup) {
    setSelectedId(group.id);
    setTitle(group.title);
    setDescription(group.description ?? '');
    setStatus(group.status);
    setSelectedStepIds(group.items.map(step => step.id).filter((id): id is string => Boolean(id)));
  }

  async function create() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      const group = await createDailyRhythmGroup(journeyId, { title: newTitle.trim(), displayOrder: groups.length });
      setNewTitle('');
      await load();
      choose({ ...group, items: [] });
      toast.success('Group created');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create group');
    }
    finally { setSaving(false); }
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    try {
      await updateDailyRhythmGroup(journeyId, selected.id, { title: title.trim() || selected.title, description, status });
      await saveDailyRhythmGroupItems(journeyId, selected.id, selectedStepIds);
      await load();
      toast.success('Group saved');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save group');
    }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!selected || !window.confirm(`Delete the ${selected.title} group? Days will not be deleted.`)) return;
    setSaving(true);
    try {
      await deleteDailyRhythmGroup(journeyId, selected.id);
      setSelectedId(null);
      await load();
      toast.success('Group deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete group');
    }
    finally { setSaving(false); }
  }

  return (
    <section className="border border-teal-100 rounded-2xl bg-teal-50/30 p-4 sm:p-5 mt-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Daily Rhythm day groups</h3>
          <p className="text-xs text-gray-500 mt-0.5">Assign individual days to Bible-book groups. Days keep their canonical Day number.</p>
        </div>
        <div className="flex gap-2">
           <input
             value={newTitle}
             onChange={e => setNewTitle(e.target.value)}
             onKeyDown={e => {
               if (e.key === 'Enter') {
                 e.preventDefault();
                 void create();
               }
             }}
             placeholder="New group name"
             className="min-h-10 w-40 border border-gray-200 rounded-xl bg-white px-3 text-sm"
           />
           <button
             type="button"
             onClick={e => {
               e.preventDefault();
               void create();
             }}
             disabled={saving || !newTitle.trim()}
             className="min-h-10 px-3 rounded-xl bg-teal-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
           >
             {saving ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />}
             Add
           </button>
        </div>
      </div>
      {groups.length === 0 ? (
        <p className="text-xs text-gray-500 bg-white border border-dashed border-gray-200 rounded-xl p-4 text-center">No day groups yet. Create a group such as John or Luke.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(12rem,16rem)_1fr] gap-3">
          <div className="space-y-2">
            {groups.map(group => (
              <button key={group.id} onClick={() => choose(group)} className={`w-full text-left rounded-xl border bg-white px-3 py-2 ${selectedId === group.id ? 'border-teal-400 ring-1 ring-teal-200' : 'border-gray-200'}`}>
                <span className="block text-sm font-medium text-gray-800 truncate">{group.title}</span>
                <span className="block text-[11px] text-gray-400">{group.items.length} days · {group.status}</span>
              </button>
            ))}
          </div>
          {selected && (
            <div className="bg-white border border-gray-200 rounded-xl p-3 sm:p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex-1 space-y-2">
                  <input value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-sm font-medium" />
                  <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description" className="w-full border border-gray-200 rounded-lg px-2.5 py-2 text-xs" />
                </div>
                <button onClick={() => void remove()} disabled={saving} className="text-xs text-red-600 flex items-center gap-1"><Trash2 size={13} /> Delete</button>
              </div>
              <label className="text-xs text-gray-500 flex items-center gap-2 mb-3">Visibility
                <select value={status} onChange={e => setStatus(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-xs">
                  <option>Draft</option><option>Published</option><option>Archived</option>
                </select>
              </label>
              <p className="text-xs font-medium text-gray-600 mb-2">Days in this group</p>
              <div className="max-h-52 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
                {selectableSteps.map(step => (
                  <label key={step.id} className="flex items-center gap-2 px-2.5 py-2 text-xs text-gray-700 cursor-pointer hover:bg-gray-50">
                    <input type="checkbox" checked={Boolean(step.id && selectedStepIds.includes(step.id))} onChange={() => step.id && setSelectedStepIds(current => current.includes(step.id!) ? current.filter(id => id !== step.id) : [...current, step.id!])} className="rounded border-gray-300 text-teal-600" />
                    <span className="text-gray-400 w-10">Day {step.day}</span>
                    <span className="truncate">{step.title || 'Untitled'}</span>
                    <span className="ml-auto text-[10px] text-gray-400">{step.status}</span>
                  </label>
                ))}
              </div>
              <button onClick={() => void save()} disabled={saving} className="mt-4 min-h-10 px-4 rounded-xl bg-teal-600 text-white text-sm font-medium flex items-center gap-1.5 disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save group
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}