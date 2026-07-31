import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { Users, Plus, LogIn, ChevronRight, Loader2 } from 'lucide-react';
import type { RoomSummary } from '@/lib/rooms-types';

export default function Rooms() {
  const { user } = useAuth();
  const { rooms, loading, error } = useRooms();
  const [, setLocation] = useLocation();

  if (!user) return null;

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="px-5 pt-12 max-w-[480px] mx-auto space-y-10">

        {/* Header */}
        <header>
          <h1 className="text-[30px] font-sans font-medium tracking-tight">My Rooms</h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            Walk journeys together with family or friends.
          </p>
        </header>

        {/* My Rooms */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Rooms I Belong To
          </h2>

          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={22} className="text-muted-foreground animate-spin" />
            </div>
          )}

          {error && !loading && (
            <div className="p-5 rounded-xl border border-destructive/30 bg-destructive/5 text-[14px] text-destructive">
              {error}
            </div>
          )}

          {!loading && !error && rooms.length === 0 && (
            <div className="p-10 border border-dashed border-border rounded-2xl text-center space-y-2">
              <Users size={32} className="text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-[15px] text-muted-foreground leading-relaxed">
                You're not in any Rooms yet.
              </p>
              <p className="text-[13px] text-muted-foreground">
                Create one or join a Room using an invitation link or access code.
              </p>
            </div>
          )}

          {!loading && rooms.length > 0 && (
            <div className="space-y-3">
              {rooms.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  onClick={() => setLocation(`/rooms/${room.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Actions */}
        <section className="space-y-3 pb-4">
          <Button
            className="w-full h-12 rounded-2xl text-[16px]"
            onClick={() => setLocation('/rooms/create')}
          >
            <Plus size={18} className="mr-2" />
            Create a Room
          </Button>
          <Button
            variant="outline"
            className="w-full h-12 rounded-2xl text-[16px]"
            onClick={() => setLocation('/rooms/join')}
          >
            <LogIn size={18} className="mr-2" />
            Join a Room
          </Button>
        </section>

      </main>
      <BottomNav />
    </div>
  );
}

function RoomCard({ room, onClick }: { room: RoomSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left p-5 rounded-2xl border border-border bg-card shadow-sm hover:border-primary/30 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[18px] font-sans font-semibold text-foreground truncate">{room.name}</h3>
          <div className="flex items-center gap-2 mt-1.5 text-[13px] text-muted-foreground">
            <span>{room.memberCount} {room.memberCount === 1 ? 'member' : 'members'}</span>
            <span>·</span>
            <span>Admin: {room.adminName}</span>
          </div>
        </div>
        <ChevronRight size={18} className="text-muted-foreground mt-1 shrink-0" />
      </div>
    </button>
  );
}
