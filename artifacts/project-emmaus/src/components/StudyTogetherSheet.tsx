/**
 * StudyTogetherSheet — bottom sheet for creating a Personal Room from any content page.
 *
 * Shown when a member taps "Study Together" / "Walk Together" on a Walk, Devotional,
 * or Sermon Companion page.  Collects a room name (pre-filled with the content title),
 * calls POST /api/rooms (room_type = 'personal', with linked content), and then shows
 * the invite code so they can share it immediately.
 *
 * The creator's existing personal progress is never affected — the Room tracks
 * shared progress separately via room_journeys / room_members.
 */

import { useState } from 'react';
import { useLocation } from 'wouter';
import { Users, X, Loader2, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiCreateRoom, apiLinkJourney } from '@/lib/rooms-api';

interface Props {
  /** Pre-fills the room name — typically the content title. */
  defaultName: string;
  userId: string;
  /** The content driving this Room (walk, devotional, sermon-companion, etc.) */
  contentId?: string;
  contentType?: 'journey' | 'devotional' | 'sermon-companion' | 'bible-study';
  onClose: () => void;
}

export function StudyTogetherSheet({
  defaultName,
  userId,
  contentId,
  contentType,
  onClose,
}: Props) {
  const [, setLocation] = useLocation();
  const [name, setName]         = useState(defaultName);
  const [creating, setCreating] = useState(false);
  const [error, setError]       = useState('');
  const [created, setCreated]   = useState<{ roomId: string; inviteCode: string } | null>(null);
  const [copied, setCopied]     = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCreating(true);
    setError('');
    try {
      const res = await apiCreateRoom(
        userId,
        trimmed,
        '',
        'personal',
        contentId,
        contentType
      );
      // If this is a journey, also link it via room_journeys so shared
      // progress tracking works in RoomDetail.
      if (contentType === 'journey' && contentId) {
        try {
          await apiLinkJourney(userId, res.roomId, contentId);
        } catch { /* non-fatal — room was created, just linking failed */ }
      }
      setCreated({ roomId: res.roomId, inviteCode: res.inviteCode });
    } catch (e: unknown) {
      setError((e instanceof Error ? e.message : null) ?? 'Could not create room. Please try again.');
    } finally {
      setCreating(false);
    }
  }

  function handleCopyCode() {
    if (!created) return;
    navigator.clipboard.writeText(created.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet */}
      <div className="relative w-full max-w-[480px] bg-background rounded-t-2xl px-5 pt-5 pb-10 space-y-4 shadow-xl">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-primary" />
            <h2 className="text-[17px] font-semibold">Study Together</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {!created ? (
          /* ── Create form ───────────────────────────────────────────── */
          <>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              Create a Room and share the invite code with friends or small-group members to study this content together.
              Your own progress is kept separate — you won't lose where you're up to.
            </p>

            <div className="space-y-1.5">
              <label
                htmlFor="study-room-name"
                className="text-[12px] font-medium text-muted-foreground uppercase tracking-wide"
              >
                Room name
              </label>
              <input
                id="study-room-name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={60}
                className="w-full h-11 rounded-xl border border-border bg-muted/30 px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                placeholder="Give your room a name"
                autoFocus
              />
            </div>

            {error && (
              <p className="text-[13px] text-destructive">{error}</p>
            )}

            <Button
              className="w-full h-12 rounded-xl font-medium"
              onClick={handleCreate}
              disabled={creating || !name.trim()}
            >
              {creating && <Loader2 size={16} className="animate-spin mr-2" />}
              {creating ? 'Creating…' : 'Create Room'}
            </Button>
          </>
        ) : (
          /* ── Success: show invite code ─────────────────────────────── */
          <>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              Your room is ready. Share the code below so others can join.
            </p>

            <div className="p-4 rounded-xl bg-primary/5 border border-primary/15 space-y-1 text-center">
              <p className="text-[11px] text-primary/70 uppercase tracking-wide font-medium">
                Invite code
              </p>
              <p className="text-[28px] font-mono font-bold text-foreground tracking-[0.2em]">
                {created.inviteCode}
              </p>
            </div>

            <button
              onClick={handleCopyCode}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl text-[14px] border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
            >
              {copied
                ? <><Check size={15} className="text-primary" /> Code copied!</>
                : <><Copy size={15} /> Copy invite code</>
              }
            </button>

            <Button
              className="w-full h-12 rounded-xl font-medium"
              onClick={() => setLocation(`/rooms/${created.roomId}`)}
            >
              Open Room
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
