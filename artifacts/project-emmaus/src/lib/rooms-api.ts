/**
 * rooms-api.ts — Typed fetch wrappers for the Rooms API.
 *
 * Identity is derived server-side from the secure session cookie.
 */

import { getApiUrl } from './api';
import type {
  RoomSummary, RoomDetail, RoomMessage, MemberJourneyProgress,
  VideoSessionStatus, PrayerRequest, ContentType,
  RoomSession, SessionMode, ScriptureRef, SessionAttendee,
  RoomHighlight, SharedNote, RoomPoll, RoomPollResults, RoomEmmausAnswer,
  RoomInvitePreview, RoomRole,
} from './rooms-types';

// ─── Internal fetch helper ─────────────────────────────────────────────────

export async function roomsFetch<T>(
  path: string,
  _userId: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(getApiUrl(path), {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
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
  name: string,
  description = "",
  roomType: 'personal' | 'family' | 'friends' | 'marriage' | 'discipleship' | 'leadership' | 'church' = 'personal',
  linkedContentId?: string,
  linkedContentType?: string,
  contentType?: ContentType
): Promise<{ roomId: string; inviteCode: string; inviteToken: string }> {
  return roomsFetch('/api/rooms', userId, {
    method: 'POST',
    body: JSON.stringify({ name, description, roomType, linkedContentId, linkedContentType, contentType }),
  });
}

// ─── Groups V2 — Leader note + schedule ───────────────────────────────────

export async function apiUpdateLeaderNote(
  userId: string,
  roomId: string,
  note: string | null
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/leader-note`, userId, {
    method: 'PATCH',
    body: JSON.stringify({ note }),
  });
}

export async function apiUpdateSchedule(
  userId: string,
  roomId: string,
  nextMeeting: string | null,
  revealOnMeeting?: boolean
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/schedule`, userId, {
    method: 'PATCH',
    body: JSON.stringify({ nextMeeting, revealOnMeeting }),
  });
}

// ─── Prayer requests ───────────────────────────────────────────────────────

export async function apiGetPrayerRequests(
  userId: string,
  roomId: string
): Promise<PrayerRequest[]> {
  const data = await roomsFetch<{ requests: PrayerRequest[] }>(
    `/api/rooms/${roomId}/prayer`, userId
  );
  return data.requests;
}

export async function apiAddPrayerRequest(
  userId: string,
  roomId: string,
  authorName: string,
  request: string,
  /** Optional: scope the prayer to a session for atomic completion counting. */
  sessionId?: string
): Promise<PrayerRequest> {
  const data = await roomsFetch<{ request: PrayerRequest }>(
    `/api/rooms/${roomId}/prayer`, userId,
    { method: 'POST', body: JSON.stringify({ request, authorName, sessionId }) }
  );
  return data.request;
}

export async function apiMarkPrayerAnswered(
  userId: string,
  roomId: string,
  prayerId: string
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/prayer/${prayerId}/answered`, userId, {
    method: 'PATCH',
  });
}

export async function apiGetVideoSettings(userId: string): Promise<{
  videoEnabled: boolean;
  maxConcurrentRooms: number;
  maxParticipantsPerRoom: number;
  maxDurationMinutes: number;
  allowedRoles: string[];
}> {
  const data = await roomsFetch<{ settings: {
    videoEnabled: boolean;
    maxConcurrentRooms: number;
    maxParticipantsPerRoom: number;
    maxDurationMinutes: number;
    allowedRoles: string[];
  } }>('/api/rooms/admin/video-settings', userId);
  return data.settings;
}

export async function apiUpdateVideoSettings(
  userId: string,
  patch: Partial<{
    videoEnabled: boolean;
    maxConcurrentRooms: number;
    maxParticipantsPerRoom: number;
    maxDurationMinutes: number;
    allowedRoles: string[];
  }>
): Promise<{ videoEnabled: boolean; maxConcurrentRooms: number; maxParticipantsPerRoom: number; maxDurationMinutes: number; allowedRoles: string[] }> {
  const data = await roomsFetch<{ settings: {
    videoEnabled: boolean;
    maxConcurrentRooms: number;
    maxParticipantsPerRoom: number;
    maxDurationMinutes: number;
    allowedRoles: string[];
  } }>('/api/rooms/admin/video-settings', userId, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return data.settings;
}

export async function apiGetRooms(userId: string): Promise<RoomSummary[]> {
  const data = await roomsFetch<{ rooms: RoomSummary[] }>('/api/rooms', userId);
  return data.rooms;
}

export async function apiGetRoomById(
  userId: string,
  roomId: string
): Promise<{ room: RoomDetail; currentUserRole: RoomRole; isLeader: boolean; activeSession: import('./rooms-types').RoomSession | null } | null> {
  try {
    return await roomsFetch(`/api/rooms/${roomId}`, userId);
  } catch (err) {
    if (err instanceof Error && err.message.includes('404')) return null;
    throw err;
  }
}

export async function apiRenameRoom(userId: string, roomId: string, name: string): Promise<void> {
  await roomsFetch<{ ok: boolean }>(`/api/rooms/${roomId}`, userId, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export async function apiDeleteRoom(userId: string, roomId: string): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}`, userId, { method: 'DELETE' });
}

