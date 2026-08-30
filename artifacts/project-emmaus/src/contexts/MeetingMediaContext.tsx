import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useConnectionState, useLocalParticipant } from '@livekit/components-react';
import { ConnectionState, ParticipantEvent } from 'livekit-client';
import { Hand, Mic, MicOff, PhoneOff, Video, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { VideoSessionStatus } from '@/lib/rooms-types';
import { apiEndVideo, apiGetVideoStatus, apiGetVideoToken, apiStartVideo } from '@/lib/rooms-api';

export type MeetingMode = 'audio' | 'video';
export type DeviceIntent = { microphone: boolean; camera: boolean; listenOnly: boolean; microphoneId?: string; cameraId?: string };
type MeetingIdentity = { roomId: string; userId: string; displayName: string; mode: MeetingMode; hasJoinedMeeting?: boolean };
type MeetingMedia = {
  identity: MeetingIdentity | null; status: VideoSessionStatus | null; loading: boolean; error: string;
  connected: boolean; prejoin: boolean; intent: DeviceIntent;
  configure: (identity: MeetingIdentity) => void; start: () => Promise<void>; openJoin: () => void;
  join: (intent: DeviceIntent) => Promise<void>; closePrejoin: () => void; leave: () => void; end: () => Promise<void>;
};
const MeetingMediaContext = createContext<MeetingMedia | null>(null);
export const useMeetingMedia = () => {
  const value = useContext(MeetingMediaContext);
  if (!value) throw new Error('useMeetingMedia must be used inside MeetingMediaProvider');
  return value;
};

const emptyIntent: DeviceIntent = { microphone: true, camera: false, listenOnly: false };

function Dock({ leave, mode, intent, setIntent, setError }: { leave: () => void; mode: MeetingMode; intent: DeviceIntent; setIntent: (intent: DeviceIntent) => void; setError: (v: string) => void }) {
  const { localParticipant } = useLocalParticipant();
  const connection = useConnectionState();
  const [, force] = useState(0);
  const [busy, setBusy] = useState(false);
  const [raised, setRaised] = useState(false);
  useEffect(() => {
    const update = () => force(v => v + 1);
    localParticipant.on(ParticipantEvent.TrackMuted, update);
    localParticipant.on(ParticipantEvent.TrackUnmuted, update);
    localParticipant.on(ParticipantEvent.LocalTrackPublished, update);
    localParticipant.on(ParticipantEvent.LocalTrackUnpublished, update);
    return () => {
      localParticipant.off(ParticipantEvent.TrackMuted, update);
      localParticipant.off(ParticipantEvent.TrackUnmuted, update);
      localParticipant.off(ParticipantEvent.LocalTrackPublished, update);
      localParticipant.off(ParticipantEvent.LocalTrackUnpublished, update);
    };
  }, [localParticipant]);
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
  return <div data-meeting-dock="true" className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[70] border-t border-border bg-card/95 p-2 backdrop-blur">
    <div className={`mx-auto grid w-full max-w-lg gap-2 ${mode === 'video' ? 'grid-cols-4' : 'grid-cols-3'}`} role="toolbar" aria-label="Meeting controls">
      {intent.listenOnly ? <Button className="min-h-11 min-w-0 px-2 text-xs sm:text-sm" variant="outline" disabled={busy || !connected} onClick={() => void action('mic')} aria-label="Join microphone"><Mic size={16} className="mr-1 shrink-0" /><span className="truncate">Join mic</span></Button> :
        <Button className="min-h-11 min-w-0 px-2 text-xs sm:text-sm" variant="outline" disabled={busy || !connected} onClick={() => void action('mic')} aria-label={localParticipant.isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}>{localParticipant.isMicrophoneEnabled ? <Mic size={16} className="mr-1 shrink-0" /> : <MicOff size={16} className="mr-1 shrink-0" />}<span className="truncate">{localParticipant.isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span></Button>}
      {mode === 'video' && <Button className="min-h-11 min-w-0 px-2 text-xs sm:text-sm" variant="outline" disabled={busy || !connected} onClick={() => void action('camera')} aria-label={localParticipant.isCameraEnabled ? 'Turn camera off' : 'Turn camera on'}>{localParticipant.isCameraEnabled ? <Video size={16} className="mr-1 shrink-0" /> : <VideoOff size={16} className="mr-1 shrink-0" />}<span className="truncate">{localParticipant.isCameraEnabled ? 'Camera off' : 'Camera on'}</span></Button>}
      <Button className="min-h-11 min-w-0 px-2 text-xs sm:text-sm" variant="outline" onClick={() => void toggleHand()} aria-label={raised ? 'Lower hand' : 'Raise hand'}><Hand size={16} className="mr-1 shrink-0" /><span className="truncate">{raised ? 'Lower hand' : 'Raise hand'}</span></Button>
      <Button className="min-h-11 min-w-0 px-2 text-xs sm:text-sm" variant="destructive" onClick={leave} aria-label="Leave meeting"><PhoneOff size={16} className="mr-1 shrink-0" /><span className="truncate">Leave</span></Button>
    </div>
  </div>;
}

export function MeetingMediaProvider({ children }: { children: React.ReactNode }) {
  const [identity, setIdentity] = useState<MeetingIdentity | null>(null);
  const [status, setStatus] = useState<VideoSessionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [prejoin, setPrejoin] = useState(false);
  const [intent, setIntent] = useState<DeviceIntent>(emptyIntent);
  const connected = Boolean(token && url);
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
  const join = async (next: DeviceIntent) => {
    try {
      const i = requireIdentity(); setError('');
      const result = await apiGetVideoToken(i.userId, i.roomId);
      setIntent(next); setToken(result.token); setUrl(result.livekitUrl); setPrejoin(false);
    } catch (e) { setError(e instanceof Error ? e.message : "We couldn't connect. Please try again."); }
  };
  const leave = () => { setToken(null); setUrl(null); setPrejoin(false); };
  const end = async () => {
    try { const i = requireIdentity(); leave(); await apiEndVideo(i.userId, i.roomId); await refresh(i); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to end the gathering.'); }
  };
  useEffect(() => { document.body.dataset.meetingUi = connected || prejoin ? 'present' : ''; return () => { delete document.body.dataset.meetingUi; }; }, [connected, prejoin]);
  const value = useMemo(() => ({ identity, status, loading, error, connected, prejoin, intent, configure, start, openJoin: () => setPrejoin(true), join, closePrejoin: () => setPrejoin(false), leave, end }), [identity, status, loading, error, connected, prejoin, intent, configure]);
  const shell = <MeetingMediaContext.Provider value={value}>{children}</MeetingMediaContext.Provider>;
  if (!connected || !token || !url || !identity) return shell;
  return <LiveKitRoom serverUrl={url} token={token} connect audio={intent.microphone && !intent.listenOnly ? { deviceId: intent.microphoneId } : false} video={identity.mode === 'video' && intent.camera && !intent.listenOnly ? { deviceId: intent.cameraId } : false} onError={() => setError('Connection or device access failed. Check your browser permissions and try again.')}>
    <MeetingMediaContext.Provider value={value}>{children}<RoomAudioRenderer /><Dock leave={leave} mode={identity.mode} intent={intent} setIntent={setIntent} setError={setError} /></MeetingMediaContext.Provider>
  </LiveKitRoom>;
}