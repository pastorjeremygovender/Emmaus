import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { Users, Bell, Plus, LogIn, ChevronRight } from 'lucide-react';
import type { Room } from '@/lib/rooms-types';

export default function Rooms() {
  const { user } = useAuth();
  const {
    getMyRooms, getRoomMembers, getJourneyInvitations,
    getMyNotifications, getUnreadCount, markAllNotificationsRead,
    journeyInvitations, journeyParticipants, getPendingJourneyInvitations,
  } = useRooms();
  const [, setLocation] = useLocation();

  if (!user) return null;

  const myRooms = getMyRooms(user.id);
  const unread = getUnreadCount(user.id);
  const myNotifications = getMyNotifications(user.id).slice(0, 5);

  // Journey invitations across all my rooms that need my response
  const pendingJourneyInvites = myRooms.flatMap(room =>
    getPendingJourneyInvitations(room.id, user.id).map(ji => ({ ji, room }))
  );

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <main className="px-5 pt-12 max-w-[480px] mx-auto space-y-10">

        {/* Header */}
        <header className="flex items-center justify-between">
          <h1 className="text-[30px] font-serif font-medium tracking-tight">My Rooms</h1>
          {unread > 0 && (
            <button
              onClick={() => markAllNotificationsRead(user.id)}
              className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={`${unread} unread notifications`}
            >
              <Bell size={22} />
              <span className="absolute top-1 right-1 w-4 h-4 bg-primary text-primary-foreground text-[10px] font-bold rounded-full flex items-center justify-center">
                {unread}
              </span>
            </button>
          )}
        </header>

        {/* Notifications */}
        {unread > 0 && (
          <section className="space-y-2">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Notifications
            </h2>
            <div className="space-y-2">
              {myNotifications.filter(n => !n.read).map(n => (
                <div key={n.id} className="p-4 rounded-xl bg-primary/5 border border-primary/15 space-y-1">
                  <p className="text-[14px] text-foreground leading-relaxed">{n.message}</p>
                  <p className="text-[12px] text-muted-foreground">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pending Journey Invitations */}
        {pendingJourneyInvites.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Journey Invitations
            </h2>
            <div className="space-y-2.5">
              {pendingJourneyInvites.map(({ ji, room }) => (
                <div
                  key={ji.id}
                  className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-3"
                >
                  <div>
                    <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
                      {room.name}
                    </span>
                    <p className="text-[15px] font-medium text-foreground mt-1">
                      You've been invited to join a shared journey
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() => setLocation(`/rooms/${room.id}`)}
                    >
                      View Invitation
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* My Rooms */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Rooms I Belong To
          </h2>
          {myRooms.length === 0 ? (
            <div className="p-10 border border-dashed border-border rounded-2xl text-center space-y-2">
              <Users size={32} className="text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                You're not in any Rooms yet.
              </p>
              <p className="text-[13px] text-muted-foreground">
                Create one or join a Room using an invitation link or access code.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {myRooms.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  memberCount={getRoomMembers(room.id).length}
                  activeJourneys={getJourneyInvitations(room.id).filter(ji => ji.status === 'open').length}
                  myRole={useRoomRole(room.id, user.id)}
                  onClick={() => setLocation(`/rooms/${room.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="space-y-3 pb-4">
          <Button
            className="w-full h-12 rounded-2xl text-[16px]"
            onClick={() => setLocation('/rooms/create')}
          >
            <Plus size={18} className="mr-2" />
            Create a Room
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 rounded-2xl text-[16px]"
            onClick={() => setLocation('/rooms/join')}
          >
            <LogIn size={18} className="mr-2" />
            Join a Room
          </Button>
        </section>

      </main>
      <BottomNav />
    </div>
  );
}

function useRoomRole(roomId: string, userId: string) {
  const { getMyMembership } = useRooms();
  return getMyMembership(roomId, userId)?.role ?? 'Member';
}

function RoomCard({
  room, memberCount, activeJourneys, myRole, onClick
}: {
  room: Room;
  memberCount: number;
  activeJourneys: number;
  myRole: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-5 rounded-2xl border border-border bg-card shadow-sm hover:border-primary/30 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold text-primary uppercase tracking-widest">
              {room.type}
            </span>
            <span className="text-[11px] text-muted-foreground">·</span>
            <span className="text-[11px] text-muted-foreground">{myRole}</span>
          </div>
          <h3 className="text-[18px] font-serif font-semibold text-foreground truncate">{room.name}</h3>
          <div className="flex items-center gap-3 mt-2 text-[13px] text-muted-foreground">
            <span>{memberCount} {memberCount === 1 ? 'member' : 'members'}</span>
            {activeJourneys > 0 && (
              <>
                <span>·</span>
                <span>{activeJourneys} active {activeJourneys === 1 ? 'journey' : 'journeys'}</span>
              </>
            )}
          </div>
        </div>
        <ChevronRight size={18} className="text-muted-foreground mt-1 shrink-0" />
      </div>
    </button>
  );
}
