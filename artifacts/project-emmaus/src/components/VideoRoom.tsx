/**
 * VideoRoom.tsx — Embedded LiveKit video experience for Emmaus Rooms.
 *
 * Renders a compact video panel inside RoomDetail. Never replaces the page.
 * Mobile-first: tiles adapt to portrait, controls stay above the bottom nav.
 *
 * Expand/collapse works by switching the outer container between an inline card
 * and a fixed overlay via className — LiveKitRoom stays mounted throughout so
 * the connection is never dropped.
 *
 * Permission model (enforced server-side; UI mirrors it):
 *  - canHost: room admin with authorised pastoral/app role → sees Start/End buttons
 *  - Any member: sees Join/Leave once a session is active
 *  - Personal rooms pass videoEligible=false → component renders null
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
  Video, PhoneOff, AlertCircle, Loader2, Users, Settings,
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
  /** Display name for this user in the video session */
  displayName: string;
  /** Whether this Room type supports video (ministry / leadership / church_service).
   *  Personal rooms pass false — component renders null immediately. */
  videoEligible: boolean;
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
        setWarning(`Meeting ends in ${Math.ceil(remaining)} min.`);
      } else if (remaining <= 0) {
        setWarning('Meeting time limit reached.');
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

// ─── Participant grid ─────────────────────────────────────────────────────────
// Rendered inside <LiveKitRoom> so it can access LiveKit context hooks.

function ParticipantGrid({ onLeave }: { onLeave: () => void }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const cameraTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false }
  );

  const allParticipants = [localParticipant, ...remoteParticipants].filter(Boolean);

  return (
    <div className="space-y-3">
      {/* Participant count */}
      <div className="flex items-center gap-2 px-1">
        <Users size={13} className="text-muted-foreground" />
        <span className="text-[12px] text-muted-foreground">
          {allParticipants.length} in call
        </span>
      </div>

      {/* Tiles — 1 col on mobile, 2 col when ≥2 participants */}
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

      {/* Media controls (camera + mic only; no screenshare, no chat) */}
      <div className="pt-1">
        <ControlBar
          controls={{
            camera: true,
            microphone: true,
            screenShare: false,
            leave: false,   // we render our own Leave button
            chat: false,
          }}
          style={{ background: 'transparent', padding: 0, justifyContent: 'center' }}
        />
      </div>

      {/* Leave Video (does NOT leave the Emmaus Room) */}
      <Button
        variant="destructive"
        size="sm"
        className="w-full rounded-xl h-10 mt-1"
        onClick={onLeave}
      >
        <PhoneOff size={15} className="mr-2" />
        Leave Video
      </Button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000; // when not in call, poll every 10 s for status changes

export function VideoRoom({ roomId, userId, displayName, videoEligible }: VideoRoomProps) {
  const [status, setStatus] = useState<VideoSessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [actioning, setActioning] = useState(false);

  // Active call state
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [isInCall, setIsInCall] = useState(false);

  // Expand/collapse — uses CSS class switching so LiveKitRoom stays mounted
  const [expanded, setExpanded] = useState(false);

  // Duration warning
  const maxDurationRef = useRef<number | undefined>(undefined);
  const durationWarning = useDurationWarning(
    status?.startedAt ?? null,
    maxDurationRef.current,
    isInCall
  );

  // ── Status polling ──────────────────────────────────────────────────────────

  const fetchStatus = useCallback(async (silent = true) => {
    try {
      const s = await apiGetVideoStatus(userId, roomId);
      setStatus(s);
      if (s.livekitUrl) setLivekitUrl(s.livekitUrl);
      // If the session was ended by the leader while we were in call, clean up
      if (!s.videoActive && isInCall) {
        setIsInCall(false);
        setToken(null);
        setExpanded(false);
      }
    } catch {
      /* non-fatal — keep previous status */
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userId, roomId, isInCall]);

  useEffect(() => {
    fetchStatus(false); // initial load (shows spinner)
  }, [fetchStatus]);

  // Poll while not in call — catches "leader started video" for waiting members
  useEffect(() => {
    if (isInCall) return; // LiveKit events handle disconnect; no polling needed
    const id = setInterval(() => fetchStatus(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isInCall, fetchStatus]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    setActioning(true);
    setActionError('');
    try {
      await apiStartVideo(userId, roomId);
      // Immediately join as the leader who started the session
      const { token: t, livekitUrl: url } = await apiGetVideoToken(userId, roomId);
      setToken(t);
      setLivekitUrl(url);
      setIsInCall(true);
      await fetchStatus(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start video.';
      setActionError(
        msg.includes('not configured')
          ? 'Live video is not available. Contact your church administrator.'
          : msg.includes('authorised')
          ? "You don't have permission to start video for this Room."
          : "We couldn't start the video session. Please try again."
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
      const msg = err instanceof Error ? err.message : 'Failed to join video.';
      setActionError(
        msg.includes('No active')
          ? 'The video session has ended.'
          : msg.includes('permission')
          ? "You don't have permission to join this Room's video."
          : "We couldn't connect your video. Try again."
      );
    } finally {
      setActioning(false);
    }
  };

  /** Leave video — stays in the Emmaus Room. */
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
      const msg = err instanceof Error ? err.message : 'Failed to end the session.';
      setActionError(msg);
    } finally {
      setActioning(false);
    }
  };

  // ── Render guards ───────────────────────────────────────────────────────────

  // Personal rooms are not video-eligible — render nothing
  if (!videoEligible) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-5 py-4 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-[13px]">Loading video status…</span>
      </div>
    );
  }

  if (!status) return null;

  // ── LiveKit not configured ──────────────────────────────────────────────────

  if (!status.configured) {
    // Only admins / leaders see the setup card — members see nothing
    if (!status.canHost) return null;
    return (
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Settings size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-1.5">
            <p className="text-[14px] font-medium text-amber-900 dark:text-amber-200">
              Live video not configured
            </p>
            <p className="text-[13px] text-amber-700 dark:text-amber-300 leading-relaxed">
              {status.message ?? 'Add LiveKit credentials to Replit Secrets to enable video Rooms.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Video not enabled by the church ────────────────────────────────────────

  if (!status.videoEnabled) {
    if (!status.canHost) return null;
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-5 py-4">
        <p className="text-[13px] text-muted-foreground">
          Video Rooms are disabled. Enable them in{' '}
          <span className="font-medium">Settings → Rooms & Video</span>.
        </p>
      </div>
    );
  }

  // ── Active call ─────────────────────────────────────────────────────────────
  //
  // The outer container switches between an inline card and a fixed overlay via
  // className — LiveKitRoom stays mounted throughout so the connection is
  // never dropped when the user expands or collapses.

  if (isInCall && token && livekitUrl) {
    return (
      <div
        className={
          expanded
            ? 'fixed inset-0 z-50 bg-gray-950 flex flex-col'
            : 'rounded-2xl border border-primary/30 bg-card overflow-hidden'
        }
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-3.5 border-b ${
            expanded
              ? 'border-white/10'
              : 'border-border/60 bg-primary/5'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <span className={`text-[14px] font-semibold ${expanded ? 'text-white' : 'text-foreground'}`}>
              Live
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Expand / Return to Study */}
            <Button
              size="sm"
              variant={expanded ? 'secondary' : 'ghost'}
              className={`h-8 rounded-lg text-[12px] gap-1.5 ${expanded ? 'bg-white/10 text-white hover:bg-white/20' : ''}`}
              onClick={() => setExpanded(e => !e)}
            >
              {expanded ? (
                <>
                  <Minimize2 size={12} />
                  Return to Study
                </>
              ) : (
                <>
                  <Maximize2 size={12} />
                  Expand
                </>
              )}
            </Button>

            {/* End Meeting (host only) */}
            {status.canHost && (
              <Button
                size="sm"
                variant="destructive"
                className="h-8 rounded-lg text-[12px]"
                onClick={handleEnd}
                disabled={actioning}
              >
                {actioning ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                End Meeting
              </Button>
            )}
          </div>
        </div>

        {/* Duration warning */}
        {durationWarning && (
          <div className={`px-5 py-2 border-b ${expanded ? 'bg-amber-900/30 border-amber-700' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200'}`}>
            <p className={`text-[12px] ${expanded ? 'text-amber-300' : 'text-amber-700 dark:text-amber-300'}`}>
              {durationWarning}
            </p>
          </div>
        )}

        {/* LiveKit area — stays mounted regardless of expanded state */}
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
                  : "We couldn't connect your video. Try again."
              );
              handleLeave();
            }}
            data-lk-theme="default"
            style={{ background: 'transparent' }}
          >
            <RoomAudioRenderer />
            <ParticipantGrid onLeave={handleLeave} />
          </LiveKitRoom>
        </div>

        {/* Error (shown below video area) */}
        {actionError && (
          <div className={`mx-4 mb-4 flex items-start gap-2 rounded-xl px-4 py-3 ${
            expanded ? 'bg-red-900/40' : 'bg-destructive/10'
          }`}>
            <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-[12px] text-destructive leading-relaxed">{actionError}</p>
          </div>
        )}
      </div>
    );
  }

  // ── Lobby — not yet in call ─────────────────────────────────────────────────

  const { videoActive, canHost } = status;

  return (
    <div className="rounded-2xl border border-border overflow-hidden bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            videoActive ? 'bg-red-100 dark:bg-red-950' : 'bg-muted'
          }`}>
            <Video size={15} className={videoActive ? 'text-red-600' : 'text-muted-foreground'} />
          </div>
          <div>
            <div className="text-[14px] font-semibold text-foreground">
              {videoActive ? 'Video Live' : 'Video'}
            </div>
            {videoActive && (
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] text-red-600 font-medium">Live now</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* No active session — leader can start */}
          {!videoActive && canHost && (
            <Button
              size="sm"
              className="h-9 rounded-xl text-[13px] px-4"
              onClick={handleStart}
              disabled={actioning}
            >
              {actioning ? (
                <Loader2 size={13} className="animate-spin mr-1.5" />
              ) : (
                <Video size={13} className="mr-1.5" />
              )}
              Start Video
            </Button>
          )}

          {/* Active session — member can join */}
          {videoActive && !isInCall && (
            <Button
              size="sm"
              className="h-9 rounded-xl text-[13px] px-4"
              onClick={handleJoin}
              disabled={actioning}
            >
              {actioning ? (
                <Loader2 size={13} className="animate-spin mr-1.5" />
              ) : (
                <Video size={13} className="mr-1.5" />
              )}
              Join Video
            </Button>
          )}

          {/* Active session — host can end without joining */}
          {videoActive && canHost && !isInCall && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9 rounded-xl text-[12px] text-muted-foreground"
              onClick={handleEnd}
              disabled={actioning}
            >
              End
            </Button>
          )}
        </div>
      </div>

      {/* Body text */}
      <div className="px-5 py-4 space-y-3">
        {!videoActive && !canHost && (
          <p className="text-[13px] text-muted-foreground">
            Video has not started yet.
          </p>
        )}

        {!videoActive && canHost && (
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Start a live video session for this Room. Members will be able to join with one tap.
          </p>
        )}

        {videoActive && !isInCall && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <p className="text-[13px]">
              A live session is active. Tap{' '}
              <span className="font-medium text-foreground">Join Video</span>{' '}
              to connect.
            </p>
          </div>
        )}

        {/* Error */}
        {actionError && (
          <div className="flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3">
            <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-[12px] text-destructive leading-relaxed">{actionError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
