import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import {
  ArrowLeft, Share2, Settings, LogOut, Trash2,
  MessageSquare, Crown, Loader2, BookOpen, RefreshCw,
  BookMarked, Users, Navigation, Video, Mic, BarChart2,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { RoomDetail as RoomDetailType, RoomMember, MemberJourneyProgress } from '@/lib/rooms-types';
import { getContentTypeShortLabel, getRoomTypeLabel } from '@/lib/rooms-types';
import { apiGetJourneyProgress, apiLinkJourney } from '@/lib/rooms-api';
import { PrayerRequests } from '@/components/PrayerRequests';

const PROGRESS_REFRESH_INTERVAL_MS = 60_000;

export default function RoomDetail() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { loadRoomDetail, leaveRoom, deleteRoom, removeMember } = useRooms();
  const { getJourney, journeys, progress: myProgress } = useJourney();
  const [, setLocation] = useLocation();

  const [room, setRoom] = useState<RoomDetailType | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, MemberJourneyProgress[]>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [showLinkWalk, setShowLinkWalk] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const roomRef = useRef<RoomDetailType | null>(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  const refreshProgress = useCallback(async (silent = true) => {
    if (!roomRef.current || !user || !roomId) return;
    if (!silent) setRefreshing(true);
    try {
      await Promise.all(
        roomRef.current.linkedJourneys.map(lj =>
          apiGetJourneyProgress(user.id, String(roomId), lj.journeyId)
            .then(progress => setProgressMap(prev => ({ ...prev, [lj.journeyId]: progress })))
            .catch(() => {})
        )
      );
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [user, roomId]);

  useEffect(() => {
    if (!roomId || !user) return;
    loadRoomDetail(String(roomId)).then(detail => {
      if (!detail) { setLoadError('Room not found or you are not a member.'); return; }
      setRoom(detail);
      detail.linkedJourneys.forEach(lj => {
        apiGetJourneyProgress(user.id, String(roomId), lj.journeyId)
          .then(progress => setProgressMap(prev => ({ ...prev, [lj.journeyId]: progress })))
          .catch(() => {});
      });
    });
  }, [roomId, user, loadRoomDetail]);

  useEffect(() => {
    if (!room) return;
    const timer = setInterval(() => { refreshProgress(true); }, PROGRESS_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [room, refreshProgress]);

  if (!user || !roomId) return null;

  if (loadError) {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">{loadError}</p>
        <Button onClick={() => setLocation('/rooms')}>Back to Rooms</Button>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-[100dvh] bg-background flex items-center justify-center">
        <Loader2 size={24} className="text-muted-foreground animate-spin" />
      </div>
    );
  }

  const isAdmin = room.currentUserRole === 'admin';
  const linkedJourneyIds = new Set(room.linkedJourneys.map(lj => lj.journeyId));
  const availableWalks = journeys.filter(j =>
    j.status === 'Published' &&
    myProgress[j.id] != null &&
    !linkedJourneyIds.has(j.id)
  );

  // Resolve content title from JourneyContext when the room is linked to a walk/journey
  const primaryLinkedJourney = room.linkedContentId
    ? getJourney(room.linkedContentId)
    : null;
  const contentTitle = primaryLinkedJourney?.title ?? null;

  const handleLeave = async () => {
    setActioning(true);
    try {
      await leaveRoom(String(roomId), user.id);
      setLocation('/rooms');
    } catch (err) {
      setActioning(false);
      alert(err instanceof Error ? err.message : 'Failed to leave room');
    }
  };

  const handleDelete = async () => {
    setActioning(true);
    try {
      await deleteRoom(String(roomId), user.id);
      setLocation('/rooms');
    } catch (err) {
      setActioning(false);
      alert(err instanceof Error ? err.message : 'Failed to delete room');
    }
  };

  const handleRemoveMember = async (member: RoomMember) => {
    if (!window.confirm(`Remove ${member.preferredName || 'this member'} from this Room?`)) return;
    try {
      await removeMember(String(roomId), member.userId, user.id);
      setRoom(prev => prev ? {
        ...prev,
        members: prev.members.filter(m => m.userId !== member.userId),
        memberCount: prev.memberCount - 1,
      } : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove member');
    }
  };

  const handleLinkWalk = async (journeyId: string) => {
    setLinkingId(journeyId);
    try {
      await apiLinkJourney(user.id, String(roomId), journeyId);
      const detail = await loadRoomDetail(String(roomId));
      if (detail) {
        setRoom(detail);
        apiGetJourneyProgress(user.id, String(roomId), journeyId)
          .then(progress => setProgressMap(prev => ({ ...prev, [journeyId]: progress })))
          .catch(() => {});
      }
      setShowLinkWalk(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to link walk');
    } finally {
      setLinkingId(null);
    }
  };

  const openChat = () => {
    history.replaceState({ ...history.state, roomName: room?.name ?? '' }, '');
    setLocation(`/rooms/${roomId}/chat`);
  };

  const contentShortLabel = getContentTypeShortLabel(room.contentType);
  const permissionLabel = getRoomTypeLabel(room.roomType);

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 bg-background/90 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto gap-3">
          <button
            onClick={() => setLocation('/rooms')}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-sans font-semibold text-[17px] truncate">{room.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {/* Content type badge */}
              {room.contentType && (
                <span className="text-[11px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                  {contentShortLabel}
                </span>
              )}
              {/* Permission level badge */}
              <span className="text-[11px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded-full capitalize">
                {permissionLabel}
              </span>
            </div>
          </div>
          {isAdmin && (
            <button
              onClick={() => setLocation(`/rooms/${roomId}/invite`)}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Invite members"
            >
              <Share2 size={20} />
            </button>
          )}
        </div>
      </header>

      <main className="px-5 pt-6 max-w-[480px] mx-auto space-y-8">

        {/* ── Content Panel ─────────────────────────────────────────────── */}
        <section>
          <div className="p-5 rounded-2xl border border-border bg-card space-y-3">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <BookMarked size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">
                  {room.contentType ? `${contentShortLabel} Room` : 'Study Room'}
                </div>
                {contentTitle ? (
                  <div className="text-[16px] font-semibold text-foreground leading-snug">
                    {contentTitle}
                  </div>
                ) : (
                  <div className="text-[15px] text-foreground">
                    {room.description || room.name}
                  </div>
                )}
                {room.description && contentTitle && (
                  <p className="text-[13px] text-muted-foreground mt-1 leading-relaxed">
                    {room.description}
                  </p>
                )}
              </div>
            </div>

            {/* Members online strip */}
            <div className="flex items-center gap-2 pt-1 border-t border-border/60">
              <Users size={13} className="text-muted-foreground" />
              <span className="text-[12px] text-muted-foreground">
                {room.memberCount} member{room.memberCount !== 1 ? 's' : ''}
              </span>
              <div className="flex -space-x-1.5 ml-auto">
                {room.members.slice(0, 5).map(m => {
                  const initials = (m.preferredName || 'M')
                    .split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <div
                      key={m.userId}
                      className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[9px] font-semibold flex items-center justify-center border-2 border-background"
                      title={m.preferredName || 'Member'}
                    >
                      {initials}
                    </div>
                  );
                })}
                {room.members.length > 5 && (
                  <div className="w-6 h-6 rounded-full bg-muted text-muted-foreground text-[9px] font-semibold flex items-center justify-center border-2 border-background">
                    +{room.members.length - 5}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ── Shared Progress ───────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Shared Progress
            </h2>
            <div className="flex items-center gap-3">
              {room.linkedJourneys.length > 0 && (
                <button
                  onClick={() => refreshProgress(false)}
                  disabled={refreshing}
                  className="text-muted-foreground hover:text-foreground transition-colors p-1 disabled:opacity-40"
                  aria-label="Refresh progress"
                >
                  <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                </button>
              )}
              {availableWalks.length > 0 && !showLinkWalk && (
                <button
                  onClick={() => setShowLinkWalk(true)}
                  className="text-[13px] text-primary font-medium hover:underline"
                >
                  + Add a Walk
                </button>
              )}
            </div>
          </div>

          {/* Empty state */}
          {room.linkedJourneys.length === 0 && !showLinkWalk && (
            <div className="p-6 rounded-2xl border border-dashed border-border text-center space-y-2">
              <BookOpen size={22} className="text-muted-foreground mx-auto opacity-40 mb-1" />
              <p className="text-[14px] text-muted-foreground">No Walks linked to this Room yet.</p>
              {availableWalks.length > 0 ? (
                <button
                  onClick={() => setShowLinkWalk(true)}
                  className="text-[14px] text-primary font-medium hover:underline"
                >
                  Add a Walk you're doing →
                </button>
              ) : (
                <p className="text-[13px] text-muted-foreground">
                  Start a Walk, then link it here to track everyone's progress together.
                </p>
              )}
            </div>
          )}

          {/* Walk picker */}
          {showLinkWalk && (
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border/60">
                <p className="text-[13px] text-muted-foreground font-medium">Choose a Walk to add:</p>
              </div>
              {availableWalks.map(w => (
                <button
                  key={w.id}
                  onClick={() => handleLinkWalk(w.id)}
                  disabled={!!linkingId}
                  className="w-full text-left px-5 py-4 border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors flex items-center justify-between"
                >
                  <span className="text-[15px] font-medium text-foreground">{w.title}</span>
                  {linkingId === w.id
                    ? <Loader2 size={16} className="animate-spin text-muted-foreground shrink-0" />
                    : <span className="text-[13px] text-primary font-medium shrink-0">Add</span>
                  }
                </button>
              ))}
              <button
                onClick={() => setShowLinkWalk(false)}
                className="w-full px-5 py-3 text-[13px] text-muted-foreground hover:text-foreground transition-colors text-center"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Linked journeys with per-member progress */}
          {room.linkedJourneys.length > 0 && (
            <div className="space-y-3">
              {room.linkedJourneys.map(lj => {
                const journey = getJourney(lj.journeyId);
                const title = journey?.title ?? lj.journeyId;
                const memberProgress = progressMap[lj.journeyId];
                return (
                  <div key={lj.journeyId} className="rounded-2xl border border-border overflow-hidden bg-card">
                    <div className="flex items-center gap-3.5 px-5 py-4 border-b border-border/60">
                      <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <BookOpen size={16} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] font-medium text-foreground truncate">{title}</div>
                        <div className="text-[12px] text-muted-foreground">
                          Started {new Date(lj.startedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    {memberProgress && memberProgress.length > 0 && (
                      <div className="divide-y divide-border/50">
                        {memberProgress.map(mp => {
                          const isMe = mp.userId === user.id;
                          const memberLabel = mp.preferredName || (isMe ? 'You' : 'Member');
                          const name = isMe ? `${memberLabel} (you)` : memberLabel;
                          let statusLabel: string;
                          if (mp.status === 'completed') {
                            statusLabel = 'Completed ✓';
                          } else if (mp.currentDay != null) {
                            statusLabel = `Day ${mp.currentDay}`;
                          } else {
                            statusLabel = 'Not started yet';
                          }
                          const isComplete = mp.status === 'completed';
                          const notStarted = mp.currentDay == null && mp.status == null;
                          return (
                            <div key={mp.userId} className="flex items-center justify-between px-5 py-3 gap-3">
                              <span className="text-[14px] text-foreground truncate">{name}</span>
                              <span className={`text-[13px] shrink-0 ${
                                isComplete
                                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                  : notStarted
                                  ? 'text-muted-foreground/60'
                                  : 'text-muted-foreground'
                              }`}>
                                {statusLabel}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Prayer Requests ───────────────────────────────────────────── */}
        <PrayerRequests
          roomId={String(roomId)}
          userId={user.id}
          displayName={user.preferredName || 'Member'}
          isAdmin={isAdmin}
        />

        {/* ── Room Chat ─────────────────────────────────────────────────── */}
        <section>
          <button
            onClick={openChat}
            className="w-full text-left p-5 rounded-2xl border border-primary/25 bg-primary/5 hover:border-primary/40 transition-all flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <MessageSquare size={20} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-semibold text-foreground">Discussion &amp; Chat</div>
              <div className="text-[13px] text-muted-foreground">Talk with your Room members</div>
            </div>
            <ArrowLeft size={16} className="text-muted-foreground rotate-180 shrink-0" />
          </button>
        </section>

        {/* ── Members ───────────────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Members ({room.members.length})
            </h2>
            {isAdmin && (
              <button
                onClick={() => setLocation(`/rooms/${roomId}/invite`)}
                className="text-[13px] text-primary font-medium hover:underline"
              >
                Invite Members
              </button>
            )}
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
            {room.members.map(m => {
              const isMe = m.userId === user.id;
              const displayName = isMe
                ? `${m.preferredName || 'You'} (you)`
                : m.preferredName || 'Member';
              const initials = (m.preferredName || 'M')
                .split(' ')
                .map(w => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();
              return (
                <div key={m.userId} className="flex items-center gap-3.5 px-5 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-[13px] font-semibold flex items-center justify-center shrink-0">
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-foreground truncate">{displayName}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {m.role === 'admin' && <Crown size={11} className="text-amber-500" />}
                      <span className="text-[12px] text-muted-foreground capitalize">{m.role}</span>
                    </div>
                  </div>
                  {isAdmin && !isMe && (
                    <button
                      onClick={() => handleRemoveMember(m)}
                      className="text-[12px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Leader Controls scaffold (admin only) ─────────────────────── */}
        {isAdmin && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Leader Controls
            </h2>
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="px-5 py-3 border-b border-border/60">
                <p className="text-[12px] text-muted-foreground/70 font-medium italic">
                  Guide your group together — coming soon
                </p>
              </div>
              {[
                { icon: BookOpen,    label: 'Open Scripture for everyone' },
                { icon: Navigation,  label: "Navigate to today's step" },
                { icon: MessageSquare, label: 'Highlight discussion question' },
                { icon: Mic,         label: 'Start prayer time' },
                { icon: BarChart2,   label: 'Launch a poll' },
                { icon: Video,       label: 'Video call' },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 px-5 py-3.5 border-b border-border/40 last:border-0 opacity-40"
                >
                  <Icon size={16} className="text-muted-foreground shrink-0" />
                  <span className="text-[14px] text-muted-foreground flex-1">{label}</span>
                  <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                    Soon
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Room Actions ──────────────────────────────────────────────── */}
        <section className="space-y-3 pt-2 pb-4">
          {isAdmin && (
            <>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl"
                onClick={() => setLocation(`/rooms/${roomId}/invite`)}
              >
                <Share2 size={16} className="mr-2" />
                Invite Members
              </Button>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl"
                onClick={() => setLocation(`/rooms/${roomId}/settings`)}
              >
                <Settings size={16} className="mr-2" />
                Room Settings
              </Button>
            </>
          )}

          {/* Leave Room (non-admin only) */}
          {!isAdmin && !confirmLeave && (
            <Button
              variant="ghost"
              className="w-full h-11 rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmLeave(true)}
            >
              <LogOut size={16} className="mr-2" />
              Leave Room
            </Button>
          )}
          {!isAdmin && confirmLeave && (
            <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
              <p className="text-[15px] font-medium text-foreground">Leave this Room?</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                You'll lose access to Room chat. Your personal journey progress is preserved.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="flex-1 rounded-xl" onClick={handleLeave} disabled={actioning}>
                  {actioning ? 'Leaving…' : 'Leave Room'}
                </Button>
                <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmLeave(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Admin: delete */}
          {isAdmin && !confirmDelete && (
            <Button
              variant="ghost"
              className="w-full h-11 rounded-xl text-muted-foreground hover:text-destructive"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={16} className="mr-2" />
              Delete Room
            </Button>
          )}
          {isAdmin && confirmDelete && (
            <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
              <p className="text-[15px] font-medium text-foreground">Delete this Room permanently?</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                This removes the Room and all its chat messages. Member journey progress is preserved.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" className="flex-1 rounded-xl" onClick={handleDelete} disabled={actioning}>
                  {actioning ? 'Deleting…' : 'Delete Room'}
                </Button>
                <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {isAdmin && !confirmDelete && (
            <p className="text-center text-[12px] text-muted-foreground">
              As admin, transfer admin to another member before leaving.
            </p>
          )}
        </section>

      </main>
      <BottomNav />
    </div>
  );
}
