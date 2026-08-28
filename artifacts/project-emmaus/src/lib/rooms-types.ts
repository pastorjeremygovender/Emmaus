// ─── Emmaus Rooms — shared type definitions ───────────────────────────────
//
// Every Room has two independent dimensions:
//   1. Content Type  — what discipleship content the Room is built around
//   2. Permission Level (RoomType) — who can create and access the Room
//
// A Walk can be Personal or Ministry. A Bible Study can be Leadership or
// Ministry. The architecture supports any combination.

/** `admin` remains accepted at the API boundary for pre-migration data. */
export type RoomRole = 'owner' | 'leader' | 'member' | 'admin';

export function isRoomLeaderRole(role: RoomRole | null | undefined): boolean {
  return role === 'owner' || role === 'leader' || role === 'admin';
}

export function isRoomOwnerRole(role: RoomRole | null | undefined): boolean {
  return role === 'owner' || role === 'admin';
}

export function getRoomRoleLabel(role: RoomRole): string {
  if (role === 'owner' || role === 'admin') return 'Owner';
  if (role === 'leader') return 'Leader';
  return 'Member';
}

// ─── Dimension 1: Permission Level ────────────────────────────────────────
/** The seven group types available in Groups V2. */
export type RoomType =
  | 'personal'
  | 'family'
  | 'friends'
  | 'marriage'
  | 'discipleship'
  | 'leadership'
  | 'church';

export function getRoomTypeLabel(roomType: RoomType): string {
  switch (roomType) {
    case 'personal':     return 'Personal';
    case 'family':       return 'Family';
    case 'friends':      return 'Friends';
    case 'marriage':     return 'Marriage';
    case 'discipleship': return 'Discipleship';
    case 'leadership':   return 'Leadership';
    case 'church':       return 'Church';
    default:             return 'Group';
  }
}

/** Types that are eligible for video meeting controls. */
export const LIVE_MEETING_TYPES: RoomType[] = ['leadership', 'church'];

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
  /** Present on member-facing list responses; absent on server summaries. */
  currentUserRole?: RoomRole;
  /** Groups V2: short message from the leader for all members. */
  leaderNote?: string | null;
  /** Groups V2: ISO timestamp of the next scheduled meeting. */
  nextMeeting?: string | null;
  /** Groups V2: when true Today's Study is hidden until a session starts. */
  revealOnMeeting?: boolean;
}

export interface RoomInvitePreview {
  id: string;
  name: string;
  description: string;
  roomType: RoomType;
  contentType: ContentType | null;
  adminName: string;
  memberCount: number;
  isMember: boolean;
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
  /** Server-computed: true when the requesting user is an appointed Owner or Leader. */
  isLeader: boolean;
  /** The currently active session for this room, if one is running. Included
   *  on initial load so members see the Meeting phase immediately without
   *  waiting for the SSE session_state event. */
  activeSession?: RoomSession | null;
  /** When true, members may present their own shared media (default false). */
  allowMemberPresent?: boolean;
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
  meetingMode?: 'audio' | 'video';
}

// ─── Media attachments ────────────────────────────────────────────────────────

export type MediaAttachmentType = 'image' | 'pdf' | 'video' | 'voice' | 'document' | 'link';

export interface MediaAttachment {
  type: MediaAttachmentType;
  filename: string;
  /** Normalised object path, e.g. /objects/uploads/<uuid>.  Empty for link type. */
  objectPath: string;
  mimeType: string;
  size: number;
  caption?: string;
  /** Duration in seconds — voice/video only. */
  duration?: number;
  /** Page count — PDF only. */
  pageCount?: number;
  /** URL — link type only. */
  url?: string;
  /** Set when a leader removes the media while retaining the discussion message. */
  removed?: boolean;
  /** Whether participants may view this item before the meeting starts. */
  sharedBeforeMeeting?: boolean;
}

export interface PresentationState {
  messageId: string | null;
  filename: string;
  mediaType: MediaAttachmentType;
  objectPath: string;
  presentedBy: string;
  presentedByName: string;
  currentPage: number;
  /** Total page count — PDF only. Undefined when unknown. */
  pageCount?: number;
}

export interface RoomMediaItem {
  messageId: string;
  userId: string;
  senderName: string;
  attachment: MediaAttachment;
  createdAt: string;
}

// ─── Chat ─────────────────────────────────────────────────────────────────

export interface RoomMessage {
  id: string;
  /** Transient sender-generated ID used to reconcile optimistic and SSE copies. */
  clientMessageId?: string;
  roomId: string;
  userId: string;
  senderName: string;
  body: string;
  createdAt: string;
  attachment?: MediaAttachment | null;
  discussionId?: string | null;
  /** Realtime tombstone emitted when a post is deleted. */
  deleted?: boolean;
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
  | 'session_complete'
  | 'attendance_changed'
  | 'navigate'
  | 'mode_change'
  | 'focus_verse'
  | 'poll_started'
  | 'poll_vote_count'
  | 'poll_revealed'
  | 'poll_result'
  | 'emmaus_started'
  | 'emmaus_chunk'
  | 'emmaus_done'
  | 'session_state'
  | 'highlight_added'
  | 'highlight_focus_changed'
  | 'note_added'
  | 'note_pinned'
  | 'media_presented'
  | 'presentation_page'
  | 'presentation_stopped'
   | 'tool_closed'
  | 'OPEN_GROUP_DISCUSSION';

export interface SessionCompleteSummary {
  sessionId: string;
  modesEntered: string[];
  memberCount: number;
  prayerRequestCount: number;
  sharedNoteCount: number;
}

export interface SessionEvent {
  type: SessionEventType;
  payload: Record<string, unknown>;
  sentBy: string;
  at: string;
}

export interface SessionAttendee {
  /** Server attendance row identifier, returned after an explicit join. */
  id?: string;
  userId: string;
  preferredName: string;
  joinedAt: string;
  leftAt: string | null;
}

// ─── Polls & Shared Ask Emmaus (Task #437) ────────────────────────────────────

export interface RoomPoll {
  id: string;
  sessionId: string;
  roomId: string;
  createdBy: string;
  question: string;
  pollType: 'yes_no' | 'multiple_choice';
  options: string[];
  resultsRevealed: boolean;
  createdAt: string;
}

export interface RoomPollResults {
  poll: RoomPoll;
  voteCounts: number[];
  totalVotes: number;
  userVotedIndex: number | null;
}

export interface RoomEmmausAnswer {
  id: string;
  sessionId: string;
  roomId: string;
  askedBy: string;
  question: string;
  answer: string;
  createdAt: string;
}
