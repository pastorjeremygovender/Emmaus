/**
 * VideoRoom.tsx — Live gathering experience embedded inside Emmaus Rooms.
 *
 * Appears at the top of RoomDetail as the primary action card.
 * Never replaces the page — the Room content always remains below.
 *
 * States:
 *   idle (no gathering)      → leader sees "Gather Together" CTA
 *                             → member sees "Waiting for today's gathering"
 *   active (not yet joined)  → everyone sees "[Name] is gathering now" + Join
 *   connected (in gathering) → embedded video card with Expand/Collapse
 *
 * Expand/collapse switches the outer className between inline card and fixed
 * overlay — LiveKitRoom stays mounted so the connection is never dropped.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LiveKitRoom,
  ParticipantTile,
  RoomAudioRenderer,
  useTracks,
  useRemoteParticipants,
  useLocalParticipant,
  ControlBar,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import {
  PhoneOff, AlertCircle, Loader2, Users, Settings,
  Maximize2, Minimize2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoSessionStatus } from '@/lib/rooms-types';
import {
  apiGetVideoStatus,
  apiStartVideo,
  apiGetVideoToken,
  apiEndVideo,
} from '@/lib/rooms-api';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VideoRoomProps {
  roomId: string;
  userId: string;
  displayName: string;
  /** Personal rooms pass false → component renders null. */
  videoEligible: boolean;
  /** Name of the room leader, shown when video is active. */
  leaderName?: string;
  /**
   * When true, the "Start Live Video" leader CTA is suppressed.
   * Meeting Tools handles start; this component only shows Join + Connected.
   */
  hideStart?: boolean;
}

// ─── Duration warning hook ────────────────────────────────────────────────────

function useDurationWarning(
  startedAt: string | null,
  maxMinutes: number | undefined,
  enabled: boolean
): string | null {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !startedAt || !maxMinutes) return;
    const tick = () => {
      const elapsed = (Date.now() - new Date(startedAt).getTime()) / 60_000;
      const remaining = maxMinutes - elapsed;
      if (remaining <= 5 && remaining > 0) {
        setWarning(`Gathering ends in ${Math.ceil(remaining)} min.`);
      } else if (remaining <= 0) {
        setWarning('Gathering time limit reached.');
      } else {
        setWarning(null);
      }
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [startedAt, maxMinutes, enabled]);

  return warning;
}

// ─── Participant grid (rendered inside LiveKitRoom context) ───────────────────

