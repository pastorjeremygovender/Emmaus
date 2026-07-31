import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import {
  ArrowLeft, Share2, Settings, LogOut, Trash2,
  MessageSquare, Crown, Loader2, BookOpen
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { RoomDetail as RoomDetailType, RoomMember } from '@/lib/rooms-types';

export default function RoomDetail() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { loadRoomDetail, leaveRoom, deleteRoom, removeMember } = useRooms();
  const { getJourney } = useJourney();
  const [, setLocation] = useLocation();

  const [room, setRoom] = useState<RoomDetailType | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actioning, setActioning] = useState(false);

  useEffect(() => {
    if (!roomId || !user) return;
    loadRoomDetail(String(roomId)).then(detail => {
      if (!detail) setLoadError('Room not found or you are not a member.');
      else setRoom(detail);
    });
  }, [roomId, user, loadRoomDetail]);

  if (!user || !roomId) return null;

  if (loadError) {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">{loadError}</p>
        <Button onClick={() => setLocation('/rooms')}>Back to Rooms</Button>
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

  const isAdmin = room.currentUserRole === 'admin';

  const handleLeave = async () => {
    setActioning(true);
    try {
      await leaveRoom(String(roomId), user.id);
      setLocation('/rooms');
    } catch (err) {
      setActioning(false);
      alert(err instanceof Error ? err.message : 'Failed to leave room');
    }
  };

  const handleDelete = async () => {
    setActioning(true);
    try {
      await deleteRoom(String(roomId), user.id);
      setLocation('/rooms');
    } catch (err) {
      setActioning(false);
      alert(err instanceof Error ? err.message : 'Failed to delete room');
    }
  };

  const handleRemoveMember = async (member: RoomMember) => {
    if (!window.confirm(`Remove ${member.preferredName} from this Room?`)) return;
    try {
      await removeMember(String(roomId), member.userId, user.id);
      setRoom(prev => prev ? {
        ...prev,
        members: prev.members.filter(m => m.userId !== member.userId),
        memberCount: prev.memberCount - 1,
      } : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const openChat = () => {
    setLocation(`/rooms/${roomId}/chat`);
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto gap-3">
          <button
            onClick={() => setLocation('/rooms')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-sans font-semibold text-[17px] truncate">{room.name}</div>
            <div className="text-[12px] text-muted-foreground capitalize">{room.currentUserRole}</div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setLocation(`/rooms/${roomId}/invite`)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Invite members"
            >
              <Share2 size={20} />
            </button>
          )}
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-10">

        {/* Chat */}
        <section>
          <button
            onClick={openChat}
            className="w-full text-left p-5 rounded-2xl border border-primary/25 bg-primary/5 hover:border-primary/40 transition-all flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <MessageSquare size={20} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-semibold text-foreground">Room Chat</div>
              <div className="text-[13px] text-muted-foreground">Talk with your Room members</div>
            </div>
            <ArrowLeft size={16} className="text-muted-foreground rotate-180 shrink-0" />
          </button>
        </section>

        {/* Linked Journeys */}
        {room.linkedJourneys.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Journeys Walking Together
            </h2>
            <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
              {room.linkedJourneys.map(lj => {
                const journey = getJourney(lj.journeyId);
                const title = journey?.title ?? lj.journeyId;
                return (
                  <div key={lj.journeyId} className="flex items-center gap-3.5 px-5 py-4">
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <BookOpen size={16} className="text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-medium text-foreground truncate">{title}</div>
                      <div className="text-[12px] text-muted-foreground">
                        Started {new Date(lj.startedAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Members */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Members ({room.members.length})
            </h2>
            {isAdmin && (
              <button
                onClick={() => setLocation(`/rooms/${roomId}/invite`)}
                className="text-[13px] text-primary font-medium hover:underline"
              >
                Invite Members
              </button>
            )}
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
            {room.members.map(m => {
              const isMe = m.userId === user.id;
              const displayName = isMe
                ? `${m.preferredName || 'You'} (you)`
                : m.preferredName || 'Member';
              const initials = (m.preferredName || 'M')
                .split(' ')
                .map(w => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();
              return (
                <div key={m.userId} className="flex items-center gap-3.5 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-[13px] font-semibold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-foreground truncate">{displayName}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {m.role === 'admin' && <Crown size={11} className="text-amber-500" />}
                      <span className="text-[12px] text-muted-foreground capitalize">{m.role}</span>
                    </div>
                  </div>
                  {isAdmin && !isMe && (
                    <button
                      onClick={() => handleRemoveMember(m)}
                      className="text-[12px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Room actions */}
        <section className="space-y-3 pt-2 pb-4">
          {isAdmin && (
            <>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl"
                onClick={() => setLocation(`/rooms/${roomId}/invite`)}
              >
                <Share2 size={16} className="mr-2" />
                Invite Members
              </Button>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl"
                onClick={() => setLocation(`/rooms/${roomId}/settings`)}
              >
                <Settings size={16} className="mr-2" />
                Room Settings
              </Button>
            </>
          )}

          {/* Leave Room (non-admin only) */}
          {!isAdmin && !confirmLeave && (
            <Button
              variant="ghost"
              className="w-full h-11 rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmLeave(true)}
            >
              <LogOut size={16} className="mr-2" />
              Leave Room
            </Button>
          )}
          {!isAdmin && confirmLeave && (
            <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
              <p className="text-[15px] font-medium text-foreground">Leave this Room?</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                You'll lose access to Room chat. Your personal journey progress is preserved.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 rounded-xl"
                  onClick={handleLeave}
                  disabled={actioning}
                >
                  {actioning ? 'Leaving…' : 'Leave Room'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setConfirmLeave(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Admin: delete */}
          {isAdmin && !confirmDelete && (
            <Button
              variant="ghost"
              className="w-full h-11 rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={16} className="mr-2" />
              Delete Room
            </Button>
          )}
          {isAdmin && confirmDelete && (
            <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
              <p className="text-[15px] font-medium text-foreground">Delete this Room permanently?</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                This removes the Room and all its chat messages. Member journey progress is preserved.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  className="flex-1 rounded-xl"
                  onClick={handleDelete}
                  disabled={actioning}
                >
                  {actioning ? 'Deleting…' : 'Delete Room'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {isAdmin && !confirmDelete && (
            <p className="text-center text-[12px] text-muted-foreground">
              As admin, transfer admin to another member before leaving.
            </p>
          )}
        </section>

      </main>
      <BottomNav />
    </div>
  );
}
