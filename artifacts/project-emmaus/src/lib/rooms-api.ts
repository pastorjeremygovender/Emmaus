/**
 * rooms-api.ts — Typed fetch wrappers for the Rooms API.
 *
 * All calls pass the userId via X-User-Id header (dev/demo mode).
 * In production, the signed session cookie takes precedence.
 */

import { getApiUrl } from './api';
import type { RoomSummary, RoomDetail, RoomMessage, MemberJourneyProgress } from './rooms-types';

// ─── Internal fetch helper ─────────────────────────────────────────────────

async function roomsFetch<T>(
  path: string,
  userId: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': userId,
      ...(options.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    let message = `Rooms API error ${res.status}`;
    try {
      const body = await res.json() as { error?: string };
      if (body.error) message = body.error;
    } catch { /* ignore */ }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ─── Room CRUD ─────────────────────────────────────────────────────────────

export async function apiCreateRoom(
  userId: string,
  name: string
): Promise<{ roomId: string; inviteCode: string; inviteToken: string }> {
  return roomsFetch('/api/rooms', userId, {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export async function apiGetRooms(userId: string): Promise<RoomSummary[]> {
  const data = await roomsFetch<{ rooms: RoomSummary[] }>('/api/rooms', userId);
  return data.rooms;
}

export async function apiGetRoomById(
  userId: string,
  roomId: string
): Promise<{ room: RoomDetail; currentUserRole: 'admin' | 'member' } | null> {
  try {
    return await roomsFetch(`/api/rooms/${roomId}`, userId);
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) return null;
    throw err;
  }
}

export async function apiDeleteRoom(userId: string, roomId: string): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}`, userId, { method: 'DELETE' });
}

// ─── Membership ────────────────────────────────────────────────────────────

export async function apiJoinByCode(
  userId: string,
  code: string
): Promise<{ roomId: string }> {
  return roomsFetch('/api/rooms/join/code', userId, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function apiJoinByToken(
  userId: string,
  token: string
): Promise<{ roomId: string }> {
  return roomsFetch(`/api/rooms/join/${token}`, userId);
}

export async function apiLeaveRoom(userId: string, roomId: string): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/leave`, userId, { method: 'POST' });
}

export async function apiTransferAdmin(
  userId: string,
  roomId: string,
  toUserId: string
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/transfer`, userId, {
    method: 'POST',
    body: JSON.stringify({ toUserId }),
  });
}

export async function apiRemoveMember(
  userId: string,
  roomId: string,
  targetUserId: string
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/members/${targetUserId}`, userId, {
    method: 'DELETE',
  });
}

// ─── Chat ──────────────────────────────────────────────────────────────────

export async function apiGetMessages(
  userId: string,
  roomId: string,
  before?: string
): Promise<RoomMessage[]> {
  const url = before
    ? `/api/rooms/${roomId}/messages?before=${encodeURIComponent(before)}`
    : `/api/rooms/${roomId}/messages`;
  const data = await roomsFetch<{ messages: RoomMessage[] }>(url, userId);
  return data.messages;
}

export async function apiSendMessage(
  userId: string,
  roomId: string,
  body: string
): Promise<RoomMessage> {
  const data = await roomsFetch<{ message: RoomMessage }>(
    `/api/rooms/${roomId}/messages`,
    userId,
    { method: 'POST', body: JSON.stringify({ body }) }
  );
  return data.message;
}

/**
 * Exchange authenticated credentials for a short-lived one-time SSE stream
 * token.  The token is valid for 30 s and must be passed to the EventSource
 * URL — EventSource cannot send custom headers, so identity is established
 * here (via the normal auth flow) and carried by the token.
 */
export async function apiGetStreamToken(
  userId: string,
  roomId: string
): Promise<string> {
  const data = await roomsFetch<{ token: string }>(
    `/api/rooms/${roomId}/messages/stream/token`,
    userId,
    { method: 'POST' }
  );
  return data.token;
}
export interface StartSharedParams {
  journeyId: string;
  /** Use an existing room */
  roomId?: string;
  /** Create a new room with this name */
  roomName?: string;
}

export async function apiStartShared(
  userId: string,
  params: StartSharedParams
): Promise<{ roomId: string }> {
  return roomsFetch('/api/rooms/start-shared', userId, {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

// ─── Application-admin endpoints ──────────────────────────────────────────────

/**
 * List ALL rooms — requires application admin role on the server.
 * Never use this for member-facing views; use apiGetRooms() instead.
 */
export async function apiAdminGetAllRooms(userId: string): Promise<RoomSummary[]> {
  const data = await roomsFetch<{ rooms: RoomSummary[] }>('/api/rooms/admin/all', userId);
  return data.rooms;
}

/**
 * Full room detail including invite credentials — requires application admin role.
 */
export async function apiAdminGetRoomDetail(
  userId: string,
  roomId: string
): Promise<RoomDetail | null> {
  try {
    const data = await roomsFetch<{ room: RoomDetail }>(`/api/rooms/admin/${roomId}`, userId);
    return data.room;
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) return null;
    throw err;
  }
}

// ─── Linked journeys ───────────────────────────────────────────────────────

export async function apiLinkJourney(
  userId: string,
  roomId: string,
  journeyId: string
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/journeys`, userId, {
    method: 'POST',
    body: JSON.stringify({ journeyId }),
  });
}

export async function apiGetJourneyProgress(
  userId: string,
  roomId: string,
  journeyId: string
): Promise<MemberJourneyProgress[]> {
  const data = await roomsFetch<{ progress: MemberJourneyProgress[] }>(
    `/api/rooms/${roomId}/journeys/${journeyId}/progress`,
    userId
  );
  return data.progress;
}
