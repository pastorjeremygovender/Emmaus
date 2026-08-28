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
  useConnectionState,
  ControlBar,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { ConnectionState, Track } from 'livekit-client';
import {
  AlertCircle, Loader2, Users, Settings,
  Maximize2, Minimize2, Hand,
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
  meetingMode?: 'audio' | 'video';
  /** In a Room meeting, LiveKit access requires explicit meeting attendance. */
  hasJoinedMeeting?: boolean;
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

const RAISE_HAND_ATTRIBUTE = 'emmaus.raise_hand';

type HandParticipant = {
  identity: string;
  name?: string;
  attributes: Readonly<Record<string, string>>;
};

function hasRaisedHand(participant: HandParticipant): boolean {
  return participant.attributes[RAISE_HAND_ATTRIBUTE] === 'true';
}

function RaiseHandControl() {
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const [raised, setRaised] = useState(() => hasRaisedHand(localParticipant));
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setRaised(hasRaisedHand(localParticipant));
  }, [localParticipant, localParticipant.attributes[RAISE_HAND_ATTRIBUTE]]);

  useEffect(() => {
    const connectionIsUnavailable =
      connectionState === ConnectionState.Disconnected ||
      connectionState === ConnectionState.Reconnecting ||
      connectionState === ConnectionState.SignalReconnecting;
    if (connectionIsUnavailable || connectionState !== ConnectionState.Connected) {
      // Reconnecting rooms keep their LiveKit context mounted. Do not let a
      // locally cached signal remain visible while the participant is away.
      setRaised(false);
      return;
    }

    // A reconnect can rehydrate the participant with its previous attributes.
    // The hand is transient, so make the connected session authoritative too.
    setRaised(false);
    void localParticipant.setAttributes({ [RAISE_HAND_ATTRIBUTE]: '' }).catch(() => {});
  }, [connectionState, localParticipant]);

  // The signal is scoped to this LiveKit connection. Clear it when the local
  // participant leaves so a reconnect cannot inherit a stale question state.
  useEffect(() => {
    return () => {
      void localParticipant.setAttributes({ [RAISE_HAND_ATTRIBUTE]: '' }).catch(() => {});
    };
  }, [localParticipant]);

  const toggle = async () => {
    if (updating) return;
    const next = !raised;
    setRaised(next);
    setUpdating(true);
    try {
      await localParticipant.setAttributes({
        [RAISE_HAND_ATTRIBUTE]: next ? 'true' : '',
      });
    } catch {
      setRaised(!next);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={updating}
      aria-pressed={raised}
      className={`w-full flex items-center justify-center gap-2 rounded-xl border py-2.5 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
        raised
          ? 'border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
          : 'border-border bg-card text-foreground hover:bg-muted/60'
      }`}
    >
      <Hand size={15} />
      {raised ? 'Lower hand' : 'Raise hand / ask a question'}
    </button>
  );
}

function RaisedHandsSummary({ participants }: { participants: HandParticipant[] }) {
  const raised = participants.filter(hasRaisedHand);
  if (raised.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 text-[12px] font-semibold text-amber-800 dark:text-amber-200">
        <Hand size={14} />
        <span>Questions</span>
      </div>
      <p className="mt-1 text-[12px] text-amber-700 dark:text-amber-300">
        {raised.map(participant => participant.name?.trim() || 'Member').join(', ')}{' '}
        {raised.length === 1 ? 'would like to ask a question.' : 'would like to ask questions.'}
      </p>
    </div>
  );
}

function VideoParticipantGrid({ canHost, onEnd, ending }: {
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
            {hasRaisedHand(trackRef.participant) && (
              <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-1 text-[11px] font-semibold text-amber-950 shadow-sm">
                <Hand size={12} /> Question
              </span>
            )}
          </div>
        ))}
      </div>

      <RaisedHandsSummary participants={allParticipants} />
      <RaiseHandControl />

      <div className="pt-1">
        <ControlBar
          controls={{ camera: true, microphone: true, screenShare: false, leave: false, chat: false }}
          style={{ background: 'transparent', padding: 0, justifyContent: 'center' }}
        />
      </div>

      {canHost && (
        <Button
          variant="destructive"
          size="sm"
          className="w-full rounded-xl h-10"
          onClick={onEnd}
          disabled={ending}
        >
          {ending ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
          End Gathering
        </Button>
      )}
    </div>
  );
}

