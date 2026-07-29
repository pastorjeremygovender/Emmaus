import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Crown } from 'lucide-react';
import { DEMO_USER_2 } from '@/lib/rooms-demo-data';
import type { Room, RoomInvite } from '@/lib/rooms-types';

const DEMO_NAMES: Record<string, string> = {
  'demo-user-1': 'Member',
  'demo-user-2': DEMO_USER_2.preferredName,
  'demo-admin-1': 'Jeremy',
};

type Phase = 'enter-code' | 'confirm' | 'joined';

export default function JoinByCode() {
  const { user } = useAuth();
  const { findInviteByCode, getRoom, getRoomMembers, joinRoomByCode } = useRooms();
  const [, setLocation] = useLocation();

  const [phase, setPhase] = useState<Phase>('enter-code');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<{ room: Room; invite: RoomInvite } | null>(null);
  const [joining, setJoining] = useState(false);

  if (!user) return null;

  const handleLookup = () => {
    setError('');
    const invite = findInviteByCode(code);
    if (!invite) { setError('That code is not valid. Please check and try again.'); return; }
    if (invite.revokedAt) { setError('This invitation has been revoked.'); return; }
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      setError('This invitation has expired. Ask the Room owner for a new one.'); return;
    }
    const room = getRoom(invite.roomId);
    if (!room || room.status !== 'active') { setError('This Room no longer exists.'); return; }
    const alreadyMember = getRoomMembers(room.id).find(m => m.userId === user.id);
    if (alreadyMember) { setError('You are already a member of this Room.'); return; }
    setPreview({ room, invite });
    setPhase('confirm');
  };

  const handleJoin = () => {
    setJoining(true);
    const result = joinRoomByCode(user.id, code);
    if (result.success) {
      setPhase('joined');
    } else {
      setError(result.error ?? 'Something went wrong. Please try again.');
      setPhase('enter-code');
    }
    setJoining(false);
  };

  if (phase === 'joined' && preview) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-5 max-w-[340px]">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={30} className="text-primary" />
          </div>
          <h1 className="text-[24px] font-sans font-semibold">You've joined!</h1>
          <p className="text-[16px] text-foreground font-medium">{preview.room.name}</p>
          <p className="text-[14px] text-muted-foreground">
            Welcome to the Room. Your personal journey progress and private content remain yours alone.
          </p>
          <Button className="w-full rounded-2xl h-12" onClick={() => setLocation(`/rooms/${preview.room.id}`)}>
            Open Room
          </Button>
          <Button variant="outline" className="w-full rounded-2xl h-11" onClick={() => setLocation('/rooms')}>
            Back to Rooms
          </Button>
        </div>
      </div>
    );
  }

  if (phase === 'confirm' && preview) {
    const members = getRoomMembers(preview.room.id);
    const ownerName = DEMO_NAMES[preview.room.ownerId] || 'Room Owner';
    return (
      <div className="min-h-[100dvh] bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
          <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
            <button
              onClick={() => setPhase('enter-code')}
              className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            >
              <ArrowLeft size={22} />
            </button>
            <div className="flex-1 text-center font-medium text-sm">Join Room</div>
            <div className="w-10" />
          </div>
        </header>
        <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-7">
          <div className="text-center space-y-3">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
              <Users size={26} className="text-primary" />
            </div>
            <p className="text-[14px] text-muted-foreground">You've been invited to join</p>
            <h1 className="text-[26px] font-sans font-bold text-foreground">{preview.room.name}</h1>
          </div>

          <div className="bg-card border border-border rounded-2xl divide-y divide-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-[14px] text-muted-foreground">Room type</span>
              <span className="text-[14px] font-medium text-foreground">{preview.room.type}</span>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-[14px] text-muted-foreground">Invited by</span>
              <div className="flex items-center gap-1.5">
                <Crown size={13} className="text-amber-500" />
                <span className="text-[14px] font-medium text-foreground">{ownerName}</span>
              </div>
            </div>
            <div className="flex items-center justify-between px-5 py-4">
              <span className="text-[14px] text-muted-foreground">Members</span>
              <span className="text-[14px] font-medium text-foreground">{members.length}</span>
            </div>
          </div>

          <div className="p-4 bg-muted/40 rounded-xl">
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              Joining this Room will never expose your private reflections, prayer requests, Bible notes, or other personal content to other members.
            </p>
          </div>

          <div className="space-y-3">
            <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={handleJoin} disabled={joining}>
              {joining ? 'Joining…' : 'Join Room'}
            </Button>
            <Button variant="outline" className="w-full h-11 rounded-2xl" onClick={() => setPhase('enter-code')}>
              Cancel
            </Button>
          </div>
        </main>
        <BottomNav />
      </div>
    );
  }

  // Enter code
  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => setLocation('/rooms')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 text-center font-medium text-sm">Join a Room</div>
          <div className="w-10" />
        </div>
      </header>

      <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-7">
        <div className="space-y-1.5">
          <h1 className="text-[26px] font-sans font-semibold">Join a Room</h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            Enter the access code shared by a Room owner or leader.
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Room Access Code
          </label>
          <input
            type="text"
            value={code}
            onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
            placeholder="e.g. EMMAUS01"
            className="w-full h-14 px-4 rounded-xl border border-border bg-card text-[20px] font-mono font-bold tracking-widest text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 uppercase"
            maxLength={10}
            onKeyDown={e => e.key === 'Enter' && handleLookup()}
          />
          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>

        <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={handleLookup} disabled={!code.trim()}>
          Find Room
        </Button>

        <p className="text-center text-[13px] text-muted-foreground">
          Don't have a code? Ask to be invited via link.
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
