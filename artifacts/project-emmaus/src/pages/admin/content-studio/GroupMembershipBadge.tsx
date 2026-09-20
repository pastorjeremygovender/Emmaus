/**
 * GroupMembershipBadge — compact contextual membership control.
 *
 * Shows which Content Groups an item belongs to.
 * Clicking opens a small popover checklist for toggling membership.
 *
 * Endpoint used for discovery:
 *   GET /api/content-groups/by-target/:targetType/:targetId
 *   → { groups: ContentGroup[] }
 *
 * Endpoint used for toggling:
 *   GET  /api/content-groups/:id  → { group: ContentGroupDetail }
 *   PUT  /api/content-groups/:id/items
 *        body: { items: [{ targetType, targetId }] }
 *        → { items: ContentGroupItem[] }
 *
 * Usage:
 *   <GroupMembershipBadge targetType="journey" targetId={j.id} compact />
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Layers2, X, ChevronDown, Loader2 } from 'lucide-react';
import {
  getGroupsByTarget,
  listContentGroups,
  setContentGroupItems,
  getContentGroup,
} from '@/lib/content-groups-api';
import type { ContentGroupTargetType, ContentGroup } from '@/lib/content-groups-api';

interface Props {
  targetType: ContentGroupTargetType;
  targetId: string;
  /** When true shows only the count number; when false shows group title(s). */
  compact?: boolean;
}

export default function GroupMembershipBadge({ targetType, targetId, compact = false }: Props) {
  const [memberGroups, setMemberGroups]   = useState<ContentGroup[]>([]);
  const [allGroups, setAllGroups]         = useState<ContentGroup[]>([]);
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [open, setOpen]                   = useState(false);
  const [error, setError]                 = useState('');
  const popoverRef = useRef<HTMLDivElement>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [memberships, all] = await Promise.all([
        getGroupsByTarget(targetType, targetId),
        listContentGroups(),
      ]);
      setMemberGroups(memberships);
      // Only show non-archived groups in the picker
      setAllGroups(all.filter(g => g.status !== 'Archived'));
    } catch {
      // Degrade silently — badge is informational
    } finally {
      setLoading(false);
    }
  }, [targetType, targetId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Close popover on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // ── Toggle membership for a single group ──────────────────────────────────

  const toggleGroup = async (group: ContentGroup) => {
    setSaving(true);
    setError('');
    try {
      // Fetch the group's current item list
      const detail = await getContentGroup(group.id);
      const current = detail.items ?? [];

      const isInGroup = current.some(
        it => it.targetId === targetId && it.targetType === targetType,
      );

      const next = isInGroup
        ? current
            .filter(it => !(it.targetId === targetId && it.targetType === targetType))
            .map(it => ({ targetType: it.targetType, targetId: it.targetId }))
        : [
            ...current.map(it => ({ targetType: it.targetType, targetId: it.targetId })),
            { targetType, targetId },
          ];

      await setContentGroupItems(group.id, next);

      // Refresh membership list for this item
      const updated = await getGroupsByTarget(targetType, targetId);
      setMemberGroups(updated);
    } catch (e) {
      setError(`Failed: ${(e as Error).message}`);
      setTimeout(() => setError(''), 4000);
    } finally {
      setSaving(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const count = memberGroups.length;

  const triggerLabel = loading
    ? '…'
    : count === 0
    ? 'No groups'
    : compact
    ? String(count)
    : memberGroups.map(g => g.title).join(', ');

  const memberGroupIds = new Set(memberGroups.map(g => g.id));

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        title="Manage group membership"
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-colors border ${
          count > 0
            ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100'
            : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'
        }`}
      >
        <Layers2 size={10} />
        <span>{triggerLabel}</span>
        <ChevronDown size={9} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-30 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 min-w-[200px] max-w-[260px]"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Groups</span>
            <button
              onClick={() => setOpen(false)}
              className="p-0.5 rounded text-gray-400 hover:text-gray-700"
            >
              <X size={11} />
            </button>
          </div>

          {error && (
            <p className="px-3 py-1.5 text-[11px] text-red-600">{error}</p>
          )}

          {loading ? (
            <div className="flex items-center gap-1.5 px-3 py-2 text-[12px] text-gray-400">
              <Loader2 size={11} className="animate-spin" /> Loading…
            </div>
          ) : allGroups.length === 0 ? (
            <p className="px-3 py-2 text-[12px] text-gray-400">No groups available.</p>
          ) : (
            allGroups.map(g => {
              const isMember = memberGroupIds.has(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => toggleGroup(g)}
                  disabled={saving}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] transition-colors disabled:opacity-50 ${
                    isMember
                      ? 'text-violet-700 hover:bg-violet-50'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {saving ? (
                    <Loader2 size={11} className="animate-spin flex-shrink-0" />
                  ) : isMember ? (
                    <div className="w-3.5 h-3.5 rounded-sm bg-violet-600 flex items-center justify-center flex-shrink-0">
                      <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
                        <path
                          d="M1 3L3 5L7 1"
                          stroke="white"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-sm border border-gray-300 flex-shrink-0" />
                  )}
                  <span className="truncate">{g.title}</span>
                  {g.status === 'Draft' && (
                    <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">Draft</span>
                  )}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
