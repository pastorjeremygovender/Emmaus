// ─── Emmaus Rooms — shared type definitions ───────────────────────────────
// Simplified to match the live API (Admin + Member roles only).

export type RoomRole = 'admin' | 'member';

/** Personal = any member; Ministry/Leadership = church-authorised; ChurchService = future. */
export type RoomType = 'personal' | 'ministry' | 'leadership' | 'church_service';

export interface RoomSummary {
  id: string;
  name: string;
  description: string;
  roomType: RoomType;
  linkedContentId?: string | null;
  linkedContentType?: string | null;
  inviteCode: string;
  inviteToken: string;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  adminName: string;
}

export interface RoomMember {
  userId: string;
  preferredName: string;
  role: RoomRole;
  joinedAt: string;
}

export interface LinkedJourney {
  journeyId: string;
  startedBy: string;
  startedAt: string;
}

export interface RoomDetail extends RoomSummary {
  members: RoomMember[];
  linkedJourneys: LinkedJourney[];
  currentUserRole: RoomRole;
}

export interface MemberJourneyProgress {
  userId: string;
  preferredName: string;
  currentDay: number | null;
  status: string | null; // 'active' | 'paused' | 'completed' | 'dropped' | null (not started)
}

export interface RoomMessage {
  id: string;
  roomId: string;
  userId: string;
  senderName: string;
  body: string;
  createdAt: string;
}
