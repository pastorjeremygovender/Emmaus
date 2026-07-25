import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { useJourney } from '@/contexts/JourneyContext';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import {
  ArrowLeft, Users, Share2, Settings, LogOut, Trash2,
  ChevronRight, CheckCircle2, Clock, Minus, Crown, Shield
} from 'lucide-react';
import { DEMO_USER_2 } from '@/lib/rooms-demo-data';
import type { RoomJourneyInvitation } from '@/lib/rooms-types';

// Map known user IDs to display names for demo mode
const DEMO_NAMES: Record<string, string> = {
  'demo-user-1': 'Friend',
  'demo-user-2': DEMO_USER_2.preferredName,
  'demo-admin-1': 'Jeremy',
};

function displayName(userId: string, currentUser: { id: string; preferredName: string } | null) {
  if (currentUser && userId === currentUser.id) return `${currentUser.preferredName} (you)`;
  return DEMO_NAMES[userId] || `Member`;
}

export default function RoomDetail() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const {
    getRoom, getRoomMembers, getJourneyInvitations, getParticipants, getMyParticipation,
    canInvite, canManage, getMyMembership,
    joinJourneyInvitation, declineJourneyInvitation,
    leaveRoom, deleteRoom, archiveRoom,
    getPendingJourneyInvitations,
  } = useRooms();
  const { getJourney, progress } = useJourney();
  const [, setLocation] = useLocation();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!user || !roomId) return null;

  const room = getRoom(roomId);
  if (!room || room.status === 'deleted') {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">Room not found.</p>
        <Button onClick={() => setLocation('/rooms')}>Back to Rooms</Button>
      </div>
    );
  }

  const members = getRoomMembers(roomId);
  const myMembership = getMyMembership(roomId, user.id);
  if (!myMembership) {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">You are not a member of this Room.</p>
        <Button onClick={() => setLocation('/rooms')}>Back to Rooms</Button>
      </div>
    );
  }

  const isOwner = myMembership.role === 'Owner';
  const isLeaderOrOwner = canInvite(roomId, user.id);

  const journeyInvites = getJourneyInvitations(roomId);
  const openInvites = journeyInvites.filter(ji => ji.status === 'open');
  const closedInvites = journeyInvites.filter(ji => ji.status !== 'open');
  const myPendingInvites = getPendingJourneyInvitations(roomId, user.id);

  const handleLeave = () => {
    if (isOwner) return; // Cannot leave as owner
    leaveRoom(roomId, user.id);
    setLocation('/rooms');
  };

  const handleDelete = () => {
    deleteRoom(roomId, user.id);
    setLocation('/rooms');
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-28">
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
            <div className="text-[12px] text-muted-foreground">{room.type} · {myMembership.role}</div>
          </div>
          {isLeaderOrOwner && (
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

        {/* Pending Journey Invitations — needs my response */}
        {myPendingInvites.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Journey Invitations
            </h2>
            {myPendingInvites.map(ji => {
              const journey = getJourney(ji.journeyId);
              const inviterName = displayName(ji.createdBy, user);
              return (
                <div key={ji.id} className="p-5 rounded-2xl border border-primary/20 bg-primary/5 space-y-4">
                  <div>
                    <p className="text-[13px] text-muted-foreground">
                      {inviterName} has invited {room.name} to begin:
                    </p>
                    <h3 className="text-[18px] font-sans font-semibold text-foreground mt-1">
                      {journey?.title ?? ji.journeyId}
                    </h3>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 rounded-xl"
                      onClick={() => { joinJourneyInvitation(ji.id, user.id); }}
                    >
                      Join Journey
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1 rounded-xl"
                      onClick={() => { declineJourneyInvitation(ji.id, user.id); }}
                    >
                      Maybe Later
                    </Button>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* Active Shared Journeys */}
        {openInvites.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Active Shared Journeys
            </h2>
            {openInvites.map(ji => (
              <SharedJourneyCard
                key={ji.id}
                ji={ji}
                roomId={roomId}
                userId={user.id}
                onClick={() => setLocation(`/rooms/${roomId}/journey/${ji.journeyId}/view`)}
              />
            ))}
          </section>
        )}

        {/* Members */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Members ({members.length})
            </h2>
            {isLeaderOrOwner && (
              <button
                onClick={() => setLocation(`/rooms/${roomId}/invite`)}
                className="text-[13px] text-primary font-medium hover:underline"
              >
                Invite Members
              </button>
            )}
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
            {members.map(m => {
              const name = displayName(m.userId, user);
              const initials = name.replace(' (you)', '').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
              return (
                <div key={m.id} className="flex items-center gap-3.5 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-[13px] font-semibold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-foreground truncate">{name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {m.role === 'Owner' && <Crown size={11} className="text-amber-500" />}
                      {m.role === 'Leader' && <Shield size={11} className="text-primary" />}
                      <span className="text-[12px] text-muted-foreground">{m.role}</span>
                    </div>
                  </div>
                  {isOwner && m.userId !== user.id && (
                    <button
                      onClick={() => {
                        if (window.confirm(`Remove ${name} from this Room?`)) {
                          // removeMember handled in future full impl
                        }
                      }}
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

        {/* Completed Journeys */}
        {closedInvites.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Completed Journeys
            </h2>
            {closedInvites.map(ji => {
              const journey = getJourney(ji.journeyId);
              return (
                <div key={ji.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card opacity-70">
                  <CheckCircle2 size={18} className="text-primary shrink-0" />
                  <span className="text-[15px] text-foreground">{journey?.title ?? ji.journeyId}</span>
                </div>
              );
            })}
          </section>
        )}

        {/* Room actions */}
        <section className="space-y-3 pt-2 pb-4">
          {isLeaderOrOwner && (
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl"
              onClick={() => setLocation(`/rooms/${roomId}/invite`)}
            >
              <Share2 size={16} className="mr-2" />
              Invite Members
            </Button>
          )}
          {isOwner && (
            <Button
              variant="outline"
              className="w-full h-11 rounded-xl"
              onClick={() => setLocation(`/rooms/${roomId}/settings`)}
            >
              <Settings size={16} className="mr-2" />
              Room Settings
            </Button>
          )}

          {/* Leave Room */}
          {!isOwner && !confirmLeave && (
            <Button
              variant="ghost"
              className="w-full h-11 rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmLeave(true)}
            >
              <LogOut size={16} className="mr-2" />
              Leave Room
            </Button>
          )}
          {!isOwner && confirmLeave && (
            <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
              <p className="text-[15px] font-medium text-foreground">Leave this Room?</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                You'll lose access to Room discussion. Your personal journey progress will be preserved.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="flex-1 rounded-xl" onClick={handleLeave}>
                  Leave Room
                </Button>
                <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmLeave(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Owner: delete */}
          {isOwner && !confirmDelete && (
            <Button
              variant="ghost"
              className="w-full h-11 rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={16} className="mr-2" />
              Delete Room
            </Button>
          )}
          {isOwner && confirmDelete && (
            <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
              <p className="text-[15px] font-medium text-foreground">Delete this Room permanently?</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                This will archive membership and revoke all invitations. Personal journey progress and private content for all members will be preserved.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="flex-1 rounded-xl" onClick={handleDelete}>
                  Delete Room
                </Button>
                <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {isOwner && (
            <p className="text-center text-[12px] text-muted-foreground">
              As Owner, you must transfer ownership or delete the Room before leaving.
            </p>
          )}
        </section>

      </main>
      <BottomNav />
    </div>
  );
}

function SharedJourneyCard({ ji, roomId, userId, onClick }: { ji: RoomJourneyInvitation; roomId: string; userId: string; onClick: () => void }) {
  const { getJourney } = useJourney();
  const { getParticipants, getMyParticipation } = useRooms();
  const journey = getJourney(ji.journeyId);
  const participants = getParticipants(ji.id);
  const myParticipation = getMyParticipation(ji.id, userId);
  const joinedCount = participants.filter(p => p.participationStatus === 'joined').length;

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all space-y-3"
    >
      <div>
        <h3 className="text-[17px] font-sans font-semibold text-foreground">{journey?.title ?? ji.journeyId}</h3>
        <p className="text-[13px] text-muted-foreground mt-1">
          {joinedCount} {joinedCount === 1 ? 'person' : 'people'} walking this journey
          {myParticipation?.participationStatus === 'joined' ? " · You're in" : ''}
        </p>
      </div>
      <div className="flex items-center justify-between text-[13px] text-muted-foreground">
        <span>View progress & discussion</span>
        <ChevronRight size={16} />
      </div>
    </button>
  );
}