function ParticipantGrid({ onLeave, canHost, onEnd, ending }: {
  onLeave: () => void;
  canHost: boolean;
  onEnd: () => void;
  ending: boolean;
}) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false }
  );
  const allParticipants = [localParticipant, ...remoteParticipants].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Users size={13} className="text-muted-foreground" />
        <span className="text-[12px] text-muted-foreground">
          {allParticipants.length} gathering
        </span>
      </div>

      <div className={`grid gap-2 ${allParticipants.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {cameraTracks.map(trackRef => (
          <div
            key={trackRef.participant.identity}
            className="relative rounded-xl overflow-hidden bg-gray-900 aspect-video"
          >
            <ParticipantTile
              trackRef={trackRef}
              style={{ width: '100%', height: '100%', borderRadius: '12px' }}
            />
          </div>
        ))}
      </div>

      <div className="pt-1">
        <ControlBar
          controls={{ camera: true, microphone: true, screenShare: false, leave: false, chat: false }}
          style={{ background: 'transparent', padding: 0, justifyContent: 'center' }}
        />
      </div>

      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1 rounded-xl h-10"
          onClick={onLeave}
        >
          <PhoneOff size={14} className="mr-1.5" />
          Leave Gathering
        </Button>
        {canHost && (
          <Button
            variant="destructive"
            size="sm"
            className="flex-1 rounded-xl h-10"
            onClick={onEnd}
            disabled={ending}
          >
            {ending ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
            End Gathering
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

export function VideoRoom({
  roomId, userId, displayName, videoEligible, leaderName, hideStart = false,
}: VideoRoomProps) {
  const [status, setStatus] = useState<VideoSessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [actioning, setActioning] = useState(false);

  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const maxDurationRef = useRef<number | undefined>(undefined);
  const durationWarning = useDurationWarning(
    status?.startedAt ?? null,
    maxDurationRef.current,
    isInCall
  );

  const fetchStatus = useCallback(async (silent = true) => {
    try {
      const s = await apiGetVideoStatus(userId, roomId);
      setStatus(s);
      if (s.livekitUrl) setLivekitUrl(s.livekitUrl);
      if (!s.videoActive && isInCall) {
        setIsInCall(false);
        setToken(null);
        setExpanded(false);
      }
    } catch { /* non-fatal */ } finally {
      if (!silent) setLoading(false);
    }
  }, [userId, roomId, isInCall]);

  useEffect(() => { fetchStatus(false); }, [fetchStatus]);

  useEffect(() => {
    if (isInCall) return;
    const id = setInterval(() => fetchStatus(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isInCall, fetchStatus]);

  const handleStart = async () => {
    setActioning(true);
    setActionError('');
    try {
      await apiStartVideo(userId, roomId);
      const { token: t, livekitUrl: url } = await apiGetVideoToken(userId, roomId);
      setToken(t);
      setLivekitUrl(url);
      setIsInCall(true);
      await fetchStatus(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setActionError(
        msg.includes('not configured')
          ? 'Live gathering is not available. Contact your church administrator.'
          : msg.includes('authorised')
          ? "You don't have permission to start a gathering for this Room."
          : "We couldn't start the gathering. Please try again."
      );
    } finally {
      setActioning(false);
    }
  };

  const handleJoin = async () => {
    setActioning(true);
    setActionError('');
    try {
      const { token: t, livekitUrl: url } = await apiGetVideoToken(userId, roomId);
      setToken(t);
      setLivekitUrl(url);
      setIsInCall(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      setActionError(
        msg.includes('No active') ? 'The gathering has ended.'
          : "We couldn't connect. Please try again."
      );
    } finally {
      setActioning(false);
    }
  };

  const handleLeave = () => {
    setIsInCall(false);
    setToken(null);
    setExpanded(false);
  };

  const handleEnd = async () => {
    setActioning(true);
    setActionError('');
    try {
      setIsInCall(false);
      setToken(null);
      setExpanded(false);
      await apiEndVideo(userId, roomId);
      await fetchStatus(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to end the gathering.');
    } finally {
      setActioning(false);
    }
  };

  // ── Guards ──────────────────────────────────────────────────────────────────

  if (!videoEligible) return null;

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card px-5 py-6 flex items-center gap-3">
        <Loader2 size={18} className="animate-spin text-muted-foreground shrink-0" />
        <span className="text-[14px] text-muted-foreground">Checking gathering status…</span>
      </div>
    );
  }

  if (!status) return null;

  // ── Not configured (admin-only notice) ─────────────────────────────────────

  if (!status.configured) {
    if (!status.canHost) return null;
    return (
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-5">
        <div className="flex items-start gap-3">
          <Settings size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-[14px] font-medium text-amber-900 dark:text-amber-200 mb-1">
              Live gathering not configured
            </p>
            <p className="text-[13px] text-amber-700 dark:text-amber-300 leading-relaxed">
              {status.message ?? 'Contact your church administrator to enable live gatherings.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Disabled by church ──────────────────────────────────────────────────────

  if (!status.videoEnabled) {
    if (!status.canHost) return null;
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-5 py-4">
        <p className="text-[13px] text-muted-foreground">
          Live gathering is disabled. Enable it in{' '}
          <span className="font-medium">Settings → Rooms &amp; Video</span>.
        </p>
      </div>
    );
  }

  // ── Connected — embedded video card ────────────────────────────────────────

  if (isInCall && token && livekitUrl) {
    return (
      <div
        className={
          expanded
            ? 'fixed inset-0 z-50 bg-gray-950 flex flex-col'
            : 'rounded-2xl border border-primary/30 bg-card overflow-hidden'
        }
      >
        {/* Header bar */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${
          expanded ? 'border-white/10' : 'border-border/60 bg-primary/5'
        }`}>
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className={`text-[14px] font-semibold ${expanded ? 'text-white' : 'text-foreground'}`}>
              Live Video
            </span>
          </div>
          <Button
            size="sm"
            variant={expanded ? 'secondary' : 'ghost'}
            className={`h-8 rounded-lg text-[12px] gap-1.5 ${expanded ? 'bg-white/10 text-white hover:bg-white/20' : ''}`}
            onClick={() => setExpanded(e => !e)}
          >
            {expanded ? <><Minimize2 size={12} /> Collapse</> : <><Maximize2 size={12} /> Expand</>}
          </Button>
        </div>

        {/* Duration warning */}
        {durationWarning && (
          <div className={`px-5 py-2 border-b text-[12px] ${
            expanded
              ? 'bg-amber-900/30 border-amber-700 text-amber-300'
              : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 text-amber-700 dark:text-amber-300'
          }`}>
            {durationWarning}
          </div>
        )}

        {/* LiveKit stays mounted through expand/collapse */}
        <div className={expanded ? 'flex-1 px-4 py-4 overflow-y-auto' : 'px-4 py-4'}>
          <LiveKitRoom
            serverUrl={livekitUrl}
            token={token}
            connect={true}
            audio={true}
            video={true}
            onDisconnected={handleLeave}
            onError={(err) => {
              const msg = err.message?.toLowerCase() ?? '';
              setActionError(
                msg.includes('permission') || msg.includes('denied')
                  ? 'Camera or microphone access was denied. Check your browser permissions.'
                  : msg.includes('network') || msg.includes('ice')
                  ? 'Connection lost. Check your internet connection and try rejoining.'
                  : "We couldn't connect. Try again."
              );
              handleLeave();
            }}
            data-lk-theme="default"
            style={{ background: 'transparent' }}
          >
            <RoomAudioRenderer />
            <ParticipantGrid
              onLeave={handleLeave}
              canHost={status.canHost ?? false}
              onEnd={handleEnd}
              ending={actioning}
            />
          </LiveKitRoom>
        </div>

        {actionError && (
          <div className={`mx-4 mb-4 flex items-start gap-2 rounded-xl px-4 py-3 ${
            expanded ? 'bg-red-900/40' : 'bg-destructive/10'
          }`}>
            <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-[12px] text-destructive">{actionError}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Lobby ───────────────────────────────────────────────────────────────────

  const { videoActive, canHost } = status;
  const gathererName = leaderName || 'Your leader';

  // No video active — Meeting Tools handles Start when hideStart is true
  if (!videoActive) {
    if (!canHost || hideStart) return null;
    // Fallback: leader CTA when VideoRoom is used standalone (not from Meeting Tools)
    return (
      <div className="space-y-2">
        <button
          onClick={handleStart}
          disabled={actioning}
          className="w-full text-left p-5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 transition-colors"
        >
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              {actioning
                ? <Loader2 size={20} className="text-white animate-spin" />
                : <span className="text-[20px]">🟢</span>
              }
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-semibold text-white">Start Live Video</div>
              <div className="text-[13px] text-white/80 mt-0.5">
                Start a live video session with your group.
              </div>
            </div>
          </div>
        </button>
        {actionError && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3">
            <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-[12px] text-destructive">{actionError}</p>
          </div>
        )}
      </div>
    );
  }

  // Video active — lobby card (not yet joined)
  return (
    <div className="space-y-2">
      <div className="rounded-2xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 overflow-hidden">
        <div className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <p className="text-[15px] font-semibold text-emerald-900 dark:text-emerald-200">
              {gathererName} has started the live meeting
            </p>
          </div>
          <Button
            className="w-full h-12 rounded-xl text-[16px] bg-emerald-600 hover:bg-emerald-700"
            onClick={handleJoin}
            disabled={actioning}
          >
            {actioning ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            Join Live Video
          </Button>
        </div>
      </div>
      {actionError && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3">
          <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
          <p className="text-[12px] text-destructive">{actionError}</p>
        </div>
      )}
    </div>
  );
}
