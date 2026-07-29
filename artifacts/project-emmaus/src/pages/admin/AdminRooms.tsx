import { useState } from 'react';
import { useRooms } from '@/contexts/RoomsContext';
import { DEMO_USER_2 } from '@/lib/rooms-demo-data';

const DEMO_NAMES: Record<string, string> = {
  'demo-user-1': 'Member',
  'demo-user-2': DEMO_USER_2.preferredName,
  'demo-admin-1': 'Jeremy (Admin)',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  archived: 'bg-gray-50 text-gray-600 border-gray-200',
  deleted: 'bg-red-50 text-red-700 border-red-200',
};

export default function AdminRooms() {
  const {
    getAllRoomsForAdmin, getRoomMembers, getJourneyInvitations,
    adminArchiveRoom, adminRevokeInvite, adminRemovePost,
    invites, posts,
  } = useRooms();

  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);

  const allRooms = getAllRoomsForAdmin();

  const selectedRoom = selectedRoomId ? allRooms.find(r => r.id === selectedRoomId) : null;
  const selectedMembers = selectedRoomId ? getRoomMembers(selectedRoomId) : [];
  const selectedInvites = selectedRoomId ? invites.filter(i => i.roomId === selectedRoomId) : [];
  const selectedJourneys = selectedRoomId ? getJourneyInvitations(selectedRoomId) : [];
  const reportedPosts = posts.filter(p => p.status === 'active'); // Demo: show all active posts

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Rooms</h1>
        <p className="text-sm text-gray-500 mt-1">Support and moderation for Emmaus Rooms.</p>
      </div>

      {/* Room Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">All Rooms</span>
        </div>
        {allRooms.length === 0 ? (
          <div className="px-5 py-10 text-center text-gray-400 text-sm">No Rooms created yet.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {allRooms.map(room => {
              const members = getRoomMembers(room.id);
              const ownerName = DEMO_NAMES[room.ownerId] || 'Unknown';
              const activeJourneys = getJourneyInvitations(room.id).filter(j => j.status === 'open').length;
              return (
                <div
                  key={room.id}
                  className={`px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors ${selectedRoomId === room.id ? 'bg-teal-50' : ''}`}
                  onClick={() => setSelectedRoomId(selectedRoomId === room.id ? null : room.id)}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[15px] text-gray-900">{room.name}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded border ${STATUS_COLORS[room.status]}`}>
                          {room.status}
                        </span>
                      </div>
                      <div className="text-[13px] text-gray-500 mt-0.5">
                        {room.type} · Owner: {ownerName} · {members.length} members · {activeJourneys} active journey{activeJourneys !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <div className="text-[12px] text-gray-400">
                      {new Date(room.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Room Detail Panel */}
      {selectedRoom && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden space-y-0">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <div>
              <span className="text-sm font-semibold text-gray-900">{selectedRoom.name}</span>
              <span className="text-xs text-gray-500 ml-2">{selectedRoom.type}</span>
            </div>
            <div className="flex gap-2">
              {selectedRoom.status === 'active' && (
                confirmArchive === selectedRoom.id ? (
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { adminArchiveRoom(selectedRoom.id); setConfirmArchive(null); }}
                      className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg"
                    >
                      Confirm Archive
                    </button>
                    <button
                      onClick={() => setConfirmArchive(null)}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmArchive(selectedRoom.id)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-200"
                  >
                    Archive Room
                  </button>
                )
              )}
            </div>
          </div>

          {/* Members */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Members ({selectedMembers.length})</div>
            {selectedMembers.length === 0 ? (
              <p className="text-sm text-gray-400">No active members.</p>
            ) : (
              <div className="space-y-1.5">
                {selectedMembers.map(m => (
                  <div key={m.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className="w-5 h-5 rounded-full bg-teal-100 text-teal-700 text-[10px] font-bold flex items-center justify-center">
                      {(DEMO_NAMES[m.userId] || 'M')[0]}
                    </span>
                    <span>{DEMO_NAMES[m.userId] || m.userId}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500">{m.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Invitations */}
          <div className="px-5 py-4 border-b border-gray-100">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Invitations</div>
            {selectedInvites.length === 0 ? (
              <p className="text-sm text-gray-400">No invitations.</p>
            ) : (
              <div className="space-y-2">
                {selectedInvites.map(inv => (
                  <div key={inv.id} className="flex items-center gap-3 text-sm">
                    <code className="text-gray-700 font-mono bg-gray-50 px-2 py-0.5 rounded">{inv.accessCode}</code>
                    <span className={`text-xs ${inv.revokedAt ? 'text-red-500' : 'text-green-600'}`}>
                      {inv.revokedAt ? 'Revoked' : inv.expiresAt ? `Expires ${new Date(inv.expiresAt).toLocaleDateString()}` : 'Active (no expiry)'}
                    </span>
                    <span className="text-gray-400">Used: {inv.useCount}</span>
                    {!inv.revokedAt && (
                      <button
                        onClick={() => {
                          if (window.confirm('Revoke this invitation?')) adminRevokeInvite(inv.id);
                        }}
                        className="text-red-500 text-xs hover:underline ml-auto"
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shared Journeys */}
          {selectedJourneys.length > 0 && (
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Shared Journeys</div>
              <div className="space-y-1.5">
                {selectedJourneys.map(ji => (
                  <div key={ji.id} className="flex items-center gap-2 text-sm text-gray-700">
                    <span className={`w-2 h-2 rounded-full ${ji.status === 'open' ? 'bg-green-400' : 'bg-gray-300'}`} />
                    <span>{ji.journeyId}</span>
                    <span className="text-gray-400">·</span>
                    <span className="text-gray-500 capitalize">{ji.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reported Posts — demo: show all active posts */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">Room Posts (moderation)</span>
        </div>
        {reportedPosts.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-400 text-sm">No posts to review.</div>
        ) : (
          <div className="divide-y divide-gray-100">
            {reportedPosts.map(p => (
              <div key={p.id} className="px-5 py-4 flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-gray-400 mb-1">
                    {DEMO_NAMES[p.userId] || p.userId} · {p.journeyId} · Day {p.journeyStepId.replace('day-', '')}
                  </div>
                  <p className="text-[14px] text-gray-700 leading-relaxed">{p.body}</p>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('Remove this post?')) adminRemovePost(p.id);
                  }}
                  className="text-red-500 text-xs hover:underline shrink-0"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[12px] text-gray-400 text-center">
        Admin view does not expose private reflections, prayers, or personal journey data.
      </p>
    </div>
  );
}
