// ─── Emmaus Rooms — shared type definitions ───────────────────────────────
//
// Every Room has two independent dimensions:
//   1. Content Type  — what discipleship content the Room is built around
//   2. Permission Level (RoomType) — who can create and access the Room
//
// A Walk can be Personal or Ministry. A Bible Study can be Leadership or
// Ministry. The architecture supports any combination.

export type RoomRole = 'admin' | 'member';

// ─── Dimension 1: Permission Level ────────────────────────────────────────
/** Personal = any member; Ministry/Leadership = church-authorised; ChurchService = service-level. */
export type RoomType = 'personal' | 'ministry' | 'leadership' | 'church_service';

export function getRoomTypeLabel(roomType: RoomType): string {
  switch (roomType) {
    case 'personal':       return 'Personal';
    case 'ministry':       return 'Ministry';
    case 'leadership':     return 'Leadership';
    case 'church_service': return 'Church Service';
    default:               return 'Room';
  }
}

// ─── Dimension 2: Content Type ────────────────────────────────────────────
/** What kind of discipleship content the Room is built around. */
export type ContentType =
  | 'walk'
  | 'journey'
  | 'devotional'
  | 'bible-study'
  | 'sermon-companion';

export function getContentTypeLabel(contentType: ContentType | null | undefined): string {
  switch (contentType) {
    case 'walk':             return 'Walk Room';
    case 'journey':          return 'Journey Room';
    case 'devotional':       return 'Daily Devotional Room';
    case 'bible-study':      return 'Bible Study Room';
    case 'sermon-companion': return 'Sermon Companion Room';
    default:                 return 'Study Room';
  }
}

/** Short label for badges and headers. */
export function getContentTypeShortLabel(contentType: ContentType | null | undefined): string {
  switch (contentType) {
    case 'walk':             return 'Walk';
    case 'journey':          return 'Journey';
    case 'devotional':       return 'Devotional';
    case 'bible-study':      return 'Bible Study';
    case 'sermon-companion': return 'Sermon Companion';
    default:                 return 'Study';
  }
}

// ─── Room interfaces ──────────────────────────────────────────────────────

export interface RoomSummary {
  id: string;
  name: string;
  description: string;
  /** Dimension 1: permission level. */
  roomType: RoomType;
  /** Dimension 2: content category. */
  contentType: ContentType | null;
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

// ─── Prayer requests ──────────────────────────────────────────────────────

export interface PrayerRequest {
  id: string;
  roomId: string;
  userId: string;
  authorName: string;
  request: string;
  isAnswered: boolean;
  createdAt: string;
}

// ─── Video session (Step 2 — paused pending V1 architecture approval) ─────

export interface VideoSessionStatus {
  /** false when LiveKit secrets are not yet configured */
  configured: boolean;
  /** Message shown when configured = false */
  message?: string;
  videoEnabled?: boolean;
  videoActive: boolean;
  startedAt: string | null;
  startedBy: string | null;
  livekitRoomName: string | null;
  /** WebSocket URL safe to expose to browser (no secrets) */
  livekitUrl: string | null;
  /** Whether the current user can start / end video */
  canHost?: boolean;
}

// ─── Chat ─────────────────────────────────────────────────────────────────

export interface RoomMessage {
  id: string;
  roomId: string;
  userId: string;
  senderName: string;
  body: string;
  createdAt: string;
}

// ─── Guided session ───────────────────────────────────────────────────────

export type SessionMode = 'study' | 'scripture' | 'discussion' | 'prayer' | 'poll';

export interface ScriptureRef {
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  displayLabel?: string;
}

export interface RoomSession {
  id: string;
  roomId: string;
  startedBy: string;
  startedAt: string;
  endedAt: string | null;
  status: 'active' | 'completed' | 'ended';
  currentMode: SessionMode;
  currentStep: string | null;
  currentScripture: ScriptureRef | null;
  sessionPlan: unknown[];
  poll: unknown | null;
  metadata: Record<string, unknown>;
}

// ─── Highlights & Shared Notes ────────────────────────────────────────────────

export interface RoomHighlight {
  id: string;
  sessionId: string;
  roomId: string;
  userId: string;
  authorName: string;
  book: string;
  chapter: number;
  verse: number;
  verseText: string;
  note: string | null;
  isFocusVerse: boolean;
  createdAt: string;
}

export interface SharedNote {
  id: string;
  sessionId: string;
  roomId: string;
  userId: string;
  authorName: string;
  text: string;
  isPinned: boolean;
  createdAt: string;
}

export type SessionEventType =
  | 'session_started'
  | 'session_ended'
  | 'navigate'
  | 'mode_change'
  | 'focus_verse'
  | 'poll_started'
  | 'poll_result'
  | 'session_state'
  | 'highlight_added'
  | 'highlight_focus_changed'
  | 'note_added'
  | 'note_pinned';

export interface SessionEvent {
  type: SessionEventType;
  payload: Record<string, unknown>;
  sentBy: string;
  at: string;
}

export interface SessionAttendee {
  userId: string;
  preferredName: string;
  joinedAt: string;
  leftAt: string | null;
}
