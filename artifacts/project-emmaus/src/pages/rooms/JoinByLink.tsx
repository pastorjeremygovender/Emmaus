import { useEffect, useState, type ReactNode } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { Button } from '@/components/ui/button';
import { Users, AlertCircle, Loader2 } from 'lucide-react';
import {
  consumeGroupInvite,
  groupInvitePath,
  rememberGroupInvite,
  isValidInviteToken,
} from '@/lib/groups-invite';
import {
  getContentTypeShortLabel,
  getRoomTypeLabel,
  type RoomInvitePreview,
} from '@/lib/rooms-types';
import { goBackOrFallback } from '@/lib/return-context';

type Status =
  | 'loading'
  | 'unauthenticated'
  | 'invite'
  | 'already-member'
  | 'joining'
  | 'joined'
  | 'invalid';

export default function JoinByLink() {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const { user, loading: authLoading } = useAuth();
  const rooms = useRooms();
  const { getInvitePreview, joinRoomByToken } = rooms;
  const previewLoader = typeof getInvitePreview === 'function' ? getInvitePreview : null;
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<Status>('loading');
  const [preview, setPreview] = useState<RoomInvitePreview | null>(null);
  const [error, setError] = useState('');
  const [joinedRoomId, setJoinedRoomId] = useState('');

  let token = '';
  try {
    token = inviteToken ? decodeURIComponent(inviteToken) : '';
  } catch {
    token = '';
  }
  const destination = isValidInviteToken(token) ? groupInvitePath(token) : '';

  useEffect(() => {
    if (authLoading) return;
    if (!isValidInviteToken(token)) {
      setError('This invitation link is incomplete or invalid.');
      setStatus('invalid');
      return;
    }

    rememberGroupInvite(destination);
    if (!previewLoader) {
      setStatus(user ? 'invite' : 'unauthenticated');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    void previewLoader(token)
      .then((nextPreview) => {
        if (cancelled) return;
        setPreview(nextPreview);
        setStatus(nextPreview.isMember ? 'already-member' : user ? 'invite' : 'unauthenticated');
      })
      .catch((reason) => {
        if (cancelled) return;
        setError(reason instanceof Error
          ? reason.message
          : 'This invitation is invalid, expired, or has been revoked.');
        setStatus('invalid');
      });
    return () => { cancelled = true; };
  }, [authLoading, destination, previewLoader, token, user]);

  const goToAuth = (mode: 'signin' | 'register') => {
    rememberGroupInvite(destination);
    setLocation(`/auth?mode=${mode}&returnTo=${encodeURIComponent(destination)}`);
  };

  const handleJoin = async () => {
    if (!user || !token) return;
    setStatus('joining');
    const result = await joinRoomByToken(user.id, token);
    if (result.success && result.roomId) {
      consumeGroupInvite();
      setJoinedRoomId(result.roomId);
      setStatus(result.alreadyMember ? 'already-member' : 'joined');
    } else {
      setError(result.error ?? 'This invitation is invalid, expired, or has been revoked.');
      setStatus('invalid');
    }
  };

  if (status === 'loading') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={28} className="text-muted-foreground animate-spin" />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return (
      <InviteShell>
        <InviteIcon />
        <div className="space-y-1.5">
          <h1 className="text-[24px] font-sans font-semibold">You've been invited</h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            Sign in or create an account to see the Group details and choose whether to join.
          </p>
        </div>
        {preview && <PreviewCard preview={preview} />}
        <div className="space-y-3 w-full">
          <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={() => goToAuth('signin')}>
            Sign in to continue
          </Button>
          <Button variant="outline" className="w-full h-11 rounded-2xl" onClick={() => goToAuth('register')}>
            Create an account
          </Button>
        </div>
      </InviteShell>
    );
  }

  if (status === 'invite') {
    return (
      <InviteShell>
        <InviteIcon />
        <div className="space-y-1.5">
          <h1 className="text-[24px] font-sans font-semibold">You've been invited</h1>
          <p className="text-[15px] text-muted-foreground leading-relaxed">
            Review the details before joining. Your personal progress and private content remain yours alone.
          </p>
        </div>
        {preview && <PreviewCard preview={preview} />}
        <div className="space-y-3 w-full">
          <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={handleJoin}>
            Join Group
          </Button>
          <Button variant="outline" className="w-full h-11 rounded-2xl" onClick={() => { consumeGroupInvite(); setLocation('/rooms'); }}>
            Not now
          </Button>
        </div>
      </InviteShell>
    );
  }

  if (status === 'joining') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 size={32} className="text-muted-foreground animate-spin mx-auto" />
          <p className="text-[15px] text-muted-foreground">Joining Group…</p>
        </div>
      </div>
    );
  }

  if (status === 'already-member') {
    return (
      <InviteShell>
        <InviteIcon />
        <h1 className="text-[22px] font-sans font-semibold">You’re already in this Group</h1>
        {preview && <PreviewCard preview={preview} />}
        <Button
          className="w-full rounded-2xl"
          onClick={() => setLocation(joinedRoomId ? `/rooms/${joinedRoomId}` : preview ? `/rooms/${preview.id}` : '/rooms')}
        >
          Open Group
        </Button>
      </InviteShell>
    );
  }

  if (status === 'joined') {
    return (
      <InviteShell>
        <InviteIcon />
        <h1 className="text-[24px] font-sans font-semibold">You’ve joined!</h1>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Welcome to the Group. Your personal journey progress and private content remain yours alone.
        </p>
        <Button className="w-full rounded-2xl h-12" onClick={() => setLocation(`/rooms/${joinedRoomId}`)}>
          Open Group
        </Button>
        <Button variant="outline" className="w-full rounded-2xl h-11" onClick={() => goBackOrFallback('/rooms', setLocation)}>
          Back to Groups
        </Button>
      </InviteShell>
    );
  }

  return (
    <InviteShell>
      <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
        <AlertCircle size={26} className="text-destructive" />
      </div>
      <h1 className="text-[22px] font-sans font-semibold">Invitation unavailable</h1>
      <p className="text-[15px] text-muted-foreground">{error}</p>
      <Button className="w-full rounded-2xl" onClick={() => goBackOrFallback('/rooms', setLocation)}>
        Back to Groups
      </Button>
    </InviteShell>
  );
}

function InviteShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-5 max-w-[360px] w-full">{children}</div>
    </div>
  );
}

function InviteIcon() {
  return (
    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
      <Users size={30} className="text-primary" />
    </div>
  );
}

function PreviewCard({ preview }: { preview: RoomInvitePreview }) {
  return (
    <div className="w-full text-left rounded-2xl border border-border bg-card p-4 space-y-2">
      <div>
        <h2 className="font-semibold text-lg">{preview.name}</h2>
        <p className="text-xs text-muted-foreground">
          {getRoomTypeLabel(preview.roomType)} · {getContentTypeShortLabel(preview.contentType)} · {preview.memberCount} {preview.memberCount === 1 ? 'member' : 'members'}
        </p>
      </div>
      {preview.description && <p className="text-sm text-muted-foreground leading-relaxed">{preview.description}</p>}
      <p className="text-xs text-muted-foreground">
        Led by {preview.adminName || 'the Group leader'}
      </p>
    </div>
  );
}
