import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoomDetail from '../RoomDetail';

const mocks = vi.hoisted(() => ({
  loadRoomDetail: vi.fn(),
  setLocation: vi.fn(),
  roomDetail: null as null | {
    id: string;
    name: string;
    description: string;
    roomType: 'friends';
    contentType: null;
    linkedContentId: null;
    linkedContentType: null;
    inviteCode: string;
    inviteToken: string;
    createdBy: string;
    createdAt: string;
    memberCount: number;
    adminName: string;
    members: Array<{
      userId: string;
      preferredName: string;
      role: 'owner';
      joinedAt: string;
    }>;
    linkedJourneys: [];
    currentUserRole: 'owner';
    isLeader: true;
    activeSession: null;
  },
}));

vi.mock('wouter', () => ({
  useParams: () => ({ roomId: 'room-1' }),
  useLocation: () => ['/rooms/room-1', mocks.setLocation],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'owner@example.test',
      preferredName: 'Grace',
      role: 'user',
      passwordRecovery: false,
    },
  }),
}));

vi.mock('@/contexts/RoomsContext', () => ({
  useRooms: () => ({
    loadRoomDetail: mocks.loadRoomDetail,
    leaveRoom: vi.fn(),
    deleteRoom: vi.fn(),
    removeMember: vi.fn(),
  }),
}));

vi.mock('@/contexts/JourneyContext', () => ({
  useJourney: () => ({
    getJourney: vi.fn(),
    getStepsForJourney: vi.fn(() => []),
    journeys: [],
    progress: {},
  }),
}));

vi.mock('@/hooks/useFollowLeader', () => ({
  useFollowLeader: () => ({
    activeSession: null,
    setActiveSession: vi.fn(),
    followLeader: true,
    setFollowLeader: vi.fn(),
    sessionMode: 'text',
    activeScripture: null,
    incomingHighlights: [],
    incomingNotes: [],
    incomingPinChange: null,
    incomingFocusChange: null,
    sessionComplete: null,
    clearSessionComplete: vi.fn(),
    emmausQuestion: null,
    emmausStreamText: '',
    emmausAnswer: null,
    incomingPoll: null,
    pollVoteUpdate: null,
    pollRevealUpdate: null,
    activePresentation: null,
    setActivePresentation: vi.fn(),
    lastEvent: null,
  }),
}));

vi.mock('@/lib/rooms-api', () => {
  const resolved = () => Promise.resolve([]);
  return {
    apiGetJourneyProgress: resolved,
    apiLinkJourney: vi.fn(),
    apiRenameRoom: vi.fn(),
    apiSendPresenceHeartbeat: vi.fn().mockResolvedValue(undefined),
    apiGetPresenceStreamToken: vi.fn().mockResolvedValue('presence-token'),
    apiPresenceStreamUrl: vi.fn(() => '/api/rooms/room-1/presence/stream'),
    apiRecordAttendanceJoin: vi.fn(),
    apiGetActivePoll: vi.fn().mockResolvedValue(null),
    apiGetSessionAttendance: resolved,
    apiChangeMode: vi.fn(),
    apiStartSession: vi.fn(),
    apiEndSession: vi.fn(),
    apiCompleteSession: vi.fn(),
    apiAcknowledgeSessionCompletion: vi.fn(),
    apiUpdateLeaderNote: vi.fn(),
    apiUpdateSchedule: vi.fn(),
    apiStartVideo: vi.fn(),
    apiEndVideo: vi.fn(),
    apiGetVideoStatus: vi.fn(),
    apiGetSessionEventsToken: vi.fn().mockResolvedValue('session-token'),
    apiSessionEventsUrl: vi.fn(() => '/api/rooms/room-1/session/events'),
  };
});

vi.mock('@/lib/rooms-api-media', () => ({
  apiGetActivePresentation: vi.fn().mockResolvedValue(null),
  apiSetAllowMemberPresent: vi.fn(),
}));

vi.mock('@/components/PrayerRequests', () => ({ PrayerRequests: () => null }));
vi.mock('@/components/GuideGroupPanel', () => ({ GuideGroupPanel: () => null }));
vi.mock('@/components/SharedScripturePanel', () => ({ SharedScripturePanel: () => null }));
vi.mock('@/components/SharedNotesPanel', () => ({ SharedNotesPanel: () => null }));
vi.mock('@/components/SharedAskEmmausPanel', () => ({ SharedAskEmmausPanel: () => null }));
vi.mock('@/components/PollCard', () => ({ PollCard: () => null }));
vi.mock('@/components/SessionCompleteCard', () => ({ SessionCompleteCard: () => null }));
vi.mock('@/components/VideoRoom', () => ({ VideoRoom: () => null }));
vi.mock('@/components/PresentationPanel', () => ({ PresentationPanel: () => null }));
vi.mock('@/components/BottomNav', () => ({ BottomNav: () => null }));

function makeRoomDetail() {
  return {
    id: 'room-1',
    name: 'Test Group',
    description: '',
    roomType: 'friends' as const,
    contentType: null,
    linkedContentId: null,
    linkedContentType: null,
    inviteCode: '',
    inviteToken: '',
    createdBy: 'user-1',
    createdAt: '2026-08-27T00:00:00.000Z',
    memberCount: 1,
    adminName: 'Grace',
    members: [{
      userId: 'user-1',
      preferredName: 'Grace',
      role: 'owner' as const,
      joinedAt: '2026-08-27T00:00:00.000Z',
    }],
    linkedJourneys: [] as [],
    currentUserRole: 'owner' as const,
    isLeader: true,
    activeSession: null,
  };
}

describe('RoomDetail async loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.roomDetail = null;
    window.history.replaceState({}, '', '/rooms/room-1');
  });

  it('keeps the same hook order while the room changes from loading to loaded', async () => {
    let resolveDetail!: (value: ReturnType<typeof makeRoomDetail>) => void;
    const pending = new Promise<ReturnType<typeof makeRoomDetail>>(resolve => {
      resolveDetail = resolve;
    });
    // React's development renderer may invoke effects more than once. Every
    // initial invocation must observe the same in-flight detail request.
    mocks.loadRoomDetail.mockReturnValue(pending);

    render(<RoomDetail />);
    expect(document.querySelector('.animate-spin')).toBeInTheDocument();

    await act(async () => {
      resolveDetail(makeRoomDetail());
      await pending;
    });

    await waitFor(() => expect(screen.getByText('Test Group')).toBeInTheDocument());
    expect(screen.getByText('Choose something to study together.')).toBeInTheDocument();
  });
});