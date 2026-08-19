/**
 * useFollowLeader.ts — Subscribe to a Room's real-time session event stream.
 *
 * Manages:
 *  - SSE connection with token handshake + exponential-backoff reconnect
 *  - followLeader toggle state (default ON when a session is active)
 *  - Automatic navigation when followLeader is ON and a navigate event arrives
 *  - Current session state (restored from the server on connect)
 *
 * Usage:
 *   const {
 *     activeSession, setActiveSession,
 *     followLeader, setFollowLeader,
 *     lastEvent,
 *     sessionMode,
 *   } = useFollowLeader({ roomId, userId, onNavigate, onModeChange });
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGetSessionEventsToken, apiSessionEventsUrl } from '@/lib/rooms-api';
import type { RoomSession, SessionEvent, SessionMode, ScriptureRef, RoomHighlight, SharedNote, RoomPoll, SessionCompleteSummary, PresentationState } from '@/lib/rooms-types';
import { roomSessionAckKey } from '@/lib/account-storage';

export interface NavigatePayload {
  stepId?: string;
  scripture?: ScriptureRef;
  leaderName?: string;
}

interface UseFollowLeaderOptions {
  roomId: string;
  userId: string;
  /** Called when a navigate event arrives and followLeader is ON. */
  onNavigate?: (payload: NavigatePayload) => void;
  /** Called when a mode_change event arrives (for all members, regardless of followLeader). */
  onModeChange?: (mode: SessionMode | string, leaderName: string) => void;
  /** Called when a navigate event contains a scripture payload (even if followLeader is OFF,
   *  so the member can see the notice and opt in). Receives the scripture ref + leaderName. */
  onScriptureOpen?: (scripture: ScriptureRef, leaderName: string) => void;
}

interface UseFollowLeaderResult {
  /** The current active session, or null if none. */
  activeSession: RoomSession | null;
  setActiveSession: (session: RoomSession | null) => void;
  /** Whether the member is following the leader's navigation. */
  followLeader: boolean;
  setFollowLeader: (v: boolean) => void;
  /** The most recent session event received (for poll / focus-verse displays). */
  lastEvent: SessionEvent | null;
  /** The current session mode derived from the active session or events. */
  sessionMode: SessionMode;
  /** The current scripture the leader has open (null if none). */
  activeScripture: ScriptureRef | null;
  /** New highlights from the SSE stream (cleared after each render cycle). */
  incomingHighlights: RoomHighlight[];
  /** New notes from the SSE stream (cleared after each render cycle). */
  incomingNotes: SharedNote[];
  /** Latest pin-change event from SSE. */
  incomingPinChange: { noteId: string; isPinned: boolean } | null;
  /** Latest focus-verse change from SSE. */
  incomingFocusChange: string | null;

  // ── Session completion (Task #438) ─────────────────────────────────────
  /** Non-null when the leader has formally completed the session. Cleared on dismiss. */
  sessionComplete: SessionCompleteSummary | null;
  /** Clear the session-complete summary (called when the member dismisses the card). */
  clearSessionComplete: () => void;

  // ── Shared Ask Emmaus (Task #437) ──────────────────────────────────────
  /** Non-null while the leader's question is being generated. */
  emmausQuestion: string | null;
  /** Accumulated text chunks from the current stream. Reset on each new question. */
  emmausStreamText: string;
  /** Set when the current stream completes; cleared when a new question starts. */
  emmausAnswer: { question: string; fullText: string; answerId: string | null } | null;

  // ── Polls (Task #437) ──────────────────────────────────────────────────
  /** New poll received via SSE (auto-show PollCard when followLeader is ON). */
  incomingPoll: RoomPoll | null;
  /** Latest vote-count broadcast from the server. */
  pollVoteUpdate: { pollId: string; voteCounts: number[]; totalVotes: number } | null;
  /** Set when the leader reveals poll results. */
  pollRevealUpdate: { pollId: string; voteCounts: number[]; totalVotes: number; options: string[]; question: string } | null;
  /** Active media presentation (null when none in progress). */
  activePresentation: PresentationState | null;
  setActivePresentation: (p: PresentationState | null) => void;
}

