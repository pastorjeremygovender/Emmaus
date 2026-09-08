import { describe, expect, it, vi, afterEach } from 'vitest';
import { apiGetRoomById } from '../rooms-api';

describe('rooms API cache policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('bypasses browser conditional caching for room detail requests', async () => {
    const roomResponse = {
      room: {
        id: 'room-1',
        name: 'Study group',
        description: '',
        roomType: 'personal',
        contentType: null,
        memberCount: 1,
        members: [],
        linkedJourneys: [],
      },
      currentUserRole: 'owner',
      isLeader: true,
      activeSession: null,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(roomResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiGetRoomById('user-1', 'room-1');

    expect(result).toEqual(roomResponse);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/rooms/room-1'),
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'include',
      }),
    );
  });
});