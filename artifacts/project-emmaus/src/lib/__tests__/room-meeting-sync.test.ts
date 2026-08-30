import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canApplyPresentationResponse, isCurrentPresentationIdentity, shouldApplyPresentationEvent, shouldReconcileSharedPanelPresentation } from '../../hooks/useFollowLeader';

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
const meetingMediaSource = readFileSync(
  resolve(process.cwd(), 'src/contexts/MeetingMediaContext.tsx'),
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
const appSource = readFileSync(
  resolve(process.cwd(), 'src/App.tsx'),
  'utf8',
);
describe('active meeting synchronization contract', () => {
  it('accepts a newer presentation when a follower is currently on Chat', () => {
    expect(shouldApplyPresentationEvent(
      { sessionId: 'session-1', version: 4, panel: 'chat' },
      {
        sessionId: 'session-1',
        sharedPanel: { panel: 'presentation', version: 5, data: { presentationId: 'presentation-1' } },
      },
      'session-1',
    )).toBe(true);
    expect(shouldApplyPresentationEvent(
      { sessionId: 'session-1', version: 6, panel: 'chat' },
      {
        sessionId: 'session-1',
        sharedPanel: { panel: 'presentation', version: 5, data: { presentationId: 'presentation-1' } },
      },
      'session-1',
    )).toBe(false);
  });

  it('rejects delayed hydration, page, and stop identities after a session or presentation changes', () => {
    expect(isCurrentPresentationIdentity('session-b', 'presentation-b', 'session-a')).toBe(false);
    expect(isCurrentPresentationIdentity('session-b', 'presentation-b', 'session-b', 'presentation-a')).toBe(false);
    expect(isCurrentPresentationIdentity('session-b', 'presentation-b', 'session-b', 'presentation-b')).toBe(true);
  });

  it('admits a new REST or SSE presentation when no local presentation exists', () => {
    expect(canApplyPresentationResponse('session-1', undefined, {
      id: 'presentation-1',
      sessionId: 'session-1',
      messageId: 'message-1',
      filename: 'slides.pdf',
      mediaType: 'document',
      objectPath: 'rooms/slides.pdf',
      presentedBy: 'leader-1',
      presentedByName: 'Leader',
      currentPage: 1,
      sharedPanel: {
        panel: 'presentation',
        version: 3,
        data: { presentationId: 'presentation-1', currentPage: 1 },
      },
    })).toBe(true);
  });

  it('does not reconcile presentation identity from a rejected older shared panel', () => {
    const stalePanel = {
      panel: 'presentation' as const,
      version: 4,
      data: { presentationId: 'presentation-a' },
    };
    expect(shouldReconcileSharedPanelPresentation(false, stalePanel)).toBe(false);
    expect(shouldReconcileSharedPanelPresentation(true, {
      ...stalePanel,
      version: 6,
      data: { presentationId: 'presentation-b' },
    })).toBe(true);
  });
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
    expect(guidePanelSource).toContain("await apiChangeMode(userId, roomId, activeSession.id, 'discussion', leaderName);");
    expect(guidePanelSource).toContain('const discussion = await apiOpenGroupDiscussion(userId, roomId, activeSession.id);');
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
    expect(meetingMediaSource).toContain("video={identity.mode === 'video' && intent.camera && !intent.listenOnly");
    expect(meetingMediaSource).toContain("audio={intent.microphone && !intent.listenOnly");
    expect(videoRoomSource).toContain("{mode === 'video' && <Button");
    expect(videoRoomSource).toContain("mode === 'audio'");
    expect(videoRoomSource).toContain('Join Live');
    expect(meetingMediaSource).toContain("'Microphone' : 'Camera'");
  });

  it('requires meeting attendance before opening the LiveKit connection', () => {
    expect(roomDetailSource).toContain('hasJoinedMeeting={hasJoinedCurrentMeeting}');
    expect(roomDetailSource).toContain('if (!hasJoinedCurrentMeeting)');
    expect(roomDetailSource).toContain('Join the meeting before starting live');
    expect(videoRoomSource).toContain('hasJoinedMeeting: props.hasJoinedMeeting');
    expect(videoRoomSource).toContain('disabled={props.hasJoinedMeeting === false}');
    expect(meetingMediaSource).toContain('Join the meeting first, then join Live Audio.');
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
    expect(roomChatSource).toContain("apiCloseSharedTool(user.id, String(roomId), sessionId, 'discussion')");
    expect(roomChatSource).toContain('Close Discussion');
  });

  it('shows post deletion only to the author and room leader', () => {
    expect(roomChatSource).toContain('apiDeleteMessage');
    expect(roomChatSource).toContain('(isLeader || isMe)');
    expect(roomChatSource).toContain('Delete post');
    expect(roomsApiSource).toContain('/messages/${messageId}');
  });

  it('keeps Discussion close authoritative on the chat route, including reconnect hydration', () => {
    expect(roomChatSource).not.toContain('apiGetSessionEventsToken');
    expect(roomDetailSource).toContain("lastEvent.type === 'tool_closed'");
    expect(roomDetailSource).toContain("closedTool === 'discussion'");
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
    expect(roomChatSource).toContain('const presentation = await apiStartPresentation');
    expect(roomChatSource).toContain('onPresentationStarted?.(presentation)');
    expect(roomDetailSource).toContain('onPresentationStarted={presentation => applyPresentationResponse(presentation)}');
    expect(roomDetailSource).toContain('activePresentationMessageId={activePresentation?.messageId ?? null}');
    expect(roomChatSource).not.toContain('isPresenter');
    expect(roomDetailSource).toContain("presentationQuery.get('return') === 'chat'");
    expect(roomDetailSource).toContain('scrollIntoView');
    expect(roomDetailSource).toContain('onStop={(sessionId, presentationId) => {');
    expect(roomDetailSource).toContain('onClose={() =>');
    expect(roomDetailSource).toContain('?surface=discussion');
  });

  it('keeps Discussion inside the mounted Room so LiveKit survives tool transitions', () => {
    expect(roomDetailSource).toContain('<RoomChat');
    expect(roomDetailSource).toContain('embedded');
    expect(roomDetailSource).toContain("presentationQuery.get('surface') === 'discussion'");
    expect(roomChatSource).toContain("'fixed inset-0 z-[60] pb-[calc(7.25rem+env(safe-area-inset-bottom))]'");
    expect(roomChatSource).toContain('Embedded Discussion keeps the parent Room and its LiveKit connection mounted.');
    expect(roomChatSource).not.toContain('apiGetSessionEventsToken');
    expect(roomChatSource).not.toContain('apiSessionEventsUrl');
    expect(appSource).toContain('function LegacyRoomChatRedirect');
    expect(appSource).toContain('?surface=discussion');
    expect(appSource).not.toContain('component={RoomChat}');
    expect(roomDetailSource).not.toContain('`/rooms/${roomId}/chat');
  });

  it('shares a transient raise-hand signal through LiveKit attributes', () => {
    expect(meetingMediaSource).toContain("'emmaus.raise_hand'");
    expect(meetingMediaSource).toContain('localParticipant.setAttributes');
    expect(meetingMediaSource).toContain("raised ? 'Lower hand' : 'Raise hand'");
  });

  it('uses the versioned shared-panel contract and rejects stale panel events', () => {
    expect(followLeaderSource).toContain('const applySharedPanel');
    expect(followLeaderSource).toContain('value.version < current.version');
    expect(followLeaderSource).toContain("case 'shared_panel'");
    expect(followLeaderSource).toContain('setActivePresentation(seedPresentation)');
    expect(followLeaderSource).not.toContain('prev => prev ?? seedPresentation');
    expect(followLeaderSource).toContain('p.sessionId !== activeId');
    expect(followLeaderSource).toContain('p.sharedPanel');
    expect(followLeaderSource).toContain('isCurrentPresentationIdentity(');
    expect(followLeaderSource).toContain('incomingSessionId !== activeSessionId');
    expect(followLeaderSource).toContain('incomingPresentationId === activePresentationId');
    expect(roomDetailSource).toContain('clearPresentationResponse(sessionId, presentationId)');
    expect(roomDetailSource).toContain('applyPresentationResponse(presentation, activePresentation.id)');
    expect(roomDetailSource).toContain("sharedPanel.panel === 'chat'");
  });

  it('keeps prejoin devices separate from the compact persistent call dock', () => {
    expect(videoRoomSource).toContain('function PrejoinCheck');
    expect(videoRoomSource).toContain('navigator.mediaDevices.getUserMedia');
    expect(meetingMediaSource).toContain('function Dock');
    expect(meetingMediaSource).toContain('setMicrophoneEnabled');
    expect(meetingMediaSource).not.toContain('function DeviceSheet');
    expect(meetingMediaSource).not.toContain('aria-label="Devices"');
    expect(meetingMediaSource).not.toContain('aria-label="Return to meeting"');
    expect(meetingMediaSource).toContain("mode === 'video' ? 'grid-cols-4' : 'grid-cols-3'");
    expect(meetingMediaSource).toContain("audio={intent.microphone");
    expect(meetingMediaSource).toContain('video={identity.mode === \'video\'');
  });

  it('lets only the authoritative presentation panel render media', () => {
    expect(roomDetailSource).toContain("sharedPanel.panel !== 'presentation'");
    expect(roomDetailSource).toContain("sharedPanel.panel === 'presentation' && activePresentation");
    expect(followLeaderSource).toContain('shouldApplyPresentationEvent(sharedPanelRef.current, p, activeId)');
  });

  it('clears raised hands across reconnects and participant departures in both layouts', () => {
    expect(meetingMediaSource).toContain('useConnectionState');
    expect(meetingMediaSource).toContain('ParticipantEvent.TrackMuted');
    expect(meetingMediaSource).toContain('setRaised(next)');
    expect(videoRoomSource).toContain('useRemoteParticipants');
    expect(videoRoomSource).toContain('function Participants');
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
