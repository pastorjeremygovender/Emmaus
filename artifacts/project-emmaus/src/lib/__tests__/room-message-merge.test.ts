import { describe, expect, it } from 'vitest';
import type { RoomMessage } from '@/lib/rooms-types';
import {
  mergeRoomMessages,
  reconcileSentRoomMessage,
} from '@/lib/room-message-merge';

const optimistic: RoomMessage = {
  id: 'opt-1',
  roomId: 'room-1',
  userId: 'user-1',
  senderName: 'You',
  body: 'Hello',
  createdAt: '2026-08-28T12:00:00.000Z',
  attachment: null,
  discussionId: 'discussion-1',
};

const serverMessage: RoomMessage = {
  ...optimistic,
  id: 'message-1',
  senderName: 'Jeremy',
  createdAt: '2026-08-28T12:00:00.100Z',
};

describe('Room message sender reconciliation', () => {
  it('replaces the optimistic message when the POST response arrives first', () => {
    const afterResponse = reconcileSentRoomMessage(
      [optimistic],
      optimistic.id,
      serverMessage,
    );
    const afterEcho = mergeRoomMessages(afterResponse, [serverMessage]);

    expect(afterEcho).toEqual([serverMessage]);
  });

  it('keeps one server message when the SSE echo arrives before the POST response', () => {
    const afterEcho = mergeRoomMessages([optimistic], [serverMessage]);
    const afterResponse = reconcileSentRoomMessage(
      afterEcho,
      optimistic.id,
      serverMessage,
    );

    expect(afterResponse).toEqual([serverMessage]);
  });

  it('removes the exact optimistic placeholder even if the echo shape differs', () => {
    const normalizedServerMessage = {
      ...serverMessage,
      discussionId: null,
    };

    const reconciled = reconcileSentRoomMessage(
      [optimistic],
      optimistic.id,
      normalizedServerMessage,
    );

    expect(reconciled).toEqual([normalizedServerMessage]);
  });
});