function AudioParticipantGrid({ canHost, onEnd, ending }: {
  canHost: boolean;
  onEnd: () => void;
  ending: boolean;
}) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const participants = [localParticipant, ...remoteParticipants].filter(Boolean);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-1">
        <Users size={13} className="text-muted-foreground" />
        <span className="text-[12px] text-muted-foreground">
          {participants.length} in live audio
        </span>
        <span className="ml-auto text-[11px] text-emerald-600 dark:text-emerald-400">Speaker on</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {participants.map(participant => {
          const name = participant.name?.trim() || 'Member';
          const initials = name.split(/\s+/).map(word => word[0]).slice(0, 2).join('').toUpperCase();
          return (
            <div
              key={participant.identity}
              className={`relative flex items-center gap-2.5 rounded-xl border p-3 ${
                participant.isSpeaking
                  ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30'
                  : 'border-border bg-muted/30'
              }`}
            >
              <div className="w-9 h-9 rounded-full bg-primary/10 text-primary text-[12px] font-bold flex items-center justify-center shrink-0">
                {initials || 'M'}
              </div>
              <div className="min-w-0">
                <p className="text-[12px] font-semibold text-foreground truncate">{name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {participant.isSpeaking ? 'Speaking' : participant.isMicrophoneEnabled ? 'Mic on' : 'Muted'}
                </p>
              </div>
              {hasRaisedHand(participant) && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
                  <Hand size={11} /> Question
                </span>
              )}
            </div>
          );
        })}
      </div>

      <RaisedHandsSummary participants={participants} />
      <RaiseHandControl />

      <ControlBar
        controls={{ camera: false, microphone: true, screenShare: false, leave: false, chat: false }}
        style={{ background: 'transparent', padding: 0, justifyContent: 'center' }}
      />

      {canHost && (
        <Button variant="destructive" size="sm" className="w-full rounded-xl h-10" onClick={onEnd} disabled={ending}>
          {ending ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
          End Live Audio
        </Button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 10_000;

export function VideoRoom({
  roomId, userId, displayName, videoEligible, leaderName, hideStart = false,
  meetingMode = 'video',
  hasJoinedMeeting,
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
    if (hasJoinedMeeting === false) {
      setActionError(`Join the meeting first, then start Live ${meetingMode === 'audio' ? 'Audio' : 'Video'}.`);
      return;
    }
    setActioning(true);
    setActionError('');
    try {
      await apiStartVideo(userId, roomId, meetingMode);
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
    if (hasJoinedMeeting === false) {
      setActionError('Join the meeting first, then join Live Audio.');
      return;
    }
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
          : msg.includes('Join the meeting') ? 'Join the meeting first, then join Live Audio.'
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
               {meetingMode === 'audio' ? 'Live Audio' : 'Live Video'}
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
             video={meetingMode === 'video'}
            onDisconnected={handleLeave}
            onError={(err) => {
              const msg = err.message?.toLowerCase() ?? '';
              setActionError(
                msg.includes('permission') || msg.includes('denied')
                   ? `${meetingMode === 'audio' ? 'Microphone' : 'Camera and microphone'} access was denied. Check your browser permissions.`
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
             {meetingMode === 'audio' ? (
             <AudioParticipantGrid
                  canHost={status.canHost ?? false}
                  onEnd={handleEnd}
                  ending={actioning}
                />
             ) : (
                <VideoParticipantGrid
                  canHost={status.canHost ?? false}
                  onEnd={handleEnd}
                  ending={actioning}
                />
             )}
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
          disabled={actioning || hasJoinedMeeting === false}
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
                <div className="text-[17px] font-semibold text-white">
                  Start Live {meetingMode === 'audio' ? 'Audio' : 'Video'}
                </div>
              <div className="text-[13px] text-white/80 mt-0.5">
                 Start a live {meetingMode === 'audio' ? 'audio' : 'video'} session with your group.
              </div>
            </div>
          </div>
        </button>
        {hasJoinedMeeting === false && (
          <p className="text-[12px] text-center text-muted-foreground">
            Join the meeting before starting live {meetingMode}.
          </p>
        )}
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
            <div>
              <p className="text-[15px] font-semibold text-emerald-900 dark:text-emerald-200">
                 {meetingMode === 'audio' ? 'Live Audio is active' : 'Live Video is active'}
              </p>
              <p className="text-[12px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                 {gathererName} has started a live {meetingMode} session
              </p>
            </div>
          </div>
          <Button
            className="w-full h-12 rounded-xl text-[16px] bg-emerald-600 hover:bg-emerald-700"
            onClick={handleJoin}
            disabled={actioning || hasJoinedMeeting === false}
          >
            {actioning ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
            {hasJoinedMeeting === false
              ? 'Join Meeting First'
              : `Join Live ${meetingMode === 'audio' ? 'Audio' : 'Video'}`}
          </Button>
          {hasJoinedMeeting === false && (
            <p className="text-[12px] text-center text-emerald-700 dark:text-emerald-300 mt-2">
              Join the meeting above before connecting to live {meetingMode}.
            </p>
          )}
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
