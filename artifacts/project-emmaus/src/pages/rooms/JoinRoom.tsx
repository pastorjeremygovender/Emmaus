/**
 * JoinRoom — lets a member join by either a 7-char access code or an invite link.
 *
 * Replaces the old JoinByCode page (which only handled codes). The route /rooms/join
 * now points here. Two tabs:
 *   • "Access Code"  — type or paste a 7-char code
 *   • "Invite Link"  — paste the full invite URL; token is extracted automatically
 */
import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Loader2 } from 'lucide-react';

type Tab = 'code' | 'link';
type Phase = 'idle' | 'joining' | 'joined';

/** Extract the invite token UUID from a pasted invite URL, or return null. */
function extractToken(raw: string): string | null {
  raw = raw.trim();
  // Match /join-room/<uuid>  (with or without trailing slash/query)
  const m = raw.match(/join-room\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

export default function JoinRoom() {
  const { user } = useAuth();
  const { joinRoomByCode, joinRoomByToken } = useRooms();
  const [, setLocation] = useLocation();

  const [tab, setTab] = useState<Tab>('code');
  const [code, setCode] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [joinedRoomId, setJoinedRoomId] = useState('');

  if (!user) return null;

  const handleJoinByCode = async () => {
    if (code.trim().length !== 7) return;
    setError('');
    setPhase('joining');
    const result = await joinRoomByCode(user.id, code.trim());
    if (result.success && result.roomId) {
      setJoinedRoomId(result.roomId);
      setPhase('joined');
    } else {
      setError(result.error ?? 'That code is not valid. Please check and try again.');
      setPhase('idle');
    }
  };

  const handleJoinByLink = async () => {
    const token = extractToken(link);
    if (!token) {
      setError('Could not find a valid invite link. Make sure you pasted the full link.');
      return;
    }
    setError('');
    setPhase('joining');
    const result = await joinRoomByToken(user.id, token);
    if (result.success && result.roomId) {
      setJoinedRoomId(result.roomId);
      setPhase('joined');
    } else {
      const msg = result.error ?? 'This invitation is not valid or has expired.';
      if (msg.toLowerCase().includes('already') && result.roomId) {
        setJoinedRoomId(result.roomId);
        setPhase('joined');
      } else {
        setError(msg);
        setPhase('idle');
      }
    }
  };

  // ── Joined ──────────────────────────────────────────────────────────────────

  if (phase === 'joined') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-5 max-w-[340px]">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={30} className="text-primary" />
          </div>
          <h1 className="text-[24px] font-sans font-semibold">You've joined!</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Welcome to the Group. See who else is in it and which journeys you're walking together.
          </p>
          <Button
            className="w-full rounded-2xl h-12"
            onClick={() => setLocation(`/rooms/${joinedRoomId}`)}
          >
            See Members &amp; Journeys
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

  // ── Join form ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => { if (window.history.length > 1) window.history.back(); else setLocation('/rooms'); }}
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
            Use an access code or paste an invite link.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex rounded-xl bg-muted/60 p-1 gap-1">
          <button
            onClick={() => { setTab('code'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-[14px] font-medium transition-colors ${
              tab === 'code'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Access Code
          </button>
          <button
            onClick={() => { setTab('link'); setError(''); }}
            className={`flex-1 py-2 rounded-lg text-[14px] font-medium transition-colors ${
              tab === 'link'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Invite Link
          </button>
        </div>

        {/* Code tab */}
        {tab === 'code' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                7-Letter Code
              </label>
              <input
                type="text"
                value={code}
                onChange={e => { setCode(e.target.value.toUpperCase()); setError(''); }}
                placeholder="e.g. ABCDEFG"
                className="w-full h-14 px-4 rounded-xl border border-border bg-card text-[22px] font-mono font-bold tracking-widest text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 uppercase"
                maxLength={7}
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleJoinByCode()}
              />
              {error && <p className="text-[13px] text-destructive">{error}</p>}
            </div>
            <Button
              className="w-full h-12 rounded-2xl text-[16px]"
              onClick={handleJoinByCode}
              disabled={code.trim().length !== 7 || phase === 'joining'}
            >
              {phase === 'joining'
                ? <><Loader2 size={17} className="mr-2 animate-spin" /> Joining…</>
                : 'Join Group'}
            </Button>
          </div>
        )}

        {/* Link tab */}
        {tab === 'link' && (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Invite Link
              </label>
              <textarea
                value={link}
                onChange={e => { setLink(e.target.value); setError(''); }}
                placeholder="Paste the invite link here…"
                className="w-full px-4 py-3 rounded-xl border border-border bg-card text-[14px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                rows={3}
                autoFocus
              />
              {error && <p className="text-[13px] text-destructive">{error}</p>}
            </div>
            <Button
              className="w-full h-12 rounded-2xl text-[16px]"
              onClick={handleJoinByLink}
              disabled={!link.trim() || phase === 'joining'}
            >
              {phase === 'joining'
                ? <><Loader2 size={17} className="mr-2 animate-spin" /> Joining…</>
                : 'Join Group'}
            </Button>
          </div>
        )}
      </main>
      <BottomNav />
    </div>
  );
}
