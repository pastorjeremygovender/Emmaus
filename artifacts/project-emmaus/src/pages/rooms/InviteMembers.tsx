import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Check, Share2, RefreshCw, QrCode } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import type { InviteExpiry } from '@/lib/rooms-types';

export default function InviteMembers() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { getRoom, getRoomInvite, canInvite, revokeInvite, regenerateInvite } = useRooms();
  const [, setLocation] = useLocation();

  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  if (!user || !roomId) return null;

  const room = getRoom(roomId);
  if (!room) {
    return (
      <div className="p-6 text-center mt-20">
        <p className="text-muted-foreground">Room not found.</p>
        <Button className="mt-4" onClick={() => setLocation('/rooms')}>Back</Button>
      </div>
    );
  }

  if (!canInvite(roomId, user.id)) {
    return (
      <div className="p-6 text-center mt-20">
        <p className="text-muted-foreground">You don't have permission to invite members.</p>
        <Button className="mt-4" onClick={() => setLocation(`/rooms/${roomId}`)}>Back</Button>
      </div>
    );
  }

  const invite = getRoomInvite(roomId);
  const inviteLink = invite
    ? `${window.location.origin}${import.meta.env.BASE_URL}join-room/${invite.token}`
    : '';

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const copyCode = async () => {
    if (!invite) return;
    await navigator.clipboard.writeText(invite.accessCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleShare = async () => {
    if (!invite) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${room.name} on Emmaus`,
          text: `You've been invited to join ${room.name}. Access code: ${invite.accessCode}`,
          url: inviteLink,
        });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  };

  const handleRegenerate = () => {
    if (!invite) return;
    revokeInvite(invite.id, user.id);
    regenerateInvite(roomId, user.id, 'never');
    setConfirmRevoke(false);
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => setLocation(`/rooms/${roomId}`)}
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
          <h1 className="text-[24px] font-serif font-semibold">Invite Members</h1>
          <p className="text-[15px] text-muted-foreground">Share the link or code with people you'd like to join <strong>{room.name}</strong>.</p>
        </div>

        {!invite ? (
          <div className="p-6 text-center text-muted-foreground">
            <p>No active invitation. Generate one below.</p>
            <Button className="mt-4 rounded-xl" onClick={() => regenerateInvite(roomId, user.id, 'never')}>
              Generate Invitation
            </Button>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Access Code */}
            <div className="p-6 bg-card border border-border rounded-2xl space-y-3">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Access Code</div>
              <div className="flex items-center justify-between">
                <span className="text-[32px] font-mono font-bold tracking-[0.2em] text-foreground">
                  {invite.accessCode}
                </span>
                <button
                  onClick={copyCode}
                  className="flex items-center gap-1.5 text-[13px] text-primary font-medium hover:underline transition-colors px-3 py-1.5"
                >
                  {copiedCode ? <Check size={15} /> : <Copy size={15} />}
                  {copiedCode ? 'Copied!' : 'Copy Code'}
                </button>
              </div>
              {invite.expiresAt && (
                <p className="text-[12px] text-muted-foreground">
                  Expires {new Date(invite.expiresAt).toLocaleDateString()}
                </p>
              )}
              {!invite.expiresAt && (
                <p className="text-[12px] text-muted-foreground">Never expires</p>
              )}
            </div>

            {/* Invite Link */}
            <div className="p-5 bg-card border border-border rounded-2xl space-y-3">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Invitation Link</div>
              <p className="text-[13px] text-muted-foreground break-all leading-relaxed font-mono">{inviteLink}</p>
              <button
                onClick={copyLink}
                className="flex items-center gap-1.5 text-[13px] text-primary font-medium hover:underline transition-colors"
              >
                {copiedLink ? <Check size={15} /> : <Copy size={15} />}
                {copiedLink ? 'Link Copied!' : 'Copy Link'}
              </button>
            </div>

            {/* QR Code toggle */}
            <button
              onClick={() => setShowQR(!showQR)}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all"
            >
              <div className="flex items-center gap-2.5 text-[14px] font-medium text-foreground">
                <QrCode size={18} className="text-muted-foreground" />
                Show QR Code
              </div>
              <span className="text-[12px] text-muted-foreground">{showQR ? 'Hide' : 'Show'}</span>
            </button>

            {showQR && (
              <div className="flex flex-col items-center gap-4 p-6 bg-card border border-border rounded-2xl">
                <div className="p-3 bg-white rounded-xl shadow-sm">
                  <QRCodeSVG value={inviteLink} size={180} />
                </div>
                <p className="text-[13px] text-muted-foreground text-center">
                  Scan to join {room.name}. For display or download only.
                </p>
              </div>
            )}

            {/* Primary share button */}
            <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={handleShare}>
              <Share2 size={17} className="mr-2" />
              Share Invitation
            </Button>

            {/* Revoke / regenerate */}
            {!confirmRevoke ? (
              <button
                onClick={() => setConfirmRevoke(true)}
                className="w-full text-center text-[13px] text-muted-foreground hover:text-foreground transition-colors py-2"
              >
                <RefreshCw size={13} className="inline mr-1.5" />
                Generate new link and code
              </button>
            ) : (
              <div className="p-4 bg-muted/40 rounded-xl space-y-3">
                <p className="text-[13px] text-muted-foreground text-center">
                  This will revoke the current link and code. Anyone who hasn't joined yet will need the new ones.
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" className="flex-1 rounded-xl" onClick={handleRegenerate}>
                    Revoke & Regenerate
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmRevoke(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
