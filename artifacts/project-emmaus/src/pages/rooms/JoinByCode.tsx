import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Users, Loader2 } from 'lucide-react';

type Phase = 'enter-code' | 'joining' | 'joined';

export default function JoinByCode() {
  const { user } = useAuth();
  const { joinRoomByCode } = useRooms();
  const [, setLocation] = useLocation();

  const [phase, setPhase] = useState<Phase>('enter-code');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [joinedRoomId, setJoinedRoomId] = useState('');

  if (!user) return null;

  const handleJoin = async () => {
    if (!code.trim()) return;
    setError('');
    setPhase('joining');
    const result = await joinRoomByCode(user.id, code.trim());
    if (result.success && result.roomId) {
      setJoinedRoomId(result.roomId);
      setPhase('joined');
    } else {
      setError(result.error ?? 'That code is not valid. Please check and try again.');
      setPhase('enter-code');
    }
  };

  if (phase === 'joined') {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center p-6">
        <div className="text-center space-y-5 max-w-[340px]">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
            <Users size={30} className="text-primary" />
          </div>
          <h1 className="text-[24px] font-sans font-semibold">You've joined!</h1>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Welcome to the Room. Your personal journey progress remains yours alone.
          </p>
          <Button
            className="w-full rounded-2xl h-12"
            onClick={() => setLocation(`/rooms/${joinedRoomId}`)}
          >
            Open Room
          </Button>
          <Button
            variant="outline"
            className="w-full rounded-2xl h-11"
            onClick={() => setLocation('/rooms')}
          >
            Back to Rooms
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
            Enter the 7-letter access code shared by a Room admin.
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
            placeholder="e.g. ABCDEFG"
            className="w-full h-14 px-4 rounded-xl border border-border bg-card text-[20px] font-mono font-bold tracking-widest text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 uppercase"
            maxLength={7}
            autoFocus
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>

        <Button
          className="w-full h-12 rounded-2xl text-[16px]"
          onClick={handleJoin}
          disabled={code.trim().length !== 7 || phase === 'joining'}
        >
          {phase === 'joining'
            ? <><Loader2 size={17} className="mr-2 animate-spin" /> Joining…</>
            : 'Join Room'}
        </Button>

        <p className="text-center text-[13px] text-muted-foreground">
          Have a link instead? Ask the Room admin to send it again.
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
