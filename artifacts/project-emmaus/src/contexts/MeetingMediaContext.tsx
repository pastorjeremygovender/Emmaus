import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useConnectionState, useLocalParticipant, useRemoteParticipants } from '@livekit/components-react';
import { ConnectionState, ParticipantEvent } from 'livekit-client';
import { Hand, Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoSessionStatus } from '@/lib/rooms-types';
import { apiEndVideo, apiGetVideoStatus, apiGetVideoToken, apiStartVideo } from '@/lib/rooms-api';

export type MeetingMode = 'audio' | 'video';
export type DeviceIntent = { microphone: boolean; camera: boolean; listenOnly: boolean; microphoneId?: string; cameraId?: string };
export type MeetingJoinState = 'not_joined' | 'requesting_permission' | 'connecting' | 'joined' | 'reconnecting' | 'failed' | 'left';
type MeetingIdentity = { roomId: string; userId: string; displayName: string; mode: MeetingMode; hasJoinedMeeting?: boolean };
type MeetingMedia = {
  identity: MeetingIdentity | null; status: VideoSessionStatus | null; loading: boolean; error: string;
  connected: boolean; prejoin: boolean; intent: DeviceIntent; joinState: MeetingJoinState;
  configure: (identity: MeetingIdentity) => void; start: () => Promise<void>; openJoin: () => void;
  join: (intent: DeviceIntent, attendanceConfirmed?: boolean) => Promise<void>;
  joinMeeting: (options?: { listenOnly?: boolean; attendanceConfirmed?: boolean }) => Promise<void>;
  closePrejoin: () => void; leave: () => void; end: () => Promise<void>;
};
const MeetingMediaContext = createContext<MeetingMedia | null>(null);
export const useMeetingMedia = () => {
  const value = useContext(MeetingMediaContext);
  if (!value) throw new Error('useMeetingMedia must be used inside MeetingMediaProvider');
  return value;
};

const emptyIntent: DeviceIntent = { microphone: true, camera: false, listenOnly: false };
const DEVICE_INTENT_KEY = 'emmaus.meeting-device-intent';

function loadSavedIntent(): DeviceIntent {
  try {
    const saved = JSON.parse(localStorage.getItem(DEVICE_INTENT_KEY) || '{}') as Partial<DeviceIntent>;
    if (saved.listenOnly) return { microphone: false, camera: false, listenOnly: true };
    return { microphone: saved.microphone !== false, camera: saved.camera === true, listenOnly: false };
  } catch {
    return emptyIntent;
  }
}

