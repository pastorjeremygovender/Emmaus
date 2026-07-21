import React, { useState } from 'react';
import { useMediaStudio } from '@/contexts/MediaStudioContext';
import { ASSET_LABELS, SCHEDULED_DAYS, type MediaAsset } from '@/lib/media-studio-types';
import { StatusBadge, AdminBtn, ConfirmDialog, Select } from '../shared';

type Day = NonNullable<MediaAsset['scheduledDay']>;

const DAYS: Day[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const DAY_EMOJI: Record<Day, string> = {
  Monday: '📅',
  Tuesday: '📅',
  Wednesday: '📅',
  Thursday: '📅',
  Friday: '📅',
  Saturday: '🛐',
  Sunday: '⛪',
};

type Props = {
  onBack: () => void;
  onOpenKit: (kitId: string) => void;
};

type AssignModal = {
  asset: MediaAsset;
  targetDay: Day | '';
};

export default function MediaCalendar({ onBack, onOpenKit }: Props) {
  const { kits, assets, updateAsset } = useMediaStudio();
  const [assignModal, setAssignModal] = useState<AssignModal | null>(null);
  const [confirmPublish, setConfirmPublish] = useState<MediaAsset | null>(null);

  const assetsByDay: Record<Day, MediaAsset[]> = Object.fromEntries(
    DAYS.map(d => [d, assets.filter(a => a.scheduledDay === d)])
  ) as Record<Day, MediaAsset[]>;

  const unscheduled = assets.filter(a => !a.scheduledDay && a.status !== 'Published');

  const handleAssign = () => {
    if (!assignModal || !assignModal.targetDay) return;
    updateAsset({ ...assignModal.asset, scheduledDay: assignModal.targetDay as Day });
    setAssignModal(null);
  };

  const handleUnschedule = (asset: MediaAsset) => {
    const { scheduledDay: _removed, scheduledAt: _removedAt, ...rest } = asset as MediaAsset & { scheduledDay?: Day; scheduledAt?: string };
    updateAsset({ ...rest, status: asset.status === 'Scheduled' ? 'Approved' : asset.status });
  };

  const handlePublishConfirmed = (asset: MediaAsset) => {
    updateAsset({ ...asset, status: 'Published', publishedAt: new Date().toISOString() });
    setConfirmPublish(null);
  };

  const kitFor = (asset: MediaAsset) => kits.find(k => k.assetIds.includes(asset.id));

  return (
    <div className="p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <h1 className="text-[20px] font-semibold text-gray-900">📅 Media Calendar</h1>
            <p className="text-sm text-gray-400 mt-0.5">Assign assets to days. Approval is required before publishing.</p>
          </div>
        </div>
      </div>

      {/* Weekly grid */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-3 mb-8">
        {DAYS.map(day => {
          const dayAssets = assetsByDay[day];
          return (
            <div key={day} className="bg-white rounded-xl border border-gray-200 overflow-hidden min-h-[120px]">
              <div className={`px-3 py-2 border-b border-gray-100 ${day === 'Saturday' || day === 'Sunday' ? 'bg-teal-50' : 'bg-gray-50'}`}>
                <p className="text-xs font-semibold text-gray-700">
                  {DAY_EMOJI[day]} {day}
                </p>
                {day === 'Sunday' && (
                  <p className="text-[10px] text-teal-600 font-medium">New Sermon</p>
                )}
              </div>
              <div className="p-2 space-y-1.5">
                {dayAssets.length === 0 && (
                  <p className="text-[11px] text-gray-300 text-center py-2">Empty</p>
                )}
                {dayAssets.map(asset => (
                  <div
                    key={asset.id}
                    className="group rounded-md bg-gray-50 border border-gray-100 px-2 py-1.5 hover:border-teal-200 transition-colors cursor-pointer"
                    onClick={() => {
                      const kit = kitFor(asset);
                      if (kit) onOpenKit(kit.id);
                    }}
                  >
                    <p className="text-[10px] font-medium text-gray-700 leading-tight capitalize">
                      {asset.type.replace(/-/g, ' ')}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                      <StatusBadge status={asset.status} />
                    </div>
                    {/* Quick actions */}
                    <div className="hidden group-hover:flex gap-1 mt-1">
                      {asset.status === 'Approved' && (
                        <button
                          onClick={e => { e.stopPropagation(); setConfirmPublish(asset); }}
                          className="text-[9px] text-emerald-700 hover:underline"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); handleUnschedule(asset); }}
                        className="text-[9px] text-gray-400 hover:underline"
                      >
                        Unschedule
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Unscheduled assets */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Unscheduled Assets
          <span className="ml-2 text-gray-400 font-normal text-xs">
            ({unscheduled.length}) — drag or click to assign a day
          </span>
        </h2>

        {unscheduled.length === 0 && (
          <p className="text-sm text-gray-400">All assets are scheduled or published.</p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {unscheduled.map(asset => {
            const kit = kitFor(asset);
            return (
              <div
                key={asset.id}
                className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 capitalize">
                    {asset.type.replace(/-/g, ' ')}
                  </p>
                  {kit && (
                    <p className="text-[11px] text-gray-400 truncate">{kit.sourceTitle}</p>
                  )}
                  <div className="mt-1"><StatusBadge status={asset.status} /></div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <AdminBtn
                    size="sm"
                    variant="secondary"
                    onClick={() => setAssignModal({ asset, targetDay: '' })}
                  >
                    Assign Day
                  </AdminBtn>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-8 p-4 bg-gray-50 rounded-xl border border-gray-100">
        <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Workflow Reminder</p>
        <p className="text-xs text-gray-500">
          Nothing publishes automatically. Assets must be approved before they can be scheduled or published.
          Confirmed publishing requires a "Publish this media?" confirmation.
        </p>
      </div>

      {/* Assign day modal */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h2 className="font-semibold text-gray-900 text-[15px]">Assign to Day</h2>
            <p className="text-sm text-gray-500 capitalize">
              {assignModal.asset.type.replace(/-/g, ' ')}
            </p>
            <Select
              value={assignModal.targetDay}
              onChange={e => setAssignModal({ ...assignModal, targetDay: e.target.value as Day | '' })}
            >
              <option value="">— Choose a day —</option>
              {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
            <div className="flex gap-3 justify-end pt-2">
              <button
                onClick={() => setAssignModal(null)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </button>
              <AdminBtn
                variant="primary"
                disabled={!assignModal.targetDay}
                onClick={handleAssign}
              >
                Assign
              </AdminBtn>
            </div>
          </div>
        </div>
      )}

      {/* Publish confirmation */}
      {confirmPublish && (
        <ConfirmDialog
          title="Publish this media?"
          message={`"${ASSET_LABELS[confirmPublish.type]}" will be marked as Published. This cannot be undone without manually changing the status.`}
          confirmLabel="Publish"
          onConfirm={() => handlePublishConfirmed(confirmPublish)}
          onCancel={() => setConfirmPublish(null)}
        />
      )}
    </div>
  );
}
