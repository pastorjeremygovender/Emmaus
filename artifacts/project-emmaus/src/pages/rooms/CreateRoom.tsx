import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Check } from 'lucide-react';
import type { RoomType, InviteExpiry, Room, RoomInvite } from '@/lib/rooms-types';

const ROOM_TYPES: RoomType[] = ['Family', 'Friends', 'Couple', 'Small Group', 'Ministry Team', 'Other'];
const EXPIRY_OPTIONS: { value: InviteExpiry; label: string }[] = [
  { value: '24h', label: '24 hours' },
  { value: '7d', label: '7 days' },
  { value: 'never', label: 'Never expires' },
];

type Phase = 'form' | 'success';

export default function CreateRoom() {
  const { user } = useAuth();
  const { createRoom, getRoomInvite } = useRooms();
  const [, setLocation] = useLocation();

  const [phase, setPhase] = useState<Phase>('form');
  const [name, setName] = useState('');
  const [type, setType] = useState<RoomType>('Family');
  const [expiry, setExpiry] = useState<InviteExpiry>('7d');
  const [error, setError] = useState('');
  const [createdRoom, setCreatedRoom] = useState<Room | null>(null);
  const [createdInvite, setCreatedInvite] = useState<RoomInvite | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!user) return null;

  const handleCreate = () => {
    if (!name.trim()) { setError('Please enter a Room name.'); return; }
    setError('');
    const room = createRoom(user.id, name.trim(), type, expiry);
    setCreatedRoom(room);
    // Invite is created atomically inside createRoom; read it back
    setTimeout(() => {
      const inv = getRoomInvite(room.id);
      setCreatedInvite(inv ?? null);
    }, 50);
    setPhase('success');
  };

  const inviteLink = createdInvite
    ? `${window.location.origin}${import.meta.env.BASE_URL}join-room/${createdInvite.token}`
    : '';

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyCode = async () => {
    if (!createdInvite) return;
    await navigator.clipboard.writeText(createdInvite.accessCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${createdRoom?.name} on Emmaus`,
          text: `You've been invited to join ${createdRoom?.name}. Access code: ${createdInvite?.accessCode}`,
          url: inviteLink,
        });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  };

  if (phase === 'success' && createdRoom) {
    return (
      <div className="min-h-[100dvh] bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
          <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
            <div className="flex-1 text-center font-medium text-sm">Room Created</div>
          </div>
        </header>
        <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={30} className="text-primary" strokeWidth={2.5} />
            </div>
            <h1 className="text-[26px] font-serif font-semibold">{createdRoom.name}</h1>
            <p className="text-[15px] text-muted-foreground">{createdRoom.type} Room</p>
          </div>

          <p className="text-center text-[15px] text-muted-foreground leading-relaxed">
            Your Room is ready. Share the invitation link or access code with people you'd like to join.
          </p>

          {createdInvite && (
            <div className="space-y-4">
              {/* Access Code */}
              <div className="p-5 bg-card border border-border rounded-2xl space-y-2">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Access Code
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[28px] font-mono font-bold tracking-widest text-foreground">
                    {createdInvite.accessCode}
                  </span>
                  <button
                    onClick={copyCode}
                    className="flex items-center gap-1.5 text-[13px] text-primary font-medium hover:underline"
                  >
                    {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                    {copiedCode ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Invite Link */}
              <div className="p-5 bg-card border border-border rounded-2xl space-y-3">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Invitation Link
                </div>
                <p className="text-[13px] text-muted-foreground break-all leading-relaxed">{inviteLink}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl"
                  onClick={copyLink}
                >
                  {copiedLink ? <><Check size={14} className="mr-1.5" /> Copied</> : <><Copy size={14} className="mr-1.5" /> Copy Link</>}
                </Button>
              </div>

              <Button className="w-full h-12 rounded-2xl" onClick={handleShare}>
                Share Invitation
              </Button>
            </div>
          )}

          <Button
            variant="outline"
            className="w-full h-11 rounded-2xl"
            onClick={() => setLocation(`/rooms/${createdRoom.id}`)}
          >
            Open Room
          </Button>
        </main>
        <BottomNav />
      </div>
    );
  }

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
          <div className="flex-1 text-center font-medium text-sm">Create a Room</div>
          <div className="w-10" />
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-8 pb-8">
        <div className="space-y-1">
          <h1 className="text-[26px] font-serif font-semibold">Create a Room</h1>
          <p className="text-[15px] text-muted-foreground">
            Rooms let you do journeys with family, friends or a group.
          </p>
        </div>

        {/* Room Name */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Room Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            placeholder="e.g. The Govender Family"
            className="w-full h-12 px-4 rounded-xl border border-border bg-card text-[16px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            maxLength={60}
          />
          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>

        {/* Room Type */}
        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Room Type (optional)
          </label>
          <div className="grid grid-cols-2 gap-2">
            {ROOM_TYPES.map(t => (
              <button
                key={t}
                onClick={() => setType(t)}
                className={`px-4 py-3 rounded-xl border text-[14px] font-medium text-left transition-all ${
                  type === t ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card text-foreground hover:border-primary/40'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {/* Invite Expiry */}
        <div className="space-y-3">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Invite Expiry
          </label>
          <div className="space-y-2">
            {EXPIRY_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setExpiry(opt.value)}
                className={`w-full px-4 py-3.5 rounded-xl border text-[14px] text-left font-medium transition-all ${
                  expiry === opt.value ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card text-foreground hover:border-primary/40'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={handleCreate}>
          Create Room
        </Button>
      </main>
      <BottomNav />
    </div>
  );
}
