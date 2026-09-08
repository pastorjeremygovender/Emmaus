/**
 * RoomPickerSheet — bottom sheet that lets the member select one of their
 * Rooms to retroactively link a Walk/Journey to it.
 *
 * Shared by JourneyDetail and WalkCompletePage.
 * Does NOT reset the member's personal progress — it only creates the
 * room_journeys row so other Room members can start the Walk independently.
 */

import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Users, Loader2 } from 'lucide-react';
import type { RoomSummary } from '@/lib/rooms-types';

interface RoomPickerSheetProps {
  rooms: RoomSummary[];
  /** Called with the selected roomId. Must throw on failure so the sheet can surface the error. */
  onSelect: (roomId: string) => Promise<void>;
  onClose: () => void;
  title?: string;
}

export function RoomPickerSheet({
  rooms,
  onSelect,
  onClose,
  title = 'Add to a Group',
}: RoomPickerSheetProps) {
  const [linking, setLinking] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function handleSelect(roomId: string) {
    setLinking(roomId);
    setError('');
    try {
      await onSelect(roomId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to link. Please try again.');
    } finally {
      setLinking(null);
    }
  }

  return (
    <Sheet open onOpenChange={open => { if (!open) onClose(); }}>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl px-5 pb-8 max-h-[80vh] overflow-y-auto"
      >
        <SheetHeader className="pb-4 text-left">
          <SheetTitle className="text-[20px] font-sans font-medium">{title}</SheetTitle>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Your personal progress won't be affected — other members can start the Walk independently.
          </p>
        </SheetHeader>

        <div className="space-y-2">
          {rooms.map(room => (
            <button
              key={room.id}
              disabled={!!linking}
              onClick={() => handleSelect(room.id)}
              className="w-full text-left p-4 rounded-xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-3 disabled:opacity-60"
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                {linking === room.id
                  ? <Loader2 size={16} className="animate-spin" />
                  : <Users size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-medium text-foreground truncate">{room.name}</div>
                <div className="text-[12px] text-muted-foreground">
                  {room.memberCount} {room.memberCount === 1 ? 'member' : 'members'}
                </div>
              </div>
            </button>
          ))}
        </div>

        {error && (
          <p className="text-[13px] text-destructive mt-3 text-center">{error}</p>
        )}

        <Button
          variant="ghost"
          className="w-full mt-4 h-11 text-muted-foreground"
          onClick={onClose}
          disabled={!!linking}
        >
          Cancel
        </Button>
      </SheetContent>
    </Sheet>
  );
}
