import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Crown, Loader2 } from 'lucide-react';
import { getRoomRoleLabel, isRoomLeaderRole, isRoomOwnerRole } from '@/lib/rooms-types';
import type { RoomDetail, RoomMember } from '@/lib/rooms-types';
import { goBackOrFallback } from '@/lib/return-context';

export default function RoomSettings() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { loadRoomDetail, removeMember, transferOwnership, promoteMember, demoteLeader } = useRooms();
  const [, setLocation] = useLocation();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [actioning, setActioning] = useState<string | null>(null);
  const [confirmTransfer, setConfirmTransfer] = useState<RoomMember | null>(null);

  useEffect(() => {
    if (!roomId || !user) return;
    loadRoomDetail(String(roomId)).then(detail => {
      if (!detail) { setLoadError('Group not found.'); return; }
      if (!isRoomLeaderRole(detail.currentUserRole)) { setLoadError('Only a Group Owner or Leader can access Settings.'); return; }
      setRoom(detail);
    });
  }, [roomId, user, loadRoomDetail]);

  // Re-check the authoritative role while Settings is open. A demotion or
  // ownership transfer on another device must remove owner-only controls.
  useEffect(() => {
    if (!roomId || !user) return;
    let destroyed = false;
    const refreshRoom = async () => {
      const detail = await loadRoomDetail(String(roomId));
      if (destroyed || !detail) return;
      if (!isRoomLeaderRole(detail.currentUserRole)) {
        setLoadError('Your Group role no longer allows access to Settings.');
        return;
      }
      setRoom(detail);
    };
    const timer = setInterval(refreshRoom, 30_000);
    return () => {
      destroyed = true;
      clearInterval(timer);
    };
  }, [roomId, user, loadRoomDetail]);

  if (!user || !roomId) return null;

  if (loadError) {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">{loadError}</p>
        <Button onClick={() => setLocation(`/rooms/${roomId}`)}>Back</Button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={24} className="text-muted-foreground animate-spin" />
      </div>
    );
  }

  const otherMembers = room.members.filter(m => m.userId !== user.id);
  const isOwner = isRoomOwnerRole(room.currentUserRole);

  const handleRemove = async (member: RoomMember) => {
    if (!window.confirm(`Remove ${member.preferredName || 'this member'} from this Group?`)) return;
    setActioning(member.userId);
    try {
      await removeMember(String(roomId), member.userId, user.id);
      setRoom(prev => prev ? {
        ...prev,
        members: prev.members.filter(m => m.userId !== member.userId),
        memberCount: prev.memberCount - 1,
      } : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setActioning(null);
    }
  };

  const handleTransfer = async (toMember: RoomMember) => {
    setActioning(toMember.userId);
    try {
      await transferOwnership(String(roomId), toMember.userId, user.id);
      setLocation(`/rooms/${roomId}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to transfer ownership');
      setActioning(null);
      setConfirmTransfer(null);
    }
  };

  const handleRoleChange = async (member: RoomMember, nextRole: 'leader' | 'member') => {
    setActioning(member.userId);
    try {
      if (nextRole === 'leader') {
        await promoteMember(String(roomId), member.userId, user.id);
      } else {
        await demoteLeader(String(roomId), member.userId, user.id);
      }
      const refreshed = await loadRoomDetail(String(roomId));
      if (refreshed) setRoom(refreshed);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update member role');
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => goBackOrFallback(`/rooms/${roomId}`, setLocation)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 text-center font-medium text-sm">Group Settings</div>
          <div className="w-10" />
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-9 pb-8">

        {/* Members */}
        {otherMembers.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Members
            </h2>
            <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
              {otherMembers.map(m => {
                const isActioning = actioning === m.userId;
                return (
                  <div key={m.userId} className="flex items-center gap-3 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-medium text-foreground truncate">
                        {m.preferredName || 'Member'}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {isRoomOwnerRole(m.role) && <Crown size={11} className="text-amber-500" />}
                        <span className="text-[12px] text-muted-foreground">{getRoomRoleLabel(m.role)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* Owner-only role management */}
                      {isOwner && m.role === 'member' && (
                        <button
                          onClick={() => handleRoleChange(m, 'leader')}
                          disabled={isActioning}
                          className="text-[12px] text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg"
                          title="Appoint Leader"
                        >
                          Leader
                        </button>
                      )}
                      {isOwner && m.role === 'leader' && (
                        <button
                          onClick={() => handleRoleChange(m, 'member')}
                          disabled={isActioning}
                          className="text-[12px] text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg"
                          title="Remove Leader status"
                        >
                          Member
                        </button>
                      )}
                      {isOwner && m.role !== 'owner' && m.role !== 'admin' && (
                        <button
                          onClick={() => setConfirmTransfer(m)}
                          disabled={isActioning}
                          className="text-[12px] text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg"
                          title="Transfer ownership"
                        >
                          <Crown size={14} />
                        </button>
                      )}
                      {/* Leaders may remove Members; only Owners may remove Leaders. */}
                      {(isOwner || m.role === 'member') && (
                        <button
                          onClick={() => handleRemove(m)}
                          disabled={isActioning}
                          className="text-[12px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg ml-1 disabled:opacity-40"
                          title="Remove member"
                        >
                          {isActioning ? <Loader2 size={13} className="animate-spin" /> : '×'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {otherMembers.length === 0 && (
          <div className="p-8 border border-dashed border-border rounded-2xl text-center">
            <p className="text-[15px] text-muted-foreground">You're the only member.</p>
          </div>
        )}

        {/* Transfer admin confirmation */}
        {confirmTransfer && (
          <div className="p-5 rounded-2xl border border-primary/30 bg-primary/5 space-y-4">
            <div>
              <p className="text-[15px] font-semibold text-foreground">
                 Transfer ownership to {confirmTransfer.preferredName || 'this member'}?
              </p>
              <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                 They will become the Group Owner. You will remain a Group Leader.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1 rounded-xl"
                onClick={() => handleTransfer(confirmTransfer)}
                disabled={!!actioning}
              >
                 {actioning ? <><Loader2 size={13} className="mr-1.5 animate-spin" />Transferring…</> : 'Confirm Transfer'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setConfirmTransfer(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

      </main>
      <BottomNav />
    </div>
  );
}
