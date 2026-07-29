import { useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { BottomNav } from '@/components/BottomNav';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Crown, Shield, User as UserIcon } from 'lucide-react';
import { DEMO_USER_2 } from '@/lib/rooms-demo-data';
import type { RoomRole } from '@/lib/rooms-types';

const DEMO_NAMES: Record<string, string> = {
  'demo-user-1': 'Member',
  'demo-user-2': DEMO_USER_2.preferredName,
  'demo-admin-1': 'Jeremy',
};

export default function RoomSettings() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { getRoom, canManage, renameRoom, assignRole, removeMember, archiveRoom, getRoomMembers } = useRooms();
  const [, setLocation] = useLocation();
  const [name, setName] = useState('');
  const [saved, setSaved] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  if (!user || !roomId) return null;
  const room = getRoom(roomId);
  if (!room || !canManage(roomId, user.id)) {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">You don't have permission to manage this Room.</p>
        <Button onClick={() => setLocation(`/rooms/${roomId}`)}>Back</Button>
      </div>
    );
  }

  const members = getRoomMembers(roomId).filter(m => m.userId !== user.id);

  const handleRename = () => {
    if (!name.trim()) return;
    renameRoom(roomId, name.trim(), user.id);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setName('');
  };

  const handleArchive = () => {
    archiveRoom(roomId, user.id);
    setLocation('/rooms');
  };

  const handleAssignRole = (targetUserId: string, role: RoomRole) => {
    assignRole(roomId, targetUserId, role, user.id);
  };

  const handleRemove = (targetUserId: string, targetName: string) => {
    if (window.confirm(`Remove ${targetName} from this Room?`)) {
      removeMember(roomId, targetUserId, user.id);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto">
          <button
            onClick={() => setLocation(`/rooms/${roomId}`)}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 text-center font-medium text-sm">Room Settings</div>
          <div className="w-10" />
        </div>
      </header>

      <main className="px-5 pt-8 max-w-[480px] mx-auto space-y-9 pb-8">

        {/* Rename */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Room Name</h2>
          <p className="text-[14px] text-muted-foreground">Current: <span className="font-medium text-foreground">{room.name}</span></p>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="New Room name"
              className="flex-1 h-11 px-4 rounded-xl border border-border bg-card text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              maxLength={60}
            />
            <Button size="sm" className="rounded-xl px-5" onClick={handleRename} disabled={!name.trim()}>
              {saved ? 'Saved!' : 'Save'}
            </Button>
          </div>
        </section>

        {/* Member roles */}
        {members.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Member Roles</h2>
            <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
              {members.map(m => {
                const mName = DEMO_NAMES[m.userId] || 'Member';
                return (
                  <div key={m.id} className="flex items-center gap-3 px-5 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="text-[15px] font-medium text-foreground">{mName}</div>
                      <div className="text-[12px] text-muted-foreground">{m.role}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleAssignRole(m.userId, 'Leader')}
                        className={`p-2 rounded-lg transition-colors ${m.role === 'Leader' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
                        title="Make Leader"
                      >
                        <Shield size={15} />
                      </button>
                      <button
                        onClick={() => handleAssignRole(m.userId, 'Member')}
                        className={`p-2 rounded-lg transition-colors ${m.role === 'Member' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted'}`}
                        title="Set as Member"
                      >
                        <UserIcon size={15} />
                      </button>
                      <button
                        onClick={() => handleRemove(m.userId, mName)}
                        className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1"
                        title="Remove member"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Archive */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Archive Room</h2>
          {!confirmArchive ? (
            <Button variant="outline" className="w-full rounded-xl" onClick={() => setConfirmArchive(true)}>
              Archive Room
            </Button>
          ) : (
            <div className="p-4 bg-muted/40 rounded-xl space-y-3">
              <p className="text-[13px] text-muted-foreground">Archive this Room? Members won't be able to start new journeys, but personal data is preserved.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="flex-1 rounded-xl" onClick={handleArchive}>Archive</Button>
                <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmArchive(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </section>
      </main>
      <BottomNav />
    </div>
  );
}