function Dock({ leave, mode, intent, setIntent, setError }: { leave: () => void; mode: MeetingMode; intent: DeviceIntent; setIntent: (intent: DeviceIntent) => void; setError: (v: string) => void }) {
  const { localParticipant } = useLocalParticipant();
  const remoteParticipants = useRemoteParticipants();
  const connection = useConnectionState();
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const [raised, setRaised] = useState(false);
  const participants = [localParticipant, ...remoteParticipants];
  useEffect(() => {
    const update = () => force(v => v + 1);
    participants.forEach(participant => {
      participant.on(ParticipantEvent.TrackMuted, update);
      participant.on(ParticipantEvent.TrackUnmuted, update);
      participant.on(ParticipantEvent.AttributesChanged, update);
      participant.on(ParticipantEvent.ParticipantNameChanged, update);
    });
    localParticipant.on(ParticipantEvent.LocalTrackPublished, update);
    localParticipant.on(ParticipantEvent.LocalTrackUnpublished, update);
    return () => {
      participants.forEach(participant => {
        participant.off(ParticipantEvent.TrackMuted, update);
        participant.off(ParticipantEvent.TrackUnmuted, update);
        participant.off(ParticipantEvent.AttributesChanged, update);
        participant.off(ParticipantEvent.ParticipantNameChanged, update);
      });
      localParticipant.off(ParticipantEvent.LocalTrackPublished, update);
      localParticipant.off(ParticipantEvent.LocalTrackUnpublished, update);
    };
  }, [localParticipant, remoteParticipants]);
  const action = async (kind: 'mic' | 'camera') => {
    setBusy(true);
    try {
      if (kind === 'mic') {
        const enabled = !localParticipant.isMicrophoneEnabled;
        await localParticipant.setMicrophoneEnabled(enabled);
        setIntent({ ...intent, microphone: enabled, listenOnly: false });
      } else {
        const enabled = !localParticipant.isCameraEnabled;
        await localParticipant.setCameraEnabled(enabled);
        setIntent({ ...intent, camera: enabled, listenOnly: false });
      }
      setError('');
    } catch {
      setError(`${kind === 'mic' ? 'Microphone' : 'Camera'} access failed. Allow it in your browser settings and try again.`);
    } finally { setBusy(false); }
  };
  const toggleHand = async () => {
    try {
      const next = !raised;
      await localParticipant.setAttributes({ 'emmaus.raise_hand': next ? 'true' : '' });
      setRaised(next);
    } catch { setError('Your hand signal was not sent. Please try again after reconnecting.'); }
  };
  const connected = connection === ConnectionState.Connected;
  return <>
    <RaisedHandsIndicator localRaised={raised} participants={participants} />
    <div data-meeting-dock="true" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[70] border-t border-border bg-card/95 p-2 backdrop-blur">
      <div className={`mx-auto grid w-full max-w-lg gap-2 ${mode === 'video' ? 'grid-cols-4' : 'grid-cols-3'}`} role="toolbar" aria-label="Meeting controls">
        {intent.listenOnly ? <Button className="min-h-11 min-w-0 px-2 text-xs sm:text-sm" variant="outline" disabled={busy || !connected} onClick={() => void action('mic')} aria-label="Join microphone"><Mic size={16} className="mr-1 shrink-0" /><span className="truncate">Join mic</span></Button> :
          <Button className="min-h-11 min-w-0 px-2 text-xs sm:text-sm" variant="outline" disabled={busy || !connected} onClick={() => void action('mic')} aria-label={localParticipant.isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}>{localParticipant.isMicrophoneEnabled ? <Mic size={16} className="mr-1 shrink-0" /> : <MicOff size={16} className="mr-1 shrink-0" />}<span className="truncate">{localParticipant.isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span></Button>}
        {mode === 'video' && <Button className="min-h-11 min-w-0 px-2 text-xs sm:text-sm" variant="outline" disabled={busy || !connected} onClick={() => void action('camera')} aria-label={localParticipant.isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}>{localParticipant.isCameraEnabled ? <Video size={16} className="mr-1 shrink-0" /> : <VideoOff size={16} className="mr-1 shrink-0" />}<span className="truncate">{localParticipant.isCameraEnabled ? 'Camera off' : 'Camera on'}</span></Button>}
        <Button className="min-h-11 min-w-0 px-2 text-xs sm:text-sm" variant="outline" onClick={() => void toggleHand()} aria-label={raised ? 'Lower hand' : 'Raise hand'}><Hand size={16} className="mr-1 shrink-0" /><span className="truncate">{raised ? 'Lower hand' : 'Raise hand'}</span></Button>
        <Button className="min-h-11 min-w-0 px-2 text-xs sm:text-sm" variant="destructive" onClick={leave} aria-label="Leave meeting"><PhoneOff size={16} className="mr-1 shrink-0" /><span className="truncate">Leave</span></Button>
      </div>
    </div>
  </>;
}

function RaisedHandsIndicator({
  localRaised,
  participants,
}: {
  localRaised: boolean;
  participants: Array<{ identity: string; name?: string; attributes: Record<string, string> }>;
}) {
  const raised = participants
    .filter(participant => participant.attributes['emmaus.raise_hand'] === 'true')
    .map(participant => ({
      identity: participant.identity,
      name: participant.name?.trim() || 'Member',
    }));

  if (localRaised && !raised.some(participant => participant.identity === participants[0]?.identity)) {
    raised.unshift({ identity: participants[0]?.identity ?? 'local', name: 'You' });
  }
  if (raised.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom)+4.5rem)] z-[70] px-3 pointer-events-none"
      role="status"
      aria-live="polite"
      aria-label={`${raised.length} ${raised.length === 1 ? 'person has' : 'people have'} raised a hand`}
    >
      <div className="mx-auto flex max-w-lg items-center gap-2 rounded-xl border border-amber-300/70 bg-amber-50/95 px-3 py-2 text-[12px] font-semibold text-amber-900 shadow-lg backdrop-blur dark:border-amber-700/60 dark:bg-amber-950/95 dark:text-amber-100">
        <Hand size={16} className="shrink-0 text-amber-600 dark:text-amber-300" />
        <span className="shrink-0">{raised.length === 1 ? 'Hand raised' : 'Hands raised'}</span>
        <span className="min-w-0 truncate font-medium text-amber-800/80 dark:text-amber-200/80">
          {raised.map(participant => participant.name).join(', ')}
        </span>
      </div>
    </div>
  );
}

