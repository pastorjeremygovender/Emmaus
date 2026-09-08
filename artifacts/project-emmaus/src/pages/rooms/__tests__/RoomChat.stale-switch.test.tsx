import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import RoomChat from '../RoomChat';
import type { RoomMessage } from '@/lib/rooms-types';

const currentRoomId = vi.hoisted(() => ({ value: 'room-a' }));
const apiGetMessages = vi.hoisted(() => vi.fn());
const apiGetStreamToken = vi.hoisted(() => vi.fn());
const apiGetRoomById = vi.hoisted(() => vi.fn());
const apiGetActiveGroupDiscussion = vi.hoisted(() => vi.fn());
const setLocation = vi.hoisted(() => vi.fn());

vi.mock('wouter', () => ({
  useParams: () => ({ roomId: currentRoomId.value }),
  useLocation: () => ['/', setLocation],
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'member-1', role: 'member' } }),
}));

vi.mock('@/lib/rooms-api', () => ({
  apiGetMessages,
  apiGetStreamToken,
  apiGetRoomById,
  apiGetActiveGroupDiscussion,
  apiSendMessage: vi.fn(),
  apiDeleteMessage: vi.fn(),
  apiCloseSharedTool: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  getApiUrl: (path: string) => path,
}));

vi.mock('@/lib/rooms-api-media', () => ({
  apiStartPresentation: vi.fn(),
}));

vi.mock('@/components/MediaMessageBubble', () => ({
  MediaMessageBubble: () => null,
}));

vi.mock('@/components/AttachmentPicker', () => ({
  AttachmentPicker: () => null,
}));

vi.mock('@/components/VoiceNoteRecorder', () => ({
  VoiceNoteRecorder: () => null,
  supportsMediaRecorder: () => false,
}));

vi.mock('@/lib/return-context', () => ({
  goBackOrFallback: vi.fn(),
}));

class FakeEventSource {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  close = vi.fn();

  constructor(_url: string) {}
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => { resolve = res; });
  return { promise, resolve };
}

function message(roomId: string, body: string): RoomMessage {
  return {
    id: `${roomId}-message`,
    roomId,
    userId: 'member-1',
    senderName: 'Grace',
    body,
    createdAt: '2026-09-01T10:00:00.000Z',
  };
}

describe('RoomChat rapid switching', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentRoomId.value = 'room-a';
    vi.stubGlobal('EventSource', FakeEventSource);
    Element.prototype.scrollIntoView = vi.fn();
    apiGetStreamToken.mockResolvedValue('stream-token');
    apiGetRoomById.mockImplementation(async (_userId: string, roomId: string) => ({
      room: { name: roomId, allowMemberPresent: false },
      isLeader: false,
      currentUserRole: 'member',
      activeSession: { id: `session-${roomId}`, metadata: { activeTool: 'discussion' } },
    }));
    apiGetActiveGroupDiscussion.mockResolvedValue(null);
  });

  it('clears the old conversation and ignores a late response after switching chats', async () => {
    const requests = new Map<string, ReturnType<typeof deferred<RoomMessage[]>>>();
    apiGetMessages.mockImplementation((_userId: string, roomId: string) => {
      const request = deferred<RoomMessage[]>();
      requests.set(roomId, request);
      return request.promise;
    });

    const view = render(<RoomChat />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    currentRoomId.value = 'room-b';
    view.rerender(<RoomChat />);
    expect(screen.queryByText('Message from room A')).not.toBeInTheDocument();

    await act(async () => {
      requests.get('room-a')!.resolve([message('room-a', 'Message from room A')]);
      await Promise.resolve();
    });
    expect(screen.queryByText('Message from room A')).not.toBeInTheDocument();

    await act(async () => {
      requests.get('room-b')!.resolve([message('room-b', 'Message from room B')]);
      await Promise.resolve();
    });
    expect(screen.getByText('Message from room B')).toBeInTheDocument();
    expect(screen.queryByText('Message from room A')).not.toBeInTheDocument();
  });
});