export function useFollowLeader({
  roomId,
  userId,
  onNavigate,
  onModeChange,
  onScriptureOpen,
}: UseFollowLeaderOptions): UseFollowLeaderResult {
  const [activeSession, setActiveSession] = useState<RoomSession | null>(null);
  const [followLeader, setFollowLeader] = useState(true);
  const [lastEvent, setLastEvent] = useState<SessionEvent | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>('study');
  const [activeScripture, setActiveScripture] = useState<ScriptureRef | null>(null);
  const [incomingHighlights, setIncomingHighlights] = useState<RoomHighlight[]>([]);
  const [incomingNotes, setIncomingNotes] = useState<SharedNote[]>([]);
  const [incomingPinChange, setIncomingPinChange] = useState<{ noteId: string; isPinned: boolean } | null>(null);
  const [incomingFocusChange, setIncomingFocusChange] = useState<string | null>(null);

  // ── Session completion (Task #438) ──────────────────────────────────────
  const [sessionComplete, setSessionComplete] = useState<SessionCompleteSummary | null>(null);

  // ── Shared Ask Emmaus (Task #437) ────────────────────────────────────────
  const [emmausQuestion, setEmmausQuestion] = useState<string | null>(null);
  const [emmausStreamText, setEmmausStreamText] = useState('');
  const [emmausAnswer, setEmmausAnswer] = useState<{ question: string; fullText: string; answerId: string | null } | null>(null);

  // ── Polls (Task #437) ────────────────────────────────────────────────────
  const [incomingPoll, setIncomingPoll] = useState<RoomPoll | null>(null);
  const [pollVoteUpdate, setPollVoteUpdate] = useState<{ pollId: string; voteCounts: number[]; totalVotes: number } | null>(null);
  const [pollRevealUpdate, setPollRevealUpdate] = useState<{ pollId: string; voteCounts: number[]; totalVotes: number; options: string[]; question: string } | null>(null);

  // ── Group Media Presentation ──────────────────────────────────────────────
  const [activePresentation, setActivePresentation] = useState<PresentationState | null>(null);

  // Refs for stable callbacks in the SSE loop
  const followLeaderRef = useRef(followLeader);
  const onNavigateRef = useRef(onNavigate);
  const onModeChangeRef = useRef(onModeChange);
  const onScriptureOpenRef = useRef(onScriptureOpen);
  // Tracks whether a definitive session-end event (session_ended / session_complete)
  // has been received.  Used to guard against session_state:null racing with the
  // HTTP seed and briefly flipping the UI back to Preparation phase.
  const sessionExplicitlyEndedRef = useRef(false);

  useEffect(() => { followLeaderRef.current = followLeader; }, [followLeader]);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);
  useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);
  useEffect(() => { onScriptureOpenRef.current = onScriptureOpen; }, [onScriptureOpen]);

  const handleEvent = useCallback((event: SessionEvent) => {
    setLastEvent(event);

    switch (event.type) {
      case 'session_state': {
        const session = event.payload.session as RoomSession | null;

        if (session !== null) {
          // Active session received — always apply it.
          sessionExplicitlyEndedRef.current = false;
          setActiveSession(session);
          if (session.currentMode) {
            setSessionMode(session.currentMode as SessionMode);
          }
          if (session.currentScripture) {
            setActiveScripture(session.currentScripture);
          }
          // Auto-enable follow leader when reconnecting to an active session.
          if (session.status === 'active') {
            setFollowLeader(true);
          }
        } else {
          // Null session: only apply if we've seen an explicit end event,
          // or if we never had a session.  This prevents a brief race between
          // the HTTP seed (which sets activeSession) and the first SSE
          // session_state arriving with null from clobbering the HTTP state.
          if (sessionExplicitlyEndedRef.current) {
            setActiveSession(null);
            setSessionMode('study');
            setActiveScripture(null);
          } else {
            // Use functional update: only clear if we don't already have a session.
            setActiveSession(prev => {
              if (prev !== null) return prev; // preserve HTTP-seeded session
              return null;
            });
          }
        }

        // Seed historical highlights, notes, and active presentation so panels
        // see them even if the corresponding SSE events were missed before this
        // member joined (late-join or reconnect).
        const seedHighlights = (event.payload.highlights as RoomHighlight[] | undefined) ?? [];
        const seedNotes = (event.payload.notes as SharedNote[] | undefined) ?? [];
        const seedPoll = (event.payload.activePoll as RoomPoll | undefined) ?? null;
        const seedPresentation = (event.payload.activePresentation as PresentationState | undefined) ?? null;

        if (seedHighlights.length > 0) {
          setIncomingHighlights(prev => {
            const existingIds = new Set(prev.map(h => h.id));
            const fresh = seedHighlights.filter(h => !existingIds.has(h.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        }
        if (seedNotes.length > 0) {
          setIncomingNotes(prev => {
            const existingIds = new Set(prev.map(n => n.id));
            const fresh = seedNotes.filter(n => !existingIds.has(n.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
        }
        if (seedPoll && session !== null) {
          // Only seed the poll if there's still an active session.
          setIncomingPoll(seedPoll);
        }
        if (seedPresentation && session !== null) {
          // Seed the active presentation for late-joining members or reconnectors.
          // Only apply when there is still an active session; if the session is
          // null the presentation row has already been cleaned up by session end.
          setActivePresentation(prev => prev ?? seedPresentation);
        }

        break;
      }

      case 'session_started': {
        // Will be followed by a full session_state, but enable following immediately
        sessionExplicitlyEndedRef.current = false;
        setFollowLeader(true);
        break;
      }

      case 'session_ended': {
        sessionExplicitlyEndedRef.current = true;
        setActiveSession(null);
        setSessionMode('study');
        setActiveScripture(null);
        // Clear accumulated session data so it doesn't bleed into the next meeting.
        setIncomingHighlights([]);
        setIncomingNotes([]);
        setIncomingPinChange(null);
        setIncomingFocusChange(null);
        setActivePresentation(null);
        break;
      }

      case 'session_complete': {
        const sessionId = String(event.payload.sessionId ?? '');
        // If this specific session's completion has already been acknowledged
        // (user pressed Done or X), do not re-show the modal on reconnect.
        if (sessionId && userId && localStorage.getItem(roomSessionAckKey(userId, sessionId))) {
          sessionExplicitlyEndedRef.current = true;
          setActiveSession(null);
          break;
        }
        const modesEntered = (event.payload.modesEntered as string[]) ?? [];
        const memberCount = Number(event.payload.memberCount ?? 0);
        const prayerRequestCount = Number(event.payload.prayerRequestCount ?? 0);
        const sharedNoteCount = Number(event.payload.sharedNoteCount ?? 0);
        sessionExplicitlyEndedRef.current = true;
        setSessionComplete({ sessionId, modesEntered, memberCount, prayerRequestCount, sharedNoteCount });
        setActiveSession(null);
        setSessionMode('study');
        setActiveScripture(null);
        // Clear accumulated session data so it doesn't bleed into the next meeting.
        setIncomingHighlights([]);
        setIncomingNotes([]);
        setIncomingPinChange(null);
        setIncomingFocusChange(null);
        setActivePresentation(null);
        break;
      }

      case 'media_presented': {
        const p = event.payload as {
          messageId: string | null; filename: string; mediaType: string;
          objectPath: string; presentedBy: string; presentedByName: string;
          currentPage: number; pageCount?: number | null; sessionId: string | null;
        };
        setActivePresentation({
          messageId: p.messageId,
          filename: p.filename,
          mediaType: p.mediaType as import('@/lib/rooms-types').MediaAttachmentType,
          objectPath: p.objectPath,
          presentedBy: p.presentedBy,
          presentedByName: p.presentedByName,
          currentPage: p.currentPage,
          pageCount: p.pageCount ?? undefined,
        });
        break;
      }

      case 'presentation_page': {
        const { currentPage } = event.payload as { currentPage: number };
        setActivePresentation(prev =>
          prev ? { ...prev, currentPage } : prev
        );
        break;
      }

      case 'presentation_stopped': {
        setActivePresentation(null);
        break;
      }

      case 'navigate': {
        const payload = event.payload as NavigatePayload;
        if (payload.scripture) {
          setSessionMode('scripture');
          setActiveScripture(payload.scripture);
          // Notify all members (even non-followers) so they can see the notice
          onScriptureOpenRef.current?.(payload.scripture, payload.leaderName ?? '');
        } else if (payload.stepId) {
          setSessionMode('study');
          setActiveScripture(null);
        }
        // Only auto-navigate (step changes) when followLeader is ON
        if (followLeaderRef.current && onNavigateRef.current) {
          onNavigateRef.current(payload);
        }
        break;
      }

      case 'mode_change': {
        const mode = event.payload.mode as string;
        const leaderName = (event.payload.leaderName as string) ?? '';
        if (['study', 'scripture', 'discussion', 'prayer', 'poll'].includes(mode)) {
          setSessionMode(mode as SessionMode);
          if (mode !== 'scripture') setActiveScripture(null);
        }
        onModeChangeRef.current?.(mode as SessionMode, leaderName);
        break;
      }

      case 'highlight_added': {
        // Discard late-arriving events after the session has explicitly ended.
        if (sessionExplicitlyEndedRef.current) break;
        const highlight = event.payload.highlight as RoomHighlight;
        if (highlight) {
          setIncomingHighlights(prev => [...prev, highlight]);
        }
        break;
      }

      case 'highlight_focus_changed': {
        if (sessionExplicitlyEndedRef.current) break;
        const highlightId = event.payload.highlightId as string | null;
        setIncomingFocusChange(highlightId ?? null);
        break;
      }

      case 'note_added': {
        if (sessionExplicitlyEndedRef.current) break;
        const note = event.payload.note as SharedNote;
        if (note) {
          setIncomingNotes(prev => [...prev, note]);
        }
        break;
      }

      case 'note_pinned': {
        if (sessionExplicitlyEndedRef.current) break;
        const noteId = event.payload.noteId as string;
        const pin = event.payload.pin as boolean;
        setIncomingPinChange({ noteId, isPinned: pin });
        break;
      }

      // ── Shared Ask Emmaus ───────────────────────────────────────────────
      case 'emmaus_started': {
        const question = event.payload.question as string;
        setEmmausQuestion(question ?? null);
        setEmmausStreamText('');
        setEmmausAnswer(null);
        break;
      }

      case 'emmaus_chunk': {
        const text = event.payload.text as string;
        if (text) setEmmausStreamText(prev => prev + text);
        break;
      }

      case 'emmaus_done': {
        const q = event.payload.question as string;
        const fullText = event.payload.fullText as string;
        const answerId = (event.payload.answerId as string | null) ?? null;
        setEmmausAnswer({ question: q, fullText, answerId });
        setEmmausQuestion(null);
        break;
      }

      // ── Polls ────────────────────────────────────────────────────────────
      case 'poll_started': {
        const poll = event.payload.poll as RoomPoll;
        if (poll) setIncomingPoll(poll);
        break;
      }

      case 'poll_vote_count': {
        const pollId = event.payload.pollId as string;
        const voteCounts = event.payload.voteCounts as number[];
        const totalVotes = event.payload.totalVotes as number;
        setPollVoteUpdate({ pollId, voteCounts, totalVotes });
        break;
      }

      case 'poll_revealed': {
        const pollId = event.payload.pollId as string;
        const voteCounts = event.payload.voteCounts as number[];
        const totalVotes = event.payload.totalVotes as number;
        const options = (event.payload.options as string[]) ?? [];
        const question = (event.payload.question as string) ?? '';
        setPollRevealUpdate({ pollId, voteCounts, totalVotes, options, question });
        break;
      }

      // focus_verse, poll_result available via lastEvent
      default:
        break;
    }
  }, []);

  // SSE connection with token handshake + exponential backoff reconnect
  useEffect(() => {
    if (!roomId || !userId) return;

    let destroyed = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let reconnectDelay = 2_000;

    const openStream = async () => {
      if (destroyed) return;
      try {
        const token = await apiGetSessionEventsToken(userId, roomId);
        if (destroyed) return;
        const url = apiSessionEventsUrl(roomId, token);
        es = new EventSource(url);

        es.onmessage = (e) => {
          try {
            const event = JSON.parse(e.data) as SessionEvent;
            handleEvent(event);
            reconnectDelay = 2_000; // reset backoff on successful message
          } catch { /* ignore malformed events */ }
        };

        es.onerror = () => {
          es?.close();
          es = null;
          if (!destroyed) {
            reconnectTimer = setTimeout(() => {
              reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
              openStream();
            }, reconnectDelay);
          }
        };
      } catch {
        // Token fetch failed — retry with backoff
        if (!destroyed) {
          reconnectTimer = setTimeout(() => {
            reconnectDelay = Math.min(reconnectDelay * 2, 60_000);
            openStream();
          }, reconnectDelay);
        }
      }
    };

    openStream();

    return () => {
      destroyed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
    };
  }, [roomId, userId, handleEvent]);

  return {
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
    // Task #438
    sessionComplete,
    clearSessionComplete: () => setSessionComplete(null),
    // Task #437
    emmausQuestion,
    emmausStreamText,
    emmausAnswer,
    incomingPoll,
    pollVoteUpdate,
    pollRevealUpdate,
    activePresentation,
    setActivePresentation,
  };
}