export function MeetingMediaProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<MeetingIdentity | null>(null);
  const [status, setStatus] = useState<VideoSessionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [prejoin, setPrejoin] = useState(false);
  const [intent, setIntent] = useState<DeviceIntent>(loadSavedIntent);
  const [joinState, setJoinState] = useState<MeetingJoinState>('not_joined');
  const joiningRef = useRef(false);
  const connected = joinState === 'joined';
  const configure = useCallback((next: MeetingIdentity) => {
    setIdentity(current => current?.roomId === next.roomId ? { ...current, ...next } : next);
  }, []);
  const refresh = useCallback(async (i = identity) => {
    if (!i) return;
    setLoading(true);
    try { setStatus(await apiGetVideoStatus(i.userId, i.roomId)); } catch { setError("We couldn't check this gathering."); } finally { setLoading(false); }
  }, [identity]);
  useEffect(() => { void refresh(); }, [refresh]);
  const requireIdentity = () => {
    if (!identity) throw new Error('Open the Room before joining a gathering.');
    if (identity.hasJoinedMeeting === false) throw new Error('Join the meeting first, then join Live Audio.');
    return identity;
  };
  const start = async () => {
    try { const i = requireIdentity(); setError(''); await apiStartVideo(i.userId, i.roomId, i.mode); await refresh(i); setPrejoin(true); }
    catch (e) { setError(e instanceof Error ? e.message : "We couldn't start the gathering. Please try again."); }
  };
  const join = async (next: DeviceIntent, attendanceConfirmed = false) => {
    if (joiningRef.current || joinState === 'connecting' || joinState === 'requesting_permission') return;
    joiningRef.current = true;
    setJoinState(next.listenOnly ? 'connecting' : 'requesting_permission');
    try {
      const i = identity;
      if (!i) throw new Error('Open the Room before joining a gathering.');
      if (i.hasJoinedMeeting === false && !attendanceConfirmed) throw new Error('Join the meeting before joining live audio or video.');
      setError('');
      setJoinState('connecting');
      const result = await apiGetVideoToken(i.userId, i.roomId);
      setIntent(next);
      localStorage.setItem(DEVICE_INTENT_KEY, JSON.stringify(next));
      setToken(result.token); setUrl(result.livekitUrl); setPrejoin(false);
    } catch (e) {
      setJoinState('failed');
      setError(e instanceof Error ? e.message : "We couldn't connect. Please try again.");
    } finally {
      joiningRef.current = false;
    }
  };
  const joinMeeting = async (options: { listenOnly?: boolean; attendanceConfirmed?: boolean } = {}) => {
    const next = options.listenOnly
      ? { microphone: false, camera: false, listenOnly: true }
      : { ...loadSavedIntent(), camera: identity?.mode === 'video' ? loadSavedIntent().camera : false };
    await join(next, options.attendanceConfirmed);
  };
  const leave = () => { setToken(null); setUrl(null); setPrejoin(false); setJoinState('left'); };
  const end = async () => {
    try { const i = requireIdentity(); leave(); await apiEndVideo(i.userId, i.roomId); await refresh(i); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to end the gathering.'); }
  };
  useEffect(() => { document.body.dataset.meetingUi = token || prejoin ? 'present' : ''; return () => { delete document.body.dataset.meetingUi; }; }, [token, prejoin]);
  const value = useMemo(() => ({ identity, status, loading, error, connected, prejoin, intent, joinState, configure, start, openJoin: () => setPrejoin(true), join, joinMeeting, closePrejoin: () => setPrejoin(false), leave, end }), [identity, status, loading, error, connected, prejoin, intent, joinState, configure]);
  const shell = <MeetingMediaContext.Provider value={value}>{children}</MeetingMediaContext.Provider>;
  if (!token || !url || !identity) return shell;
  return <LiveKitRoom
    serverUrl={url}
    token={token}
    connect
    audio={intent.microphone && !intent.listenOnly ? { deviceId: intent.microphoneId } : false}
    video={identity.mode === 'video' && intent.camera && !intent.listenOnly ? { deviceId: intent.cameraId } : false}
    onConnected={() => { setJoinState('joined'); setError(''); }}
    onDisconnected={() => { setToken(null); setUrl(null); setJoinState('left'); }}
    onError={() => { setToken(null); setUrl(null); setJoinState('failed'); setError('Microphone access or the meeting connection failed. Join listen-only, or restore microphone permission in your browser settings and retry.'); }}
  >
    <MeetingMediaContext.Provider value={value}>{children}<RoomAudioRenderer />{connected && <Dock leave={leave} mode={identity.mode} intent={intent} setIntent={setIntent} setError={setError} />}</MeetingMediaContext.Provider>
  </LiveKitRoom>;
}