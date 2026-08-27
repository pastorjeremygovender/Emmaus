import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { ArrowLeft, Users, Plus, LogIn, ChevronRight, Loader2, Crown } from 'lucide-react';
import type { RoomSummary } from '@/lib/rooms-types';

export default function Rooms() {
  const { user } = useAuth();
  const { rooms, loading, error } = useRooms();
  const [location, setLocation] = useLocation();
  const showChooser = new URLSearchParams(location.split('?')[1] ?? '').get('chooser') === '1';

  if (!user) return null;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation('/journey');
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">
      <main className="px-5 pt-12 max-w-[480px] mx-auto space-y-10">

        {/* Header */}
        <header>
          <button
            onClick={handleBack}
            className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors mb-4 -ml-1 min-h-[44px]"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-[30px] font-sans font-medium tracking-tight">My Groups</h1>
          <p className="text-[15px] text-muted-foreground mt-1">
            Walk journeys together with family or friends.
          </p>
        </header>

        {showChooser && (
          <section className="rounded-2xl border border-primary/20 bg-primary/5 p-5 space-y-3">
            <h2 className="font-semibold text-lg">What would you like to do?</h2>
            <p className="text-sm text-muted-foreground">Join an existing Group, or create one of your own.</p>
            <Button
              className="w-full h-12 rounded-2xl text-[15px]"
              onClick={() => setLocation('/rooms/join')}
            >
              <LogIn size={17} className="mr-2" />
              Join a Group
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 rounded-2xl text-[15px]"
              onClick={() => setLocation('/rooms/create')}
            >
              <Plus size={17} className="mr-2" />
              Create a Group
            </Button>
          </section>
        )}

        {/* Room list */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Your Groups
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
            <div className="p-8 border border-dashed border-border rounded-2xl text-center space-y-3">
              <Users size={32} className="text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-[15px] font-medium text-foreground leading-snug">
                You haven't joined any Groups yet.
              </p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                Create a Group to walk through a Bible Study, Walk, Journey or Daily Devotional together.
              </p>
              <div className="flex flex-col gap-2 pt-2">
                <Button
                  className="w-full h-12 rounded-2xl text-[15px]"
                  onClick={() => setLocation('/rooms/create')}
                >
                  <Plus size={17} className="mr-2" />
                  Create a Group
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12 rounded-2xl text-[15px]"
                  onClick={() => setLocation('/rooms/join')}
                >
                  <LogIn size={17} className="mr-2" />
                  Join a Group
                </Button>
              </div>
            </div>
          )}

          {!loading && rooms.length > 0 && (
            <div className="space-y-3">
              {rooms.map(room => (
                <RoomCard
                  key={room.id}
                  room={room}
                  currentUserId={user.id}
                  onClick={() => setLocation(`/rooms/${room.id}`)}
                />
              ))}
            </div>
          )}
        </section>

        {/* Actions — only shown when rooms exist */}
        {!loading && rooms.length > 0 && (
          <section className="space-y-3 pb-4">
            <Button
              className="w-full h-12 rounded-2xl text-[16px]"
              onClick={() => setLocation('/rooms/create')}
            >
              <Plus size={18} className="mr-2" />
              Create a Group
            </Button>
            <Button
              variant="outline"
              className="w-full h-12 rounded-2xl text-[16px]"
              onClick={() => setLocation('/rooms/join')}
            >
              <LogIn size={18} className="mr-2" />
              Join a Group
            </Button>
          </section>
        )}

      </main>
      <BottomNav />
    </div>
  );
}

function RoomCard({ room, onClick, currentUserId }: { room: RoomSummary; onClick: () => void; currentUserId: string }) {
  // The room list summary doesn't expose currentUserRole, so we use createdBy as a
  // reasonable proxy. A room transfer would need a backend change to fix precisely.
  const isAdmin = room.createdBy === currentUserId;

  // Build the natural membership label
  let membershipLabel: string;
  if (isAdmin) {
    if (room.memberCount <= 1) {
      membershipLabel = 'You are the Admin';
    } else {
      membershipLabel = `${room.memberCount} members · You are the Admin`;
    }
  } else {
    if (room.memberCount <= 1) {
      membershipLabel = 'Member';
    } else {
      membershipLabel = `${room.memberCount} members · Member`;
    }
  }

  return (
    <button
      onClick={onClick}
      className="w-full text-left p-5 rounded-2xl border border-border bg-card shadow-sm hover:border-primary/30 transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="text-[18px] font-sans font-semibold text-foreground truncate">{room.name}</h3>
          <div className="flex items-center gap-1.5 mt-1.5 text-[13px] text-muted-foreground">
            {isAdmin && <Crown size={12} className="text-amber-500 shrink-0" />}
            <span>{membershipLabel}</span>
          </div>
        </div>
        <ChevronRight size={18} className="text-muted-foreground mt-1 shrink-0" />
      </div>
    </button>
  );
}
