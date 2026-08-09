/**
 * AdminRooms — application-admin view of all Rooms.
 *
 * Uses the admin-only API endpoints (/api/rooms/admin/...) which are gated
 * server-side on the caller's application role (admin / superAdmin).
 * Member-facing RoomsContext is intentionally NOT used here to keep the
 * access boundaries clear.
 */

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiAdminGetAllRooms, apiAdminGetRoomDetail } from '@/lib/rooms-api';
import type { RoomSummary, RoomDetail } from '@/lib/rooms-types';

export default function AdminRooms() {
  const { user } = useAuth();

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<RoomDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // ── Load all rooms on mount ───────────────────────────────────────────────
  const loadRooms = useCallback(async () => {
    if (!user) return;
    setLoadingRooms(true);
    setRoomsError(null);
    try {
      const data = await apiAdminGetAllRooms(user.id);
      setRooms(data);
    } catch (err) {
      setRoomsError(err instanceof Error ? err.message : 'Failed to load rooms.');
    } finally {
      setLoadingRooms(false);
    }
  }, [user]);

  useEffect(() => { loadRooms(); }, [loadRooms]);

  // ── Load room detail when selection changes ───────────────────────────────
  useEffect(() => {
    if (!selectedRoomId || !user) {
      setSelectedDetail(null);
      return;
    }
    setLoadingDetail(true);
    setDetailError(null);
    apiAdminGetRoomDetail(user.id, selectedRoomId)
      .then(detail => setSelectedDetail(detail))
      .catch(err => setDetailError(err instanceof Error ? err.message : 'Failed to load room detail.'))
      .finally(() => setLoadingDetail(false));
  }, [selectedRoomId, user]);

  const selectedRoom = selectedRoomId ? rooms.find(r => r.id === selectedRoomId) : null;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Groups</h1>
        <p className="text-sm text-gray-500 mt-1">Support and moderation for Emmaus Groups.</p>
      </div>

      {/* Room Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">All Groups</span>
        </div>

        {loadingRooms ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">Loading groups…</div>
        ) : roomsError ? (
          <div className="px-5 py-10 text-center text-red-500 text-sm">{roomsError}</div>
        ) : rooms.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">No Groups created yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {rooms.map(room => (
              <div
                key={room.id}
                className={`px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedRoomId === room.id ? 'bg-teal-50' : ''}`}
                onClick={() => setSelectedRoomId(selectedRoomId === room.id ? null : room.id)}
              >
                <div className="flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-[15px] text-gray-900">{room.name}</span>
                      <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded border bg-green-50 text-green-700 border-green-200">
                        active
                      </span>
                    </div>
                    <div className="text-[13px] text-gray-500 mt-0.5">
                      Admin: {room.adminName} · {room.memberCount} member{room.memberCount !== 1 ? 's' : ''}
                    </div>
                  </div>
                  <div className="text-[12px] text-gray-400">
                    {new Date(room.createdAt).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Room Detail Panel */}
      {selectedRoom && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-gray-900">{selectedRoom.name}</span>
              <span className="text-xs text-gray-500 ml-2">{selectedRoom.memberCount} member{selectedRoom.memberCount !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {loadingDetail ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">Loading group detail…</div>
          ) : detailError ? (
            <div className="px-5 py-8 text-center text-red-500 text-sm">{detailError}</div>
          ) : selectedDetail ? (
            <>
              {/* Members */}
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
                  Members ({selectedDetail.members.length})
                </div>
                {selectedDetail.members.length === 0 ? (
                  <p className="text-sm text-gray-400">No members found.</p>
                ) : (
                  <div className="space-y-1.5">
                    {selectedDetail.members.map(m => (
                      <div key={m.userId} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="w-6 h-6 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                          {(m.preferredName || 'M')[0].toUpperCase()}
                        </span>
                        <span className="flex-1">{m.preferredName || <span className="text-gray-400 italic">No name set</span>}</span>
                        <span className="text-gray-400 text-xs capitalize">{m.role}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Invite Credentials */}
              <div className="px-5 py-4 border-b border-gray-100">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Invite Credentials</div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="text-gray-500 w-20 shrink-0">Invite code</span>
                    <code className="text-gray-900 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200 tracking-widest">
                      {selectedDetail.inviteCode || <span className="text-gray-400 italic">none</span>}
                    </code>
                  </div>
                  {selectedDetail.inviteToken && (
                    <div className="flex items-start gap-3 text-sm">
                      <span className="text-gray-500 w-20 shrink-0">Invite link</span>
                      <code className="text-gray-600 font-mono bg-gray-50 px-2 py-0.5 rounded border border-gray-200 text-xs break-all">
                        /rooms/join/{selectedDetail.inviteToken}
                      </code>
                    </div>
                  )}
                </div>
              </div>

              {/* Linked Journeys */}
              {selectedDetail.linkedJourneys.length > 0 && (
                <div className="px-5 py-4 border-b border-gray-100">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Linked Journeys</div>
                  <div className="space-y-1.5">
                    {selectedDetail.linkedJourneys.map(lj => (
                      <div key={lj.journeyId} className="flex items-center gap-2 text-sm text-gray-700">
                        <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                        <span className="flex-1 font-mono text-xs text-gray-600">{lj.journeyId}</span>
                        <span className="text-gray-400 text-xs">
                          Started {new Date(lj.startedAt).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Post Moderation — coming soon */}
              <div className="px-5 py-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">Post Moderation</div>
                <p className="text-sm text-gray-400 italic">Coming soon — post reporting and moderation tools are not yet available.</p>
              </div>
            </>
          ) : null}
        </div>
      )}

      <p className="text-[12px] text-gray-400 text-center">
        Admin view does not expose private reflections, prayers, or personal journey data.
      </p>
    </div>
  );
}
