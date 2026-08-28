import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import { useRooms } from '@/contexts/RoomsContext';
import { Button } from '@/components/ui/button';
import { BottomNav } from '@/components/BottomNav';
import {
  ArrowLeft, MoreHorizontal, MessageSquare, Loader2,
  BookOpen, ChevronRight,
  Share2, Trash2, LogOut, Pencil, Settings, Users2,
  StickyNote, HandHeart, CheckCircle2, Clock, MapPin, StopCircle,
  Crown, Calendar, RefreshCw,
  FileText, X, Edit2, Check,
} from 'lucide-react';
import { useJourney } from '@/contexts/JourneyContext';
import type {
  RoomDetail as RoomDetailType, RoomMember, MemberJourneyProgress,
  RoomSession, ScriptureRef, RoomHighlight, SharedNote, RoomPoll, SessionAttendee,
} from '@/lib/rooms-types';
import { isRoomLeaderRole, isRoomOwnerRole } from '@/lib/rooms-types';
import { goBackOrFallback } from '@/lib/return-context';
import { PrayerRequests } from '@/components/PrayerRequests';
import { GuideGroupPanel } from '@/components/GuideGroupPanel';
import { SharedScripturePanel } from '@/components/SharedScripturePanel';
import { SharedNotesPanel } from '@/components/SharedNotesPanel';
import { SharedAskEmmausPanel } from '@/components/SharedAskEmmausPanel';
import { PollCard } from '@/components/PollCard';
import { SessionCompleteCard } from '@/components/SessionCompleteCard';
import { useFollowLeader } from '@/hooks/useFollowLeader';
import { roomSessionAckKey } from '@/lib/account-storage';
import {
  apiGetJourneyProgress, apiLinkJourney, apiUnlinkPrimaryJourney, apiRenameRoom,
  apiSendPresenceHeartbeat, apiGetPresenceStreamToken, apiPresenceStreamUrl,
  apiRecordAttendanceJoin,
  apiGetActivePoll, apiGetSessionAttendance, apiChangeMode, apiCloseSharedTool,
  apiStartSession, apiEndSession, apiCompleteSession, apiAcknowledgeSessionCompletion, apiUpdateLeaderNote, apiUpdateSchedule,
  apiStartVideo, apiEndVideo, apiGetVideoStatus,
} from '@/lib/rooms-api';
import { VideoRoom } from '@/components/VideoRoom';
import { PresentationPanel } from '@/components/PresentationPanel';
import { apiGetActivePresentation, apiSetAllowMemberPresent } from '@/lib/rooms-api-media';

const PROGRESS_REFRESH_INTERVAL_MS = 60_000;

/** Format a future meeting datetime into a human-readable countdown string. */
function formatMeetingCountdown(isoString: string): { label: string; isPast: boolean } {
  const target = new Date(isoString).getTime();
  const now = Date.now();
  const diff = target - now;

  if (diff < 0) {
    return { label: 'Meeting time passed', isPast: true };
  }

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  const timeStr = new Date(isoString).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dateStr = new Date(isoString).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });

  if (minutes < 60) return { label: `In ${minutes} minute${minutes !== 1 ? 's' : ''}`, isPast: false };
  if (hours < 24) return { label: `Today at ${timeStr}`, isPast: false };
  if (days === 1) return { label: `Tomorrow at ${timeStr}`, isPast: false };
  if (days < 7) return { label: `${dateStr} at ${timeStr}`, isPast: false };
  return { label: `${dateStr} at ${timeStr}`, isPast: false };
}

/** Convert a local datetime-local value to an ISO string for the server. */
function localDateTimeToISO(localDT: string): string {
  return new Date(localDT).toISOString();
}

