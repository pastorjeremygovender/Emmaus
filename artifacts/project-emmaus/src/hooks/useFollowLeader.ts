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
import type { RoomSession, SessionEvent, SessionMode, ScriptureRef } from '@/lib/rooms-types';

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
}

export function useFollowLeader({
  roomId,
  userId,
  onNavigate,
  onModeChange,
}: UseFollowLeaderOptions): UseFollowLeaderResult {
  const [activeSession, setActiveSession] = useState<RoomSession | null>(null);
  const [followLeader, setFollowLeader] = useState(true);
  const [lastEvent, setLastEvent] = useState<SessionEvent | null>(null);
  const [sessionMode, setSessionMode] = useState<SessionMode>('study');

  // Refs for stable callbacks in the SSE loop
  const followLeaderRef = useRef(followLeader);
  const onNavigateRef = useRef(onNavigate);
  const onModeChangeRef = useRef(onModeChange);

  useEffect(() => { followLeaderRef.current = followLeader; }, [followLeader]);
  useEffect(() => { onNavigateRef.current = onNavigate; }, [onNavigate]);
  useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);

  const handleEvent = useCallback((event: SessionEvent) => {
    setLastEvent(event);

    switch (event.type) {
      case 'session_state': {
        const session = event.payload.session as RoomSession | null;
        setActiveSession(session);
        if (session?.currentMode) {
          setSessionMode(session.currentMode as SessionMode);
        }
        // Auto-enable follow leader when reconnecting to an active session
        if (session && session.status === 'active') {
          setFollowLeader(true);
        }
        break;
      }

      case 'session_started': {
        // Will be followed by a full session_state, but set to active mode immediately
        setFollowLeader(true);
        break;
      }

      case 'session_ended': {
        setActiveSession(null);
        setSessionMode('study');
        break;
      }

      case 'navigate': {
        const payload = event.payload as NavigatePayload;
        if (event.payload.scripture && event.payload.scripture) {
          setSessionMode('scripture');
        } else if (event.payload.stepId) {
          setSessionMode('study');
        }
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
        }
        onModeChangeRef.current?.(mode as SessionMode, leaderName);
        break;
      }

      // focus_verse, poll_started, poll_result are available via lastEvent
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
  };
}
