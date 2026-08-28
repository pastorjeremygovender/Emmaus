import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const roomDetailSource = readFileSync(
  resolve(process.cwd(), 'src/pages/rooms/RoomDetail.tsx'),
  'utf8',
);
const roomsApiSource = readFileSync(
  resolve(process.cwd(), 'src/lib/rooms-api.ts'),
  'utf8',
);
const guidePanelSource = readFileSync(
  resolve(process.cwd(), 'src/components/GuideGroupPanel.tsx'),
  'utf8',
);
const videoRoomSource = readFileSync(
  resolve(process.cwd(), 'src/components/VideoRoom.tsx'),
  'utf8',
);
const sessionCompleteCardSource = readFileSync(
  resolve(process.cwd(), 'src/components/SessionCompleteCard.tsx'),
  'utf8',
);
const roomChatSource = readFileSync(
  resolve(process.cwd(), 'src/pages/rooms/RoomChat.tsx'),
  'utf8',
);
const sharedAskSource = readFileSync(
  resolve(process.cwd(), 'src/components/SharedAskEmmausPanel.tsx'),
  'utf8',
);
const followLeaderSource = readFileSync(
  resolve(process.cwd(), 'src/hooks/useFollowLeader.ts'),
  'utf8',
);
const presentationSource = readFileSync(
  resolve(process.cwd(), 'src/components/PresentationPanel.tsx'),
  'utf8',
);
const mediaBubbleSource = readFileSync(
  resolve(process.cwd(), 'src/components/MediaMessageBubble.tsx'),
  'utf8',
);
describe('active meeting synchronization contract', () => {
  it('does not record attendance when the room page merely observes an active session', () => {
    expect(roomDetailSource).not.toContain('Attendance auto-record');
    expect(roomDetailSource).toContain('const handleJoinMeeting = async () =>');
    expect(roomDetailSource).toContain('onClick={handleJoinMeeting}');
  });

  it('uses the exact room/session key and refetches after attendance events', () => {
    expect(roomDetailSource).toContain(
      'room:${String(roomId)}:session:${sessionId}:attendance',
    );
    expect(roomDetailSource).toContain(
      "lastEvent?.type === 'attendance_changed'",
    );
    expect(roomDetailSource).toContain("window.addEventListener('online', refresh)");
    expect(roomDetailSource).toContain(
      "document.addEventListener('visibilitychange', handleVisibility)",
    );
  });

  it('returns the server attendance record from an explicit join', () => {
    expect(roomsApiSource).toContain('): Promise<SessionAttendee> {');
    expect(roomsApiSource).toContain(
      'roomsFetch<{ ok: true; attendance: SessionAttendee }>',
    );
    expect(roomsApiSource).toContain('return data.attendance;');
  });

  it('routes the leader command through one persisted discussion identity', () => {
    expect(guidePanelSource).toContain('await apiChangeMode(userId, roomId, \'discussion\', leaderName);');
    expect(guidePanelSource).toContain('const discussion = await apiOpenGroupDiscussion(userId, roomId);');
    expect(guidePanelSource).toContain('onOpenDiscussion?.(discussion.id);');
    expect(roomDetailSource).toContain("lastEvent?.type !== 'OPEN_GROUP_DISCUSSION'");
    expect(roomDetailSource).toContain('setDiscussionPendingNotice(payload.discussionId);');
    expect(roomDetailSource).toContain('openChat(payload.discussionId);');
  });

  it('does not show the inactive Group Discussion shortcut in the meeting card', () => {
    const quickAccessStart = roomDetailSource.indexOf('/* Quick-access: open scripture or group notes */');
    const quickAccessEnd = roomDetailSource.indexOf('/* Shared discussion command notice', quickAccessStart);
    const quickAccessBlock = roomDetailSource.slice(quickAccessStart, quickAccessEnd);

    expect(quickAccessBlock).not.toContain('Group Discussion');
    expect(quickAccessBlock).not.toContain('openChat()');
  });

  it('keeps LiveKit audio microphone-only and removes camera controls', () => {
    expect(videoRoomSource).toContain('video={meetingMode === \'video\'}');
    expect(videoRoomSource).toContain('controls={{ camera: false, microphone: true');
    expect(videoRoomSource).toContain('function AudioParticipantGrid');
    expect(videoRoomSource).toContain('Live Audio');
    expect(videoRoomSource).toContain("'Microphone' : 'Camera and microphone'");
  });

  it('requires meeting attendance before opening the LiveKit connection', () => {
    expect(roomDetailSource).toContain('hasJoinedMeeting={hasJoinedCurrentMeeting}');
    expect(roomDetailSource).toContain('if (!hasJoinedCurrentMeeting)');
    expect(roomDetailSource).toContain('Join the meeting before starting live');
    expect(videoRoomSource).toContain('hasJoinedMeeting === false');
    expect(videoRoomSource).toContain('disabled={actioning || hasJoinedMeeting === false}');
    expect(videoRoomSource).toContain('Join the meeting first, then join Live Audio.');
  });

  it('persists shared-tool replacement and closes it for every connected device', () => {
    expect(roomsApiSource).toContain('/session/tool-close');
    expect(roomDetailSource).toContain("handleCloseSharedTool('scripture'");
    expect(roomDetailSource).toContain("handleCloseSharedTool('ask-emmaus'");
    expect(roomDetailSource).toContain("handleCloseSharedTool('poll'");
    expect(roomDetailSource).toContain("lastEvent.type === 'tool_closed'");
    expect(roomDetailSource).toContain('setDiscussionPendingNotice(null);');
  });

  it('moves media preparation out of Meeting Tools and keeps presentation session-gated', () => {
    expect(guidePanelSource).not.toContain('Add media before the meeting');
    expect(guidePanelSource).toContain('disabled={!sessionActive || busy === `present-${item.messageId}`}');
    expect(roomDetailSource).toContain('Meeting Media');
    expect(roomDetailSource).toContain('Share all');
    expect(roomDetailSource).toContain('Hide all');
    expect(roomDetailSource).toContain('apiAddPreparedRoomMedia');
    expect(roomDetailSource).toContain('apiSetRoomMediaVisibility');
    expect(roomDetailSource).toContain('attachment={item.attachment}');
    expect(roomDetailSource).toContain('allowDownload={isAuthorizedLeader || shared}');
  });

  it('keeps the completion card focused on summary counts', () => {
    expect(sessionCompleteCardSource).not.toContain('Studied the Word together');
    expect(sessionCompleteCardSource).not.toContain('Discussed together');
    expect(sessionCompleteCardSource).not.toContain('Prayed together');
    expect(sessionCompleteCardSource).toContain('Session Complete');
  });

  it('lets joined members leave without ending the meeting and leaders close discussion', () => {
    expect(roomDetailSource).toContain('apiRecordAttendanceLeave');
    expect(roomDetailSource).toContain('Leave Meeting');
    expect(roomChatSource).toContain("apiCloseSharedTool(user.id, String(roomId), 'discussion')");
    expect(roomChatSource).toContain('Close Discussion');
  });

  it('shows post deletion only to the author and room leader', () => {
    expect(roomChatSource).toContain('apiDeleteMessage');
    expect(roomChatSource).toContain('(isLeader || isMe)');
    expect(roomChatSource).toContain('Delete post');
    expect(roomsApiSource).toContain('/messages/${messageId}');
  });

  it('keeps Discussion close authoritative on the chat route, including reconnect hydration', () => {
    expect(roomChatSource).toContain('apiGetSessionEventsToken');
    expect(roomChatSource).toContain("payload.type === 'tool_closed'");
    expect(roomChatSource).toContain("payload.payload?.tool === 'discussion'");
    expect(roomChatSource).toContain("metadata?.activeTool !== 'discussion'");
    expect(followLeaderSource).toContain('closedToolsRef');
    expect(followLeaderSource).toContain('eventSessionId !== currentSessionId');
  });

  it('recovers Ask Emmaus state after reconnects and leaves no indefinite spinner', () => {
    expect(followLeaderSource).toContain('metadata?.activeEmmaus');
    expect(followLeaderSource).toContain('requestId !== emmausRequestRef.current');
    expect(followLeaderSource).toContain("hydratedEmmaus.status === 'generating'");
    expect(followLeaderSource).toContain('error: hydratedEmmaus.status === \'failed\'');
    expect(sharedAskSource).toContain('generationTimedOut');
    expect(sharedAskSource).toContain('30_000');
    expect(sharedAskSource).toContain('try the question again');
    expect(sharedAskSource).toContain('latestAnswer?.error');
    expect(sharedAskSource).toContain('Try this question again');
    expect(followLeaderSource).toContain('apiGetSession(userId, roomId)');
    expect(followLeaderSource).toContain('setInterval(() => void reconcile(), 3_000)');
  });

  it('prioritises chat-originated presentations and returns to the discussion', () => {
    expect(roomChatSource).toContain("payload.type === 'media_presented'");
    expect(roomChatSource).toContain("presentation=1${returnQuery}${discussionQuery}");
    expect(roomChatSource).toContain("const returnQuery = '&return=chat'");
    expect(roomChatSource).not.toContain('isPresenter');
    expect(roomDetailSource).toContain("presentationQuery.get('return') === 'chat'");
    expect(roomDetailSource).toContain('scrollIntoView');
    expect(roomDetailSource).toContain('onStop={() => {');
    expect(roomDetailSource).toContain('onClose={() =>');
    expect(roomDetailSource).toContain('`/rooms/${String(roomId)}/chat${discussion}`');
  });

  it('shares a transient raise-hand signal through LiveKit attributes', () => {
    expect(videoRoomSource).toContain("const RAISE_HAND_ATTRIBUTE = 'emmaus.raise_hand'");
    expect(videoRoomSource).toContain('localParticipant.setAttributes');
    expect(videoRoomSource).toContain('Raise hand / ask a question');
    expect(videoRoomSource).toContain('RaisedHandsSummary');
    expect(videoRoomSource).toContain('hasRaisedHand(participant)');
  });

  it('clears raised hands across reconnects and participant departures in both layouts', () => {
    expect(videoRoomSource).toContain('useConnectionState');
    expect(videoRoomSource).toContain('connectionState !== ConnectionState.Connected');
    expect(videoRoomSource).toContain('ConnectionState.Reconnecting');
    expect(videoRoomSource).toContain('ConnectionState.SignalReconnecting');
    expect(videoRoomSource).toContain('setRaised(false)');
    expect(videoRoomSource).toContain('useRemoteParticipants');
    expect(videoRoomSource).toContain('function VideoParticipantGrid');
    expect(videoRoomSource).toContain('function AudioParticipantGrid');

    const videoSummary = videoRoomSource.slice(
      videoRoomSource.indexOf('function VideoParticipantGrid'),
      videoRoomSource.indexOf('function AudioParticipantGrid'),
    );
    const audioSummary = videoRoomSource.slice(
      videoRoomSource.indexOf('function AudioParticipantGrid'),
      videoRoomSource.indexOf('// ─── Main component'),
    );
    expect(videoSummary).toContain('RaisedHandsSummary participants={allParticipants}');
    expect(audioSummary).toContain('RaisedHandsSummary participants={participants}');
  });

  it('provides explicit close and download controls for media viewers', () => {
    expect(mediaBubbleSource).toContain('aria-label="Close image viewer"');
    expect(mediaBubbleSource).toContain("event.key === 'Escape'");
    expect(mediaBubbleSource).toContain('allowDownload?: boolean');
    expect(mediaBubbleSource).toContain('download={filename}');
    expect(presentationSource).toContain('aria-label="Close presentation viewer"');
    expect(presentationSource).toContain('onClose?: () => void');
  });
});
