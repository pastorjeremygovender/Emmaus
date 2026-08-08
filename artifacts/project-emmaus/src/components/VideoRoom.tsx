/**
 * VideoRoom.tsx — Embedded LiveKit video experience for Emmaus Rooms.
 *
 * Renders a compact video panel inside RoomDetail. Never replaces the page.
 * Mobile-first: tiles adapt to portrait, controls stay above the bottom nav.
 *
 * Permission model (enforced server-side; UI mirrors it):
 *  - canHost: room admin with authorised pastoral/app role → sees Start/End buttons
 *  - Any member: sees Join/Leave once a session is active
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
  Video, VideoOff, Mic, MicOff,
  PhoneOff, AlertCircle, Loader2, Users, Settings,
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
  /** Whether this Room type supports video (ministry / leadership) */
  videoEligible: boolean;
}

// ─── Duration helpers ─────────────────────────────────────────────────────────

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

// ─── Participant grid (rendered inside LiveKitRoom) ───────────────────────────

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

      {/* Tiles grid — 1 col on mobile, 2 col when ≥2 participants */}
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

      {/* Controls */}
      <div className="pt-1">
        <ControlBar
          controls={{
            camera: true,
            microphone: true,
            screenShare: false,
            leave: false,       // We render our own Leave button below
            chat: false,
          }}
          style={{ background: 'transparent', padding: 0, justifyContent: 'center' }}
        />
      </div>

      {/* Leave */}
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

const POLL_INTERVAL_MS = 10_000;

