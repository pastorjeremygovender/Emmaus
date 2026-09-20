/**
 * ContentGroupEditor — create / edit a Content Group.
 *
 * Fields:   title, description, coverImageUrl, status, displayOrder
 * Items:    ordered list mixing Walks (journey), Daily Rhythm, and Daily
 *           Devotional series — add / remove / reorder (up/down buttons).
 *
 * The backend returns raw { targetType, targetId, displayOrder } with no
 * resolved title or status. Labels are derived entirely from the locally
 * loaded candidate catalogue (journeys + devotional series) which is fetched
 * once and kept in a lookup map for the lifetime of the editor.
 *
 * Saving group metadata and saving items are separate operations so a partial
 * save never leaves the group in an inconsistent state.
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Loader2, Plus, Trash2, ChevronUp, ChevronDown,
  Sun, BookHeart, BookOpen, X, Search, Layers2,
} from 'lucide-react';
import {
  getContentGroup,
  createContentGroup,
  updateContentGroup,
  deleteContentGroup,
  setContentGroupItems,
} from '@/lib/content-groups-api';
import type { ContentGroupItem, ContentGroupTargetType } from '@/lib/content-groups-api';
import { listJourneys } from '@/lib/journeys-api';
import { listAllSeries } from '@/lib/devotionals-api';
import { useAuth } from '@/contexts/AuthContext';
import { Field, ContentStudioToolbar, ConfirmDialog, StatusBadge } from '../shared';

interface Props {
  groupId?: string;
  onBack: () => void;
  onSaved: () => void;
}

// ─── Target type display metadata ─────────────────────────────────────────────

const TARGET_TYPE_META: Record<ContentGroupTargetType, {
  label: string;
  Icon: React.ElementType;
  iconColor: string;
  iconBg: string;
}> = {
  'journey':          { label: 'Walk',              Icon: BookOpen,  iconColor: 'text-teal-600',  iconBg: 'bg-teal-50'  },
  'daily-rhythm':     { label: 'Daily Rhythm',      Icon: Sun,       iconColor: 'text-amber-600', iconBg: 'bg-amber-50' },
  'daily-devotional': { label: 'Daily Devotional',  Icon: BookHeart, iconColor: 'text-rose-500',  iconBg: 'bg-rose-50'  },
};

// ─── Local candidate (picker source + label lookup) ───────────────────────────

interface CandidateItem {
  targetType: ContentGroupTargetType;
  targetId: string;
  title: string;
  status?: string;
}

/** Stable key for de-duplication and lookup maps. */
function candidateKey(targetType: ContentGroupTargetType, targetId: string) {
  return `${targetType}::${targetId}`;
}

// ─── Item picker modal ────────────────────────────────────────────────────────

interface PickerProps {
  existingKeys: Set<string>;
  candidates: CandidateItem[];
  loadingCandidates: boolean;
  candidateError: string;
  onAdd: (item: CandidateItem) => void;
  onClose: () => void;
}

