import { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { Button } from '@/components/ui/button';
import { Users, AlertCircle, Loader2 } from 'lucide-react';

type Status = 'loading-auth' | 'unauthenticated' | 'invite' | 'joining' | 'joined' | 'already-member' | 'invalid';

export default function JoinByLink() {
  const { inviteToken } = useParams<{ inviteToken: string }>();
  const { user, loading: authLoading } = useAuth();
  const { joinRoomByToken } = useRooms();
  const [, setLocation] = useLocation();

  const [status, setStatus] = useState<Status>('loading-auth');
  const [error, setError] = useState('');
  const [joinedRoomId, setJoinedRoomId] = useState('');

  // Once auth resolves, move to the invite confirmation screen (or prompt sign-in)
  useEffect(() => {
    if (authLoading) return; // Still loading — keep spinner
    if (!user) {
      // P2-11: auth resolved with no user — save token and prompt sign-in
      if (inviteToken) {
        sessionStorage.setItem('pendingInviteToken', inviteToken);
      }
      setStatus('unauthenticated');
      return;
    }
    if (!inviteToken) {
      setError('No invite token found in the link.');
      setStatus('invalid');
      return;
    }
    setStatus('invite');
  }, [authLoading, user, inviteToken]);

  const handleJoin = async () => {
    if (!user || !inviteToken) return;
    setStatus('joining');
    const result = await joinRoomByToken(user.id, String(inviteToken));
    if (result.success && result.roomId) {
      setJoinedRoomId(result.roomId);
      setStatus('joined');
    } else {
      const msg = result.error ?? 'This invitation is not valid or has expired.';
      // Handle "already a member" gracefully
      if (msg.toLowerCase().includes('already') && result.roomId) {
        setJoinedRoomId(result.roomId);
        setStatus('already-member');
      } else {
        setError(msg);
        setStatus('invalid');
      }
    }
  };

  // ── Loading auth ──────────────────────────────────────────────────────────
  if (status === 'loading-auth') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={28} className="text-muted-foreground animate-spin" />
      </div>
    );
  }

  // ── Unauthenticated — P2-11 ───────────────────────────────────────────────
  // Token saved to sessionStorage; Welcome.tsx will redirect back here after sign-in.
  if (status === 'unauthenticated') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-[340px] w-full">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={30} className="text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-[24px] font-sans font-semibold">You've been invited</h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Sign in to Emmaus to accept this Group invitation. Your invite will be waiting after you sign in.
            </p>
          </div>
          <Button
            className="w-full h-12 rounded-2xl text-[16px]"
            onClick={() => setLocation('/')}
          >
            Sign in to accept
          </Button>
        </div>
      </div>
    );
  }

  // ── Invite confirmation ───────────────────────────────────────────────────
  if (status === 'invite') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-6 max-w-[340px] w-full">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={30} className="text-primary" />
          </div>
          <div className="space-y-1.5">
            <h1 className="text-[24px] font-sans font-semibold">You've been invited</h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed">
              Someone has invited you to join a Group on Emmaus. Groups let you walk journeys
              together with family or friends.
            </p>
          </div>
          <div className="space-y-3">
            <Button className="w-full h-12 rounded-2xl text-[16px]" onClick={handleJoin}>
              Join Group
            </Button>
            <Button
              variant="outline"
              className="w-full h-11 rounded-2xl"
              onClick={() => setLocation('/rooms')}
            >
              Not now
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Joining ───────────────────────────────────────────────────────────────
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

  // ── Invalid ───────────────────────────────────────────────────────────────
  if (status === 'invalid') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-[320px]">
          <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto">
            <AlertCircle size={26} className="text-destructive" />
          </div>
          <h1 className="text-[22px] font-sans font-semibold">Invalid Invitation</h1>
          <p className="text-[15px] text-muted-foreground">{error}</p>
          <Button className="w-full rounded-2xl" onClick={() => setLocation('/rooms')}>
            Back to Groups
          </Button>
        </div>
      </div>
    );
  }

  // ── Already a member ──────────────────────────────────────────────────────
  if (status === 'already-member') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-4 max-w-[320px]">
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={26} className="text-primary" />
          </div>
          <h1 className="text-[22px] font-sans font-semibold">You're already in this Group</h1>
          <Button
            className="w-full rounded-2xl"
            onClick={() => setLocation(joinedRoomId ? `/rooms/${joinedRoomId}` : '/rooms')}
          >
            Open Group
          </Button>
        </div>
      </div>
    );
  }

  // ── Joined ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
      <div className="text-center space-y-5 max-w-[340px]">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Users size={30} className="text-primary" />
        </div>
        <h1 className="text-[24px] font-sans font-semibold">You've joined!</h1>
        <p className="text-[14px] text-muted-foreground leading-relaxed">
          Welcome to the Group. Your personal journey progress and private content remain yours alone.
        </p>
        <Button
          className="w-full rounded-2xl h-12"
          onClick={() => setLocation(`/rooms/${joinedRoomId}`)}
        >
          Open Group
        </Button>
        <Button
          variant="outline"
          className="w-full rounded-2xl h-11"
          onClick={() => setLocation('/rooms')}
        >
          Back to Groups
        </Button>
      </div>
    </div>
  );
}
