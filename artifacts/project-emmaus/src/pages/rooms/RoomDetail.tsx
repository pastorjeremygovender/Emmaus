import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import {
  ArrowLeft, Settings, LogOut, Trash2,
  MessageSquare, Loader2, BookOpen, RefreshCw,
  ChevronRight, Share2, Sparkles,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { RoomDetail as RoomDetailType, RoomMember, MemberJourneyProgress } from '@/lib/rooms-types';
import { apiGetJourneyProgress, apiLinkJourney } from '@/lib/rooms-api';
import { PrayerRequests } from '@/components/PrayerRequests';
import { VideoRoom } from '@/components/VideoRoom';

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
  const [showGearMenu, setShowGearMenu] = useState(false);

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

  // Resolve linked content info
  const primaryLinkedJourney = room.linkedContentId
    ? getJourney(room.linkedContentId)
    : null;
  const contentTitle = primaryLinkedJourney?.title ?? null;

  // Current user's step in the linked journey
  const myProgressInLinkedJourney = room.linkedContentId
    ? myProgress[room.linkedContentId]
    : null;
  const currentStep = myProgressInLinkedJourney?.currentDay ?? null;

  const handleBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation('/rooms');
    }
  };

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

  const navigateToStudy = () => {
    if (room.linkedContentId) {
      setLocation(`/journeys/${room.linkedContentId}`);
    } else {
      setLocation('/walk');
    }
  };

  // Personal rooms are not gathering-eligible.
  // Ministry / Leadership / Church Service rooms can host live gatherings.
  const videoEligible = room.roomType !== 'personal';

  return (
    <div className="min-h-[100dvh] bg-background pb-page-safe" onClick={() => setShowGearMenu(false)}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto gap-3">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-sans font-semibold text-[17px] truncate leading-tight">
              {room.name}
            </div>
            {contentTitle && (
              <div className="text-[12px] text-muted-foreground truncate leading-tight mt-0.5">
                Walking through: {contentTitle}{currentStep != null ? ` · Step ${currentStep}` : ''}
              </div>
            )}
          </div>
          {/* Leader gear icon */}
          {isAdmin && (
            <div className="relative shrink-0">
              <button
                onClick={e => { e.stopPropagation(); setShowGearMenu(m => !m); }}
                className="p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Guide Group"
              >
                <Settings size={20} />
              </button>
              {showGearMenu && (
                <div
                  className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-2xl shadow-lg overflow-hidden z-30"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="px-4 py-2.5 border-b border-border/60">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      Guide Group
                    </p>
                  </div>
                  {contentTitle && (
                    <button
                      onClick={() => { setShowGearMenu(false); navigateToStudy(); }}
                      className="w-full text-left px-4 py-3 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2.5"
                    >
                      <BookOpen size={15} className="text-muted-foreground shrink-0" />
                      Open Today's Step
                    </button>
                  )}
                  <button
                    onClick={() => { setShowGearMenu(false); setLocation(`/rooms/${roomId}/invite`); }}
                    className="w-full text-left px-4 py-3 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2.5"
                  >
                    <Share2 size={15} className="text-muted-foreground shrink-0" />
                    Invite Someone
                  </button>
                  <button
                    onClick={() => { setShowGearMenu(false); setLocation(`/rooms/${roomId}/settings`); }}
                    className="w-full text-left px-4 py-3 text-[14px] text-foreground hover:bg-muted/50 transition-colors border-t border-border/40 flex items-center gap-2.5"
                  >
                    <Settings size={15} className="text-muted-foreground shrink-0" />
                    Room Settings
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      <main className="px-5 pt-6 max-w-[480px] mx-auto space-y-8">

        {/* ── Walking Together ──────────────────────────────────────────── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Walking Together
            </h2>
            {isAdmin && (
              <button
                onClick={() => setLocation(`/rooms/${roomId}/invite`)}
                className="text-[13px] text-primary font-medium hover:underline"
              >
                Invite Someone
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
                .map((w: string) => w[0])
                .slice(0, 2)
                .join('')
                .toUpperCase();
              return (
                <div key={m.userId} className="flex items-center gap-3.5 px-5 py-3.5">
                  <div className="relative shrink-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-[13px] font-semibold flex items-center justify-center">
                      {initials}
                    </div>
                    {/* Online indicator — static for now */}
                    <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-background" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-medium text-foreground truncate">{displayName}</div>
                    {m.role === 'admin' && (
                      <div className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">Leader</div>
                    )}
                  </div>
                  {isAdmin && !isMe && (
                    <button
                      onClick={() => handleRemoveMember(m)}
                      className="text-[12px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1 shrink-0"
                    >
                      Remove
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Gather Together ───────────────────────────────────────────── */}
        {videoEligible && (
          <section className="space-y-3">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Gather Together
            </h2>
            <VideoRoom
              roomId={String(roomId)}
              userId={user.id}
              displayName={user.preferredName || 'Member'}
              videoEligible={videoEligible}
            />
          </section>
        )}

        {/* ── Continue Today's Step ─────────────────────────────────────── */}
        <section>
          <button
            onClick={navigateToStudy}
            className="w-full text-left p-5 rounded-2xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <BookOpen size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-semibold">
                {contentTitle ? "Continue Today\u2019s Step" : 'Explore Content'}
              </div>
              <div className="text-[13px] opacity-80 mt-0.5 truncate">
                {contentTitle ?? 'Browse Walks, Journeys and Devotionals'}
              </div>
            </div>
            <ChevronRight size={20} className="opacity-60 shrink-0" />
          </button>
        </section>

        {/* ── Discuss Together ──────────────────────────────────────────── */}
        <section>
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Discuss Together
          </h2>
          <button
            onClick={openChat}
            className="w-full text-left p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <MessageSquare size={20} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-semibold text-foreground">Open Discussion</div>
              <div className="text-[13px] text-muted-foreground mt-0.5">Talk with your group</div>
            </div>
            <ChevronRight size={18} className="text-muted-foreground shrink-0" />
          </button>
        </section>

        {/* ── Prayer Wall ───────────────────────────────────────────────── */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
            Prayer Wall
          </h2>
          <PrayerRequests
            roomId={String(roomId)}
            userId={user.id}
            displayName={user.preferredName || 'Member'}
            isAdmin={isAdmin}
          />
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
                          const isComplete = mp.status === 'completed';
                          const notStarted = mp.currentDay == null && mp.status == null;
                          let statusLabel: string;
                          if (isComplete) {
                            statusLabel = 'Completed ✓';
                          } else if (mp.currentDay != null) {
                            statusLabel = `Step ${mp.currentDay}`;
                          } else {
                            statusLabel = 'Not started yet';
                          }
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

        {/* ── Ask Emmaus ────────────────────────────────────────────────── */}
        <section>
          <button
            onClick={() => setLocation('/personal')}
            className="w-full text-left p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-semibold text-foreground">Ask Emmaus</div>
              <div className="text-[13px] text-muted-foreground mt-0.5">
                Questions about today's passage, the Walk, or anything you're studying
              </div>
            </div>
            <ChevronRight size={18} className="text-muted-foreground shrink-0" />
          </button>
        </section>

        {/* ── Leave / Delete ────────────────────────────────────────────── */}
        <section className="space-y-3 pt-2 pb-6">
          {/* Leave Room (non-admin only) */}
          {!isAdmin && !confirmLeave && (
            <button
              className="w-full py-3 text-[14px] text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center gap-2"
              onClick={() => setConfirmLeave(true)}
            >
              <LogOut size={15} />
              Leave Room
            </button>
          )}
          {!isAdmin && confirmLeave && (
            <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
              <p className="text-[15px] font-medium text-foreground">Leave this Room?</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                You'll lose access to Room discussion. Your personal journey progress is preserved.
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
            <button
              className="w-full py-3 text-[14px] text-muted-foreground hover:text-destructive transition-colors flex items-center justify-center gap-2"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={15} />
              Delete Room
            </button>
          )}
          {isAdmin && confirmDelete && (
            <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
              <p className="text-[15px] font-medium text-foreground">Delete this Room permanently?</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                This removes the Room and all its discussion. Member journey progress is preserved.
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
        </section>

      </main>
      <BottomNav />
    </div>
  );
}
