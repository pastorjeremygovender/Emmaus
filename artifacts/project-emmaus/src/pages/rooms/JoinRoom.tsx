/**
 * JoinRoom — preview first, then explicitly accept a Group invitation.
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Loader2, AlertCircle } from 'lucide-react';
import { extractGroupInviteToken } from '@/lib/groups-invite';
import { goBackOrFallback } from '@/lib/return-context';
import {
  getContentTypeShortLabel,
  getRoomTypeLabel,
  type RoomInvitePreview,
} from '@/lib/rooms-types';

type Tab = 'code' | 'link';
type Phase = 'idle' | 'previewing' | 'confirm' | 'joining' | 'joined';

export default function JoinRoom() {
  const { user } = useAuth();
  const { joinRoomByCode, joinRoomByToken, getCodeInvitePreview, getInvitePreview } = useRooms();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>('code');
  const [code, setCode] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [preview, setPreview] = useState<RoomInvitePreview | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [joinedRoomId, setJoinedRoomId] = useState('');

  if (!user) return null;

  const handlePreviewByCode = async () => {
    if (code.trim().length !== 7) return;
    setError('');
    setPhase('previewing');
    try {
      setPreview(await getCodeInvitePreview(code.trim(), user.id));
      setPhase('confirm');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That code is not valid. Please check and try again.');
      setPhase('idle');
    }
  };

  const handlePreviewByLink = async () => {
    const token = extractGroupInviteToken(link);
    if (!token) {
      setError('Could not find a valid invite link. Make sure you pasted the full link.');
      return;
    }
    setError('');
    setPhase('previewing');
    try {
      setInviteToken(token);
      setPreview(await getInvitePreview(token));
      setPhase('confirm');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This invitation is invalid, expired, or has been revoked.');
      setPhase('idle');
    }
  };

  const handleAccept = async () => {
    if (!preview) return;
    setError('');
    setPhase('joining');
    const result = tab === 'code'
      ? await joinRoomByCode(user.id, code.trim())
      : await joinRoomByToken(user.id, inviteToken);
    if (result.success && result.roomId) {
      setJoinedRoomId(result.roomId);
      setPhase('joined');
    } else {
      setError(result.error ?? 'We could not join this Group. Please try again.');
      setPhase('confirm');
    }
  };

  if (phase === 'joined') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-5 max-w-[340px]">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={30} className="text-primary" />
          </div>
          <h1 className="text-[24px] font-sans font-semibold">You’ve joined!</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Welcome to the Group. Your personal progress and private content remain yours alone.
          </p>
          <Button className="w-full rounded-2xl h-12" onClick={() => setLocation(`/rooms/${joinedRoomId}`)}>
            See Members &amp; Journeys
          </Button>
          <Button variant="outline" className="w-full rounded-2xl h-11" onClick={() => goBackOrFallback('/rooms', setLocation)}>
            Back to Groups
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => goBackOrFallback('/rooms', setLocation)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 text-center font-medium text-sm">Join a Group</div>
          <div className="w-10" />
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-7 pb-8">
        <div className="space-y-1.5">
          <h1 className="text-[26px] font-sans font-semibold">Join a Group</h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            Review the Group before you join. You can use an access code or invite link.
          </p>
        </div>

        <div className="flex rounded-xl bg-muted/60 p-1 gap-1">
          <button onClick={() => { setTab('code'); setError(''); setPhase('idle'); setPreview(null); }} className={`flex-1 py-2 rounded-lg text-[14px] font-medium ${tab === 'code' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
            Access Code
          </button>
          <button onClick={() => { setTab('link'); setError(''); setPhase('idle'); setPreview(null); }} className={`flex-1 py-2 rounded-lg text-[14px] font-medium ${tab === 'link' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'}`}>
            Invite Link
          </button>
        </div>

        {phase === 'confirm' && preview ? (
          <div className="space-y-5">
            <PreviewCard preview={preview} />
            {error && <ErrorText message={error} />}
            <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={handleAccept}>
              Join Group
            </Button>
            <Button variant="outline" className="w-full h-11 rounded-2xl" onClick={() => { setPhase('idle'); setPreview(null); }}>
              Not now
            </Button>
          </div>
        ) : (
          <>
            {tab === 'code' ? (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">7-Letter Code</label>
                  <input
                    type="text"
                    value={code}
                    onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
                    placeholder="e.g. ABCDEFG"
                    className="w-full h-14 px-4 rounded-xl border border-border bg-card text-[22px] font-mono font-bold tracking-widest text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 uppercase"
                    maxLength={7}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handlePreviewByCode()}
                  />
                  {error && <ErrorText message={error} />}
                </div>
                <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={handlePreviewByCode} disabled={code.trim().length !== 7 || phase === 'previewing'}>
                  {phase === 'previewing' ? <><Loader2 size={17} className="mr-2 animate-spin" /> Checking…</> : 'Preview Group'}
                </Button>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Invite Link</label>
                  <textarea
                    value={link}
                    onChange={e => { setLink(e.target.value); setError(''); }}
                    placeholder="Paste the invite link here…"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-card text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                    rows={3}
                    autoFocus
                  />
                  {error && <ErrorText message={error} />}
                </div>
                <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={handlePreviewByLink} disabled={!link.trim() || phase === 'previewing'}>
                  {phase === 'previewing' ? <><Loader2 size={17} className="mr-2 animate-spin" /> Checking…</> : 'Preview Group'}
                </Button>
              </div>
            )}
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
}

function PreviewCard({ preview }: { preview: RoomInvitePreview }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Users size={21} />
        </div>
        <div>
          <h2 className="font-semibold text-lg">{preview.name}</h2>
          <p className="text-xs text-muted-foreground">
            {getRoomTypeLabel(preview.roomType)} · {getContentTypeShortLabel(preview.contentType)}
          </p>
        </div>
      </div>
      {preview.description && <p className="text-sm text-muted-foreground leading-relaxed">{preview.description}</p>}
      <p className="text-xs text-muted-foreground">
        Led by {preview.adminName || 'the Group leader'} · {preview.memberCount} {preview.memberCount === 1 ? 'member' : 'members'}
      </p>
    </div>
  );
}

function ErrorText({ message }: { message: string }) {
  return (
    <p className="text-[13px] text-destructive flex items-start gap-1.5">
      <AlertCircle size={15} className="mt-0.5 shrink-0" /> {message}
    </p>
  );
}
