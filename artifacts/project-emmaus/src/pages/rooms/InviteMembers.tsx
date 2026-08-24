import { useState, useEffect } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { goBackOrFallback } from '@/lib/return-context';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Check, Share2, Loader2 } from 'lucide-react';
import type { RoomDetail } from '@/lib/rooms-types';
import { getPublicUrl } from '@/lib/api';

export default function InviteMembers() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { loadRoomDetail } = useRooms();
  const [, setLocation] = useLocation();

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const [loadError, setLoadError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    if (!roomId || !user) return;
    loadRoomDetail(String(roomId)).then(detail => {
      if (!detail) { setLoadError('Group not found.'); return; }
      if (detail.currentUserRole !== 'admin') { setLoadError('Only the Group leader can invite members.'); return; }
      setRoom(detail);
    });
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

  const inviteLink = getPublicUrl(`/join-room/${room.inviteToken}`);

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(room.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${room.name} on Emmaus`,
          text: `You've been invited to join ${room.name}. Access code: ${room.inviteCode}`,
          url: inviteLink,
        });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
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
          <div className="flex-1 text-center font-medium text-sm">Invite Members</div>
          <div className="w-10" />
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-8 pb-8">
        <div className="space-y-1">
          <h1 className="text-[24px] font-sans font-semibold">Invite Members</h1>
          <p className="text-[15px] text-muted-foreground">
            Share the link or code with people you'd like to join <strong>{room.name}</strong>.
          </p>
        </div>

        <div className="space-y-5">
          {/* Access Code */}
          <div className="p-6 bg-card border border-border rounded-2xl space-y-3">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Access Code
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[32px] font-mono font-bold tracking-[0.2em] text-foreground">
                {room.inviteCode}
              </span>
              <button
                onClick={copyCode}
                className="flex items-center gap-1.5 text-[13px] text-primary font-medium hover:underline transition-colors px-3 py-1.5"
              >
                {copiedCode ? <Check size={15} /> : <Copy size={15} />}
                {copiedCode ? 'Copied!' : 'Copy Code'}
              </button>
            </div>
            <p className="text-[12px] text-muted-foreground">
              Anyone with this code can join your Group.
            </p>
          </div>

          {/* Invite Link */}
          <div className="p-5 bg-card border border-border rounded-2xl space-y-3">
            <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Invitation Link
            </div>
            <p className="text-[13px] text-muted-foreground break-all leading-relaxed font-mono">
              {inviteLink}
            </p>
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 text-[13px] text-primary font-medium hover:underline transition-colors"
            >
              {copiedLink ? <Check size={15} /> : <Copy size={15} />}
              {copiedLink ? 'Link Copied!' : 'Copy Link'}
            </button>
          </div>

          {/* Primary share */}
          <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={handleShare}>
            <Share2 size={17} className="mr-2" />
            Share Invitation
          </Button>
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
