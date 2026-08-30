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
import { apiGetSession, apiGetSessionEventsToken, apiSessionEventsUrl } from '@/lib/rooms-api';
import type { RoomSession, SessionEvent, SessionMode, ScriptureRef, RoomHighlight, SharedNote, RoomPoll, SessionCompleteSummary, PresentationState, SharedPanelState, SharedPanel } from '@/lib/rooms-types';
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
  emmausAnswer: {
    question: string;
    fullText: string;
    answerId: string | null;
    error?: boolean;
  } | null;

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
  applyPresentationResponse: (presentation: PresentationState, expectedPresentationId?: string) => void;
  clearPresentationResponse: (sessionId: string, expectedPresentationId: string) => void;
   /** The server-authoritative tool currently shared with the meeting. */
   activeTool: 'scripture' | 'discussion' | 'poll' | 'ask-emmaus' | 'presentation' | 'study' | null;
   /** Versioned server-authoritative meeting surface; chat is legacy discussion. */
   sharedPanel: SharedPanelState;
}

export function shouldApplyPresentationEvent(
  current: { sessionId: string | null; version: number; panel: SharedPanel },
  incoming: { sessionId?: string | null; sharedPanel?: SharedPanelState },
  activeSessionId?: string,
): boolean {
  if (incoming.sessionId && activeSessionId && incoming.sessionId !== activeSessionId) return false;
  if (incoming.sharedPanel) {
    if (incoming.sharedPanel.panel !== 'presentation') return false;
    if (current.sessionId === (incoming.sessionId ?? activeSessionId ?? null) &&
      incoming.sharedPanel.version < current.version) return false;
    return true;
  }
  return current.version === 0 || current.panel === 'presentation';
}

export function isCurrentPresentationIdentity(
  activeSessionId: string | undefined,
  activePresentationId: string | undefined,
  incomingSessionId: string | undefined,
  incomingPresentationId?: string,
): boolean {
  if (!activeSessionId || !incomingSessionId || incomingSessionId !== activeSessionId) return false;
  return !incomingPresentationId || incomingPresentationId === activePresentationId;
}

export function canApplyPresentationResponse(
  activeSessionId: string | undefined,
  activePresentationId: string | undefined,
  presentation: PresentationState,
  expectedPresentationId?: string,
): boolean {
  if (!activeSessionId || presentation.sessionId !== activeSessionId) return false;
  if (!presentation.id || presentation.sharedPanel?.panel !== 'presentation') return false;
  if (presentation.sharedPanel.data?.presentationId !== presentation.id) return false;
  return !expectedPresentationId || activePresentationId === expectedPresentationId;
}

