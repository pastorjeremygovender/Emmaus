import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import {
  ArrowLeft, MoreHorizontal, MessageSquare, Loader2,
  BookOpen, RefreshCw, ChevronRight, Sparkles,
  Share2, Trash2, LogOut, Pencil, Settings, Users2,
  StickyNote,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type { RoomDetail as RoomDetailType, RoomMember, MemberJourneyProgress, RoomSession, SessionMode, ScriptureRef, RoomHighlight, SharedNote } from '@/lib/rooms-types';
import { PrayerRequests } from '@/components/PrayerRequests';
import { VideoRoom } from '@/components/VideoRoom';
import { GuideGroupPanel } from '@/components/GuideGroupPanel';
import { SharedScripturePanel } from '@/components/SharedScripturePanel';
import { SharedNotesPanel } from '@/components/SharedNotesPanel';
import { useFollowLeader } from '@/hooks/useFollowLeader';
import { apiGetJourneyProgress, apiLinkJourney, apiRenameRoom, apiSendPresenceHeartbeat, apiGetPresenceStreamToken, apiPresenceStreamUrl, apiRecordAttendanceJoin, apiRecordAttendanceLeave } from '@/lib/rooms-api';

const PROGRESS_REFRESH_INTERVAL_MS = 60_000;

export default function RoomDetail() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { loadRoomDetail, leaveRoom, deleteRoom, removeMember } = useRooms();
  const { getJourney, getStepsForJourney, journeys, progress: myProgress } = useJourney();
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
  const [showOverflow, setShowOverflow] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [showGuideGroup, setShowGuideGroup] = useState(false);
  // ── Task #436 — Shared Scripture + Notes panel state ──────────────────────
  const [showSharedScripture, setShowSharedScripture] = useState(false);
  const [showSharedNotes, setShowSharedNotes] = useState(false);
  // Scripture notice banner (non-followers see this and can tap to open)
  const [scripturePendingNotice, setScripturePendingNotice] = useState<{
    scripture: ScriptureRef; leaderName: string;
  } | null>(null);
  // Accumulated SSE highlight/note payloads — consumed by the panels
  const [sseHighlights, setSseHighlights] = useState<RoomHighlight[]>([]);
  const [sseNotes, setSseNotes] = useState<SharedNote[]>([]);
  const [ssePinChange, setSsePinChange] = useState<{ noteId: string; isPinned: boolean } | null>(null);
  const [sseFocusChange, setSseFocusChange] = useState<string | null>(null);

  const renameInputRef = useRef<HTMLInputElement>(null);

  const roomRef = useRef<RoomDetailType | null>(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  // ── Follow Leader / Session event bus ──────────────────────────────────────
  const {
    activeSession,
    setActiveSession,
    followLeader,
    setFollowLeader,
    lastEvent,
    sessionMode,
    activeScripture,
    incomingHighlights,
    incomingNotes,
    incomingPinChange,
    incomingFocusChange,
  } = useFollowLeader({
    roomId: String(roomId),
    userId: user?.id ?? '',
    onNavigate: (_payload) => {
      // Step navigation handled by leader — members follow if followLeader is ON.
    },
    onModeChange: (_mode) => {
      // Mode changes (discussion, prayer, etc.) surfaced via sessionMode.
    },
    onScriptureOpen: (scripture, leaderName) => {
      // Always show the panel immediately for leaders; for members show a notice.
      setScripturePendingNotice({ scripture, leaderName });
      if (followLeader) {
        setShowSharedScripture(true);
        setScripturePendingNotice(null);
      }
    },
  });

  // Sync SSE payload refs into local state so panels receive them
  useEffect(() => {
    if (incomingHighlights.length > 0) {
      setSseHighlights(prev => [...prev, ...incomingHighlights]);
    }
  }, [incomingHighlights]);
  useEffect(() => {
    if (incomingNotes.length > 0) {
      setSseNotes(prev => [...prev, ...incomingNotes]);
    }
  }, [incomingNotes]);
  useEffect(() => {
    if (incomingPinChange) setSsePinChange(incomingPinChange);
  }, [incomingPinChange]);
  useEffect(() => {
    if (incomingFocusChange !== undefined) setSseFocusChange(incomingFocusChange);
  }, [incomingFocusChange]);

  const refreshProgress = useCallback(async (silent = true) => {
    if (!roomRef.current || !user || !roomId) return;
    if (!silent) setRefreshing(true);
    try {
      await Promise.all(
        roomRef.current.linkedJourneys.map(lj =>
          apiGetJourneyProgress(user.id, String(roomId), lj.journeyId)
            .then(p => setProgressMap(prev => ({ ...prev, [lj.journeyId]: p })))
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
          .then(p => setProgressMap(prev => ({ ...prev, [lj.journeyId]: p })))
          .catch(() => {});
      });
    });
  }, [roomId, user, loadRoomDetail]);

  useEffect(() => {
    if (!room) return;
    const timer = setInterval(() => refreshProgress(true), PROGRESS_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [room, refreshProgress]);

  // ── Presence: heartbeat keep-alive + SSE-pushed online list ───────────────
  useEffect(() => {
    if (!roomId || !user) return;

    const HEARTBEAT_MS = 30_000;
    let destroyed = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 2_000;

    const sendHeartbeat = () => {
      apiSendPresenceHeartbeat(user.id, String(roomId)).catch(() => {});
    };

    const openStream = async () => {
      if (destroyed) return;
      try {
        const token = await apiGetPresenceStreamToken(user.id, String(roomId));
        if (destroyed) return;
        const url = apiPresenceStreamUrl(String(roomId), token);
        es = new EventSource(url);
        es.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data) as { onlineUserIds: string[] };
            setOnlineUserIds(new Set(data.onlineUserIds));
            reconnectDelay = 2_000; // reset backoff on a successful message
          } catch { /* ignore malformed events */ }
        };
        es.onerror = () => {
          es?.close();
          es = null;
          if (!destroyed) {
            reconnectTimer = setTimeout(() => {
              reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
              openStream();
            }, reconnectDelay);
          }
        };
      } catch {
        // Token fetch failed — retry with backoff
        if (!destroyed) {
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
            openStream();
          }, reconnectDelay);
        }
      }
    };

    sendHeartbeat();
    openStream();
    const hb = setInterval(sendHeartbeat, HEARTBEAT_MS);

    return () => {
      destroyed = true;
      clearInterval(hb);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [roomId, user]);

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
  // App-level admins (admin / superAdmin) can host video in any room regardless
  // of their room member role — mirrors isAuthorizedLeader() on the server.
  const isAppAdmin = user.role === 'admin' || user.role === 'superAdmin';
  // Authorized leaders: room admin OR app-level admin/superAdmin.
  // The server's guardLeader() also checks the authorized_room_leader flag and
  // pastoral_role = 'pastor'. For the UI gate we use this client-side proxy;
  // the server rejects unauthorised calls regardless.
  const isAuthorizedLeader = isAdmin || isAppAdmin;
  const linkedJourneyIds = new Set(room.linkedJourneys.map(lj => lj.journeyId));
  const availableWalks = journeys.filter(j =>
    j.status === 'Published' &&
    myProgress[j.id] != null &&
    !linkedJourneyIds.has(j.id)
  );

  const primaryLinkedJourney = room.linkedContentId
    ? getJourney(room.linkedContentId)
    : null;
  const contentTitle = primaryLinkedJourney?.title ?? null;

  const myProgressInLinkedJourney = room.linkedContentId
    ? myProgress[room.linkedContentId]
    : null;
  const currentStep = myProgressInLinkedJourney?.currentDay ?? null;

  const totalSteps = room.linkedContentId
    ? getStepsForJourney(room.linkedContentId).filter(s => s.status === 'Published').length
    : 0;

  const leaderMember = room.members.find(m => m.role === 'admin');
  const leaderName = leaderMember?.preferredName ?? 'Your leader';

  // VideoRoom mounts when: the room is not personal, OR the current user is a
  // room admin, OR they have an app-level admin/superAdmin role (mirrors
  // isAuthorizedLeader() on the server which uses app role, not room role).
  const videoEligible = room.roomType !== 'personal' || isAdmin || isAppAdmin;

  const handleBack = () => {
    if (window.history.length > 1) window.history.back();
    else setLocation('/rooms');
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
          .then(p => setProgressMap(prev => ({ ...prev, [journeyId]: p })))
          .catch(() => {});
      }
      setShowLinkWalk(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to link walk');
    } finally {
      setLinkingId(null);
    }
  };

  const handleStartRename = () => {
    setRenameValue(room?.name ?? '');
    setRenaming(true);
    setShowOverflow(false);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const handleRenameSubmit = async () => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    if (trimmed === room?.name) { setRenaming(false); return; }
    if (trimmed.length > 80) return;
    setRenameSaving(true);
    try {
      await apiRenameRoom(user.id, String(roomId), trimmed);
      setRoom(prev => prev ? { ...prev, name: trimmed } : prev);
      setRenaming(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to rename room');
    } finally {
      setRenameSaving(false);
    }
  };

  const openChat = () => {
    history.replaceState({ ...history.state, roomName: room?.name ?? '' }, '');
    setLocation(`/rooms/${roomId}/chat`);
  };

  return (
    <div
      className="min-h-[100dvh] bg-background pb-page-safe"
      onClick={() => setShowOverflow(false)}
    >
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/50">
        <div className="flex items-center h-14 px-4 max-w-[480px] mx-auto gap-3">
          <button
            onClick={handleBack}
            className="p-2 -ml-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={22} />
          </button>

          {renaming ? (
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') handleRenameSubmit();
                  if (e.key === 'Escape') setRenaming(false);
                }}
                maxLength={80}
                className="flex-1 min-w-0 bg-transparent border-b border-primary text-[17px] font-semibold text-foreground outline-none py-0.5"
                aria-label="Room name"
              />
              <button
                onClick={handleRenameSubmit}
                disabled={renameSaving || !renameValue.trim()}
                className="text-[13px] text-primary font-semibold shrink-0 disabled:opacity-40"
              >
                {renameSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
              </button>
              <button
                onClick={() => setRenaming(false)}
                className="text-[13px] text-muted-foreground shrink-0"
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="flex-1 min-w-0 font-sans font-semibold text-[17px] truncate">
              {room.name}
            </h1>
          )}

          {/* Overflow (⋯) menu */}
          <div className="relative shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setShowOverflow(v => !v); }}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Room options"
            >
              <MoreHorizontal size={22} />
            </button>

            {showOverflow && (
              <div
                className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-2xl shadow-lg overflow-hidden z-30"
                onClick={e => e.stopPropagation()}
              >
                {isAuthorizedLeader && (
                  <button
                    onClick={() => { setShowOverflow(false); setShowGuideGroup(true); }}
                    className="w-full text-left px-4 py-3.5 text-[14px] text-primary font-semibold hover:bg-primary/5 transition-colors flex items-center gap-2.5"
                  >
                    <Users2 size={15} className="shrink-0" />
                    Guide Group
                  </button>
                )}
                {isAdmin ? (
                  <>
                    <button
                      onClick={handleStartRename}
                      className={`w-full text-left px-4 py-3.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2.5 ${isAuthorizedLeader ? 'border-t border-border/60' : ''}`}
                    >
                      <Pencil size={15} className="text-muted-foreground shrink-0" />
                      Rename Room
                    </button>
                    <button
                      onClick={() => { setShowOverflow(false); setLocation(`/rooms/${roomId}/invite`); }}
                      className="w-full text-left px-4 py-3.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2.5 border-t border-border/60"
                    >
                      <Share2 size={15} className="text-muted-foreground shrink-0" />
                      Invite Members
                    </button>
                    <button
                      onClick={() => { setShowOverflow(false); setLocation(`/rooms/${roomId}/settings`); }}
                      className="w-full text-left px-4 py-3.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2.5 border-t border-border/60"
                    >
                      <Settings size={15} className="text-muted-foreground shrink-0" />
                      Room Settings
                    </button>
                    <button
                      onClick={() => { setShowOverflow(false); setConfirmDelete(true); }}
                      className="w-full text-left px-4 py-3.5 text-[14px] text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2.5 border-t border-border/60"
                    >
                      <Trash2 size={15} className="shrink-0" />
                      Delete Room
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => { setShowOverflow(false); setConfirmLeave(true); }}
                    className={`w-full text-left px-4 py-3.5 text-[14px] text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2.5 ${isAuthorizedLeader ? 'border-t border-border/60' : ''}`}
                  >
                    <LogOut size={15} className="shrink-0" />
                    Leave Room
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Guide Group Panel (leader only bottom sheet) ─────────────────── */}
      {isAuthorizedLeader && (
        <GuideGroupPanel
          roomId={String(roomId)}
          userId={user.id}
          leaderName={user.preferredName || 'Leader'}
          isOpen={showGuideGroup}
          onClose={() => setShowGuideGroup(false)}
          activeSession={activeSession}
          onSessionStarted={(session) => {
            setActiveSession(session);
            setShowGuideGroup(false);
          }}
          onSessionEnded={() => {
            setActiveSession(null);
          }}
          videoActive={false /* wired to VideoRoom state in Task #437 */}
          onOpenVideo={() => {/* handled by VideoRoom directly */}}
          onEndVideo={() => {/* handled by VideoRoom directly */}}
        />
      )}

      {/* ── Shared Scripture Panel (Task #436) ───────────────────────────── */}
      {showSharedScripture && activeScripture && (
        <SharedScripturePanel
          roomId={String(roomId)}
          userId={user.id}
          sessionId={activeSession?.id ?? ''}
          scripture={activeScripture}
          incomingHighlights={sseHighlights}
          focusHighlightId={sseFocusChange}
          isLeader={isAuthorizedLeader}
          userName={user.preferredName || 'Member'}
          onClose={() => {
            setShowSharedScripture(false);
            setSseHighlights([]);
            setSseFocusChange(null);
          }}
        />
      )}

      {/* ── Shared Notes Panel (Task #436) ───────────────────────────────── */}
      {showSharedNotes && activeSession && (
        <SharedNotesPanel
          roomId={String(roomId)}
          userId={user.id}
          sessionId={activeSession.id}
          isLeader={isAuthorizedLeader}
          userName={user.preferredName || 'Member'}
          incomingNotes={sseNotes}
          incomingPinChange={ssePinChange ?? undefined}
          onClose={() => {
            setShowSharedNotes(false);
            setSseNotes([]);
            setSsePinChange(null);
          }}
        />
      )}

      <main className="px-5 pt-5 max-w-[480px] mx-auto space-y-6 pb-6">

        {/* ── Session banner: active session indicator + Follow Leader toggle */}
        {activeSession && (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-primary/8 border border-primary/20">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-foreground">
                    Guided session active
                  </p>
                  <p className="text-[11px] text-muted-foreground capitalize">
                    {sessionMode === 'prayer' ? 'Prayer Time' :
                     sessionMode === 'discussion' ? 'Group Discussion' :
                     sessionMode === 'scripture' ? 'Reading Scripture' :
                     sessionMode === 'poll' ? 'Poll' :
                     "Today's Study"}
                  </p>
                </div>
              </div>
              {!isAuthorizedLeader && (
                <button
                  onClick={() => setFollowLeader(!followLeader)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold border transition-all ${
                    followLeader
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
                  }`}
                  title={followLeader ? 'Following leader — tap to browse freely' : 'Tap to follow leader'}
                >
                  {followLeader ? '● Following' : 'Follow Leader'}
                </button>
              )}
            </div>

            {/* Quick-access row: Open Scripture + Group Notes */}
            <div className="flex gap-2">
              {activeScripture && (
                <button
                  onClick={() => setShowSharedScripture(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-primary/30 bg-primary/5 text-primary text-[13px] font-semibold hover:bg-primary/10 transition-all"
                >
                  <BookOpen size={14} />
                  {activeScripture.displayLabel ||
                    `${activeScripture.book} ${activeScripture.chapter}`}
                </button>
              )}
              <button
                onClick={() => setShowSharedNotes(true)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-border bg-card text-muted-foreground text-[13px] font-medium hover:text-foreground hover:border-primary/30 transition-all"
              >
                <StickyNote size={14} />
                Group Notes
              </button>
            </div>

            {/* Scripture notice for non-followers */}
            {scripturePendingNotice && !showSharedScripture && (
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
                <div className="flex items-center gap-2">
                  <BookOpen size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
                  <p className="text-[12px] text-amber-700 dark:text-amber-300">
                    <span className="font-semibold">{scripturePendingNotice.leaderName}</span> opened{' '}
                    {scripturePendingNotice.scripture.displayLabel ||
                      `${scripturePendingNotice.scripture.book} ${scripturePendingNotice.scripture.chapter}`}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowSharedScripture(true);
                    setScripturePendingNotice(null);
                  }}
                  className="text-[12px] text-amber-700 dark:text-amber-300 font-semibold shrink-0 ml-2"
                >
                  Open →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Guide Group FAB (leader only, shown when no active session) ── */}
        {isAuthorizedLeader && !activeSession && (
          <button
            onClick={() => setShowGuideGroup(true)}
            className="w-full py-3.5 rounded-2xl border border-primary/30 bg-primary/5 text-primary font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-primary/10 transition-all"
          >
            <Users2 size={17} />
            Guide Group
          </button>
        )}

        {/* ── 1. Gather Together — PRIMARY ACTION ───────────────────────── */}
        {videoEligible && (
          <VideoRoom
            roomId={String(roomId)}
            userId={user.id}
            displayName={user.preferredName || 'Member'}
            videoEligible={videoEligible}
            leaderName={leaderName}
          />
        )}

        {/* ── 2. Today's Study ──────────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Today&apos;s Study
          </p>
          {contentTitle ? (
            <button
              onClick={() => room.linkedContentId
                ? setLocation(`/journeys/${room.linkedContentId}`)
                : setLocation('/walk')
              }
              className="w-full text-left p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-all"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <BookOpen size={18} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[16px] font-semibold text-foreground truncate leading-snug">
                    {contentTitle}
                  </p>
                  {currentStep != null && (
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                      Step {currentStep}{totalSteps > 0 ? ` of ${totalSteps}` : ''}
                    </p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-1 text-primary font-medium text-[14px]">
                  Continue
                  <ChevronRight size={16} />
                </div>
              </div>
            </button>
          ) : (
            <div className="p-5 rounded-2xl border border-dashed border-border bg-card/50 text-center space-y-3">
              <BookOpen size={22} className="mx-auto text-muted-foreground opacity-40" />
              <p className="text-[14px] text-muted-foreground">Choose something to study together.</p>
              {availableWalks.length > 0 && (
                <button
                  onClick={() => setShowLinkWalk(true)}
                  className="text-[14px] text-primary font-medium hover:underline"
                >
                  Add a Walk →
                </button>
              )}
            </div>
          )}

          {/* Walk picker */}
          {showLinkWalk && (
            <div className="mt-3 rounded-2xl border border-border bg-card overflow-hidden">
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
        </section>

        {/* ── 3. Walking Together ───────────────────────────────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              Walking Together
            </p>
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
            {[...room.members].sort((a, b) => {
              const aOnline = onlineUserIds.has(a.userId) ? 0 : 1;
              const bOnline = onlineUserIds.has(b.userId) ? 0 : 1;
              return aOnline - bOnline;
            }).map(m => {
              const isMe = m.userId === user.id;
              const name = isMe
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
                    <span
                      className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background transition-colors ${
                        onlineUserIds.has(m.userId) ? 'bg-emerald-400' : 'bg-muted-foreground/30'
                      }`}
                      title={onlineUserIds.has(m.userId) ? 'Online' : 'Offline'}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-foreground truncate">{name}</p>
                    {m.role === 'admin' && (
                      <p className="text-[12px] text-amber-600 dark:text-amber-400 font-medium">Leader</p>
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

        {/* ── 4. Group Discussion ───────────────────────────────────────── */}
        <section>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Group Discussion
          </p>
          <button
            onClick={openChat}
            className="w-full text-left p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
              <MessageSquare size={19} className="text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-semibold text-foreground">Group Discussion</p>
              <p className="text-[13px] text-muted-foreground mt-0.5">
                Talk together about today&apos;s study.
              </p>
            </div>
            <ChevronRight size={18} className="text-muted-foreground shrink-0" />
          </button>
        </section>

        {/* ── 5. Prayer Requests ────────────────────────────────────────── */}
        <PrayerRequests
          roomId={String(roomId)}
          userId={user.id}
          displayName={user.preferredName || 'Member'}
          isAdmin={isAdmin}
        />

        {/* ── 6. Shared Progress ────────────────────────────────────────── */}
        {(room.linkedJourneys.length > 0 || availableWalks.length > 0) && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                Shared Progress
              </p>
              <div className="flex items-center gap-3">
                {room.linkedJourneys.length > 0 && (
                  <button
                    onClick={() => refreshProgress(false)}
                    disabled={refreshing}
                    className="text-muted-foreground hover:text-foreground transition-colors p-1 disabled:opacity-40"
                    aria-label="Refresh"
                  >
                    <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                  </button>
                )}
                {availableWalks.length > 0 && !showLinkWalk && contentTitle && (
                  <button
                    onClick={() => setShowLinkWalk(true)}
                    className="text-[13px] text-primary font-medium hover:underline"
                  >
                    + Add Walk
                  </button>
                )}
              </div>
            </div>

            {room.linkedJourneys.length === 0 && (
              <div className="p-5 rounded-2xl border border-dashed border-border text-center">
                <p className="text-[14px] text-muted-foreground">
                  No Walks linked yet.
                </p>
              </div>
            )}

            {room.linkedJourneys.map(lj => {
              const journey = getJourney(lj.journeyId);
              const journeyTitle = journey?.title ?? lj.journeyId;
              const journeySteps = getStepsForJourney(lj.journeyId).filter(s => s.status === 'Published').length;
              const memberProgress = progressMap[lj.journeyId];

              return (
                <div key={lj.journeyId} className="rounded-2xl border border-border overflow-hidden bg-card">
                  <div className="px-5 py-4 border-b border-border/60">
                    <p className="text-[14px] font-semibold text-foreground">{journeyTitle}</p>
                    {journeySteps > 0 && (
                      <p className="text-[12px] text-muted-foreground mt-0.5">{journeySteps} steps</p>
                    )}
                  </div>

                  {memberProgress && memberProgress.length > 0 ? (
                    <div className="divide-y divide-border/50">
                      {memberProgress.map(mp => {
                        const isMe = mp.userId === user.id;
                        const memberLabel = mp.preferredName || (isMe ? 'You' : 'Member');
                        const displayName = isMe ? `${memberLabel} (you)` : memberLabel;
                        const isComplete = mp.status === 'completed';
                        const stepNum = mp.currentDay ?? 0;
                        const pct = journeySteps > 0
                          ? isComplete ? 100 : Math.round((stepNum / journeySteps) * 100)
                          : 0;

                        return (
                          <div key={mp.userId} className="px-5 py-4 space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[14px] font-medium text-foreground truncate">{displayName}</p>
                              <p className={`text-[12px] shrink-0 font-medium ${
                                isComplete
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : stepNum > 0
                                  ? 'text-muted-foreground'
                                  : 'text-muted-foreground/50'
                              }`}>
                                {isComplete ? 'Completed ✓' : stepNum > 0 ? `Step ${stepNum}` : 'Not started'}
                              </p>
                            </div>
                            {/* Progress bar */}
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  isComplete
                                    ? 'bg-emerald-500'
                                    : pct > 0
                                    ? 'bg-primary'
                                    : 'bg-transparent'
                                }`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            {journeySteps > 0 && !isComplete && pct > 0 && (
                              <p className="text-[11px] text-muted-foreground/70">{pct}% complete</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-5 py-4">
                      <p className="text-[13px] text-muted-foreground">No progress data yet.</p>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* ── 7. Ask Emmaus ─────────────────────────────────────────────── */}
        <section>
          <button
            onClick={() => setLocation('/personal')}
            className="w-full text-left p-5 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-4"
          >
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <Sparkles size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[16px] font-semibold text-foreground">Ask Emmaus</p>
              <p className="text-[13px] text-muted-foreground mt-0.5 leading-relaxed">
                Ask about today&apos;s study, today&apos;s Scripture or your discussion.
              </p>
            </div>
            <ChevronRight size={18} className="text-muted-foreground shrink-0" />
          </button>
        </section>

        {/* ── Confirm Leave / Delete ────────────────────────────────────── */}
        {confirmLeave && (
          <div className="p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
            <p className="text-[15px] font-medium text-foreground">Leave this Room?</p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              You&apos;ll lose access to Room discussion. Your personal journey progress is preserved.
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

        {confirmDelete && (
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

      </main>
      <BottomNav />
    </div>
  );
}
