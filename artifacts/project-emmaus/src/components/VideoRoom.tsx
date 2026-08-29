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
} from '@livekit/components-react';
import '@livekit/components-styles';
import { ConnectionState, Track } from 'livekit-client';
import {
  AlertCircle, Loader2, Users, Settings,
  Maximize2, Minimize2, Hand,
  Mic, MicOff, Video, VideoOff, PhoneOff, Wifi, Wrench,
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
  const [error, setError] = useState('');

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
      setError('');
    } catch {
      setRaised(!next);
      setError('Your hand signal was not sent. Please try again after reconnecting.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="space-y-1">
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
    {error && <p role="alert" className="text-center text-[11px] text-destructive">{error}</p>}
    </div>
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

type DeviceIntent = {
  microphone: boolean;
  camera: boolean;
  listenOnly: boolean;
  microphoneId?: string;
  cameraId?: string;
};

const defaultIntent: DeviceIntent = { microphone: true, camera: true, listenOnly: false };

/**
 * Permissions are requested only from this explicit user gesture. Keeping this
 * outside LiveKitRoom prevents a token request or a reconnect from surprising
 * somebody with a browser permission prompt.
 */
function PrejoinCheck({ mode, initialIntent, onJoin, onCancel }: {
  mode: 'audio' | 'video';
  initialIntent?: DeviceIntent;
  onJoin: (intent: DeviceIntent) => void;
  onCancel: () => void;
}) {
  const [intent, setIntent] = useState<DeviceIntent>(initialIntent ?? {
    ...defaultIntent,
    camera: mode === 'video',
  });
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [micId, setMicId] = useState('');
  const [cameraId, setCameraId] = useState('');
  const [speakerId, setSpeakerId] = useState('');
  const [permissionNote, setPermissionNote] = useState('');
  const [state, setState] = useState<'ready' | 'checking' | 'granted' | 'blocked' | 'unavailable'>('ready');
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState(0);
  const previewRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopPreview = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    analyserRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (previewRef.current) previewRef.current.srcObject = null;
  }, []);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    const next = await navigator.mediaDevices.enumerateDevices();
    setDevices(next.filter(d => d.kind === 'audioinput' || d.kind === 'videoinput' || d.kind === 'audiooutput'));
    if (navigator.permissions?.query) {
      const [mic, camera] = await Promise.all([
        navigator.permissions.query({ name: 'microphone' as PermissionName }).catch(() => null),
        navigator.permissions.query({ name: 'camera' as PermissionName }).catch(() => null),
      ]);
      setPermissionNote(`Microphone: ${mic?.state ?? 'not reported'} · Camera: ${camera?.state ?? 'not reported'}`);
    }
  }, []);

  const check = useCallback(async () => {
    stopPreview();
    if (intent.listenOnly || (!intent.microphone && !intent.camera)) {
      setState('granted');
      setMessage('Listening only — no microphone or camera will be shared.');
      void refreshDevices();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('unavailable');
      setMessage('This browser does not support microphone or camera access. You can still join as a listener.');
      return;
    }
    setState('checking');
    setMessage('Checking your devices…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: intent.microphone ? (micId ? { deviceId: { exact: micId } } : true) : false,
        video: intent.camera ? (cameraId ? { deviceId: { exact: cameraId } } : true) : false,
      });
      streamRef.current = stream;
      if (previewRef.current) previewRef.current.srcObject = stream;
      if (intent.microphone) {
        const context = new AudioContext();
        audioContextRef.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
        const meter = () => {
          const data = new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(data);
          setLevel(Math.min(100, Math.round(data.reduce((sum, value) => sum + value, 0) / data.length * 1.8)));
          rafRef.current = requestAnimationFrame(meter);
        };
        meter();
      }
      await refreshDevices();
      setState('granted');
      setMessage('Your device check is complete.');
    } catch (error) {
      const name = error instanceof DOMException ? error.name : '';
      setState(name === 'NotFoundError' ? 'unavailable' : 'blocked');
      setMessage(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? 'Browser access is blocked. Allow microphone/camera for this site in browser settings, then try again.'
          : 'We could not use that device. Check that it is connected and not in use by another app.',
      );
    }
  }, [cameraId, intent, micId, refreshDevices, stopPreview]);

  useEffect(() => {
    const recheck = () => { if (document.visibilityState === 'visible') void refreshDevices(); };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
      stopPreview();
    };
  }, [refreshDevices, stopPreview]);

  const continueJoin = () => {
    if (!intent.microphone && !intent.listenOnly) {
      setState('blocked');
      setMessage('Turn on your microphone, or choose Listen only to join without one.');
      return;
    }
    stopPreview();
    onJoin({ ...intent, microphoneId: micId || undefined, cameraId: cameraId || undefined });
  };
  const microphones = devices.filter(d => d.kind === 'audioinput');
  const cameras = devices.filter(d => d.kind === 'videoinput');
  const speakers = devices.filter(d => d.kind === 'audiooutput');
  const speakerSupported = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  const chooseSpeaker = async (id: string) => {
    setSpeakerId(id);
    if (!speakerSupported) return;
    await Promise.all(Array.from(document.querySelectorAll('audio')).map(audio =>
      (audio as HTMLAudioElement & { setSinkId?: (deviceId: string) => Promise<void> }).setSinkId?.(id),
    ));
  };
  return (
    <div className="rounded-2xl border border-primary/30 bg-card p-5 space-y-4">
      <div>
        <p className="text-[16px] font-semibold">Check your devices</p>
        <p className="text-[13px] text-muted-foreground mt-1">Choose how you want to join before connecting to the gathering.</p>
      </div>
      <div className="flex gap-2">
        <Button variant={!intent.listenOnly && intent.microphone ? 'default' : 'outline'} size="sm" onClick={() => setIntent(v => v.microphone ? { ...v, listenOnly: true, microphone: false, camera: false } : { ...v, listenOnly: false, microphone: true })}>
          <Mic size={14} className="mr-1" /> {intent.microphone ? 'Mic on' : 'Mic off'}
        </Button>
        {mode === 'video' && <Button variant={!intent.listenOnly && intent.camera ? 'default' : 'outline'} size="sm" onClick={() => setIntent(v => ({ ...v, listenOnly: false, camera: !v.camera }))}>
          <Video size={14} className="mr-1" /> {intent.camera ? 'Camera on' : 'Camera off'}
        </Button>}
        <Button variant={intent.listenOnly ? 'default' : 'outline'} size="sm" onClick={() => setIntent(v => ({ ...v, listenOnly: true, microphone: false, camera: false }))}>Listen only</Button>
      </div>
      {!intent.listenOnly && (
        <div className="grid gap-2 sm:grid-cols-2">
          {microphones.length > 0 && <label className="text-[12px] text-muted-foreground">Microphone<select value={micId} onChange={e => setMicId(e.target.value)} className="mt-1 block w-full rounded-lg border bg-background p-2 text-foreground">{microphones.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}</select></label>}
          {intent.camera && cameras.length > 0 && <label className="text-[12px] text-muted-foreground">Camera<select value={cameraId} onChange={e => setCameraId(e.target.value)} className="mt-1 block w-full rounded-lg border bg-background p-2 text-foreground">{cameras.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}</select></label>}
          {speakerSupported && speakers.length > 0 && <label className="text-[12px] text-muted-foreground">Speaker<select value={speakerId} onChange={e => void chooseSpeaker(e.target.value)} className="mt-1 block w-full rounded-lg border bg-background p-2 text-foreground">{speakers.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Speaker'}</option>)}</select></label>}
        </div>
      )}
      {intent.camera && !intent.listenOnly && <video ref={previewRef} muted playsInline autoPlay className="w-full max-h-44 rounded-xl bg-muted object-contain" aria-label="Camera preview" />}
      {intent.microphone && !intent.listenOnly && <div><div className="flex justify-between text-[12px] text-muted-foreground"><span>Microphone level</span><span>{state === 'granted' ? 'Receiving sound' : 'Not checked'}</span></div><div className="mt-1 h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${level}%` }} /></div></div>}
      {message && <p role="status" className={`text-[12px] ${state === 'blocked' || state === 'unavailable' ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p>}
      {permissionNote && <p className="text-[11px] text-muted-foreground">{permissionNote}</p>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button variant="outline" disabled={state === 'checking'} onClick={() => void check()}>{state === 'checking' ? <Loader2 size={14} className="animate-spin mr-1" /> : <Wrench size={14} className="mr-1" />}Check devices</Button>
        <Button className="ml-auto" disabled={state !== 'granted'} onClick={continueJoin}>Join gathering</Button>
      </div>
    </div>
  );
}

function MeetingDock({ mode, canHost, onLeave, onEnd, ending, onTroubleshoot }: {
  mode: 'audio' | 'video';
  canHost: boolean;
  onLeave: () => void;
  onEnd: () => void;
  ending: boolean;
  onTroubleshoot: () => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const connectionState = useConnectionState();
  const [busy, setBusy] = useState(false);
  const [publishError, setPublishError] = useState('');
  const connected = connectionState === ConnectionState.Connected;
  const toggleMic = async () => {
    setBusy(true);
    try { await localParticipant.setMicrophoneEnabled(!localParticipant.isMicrophoneEnabled); setPublishError(''); }
    catch { setPublishError('Microphone change was not published. Reopen Devices and check browser permission.'); }
    finally { setBusy(false); }
  };
  const toggleCamera = async () => {
    setBusy(true);
    try { await localParticipant.setCameraEnabled(!localParticipant.isCameraEnabled); setPublishError(''); }
    catch { setPublishError('Camera change was not published. Reopen Devices and check browser permission.'); }
    finally { setBusy(false); }
  };
  const status = connected ? 'Connected' : connectionState === ConnectionState.Reconnecting || connectionState === ConnectionState.SignalReconnecting ? 'Reconnecting…' : 'Connecting…';
  return (
    <div className="sticky bottom-0 z-10 mt-3 rounded-xl border border-border bg-card/95 p-2 backdrop-blur flex flex-wrap items-center justify-center gap-2">
      <span className="mr-auto inline-flex items-center gap-1 px-2 text-[11px] text-muted-foreground"><Wifi size={13} className={connected ? 'text-emerald-500' : 'text-amber-500'} />{status}</span>
      <Button size="sm" variant="outline" disabled={busy || !connected} onClick={() => void toggleMic()} aria-label={localParticipant.isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}>
        {localParticipant.isMicrophoneEnabled ? <Mic size={15} /> : <MicOff size={15} />}
      </Button>
      {mode === 'video' && <Button size="sm" variant="outline" disabled={busy || !connected} onClick={() => void toggleCamera()} aria-label={localParticipant.isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}>
        {localParticipant.isCameraEnabled ? <Video size={15} /> : <VideoOff size={15} />}
      </Button>}
      <Button size="sm" variant="outline" onClick={onTroubleshoot}><Wrench size={14} className="mr-1" />Devices</Button>
      <div className="w-full"><RaiseHandControl /></div>
      <Button size="sm" variant="destructive" onClick={onLeave}><PhoneOff size={14} className="mr-1" />Leave</Button>
      {canHost && <Button size="sm" variant="destructive" disabled={ending} onClick={onEnd}>End</Button>}
      {publishError && <p role="alert" className="w-full px-2 text-[11px] text-destructive">{publishError}</p>}
    </div>
  );
}

/** Device setup rendered inside the LiveKit provider so switches affect tracks,
 * rather than reconnecting or unmounting the meeting shell. */
function InCallDeviceCheck({ mode, intent, onClose, onApplied }: {
  mode: 'audio' | 'video';
  intent: DeviceIntent;
  onClose: () => void;
  onApplied: (intent: DeviceIntent) => void;
}) {
  const { localParticipant } = useLocalParticipant();
  const apply = async (next: DeviceIntent) => {
    try {
      if (next.listenOnly) {
        await localParticipant.setMicrophoneEnabled(false);
        if (mode === 'video') await localParticipant.setCameraEnabled(false);
      } else {
        await localParticipant.setMicrophoneEnabled(next.microphone, next.microphoneId ? { deviceId: next.microphoneId } : undefined);
        if (mode === 'video') await localParticipant.setCameraEnabled(next.camera, next.cameraId ? { deviceId: next.cameraId } : undefined);
      }
      onApplied(next);
      onClose();
    } catch {
      // PrejoinCheck keeps its clear device/permission recovery message visible.
    }
  };
  return (
    <div className="absolute inset-0 z-30 overflow-y-auto bg-background/95 p-4 backdrop-blur">
      <div className="mx-auto max-w-lg">
        <PrejoinCheck mode={mode} initialIntent={intent} onJoin={next => void apply(next)} onCancel={onClose} />
      </div>
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
  const [showPrejoin, setShowPrejoin] = useState(false);
  const [deviceIntent, setDeviceIntent] = useState<DeviceIntent>(defaultIntent);

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
      setShowPrejoin(true);
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

  const handleJoin = () => {
    if (hasJoinedMeeting === false) {
      setActionError('Join the meeting first, then join Live Audio.');
      return;
    }
    setActionError('');
    setShowPrejoin(true);
  };

  const completePrejoin = async (intent: DeviceIntent) => {
    setActioning(true);
    setActionError('');
    try {
      const { token: t, livekitUrl: url } = await apiGetVideoToken(userId, roomId);
      setToken(t);
      setLivekitUrl(url);
      setDeviceIntent(intent);
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
      setShowPrejoin(false);
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

  if (showPrejoin && !isInCall) {
    return (
      <PrejoinCheck
        mode={meetingMode}
        initialIntent={deviceIntent}
        onJoin={completePrejoin}
        onCancel={() => {
          setShowPrejoin(false);
          // Starting a gathering is server-authoritative and remains active;
          // cancelling setup merely leaves this browser in the lobby.
        }}
      />
    );
  }

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
        <div className={`${expanded ? 'flex-1 px-4 py-4 overflow-y-auto' : 'px-4 py-4'} relative`}>
          <LiveKitRoom
            serverUrl={livekitUrl}
            token={token}
            connect={true}
             audio={deviceIntent.microphone && !deviceIntent.listenOnly
               ? { deviceId: deviceIntent.microphoneId }
               : false}
             video={meetingMode === 'video' && deviceIntent.camera && !deviceIntent.listenOnly
               ? { deviceId: deviceIntent.cameraId }
               : false}
             onDisconnected={() => {
               // A disconnect may be a transient LiveKit reconnect. Retain the
               // room/token and intentions; only the explicit Leave control
               // tears down this shell.
             }}
            onError={(err) => {
              const msg = err.message?.toLowerCase() ?? '';
              setActionError(
                msg.includes('permission') || msg.includes('denied')
                   ? `${meetingMode === 'audio' ? 'Microphone' : 'Camera and microphone'} access was denied. Check your browser permissions.`
                  : msg.includes('network') || msg.includes('ice')
                  ? 'Connection lost. Check your internet connection and try rejoining.'
                  : "We couldn't connect. Try again."
              );
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
              <MeetingDock
                mode={meetingMode}
                canHost={status.canHost ?? false}
                onLeave={handleLeave}
                onEnd={handleEnd}
                ending={actioning}
                onTroubleshoot={() => setShowPrejoin(true)}
              />
              {showPrejoin && (
                <InCallDeviceCheck
                  mode={meetingMode}
                  intent={deviceIntent}
                  onClose={() => setShowPrejoin(false)}
                  onApplied={setDeviceIntent}
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