export function shouldReconcileSharedPanelPresentation(
  panelAccepted: boolean,
  panel: SharedPanelState | undefined,
): panel is SharedPanelState & { data: { presentationId: string } } {
  return panelAccepted &&
    panel?.panel === 'presentation' &&
    typeof panel.data?.presentationId === 'string';
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
  const [emmausAnswer, setEmmausAnswer] = useState<{
    question: string;
    fullText: string;
    answerId: string | null;
    error?: boolean;
  } | null>(null);

  // ── Polls (Task #437) ────────────────────────────────────────────────────
  const [incomingPoll, setIncomingPoll] = useState<RoomPoll | null>(null);
  const [pollVoteUpdate, setPollVoteUpdate] = useState<{ pollId: string; voteCounts: number[]; totalVotes: number } | null>(null);
  const [pollRevealUpdate, setPollRevealUpdate] = useState<{ pollId: string; voteCounts: number[]; totalVotes: number; options: string[]; question: string } | null>(null);

  // ── Group Media Presentation ──────────────────────────────────────────────
  const [activePresentation, setActivePresentation] = useState<PresentationState | null>(null);
  const [activeTool, setActiveTool] = useState<UseFollowLeaderResult['activeTool']>(null);
  const [sharedPanel, setSharedPanel] = useState<SharedPanelState>({ panel: 'none', version: 0 });

  // Refs for stable callbacks in the SSE loop
  const followLeaderRef = useRef(followLeader);
  const onNavigateRef = useRef(onNavigate);
  const onModeChangeRef = useRef(onModeChange);
  const onScriptureOpenRef = useRef(onScriptureOpen);
  // Tracks whether a definitive session-end event (session_ended / session_complete)
  // has been received.  Used to guard against session_state:null racing with the
  // HTTP seed and briefly flipping the UI back to Preparation phase.
  const sessionExplicitlyEndedRef = useRef(false);
  const activeSessionRef = useRef<RoomSession | null>(null);
  const emmausRequestRef = useRef<string | null>(null);
  const closedToolsRef = useRef(new Set<string>());
  const sharedPanelRef = useRef<{ sessionId: string | null; version: number; panel: SharedPanel }>({ sessionId: null, version: 0, panel: 'none' });
  const activePresentationRef = useRef<PresentationState | null>(null);

  useEffect(() => {
    activePresentationRef.current = activePresentation;
  }, [activePresentation]);

  const clearPresentationResponse = useCallback((sessionId: string, expectedPresentationId: string) => {
    if (!isCurrentPresentationIdentity(
      activeSessionRef.current?.id,
      activePresentationRef.current?.id,
      sessionId,
      expectedPresentationId,
    )) return;
    activePresentationRef.current = null;
    setActivePresentation(null);
  }, []);

  const applySharedPanel = useCallback((candidate: unknown, sessionId?: string | null): boolean => {
    const value = candidate as Partial<SharedPanelState> | null;
    const panels: SharedPanel[] = ['none', 'chat', 'scripture', 'presentation', 'poll', 'ask-emmaus', 'study', 'notes', 'participants'];
    if (!value || typeof value.version !== 'number' || !Number.isInteger(value.version) ||
      value.version < 0 || typeof value.panel !== 'string' || !panels.includes(value.panel as SharedPanel)) return false;
    const id = sessionId ?? activeSessionRef.current?.id ?? null;
    const current = sharedPanelRef.current;
    // A new session starts its own sequence. Within a session, delayed and
    // duplicated SSE messages can never move the visible surface backwards.
    if (current.sessionId === id && value.version < current.version) return false;
    sharedPanelRef.current = { sessionId: id, version: value.version, panel: value.panel as SharedPanel };
    setSharedPanel({ panel: value.panel as SharedPanel, version: value.version, ...(value.data && typeof value.data === 'object' ? { data: value.data } : {}) });
    return true;
  }, []);

  const applyPresentationResponse = useCallback((presentation: PresentationState, expectedPresentationId?: string) => {
    const activeSessionId = activeSessionRef.current?.id;
    if (!canApplyPresentationResponse(
      activeSessionId,
      activePresentationRef.current?.id,
      presentation,
      expectedPresentationId,
    )) return;
    if (!applySharedPanel(presentation.sharedPanel, presentation.sessionId)) return;
    activePresentationRef.current = presentation;
    setActivePresentation(presentation);
  }, [applySharedPanel]);

  useEffect(() => { followLeaderRef.current = followLeader; }, [followLeader]);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);
  useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);
  useEffect(() => { onScriptureOpenRef.current = onScriptureOpen; }, [onScriptureOpen]);

  const handleEvent = useCallback((event: SessionEvent) => {
    setLastEvent(event);

    switch (event.type) {
      case 'session_state': {
        const session = event.payload.session as RoomSession | null;
        const hydratedPanel = (
          (event.payload as { sharedPanel?: unknown }).sharedPanel ??
          session?.metadata?.sharedPanel
        ) as SharedPanelState | undefined;
        let hydratedPanelAccepted = false;

        if (session !== null) {
          // Active session received — always apply it.
          sessionExplicitlyEndedRef.current = false;
          activeSessionRef.current = session;
          setActiveSession(session);
           hydratedPanelAccepted = applySharedPanel(hydratedPanel, session.id);
          if (session.currentMode) {
            setSessionMode(session.currentMode as SessionMode);
          }
          if (session.currentScripture) {
            setActiveScripture(session.currentScripture);
           } else {
             setActiveScripture(null);
          }
           const hydratedTool = session.metadata?.activeTool;
           const hydratedEmmaus = session.metadata?.activeEmmaus as {
             requestId?: string;
             question?: string;
             text?: string;
             status?: 'generating' | 'completed' | 'failed';
             answerId?: string | null;
             error?: string;
           } | undefined;
           const hydratedToolWasClosed = typeof hydratedTool === 'string' &&
             closedToolsRef.current.has(`${session.id}:${hydratedTool}`);
           const effectiveTool = hydratedToolWasClosed ? null : hydratedTool;
           setActiveTool(
             effectiveTool === 'scripture' || effectiveTool === 'discussion' ||
               effectiveTool === 'poll' || effectiveTool === 'ask-emmaus' ||
               effectiveTool === 'presentation' || effectiveTool === 'study'
               ? effectiveTool
               : !hydratedToolWasClosed && session.currentScripture ? 'scripture' : null,
           );
           if (effectiveTool === 'ask-emmaus' && hydratedEmmaus?.requestId) {
             emmausRequestRef.current = hydratedEmmaus.requestId;
             setEmmausStreamText(hydratedEmmaus.text ?? '');
             if (hydratedEmmaus.status === 'generating') {
               setEmmausQuestion(hydratedEmmaus.question ?? null);
               setEmmausAnswer(null);
             } else {
               setEmmausQuestion(null);
               setEmmausAnswer({
                 question: hydratedEmmaus.question ?? '',
                 fullText: hydratedEmmaus.text ?? '',
                 answerId: hydratedEmmaus.answerId ?? null,
                 error: hydratedEmmaus.status === 'failed',
               });
             }
           } else if (effectiveTool !== 'ask-emmaus') {
             emmausRequestRef.current = null;
             setEmmausQuestion(null);
             setEmmausStreamText('');
             setEmmausAnswer(null);
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
            activeSessionRef.current = null;
            setActiveSession(null);
             sharedPanelRef.current = { sessionId: null, version: 0, panel: 'none' };
             setSharedPanel({ panel: 'none', version: 0 });
            setSessionMode('study');
            setActiveScripture(null);
             setActiveTool(null);
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
        if (seedPresentation && session !== null && hydratedPanelAccepted &&
          hydratedPanel?.panel === 'presentation' &&
          hydratedPanel.data?.presentationId === seedPresentation.id) {
          // Seed the active presentation for late-joining members or reconnectors.
          // Only apply when there is still an active session; if the session is
          // null the presentation row has already been cleaned up by session end.
          if (!seedPresentation.sessionId || seedPresentation.sessionId === session.id) {
            activePresentationRef.current = seedPresentation;
            setActivePresentation(seedPresentation);
          }
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
        activeSessionRef.current = null;
        emmausRequestRef.current = null;
        setActiveSession(null);
        setSessionMode('study');
        setActiveScripture(null);
         setActiveTool(null);
        // Clear accumulated session data so it doesn't bleed into the next meeting.
        setIncomingHighlights([]);
        setIncomingNotes([]);
        setIncomingPinChange(null);
        setIncomingFocusChange(null);
        setActivePresentation(null);
         sharedPanelRef.current = { sessionId: null, version: 0, panel: 'none' };
         setSharedPanel({ panel: 'none', version: 0 });
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
        activeSessionRef.current = null;
        emmausRequestRef.current = null;
        setSessionComplete({ sessionId, modesEntered, memberCount, prayerRequestCount, sharedNoteCount });
        setActiveSession(null);
        setSessionMode('study');
        setActiveScripture(null);
         setActiveTool(null);
        // Clear accumulated session data so it doesn't bleed into the next meeting.
        setIncomingHighlights([]);
        setIncomingNotes([]);
        setIncomingPinChange(null);
        setIncomingFocusChange(null);
        setActivePresentation(null);
         sharedPanelRef.current = { sessionId: null, version: 0, panel: 'none' };
         setSharedPanel({ panel: 'none', version: 0 });
        break;
      }

      case 'media_presented': {
        const p = event.payload as {
          id?: string;
          messageId: string | null; filename: string; mediaType: string;
          objectPath: string; presentedBy: string; presentedByName: string;
          currentPage: number; pageCount?: number | null; sessionId: string | null;
          sharedPanel?: SharedPanelState;
        };
        const activeId = activeSessionRef.current?.id;
        if (!shouldApplyPresentationEvent(sharedPanelRef.current, p, activeId)) break;
        if (p.sharedPanel && !applySharedPanel(p.sharedPanel, p.sessionId ?? activeId)) break;
        applyPresentationResponse({
          id: p.id,
          sessionId: p.sessionId ?? undefined,
          messageId: p.messageId,
          filename: p.filename,
          mediaType: p.mediaType as import('@/lib/rooms-types').MediaAttachmentType,
          objectPath: p.objectPath,
          presentedBy: p.presentedBy,
          presentedByName: p.presentedByName,
          currentPage: p.currentPage,
          pageCount: p.pageCount ?? undefined,
          sharedPanel: p.sharedPanel,
        });
        setActiveTool('presentation');
        break;
      }

      case 'shared_panel': {
        const payload = event.payload as { sessionId?: string; sharedPanel?: unknown };
        const activeId = activeSessionRef.current?.id;
        if (payload.sessionId && activeId && payload.sessionId !== activeId) break;
        const panelAccepted = applySharedPanel(payload.sharedPanel, payload.sessionId ?? activeId);
        const panel = payload.sharedPanel as SharedPanelState | undefined;
        if (shouldReconcileSharedPanelPresentation(panelAccepted, panel)) {
          const currentPresentation = activePresentationRef.current;
          if (currentPresentation) {
            const nextPresentation: PresentationState = {
              ...currentPresentation,
              id: panel.data.presentationId,
              sessionId: payload.sessionId ?? currentPresentation.sessionId,
              sharedPanel: panel,
            };
            activePresentationRef.current = nextPresentation;
            setActivePresentation(nextPresentation);
          }
        }
        break;
      }

      case 'presentation_page': {
        const p = event.payload as {
          id?: string;
          sessionId?: string;
          currentPage?: number;
          sharedPanel?: SharedPanelState;
        };
        const activeId = activeSessionRef.current?.id;
        if (p.sessionId && activeId && p.sessionId !== activeId) break;
        if (!p.sharedPanel || !applySharedPanel(p.sharedPanel, p.sessionId ?? activeId)) break;
        if (!Number.isSafeInteger(p.currentPage) || Number(p.currentPage) < 1) break;
        if (!p.id || !isCurrentPresentationIdentity(activeId, activePresentationRef.current?.id, p.sessionId, p.id)) break;
        const currentPresentation = activePresentationRef.current;
        if (!currentPresentation) break;
        const nextPresentation: PresentationState = { ...currentPresentation, currentPage: Number(p.currentPage), sharedPanel: p.sharedPanel };
        activePresentationRef.current = nextPresentation;
        setActivePresentation(nextPresentation);
        break;
      }

      case 'presentation_stopped': {
        const payload = event.payload as { sessionId?: string; presentationId?: string; sharedPanel?: SharedPanelState };
        const activeId = activeSessionRef.current?.id;
        if (payload.sessionId && activeId && payload.sessionId !== activeId) break;
        if (!payload.sharedPanel || !applySharedPanel(payload.sharedPanel, payload.sessionId ?? activeId)) break;
        if (!payload.presentationId || !isCurrentPresentationIdentity(activeId, activePresentationRef.current?.id, payload.sessionId, payload.presentationId)) break;
        activePresentationRef.current = null;
        setActivePresentation(null);
        setActiveTool(prev => prev === 'presentation' ? null : prev);
        break;
      }

      case 'tool_closed': {
         const tool = event.payload.tool as UseFollowLeaderResult['activeTool'];
         const eventSessionId = String(event.payload.sessionId ?? '');
         const currentSessionId = activeSessionRef.current?.id ?? '';
         if (eventSessionId && currentSessionId && eventSessionId !== currentSessionId) break;
         if (eventSessionId) closedToolsRef.current.add(`${eventSessionId}:${tool}`);
        setActiveTool(prev => prev === tool ? null : prev);
        if (tool === 'scripture') setActiveScripture(null);
        if (tool === 'poll') {
          setIncomingPoll(null);
          setPollVoteUpdate(null);
          setPollRevealUpdate(null);
        }
        if (tool === 'ask-emmaus') {
           emmausRequestRef.current = null;
          setEmmausQuestion(null);
          setEmmausStreamText('');
          setEmmausAnswer(null);
        }
        if (tool === 'presentation') setActivePresentation(null);
        break;
      }

      case 'navigate': {
        const payload = event.payload as NavigatePayload;
        if (payload.scripture) {
           const sessionId = activeSessionRef.current?.id;
           if (sessionId) closedToolsRef.current.delete(`${sessionId}:scripture`);
          setSessionMode('scripture');
          setActiveScripture(payload.scripture);
           setActiveTool('scripture');
          // Notify all members (even non-followers) so they can see the notice
          onScriptureOpenRef.current?.(payload.scripture, payload.leaderName ?? '');
        } else if (payload.stepId) {
           const sessionId = activeSessionRef.current?.id;
           if (sessionId) closedToolsRef.current.delete(`${sessionId}:study`);
          setSessionMode('study');
          setActiveScripture(null);
           setActiveTool('study');
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
           const sessionId = activeSessionRef.current?.id;
           const nextTool = mode === 'scripture' || mode === 'discussion' || mode === 'poll'
             ? mode
             : 'study';
           if (sessionId) closedToolsRef.current.delete(`${sessionId}:${nextTool}`);
          setSessionMode(mode as SessionMode);
          if (mode !== 'scripture') setActiveScripture(null);
           setActiveTool(
             mode === 'scripture' || mode === 'discussion' || mode === 'poll'
               ? mode
               : 'study',
           );
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
         const requestId = String(event.payload.requestId ?? `legacy:${question ?? ''}`);
         const sessionId = activeSessionRef.current?.id;
         if (sessionId) closedToolsRef.current.delete(`${sessionId}:ask-emmaus`);
         emmausRequestRef.current = requestId;
        setEmmausQuestion(question ?? null);
        setEmmausStreamText('');
        setEmmausAnswer(null);
        setActiveTool('ask-emmaus');
        break;
      }

      case 'emmaus_chunk': {
        const text = event.payload.text as string;
         const requestId = event.payload.requestId as string | undefined;
         if (requestId && requestId !== emmausRequestRef.current) break;
         if (text) setEmmausStreamText(prev => prev + text);
        break;
      }

      case 'emmaus_done': {
        const q = event.payload.question as string;
        const fullText = event.payload.fullText as string;
        const answerId = (event.payload.answerId as string | null) ?? null;
         const requestId = event.payload.requestId as string | undefined;
         if (requestId && requestId !== emmausRequestRef.current) break;
         setEmmausStreamText(fullText);
         setEmmausAnswer({
           question: q,
           fullText,
           answerId,
           error: Boolean(event.payload.error),
         });
        setEmmausQuestion(null);
        break;
      }

      // ── Polls ────────────────────────────────────────────────────────────
      case 'poll_started': {
        const poll = event.payload.poll as RoomPoll;
        if (poll) {
          setIncomingPoll(poll);
          setActiveTool('poll');
        }
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
  }, [applySharedPanel]);

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

  // SSE is intentionally best-effort. Reconcile a generating group question
  // against the durable session row so a dropped emmaus_done event can never
  // leave every client behind an indefinite spinner.
  useEffect(() => {
    if (!roomId || !userId || emmausQuestion === null) return;
    let destroyed = false;

    const reconcile = async () => {
      try {
        const session = await apiGetSession(userId, roomId);
        if (destroyed) return;
        const state = session?.metadata?.activeEmmaus as {
          requestId?: string;
          question?: string;
          text?: string;
          status?: 'generating' | 'completed' | 'failed';
          answerId?: string | null;
        } | undefined;
        if (
          !session ||
          session.metadata?.activeTool !== 'ask-emmaus' ||
          !state?.requestId
        ) {
          emmausRequestRef.current = null;
          setEmmausQuestion(null);
          setEmmausStreamText('');
          setEmmausAnswer(null);
          return;
        }
        if (state.requestId !== emmausRequestRef.current) return;
        setEmmausStreamText(state.text ?? '');
        if (state.status === 'completed' || state.status === 'failed') {
          setEmmausAnswer({
            question: state.question ?? emmausQuestion,
            fullText: state.text ?? '',
            answerId: state.answerId ?? null,
            error: state.status === 'failed',
          });
          setEmmausQuestion(null);
        }
      } catch {
        // Keep the realtime state and try again; temporary HTTP failures must
        // not replace a valid in-progress answer with an error.
      }
    };

    void reconcile();
    const timer = setInterval(() => void reconcile(), 3_000);
    return () => {
      destroyed = true;
      clearInterval(timer);
    };
  }, [roomId, userId, emmausQuestion]);

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
    applyPresentationResponse,
    clearPresentationResponse,
    activeTool,
    sharedPanel,
  };
}
