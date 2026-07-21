// ─── Emmaus Rooms — shared type definitions ───────────────────────────────

export type RoomType =
  | 'Family'
  | 'Friends'
  | 'Couple'
  | 'Small Group'
  | 'Ministry Team'
  | 'Other';

export type RoomStatus = 'active' | 'archived' | 'deleted';
export type RoomRole = 'Owner' | 'Leader' | 'Member';
export type RoomMemberStatus = 'active' | 'removed' | 'left';
export type InviteExpiry = '24h' | '7d' | 'never';
export type JourneyInvitationStatus = 'open' | 'closed' | 'completed';
export type ParticipationStatus = 'pending' | 'joined' | 'declined';
export type PostStatus = 'active' | 'removed';
export type NotificationType =
  | 'room_invite'
  | 'room_accepted'
  | 'journey_invite'
  | 'reflection_shared'
  | 'journey_completed';

export interface Room {
  id: string;
  name: string;
  type: RoomType;
  ownerId: string;
  status: RoomStatus;
  inviteExpiryDefault: InviteExpiry;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

export interface RoomMember {
  id: string;
  roomId: string;
  userId: string;
  role: RoomRole;
  joinedAt: string;
  invitedBy: string;
  status: RoomMemberStatus;
}

export interface RoomInvite {
  id: string;
  roomId: string;
  /** Opaque token used in /join-room/:token links */
  token: string;
  /** Short human-readable code e.g. "EMMAUS01" */
  accessCode: string;
  createdBy: string;
  /** ISO string or null = never expires */
  expiresAt: string | null;
  revokedAt: string | null;
  maxUses: number | null;
  useCount: number;
  createdAt: string;
}

export interface RoomJourneyInvitation {
  id: string;
  roomId: string;
  journeyId: string;
  createdBy: string;
  status: JourneyInvitationStatus;
  createdAt: string;
  closedAt: string | null;
}

export interface RoomJourneyParticipant {
  id: string;
  roomJourneyInvitationId: string;
  roomId: string;
  journeyId: string;
  userId: string;
  /** References the progress key used in JourneyContext (journeyId) */
  userJourneyProgressId: string;
  participationStatus: ParticipationStatus;
  joinedAt: string | null;
}

export interface RoomPost {
  id: string;
  roomId: string;
  journeyId: string;
  journeyStepId: string; // "day-N"
  userId: string;
  body: string;
  status: PostStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SharedReflection {
  id: string;
  /** Key used in JourneyContext reflections map: "{journeyId}-{day}" */
  userReflectionKey: string;
  roomId: string;
  journeyId: string;
  journeyStepId: string; // "day-N"
  userId: string;
  sharedAt: string;
  revokedAt: string | null;
}

export interface RoomNotification {
  id: string;
  userId: string;
  type: NotificationType;
  roomId?: string;
  journeyId?: string;
  fromUserId?: string;
  message: string;
  read: boolean;
  createdAt: string;
}

// ─── Helper display types ──────────────────────────────────────────────────

/** User display info safe to expose within a Room */
export interface RoomMemberDisplay {
  userId: string;
  displayName: string;
  role: RoomRole;
  initials: string;
}
