import React, { useState } from 'react';
import { useAdmin } from '@/contexts/AdminContext';
import { PrayerRequest } from '@/lib/admin-demo-data';
import { StatusBadge, AdminBtn, AdminTable, Th, Td, PageHeader, Field, TextArea, Select } from './shared';

const PRIVACY_LABELS = { private: 'Private', pastoral: 'Pastoral', prayer_team: 'Prayer Team' };
const STATUS_OPTIONS = ['new', 'acknowledged', 'followed_up', 'answered', 'archived'] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PrayerRequests() {
  const { prayerRequests, updatePrayerRequest } = useAdmin();
  const [selected, setSelected] = useState<PrayerRequest | null>(null);
  const [editNote, setEditNote] = useState('');
  const [noteStatus, setNoteStatus] = useState<'idle' | 'saved'>('idle');

  const open = (req: PrayerRequest) => {
    setSelected(req);
    setEditNote(req.pastoralNotes ?? '');
    setNoteStatus('idle');
  };

  const close = () => { setSelected(null); setEditNote(''); };

  const handleStatusChange = (req: PrayerRequest, status: string) => {
    const now = new Date().toISOString();
    updatePrayerRequest({
      ...req,
      status: status as PrayerRequest['status'],
      followedUpAt: status === 'followed_up' ? now : req.followedUpAt,
      answeredAt: status === 'answered' ? now : req.answeredAt,
    });
    if (selected?.id === req.id) setSelected(p => p ? { ...p, status: status as PrayerRequest['status'] } : p);
  };

  const handleSaveNote = () => {
    if (!selected) return;
    const updated = { ...selected, pastoralNotes: editNote };
    updatePrayerRequest(updated);
    setSelected(updated);
    setNoteStatus('saved');
    setTimeout(() => setNoteStatus('idle'), 2000);
  };

  const active = prayerRequests.filter(p => p.status !== 'archived');
  const archived = prayerRequests.filter(p => p.status === 'archived');

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <PageHeader title="Prayer Requests" subtitle={`${active.length} active`} />

      <AdminTable>
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Name</Th>
            <Th>Preview</Th>
            <Th>Privacy</Th>
            <Th>Status</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {[...active, ...archived].map(req => (
            <tr key={req.id} className={`hover:bg-gray-50/50 transition-colors ${req.status === 'archived' ? 'opacity-50' : ''}`}>
              <Td><span className="text-xs text-gray-400 whitespace-nowrap">{formatDate(req.createdAt)}</span></Td>
              <Td><span className="font-medium text-gray-800">{req.userName}</span></Td>
              <Td>
                <span className="text-sm text-gray-600 line-clamp-2 max-w-xs">
                  {req.content.substring(0, 80)}{req.content.length > 80 ? '…' : ''}
                </span>
              </Td>
              <Td>
                <span className="text-xs text-gray-500">{PRIVACY_LABELS[req.privacyLevel]}</span>
              </Td>
              <Td><StatusBadge status={req.status} /></Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <AdminBtn size="sm" variant="ghost" onClick={() => open(req)}>View</AdminBtn>
                  <Select
                    value={req.status}
                    onChange={e => handleStatusChange(req, e.target.value)}
                    className="text-xs py-1 px-2 w-auto"
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </Select>
                </div>
              </Td>
            </tr>
          ))}
          {prayerRequests.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-400">No prayer requests yet.</td>
            </tr>
          )}
        </tbody>
      </AdminTable>

      {/* Detail modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">{selected.userName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <StatusBadge status={selected.status} />
                  <span className="text-xs text-gray-400">{PRIVACY_LABELS[selected.privacyLevel]}</span>
                  <span className="text-xs text-gray-400">{formatDate(selected.createdAt)}</span>
                </div>
              </div>
              <button onClick={close} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-700 leading-relaxed">
              {selected.content}
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Change Status</h3>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map(s => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(selected, s)}
                    className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                      selected.status === s
                        ? 'bg-teal-700 text-white border-teal-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <Field label="Private pastoral note">
              <TextArea
                rows={3}
                value={editNote}
                onChange={e => setEditNote(e.target.value)}
                placeholder="Add a private note visible only to the pastoral team."
              />
            </Field>

            {selected.assignedTo && (
              <p className="text-xs text-gray-400">Assigned to: {selected.assignedTo}</p>
            )}

            <div className="flex justify-between items-center">
              {noteStatus === 'saved' && <span className="text-xs text-emerald-600">Note saved.</span>}
              {noteStatus === 'idle' && <span />}
              <div className="flex gap-3">
                <AdminBtn variant="secondary" onClick={close}>Close</AdminBtn>
                <AdminBtn variant="primary" onClick={handleSaveNote}>Save Note</AdminBtn>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
