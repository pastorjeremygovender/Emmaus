import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { Button } from '@/components/ui/button';
import { Users, Crown, AlertCircle } from 'lucide-react';
import { DEMO_USER_2 } from '@/lib/rooms-demo-data';
import type { Room, RoomInvite } from '@/lib/rooms-types';

const DEMO_NAMES: Record<string, string> = {
  'demo-user-1': 'Friend',
  'demo-user-2': DEMO_USER_2.preferredName,
  'demo-admin-1': 'Jeremy',
};

type Status = 'loading' | 'valid' | 'invalid' | 'already-member' | 'joined';

export default function JoinByLink() {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const { user } = useAuth();
  const { findInviteByToken, getRoom, getRoomMembers, joinRoomByToken } = useRooms();
  const [, setLocation] = useLocation();

  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ room: Room; invite: RoomInvite } | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!inviteToken) { setStatus('invalid'); setError('No invite token provided.'); return; }
    const invite = findInviteByToken(inviteToken);
    if (!invite) { setStatus('invalid'); setError('This invitation is not valid.'); return; }
    if (invite.revokedAt) { setStatus('invalid'); setError('This invitation has been revoked.'); return; }
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      setStatus('invalid'); setError('This invitation has expired.'); return;
    }
    const room = getRoom(invite.roomId);
    if (!room || room.status !== 'active') { setStatus('invalid'); setError('This Room no longer exists.'); return; }
    if (user) {
      const alreadyMember = getRoomMembers(room.id).find(m => m.userId === user.id);
      if (alreadyMember) { setStatus('already-member'); setPreview({ room, invite }); return; }
    }
    setPreview({ room, invite });
    setStatus('valid');
  }, [inviteToken, user]);

  const handleJoin = () => {
    if (!user) { setLocation('/auth'); return; }
    if (!inviteToken) return;
    setJoining(true);
    const result = joinRoomByToken(user.id, inviteToken);
    if (result.success) {
      setStatus('joined');
    } else {
      setError(result.error ?? 'Something went wrong. Please try again.');
      setStatus('invalid');
    }
    setJoining(false);
  };

  if (status === 'loading') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="text-muted-foreground text-[15px]">Checking invitation…</div>
      </div>
    );
  }

  if (status === 'invalid') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-[320px]">
          <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle size={26} className="text-destructive" />
          </div>
          <h1 className="text-[22px] font-serif font-semibold">Invalid Invitation</h1>
          <p className="text-[15px] text-muted-foreground">{error}</p>
          <Button className="w-full rounded-2xl" onClick={() => setLocation('/rooms')}>
            Back to Rooms
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'already-member' && preview) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-[320px]">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={26} className="text-primary" />
          </div>
          <h1 className="text-[22px] font-serif font-semibold">You're already in this Room</h1>
          <p className="text-[16px] font-medium text-foreground">{preview.room.name}</p>
          <Button className="w-full rounded-2xl" onClick={() => setLocation(`/rooms/${preview.room.id}`)}>
            Open Room
          </Button>
        </div>
      </div>
    );
  }

  if (status === 'joined' && preview) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-5 max-w-[320px]">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={30} className="text-primary" />
          </div>
          <h1 className="text-[24px] font-serif font-semibold">You've joined!</h1>
          <p className="text-[16px] font-medium text-foreground">{preview.room.name}</p>
          <p className="text-[14px] text-muted-foreground">
            Your personal journey progress and private content remain yours alone.
          </p>
          <Button className="w-full rounded-2xl h-12" onClick={() => setLocation(`/rooms/${preview.room.id}`)}>
            Open Room
          </Button>
        </div>
      </div>
    );
  }

  // Valid — show confirmation
  if (!preview) return null;
  const ownerName = DEMO_NAMES[preview.room.ownerId] || 'Room Owner';
  const members = getRoomMembers(preview.room.id);

  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-[400px] space-y-7">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={26} className="text-primary" />
          </div>
          <p className="text-[14px] text-muted-foreground">You've been invited to join</p>
          <h1 className="text-[28px] font-serif font-bold text-foreground">{preview.room.name}</h1>
        </div>

        <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-[14px] text-muted-foreground">Invited by</span>
            <div className="flex items-center gap-1.5">
              <Crown size={13} className="text-amber-500" />
              <span className="text-[14px] font-medium text-foreground">{ownerName}</span>
            </div>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-[14px] text-muted-foreground">Room type</span>
            <span className="text-[14px] font-medium text-foreground">{preview.room.type}</span>
          </div>
          <div className="flex items-center justify-between px-5 py-4">
            <span className="text-[14px] text-muted-foreground">Members</span>
            <span className="text-[14px] font-medium text-foreground">{members.length}</span>
          </div>
        </div>

        <div className="p-4 bg-muted/40 rounded-xl">
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Joining this Room will never expose your private reflections, prayer requests, or personal content to other members.
          </p>
        </div>

        <div className="space-y-3">
          <Button
            className="w-full h-12 rounded-2xl text-[16px]"
            onClick={handleJoin}
            disabled={joining}
          >
            {joining ? 'Joining…' : 'Join Room'}
          </Button>
          <Button
            variant="outline"
            className="w-full h-11 rounded-2xl"
            onClick={() => setLocation('/rooms')}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