// ─── Membership ────────────────────────────────────────────────────────────

export async function apiJoinByCode(
  userId: string,
  code: string
): Promise<{ roomId: string; alreadyMember: boolean }> {
  return roomsFetch('/api/rooms/join/code', userId, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

export async function apiJoinByToken(
  userId: string,
  token: string
): Promise<{ roomId: string; alreadyMember: boolean }> {
  return roomsFetch(`/api/rooms/invite/${encodeURIComponent(token)}/accept`, userId, {
    method: 'POST',
  });
}

export async function apiGetInvitePreview(
  token: string,
  userId = '',
): Promise<RoomInvitePreview> {
  const data = await roomsFetch<{ preview: RoomInvitePreview }>(
    `/api/rooms/invite/${encodeURIComponent(token)}`,
    userId,
  );
  return data.preview;
}

export async function apiGetCodeInvitePreview(
  code: string,
  userId: string,
): Promise<RoomInvitePreview> {
  const data = await roomsFetch<{ preview: RoomInvitePreview }>(
    `/api/rooms/invite/code/${encodeURIComponent(code.trim().toUpperCase())}`,
    userId,
  );
  return data.preview;
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

export async function apiTransferOwnership(
  userId: string,
  roomId: string,
  toUserId: string,
): Promise<void> {
  return apiTransferAdmin(userId, roomId, toUserId);
}

export async function apiPromoteMember(
  userId: string,
  roomId: string,
  targetUserId: string,
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/members/${encodeURIComponent(targetUserId)}/promote`, userId, {
    method: 'POST',
  });
}

export async function apiDemoteLeader(
  userId: string,
  roomId: string,
  targetUserId: string,
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/members/${encodeURIComponent(targetUserId)}/demote`, userId, {
    method: 'POST',
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
  before?: string,
  discussionId?: string,
): Promise<RoomMessage[]> {
  const query = new URLSearchParams();
  if (before) query.set('before', before);
  if (discussionId) query.set('discussionId', discussionId);
  const suffix = query.toString() ? `?${query.toString()}` : '';
  const url = `/api/rooms/${roomId}/messages${suffix}`;
  const data = await roomsFetch<{ messages: RoomMessage[] }>(url, userId);
  return data.messages;
}

export async function apiSendMessage(
  userId: string,
  roomId: string,
  body: string,
  attachment?: import('@/lib/rooms-types').MediaAttachment,
  discussionId?: string,
): Promise<RoomMessage> {
  const data = await roomsFetch<{ message: RoomMessage }>(
    `/api/rooms/${roomId}/messages`,
    userId,
    { method: 'POST', body: JSON.stringify({
      body,
      ...(attachment ? { attachment } : {}),
      ...(discussionId ? { discussionId } : {}),
    }) }
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
  roomId: string,
  discussionId?: string,
): Promise<string> {
  const data = await roomsFetch<{ token: string }>(
    `/api/rooms/${roomId}/messages/stream/token`,
    userId,
    { method: 'POST', body: JSON.stringify(discussionId ? { discussionId } : {}) }
  );
  return data.token;
}

export async function apiOpenGroupDiscussion(
  userId: string,
  roomId: string,
): Promise<{ id: string; roomId: string; sessionId: string; createdAt: string }> {
  const data = await roomsFetch<{ discussion: { id: string; roomId: string; sessionId: string; createdAt: string } }>(
    `/api/rooms/${roomId}/session/discussion/open`,
    userId,
    { method: 'POST' },
  );
  return data.discussion;
}

export async function apiGetActiveGroupDiscussion(
  userId: string,
  roomId: string,
): Promise<{ id: string; roomId: string; sessionId: string; createdAt: string } | null> {
  const data = await roomsFetch<{ discussion: { id: string; roomId: string; sessionId: string; createdAt: string } | null }>(
    `/api/rooms/${roomId}/session/discussion`,
    userId,
  );
  return data.discussion;
}
export interface StartSharedParams {
  journeyId: string;
  /** Use an existing room */
  roomId?: string;
  /** Create a new room with this name */
  roomName?: string;
  /** The member-facing surface that initiated this shared start. */
  displayOrigin?: 'walk' | 'journey';
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

// ─── Video session ─────────────────────────────────────────────────────────

export async function apiGetVideoStatus(
  userId: string,
  roomId: string
): Promise<VideoSessionStatus> {
  return roomsFetch<VideoSessionStatus>(`/api/rooms/${roomId}/video/status`, userId);
}

export async function apiStartVideo(
  userId: string,
  roomId: string,
  mode: 'audio' | 'video' = 'video',
): Promise<{ ok: boolean; alreadyActive: boolean; livekitRoomName: string; meetingMode: 'audio' | 'video' }> {
  return roomsFetch(`/api/rooms/${roomId}/video/start`, userId, {
    method: 'POST',
    body: JSON.stringify({ mode }),
  });
}

export async function apiGetVideoToken(
  userId: string,
  roomId: string
): Promise<{ token: string; livekitUrl: string }> {
  return roomsFetch(`/api/rooms/${roomId}/video/token`, userId, { method: 'POST' });
}

export async function apiEndVideo(
  userId: string,
  roomId: string
): Promise<{ ok: boolean }> {
  return roomsFetch(`/api/rooms/${roomId}/video/end`, userId, { method: 'POST' });
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

/** Send a presence heartbeat so the caller shows as online for the next 60 s. */
export async function apiSendPresenceHeartbeat(
  userId: string,
  roomId: string
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/presence`, userId, { method: 'POST' });
}

/** Fetch the list of userIds currently online in this room (one-shot poll). */
export async function apiGetPresence(
  userId: string,
  roomId: string
): Promise<string[]> {
  const data = await roomsFetch<{ onlineUserIds: string[] }>(
    `/api/rooms/${roomId}/presence`,
    userId
  );
  return data.onlineUserIds;
}

/**
 * Exchange authenticated credentials for a short-lived one-time presence SSE
 * stream token.  The token is valid for 30 s and must be passed as ?token= in
 * the EventSource URL — EventSource cannot send custom headers.
 */
export async function apiGetPresenceStreamToken(
  userId: string,
  roomId: string
): Promise<string> {
  const data = await roomsFetch<{ token: string }>(
    `/api/rooms/${roomId}/presence/stream/token`,
    userId,
    { method: 'POST' }
  );
  return data.token;
}

/**
 * Build the EventSource URL for the presence SSE stream.
 * Call apiGetPresenceStreamToken first to obtain the token.
 */
export function apiPresenceStreamUrl(roomId: string, token: string): string {
  return getApiUrl(`/api/rooms/${roomId}/presence/stream?token=${encodeURIComponent(token)}`);
}

// ─── Session API ───────────────────────────────────────────────────────────

/** Start a new guided session. Leader only. */
export async function apiStartSession(
  userId: string,
  roomId: string,
  meetingMode: 'text' | 'audio' | 'video' = 'text',
): Promise<RoomSession> {
  const data = await roomsFetch<{ session: RoomSession }>(
    `/api/rooms/${roomId}/session/start`,
    userId,
    { method: 'POST', body: JSON.stringify({ meetingMode }) },
  );
  return data.session;
}

/** End the active session. Leader only. */
export async function apiEndSession(
  userId: string,
  roomId: string,
  status: 'completed' | 'ended' = 'ended'
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/session/end`, userId, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

/** Get the current active session, or null if none. */
export async function apiGetSession(
  userId: string,
  roomId: string
): Promise<RoomSession | null> {
  const data = await roomsFetch<{ session: RoomSession | null }>(
    `/api/rooms/${roomId}/session`, userId
  );
  return data.session;
}

/** Navigate the group to a step or scripture. Leader only. */
export async function apiNavigate(
  userId: string,
  roomId: string,
  payload: { stepId?: string; scripture?: ScriptureRef; leaderName?: string }
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/session/navigate`, userId, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/** Change the session mode (study / scripture / discussion / prayer / poll). Leader only. */
export async function apiChangeMode(
  userId: string,
  roomId: string,
  mode: SessionMode,
  leaderName?: string
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/session/mode`, userId, {
    method: 'POST',
    body: JSON.stringify({ mode, leaderName }),
  });
}

/** Broadcast a custom session event (focus_verse, poll_started, etc.). Leader only. */
export async function apiBroadcastEvent(
  userId: string,
  roomId: string,
  type: string,
  payload: Record<string, unknown>
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/session/broadcast`, userId, {
    method: 'POST',
    body: JSON.stringify({ type, payload }),
  });
}

/** Record that the current user joined the session (for attendance). */
export async function apiRecordAttendanceJoin(
  userId: string,
  roomId: string,
  sessionId: string
): Promise<SessionAttendee> {
  const data = await roomsFetch<{ ok: true; attendance: SessionAttendee }>(
    `/api/rooms/${roomId}/session/attendance/join`, userId, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
  return data.attendance;
}

/** Record that the current user left the session. */
export async function apiRecordAttendanceLeave(
  userId: string,
  roomId: string,
  sessionId: string
): Promise<void> {
  await roomsFetch(`/api/rooms/${roomId}/session/attendance/leave`, userId, {
    method: 'POST',
    body: JSON.stringify({ sessionId }),
  });
}

/** Get attendance list for a session. */
export async function apiGetSessionAttendance(
  userId: string,
  roomId: string,
  sessionId: string
): Promise<SessionAttendee[]> {
  const data = await roomsFetch<{ attendance: SessionAttendee[] }>(
    `/api/rooms/${roomId}/session/attendance?sessionId=${encodeURIComponent(sessionId)}`, userId
  );
  return data.attendance;
}

/**
 * Exchange credentials for a short-lived SSE session event stream token.
 */
export async function apiGetSessionEventsToken(
  userId: string,
  roomId: string
): Promise<string> {
  const data = await roomsFetch<{ token: string }>(
    `/api/rooms/${roomId}/session/events/token`, userId, { method: 'POST' }
  );
  return data.token;
}

/**
 * Build the EventSource URL for the session events SSE stream.
 */
export function apiSessionEventsUrl(roomId: string, token: string): string {
  return getApiUrl(`/api/rooms/${roomId}/session/events?token=${encodeURIComponent(token)}`);
}

// ─── Highlights ────────────────────────────────────────────────────────────────

/** Add a verse highlight for the current session. */
export async function apiAddHighlight(
  userId: string,
  roomId: string,
  params: {
    sessionId: string;
    book: string;
    chapter: number;
    verse: number;
    verseText?: string;
    note?: string;
    authorName?: string;
  }
): Promise<RoomHighlight> {
  const data = await roomsFetch<{ highlight: RoomHighlight }>(
    `/api/rooms/${roomId}/session/highlights`, userId,
    { method: 'POST', body: JSON.stringify(params) }
  );
  return data.highlight;
}

/** Get all highlights for a session. */
export async function apiGetHighlights(
  userId: string,
  roomId: string,
  sessionId: string
): Promise<RoomHighlight[]> {
  const data = await roomsFetch<{ highlights: RoomHighlight[] }>(
    `/api/rooms/${roomId}/session/highlights?sessionId=${encodeURIComponent(sessionId)}`, userId
  );
  return data.highlights;
}

/** Set a verse as the focus verse (leader only). */
export async function apiSetFocusVerse(
  userId: string,
  roomId: string,
  highlightId: string,
  sessionId: string
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/session/highlights/${encodeURIComponent(highlightId)}/focus`,
    userId,
    { method: 'POST', body: JSON.stringify({ sessionId }) }
  );
}

/** Clear the focus verse for a session (leader only). */
export async function apiClearFocusVerse(
  userId: string,
  roomId: string,
  sessionId: string
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/session/highlights/focus`,
    userId,
    { method: 'DELETE', body: JSON.stringify({ sessionId }) }
  );
}

// ─── Shared Notes ──────────────────────────────────────────────────────────────

/** Get all shared notes for a session. */
export async function apiGetSharedNotes(
  userId: string,
  roomId: string,
  sessionId: string
): Promise<SharedNote[]> {
  const data = await roomsFetch<{ notes: SharedNote[] }>(
    `/api/rooms/${roomId}/session/notes?sessionId=${encodeURIComponent(sessionId)}`, userId
  );
  return data.notes;
}

/** Post a shared note to the session. */
export async function apiAddSharedNote(
  userId: string,
  roomId: string,
  sessionId: string,
  text: string,
  authorName?: string
): Promise<SharedNote> {
  const data = await roomsFetch<{ note: SharedNote }>(
    `/api/rooms/${roomId}/session/notes`, userId,
    { method: 'POST', body: JSON.stringify({ sessionId, text, authorName }) }
  );
  return data.note;
}

/** Pin or unpin a note (leader only). */
export async function apiPinNote(
  userId: string,
  roomId: string,
  noteId: string,
  pin = true
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/session/notes/${encodeURIComponent(noteId)}/pin`,
    userId,
    { method: 'PATCH', body: JSON.stringify({ pin }) }
  );
}

// ─── Shared Ask Emmaus (Task #437) ────────────────────────────────────────────

/**
 * Ask a question together as a group. The HTTP response returns immediately;
 * the AI response streams to all members via the session SSE bus as
 * `emmaus_chunk` / `emmaus_done` events. Leader only.
 */
export async function apiSharedAskEmmaus(
  userId: string,
  roomId: string,
  sessionId: string,
  question: string,
  askerName?: string
): Promise<{ ok: boolean; question: string }> {
  return roomsFetch(
    `/api/rooms/${roomId}/session/ask-emmaus`,
    userId,
    { method: 'POST', body: JSON.stringify({ sessionId, question, askerName }) }
  );
}

/** Get all completed shared Emmaus answers for a session. */
export async function apiGetEmmausAnswers(
  userId: string,
  roomId: string,
  sessionId: string
): Promise<RoomEmmausAnswer[]> {
  const data = await roomsFetch<{ answers: RoomEmmausAnswer[] }>(
    `/api/rooms/${roomId}/session/emmaus-answers?sessionId=${encodeURIComponent(sessionId)}`,
    userId
  );
  return data.answers;
}

// ─── Polls (Task #437) ────────────────────────────────────────────────────────

/** Create a new poll and broadcast it to all session members. Leader only. */
export async function apiCreatePoll(
  userId: string,
  roomId: string,
  params: {
    sessionId: string;
    question: string;
    pollType?: 'yes_no' | 'multiple_choice';
    options?: string[];
  }
): Promise<RoomPoll> {
  const data = await roomsFetch<{ poll: RoomPoll }>(
    `/api/rooms/${roomId}/session/poll`,
    userId,
    { method: 'POST', body: JSON.stringify(params) }
  );
  return data.poll;
}

/** Get the active poll + current vote counts for the session. */
export async function apiGetActivePoll(
  userId: string,
  roomId: string,
  sessionId: string
): Promise<RoomPollResults | null> {
  const data = await roomsFetch<{ poll: RoomPollResults | null }>(
    `/api/rooms/${roomId}/session/poll?sessionId=${encodeURIComponent(sessionId)}`,
    userId
  );
  return data.poll;
}

/** Cast a vote on the active poll. Each member may vote only once. */
export async function apiCastVote(
  userId: string,
  roomId: string,
  pollId: string,
  optionIndex: number
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/session/poll/${encodeURIComponent(pollId)}/vote`,
    userId,
    { method: 'POST', body: JSON.stringify({ optionIndex }) }
  );
}

/** Reveal poll results to all members. Leader only. */
export async function apiRevealPoll(
  userId: string,
  roomId: string,
  pollId: string
): Promise<void> {
  await roomsFetch(
    `/api/rooms/${roomId}/session/poll/${encodeURIComponent(pollId)}/reveal`,
    userId,
    { method: 'POST' }
  );
}

/**
 * Formally complete the session: tallies summary data, marks all active attendees
 * as left, broadcasts session_complete to all members. Leader only.
 */
export async function apiCompleteSession(
  userId: string,
  roomId: string
): Promise<{
  ok: boolean;
  summary: { sessionId: string; modesEntered: string[]; memberCount: number; prayerRequestCount: number; sharedNoteCount: number };
}> {
  return roomsFetch(`/api/rooms/${roomId}/session/complete`, userId, { method: 'POST' });
}

/**
 * Acknowledge the Session Complete modal for a specific session so it is
 * never replayed on reconnect or on a different device.
 */
export async function apiAcknowledgeSessionCompletion(
  userId: string,
  roomId: string,
  sessionId: string
): Promise<{ ok: boolean }> {
  return roomsFetch(`/api/rooms/${roomId}/session/${sessionId}/acknowledge`, userId, { method: 'POST' });
}