export function VideoRoom({ roomId, userId, displayName, videoEligible }: VideoRoomProps) {
  const [status, setStatus] = useState<VideoSessionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');
  const [actioning, setActioning] = useState(false);

  // Active call state
  const [token, setToken] = useState<string | null>(null);
  const [livekitUrl, setLivekitUrl] = useState<string | null>(null);
  const [isInCall, setIsInCall] = useState(false);

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
      // If video ended while we were in call, clean up
      if (!s.videoActive && isInCall) {
        setIsInCall(false);
        setToken(null);
      }
    } catch {
      /* non-fatal — keep previous status */
    } finally {
      if (!silent) setLoading(false);
    }
  }, [userId, roomId, isInCall]);

  useEffect(() => {
    fetchStatus(false);
  }, [fetchStatus]);

  // Poll while not in call (to detect when leader starts video)
  useEffect(() => {
    if (isInCall) return; // LiveKit events handle disconnect — no need to poll
    const id = setInterval(() => fetchStatus(true), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isInCall, fetchStatus]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleStart = async () => {
    setActioning(true);
    setActionError('');
    try {
      await apiStartVideo(userId, roomId);
      await fetchStatus(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to start video.');
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
      setActionError(err instanceof Error ? err.message : 'Failed to join video.');
    } finally {
      setActioning(false);
    }
  };

  const handleLeave = () => {
    setIsInCall(false);
    setToken(null);
  };

  const handleEnd = async () => {
    setActioning(true);
    setActionError('');
    try {
      setIsInCall(false);
      setToken(null);
      await apiEndVideo(userId, roomId);
      await fetchStatus(true);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Failed to end meeting.');
    } finally {
      setActioning(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-5 py-4 text-muted-foreground">
        <Loader2 size={16} className="animate-spin" />
        <span className="text-[13px]">Loading video status…</span>
      </div>
    );
  }

  if (!status) return null;

  // ── Not configured ──────────────────────────────────────────────────────────

  if (!status.configured) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/20 p-5 space-y-3">
        <div className="flex items-start gap-3">
          <Settings size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="space-y-1.5">
            <p className="text-[14px] font-medium text-amber-900 dark:text-amber-200">
              LiveKit not yet configured
            </p>
            <p className="text-[13px] text-amber-700 dark:text-amber-300 leading-relaxed">
              {status.message ?? 'Add LiveKit secrets to enable video.'}
            </p>
          </div>
        </div>
        <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 px-4 py-3 space-y-1">
          <p className="text-[12px] font-mono font-semibold text-amber-900 dark:text-amber-200">
            LIVEKIT_URL
          </p>
          <p className="text-[12px] font-mono font-semibold text-amber-900 dark:text-amber-200">
            LIVEKIT_API_KEY
          </p>
          <p className="text-[12px] font-mono font-semibold text-amber-900 dark:text-amber-200">
            LIVEKIT_API_SECRET
          </p>
        </div>
        <p className="text-[12px] text-amber-600 dark:text-amber-400">
          Sign in at{' '}
          <a
            href="https://cloud.livekit.io"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:no-underline"
          >
            cloud.livekit.io
          </a>{' '}
          → your project → Settings → Keys to obtain these values.
        </p>
      </div>
    );
  }

  // ── Video not enabled for this church ───────────────────────────────────────

  if (!status.videoEnabled) {
    if (!status.canHost) return null; // members see nothing
    return (
      <div className="rounded-2xl border border-border bg-muted/30 px-5 py-4">
        <p className="text-[13px] text-muted-foreground">
          Video Rooms are disabled. Enable them in{' '}
          <span className="font-medium">Settings → Rooms & Video</span>.
        </p>
      </div>
    );
  }

  // ── Room type not video-eligible ────────────────────────────────────────────

  if (!videoEligible) return null;

  // ── Active call (user is in LiveKit) ────────────────────────────────────────

  if (isInCall && token && livekitUrl) {
    return (
      <div className="rounded-2xl border border-primary/30 bg-card overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-primary/5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[14px] font-semibold text-foreground">Live</span>
          </div>
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

        {/* Duration warning */}
        {durationWarning && (
          <div className="px-5 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200">
            <p className="text-[12px] text-amber-700 dark:text-amber-300">{durationWarning}</p>
          </div>
        )}

        {/* LiveKit video area */}
        <div className="px-4 py-4">
          <LiveKitRoom
            serverUrl={livekitUrl}
            token={token}
            connect={true}
            audio={true}
            video={true}
            onDisconnected={handleLeave}
            onError={(err) => {
              setActionError(err.message);
              handleLeave();
            }}
            data-lk-theme="default"
            style={{ background: 'transparent' }}
          >
            <RoomAudioRenderer />
            <ParticipantGrid onLeave={handleLeave} />
          </LiveKitRoom>
        </div>
      </div>
    );
  }

  // ── Not in call — show lobby ────────────────────────────────────────────────

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
                <span className="text-[11px] text-red-600">Live</span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Not started, host */}
          {!videoActive && canHost && (
            <Button
              size="sm"
              className="h-8 rounded-lg text-[13px]"
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

          {/* Active, join */}
          {videoActive && !isInCall && (
            <Button
              size="sm"
              className="h-8 rounded-lg text-[13px] bg-primary"
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

          {/* Active, host can end even before joining */}
          {videoActive && canHost && !isInCall && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 rounded-lg text-[12px] text-muted-foreground"
              onClick={handleEnd}
              disabled={actioning}
            >
              End
            </Button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {/* Not active — member waiting */}
        {!videoActive && !canHost && (
          <p className="text-[13px] text-muted-foreground">
            Live video has not started yet.
          </p>
        )}

        {/* Not active — host idle message */}
        {!videoActive && canHost && (
          <p className="text-[13px] text-muted-foreground">
            Start a live video session for this Room. Members will be notified and can join.
          </p>
        )}

        {/* Active — waiting to join */}
        {videoActive && !isInCall && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
            <p className="text-[13px]">
              A live video session is active. Tap{' '}
              <span className="font-medium text-foreground">Join Video</span> to connect.
            </p>
          </div>
        )}

        {/* Error */}
        {actionError && (
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3">
            <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
            <p className="text-[12px] text-destructive leading-relaxed">{actionError}</p>
          </div>
        )}
      </div>
    </div>
  );
}
