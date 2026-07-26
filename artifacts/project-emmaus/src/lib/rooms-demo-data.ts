// ─── Emmaus Rooms — demo data (localStorage seed) ─────────────────────────
// All IDs are stable so they survive page refresh in demo mode.

import type {
  Room,
  RoomMember,
  RoomInvite,
  RoomJourneyInvitation,
  RoomJourneyParticipant,
  RoomPost,
  SharedReflection,
  RoomNotification,
} from './rooms-types';

// ── Demo users referenced in room data ────────────────────────────────────
// demo-user-1 = DEMO_USER  ("Friend")        email: demo@emmaus.church
// demo-user-2 = DEMO_USER_2 ("Sarah")        email: friend@emmaus.church
// demo-admin-1 = DEMO_ADMIN ("Jeremy")        email: pastor@emmaus.church (admin only)

export const DEMO_USER_2 = {
  id: 'demo-user-2',
  email: 'friend@emmaus.church',
  preferredName: 'Sarah',
  role: 'user' as const,
  createdAt: new Date().toISOString(),
  lastActiveAt: new Date().toISOString(),
  currentFeeling: null,
  feelingUpdatedAt: null,
};

// ── Rooms ──────────────────────────────────────────────────────────────────
export const DEMO_ROOMS: Room[] = [
  {
    id: 'room-demo-1',
    name: 'Govender Family',
    type: 'Family',
    ownerId: 'demo-user-1',
    status: 'active',
    inviteExpiryDefault: 'never',
    createdAt: '2026-07-14T08:00:00.000Z',
    updatedAt: '2026-07-14T08:00:00.000Z',
  },
];

// ── Room Members ───────────────────────────────────────────────────────────
export const DEMO_ROOM_MEMBERS: RoomMember[] = [
  {
    id: 'rm-demo-1',
    roomId: 'room-demo-1',
    userId: 'demo-user-1',
    role: 'Owner',
    joinedAt: '2026-07-14T08:00:00.000Z',
    invitedBy: 'demo-user-1',
    status: 'active',
  },
  {
    id: 'rm-demo-2',
    roomId: 'room-demo-1',
    userId: 'demo-user-2',
    role: 'Member',
    joinedAt: '2026-07-14T09:30:00.000Z',
    invitedBy: 'demo-user-1',
    status: 'active',
  },
];

// ── Room Invites ───────────────────────────────────────────────────────────
export const DEMO_ROOM_INVITES: RoomInvite[] = [
  {
    id: 'invite-demo-1',
    roomId: 'room-demo-1',
    token: 'demo-token-govender-family-2026',
    accessCode: 'EMMAUS01',
    createdBy: 'demo-user-1',
    expiresAt: null, // never expires
    revokedAt: null,
    maxUses: null,
    useCount: 1,
    createdAt: '2026-07-14T08:00:00.000Z',
  },
];

// ── Room Journey Invitations ───────────────────────────────────────────────
export const DEMO_ROOM_JOURNEY_INVITATIONS: RoomJourneyInvitation[] = [
  {
    id: 'rji-demo-1',
    roomId: 'room-demo-1',
    journeyId: '15-minutes-with-jesus',
    createdBy: 'demo-user-1',
    status: 'open',
    createdAt: '2026-07-15T07:00:00.000Z',
    closedAt: null,
  },
];

// ── Room Journey Participants ──────────────────────────────────────────────
export const DEMO_ROOM_JOURNEY_PARTICIPANTS: RoomJourneyParticipant[] = [
  {
    id: 'rjp-demo-1',
    roomJourneyInvitationId: 'rji-demo-1',
    roomId: 'room-demo-1',
    journeyId: '15-minutes-with-jesus',
    userId: 'demo-user-1',
    userJourneyProgressId: '15-minutes-with-jesus',
    participationStatus: 'joined',
    joinedAt: '2026-07-15T07:00:00.000Z',
  },
  {
    id: 'rjp-demo-2',
    roomJourneyInvitationId: 'rji-demo-1',
    roomId: 'room-demo-1',
    journeyId: '15-minutes-with-jesus',
    userId: 'demo-user-2',
    userJourneyProgressId: '15-minutes-with-jesus',
    participationStatus: 'pending',
    joinedAt: null,
  },
];

// ── Room Posts (Discussion) ────────────────────────────────────────────────
export const DEMO_ROOM_POSTS: RoomPost[] = [
  {
    id: 'post-demo-1',
    roomId: 'room-demo-1',
    journeyId: '15-minutes-with-jesus',
    journeyStepId: 'day-1',
    userId: 'demo-user-1',
    body: "Loved today's reading. The idea that Jesus comes to us — we don't have to have it together first — really spoke to me.",
    status: 'active',
    createdAt: '2026-07-15T08:30:00.000Z',
    updatedAt: '2026-07-15T08:30:00.000Z',
  },
];

// ── Shared Reflections ─────────────────────────────────────────────────────
export const DEMO_SHARED_REFLECTIONS: SharedReflection[] = [];

// ── Room Notifications ─────────────────────────────────────────────────────
export const DEMO_ROOM_NOTIFICATIONS: RoomNotification[] = [
  {
    id: 'notif-demo-1',
    userId: 'demo-user-2',
    type: 'journey_invite',
    roomId: 'room-demo-1',
    journeyId: '15-minutes-with-jesus',
    fromUserId: 'demo-user-1',
    message: 'Friend has invited Govender Family to begin: 10 Minutes with Jesus',
    read: false,
    createdAt: '2026-07-15T07:00:00.000Z',
  },
];