/** Convert an ISO string to a datetime-local input value. */
function isoToLocalDateTime(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Derive a member's preparation status from their journey progress. */
function getPrepStatus(
  progress: MemberJourneyProgress[] | undefined,
  userId: string,
  studyTitle?: string | null,
): { label: string; color: string } {
  if (!progress) return { label: 'Study not started', color: 'text-muted-foreground/60' };
  const p = progress.find(mp => mp.userId === userId);
  if (!p || !p.status || p.status === 'dropped') return { label: 'Study not started', color: 'text-muted-foreground/60' };
  if (p.status === 'completed') return { label: 'Study completed', color: 'text-emerald-600 dark:text-emerald-400' };
  return { label: `Reading ${studyTitle || 'study'}`, color: 'text-sky-600 dark:text-sky-400' };
}

export default function RoomDetail() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { loadRoomDetail, leaveRoom, deleteRoom, removeMember } = useRooms();
  const { getJourney, getStepsForJourney, journeys, progress: myProgress } = useJourney();
  const [, setLocation] = useLocation();

  // ── Core state ─────────────────────────────────────────────────────────────
  const [room, setRoom] = useState<RoomDetailType | null>(null);
  const [loadError, setLoadError] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actioning, setActioning] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, MemberJourneyProgress[]>>({});
  const [showLinkWalk, setShowLinkWalk] = useState(false);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [showOverflow, setShowOverflow] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [showGuideGroup, setShowGuideGroup] = useState(false);

  // ── Groups V2 state ────────────────────────────────────────────────────────
  const [leaderNote, setLeaderNote] = useState<string | null>(null);
  const [leaderNoteEditing, setLeaderNoteEditing] = useState(false);
  const [leaderNoteValue, setLeaderNoteValue] = useState('');
  const [leaderNoteSaving, setLeaderNoteSaving] = useState(false);
  const [nextMeeting, setNextMeeting] = useState<string | null>(null);
  const [revealOnMeeting, setRevealOnMeeting] = useState(false);
  const [allowMemberPresent, setAllowMemberPresent] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [startingMeeting, setStartingMeeting] = useState(false);
  const [showStartMeetingMode, setShowStartMeetingMode] = useState(false);
  const [endingMeeting, setEndingMeeting] = useState(false);
  // (showDiscussion removed — Discussion is now a plain card, not an accordion)
  const [refreshing, setRefreshing] = useState(false);

  // ── Shared Scripture & Notes state ─────────────────────────────────────────
  const [showSharedScripture, setShowSharedScripture] = useState(false);
  const [showSharedNotes, setShowSharedNotes] = useState(false);
  const [scripturePendingNotice, setScripturePendingNotice] = useState<{
    scripture: ScriptureRef; leaderName: string;
  } | null>(null);
  const [discussionPendingNotice, setDiscussionPendingNotice] = useState<string | null>(null);
  const [sseHighlights, setSseHighlights] = useState<RoomHighlight[]>([]);
  const [sseNotes, setSseNotes] = useState<SharedNote[]>([]);
  const [ssePinChange, setSsePinChange] = useState<{ noteId: string; isPinned: boolean } | null>(null);
  const [sseFocusChange, setSseFocusChange] = useState<string | null>(null);

  // ── Shared Ask Emmaus + Polls state ────────────────────────────────────────
  const [showSharedAskEmmaus, setShowSharedAskEmmaus] = useState(false);
  const [activePoll, setActivePoll] = useState<RoomPoll | null>(null);
  const [hydratedPollResults, setHydratedPollResults] = useState<{
    voteCounts: number[];
    totalVotes: number;
    userVotedIndex: number | null;
  } | null>(null);

  // ── Attendance state ────────────────────────────────────────────────────────
  const [attendanceData, setAttendanceData] = useState<SessionAttendee[]>([]);
  const [joiningMeeting, setJoiningMeeting] = useState(false);

  // ── Leader's completion summary ─────────────────────────────────────────────
  const [leaderSessionComplete, setLeaderSessionComplete] = useState<import('@/lib/rooms-types').SessionCompleteSummary | null>(null);

  // ── Live Video state ────────────────────────────────────────────────────────
  const [videoActive, setVideoActive] = useState(false);
  /** Whether the current user is authorized to start/end video (server-verified). */
  const [videoCanHost, setVideoCanHost] = useState(false);
  const [liveMeetingMode, setLiveMeetingMode] = useState<'audio' | 'video'>('video');
  const [confirmEndMeeting, setConfirmEndMeeting] = useState(false);

  // ── Follow-up phase state ───────────────────────────────────────────────────
  const [meetingJustEnded, setMeetingJustEnded] = useState(false);
  const [endedSessionSnapshot, setEndedSessionSnapshot] = useState<{
    startedAt: string;
    attendance: Array<{ userId: string; joinedAt: string; leftAt: string | null }>;
  } | null>(null);

  const renameInputRef = useRef<HTMLInputElement>(null);
  const roomRef = useRef<RoomDetailType | null>(null);
  const lastOpenedDiscussionRef = useRef<string | null>(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  // ── Follow Leader / Session event bus ──────────────────────────────────────
  const {
    activeSession,
    setActiveSession,
    followLeader,
    setFollowLeader,
    sessionMode,
    activeScripture,
    incomingHighlights,
    incomingNotes,
    incomingPinChange,
    incomingFocusChange,
    sessionComplete: sseSessionComplete,
    clearSessionComplete: clearSseSessionComplete,
    emmausQuestion,
    emmausStreamText,
    emmausAnswer,
    incomingPoll,
    pollVoteUpdate,
    pollRevealUpdate,
    activePresentation,
    setActivePresentation,
    activeTool,
    lastEvent,
  } = useFollowLeader({
    roomId: String(roomId),
    userId: user?.id ?? '',
    onNavigate: (_payload) => {},
    onModeChange: (_mode) => {},
    onScriptureOpen: (scripture, leaderName) => {
      setScripturePendingNotice({ scripture, leaderName });
      if (followLeader) {
        setShowSharedScripture(true);
        setScripturePendingNotice(null);
      }
    },
  });

  const sessionComplete = leaderSessionComplete ?? sseSessionComplete;
  const clearSessionComplete = () => {
    const sid = sessionComplete?.sessionId;
    if (sid) {
      // Fast-path: localStorage prevents a flash before the server responds.
      if (user?.id) {
        localStorage.setItem(roomSessionAckKey(user.id, sid), '1');
      }
      // Authoritative: server-side record prevents re-appearance on any device.
      apiAcknowledgeSessionCompletion(user?.id ?? '', String(roomId), sid).catch(() => {
        // Non-fatal — localStorage is the fallback for the current device.
      });
    }
    setLeaderSessionComplete(null);
    clearSseSessionComplete();
  };

  // Sync SSE payloads
  useEffect(() => {
    if (incomingHighlights.length > 0) setSseHighlights(prev => [...prev, ...incomingHighlights]);
  }, [incomingHighlights]);
  useEffect(() => {
    if (incomingNotes.length > 0) setSseNotes(prev => [...prev, ...incomingNotes]);
  }, [incomingNotes]);
  useEffect(() => {
    if (incomingPinChange) setSsePinChange(incomingPinChange);
  }, [incomingPinChange]);
  useEffect(() => {
    if (incomingFocusChange !== undefined) setSseFocusChange(incomingFocusChange);
  }, [incomingFocusChange]);

  // Clear accumulated session data when a session ends so stale highlights
  // and notes don't bleed into the next meeting.
  useEffect(() => {
    if (activeSession === null) {
      setSseHighlights([]);
      setSseNotes([]);
      setSsePinChange(null);
      setSseFocusChange(null);
      setActivePresentation(null);
    }
  }, [activeSession]);

  // Fetch active presentation when joining/reconnecting to a session that's already in progress.
  useEffect(() => {
    if (!activeSession?.id || !user?.id) return;
    apiGetActivePresentation(user.id, String(roomId))
      .then(pres => { if (pres) setActivePresentation(pres); })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id]);

  // Live Video status polling — kept here (before the early returns) so the
  // hook call count never changes between renders. Runs for ALL room types:
  // videoActive lets any member join when a leader has started video;
  // videoCanHost reflects the server-verified authorization to start/end it.
  useEffect(() => {
    if (!activeSession || !user?.id || !roomId) return;
    let destroyed = false;
    const poll = async () => {
      try {
        const s = await apiGetVideoStatus(user.id, String(roomId));
        if (!destroyed) {
          setVideoActive(s.videoActive);
          setVideoCanHost(s.canHost ?? false);
          setLiveMeetingMode(s.meetingMode ?? 'video');
        }
      } catch { /* non-fatal */ }
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => { destroyed = true; clearInterval(id); };
  }, [activeSession, user?.id, roomId]);

  const refreshAttendance = useCallback(async (sessionId: string) => {
    if (!user?.id || !roomId) return;
    try {
      const data = await apiGetSessionAttendance(user.id, String(roomId), sessionId);
      if (import.meta.env.DEV) {
        console.debug('[room-meeting] attendance refetch', {
          userId: user.id,
          roomId: String(roomId),
          sessionId,
          queryKey: `room:${String(roomId)}:session:${sessionId}:attendance`,
          attendeeCount: data.length,
        });
      }
      setAttendanceData(data);
    } catch (err) {
      console.debug('[room-meeting] attendance refetch failed', {
        userId: user?.id,
        roomId: String(roomId),
        sessionId,
        message: err instanceof Error ? err.message : 'unknown error',
      });
    }
  }, [roomId, user?.id]);

  // Read the authoritative participant list on session changes and while the
  // meeting is open. No request here records attendance.
  useEffect(() => {
    if (!activeSession?.id || !user?.id || !roomId) {
      setAttendanceData([]);
      return;
    }
    // Never render a previous session's participants while the new session's
    // authoritative response is in flight.
    setAttendanceData([]);
    void refreshAttendance(activeSession.id);
    const interval = setInterval(() => void refreshAttendance(activeSession.id), 30_000);
    return () => clearInterval(interval);
  }, [activeSession?.id, refreshAttendance, roomId, user?.id]);

  // Session SSE is room-scoped, but attendance is session-scoped. Only refetch
  // for an attendance event belonging to the active session.
  useEffect(() => {
    const payload = lastEvent?.payload as { sessionId?: string } | undefined;
    if (
      lastEvent?.type === 'attendance_changed' &&
      activeSession?.id &&
      payload?.sessionId === activeSession.id
    ) {
      void refreshAttendance(activeSession.id);
    }
  }, [activeSession?.id, lastEvent, refreshAttendance]);

  // Reconcile after tab focus, foreground/background return, and connection
  // recovery. These are all refetches; none can create an attendance row.
  useEffect(() => {
    if (!activeSession?.id) return;
    const refresh = () => void refreshAttendance(activeSession.id);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeSession?.id, refreshAttendance]);

  // Hydrate active poll
  useEffect(() => {
    if (!activeSession || !user || !roomId) return;
    apiGetActivePoll(user.id, String(roomId), activeSession.id)
      .then(result => {
        if (result) {
          setActivePoll(result.poll);
          setHydratedPollResults({
            voteCounts: result.voteCounts,
            totalVotes: result.totalVotes,
            userVotedIndex: result.userVotedIndex,
          });
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id]);

  // Auto-open poll from SSE
  useEffect(() => {
    if (incomingPoll) {
      setActivePoll(incomingPoll);
      setHydratedPollResults(null);
    }
  }, [incomingPoll]);

  // Auto-open Ask Emmaus from SSE
  useEffect(() => {
    if (emmausQuestion && !showSharedAskEmmaus) setShowSharedAskEmmaus(true);
  }, [emmausQuestion, showSharedAskEmmaus]);

  // A new shared tool replaces the old surface on every connected device.
  useEffect(() => {
    if (!lastEvent) return;
    if (lastEvent.type === 'tool_closed') {
      setShowSharedScripture(false);
      setShowSharedAskEmmaus(false);
      setActivePoll(null);
      setDiscussionPendingNotice(null);
      return;
    }
    if (
      lastEvent.type === 'navigate' ||
      lastEvent.type === 'mode_change' ||
      lastEvent.type === 'poll_started' ||
      lastEvent.type === 'emmaus_started' ||
      lastEvent.type === 'media_presented'
    ) {
      const replacement =
        lastEvent.type === 'navigate'
          ? ((lastEvent.payload as { scripture?: unknown }).scripture ? 'scripture' : 'study')
          : lastEvent.type === 'mode_change'
            ? String((lastEvent.payload as { mode?: unknown }).mode)
            : lastEvent.type === 'poll_started'
              ? 'poll'
              : lastEvent.type === 'emmaus_started'
                ? 'ask-emmaus'
                : 'presentation';
      if (replacement !== 'scripture') setShowSharedScripture(false);
      if (replacement !== 'ask-emmaus') setShowSharedAskEmmaus(false);
      if (replacement !== 'poll') setActivePoll(null);
    }
  }, [lastEvent]);

  // Reconnect hydration may restore a shared Bible without delivering the
  // original navigate event. Only auto-open it while following the leader.
  useEffect(() => {
    if (activeTool === 'scripture' && activeScripture && followLeader) {
      setShowSharedScripture(true);
    }
  }, [activeTool, activeScripture, followLeader]);

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

  // Initial room load
  useEffect(() => {
    if (!roomId || !user) return;
    loadRoomDetail(String(roomId)).then(detail => {
      if (!detail) { setLoadError('Group not found or you are not a member.'); return; }
      setRoom(detail);
      // Sync Groups V2 fields from the loaded room
      setLeaderNote(detail.leaderNote ?? null);
      setNextMeeting(detail.nextMeeting ?? null);
      setRevealOnMeeting(detail.revealOnMeeting ?? false);
      setAllowMemberPresent(detail.allowMemberPresent ?? false);
      // Seed activeSession immediately so members see Meeting phase on first
      // render, before the SSE session_state event arrives.
      if (detail.activeSession) {
        setActiveSession(detail.activeSession);
      }
      detail.linkedJourneys.forEach(lj => {
        apiGetJourneyProgress(user.id, String(roomId), lj.journeyId)
          .then(p => setProgressMap(prev => ({ ...prev, [lj.journeyId]: p })))
          .catch(() => {});
      });
    });
  }, [roomId, user, loadRoomDetail]);

  // Room roles can change from another device. Refresh the authoritative room
  // detail periodically so stale SSE/session state cannot leave management
  // controls visible after an Owner demotes or removes this user.
  useEffect(() => {
    if (!roomId || !user) return;
    let destroyed = false;
    const refreshRoomRole = async () => {
      const detail = await loadRoomDetail(String(roomId));
      if (destroyed || !detail) return;
      setRoom(detail);
      setLeaderNote(detail.leaderNote ?? null);
      setNextMeeting(detail.nextMeeting ?? null);
      setRevealOnMeeting(detail.revealOnMeeting ?? false);
      setAllowMemberPresent(detail.allowMemberPresent ?? false);
    };
    const timer = setInterval(refreshRoomRole, 30_000);
    return () => {
      destroyed = true;
      clearInterval(timer);
    };
  }, [roomId, user, loadRoomDetail]);

  // Progress refresh interval
  useEffect(() => {
    if (!room) return;
    const timer = setInterval(() => refreshProgress(true), PROGRESS_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [room, refreshProgress]);

  // Presence heartbeat + SSE
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
            reconnectDelay = 2_000;
          } catch { /* ignore */ }
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

  // These values and this effect must remain above the loading/error returns.
  // Room detail loads asynchronously; putting a hook below those returns makes
  // React change the hook count when the 200 response arrives.
  const currentAttendance = activeSession
    ? attendanceData.find(a => a.userId === user?.id && a.leftAt === null)
    : undefined;
  const hasJoinedCurrentMeeting = Boolean(currentAttendance);
  const openChat = (discussionId?: string) => {
    if (discussionId) lastOpenedDiscussionRef.current = discussionId;
    setDiscussionPendingNotice(null);
    history.replaceState({
      ...history.state,
      roomName: room?.name ?? '',
      isLeader: Boolean(room?.isLeader || isRoomLeaderRole(room?.currentUserRole)),
      allowMemberPresent,
      sessionId: activeSession?.id ?? null,
      discussionId: discussionId ?? null,
    }, '');
    setLocation(`/rooms/${roomId}/chat${discussionId ? `?discussionId=${encodeURIComponent(discussionId)}` : ''}`);
  };

  // OPEN_GROUP_DISCUSSION is authoritative: every joined device receives the
  // same persisted discussion id. Avoid navigating a background tab blindly.
  useEffect(() => {
    if (lastEvent?.type !== 'OPEN_GROUP_DISCUSSION' || !activeSession?.id || !hasJoinedCurrentMeeting) return;
    const payload = lastEvent.payload as { roomId?: string; sessionId?: string; discussionId?: string };
    if (
      payload.roomId !== String(roomId) ||
      payload.sessionId !== activeSession.id ||
      !payload.discussionId ||
      lastOpenedDiscussionRef.current === payload.discussionId
    ) return;
    lastOpenedDiscussionRef.current = payload.discussionId;
    if (document.visibilityState === 'visible') {
      openChat(payload.discussionId);
    } else {
      setDiscussionPendingNotice(payload.discussionId);
    }
  }, [activeSession?.id, hasJoinedCurrentMeeting, lastEvent, roomId]);

  if (!user || !roomId) return null;

  if (loadError) {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">{loadError}</p>
        <Button onClick={() => goBackOrFallback('/rooms', setLocation)}>Back to Groups</Button>
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

  // ── Derived state ───────────────────────────────────────────────────────────
  const isOwner = isRoomOwnerRole(room.currentUserRole);
  // Keep the server-computed value authoritative while retaining a safe
  // role-based fallback for an older response shape.
  const isAuthorizedLeader = room.isLeader || isRoomLeaderRole(room.currentUserRole);

  const linkedJourneyIds = new Set(room.linkedJourneys.map(lj => lj.journeyId));
  const availableWalks = journeys.filter(j =>
    j.status === 'Published' &&
    !linkedJourneyIds.has(j.id)
  );

  const primaryLinkedJourney = room.linkedContentId ? getJourney(room.linkedContentId) : null;
  const contentTitle = primaryLinkedJourney?.title ?? null;
  const myProgressInLinkedJourney = room.linkedContentId ? myProgress[room.linkedContentId] : null;
  const currentStep = myProgressInLinkedJourney?.currentDay ?? null;
  // Exclude Walk Complete steps so the count never makes "Step 7 of 5" possible.
  const totalSteps = room.linkedContentId
    ? getStepsForJourney(room.linkedContentId).filter(s => s.status === 'Published' && !s.isCompletionStep).length
    : 0;
  const onWalkCompleteStep = currentStep != null && totalSteps > 0 && currentStep > totalSteps;

  const leaderMember = room.members.find(m => isRoomOwnerRole(m.role))
    ?? room.members.find(m => m.role === 'leader');
  const leaderName = leaderMember?.preferredName ?? 'Your leader';

  // Whether today's study is hidden by reveal-on-meeting gate
  const studyHidden = revealOnMeeting && !activeSession;

  // Primary progress map for the main linked journey
  const primaryProgress = room.linkedContentId ? progressMap[room.linkedContentId] : undefined;

  // Next meeting display
  const meetingCountdown = nextMeeting ? formatMeetingCountdown(nextMeeting) : null;

  // Three-phase lifecycle: preparation → meeting → followup
  const groupPhase: 'preparation' | 'meeting' | 'followup' =
    activeSession ? 'meeting' : meetingJustEnded ? 'followup' : 'preparation';

  // videoCanHost and videoActive are set by the polling effect above (before early returns).

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleBack = () => {
    goBackOrFallback('/rooms', setLocation);
  };

  const handleLeave = async () => {
    setActioning(true);
    try {
      await leaveRoom(String(roomId), user.id);
      setLocation('/rooms');
    } catch (err) {
      setActioning(false);
      alert(err instanceof Error ? err.message : 'Failed to leave group');
    }
  };

  const handleDelete = async () => {
    setActioning(true);
    try {
      await deleteRoom(String(roomId), user.id);
      setLocation('/rooms');
    } catch (err) {
      setActioning(false);
      alert(err instanceof Error ? err.message : 'Failed to delete group');
    }
  };

  const handleRemoveMember = async (member: RoomMember) => {
    if (!window.confirm(`Remove ${member.preferredName || 'this member'} from this Group?`)) return;
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

  const handleRemoveStudy = async () => {
    if (!room?.linkedContentId) return;
    if (!window.confirm('Remove this study from the group? Members will see a blank Today’s Study area.')) return;
    try {
      await apiUnlinkPrimaryJourney(user.id, String(roomId), room.linkedContentId);
      setRoom(prev => prev ? {
        ...prev,
        linkedContentId: null,
        linkedContentType: null,
      } : prev);
      setShowLinkWalk(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove the study');
    }
  };

  const handleCloseSharedTool = async (
    tool: 'scripture' | 'discussion' | 'poll' | 'ask-emmaus' | 'presentation',
    closeLocal: () => void,
  ) => {
    try {
      await apiCloseSharedTool(user.id, String(roomId), tool);
      closeLocal();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not close the shared tool.');
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
      alert(err instanceof Error ? err.message : 'Failed to rename group');
    } finally {
      setRenameSaving(false);
    }
  };

  const handleJoinMeeting = async () => {
    if (!activeSession || joiningMeeting) return;
    setJoiningMeeting(true);
    const rid = String(roomId);
    const sid = activeSession.id;
    try {
      const attendance = await apiRecordAttendanceJoin(user.id, rid, sid);
      if (import.meta.env.DEV) {
        console.debug('[room-meeting] explicit join saved', {
          userId: user.id,
          roomId: rid,
          sessionId: sid,
          attendanceId: attendance.id,
          discussionChannelId: rid,
        });
      }
      // Immediate local confirmation comes from the saved server record; the
      // follow-up refetch reconciles names/other participants authoritatively.
      setAttendanceData(prev => [
        ...prev.filter(a => a.userId !== user.id),
        { ...attendance, preferredName: user.preferredName || 'Member' },
      ]);
      await refreshAttendance(sid);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Could not join this meeting.');
    } finally {
      setJoiningMeeting(false);
    }
  };

  const handleSaveLeaderNote = async () => {
    setLeaderNoteSaving(true);
    try {
      await apiUpdateLeaderNote(user.id, String(roomId), leaderNoteValue.trim() || null);
      setLeaderNote(leaderNoteValue.trim() || null);
      setLeaderNoteEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save note');
    } finally {
      setLeaderNoteSaving(false);
    }
  };

  const handleSaveSchedule = async () => {
    setScheduleSaving(true);
    try {
      const iso = scheduleValue ? localDateTimeToISO(scheduleValue) : null;
      await apiUpdateSchedule(user.id, String(roomId), iso, revealOnMeeting);
      setNextMeeting(iso);
      setEditingSchedule(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to save schedule');
    } finally {
      setScheduleSaving(false);
    }
  };

  // ── Live Video handlers ────────────────────────────────────────────────────

  const handleStartVideo = async (mode: 'audio' | 'video' = 'video') => {
    await apiStartVideo(user.id, String(roomId), mode);
    setVideoActive(true);
    setLiveMeetingMode(mode);
  };

  const handleEndVideo = async () => {
    await apiEndVideo(user.id, String(roomId));
    setVideoActive(false);
  };

  const handleStartMeetingDirect = async (mode: 'text' | 'audio' | 'video' = 'text') => {
    setStartingMeeting(true);
    setShowStartMeetingMode(false);
    try {
      const session = await apiStartSession(user.id, String(roomId), mode);
      setActiveSession(session);
      if (mode === 'audio' || mode === 'video') {
        setVideoActive(true);
        setLiveMeetingMode(mode);
      } else {
        setVideoActive(false);
      }
      await refreshAttendance(session.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start meeting');
    } finally {
      setStartingMeeting(false);
    }
  };

  // End Meeting — runs the same completion logic as "Complete Session" so
  // attendance, notes, and prayer requests are all preserved.
  const handleEndMeeting = async () => {
    if (!activeSession) return;
    setEndingMeeting(true);
    try {
      const snapshot = { startedAt: activeSession.startedAt, attendance: attendanceData };
      const response = await apiCompleteSession(user.id, String(roomId));
      setLeaderSessionComplete(response.summary);
      setEndedSessionSnapshot(snapshot);
      setMeetingJustEnded(true);
      setActiveSession(null);
      setConfirmEndMeeting(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to end meeting');
    } finally {
      setEndingMeeting(false);
    }
  };

  const handleToggleRevealOnMeeting = async () => {
    const newVal = !revealOnMeeting;
    setRevealOnMeeting(newVal);
    try {
      await apiUpdateSchedule(user.id, String(roomId), nextMeeting, newVal);
    } catch {
      setRevealOnMeeting(!newVal); // revert on error
    }
  };

  const handleToggleAllowMemberPresent = async () => {
    const newVal = !allowMemberPresent;
    setAllowMemberPresent(newVal);
    try {
      await apiSetAllowMemberPresent(user.id, String(roomId), newVal);
    } catch {
      setAllowMemberPresent(!newVal); // revert on error
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-[100dvh] bg-background pb-page-safe"
      onClick={() => setShowOverflow(false)}
    >

      {/* ── Header ───────────────────────────────────────────────────────── */}
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
                aria-label="Group name"
              />
              <button
                onClick={handleRenameSubmit}
                disabled={renameSaving || !renameValue.trim()}
                className="text-[13px] text-primary font-semibold shrink-0 disabled:opacity-40"
              >
                {renameSaving ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
              </button>
              <button onClick={() => setRenaming(false)} className="text-[13px] text-muted-foreground shrink-0">
                Cancel
              </button>
            </div>
          ) : (
            <h1 className="flex-1 min-w-0 font-sans font-semibold text-[17px] truncate">{room.name}</h1>
          )}

          {/* Overflow menu */}
          <div className="relative shrink-0">
            <button
              onClick={e => { e.stopPropagation(); setShowOverflow(v => !v); }}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label="Group options"
            >
              <MoreHorizontal size={22} />
            </button>

            {showOverflow && (
              <div
                className="absolute right-0 top-full mt-1 w-52 bg-card border border-border rounded-2xl shadow-lg overflow-hidden z-30"
                onClick={e => e.stopPropagation()}
              >
                {isAuthorizedLeader ? (
                  <>
                    <button
                      onClick={handleStartRename}
                      className="w-full text-left px-4 py-3.5 text-[14px] text-foreground hover:bg-muted/50 transition-colors flex items-center gap-2.5"
                    >
                      <Pencil size={15} className="text-muted-foreground shrink-0" />
                      Rename Group
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
                      Group Settings
                    </button>
                    {isOwner && (
                      <button
                        onClick={() => { setShowOverflow(false); setConfirmDelete(true); }}
                        className="w-full text-left px-4 py-3.5 text-[14px] text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2.5 border-t border-border/60"
                      >
                        <Trash2 size={15} className="shrink-0" />
                        Delete Group
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    onClick={() => { setShowOverflow(false); setConfirmLeave(true); }}
                    className={`w-full text-left px-4 py-3.5 text-[14px] text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2.5 ${isAuthorizedLeader ? 'border-t border-border/60' : ''}`}
                  >
                    <LogOut size={15} className="shrink-0" />
                    Leave Group
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Overlay panels (rendered outside main flow) ───────────────────── */}

      {isAuthorizedLeader && (
        <GuideGroupPanel
          roomId={String(roomId)}
          userId={user.id}
          leaderName={user.preferredName || 'Leader'}
          isOpen={showGuideGroup}
          onClose={() => setShowGuideGroup(false)}
          activeSession={activeSession}
          onSessionEnded={() => {
            const snapshot = { startedAt: activeSession?.startedAt ?? '', attendance: attendanceData };
            setEndedSessionSnapshot(snapshot);
            setMeetingJustEnded(true);
            setActiveSession(null);
          }}
          onSessionComplete={(summary) => {
            setLeaderSessionComplete(summary);
            const snapshot = { startedAt: activeSession?.startedAt ?? '', attendance: attendanceData };
            setEndedSessionSnapshot(snapshot);
            setMeetingJustEnded(true);
            setActiveSession(null);
          }}
          onOpenAskEmmaus={() => {
            setShowGuideGroup(false);
            setShowSharedAskEmmaus(true);
          }}
          onOpenDiscussion={(discussionId) => {
            setShowGuideGroup(false);
            openChat(discussionId);
          }}
          videoEligible={videoCanHost}
          videoActive={videoActive}
          onStartVideo={handleStartVideo}
          onEndVideo={handleEndVideo}
          meetingMode={liveMeetingMode}
          onEndMeeting={() => setConfirmEndMeeting(true)}
        />
      )}

      {showStartMeetingMode && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4"
          onClick={() => setShowStartMeetingMode(false)}
        >
          <div
            className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4 mb-4"
            onClick={e => e.stopPropagation()}
          >
            <div>
              <h2 className="text-[18px] font-bold text-foreground">Choose meeting format</h2>
              <p className="text-[13px] text-muted-foreground mt-1">
                Everyone can join the same meeting. You can change study navigation later.
              </p>
            </div>
            <div className="space-y-2">
              {([
                ['text', 'Text meeting', 'Study, notes, prayer, and Group Discussion'],
                ['audio', 'Live audio', 'Microphone-only meeting; no camera is published'],
                ['video', 'Live video', 'Camera and microphone meeting'],
              ] as const).map(([mode, label, description]) => (
                <button
                  key={mode}
                  onClick={() => void handleStartMeetingDirect(mode)}
                  disabled={startingMeeting}
                  className="w-full text-left p-3.5 rounded-xl border border-border hover:border-primary/50 hover:bg-muted/40 transition-colors disabled:opacity-60"
                >
                  <p className="text-[14px] font-semibold text-foreground">{label}</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">{description}</p>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowStartMeetingMode(false)}
              className="w-full py-2.5 text-[13px] font-medium text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* End Meeting confirmation */}
      {confirmEndMeeting && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4" onClick={() => setConfirmEndMeeting(false)}>
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4 mb-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-[18px] font-bold text-foreground">End this meeting?</h2>
            <p className="text-[14px] text-muted-foreground leading-relaxed">
              Attendance, notes, and prayer requests will all be saved. Members will see a Meeting Complete summary.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmEndMeeting(false)}
                className="flex-1 py-3.5 rounded-2xl border border-border text-[15px] font-medium text-foreground hover:bg-muted/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEndMeeting}
                disabled={endingMeeting}
                className="flex-1 py-3.5 rounded-2xl bg-destructive text-destructive-foreground text-[15px] font-semibold flex items-center justify-center gap-2 disabled:opacity-60 hover:bg-destructive/90 transition-colors"
              >
                {endingMeeting ? <Loader2 size={16} className="animate-spin" /> : null}
                End Meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {showSharedAskEmmaus && activeSession && (
        <SharedAskEmmausPanel
          roomId={String(roomId)}
          userId={user.id}
          sessionId={activeSession.id}
          isLeader={isAuthorizedLeader}
          userName={user.preferredName || 'Member'}
          activeQuestion={emmausQuestion}
          streamText={emmausStreamText}
          latestAnswer={emmausAnswer}
           onClose={() => void handleCloseSharedTool('ask-emmaus', () => setShowSharedAskEmmaus(false))}
        />
      )}

      {activePoll && (
        <PollCard
          roomId={String(roomId)}
          userId={user.id}
          poll={activePoll}
          isLeader={isAuthorizedLeader}
          pollVoteUpdate={pollVoteUpdate}
          pollRevealUpdate={pollRevealUpdate}
          initialResults={hydratedPollResults ?? undefined}
           onClose={() => void handleCloseSharedTool('poll', () => {
             setActivePoll(null);
             setHydratedPollResults(null);
           })}
        />
      )}

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
           onClose={() => void handleCloseSharedTool('scripture', () => {
             setShowSharedScripture(false);
             setSseHighlights([]);
             setSseFocusChange(null);
           })}
        />
      )}

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

      {/* ── Main content ─────────────────────────────────────────────────── */}
      <main className="px-5 pt-5 max-w-[480px] mx-auto pb-6">

        {/* ════════════════════════════════════════════════════════════════
            PHASE 1 — PREPARATION
            Default state. Calm, focused. No meeting controls.
            Leader sees a single Start Meeting button at the bottom.
        ════════════════════════════════════════════════════════════════ */}
        {groupPhase === 'preparation' && (
          <div className="space-y-4">

            {/* Today's Study */}
            <section>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                Today&apos;s Study
              </p>
              {studyHidden ? (
                /* Hidden state — leader sees placeholder + always-visible Reveal Now escape hatch */
                <div className="p-5 rounded-2xl border border-border/50 bg-card/50 text-center space-y-3">
                  <BookOpen size={20} className="mx-auto text-muted-foreground opacity-30" />
                  <p className="text-[14px] text-muted-foreground">Study will be revealed when the meeting starts.</p>
                  {isAuthorizedLeader && (
                    <button
                      onClick={handleToggleRevealOnMeeting}
                      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-primary hover:underline"
                    >
                      Reveal Now
                    </button>
                  )}
                </div>
              ) : contentTitle ? (
                <>
                  <button
                    onClick={() => room.linkedContentId
                      ? setLocation(`/journeys/${room.linkedContentId}?source=room&sourceId=${room.id}`)
                      : setLocation('/walk')
                    }
                    className="w-full text-left p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <BookOpen size={18} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[16px] font-semibold text-foreground truncate leading-snug">{contentTitle}</p>
                        {currentStep != null && (
                          <p className="text-[13px] text-muted-foreground mt-0.5">
                            {onWalkCompleteStep ? 'Walk Complete' : `Step ${currentStep}`}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-1 text-primary font-medium text-[13px]">
                        Open
                        <ChevronRight size={15} />
                      </div>
                    </div>
                  </button>
                  {isAuthorizedLeader && (
                    <div className="flex items-center gap-3 mt-2 pl-1">
                      {availableWalks.length > 0 && !showLinkWalk && (
                        <button onClick={() => setShowLinkWalk(true)} className="text-[13px] text-primary font-medium hover:underline">
                          Change Study →
                        </button>
                      )}
                      <button onClick={() => void handleRemoveStudy()} className="text-[13px] text-destructive font-medium hover:underline">
                        Remove Study
                      </button>
                    </div>
                  )}
                </>
              ) : isAuthorizedLeader ? (
                <div className="p-5 rounded-2xl border border-dashed border-border bg-card/50 text-center space-y-3">
                  <BookOpen size={22} className="mx-auto text-muted-foreground opacity-40" />
                  <p className="text-[14px] text-muted-foreground">Choose something to study together.</p>
                  {isAuthorizedLeader && availableWalks.length > 0 && (
                    <button onClick={() => setShowLinkWalk(true)} className="text-[14px] text-primary font-medium hover:underline">
                      Add a Walk →
                    </button>
                  )}
                </div>
              ) : (
                <div className="min-h-[40px]" aria-label="No study assigned" />
              )}

              {/* Visibility toggle — always visible for leader, disappears once meeting starts */}
              {isAuthorizedLeader && contentTitle && (
                <button onClick={handleToggleRevealOnMeeting} className="mt-2 flex items-center gap-2 px-1 py-1">
                  <div
                    className={`rounded-full transition-colors flex items-center px-0.5 ${revealOnMeeting ? 'bg-primary' : 'bg-muted'}`}
                    style={{ width: 32, height: 18 }}
                  >
                    <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${revealOnMeeting ? 'translate-x-3.5' : 'translate-x-0'}`} />
                  </div>
                  <span className="text-[12px] text-muted-foreground">
                    {revealOnMeeting ? 'Reveal when meeting starts' : 'Visible to members'}
                  </span>
                </button>
              )}

              {showLinkWalk && (
                <div className="mt-3 rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-border/60">
                    <p className="text-[13px] text-muted-foreground font-medium">Choose a Walk to add:</p>
                  </div>
                  {availableWalks.map(w => (
                    <button key={w.id} onClick={() => handleLinkWalk(w.id)} disabled={!!linkingId}
                      className="w-full text-left px-5 py-4 border-b border-border/50 last:border-0 hover:bg-muted/40 transition-colors flex items-center justify-between"
                    >
                      <span className="text-[15px] font-medium text-foreground">{w.title}</span>
                      {linkingId === w.id
                        ? <Loader2 size={16} className="animate-spin text-muted-foreground shrink-0" />
                        : <span className="text-[13px] text-primary font-medium shrink-0">Add</span>}
                    </button>
                  ))}
                  <button onClick={() => setShowLinkWalk(false)} className="w-full px-5 py-3 text-[13px] text-muted-foreground hover:text-foreground transition-colors text-center">
                    Cancel
                  </button>
                </div>
              )}
            </section>

            {/* Leader's Note */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                  Leader&apos;s Note
                </p>
                {isAuthorizedLeader && !leaderNoteEditing && (
                  <button onClick={() => { setLeaderNoteValue(leaderNote ?? ''); setLeaderNoteEditing(true); }}
                    className="flex items-center gap-1 text-[12px] text-primary font-medium"
                  >
                    <Edit2 size={12} />
                    {leaderNote ? 'Edit' : 'Add note'}
                  </button>
                )}
              </div>
              {leaderNoteEditing ? (
                <div className="p-4 rounded-2xl border border-primary/30 bg-card space-y-3">
                  <textarea value={leaderNoteValue} onChange={e => setLeaderNoteValue(e.target.value)}
                    placeholder="Write a note for your group — reflection questions, what to focus on, or an encouragement…"
                    rows={4} maxLength={1000} autoFocus
                    className="w-full text-[14px] text-foreground bg-transparent outline-none resize-none placeholder:text-muted-foreground/50 leading-relaxed"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button onClick={() => setLeaderNoteEditing(false)} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                    <button onClick={handleSaveLeaderNote} disabled={leaderNoteSaving}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold disabled:opacity-60"
                    >
                      {leaderNoteSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Save
                    </button>
                  </div>
                </div>
              ) : leaderNote ? (
                <div className="p-4 rounded-2xl border border-border bg-card">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText size={13} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400 mb-1">From {leaderName}</p>
                      <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-wrap">{leaderNote}</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-dashed border-border bg-card/40 text-center">
                  <p className="text-[13px] text-muted-foreground">
                    {isAuthorizedLeader ? 'Add a note for your group — questions, focus points, or an encouragement.' : 'No note from your leader yet.'}
                  </p>
                </div>
              )}
            </section>

            {/* Meeting */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Meeting</p>
                {isAuthorizedLeader && !editingSchedule && (
                  <button onClick={() => { setScheduleValue(nextMeeting ? isoToLocalDateTime(nextMeeting) : ''); setEditingSchedule(true); }}
                    className="text-[12px] text-primary font-medium flex items-center gap-1"
                  >
                    <Calendar size={12} />
                    {nextMeeting ? 'Edit' : 'Schedule'}
                  </button>
                )}
              </div>
              {editingSchedule ? (
                <div className="p-4 rounded-2xl border border-primary/30 bg-card space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block">Date &amp; Time</label>
                    <input type="datetime-local" value={scheduleValue} onChange={e => setScheduleValue(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-border bg-background text-[15px] text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <div className="flex items-center gap-2 justify-end">
                    {nextMeeting && (
                      <button
                        onClick={async () => {
                          setScheduleSaving(true);
                          try { await apiUpdateSchedule(user.id, String(roomId), null, revealOnMeeting); setNextMeeting(null); setEditingSchedule(false); }
                          catch { /* ignore */ } finally { setScheduleSaving(false); }
                        }}
                        disabled={scheduleSaving} className="text-[13px] text-destructive hover:opacity-80 transition-opacity"
                      >Clear</button>
                    )}
                    <button onClick={() => setEditingSchedule(false)} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                    <button onClick={handleSaveSchedule} disabled={scheduleSaving || !scheduleValue}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold disabled:opacity-60"
                    >
                      {scheduleSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Save
                    </button>
                  </div>
                </div>
              ) : nextMeeting && meetingCountdown ? (
                <div className="p-4 rounded-2xl border border-border bg-card flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meetingCountdown.isPast ? 'bg-muted' : 'bg-primary/10'}`}>
                    <Calendar size={17} className={meetingCountdown.isPast ? 'text-muted-foreground' : 'text-primary'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[15px] font-semibold ${meetingCountdown.isPast ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {meetingCountdown.label}
                    </p>
                    <p className="text-[12px] text-muted-foreground mt-0.5">
                      {new Date(nextMeeting).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}{' · '}
                      {new Date(nextMeeting).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-2xl border border-dashed border-border bg-card/40 text-center space-y-2">
                  <p className="text-[13px] text-muted-foreground">No meeting scheduled.</p>
                  {isAuthorizedLeader && (
                    <button onClick={() => { setScheduleValue(''); setEditingSchedule(true); }} className="text-[13px] text-primary font-medium">
                      Schedule a meeting →
                    </button>
                  )}
                </div>
              )}
            </section>

            {/* Members */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Members</p>
                <div className="flex items-center gap-3">
                  {room.linkedJourneys.length > 0 && (
                    <button onClick={() => refreshProgress(false)} disabled={refreshing}
                      className="text-muted-foreground hover:text-foreground transition-colors p-1 disabled:opacity-40" aria-label="Refresh progress"
                    >
                      <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    </button>
                  )}
                  {isAuthorizedLeader && (
                    <button onClick={() => setLocation(`/rooms/${roomId}/invite`)} className="text-[13px] text-primary font-medium hover:underline">
                      Invite
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
                {[...room.members].sort((a, b) => {
                  if (isRoomOwnerRole(a.role)) return -1;
                  if (isRoomOwnerRole(b.role)) return 1;
                  if (a.role === 'leader') return -1;
                  if (b.role === 'leader') return 1;
                  const aOnline = onlineUserIds.has(a.userId) ? 0 : 1;
                  const bOnline = onlineUserIds.has(b.userId) ? 0 : 1;
                  return aOnline - bOnline;
                }).map(m => {
                  const isMe = m.userId === user.id;
                  const displayName = isMe ? `${m.preferredName || 'You'} (you)` : m.preferredName || 'Member';
                  const initials = (m.preferredName || 'M').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
                  const isOnline = onlineUserIds.has(m.userId);
                   const prepStatus = getPrepStatus(primaryProgress, m.userId, contentTitle);
                  return (
                    <div key={m.userId} className="flex items-center gap-3.5 px-4 py-3.5">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-[13px] font-semibold flex items-center justify-center">{initials}</div>
                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${isOnline ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} title={isOnline ? 'Online' : 'Offline'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[14px] font-medium text-foreground truncate">{displayName}</p>
                          {isRoomOwnerRole(m.role) && <Crown size={12} className="text-amber-500 shrink-0" />}
                          {m.role === 'leader' && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Leader</span>}
                        </div>
                        {primaryProgress && (
                          <p className={`text-[11px] font-medium mt-0.5 ${prepStatus.color}`}>{prepStatus.label}</p>
                        )}
                      </div>
                      {isAuthorizedLeader && !isMe && (isOwner || m.role === 'member') && (
                        <button onClick={() => handleRemoveMember(m)} className="text-[12px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1 shrink-0">
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>


            {/* Group Settings — room Owner/Leader only */}
            {isAuthorizedLeader && (
              <section>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                  Group Settings
                </p>
                <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
                  <button
                    onClick={handleToggleAllowMemberPresent}
                    className="w-full flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 text-left">
                      <p className="text-[14px] font-medium text-foreground">Members can present</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {allowMemberPresent
                          ? 'Members may share their own media during a meeting'
                          : 'Only the leader can share media during a meeting'}
                      </p>
                    </div>
                    <div
                      className={`rounded-full transition-colors flex items-center px-0.5 shrink-0 ${allowMemberPresent ? 'bg-primary' : 'bg-muted'}`}
                      style={{ width: 36, height: 20 }}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${allowMemberPresent ? 'translate-x-4' : 'translate-x-0'}`} />
                    </div>
                  </button>
                </div>
              </section>
            )}

            {/* START MEETING — primary action, leaders only */}
            {isAuthorizedLeader && (
              <button
                onClick={() => setShowStartMeetingMode(true)}
                disabled={startingMeeting}
                className="w-full py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-[16px] flex items-center justify-center gap-2.5 disabled:opacity-60 hover:opacity-90 transition-opacity"
              >
                {startingMeeting ? <Loader2 size={18} className="animate-spin" /> : <MapPin size={18} />}
                Start Meeting
              </button>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PHASE 2 — MEETING IN PROGRESS
            Active meeting. Energised. Leader controls visible.
        ════════════════════════════════════════════════════════════════ */}
        {groupPhase === 'meeting' && activeSession && (
          <div className="space-y-4">

            {/* Meeting in Progress header */}
            <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/40 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                  <div>
                    <p className="text-[16px] font-bold text-emerald-800 dark:text-emerald-200">Meeting in Progress</p>
                    <p className="text-[12px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                      Started {new Date(activeSession.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                {!isAuthorizedLeader && (
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => setFollowLeader(!followLeader)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold border transition-all ${
                        followLeader
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-transparent text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:border-emerald-500'
                      }`}
                      title="Controls whether this screen opens the leader's shared study and Scripture"
                    >
                      {followLeader ? '● Follow leader: On' : 'Follow leader: Off'}
                    </button>
                    <span className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">
                      Study navigation only
                    </span>
                  </div>
                )}
              </div>

              {!hasJoinedCurrentMeeting ? (
                <div className="rounded-xl bg-white/70 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-emerald-900 dark:text-emerald-100">You haven&apos;t joined yet</p>
                      <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">Join to appear as In meeting and open Group Discussion.</p>
                    </div>
                    <button
                      onClick={handleJoinMeeting}
                      disabled={joiningMeeting}
                      className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-[12px] font-bold disabled:opacity-60"
                    >
                      {joiningMeeting && <Loader2 size={13} className="animate-spin" />}
                      Join Meeting
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[12px] text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 size={14} />
                  You are in this meeting
                </div>
              )}

              {/* Leader action buttons — ONE set, here in the banner */}
              {isAuthorizedLeader && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowGuideGroup(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-[13px] font-semibold transition-colors"
                  >
                    <Users2 size={15} />
                    Meeting Tools
                  </button>
                  <button
                    onClick={() => setConfirmEndMeeting(true)}
                    disabled={endingMeeting}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-emerald-400 dark:border-emerald-700 text-emerald-800 dark:text-emerald-200 text-[13px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors disabled:opacity-50"
                  >
                    {endingMeeting ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={14} />}
                    End Meeting
                  </button>
                </div>
              )}

              {/* Quick-access: open scripture or group notes */}
              {(activeScripture || true) && (
                <div className="flex gap-2">
                  {activeScripture && (
                    <button onClick={() => setShowSharedScripture(true)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[12px] font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all"
                    >
                      <BookOpen size={13} />
                      {activeScripture.displayLabel || `${activeScripture.book} ${activeScripture.chapter}`}
                    </button>
                  )}
                  <button onClick={() => setShowSharedNotes(true)}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[12px] font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all"
                  >
                    <StickyNote size={13} />
                    Group Notes
                  </button>
                  {hasJoinedCurrentMeeting && (
                    <button onClick={() => openChat()}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-100/50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[12px] font-medium hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-all"
                    >
                      <MessageSquare size={13} />
                      Group Discussion
                    </button>
                  )}
                </div>
              )}

              {/* Shared discussion command notice for a backgrounded device */}
              {discussionPendingNotice && (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40">
                  <div className="flex items-center gap-2">
                    <MessageSquare size={13} className="text-sky-600 dark:text-sky-400 shrink-0" />
                    <p className="text-[12px] text-sky-700 dark:text-sky-300">Your leader opened Group Discussion.</p>
                  </div>
                  <button
                    onClick={() => openChat(discussionPendingNotice)}
                    className="text-[12px] text-sky-700 dark:text-sky-300 font-semibold shrink-0 ml-2"
                  >
                    Open →
                  </button>
                </div>
              )}

              {/* Scripture pending notice */}
              {scripturePendingNotice && !showSharedScripture && (
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40">
                  <div className="flex items-center gap-2">
                    <BookOpen size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                    <p className="text-[12px] text-amber-700 dark:text-amber-300">
                      <span className="font-semibold">{scripturePendingNotice.leaderName}</span> opened{' '}
                      {scripturePendingNotice.scripture.displayLabel || `${scripturePendingNotice.scripture.book} ${scripturePendingNotice.scripture.chapter}`}
                    </p>
                  </div>
                  <button onClick={() => { setShowSharedScripture(true); setScripturePendingNotice(null); }}
                    className="text-[12px] text-amber-700 dark:text-amber-300 font-semibold shrink-0 ml-2"
                  >Open →</button>
                </div>
              )}

              {/* Mode banners */}
              {sessionMode === 'prayer' && (
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/40">
                  <HandHeart size={18} className="text-violet-600 dark:text-violet-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-violet-800 dark:text-violet-300">Prayer Time</p>
                    <p className="text-[11px] text-violet-600 dark:text-violet-400">Share requests below</p>
                  </div>
                  {isAuthorizedLeader && (
                    <button onClick={() => void apiChangeMode(user.id, String(roomId), 'study', user.preferredName || 'Leader').catch(() => {})}
                      className="shrink-0 text-[11px] text-violet-600 dark:text-violet-400 font-semibold"
                    >End →</button>
                  )}
                </div>
              )}
            </div>

            {/* Live Video — renders join card (when active) or connected panel */}
            {videoActive && (
              <VideoRoom
                roomId={String(roomId)}
                userId={user.id}
                displayName={user.preferredName || 'Member'}
                videoEligible={true}
                leaderName={leaderName}
                hideStart={true}
                meetingMode={liveMeetingMode}
                onOpenDiscussion={() => openChat()}
                onOpenNotes={() => setShowSharedNotes(true)}
                onOpenPresentedContent={() => {
                  document.getElementById('room-active-presentation')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                hasPresentedContent={Boolean(activePresentation)}
              />
            )}

            {/* Active presentation — shown to all members during a meeting */}
            {activePresentation && (
              <div id="room-active-presentation">
                <PresentationPanel
                  presentation={activePresentation}
                  isLeader={isAuthorizedLeader}
                  userId={user.id}
                  roomId={String(roomId)}
           onStop={() => setActivePresentation(null)}
                />
              </div>
            )}

            {/* Today's Study */}
            <section>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Today&apos;s Study</p>
              {contentTitle ? (
                <button
                  onClick={() => room.linkedContentId ? setLocation(`/journeys/${room.linkedContentId}?source=room&sourceId=${room.id}`) : setLocation('/walk')}
                  className="w-full text-left p-4 rounded-2xl border border-border bg-card hover:border-primary/40 transition-all flex items-center gap-3.5"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen size={17} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold text-foreground truncate">{contentTitle}</p>
                    {currentStep != null && <p className="text-[12px] text-muted-foreground mt-0.5">{onWalkCompleteStep ? 'Walk Complete' : `Step ${currentStep}`}</p>}
                  </div>
                  <div className="shrink-0 flex items-center gap-1 text-primary font-medium text-[13px]">
                    {isAuthorizedLeader ? 'Present' : 'Open'}
                    <ChevronRight size={14} />
                  </div>
                </button>
              ) : (
                <div className="p-4 rounded-2xl border border-border/50 bg-card/40">
                  <p className="text-[13px] text-muted-foreground text-center">No study assigned.</p>
                </div>
              )}
            </section>

            {/* Leader's Note */}
            {leaderNote && (
              <section>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Leader&apos;s Note</p>
                <div className="p-4 rounded-2xl border border-border bg-card">
                  <div className="flex items-start gap-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0 mt-0.5">
                      <FileText size={13} className="text-amber-600 dark:text-amber-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400 mb-1">From {leaderName}</p>
                      <p className="text-[14px] text-foreground leading-relaxed whitespace-pre-wrap">{leaderNote}</p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Members Present */}
            <section>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Members Present</p>
              <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
                {[...room.members].sort((a, b) => {
                  if (isRoomOwnerRole(a.role)) return -1;
                  if (isRoomOwnerRole(b.role)) return 1;
                  if (a.role === 'leader') return -1;
                  if (b.role === 'leader') return 1;
                  const aOnline = onlineUserIds.has(a.userId) ? 0 : 1;
                  const bOnline = onlineUserIds.has(b.userId) ? 0 : 1;
                  return aOnline - bOnline;
                }).map(m => {
                  const isMe = m.userId === user.id;
                  const displayName = isMe ? `${m.preferredName || 'You'} (you)` : m.preferredName || 'Member';
                  const initials = (m.preferredName || 'M').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
                  const isOnline = onlineUserIds.has(m.userId);
                  const record = attendanceData.find(a => a.userId === m.userId);
                  const hasJoined = record?.leftAt === null;
                  return (
                    <div key={m.userId} className="flex items-center gap-3.5 px-4 py-3.5">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-[13px] font-semibold flex items-center justify-center">{initials}</div>
                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${isOnline ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} title={isOnline ? 'Online' : 'Offline'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[14px] font-medium text-foreground truncate">{displayName}</p>
                          {isRoomOwnerRole(m.role) && <Crown size={12} className="text-amber-500 shrink-0" />}
                          {m.role === 'leader' && <span className="text-[10px] font-semibold uppercase tracking-wide text-primary">Leader</span>}
                        </div>
                        <p className={`text-[11px] font-medium mt-0.5 ${hasJoined ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground/60'}`}>
                          {hasJoined ? 'In meeting' : 'Not yet joined'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>


          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            PHASE 3 — FOLLOW-UP
            After End Meeting. Reflective, complete.
        ════════════════════════════════════════════════════════════════ */}
        {groupPhase === 'followup' && (
          <div className="space-y-4">

            {/* Meeting Complete banner */}
            <div className="p-5 rounded-2xl bg-muted/40 border border-border text-center space-y-1.5">
              <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 size={24} className="text-emerald-600 dark:text-emerald-400" />
              </div>
              <p className="text-[18px] font-bold text-foreground">Meeting Complete</p>
              {endedSessionSnapshot && (
                <p className="text-[13px] text-muted-foreground">
                  Started at {new Date(endedSessionSnapshot.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>

            {/* Attendance */}
            {endedSessionSnapshot && endedSessionSnapshot.attendance.length > 0 && (
              <section>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Attendance</p>
                <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
                  {room.members.map(m => {
                    const record = endedSessionSnapshot.attendance.find(a => a.userId === m.userId);
                    const sessionStart = new Date(endedSessionSnapshot.startedAt).getTime();
                    const joinedAt = record ? new Date(record.joinedAt).getTime() : null;
                    const isLate = joinedAt != null && (joinedAt - sessionStart) > 5 * 60_000;
                    const hasLeft = record?.leftAt != null;
                    let statusEl: React.ReactNode;
                    if (!record) {
                      statusEl = <span className="text-[12px] text-muted-foreground/50">Absent</span>;
                    } else if (hasLeft) {
                      statusEl = <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400"><Clock size={12} /><span className="text-[12px]">Left early</span></div>;
                    } else if (isLate) {
                      statusEl = <div className="flex items-center gap-1 text-sky-600 dark:text-sky-400"><Clock size={12} /><span className="text-[12px]">Joined late</span></div>;
                    } else {
                      statusEl = <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 size={12} /><span className="text-[12px]">Present</span></div>;
                    }
                    return (
                      <div key={m.userId} className="flex items-center justify-between px-4 py-3">
                        <p className="text-[14px] font-medium text-foreground truncate">
                          {m.preferredName || 'Member'}{m.userId === user.id ? ' (you)' : ''}
                        </p>
                        {statusEl}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Discussion Archive */}
            <section>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Discussion Archive</p>
              <button onClick={() => openChat()}
                className="w-full text-left p-4 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-3.5"
              >
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <MessageSquare size={17} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-foreground">View Chat</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Review today&apos;s discussion</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground shrink-0" />
              </button>
            </section>

            {/* Next Meeting */}
            {isAuthorizedLeader && (
              <section>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Next Meeting</p>
                {editingSchedule ? (
                  <div className="p-4 rounded-2xl border border-primary/30 bg-card space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest block">Date &amp; Time</label>
                      <input type="datetime-local" value={scheduleValue} onChange={e => setScheduleValue(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-border bg-background text-[15px] text-foreground outline-none focus:border-primary"
                      />
                    </div>
                    <div className="flex items-center gap-2 justify-end">
                      <button onClick={() => setEditingSchedule(false)} className="text-[13px] text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                      <button onClick={handleSaveSchedule} disabled={scheduleSaving || !scheduleValue}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-[13px] font-semibold disabled:opacity-60"
                      >
                        {scheduleSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                        Save
                      </button>
                    </div>
                  </div>
                ) : nextMeeting ? (
                  <div className="p-4 rounded-2xl border border-border bg-card flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Calendar size={17} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-foreground">{meetingCountdown?.label ?? 'Scheduled'}</p>
                      <p className="text-[12px] text-muted-foreground mt-0.5">
                        {new Date(nextMeeting).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}{' · '}
                        {new Date(nextMeeting).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <button onClick={() => { setScheduleValue(isoToLocalDateTime(nextMeeting)); setEditingSchedule(true); }}
                      className="text-[12px] text-primary font-medium shrink-0"
                    >Edit</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setScheduleValue(''); setEditingSchedule(true); }}
                    className="w-full py-3.5 rounded-2xl border border-dashed border-primary/40 bg-primary/5 text-primary font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-primary/10 transition-all"
                  >
                    <Calendar size={16} />
                    Schedule Next Meeting
                  </button>
                )}
              </section>
            )}

            {/* Prepare for next meeting */}
            <button
              onClick={() => { setMeetingJustEnded(false); setEndedSessionSnapshot(null); }}
              className="w-full py-3.5 rounded-2xl border border-border text-foreground font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-muted/40 transition-all"
            >
              Return to Preparation
            </button>
          </div>
        )}

        {/* ── Confirm Leave / Delete (always visible) ─────────────────── */}
        {confirmLeave && (
          <div className="mt-4 p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
            <p className="text-[15px] font-medium text-foreground">Leave this Group?</p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              You&apos;ll lose access to Group discussion. Your personal journey progress is preserved.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="flex-1 rounded-xl" onClick={handleLeave} disabled={actioning}>
                {actioning ? 'Leaving…' : 'Leave Group'}
              </Button>
              <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmLeave(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {confirmDelete && (
          <div className="mt-4 p-5 rounded-2xl border border-destructive/30 bg-destructive/5 space-y-4">
            <p className="text-[15px] font-medium text-foreground">Delete this Group permanently?</p>
            <p className="text-[13px] text-muted-foreground leading-relaxed">
              This removes the Group and all its discussion. Member journey progress is preserved.
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="flex-1 rounded-xl" onClick={handleDelete} disabled={actioning}>
                {actioning ? 'Deleting…' : 'Delete Group'}
              </Button>
              <Button size="sm" variant="outline" className="flex-1 rounded-xl" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

      </main>
      <BottomNav />

      {/* ── Session Complete Card ────────────────────────────────────────── */}
      {sessionComplete && (
        <SessionCompleteCard
          summary={sessionComplete}
          onDismiss={clearSessionComplete}
        />
      )}
    </div>
  );
}
