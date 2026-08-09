import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Copy, Check, Loader2, Share2 } from 'lucide-react';
import type { RoomType } from '@/lib/rooms-types';

type Phase = 'form' | 'creating' | 'success';

const GROUP_TYPES: { value: RoomType; label: string; emoji: string }[] = [
  { value: 'personal',     label: 'Personal',     emoji: '🙏' },
  { value: 'family',       label: 'Family',        emoji: '🏠' },
  { value: 'friends',      label: 'Friends',       emoji: '👥' },
  { value: 'marriage',     label: 'Marriage',      emoji: '💍' },
  { value: 'discipleship', label: 'Discipleship',  emoji: '📖' },
  { value: 'leadership',   label: 'Leadership',    emoji: '⚡' },
  { value: 'church',       label: 'Church',        emoji: '⛪' },
];

interface CreatedRoom {
  roomId: string;
  inviteCode: string;
  inviteToken: string;
  name: string;
}

export default function CreateRoom() {
  const { user } = useAuth();
  const { createRoom } = useRooms();
  const [, setLocation] = useLocation();

  const [phase, setPhase] = useState<Phase>('form');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [roomType, setRoomType] = useState<RoomType>('personal');
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CreatedRoom | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  if (!user) return null;

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter a Group name.'); return; }
    setError('');
    setPhase('creating');
    try {
      const result = await createRoom(user.id, name.trim(), description.trim(), roomType);
      setCreated({ ...result, name: name.trim() });
      setPhase('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
      setPhase('form');
    }
  };

  const inviteLink = created
    ? `${window.location.origin}${import.meta.env.BASE_URL}join-room/${created.inviteToken}`
    : '';

  const copyLink = async () => {
    await navigator.clipboard.writeText(inviteLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const copyCode = async () => {
    if (!created) return;
    await navigator.clipboard.writeText(created.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShare = async () => {
    if (!created) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join ${created.name} on Emmaus`,
          text: `You've been invited to join ${created.name}. Access code: ${created.inviteCode}`,
          url: inviteLink,
        });
      } catch { /* user cancelled */ }
    } else {
      copyLink();
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────

  if (phase === 'success' && created) {
    return (
      <div className="min-h-[100dvh] bg-background pb-page-safe">
        <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
          <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
            <div className="flex-1 text-center font-medium text-sm">Group Created</div>
          </div>
        </header>
        <main className="px-5 pt-10 max-w-[480px] mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check size={30} className="text-primary" strokeWidth={2.5} />
            </div>
            <h1 className="text-[26px] font-sans font-semibold">{created.name}</h1>
            <p className="text-[15px] text-muted-foreground">Your Group is ready</p>
          </div>

          <p className="text-center text-[15px] text-muted-foreground leading-relaxed">
            Share the invite link or access code with the people you'd like to join.
          </p>

          <div className="space-y-4">
            {/* Access Code */}
            <div className="p-5 bg-card border border-border rounded-2xl space-y-2">
              <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Access Code
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[28px] font-mono font-bold tracking-widest text-foreground">
                  {created.inviteCode}
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
                Invite Link
              </div>
              <p className="text-[13px] text-muted-foreground break-all leading-relaxed">{inviteLink}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={copyLink}>
                  {copiedLink
                    ? <><Check size={14} className="mr-1.5" /> Copied</>
                    : <><Copy size={14} className="mr-1.5" /> Copy Link</>}
                </Button>
                <Button size="sm" className="flex-1 rounded-xl" onClick={handleShare}>
                  <Share2 size={14} className="mr-1.5" />
                  Share
                </Button>
              </div>
            </div>
          </div>

          <Button
            className="w-full h-12 rounded-2xl"
            onClick={() => setLocation(`/rooms/${created.roomId}`)}
          >
            Open Group
          </Button>
        </main>
        <BottomNav />
      </div>
    );
  }

  // ── Create form ─────────────────────────────────────────────────────────────

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
          <div className="flex-1 text-center font-medium text-sm">Create a Group</div>
          <div className="w-10" />
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-6 pb-8">
        <div className="space-y-1">
          <h1 className="text-[26px] font-sans font-semibold">Create a Group</h1>
          <p className="text-[15px] text-muted-foreground">
            Groups let you walk journeys with family, friends, or a small group.
          </p>
        </div>

        {/* Room Name */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Group Name
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setError(''); }}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            placeholder="e.g. The Govender Family"
            className="w-full h-12 px-4 rounded-xl border border-border bg-card text-[16px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            maxLength={60}
            autoFocus
          />
          {error && <p className="text-[13px] text-destructive">{error}</p>}
        </div>

        {/* Group Type */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Group Type
          </label>
          <div className="grid grid-cols-4 gap-2">
            {GROUP_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setRoomType(t.value)}
                className={`flex flex-col items-center gap-1 py-3 rounded-xl border text-center transition-all ${
                  roomType === t.value
                    ? 'border-primary bg-primary/8 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40'
                }`}
              >
                <span className="text-[18px] leading-none">{t.emoji}</span>
                <span className="text-[11px] font-medium leading-tight">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Description (optional) */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Description <span className="text-muted-foreground/50 normal-case font-normal tracking-normal">— optional</span>
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="What is this Group for?"
            className="w-full px-4 py-3 rounded-xl border border-border bg-card text-[15px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
            rows={3}
            maxLength={200}
          />
        </div>

        <Button
          className="w-full h-12 rounded-2xl text-[16px]"
          onClick={handleCreate}
          disabled={phase === 'creating' || !name.trim()}
        >
          {phase === 'creating' ? (
            <><Loader2 size={17} className="mr-2 animate-spin" /> Creating…</>
          ) : (
            'Create Group'
          )}
        </Button>
      </main>
      <BottomNav />
    </div>
  );
}
