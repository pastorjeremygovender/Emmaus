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
  RoomSession, ScriptureRef, RoomHighlight, SharedNote, RoomPoll,
} from '@/lib/rooms-types';
import { LIVE_MEETING_TYPES } from '@/lib/rooms-types';
import { PrayerRequests } from '@/components/PrayerRequests';
import { GuideGroupPanel } from '@/components/GuideGroupPanel';
import { SharedScripturePanel } from '@/components/SharedScripturePanel';
import { SharedNotesPanel } from '@/components/SharedNotesPanel';
import { SharedAskEmmausPanel } from '@/components/SharedAskEmmausPanel';
import { PollCard } from '@/components/PollCard';
import { SessionCompleteCard } from '@/components/SessionCompleteCard';
import { useFollowLeader } from '@/hooks/useFollowLeader';
import {
  apiGetJourneyProgress, apiLinkJourney, apiRenameRoom,
  apiSendPresenceHeartbeat, apiGetPresenceStreamToken, apiPresenceStreamUrl,
  apiRecordAttendanceJoin, apiRecordAttendanceLeave,
  apiGetActivePoll, apiGetSessionAttendance, apiChangeMode,
  apiStartSession, apiEndSession, apiCompleteSession, apiAcknowledgeSessionCompletion, apiUpdateLeaderNote, apiUpdateSchedule,
  apiStartVideo, apiEndVideo, apiGetVideoStatus,
} from '@/lib/rooms-api';
import { VideoRoom } from '@/components/VideoRoom';

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
  userId: string
): { label: string; color: string } {
  if (!progress) return { label: 'Not Started', color: 'text-muted-foreground/60' };
  const p = progress.find(mp => mp.userId === userId);
  if (!p || !p.status || p.status === 'dropped') return { label: 'Not Started', color: 'text-muted-foreground/60' };
  if (p.status === 'completed') return { label: 'Completed', color: 'text-emerald-600 dark:text-emerald-400' };
  return { label: 'Reading', color: 'text-sky-600 dark:text-sky-400' };
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
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleValue, setScheduleValue] = useState('');
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [startingMeeting, setStartingMeeting] = useState(false);
  const [endingMeeting, setEndingMeeting] = useState(false);
  // (showDiscussion removed — Discussion is now a plain card, not an accordion)
  const [refreshing, setRefreshing] = useState(false);

  // ── Shared Scripture & Notes state ─────────────────────────────────────────
  const [showSharedScripture, setShowSharedScripture] = useState(false);
  const [showSharedNotes, setShowSharedNotes] = useState(false);
  const [scripturePendingNotice, setScripturePendingNotice] = useState<{
    scripture: ScriptureRef; leaderName: string;
  } | null>(null);
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
  const [attendanceData, setAttendanceData] = useState<Array<{
    userId: string; joinedAt: string; leftAt: string | null;
  }>>([]);

  // ── Leader's completion summary ─────────────────────────────────────────────
  const [leaderSessionComplete, setLeaderSessionComplete] = useState<import('@/lib/rooms-types').SessionCompleteSummary | null>(null);

  // ── Live Video state ────────────────────────────────────────────────────────
  const [videoActive, setVideoActive] = useState(false);
  const [confirmEndMeeting, setConfirmEndMeeting] = useState(false);

  // ── Follow-up phase state ───────────────────────────────────────────────────
  const [meetingJustEnded, setMeetingJustEnded] = useState(false);
  const [endedSessionSnapshot, setEndedSessionSnapshot] = useState<{
    startedAt: string;
    attendance: Array<{ userId: string; joinedAt: string; leftAt: string | null }>;
  } | null>(null);

  const renameInputRef = useRef<HTMLInputElement>(null);
  const roomRef = useRef<RoomDetailType | null>(null);
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
      localStorage.setItem(`emmaus_ack_session_${sid}`, '1');
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
    }
  }, [activeSession]);

  // videoEligible must be computed before any early return so the polling
  // useEffect below always runs the same number of hooks (Rules of Hooks).
  const videoEligible = !!room && LIVE_MEETING_TYPES.includes(room.roomType);

  // Live Video status polling — kept here (before the early returns) so the
  // hook call count never changes between renders.
  useEffect(() => {
    if (!activeSession || !videoEligible || !user?.id || !roomId) return;
    let destroyed = false;
    const poll = async () => {
      try {
        const s = await apiGetVideoStatus(user.id, String(roomId));
        if (!destroyed) setVideoActive(s.videoActive);
      } catch { /* non-fatal */ }
    };
    poll();
    const id = setInterval(poll, 10_000);
    return () => { destroyed = true; clearInterval(id); };
  }, [activeSession, videoEligible, user?.id, roomId]);

  // Attendance auto-record
  useEffect(() => {
    if (!activeSession || !user || !roomId) return;
    const sessionId = activeSession.id;
    const uid = user.id;
    const rid = String(roomId);
    apiRecordAttendanceJoin(uid, rid, sessionId).catch(() => {});
    return () => { apiRecordAttendanceLeave(uid, rid, sessionId).catch(() => {}); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id]);

  // Attendance polling
  useEffect(() => {
    if (!activeSession || !user || !roomId || !room) return;
    const fetchAttendance = () => {
      apiGetSessionAttendance(user.id, String(roomId), activeSession.id)
        .then(data => setAttendanceData(data))
        .catch(() => {});
    };
    fetchAttendance();
    const interval = setInterval(fetchAttendance, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id, !!room]);

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

  if (!user || !roomId) return null;

  if (loadError) {
    return (
      <div className="p-6 text-center mt-20 space-y-4">
        <p className="text-muted-foreground">{loadError}</p>
        <Button onClick={() => setLocation('/rooms')}>Back to Groups</Button>
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
  const isAdmin = room.currentUserRole === 'admin';
  const isAppAdmin = user.role === 'admin' || user.role === 'superAdmin';
  // isLeader is server-computed: true for room admin OR app admin/superAdmin.
  // The fallback (isAdmin || isAppAdmin) ensures the client never silently
  // strips UI from a super admin when the server flag is missing/stale.
  const isAuthorizedLeader = room.isLeader || isAdmin || isAppAdmin;

  const linkedJourneyIds = new Set(room.linkedJourneys.map(lj => lj.journeyId));
  const availableWalks = journeys.filter(j =>
    j.status === 'Published' &&
    !linkedJourneyIds.has(j.id)
  );

  const primaryLinkedJourney = room.linkedContentId ? getJourney(room.linkedContentId) : null;
  const contentTitle = primaryLinkedJourney?.title ?? null;
  const myProgressInLinkedJourney = room.linkedContentId ? myProgress[room.linkedContentId] : null;
  const currentStep = myProgressInLinkedJourney?.currentDay ?? null;
  const totalSteps = room.linkedContentId
    ? getStepsForJourney(room.linkedContentId).filter(s => s.status === 'Published').length
    : 0;

  const leaderMember = room.members.find(m => m.role === 'admin');
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

  // videoEligible is derived before the early returns (see top of component).

  // ── Handlers ────────────────────────────────────────────────────────────────

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

  const openChat = () => {
    history.replaceState({ ...history.state, roomName: room?.name ?? '' }, '');
    setLocation(`/rooms/${roomId}/chat`);
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

  const handleStartVideo = async () => {
    await apiStartVideo(user.id, String(roomId));
    setVideoActive(true);
  };

  const handleEndVideo = async () => {
    await apiEndVideo(user.id, String(roomId));
    setVideoActive(false);
  };

  const handleStartMeetingDirect = async () => {
    setStartingMeeting(true);
    try {
      const session = await apiStartSession(user.id, String(roomId));
      setActiveSession(session);
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
                {isAdmin ? (
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
                    <button
                      onClick={() => { setShowOverflow(false); setConfirmDelete(true); }}
                      className="w-full text-left px-4 py-3.5 text-[14px] text-destructive hover:bg-destructive/5 transition-colors flex items-center gap-2.5 border-t border-border/60"
                    >
                      <Trash2 size={15} className="shrink-0" />
                      Delete Group
                    </button>
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
          videoEligible={videoEligible}
          videoActive={videoActive}
          onStartVideo={handleStartVideo}
          onEndVideo={handleEndVideo}
        />
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
          onClose={() => setShowSharedAskEmmaus(false)}
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
          onClose={() => setActivePoll(null)}
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
          onClose={() => {
            setShowSharedScripture(false);
            setSseHighlights([]);
            setSseFocusChange(null);
          }}
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
                <div className="p-5 rounded-2xl border border-border/50 bg-card/50 text-center space-y-1.5">
                  <BookOpen size={20} className="mx-auto text-muted-foreground opacity-30" />
                  <p className="text-[14px] text-muted-foreground">Study revealed when meeting starts.</p>
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
                            Step {currentStep}{totalSteps > 0 ? ` of ${totalSteps}` : ''}
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
                    <button onClick={handleToggleRevealOnMeeting} className="mt-2 flex items-center gap-2 px-1 py-1">
                      <div
                        className={`rounded-full transition-colors flex items-center px-0.5 ${revealOnMeeting ? 'bg-primary' : 'bg-muted'}`}
                        style={{ width: 32, height: 18 }}
                      >
                        <div className={`w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${revealOnMeeting ? 'translate-x-3.5' : 'translate-x-0'}`} />
                      </div>
                      <span className="text-[12px] text-muted-foreground">
                        {revealOnMeeting ? 'Hidden until meeting' : 'Visible to members'}
                      </span>
                    </button>
                  )}
                  {isAuthorizedLeader && availableWalks.length > 0 && !showLinkWalk && (
                    <button onClick={() => setShowLinkWalk(true)} className="mt-2 text-[13px] text-primary font-medium hover:underline pl-1">
                      Change Study →
                    </button>
                  )}
                </>
              ) : (
                <div className="p-5 rounded-2xl border border-dashed border-border bg-card/50 text-center space-y-3">
                  <BookOpen size={22} className="mx-auto text-muted-foreground opacity-40" />
                  <p className="text-[14px] text-muted-foreground">Choose something to study together.</p>
                  {isAuthorizedLeader && availableWalks.length > 0 && (
                    <button onClick={() => setShowLinkWalk(true)} className="text-[14px] text-primary font-medium hover:underline">
                      Add a Walk →
                    </button>
                  )}
                </div>
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
                  {isAdmin && (
                    <button onClick={() => setLocation(`/rooms/${roomId}/invite`)} className="text-[13px] text-primary font-medium hover:underline">
                      Invite
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-border rounded-2xl border border-border overflow-hidden bg-card">
                {[...room.members].sort((a, b) => {
                  if (a.role === 'admin') return -1;
                  if (b.role === 'admin') return 1;
                  const aOnline = onlineUserIds.has(a.userId) ? 0 : 1;
                  const bOnline = onlineUserIds.has(b.userId) ? 0 : 1;
                  return aOnline - bOnline;
                }).map(m => {
                  const isMe = m.userId === user.id;
                  const displayName = isMe ? `${m.preferredName || 'You'} (you)` : m.preferredName || 'Member';
                  const initials = (m.preferredName || 'M').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
                  const isOnline = onlineUserIds.has(m.userId);
                  const prepStatus = getPrepStatus(primaryProgress, m.userId);
                  return (
                    <div key={m.userId} className="flex items-center gap-3.5 px-4 py-3.5">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-[13px] font-semibold flex items-center justify-center">{initials}</div>
                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${isOnline ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} title={isOnline ? 'Online' : 'Offline'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[14px] font-medium text-foreground truncate">{displayName}</p>
                          {m.role === 'admin' && <Crown size={12} className="text-amber-500 shrink-0" />}
                        </div>
                        {primaryProgress && (
                          <p className={`text-[11px] font-medium mt-0.5 ${prepStatus.color}`}>{prepStatus.label}</p>
                        )}
                      </div>
                      {isAdmin && !isMe && (
                        <button onClick={() => handleRemoveMember(m)} className="text-[12px] text-muted-foreground hover:text-destructive transition-colors px-2 py-1 shrink-0">
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Discussion — locked */}
            <section>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Group Discussion</p>
              <div className="p-4 rounded-2xl border border-border/50 bg-card/40 flex items-center gap-3">
                <MessageSquare size={16} className="text-muted-foreground/40 shrink-0" />
                <p className="text-[14px] text-muted-foreground">Discussion opens when the meeting starts.</p>
              </div>
            </section>

            {/* Prayer Requests */}
            <PrayerRequests
              roomId={String(roomId)} userId={user.id}
              displayName={user.preferredName || 'Member'}
              isAdmin={isAdmin} sessionId={undefined}
            />

            {/* START MEETING — primary action, leaders only */}
            {isAuthorizedLeader && (
              <button
                onClick={handleStartMeetingDirect}
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
                  <button
                    onClick={() => setFollowLeader(!followLeader)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold border transition-all ${
                      followLeader
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-transparent text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700 hover:border-emerald-500'
                    }`}
                  >
                    {followLeader ? '● Following' : 'Follow Leader'}
                  </button>
                )}
              </div>

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
              {sessionMode === 'discussion' && (
                <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-sky-50 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800/40">
                  <MessageSquare size={18} className="text-sky-600 dark:text-sky-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-sky-800 dark:text-sky-300">Group Discussion</p>
                    <p className="text-[11px] text-sky-600 dark:text-sky-400">Share your thoughts</p>
                  </div>
                  <button onClick={openChat} className="shrink-0 text-[12px] text-sky-600 dark:text-sky-400 font-semibold">Open →</button>
                </div>
              )}
            </div>

            {/* Live Video — renders join card (when active) or connected panel */}
            {videoEligible && (
              <VideoRoom
                roomId={String(roomId)}
                userId={user.id}
                displayName={user.preferredName || 'Member'}
                videoEligible={true}
                leaderName={leaderName}
                hideStart={true}
              />
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
                    {currentStep != null && <p className="text-[12px] text-muted-foreground mt-0.5">Step {currentStep}{totalSteps > 0 ? ` of ${totalSteps}` : ''}</p>}
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
                  if (a.role === 'admin') return -1;
                  if (b.role === 'admin') return 1;
                  const aOnline = onlineUserIds.has(a.userId) ? 0 : 1;
                  const bOnline = onlineUserIds.has(b.userId) ? 0 : 1;
                  return aOnline - bOnline;
                }).map(m => {
                  const isMe = m.userId === user.id;
                  const displayName = isMe ? `${m.preferredName || 'You'} (you)` : m.preferredName || 'Member';
                  const initials = (m.preferredName || 'M').split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase();
                  const isOnline = onlineUserIds.has(m.userId);
                  const record = attendanceData.find(a => a.userId === m.userId);
                  const hasJoined = !!record;
                  return (
                    <div key={m.userId} className="flex items-center gap-3.5 px-4 py-3.5">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-[13px] font-semibold flex items-center justify-center">{initials}</div>
                        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-background ${isOnline ? 'bg-emerald-400' : 'bg-muted-foreground/30'}`} title={isOnline ? 'Online' : 'Offline'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-[14px] font-medium text-foreground truncate">{displayName}</p>
                          {m.role === 'admin' && <Crown size={12} className="text-amber-500 shrink-0" />}
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

            {/* Discussion — open */}
            <section>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Group Discussion</p>
              <button onClick={openChat}
                className="w-full text-left p-4 rounded-2xl border border-border bg-card hover:border-sky-300 transition-all flex items-center gap-3.5"
              >
                <div className="w-9 h-9 rounded-full bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center shrink-0">
                  <MessageSquare size={17} className="text-sky-600 dark:text-sky-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-foreground">Open Discussion</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Talk together about today&apos;s study</p>
                </div>
                <div className="shrink-0 flex items-center gap-1 text-primary font-medium text-[13px]">
                  Open<ChevronRight size={14} />
                </div>
              </button>
            </section>

            {/* Prayer Requests */}
            <PrayerRequests
              roomId={String(roomId)} userId={user.id}
              displayName={user.preferredName || 'Member'}
              isAdmin={isAdmin} sessionId={activeSession.id}
            />

            {/* Group Notes */}
            <section>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Group Notes</p>
              <button onClick={() => setShowSharedNotes(true)}
                className="w-full text-left p-4 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-3.5"
              >
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <StickyNote size={17} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-foreground">Group Notes</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">Shared notes from this session</p>
                </div>
                <ChevronRight size={16} className="text-muted-foreground shrink-0" />
              </button>
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
              <button onClick={openChat}
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

            {/* Prayer Requests */}
            <PrayerRequests
              roomId={String(roomId)} userId={user.id}
              displayName={user.preferredName || 'Member'}
              isAdmin={isAdmin} sessionId={undefined}
            />

            {/* Group Notes */}
            <section>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Group Notes</p>
              <button onClick={() => setShowSharedNotes(true)}
                className="w-full text-left p-4 rounded-2xl border border-border bg-card hover:border-primary/30 transition-all flex items-center gap-3.5"
              >
                <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <StickyNote size={17} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-foreground">Group Notes</p>
                  <p className="text-[12px] text-muted-foreground mt-0.5">From this session</p>
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