function ItemPickerModal({
  existingKeys,
  candidates,
  loadingCandidates,
  candidateError,
  onAdd,
  onClose,
}: PickerProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContentGroupTargetType | 'all'>('all');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus search on open
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const visible = candidates.filter(c => {
    if (existingKeys.has(candidateKey(c.targetType, c.targetId))) return false;
    if (typeFilter !== 'all' && c.targetType !== typeFilter) return false;
    if (query.trim()) return c.title.toLowerCase().includes(query.toLowerCase());
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-sm font-semibold text-gray-900">Add Content to Group</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Search + type filter */}
        <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0 space-y-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by title…"
              className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
            />
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {(['all', 'journey', 'daily-rhythm', 'daily-devotional'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTypeFilter(t)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                  typeFilter === t
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {t === 'all' ? 'All Types' : TARGET_TYPE_META[t].label}
              </button>
            ))}
          </div>
        </div>

        {/* Candidate list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loadingCandidates ? (
            <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
              <Loader2 size={15} className="animate-spin" />
              <span className="text-sm">Loading content…</span>
            </div>
          ) : candidateError ? (
            <p className="text-sm text-red-600 px-5 py-4">{candidateError}</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-gray-400 px-5 py-4 text-center">
              {query ? 'No matches found.' : 'All available content has already been added.'}
            </p>
          ) : (
            visible.map(c => {
              const meta = TARGET_TYPE_META[c.targetType];
              return (
                <button
                  key={candidateKey(c.targetType, c.targetId)}
                  onClick={() => onAdd(c)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.iconBg}`}>
                    <meta.Icon size={14} className={meta.iconColor} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-gray-900 truncate">{c.title}</p>
                    <p className="text-[11px] text-gray-400">
                      {meta.label}{c.status ? ` · ${c.status}` : ''}
                    </p>
                  </div>
                  <Plus size={14} className="text-teal-600 flex-shrink-0" />
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Editor item — raw API item enriched with locally-resolved label ───────────

interface EditorItem {
  targetType: ContentGroupTargetType;
  targetId: string;
  /** Resolved locally from the candidate map — never from the API. */
  title: string;
  /** Resolved locally — may be undefined if the item isn't in our catalogue. */
  status?: string;
}

// ─── Main editor ──────────────────────────────────────────────────────────────

export default function ContentGroupEditor({ groupId, onBack, onSaved }: Props) {
  const { user } = useAuth();

  // ── Candidate catalogue (loaded once, used for picker + label resolution) ──
  const [candidates, setCandidates] = useState<CandidateItem[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);
  const [candidateError, setCandidateError] = useState('');

  // Stable lookup map: targetType::targetId → CandidateItem
  const candidateMap = useRef<Map<string, CandidateItem>>(new Map());

  useEffect(() => {
    const auth = user ? { userId: user.id, userRole: user.role } : undefined;
    setLoadingCandidates(true);

    Promise.all([listJourneys(), listAllSeries(auth)])
      .then(([journeys, series]) => {
        const items: CandidateItem[] = [];

        journeys
          .filter(j => j.journeyType !== 'companion')
          .forEach(j => {
            const targetType: ContentGroupTargetType =
              j.journeyType === 'daily-rhythm' ? 'daily-rhythm' : 'journey';
            items.push({ targetType, targetId: j.id, title: j.title, status: j.status });
          });

        series.forEach(s => {
          items.push({
            targetType: 'daily-devotional',
            targetId: s.id,
            title: s.title,
            status: s.status,
          });
        });

        const map = new Map(items.map(c => [candidateKey(c.targetType, c.targetId), c]));
        candidateMap.current = map;
        setCandidates(items);
      })
      .catch(e => setCandidateError(`Failed to load content: ${(e as Error).message}`))
      .finally(() => setLoadingCandidates(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  /** Resolve a raw API item into an EditorItem using the local candidate map. */
  const resolveItem = useCallback((raw: ContentGroupItem): EditorItem => {
    const key = candidateKey(raw.targetType, raw.targetId);
    const candidate = candidateMap.current.get(key);
    return {
      targetType: raw.targetType,
      targetId: raw.targetId,
      title: candidate?.title ?? raw.targetId,
      status: candidate?.status,
    };
  }, []);

  // ── Group metadata state ────────────────────────────────────────────────────

  const [loadingGroup, setLoadingGroup] = useState(!!groupId);
  const [internalId, setInternalId] = useState<string | undefined>(groupId);

  const [form, setForm] = useState({
    title: '',
    description: '',
    coverImageUrl: '',
    status: 'Draft',
    displayOrder: 0,
  });

  const [items, setItems] = useState<EditorItem[]>([]);
  const [savingAs, setSavingAs] = useState<'draft' | 'publish' | 'unpublish' | null>(null);
  const [savingItems, setSavingItems] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Load group detail. We re-resolve item labels once candidates are ready.
  const [rawItems, setRawItems] = useState<ContentGroupItem[]>([]);

  useEffect(() => {
    if (!groupId) return;
    setLoadingGroup(true);
    getContentGroup(groupId)
      .then(g => {
        setForm({
          title: g.title,
          description: g.description ?? '',
          coverImageUrl: g.coverImageUrl ?? '',
          status: g.status,
          displayOrder: g.displayOrder,
        });
        setRawItems(g.items ?? []);
      })
      .catch(e => setErrorMsg(`Failed to load group: ${(e as Error).message}`))
      .finally(() => setLoadingGroup(false));
  }, [groupId]);

  // Re-resolve labels whenever rawItems or the candidate catalogue changes.
  useEffect(() => {
    if (loadingCandidates) return; // wait until catalogue is ready
    setItems(rawItems.map(resolveItem));
  }, [rawItems, loadingCandidates, resolveItem]);

  const patch = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(f => ({ ...f, [k]: v }));

  // ── Group metadata save ─────────────────────────────────────────────────────

  const handleSave = async (statusOverride?: string): Promise<boolean> => {
    if (!form.title.trim()) {
      setErrorMsg('Title is required.');
      setTimeout(() => setErrorMsg(''), 4000);
      return false;
    }
    const targetStatus = statusOverride ?? form.status;
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        coverImageUrl: form.coverImageUrl || null,
        status: targetStatus,
        displayOrder: form.displayOrder,
      };
      if (internalId) {
        await updateContentGroup(internalId, payload);
      } else {
        const created = await createContentGroup(payload);
        setInternalId(created.id);
      }
      setForm(f => ({ ...f, status: targetStatus }));
      return true;
    } catch (e) {
      setErrorMsg(`Save failed: ${(e as Error).message}`);
      setTimeout(() => setErrorMsg(''), 5000);
      return false;
    }
  };

  const handleSaveDraft = async () => {
    setSavingAs('draft');
    setSuccessMsg('');
    setErrorMsg('');
    const ok = await handleSave();
    if (ok) {
      setSuccessMsg('Draft saved.');
      setTimeout(() => setSuccessMsg(''), 3000);
    }
    setSavingAs(null);
  };

  const handlePublish = async () => {
    setSavingAs('publish');
    setSuccessMsg('');
    setErrorMsg('');
    const ok = await handleSave('Published');
    setSavingAs(null);
    if (ok) onSaved();
  };

  const handleUnpublish = async () => {
    setSavingAs('unpublish');
    setSuccessMsg('');
    setErrorMsg('');
    const ok = await handleSave('Draft');
    if (ok) {
      setSuccessMsg('Unpublished.');
      setTimeout(() => setSuccessMsg(''), 3000);
    }
    setSavingAs(null);
  };

  const handleDelete = async () => {
    if (!internalId) { onBack(); return; }
    setDeleting(true);
    try {
      await deleteContentGroup(internalId);
      setConfirmDelete(false);
      onSaved();
    } catch (e) {
      setErrorMsg(`Delete failed: ${(e as Error).message}`);
      setTimeout(() => setErrorMsg(''), 5000);
    } finally {
      setDeleting(false);
    }
  };

  // ── Items management ────────────────────────────────────────────────────────

  const addItem = (candidate: CandidateItem) => {
    setItems(prev => [
      ...prev,
      {
        targetType: candidate.targetType,
        targetId: candidate.targetId,
        title: candidate.title,
        status: candidate.status,
      },
    ]);
  };

  const removeItem = (idx: number) => {
    setItems(prev => prev.filter((_, i) => i !== idx));
  };

  const moveItem = (idx: number, dir: -1 | 1) => {
    const next = [...items];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next);
  };

  const handleSaveItems = async () => {
    if (!internalId) {
      setErrorMsg('Save the group details first before managing items.');
      setTimeout(() => setErrorMsg(''), 4000);
      return;
    }
    setSavingItems(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      // Send ordered array without displayOrder — server derives it from position.
      const savedRaw = await setContentGroupItems(
        internalId,
        items.map(it => ({ targetType: it.targetType, targetId: it.targetId })),
      );
      // Re-resolve saved raw items so displayOrder stays in sync.
      setRawItems(savedRaw);
      setSuccessMsg('Items saved.');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (e) {
      setErrorMsg(`Failed to save items: ${(e as Error).message}`);
      setTimeout(() => setErrorMsg(''), 5000);
    } finally {
      setSavingItems(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loadingGroup) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={20} className="animate-spin text-teal-600" />
      </div>
    );
  }

  const existingKeys = new Set(items.map(it => candidateKey(it.targetType, it.targetId)));

  return (
    <div className="flex flex-col h-full min-h-0">
      <ContentStudioToolbar
        onBack={onBack}
        title={internalId ? 'Edit Group' : 'New Group'}
        subtitle={form.title || undefined}
        status={form.status}
        isSaving={savingAs === 'draft'}
        isPublishing={savingAs === 'publish' || savingAs === 'unpublish'}
        successMessage={successMsg}
        errorMessage={errorMsg}
        onSaveDraft={handleSaveDraft}
        onPublish={handlePublish}
        onUnpublish={handleUnpublish}
        onDelete={internalId ? () => setConfirmDelete(true) : undefined}
      />

      {confirmDelete && (
        <ConfirmDialog
          title="Delete Group?"
          message={`"${form.title}" will be permanently deleted. The content items inside will NOT be deleted.`}
          confirmLabel={deleting ? 'Deleting…' : 'Delete Group'}
          danger
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {showPicker && (
        <ItemPickerModal
          existingKeys={existingKeys}
          candidates={candidates}
          loadingCandidates={loadingCandidates}
          candidateError={candidateError}
          onAdd={(candidate) => { addItem(candidate); setShowPicker(false); }}
          onClose={() => setShowPicker(false)}
        />
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">

          {/* ── Group metadata ─────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5 sm:p-6 space-y-4">
            <h3 className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Group Details</h3>

            <Field label="Title *">
              <input
                type="text"
                value={form.title}
                onChange={e => patch('title', e.target.value)}
                placeholder="e.g. Foundations of Faith"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
            </Field>

            <Field label="Description">
              <textarea
                value={form.description}
                onChange={e => patch('description', e.target.value)}
                placeholder="Short description visible to members…"
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 resize-none"
              />
            </Field>

            <Field label="Cover Image URL (optional)">
              <input
                type="text"
                value={form.coverImageUrl}
                onChange={e => patch('coverImageUrl', e.target.value)}
                placeholder="https://…"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
              />
              {form.coverImageUrl && (
                <img
                  src={form.coverImageUrl}
                  alt="Cover preview"
                  className="mt-2 h-24 w-full object-cover rounded-lg border border-gray-100"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              )}
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={e => patch('status', e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                >
                  <option value="Draft">Draft</option>
                  <option value="Published">Published</option>
                  <option value="Archived">Archived</option>
                </select>
              </Field>

              <Field label="Display Order">
                <input
                  type="number"
                  min={0}
                  value={form.displayOrder}
                  onChange={e => patch('displayOrder', Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-300"
                />
              </Field>
            </div>
          </div>

          {/* ── Items list ─────────────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-[13px] font-semibold text-gray-800">
                  Content Items
                  <span className="ml-2 text-[11px] font-normal text-gray-400">({items.length})</span>
                </h3>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  Mix of Walks, Daily Rhythm, and Daily Devotionals.
                </p>
              </div>
              <button
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white text-[12px] font-medium rounded-lg hover:bg-teal-700 transition-colors"
              >
                <Plus size={12} /> Add Item
              </button>
            </div>

            {items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center mb-3">
                  <Layers2 size={18} className="text-violet-400" />
                </div>
                <p className="text-sm text-gray-500">No items yet.</p>
                <p className="text-xs text-gray-400 mt-1">
                  Click "Add Item" to add walks, Daily Rhythm, or devotional series.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {items.map((item, idx) => {
                  const meta = TARGET_TYPE_META[item.targetType] ?? TARGET_TYPE_META['journey'];
                  return (
                    <div
                      key={candidateKey(item.targetType, item.targetId)}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50/50 transition-colors"
                    >
                      {/* Reorder */}
                      <div className="flex flex-col gap-0.5 flex-shrink-0">
                        <button
                          onClick={() => moveItem(idx, -1)}
                          disabled={idx === 0}
                          className="p-0.5 rounded text-gray-300 hover:text-gray-600 disabled:opacity-30 transition-colors"
                          aria-label="Move up"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          onClick={() => moveItem(idx, 1)}
                          disabled={idx === items.length - 1}
                          className="p-0.5 rounded text-gray-300 hover:text-gray-600 disabled:opacity-30 transition-colors"
                          aria-label="Move down"
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>

                      {/* Icon */}
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.iconBg}`}>
                        <meta.Icon size={14} className={meta.iconColor} />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-gray-900 truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-gray-400">{meta.label}</p>
                      </div>

                      {/* Status badge — locally resolved */}
                      {item.status && (
                        <div className="flex-shrink-0 hidden sm:block">
                          <StatusBadge status={item.status} />
                        </div>
                      )}

                      {/* Remove */}
                      <button
                        onClick={() => removeItem(idx)}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors flex-shrink-0"
                        aria-label="Remove item"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Save items footer */}
            {items.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between">
                <p className="text-[11px] text-gray-400">
                  {internalId
                    ? 'Changes to items are saved separately.'
                    : 'Save group details first, then save items.'}
                </p>
                <button
                  onClick={handleSaveItems}
                  disabled={savingItems || !internalId}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-[12px] text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
                >
                  {savingItems ? <Loader2 size={11} className="animate-spin" /> : null}
                  Save Items
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
