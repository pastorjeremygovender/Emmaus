import { useEffect, useRef, useState } from 'react';
import { useLocalParticipant, useRemoteParticipants, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import { AlertCircle, Loader2, Users, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeviceIntent, MeetingMode, useMeetingMedia } from '@/contexts/MeetingMediaContext';

interface VideoRoomProps { roomId: string; userId: string; displayName: string; videoEligible: boolean; leaderName?: string; hideStart?: boolean; meetingMode?: MeetingMode; hasJoinedMeeting?: boolean; }

export function PrejoinCheck({ mode, onJoin, onCancel }: { mode: MeetingMode; onJoin: (intent: DeviceIntent) => void; onCancel: () => void }) {
  const [listenOnly, setListenOnly] = useState(false);
  const [microphone, setMicrophone] = useState(true);
  const [camera, setCamera] = useState(mode === 'video');
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const stream = useRef<MediaStream | null>(null);
  useEffect(() => () => stream.current?.getTracks().forEach(track => track.stop()), []);
  const intent = (): DeviceIntent => ({ listenOnly, microphone: !listenOnly && microphone, camera: mode === 'video' && !listenOnly && camera });
  const check = async () => {
    if (listenOnly) { setMessage('Listening only — no microphone or camera will be shared.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setMessage('This browser cannot access your selected device. Choose Listen only or use a supported browser.'); return; }
    setChecking(true); setMessage('Checking your selected device…');
    try {
      // Do not include video unless the member explicitly enabled camera.
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: microphone, video: mode === 'video' && camera });
      setMessage('Your selected device is ready.');
    } catch { setMessage('Browser access was blocked. Allow the selected device in browser settings, then try again.'); }
    finally { setChecking(false); }
  };
  return <div className="w-full max-w-full min-w-0 overflow-x-hidden rounded-2xl border border-primary/30 bg-card p-4 sm:p-5 space-y-4 box-border">
    <div><p className="font-semibold">Check your devices</p><p className="mt-1 text-sm text-muted-foreground">Choose how you want to join before connecting.</p></div>
    <div className="flex flex-col gap-2 sm:flex-row">
      <Button className="min-h-11" variant={!listenOnly && microphone ? 'default' : 'outline'} onClick={() => { setListenOnly(false); setMicrophone(v => !v); }}>Microphone {microphone && !listenOnly ? 'on' : 'off'}</Button>
      {mode === 'video' && <Button className="min-h-11" variant={camera && !listenOnly ? 'default' : 'outline'} onClick={() => { setListenOnly(false); setCamera(v => !v); }}><Video size={16} className="mr-1" />Camera {camera && !listenOnly ? 'on' : 'off'}</Button>}
      <Button className="min-h-11" variant={listenOnly ? 'default' : 'outline'} onClick={() => setListenOnly(true)}>Listen only</Button>
    </div>
    {!listenOnly && <Button className="min-h-11 w-full" variant="outline" disabled={checking} onClick={() => void check()}>{checking ? <Loader2 className="mr-1 animate-spin" size={16} /> : null}Check selected devices</Button>}
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    <div className="flex flex-col gap-2 sm:flex-row"><Button className="min-h-11" variant="outline" onClick={onCancel}>Cancel</Button><Button className="min-h-11 sm:ml-auto" onClick={() => onJoin(intent())}>Join gathering</Button></div>
  </div>;
}

function Participants({ mode }: { mode: MeetingMode }) {
  const { localParticipant } = useLocalParticipant();
  const remote = useRemoteParticipants();
  const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false });
  const members = [localParticipant, ...remote];
  if (mode === 'video') return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{tracks.map(track => <div key={track.participant.identity} className="aspect-video rounded-xl bg-muted p-3 text-sm">{track.participant.name || 'Member'}</div>)}</div>;
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{members.map(member => <div key={member.identity} className="rounded-xl border p-3 text-sm">{member.name || 'Member'} — {member.isMicrophoneEnabled ? 'Mic on' : 'Muted'}</div>)}</div>;
}

export function VideoRoom(props: VideoRoomProps) {
  const media = useMeetingMedia();
  const mode = props.meetingMode ?? 'video';
  useEffect(() => media.configure({ roomId: props.roomId, userId: props.userId, displayName: props.displayName, mode, hasJoinedMeeting: props.hasJoinedMeeting }), [media.configure, props.roomId, props.userId, props.displayName, props.hasJoinedMeeting, mode]);
  if (!props.videoEligible) return null;
  if (media.loading && !media.status) return <div className="rounded-2xl border p-5 text-sm text-muted-foreground">Checking gathering status…</div>;
  if (media.prejoin && !media.connected) return <PrejoinCheck mode={mode} onJoin={media.join} onCancel={media.closePrejoin} />;
  if (media.connected) return <div className="rounded-2xl border border-primary/30 bg-card p-4 pb-24 space-y-3"><div className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /><b>Live {mode === 'audio' ? 'Audio' : 'Video'}</b><Users size={15} /></div><Participants mode={mode} /></div>;
  if (!media.status?.configured || !media.status?.videoEnabled) return null;
  return <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-5 dark:bg-emerald-950/30"><p className="font-semibold">{media.status.videoActive ? `Live ${mode === 'audio' ? 'Audio' : 'Video'} is active` : 'Ready to gather'}</p><p className="mt-1 text-sm text-muted-foreground">{props.leaderName || 'Your leader'} {media.status.videoActive ? 'has started a live session.' : 'can start a live session.'}</p><div className="mt-4 flex flex-col gap-2 sm:flex-row">{media.status.videoActive ? <Button className="min-h-11" onClick={media.openJoin} disabled={props.hasJoinedMeeting === false}>Join Live {mode === 'audio' ? 'Audio' : 'Video'}</Button> : media.status.canHost && !props.hideStart ? <Button className="min-h-11" onClick={() => void media.start()} disabled={props.hasJoinedMeeting === false}>Start Live {mode === 'audio' ? 'Audio' : 'Video'}</Button> : null}</div>{media.error && <p role="alert" className="mt-3 flex gap-2 text-sm text-destructive"><AlertCircle size={16} />{media.error}</p>}</div>;
}