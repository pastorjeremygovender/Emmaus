/**
 * room-store.ts — PostgreSQL CRUD for the Rooms feature.
 *
 * Rooms are invite-only groups. Members join via a 7-char code or a UUID link
 * token. Each room has one Owner, optional Leaders, shared
 * chat, and optionally linked journeys.
 */

import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoomType = "personal" | "family" | "friends" | "marriage" | "discipleship" | "leadership" | "church";

/** Content dimension: what kind of content the Room is built around. */
export type ContentType = "walk" | "journey" | "devotional" | "bible-study" | "sermon-companion";

export interface RoomMember {
  userId: string;
  preferredName: string;
  role: RoomRole;
  joinedAt: string;
}

/** Group-scoped permissions. `admin` is retained only for old API clients. */
export type RoomRole = "owner" | "leader" | "member" | "admin";

export function isRoomLeaderRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "leader" || role === "admin";
}

export function isRoomOwnerRole(role: string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

/** Host permission is derived only from the room membership role. */
export function canHostWithRoomRole(role: string | null | undefined): boolean {
  return isRoomLeaderRole(role);
}

export interface RoomSummary {
  id: string;
  name: string;
  description: string;
  /** Permission dimension — who can create / access this Room. */
  roomType: RoomType;
  /** Content dimension — what discipleship content this Room is built around. */
  contentType: ContentType | null;
  linkedContentId: string | null;
  linkedContentType: string | null;
  inviteCode: string;
  inviteToken: string;
  createdBy: string;
  createdAt: string;
  memberCount: number;
  adminName: string;
  /** Groups V2: short message from the leader, visible to all members. */
  leaderNote: string | null;
  /** Groups V2: timestamp of the next scheduled meeting. */
  nextMeeting: string | null;
  /** Groups V2: when true, hide Today's Study until a meeting session is started. */
  revealOnMeeting: boolean;
  /** When true, members may present their own shared media (default false). */
  allowMemberPresent: boolean;
}

export interface RoomDetail extends RoomSummary {
  members: RoomMember[];
  linkedJourneys: LinkedJourney[];
}

/** Safe, non-mutating information shown before a member accepts an invitation. */
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

export interface LinkedJourney {
  journeyId: string;
  startedBy: string;
  startedAt: string;
}

export interface MediaAttachment {
  type: 'image' | 'pdf' | 'video' | 'voice' | 'document' | 'link';
  filename: string;
  /** Normalised object path e.g. /objects/uploads/<uuid>. Empty for link type. */
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
  /** Whether participants may view this item on the pre-meeting preparation screen. */
  sharedBeforeMeeting?: boolean;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  userId: string;
  senderName: string;
  body: string;
  createdAt: string;
  attachment?: MediaAttachment | null;
  discussionId?: string | null;
}

export interface RoomMediaItem {
  messageId: string;
  userId: string;
  senderName: string;
  attachment: MediaAttachment;
  createdAt: string;
}

export class RoomMediaStorageCleanupError extends Error {
  constructor(cause?: unknown) {
    super("Stored media could not be removed. No catalogue changes were saved.");
    this.name = "RoomMediaStorageCleanupError";
    Object.setPrototypeOf(this, RoomMediaStorageCleanupError.prototype);
    if (cause !== undefined) this.cause = cause;
  }
}

export interface RemoveRoomMediaResult {
  status: "removed" | "already_removed" | "not_found";
  messageId: string;
  presentationStopped: boolean;
}

export interface MediaPresentation {
  id: string;
  roomId: string;
  sessionId: string | null;
  messageId: string | null;
  filename: string;
  mediaType: string;
  objectPath: string;
  presentedBy: string;
  presentedByName: string;
  currentPage: number;
  /** Total page count — PDF only. Null when not set. */
  pageCount: number | null;
  startedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a 7-char uppercase invite code, retrying up to 5 times on collision.
 */
async function generateInviteCode(): Promise<string> {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = "";
    for (let i = 0; i < 7; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    const existing = await pool.query(
      `SELECT 1 FROM rooms WHERE invite_code = $1`,
      [code]
    );
    if (existing.rowCount === 0) return code;
  }
  throw new Error("Failed to generate a unique invite code after 5 attempts");
}

/**
 * Resolve a userId to a display name via user_profiles.
 * Falls back to the first segment of the userId (before @) when no profile exists.
 */
function resolveDisplayName(row: Record<string, unknown>, userIdField: string, nameField: string): string {
  if (row[nameField] && String(row[nameField]).trim()) {
    return String(row[nameField]).trim();
  }
  const uid = String(row[userIdField] ?? "");
  return uid.split("@")[0] || uid;
}

function rowToMember(row: Record<string, unknown>): RoomMember {
  return {
    userId: String(row.user_id),
    // Return the raw preferred_name (trimmed) or empty string — never a raw
    // userId fragment.  Callers (admin and member UIs) apply their own label
    // ("No name set", "Member", etc.) when this is empty.
    preferredName:
      row.preferred_name && String(row.preferred_name).trim()
        ? String(row.preferred_name).trim()
        : "",
    role: (row.role as RoomRole) ?? "member",
    joinedAt: String(row.joined_at ?? ""),
  };
}

function rowToSummary(row: Record<string, unknown>): RoomSummary {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    roomType: (String(row.room_type ?? "personal")) as RoomType,
    contentType: row.content_type ? (String(row.content_type) as ContentType) : null,
    linkedContentId: row.linked_content_id ? String(row.linked_content_id) : null,
    linkedContentType: row.linked_content_type ? String(row.linked_content_type) : null,
    inviteCode: String(row.invite_code ?? ""),
    inviteToken: String(row.invite_token ?? ""),
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? ""),
    memberCount: Number(row.member_count ?? 0),
    // Return empty string when admin has no profile — UI applies its own label.
    adminName:
      row.admin_preferred_name && String(row.admin_preferred_name).trim()
        ? String(row.admin_preferred_name).trim()
        : "",
    // Groups V2 fields (nullable — added by startup migration)
    leaderNote: row.leader_note ? String(row.leader_note) : null,
    nextMeeting: row.next_meeting ? String(row.next_meeting) : null,
    revealOnMeeting: Boolean(row.reveal_on_meeting ?? false),
    allowMemberPresent: Boolean(row.allow_member_present ?? false),
  };
}

function rowToPresentation(row: Record<string, unknown>): MediaPresentation {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    sessionId: row.session_id ? String(row.session_id) : null,
    messageId: row.message_id ? String(row.message_id) : null,
    filename: String(row.filename ?? ""),
    mediaType: String(row.media_type ?? ""),
    objectPath: String(row.object_path ?? ""),
    presentedBy: String(row.presented_by ?? ""),
    presentedByName: String(row.presented_by_name ?? ""),
    currentPage: Number(row.current_page ?? 1),
    pageCount: row.page_count != null ? Number(row.page_count) : null,
    startedAt: String(row.started_at ?? ""),
  };
}

function rowToMessage(row: Record<string, unknown>): RoomMessage {
  const rawName =
    row.preferred_name && String(row.preferred_name).trim()
      ? String(row.preferred_name).trim()
      : "";
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    userId: String(row.user_id),
    // Fall back to "Member" so chat never displays a raw userId.
    senderName: rawName || "Member",
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? ""),
    attachment: row.attachment ? (row.attachment as MediaAttachment) : null,
    discussionId: row.discussion_id ? String(row.discussion_id) : null,
  };
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

export async function createRoom(
  name: string,
  createdBy: string,
  description = "",
  roomType: RoomType = "personal",
  linkedContentId?: string,
  linkedContentType?: string,
  contentType?: ContentType
): Promise<{ roomId: string; inviteCode: string; inviteToken: string }> {
  const inviteCode = await generateInviteCode();
  const inviteToken = randomUUID();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `INSERT INTO rooms (name, description, invite_code, invite_token, created_by, room_type,
                          linked_content_id, linked_content_type, content_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, invite_code, invite_token`,
      [name, description.trim(), inviteCode, inviteToken, createdBy, roomType,
       linkedContentId ?? null, linkedContentType ?? null, contentType ?? null]
    );
    const { id: roomId } = res.rows[0];

    // Creator becomes the Owner member automatically.
    await client.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [roomId, createdBy]
    );

    await client.query("COMMIT");
    return { roomId, inviteCode, inviteToken };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Check whether a user is permitted to create a given room type.
 *
 * Per the Emmaus Rooms permission model (2026-08):
 *   personal / ministry / leadership — any authenticated user
 *   church_service                   — admin / superAdmin only
 *
 * Creating a Room does NOT require leader authorization.
 * Leader-only tools (Gather Together, Guide Group, etc.) are gated separately
 * by isAuthorizedLeader() at point of use — not at room creation time.
 */
export async function canCreateRoomType(
  userId: string,
  roomType: RoomType,
  appRole: string
): Promise<boolean> {
  // Church rooms are admin-only (whole-church broadcast context)
  if (roomType === "church") {
    return appRole === "admin" || appRole === "superAdmin";
  }
  // All other room types: any authenticated user may create
  return true;
}

/**
 * Returns every room in the database — for application-admin use only.
 * Never call this from a member-facing route; use getRoomsForUser() instead.
 */
export async function getAllRoomsAdmin(): Promise<RoomSummary[]> {
  const res = await pool.query(
    `SELECT r.*,
            COUNT(rm.user_id)  AS member_count,
            up.preferred_name  AS admin_preferred_name,
            rm_admin.user_id   AS admin_user_id
     FROM   rooms r
     LEFT JOIN room_members rm       ON rm.room_id = r.id
     LEFT JOIN room_members rm_admin
       ON rm_admin.room_id = r.id AND rm_admin.role IN ('owner', 'admin')
     LEFT JOIN user_profiles up
       ON up.auth_subject = rm_admin.user_id OR up.email = rm_admin.user_id
     GROUP BY r.id, up.preferred_name, rm_admin.user_id
     ORDER BY r.created_at DESC`
  );
  return res.rows.map(rowToSummary);
}
export async function getRoomsForUser(
  userId: string
): Promise<Array<RoomSummary & { currentUserRole: RoomRole }>> {
  const res = await pool.query(
    `SELECT r.*,
            rm.role            AS current_user_role,
            COUNT(rm2.user_id) AS member_count,
            up.preferred_name  AS admin_preferred_name,
            rm_admin.user_id   AS admin_user_id
     FROM   rooms r
     JOIN   room_members rm ON rm.room_id = r.id AND rm.user_id = $1
     JOIN   room_members rm2 ON rm2.room_id = r.id
      LEFT JOIN room_members rm_admin
        ON rm_admin.room_id = r.id AND rm_admin.role IN ('owner', 'admin')
     LEFT JOIN user_profiles up
       ON up.auth_subject = rm_admin.user_id OR up.email = rm_admin.user_id
     GROUP  BY r.id, up.preferred_name, rm_admin.user_id, rm.role
     ORDER  BY r.created_at DESC`,
    [userId]
  );
  return res.rows.map(row => ({
    ...rowToSummary(row),
    currentUserRole: (row.current_user_role as RoomRole) ?? "member",
  }));
}

export async function getRoomById(roomId: string): Promise<RoomDetail | null> {
  const roomRes = await pool.query(
    `SELECT r.*,
            COUNT(rm.user_id) AS member_count,
            up.preferred_name AS admin_preferred_name
     FROM   rooms r
     LEFT JOIN room_members rm ON rm.room_id = r.id
     LEFT JOIN room_members rm_admin
       ON rm_admin.room_id = r.id AND rm_admin.role IN ('owner', 'admin')
     LEFT JOIN user_profiles up
       ON up.auth_subject = rm_admin.user_id OR up.email = rm_admin.user_id
     WHERE  r.id = $1
     GROUP  BY r.id, up.preferred_name`,
    [roomId]
  );
  if (!roomRes.rows[0]) return null;

  const membersRes = await pool.query(
    `SELECT rm.user_id, rm.role, rm.joined_at, up.preferred_name
     FROM   room_members rm
     LEFT JOIN user_profiles up
       ON up.auth_subject = rm.user_id OR up.email = rm.user_id
     WHERE  rm.room_id = $1
     ORDER  BY rm.joined_at ASC`,
    [roomId]
  );

  const journeysRes = await pool.query(
    `SELECT journey_id, started_by, started_at
     FROM   room_journeys
     WHERE  room_id = $1
     ORDER  BY started_at ASC`,
    [roomId]
  );

  return {
    ...rowToSummary(roomRes.rows[0]),
    members: membersRes.rows.map(rowToMember),
    linkedJourneys: journeysRes.rows.map(r => ({
      journeyId: String(r.journey_id),
      startedBy: String(r.started_by),
      startedAt: String(r.started_at),
    })),
  };
}

// ─── Membership ───────────────────────────────────────────────────────────────

async function getInvitePreview(
  whereClause: string,
  value: string,
  userId?: string,
): Promise<RoomInvitePreview | null> {
  const res = await pool.query(
    `SELECT r.id, r.name, r.description, r.room_type, r.content_type,
            COUNT(DISTINCT rm_all.user_id) AS member_count,
            up.preferred_name AS admin_preferred_name,
            EXISTS (
              SELECT 1 FROM room_members rm_self
              WHERE rm_self.room_id = r.id AND rm_self.user_id = $2
            ) AS is_member
     FROM rooms r
     LEFT JOIN room_members rm_all ON rm_all.room_id = r.id
     LEFT JOIN room_members rm_admin
       ON rm_admin.room_id = r.id AND rm_admin.role IN ('owner', 'admin')
     LEFT JOIN user_profiles up
       ON up.auth_subject = rm_admin.user_id OR up.email = rm_admin.user_id
     WHERE ${whereClause}
     GROUP BY r.id, up.preferred_name`,
    [value, userId ?? null],
  );
  const row = res.rows[0];
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: String(row.description ?? ""),
    roomType: String(row.room_type ?? "personal") as RoomType,
    contentType: row.content_type ? String(row.content_type) as ContentType : null,
    adminName: row.admin_preferred_name ? String(row.admin_preferred_name).trim() : "",
    memberCount: Number(row.member_count ?? 0),
    isMember: Boolean(row.is_member),
  };
}

export function getRoomInvitePreviewByToken(
  inviteToken: string,
  userId?: string,
): Promise<RoomInvitePreview | null> {
  return getInvitePreview("r.invite_token = $1", inviteToken, userId);
}

export function getRoomInvitePreviewByCode(
  inviteCode: string,
  userId?: string,
): Promise<RoomInvitePreview | null> {
  return getInvitePreview("r.invite_code = $1", inviteCode.trim().toUpperCase(), userId);
}

/** Fetch only the room_type for a room — used for server-side video eligibility gate. */
export async function getRoomType(roomId: string): Promise<RoomType | null> {
  const { rows } = await pool.query(
    `SELECT room_type FROM rooms WHERE id = $1`,
    [roomId]
  );
  return (rows[0]?.room_type as RoomType) ?? null;
}

/** The room types that are eligible for live video meetings. */
export const LIVE_MEETING_TYPES_SERVER: RoomType[] = ["leadership", "church"];

export async function getMemberRole(
  roomId: string,
  userId: string
): Promise<RoomRole | null> {
  const res = await pool.query(
    `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  return res.rows[0]?.role ?? null;
}

export async function joinByCode(
  inviteCode: string,
  userId: string
): Promise<{ roomId: string; alreadyMember: boolean } | null> {
  const roomRes = await pool.query(
    `SELECT id FROM rooms WHERE invite_code = $1`,
    [inviteCode.toUpperCase()]
  );
  if (!roomRes.rows[0]) return null;
  const { id: roomId } = roomRes.rows[0];

  const insertRes = await pool.query(
    `INSERT INTO room_members (room_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [roomId, userId]
  );
  return { roomId, alreadyMember: insertRes.rowCount === 0 };
}

export async function joinByToken(
  inviteToken: string,
  userId: string
): Promise<{ roomId: string; alreadyMember: boolean } | null> {
  const roomRes = await pool.query(
    `SELECT id FROM rooms WHERE invite_token = $1`,
    [inviteToken]
  );
  if (!roomRes.rows[0]) return null;
  const { id: roomId } = roomRes.rows[0];

  const insertRes = await pool.query(
    `INSERT INTO room_members (room_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [roomId, userId]
  );
  return { roomId, alreadyMember: insertRes.rowCount === 0 };
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  await pool.query(
    `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  // Close any open chat + presence SSE streams for the departed member immediately
  terminateUserFromRoom(roomId, userId);
  terminatePresenceUserFromRoom(roomId, userId);
  // Remove both heartbeat and connection-count entries so other members see them offline right away
  presenceStore.get(roomId)?.delete(userId);
  clearUserPresenceConnections(roomId, userId);
  pushPresenceToRoom(roomId);
}

export async function updateRoomName(roomId: string, name: string): Promise<void> {
  await pool.query(
    `UPDATE rooms SET name = $1 WHERE id = $2`,
    [name.trim(), roomId]
  );
}

/** Groups V2: persist the leader's note for all members to read. */
export async function updateLeaderNote(
  roomId: string,
  note: string | null
): Promise<void> {
  await pool.query(
    `UPDATE rooms SET leader_note = $1 WHERE id = $2`,
    [note ?? null, roomId]
  );
}

/** Groups V2: set or clear the next meeting datetime and the reveal-on-meeting gate.
 *
 * Pass `nextMeeting` as:
 *   - a datetime string → sets the column
 *   - `null`           → clears the column
 *   - `undefined`      → leaves the column unchanged (partial-update safe)
 *
 * `revealOnMeeting` follows the same convention; `undefined` preserves the
 * existing value via SQL COALESCE.
 */
export async function updateRoomSchedule(
  roomId: string,
  nextMeeting: string | null | undefined,
  revealOnMeeting?: boolean
): Promise<void> {
  if (nextMeeting !== undefined) {
    // Both fields explicitly provided — update together.
    await pool.query(
      `UPDATE rooms
       SET next_meeting      = $1,
           reveal_on_meeting = COALESCE($2, reveal_on_meeting)
       WHERE id = $3`,
      [nextMeeting, revealOnMeeting ?? null, roomId]
    );
  } else {
    // nextMeeting omitted — only update revealOnMeeting if provided.
    await pool.query(
      `UPDATE rooms
       SET reveal_on_meeting = COALESCE($1, reveal_on_meeting)
       WHERE id = $2`,
      [revealOnMeeting ?? null, roomId]
    );
  }
}

export async function deleteRoom(roomId: string): Promise<void> {
  // Close all open chat + presence SSE streams before deleting so no subscriber
  // receives post-deletion events.
  terminateAllFromRoom(roomId);
  terminateAllPresenceFromRoom(roomId);
  // Clear in-memory presence (heartbeats + connection counts) for this room
  clearRoomPresenceConnections(roomId);
  clearRoomPresence(roomId);
  // FK CASCADE handles room_members, room_messages, room_journeys
  await pool.query(`DELETE FROM rooms WHERE id = $1`, [roomId]);
}

export async function transferAdmin(
  roomId: string,
  fromUserId: string,
  toUserId: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const memberRes = await client.query(
      `SELECT user_id, role
         FROM room_members
        WHERE room_id = $1
          AND user_id IN ($2, $3)
        FOR UPDATE`,
      [roomId, fromUserId, toUserId],
    );
    const members = new Map(
      memberRes.rows.map(row => [String(row.user_id), String(row.role)]),
    );
    const fromRole = members.get(fromUserId);
    const toRole = members.get(toUserId);
    if (!fromRole || !toRole) throw new Error("TARGET_NOT_MEMBER");
    if (!isRoomOwnerRole(fromRole)) throw new Error("NOT_OWNER");
    if (fromUserId === toUserId || isRoomOwnerRole(toRole)) {
      throw new Error("INVALID_OWNER_TRANSFER");
    }

    // Demote first so the partial unique Owner index can never observe two
    // owners, even briefly. The previous Owner remains a Leader.
    await client.query(
      `UPDATE room_members SET role = 'leader'
        WHERE room_id = $1 AND user_id = $2`,
      [roomId, fromUserId],
    );
    await client.query(
      `UPDATE room_members SET role = 'owner'
        WHERE room_id = $1 AND user_id = $2`,
      [roomId, toUserId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Change a non-owner member between the room's Leader and Member roles. */
export async function updateMemberRole(
  roomId: string,
  targetUserId: string,
  role: "leader" | "member",
): Promise<void> {
  const result = await pool.query(
    `UPDATE room_members
        SET role = $3
      WHERE room_id = $1
        AND user_id = $2
        AND role <> 'owner'`,
    [roomId, targetUserId, role],
  );
  if (result.rowCount === 0) {
    throw new Error("MEMBER_NOT_FOUND_OR_OWNER");
  }
}

export async function removeMember(
  roomId: string,
  targetUserId: string
): Promise<void> {
  await pool.query(
    `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, targetUserId]
  );
  // Close any open chat + presence SSE streams for the removed member immediately
  terminateUserFromRoom(roomId, targetUserId);
  terminatePresenceUserFromRoom(roomId, targetUserId);
  // Remove both heartbeat and connection-count entries so other members see them offline right away
  presenceStore.get(roomId)?.delete(targetUserId);
  clearUserPresenceConnections(roomId, targetUserId);
  pushPresenceToRoom(roomId);
}

interface Subscriber {
  userId: string;
  onMessage: (msg: RoomMessage) => void;
  /** Close the underlying SSE response immediately. */
  terminate: () => void;
}
export async function getMessages(
  roomId: string,
  limit = 50,
  before?: string,
  discussionId?: string
): Promise<RoomMessage[]> {
  const params: unknown[] = [roomId, limit];
  const filters = ["rm.room_id = $1"];
  if (discussionId) {
    params.push(discussionId);
    filters.push(`rm.discussion_id = $${params.length}`);
  }
  if (before) {
    params.push(before);
    filters.push(`rm.created_at < $${params.length}`);
  }

  const res = await pool.query(
    `SELECT rm.*, up.preferred_name
     FROM   room_messages rm
     LEFT JOIN user_profiles up
       ON up.auth_subject = rm.user_id OR up.email = rm.user_id
     WHERE  ${filters.join(" AND ")}
     ORDER  BY rm.created_at DESC
     LIMIT  $2`,
    params
  );
  return res.rows.map(rowToMessage);
}

export async function addMessage(
  roomId: string,
  userId: string,
  body: string,
  attachment?: MediaAttachment,
  discussionId?: string,
): Promise<RoomMessage> {
  let rows: Record<string, unknown>[];
  try {
    const res = await pool.query(
      `INSERT INTO room_messages (room_id, user_id, body, attachment, discussion_id)
        VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [roomId, userId, body, attachment ? JSON.stringify(attachment) : null, discussionId ?? null]
    );
    rows = res.rows as Record<string, unknown>[];
  } catch (err) {
    // A rolling test/older development database may not have completed the
    // additive migration yet. Preserve its existing room-chat behavior; the
    // production startup migration always takes the scoped path above.
    const code = typeof err === "object" && err !== null
      ? (err as Record<string, unknown>).code
      : undefined;
    if (code !== "42703") throw err;
    const res = await pool.query(
      `INSERT INTO room_messages (room_id, user_id, body, attachment)
        VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [roomId, userId, body, attachment ? JSON.stringify(attachment) : null]
    );
    rows = res.rows as Record<string, unknown>[];
  }
  const row = rows[0];
  // Fetch sender name separately to include in response
  const nameRes = await pool.query(
    `SELECT preferred_name
     FROM user_profiles
     WHERE auth_subject = $1 OR email = $1`,
    [userId]
  );
  const preferred_name = nameRes.rows[0]?.preferred_name ?? null;
  const msg = rowToMessage({ ...row, preferred_name });

  // Notify all SSE subscribers for this room
  notifySubscribers(roomId, msg);

  return msg;
}

// ─── Room Media helpers ───────────────────────────────────────────────────────

/** Return room attachments, optionally limited to items shared before the meeting. */
export async function getRoomMedia(
  roomId: string,
  limit = 100,
  sharedBeforeMeetingOnly = false,
): Promise<RoomMediaItem[]> {
  const res = await pool.query(
    `SELECT rm.id, rm.user_id, rm.attachment, rm.created_at, up.preferred_name
     FROM   room_messages rm
     LEFT JOIN user_profiles up
       ON up.auth_subject = rm.user_id OR up.email = rm.user_id
     WHERE  rm.room_id = $1
       AND rm.attachment IS NOT NULL
       AND COALESCE(rm.attachment->>'removed', 'false') <> 'true'
       AND (
         $3::boolean = false
         OR COALESCE(rm.attachment->>'sharedBeforeMeeting', 'false') = 'true'
       )
     ORDER  BY rm.created_at DESC
     LIMIT  $2`,
    [roomId, limit, sharedBeforeMeetingOnly]
  );
  return res.rows.map(row => ({
    messageId: String(row.id),
    userId: String(row.user_id),
    senderName:
      row.preferred_name && String(row.preferred_name).trim()
        ? String(row.preferred_name).trim()
        : "Member",
    attachment: row.attachment as MediaAttachment,
    createdAt: String(row.created_at),
  }));
}

export async function setRoomMediaVisibility(
  roomId: string,
  messageId: string,
  sharedBeforeMeeting: boolean,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE room_messages
     SET attachment = jsonb_set(
       attachment,
       '{sharedBeforeMeeting}',
       to_jsonb($3::boolean),
       true
     )
     WHERE room_id = $1
       AND id = $2
       AND attachment IS NOT NULL
       AND COALESCE(attachment->>'removed', 'false') <> 'true'`,
    [roomId, messageId, sharedBeforeMeeting],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function setAllRoomMediaVisibility(
  roomId: string,
  sharedBeforeMeeting: boolean,
): Promise<number> {
  const result = await pool.query(
    `UPDATE room_messages
     SET attachment = jsonb_set(
       attachment,
       '{sharedBeforeMeeting}',
       to_jsonb($2::boolean),
       true
     )
     WHERE room_id = $1
       AND attachment IS NOT NULL
       AND COALESCE(attachment->>'removed', 'false') <> 'true'`,
    [roomId, sharedBeforeMeeting],
  );
  return result.rowCount ?? 0;
}

/**
 * Remove a shared media attachment without deleting its chat message. The
 * database update and object deletion are coordinated so a storage failure
 * rolls back the catalogue change and can be retried by the leader.
 */
export async function removeRoomMedia(
  roomId: string,
  messageId: string,
  deleteStoredObject: (objectPath: string) => Promise<void>,
): Promise<RemoveRoomMediaResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT attachment
       FROM room_messages
       WHERE id = $1 AND room_id = $2
       FOR UPDATE`,
      [messageId, roomId],
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return { status: "not_found", messageId, presentationStopped: false };
    }

    const rawAttachment = result.rows[0].attachment;
    if (!rawAttachment) {
      await client.query("ROLLBACK");
      return { status: "not_found", messageId, presentationStopped: false };
    }

    const attachment = (
      typeof rawAttachment === "string" ? JSON.parse(rawAttachment) : rawAttachment
    ) as MediaAttachment & { removed?: boolean };
    if (attachment.removed) {
      await client.query("ROLLBACK");
      return { status: "already_removed", messageId, presentationStopped: false };
    }

    const objectPath = typeof attachment.objectPath === "string"
      ? attachment.objectPath
      : "";
    const removedAttachment = {
      ...attachment,
      objectPath: "",
      removed: true,
    };

    await client.query(
      `UPDATE room_messages
       SET attachment = $1
       WHERE id = $2 AND room_id = $3`,
      [JSON.stringify(removedAttachment), messageId, roomId],
    );

    let presentationStopped = false;
    const presentation = await client.query(
      `DELETE FROM room_media_presentations
       WHERE room_id = $1 AND message_id = $2
       RETURNING id`,
      [roomId, messageId],
    );
    if ((presentation.rowCount ?? 0) > 0) {
      presentationStopped = true;
      await client.query(
        `UPDATE room_sessions
         SET metadata = metadata - 'activeTool'
         WHERE room_id = $1
           AND status = 'active'
           AND metadata->>'activeTool' = 'presentation'`,
        [roomId],
      );
    }

    if (objectPath) {
      try {
        await deleteStoredObject(objectPath);
      } catch (err) {
        throw new RoomMediaStorageCleanupError(err);
      }
    }

    await client.query("COMMIT");
    return { status: "removed", messageId, presentationStopped };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Start a new presentation, stopping any existing one for this room. */
export async function startPresentation(
  roomId: string,
  sessionId: string | null,
  messageId: string | null,
  filename: string,
  mediaType: string,
  objectPath: string,
  presentedBy: string,
  presentedByName: string,
  pageCount?: number | null,
): Promise<MediaPresentation> {
  await pool.query(`DELETE FROM room_media_presentations WHERE room_id = $1`, [roomId]);
  const res = await pool.query(
    `INSERT INTO room_media_presentations
       (room_id, session_id, message_id, filename, media_type, object_path,
        presented_by, presented_by_name, current_page, page_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, $9)
     RETURNING *`,
    [roomId, sessionId, messageId, filename, mediaType, objectPath, presentedBy, presentedByName, pageCount ?? null]
  );
  return rowToPresentation(res.rows[0] as Record<string, unknown>);
}

export async function getActivePresentation(roomId: string): Promise<MediaPresentation | null> {
  const res = await pool.query(
    `SELECT * FROM room_media_presentations WHERE room_id = $1 ORDER BY started_at DESC LIMIT 1`,
    [roomId]
  );
  return res.rows.length > 0 ? rowToPresentation(res.rows[0] as Record<string, unknown>) : null;
}

export async function updatePresentationPage(roomId: string, page: number): Promise<void> {
  await pool.query(
    `UPDATE room_media_presentations SET current_page = $1 WHERE room_id = $2`,
    [page, roomId]
  );
}

export async function stopPresentation(roomId: string): Promise<void> {
  await pool.query(`DELETE FROM room_media_presentations WHERE room_id = $1`, [roomId]);
}

export async function setAllowMemberPresent(roomId: string, allow: boolean): Promise<void> {
  await pool.query(`UPDATE rooms SET allow_member_present = $1 WHERE id = $2`, [allow, roomId]);
}

export async function getAllowMemberPresent(roomId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT allow_member_present FROM rooms WHERE id = $1`, [roomId]
  );
  return Boolean(rows[0]?.allow_member_present ?? false);
}

// ─── Linked journeys ──────────────────────────────────────────────────────────

export async function linkJourney(
  roomId: string,
  journeyId: string,
  startedBy: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Insert the journey link (idempotent).
    await client.query(
      `INSERT INTO room_journeys (room_id, journey_id, started_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, journey_id) DO NOTHING`,
      [roomId, journeyId, startedBy]
    );

    // Always update the primary study to the newly linked journey.
    // Groups have ONE primary study at a time; adding a new walk replaces the
    // current one rather than accumulating extras silently.
    await client.query(
      `UPDATE rooms
       SET linked_content_id   = $2,
           linked_content_type = 'journey'
       WHERE id = $1`,
      [roomId, journeyId]
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Remove the room's primary study while retaining its historical journey link. */
export async function unlinkPrimaryJourney(
  roomId: string,
  journeyId?: string,
): Promise<void> {
  await pool.query(
    `UPDATE rooms
        SET linked_content_id = NULL,
            linked_content_type = NULL
      WHERE id = $1
        AND ($2::text IS NULL OR linked_content_id = $2)`,
    [roomId, journeyId ?? null],
  );
}

// ─── Atomic shared-start ─────────────────────────────────────────────────────

export interface StartSharedParams {
  userId: string;
  journeyId: string;
  /** Provide roomId to use an existing room, or roomName to create a new one. */
  roomId?: string;
  roomName?: string;
  /** The member-facing surface that initiated this shared start. */
  displayOrigin?: "walk" | "journey";
}

/**
 * startShared — creates (or reuses) a Room, links the journey, and starts
 * journey progress for the caller in a single DB transaction.  All-or-nothing:
 * if any step fails the whole operation rolls back.
 */
export async function startShared(
  params: StartSharedParams
): Promise<{ roomId: string }> {
  const { userId, journeyId } = params;

  // Generate invite credentials before the transaction so we don't hold a
  // connection open during the extra SELECT.  The code is random (26^7 ≈ 8B
  // combinations) so a wasted code on rollback is negligible.
  let inviteCode: string | undefined;
  let inviteToken: string | undefined;
  if (!params.roomId) {
    inviteCode = await generateInviteCode();
    inviteToken = randomUUID();
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let roomId: string;

    if (params.roomId) {
      // Lock the membership row for the duration of the transaction so a
      // concurrent leave or admin-removal cannot commit between this check and
      // the room_journeys INSERT.  FOR UPDATE blocks any DELETE/UPDATE on the
      // same row until our transaction commits or rolls back.
      const memberRes = await client.query(
        `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2 FOR UPDATE`,
        [params.roomId, userId]
      );
      if (!memberRes.rows[0]) throw new Error("NOT_A_MEMBER");
      roomId = params.roomId;
    } else {
      // Create the room and make the caller its Owner
      const roomRes = await client.query(
        `INSERT INTO rooms (name, invite_code, invite_token, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [params.roomName!.trim(), inviteCode, inviteToken, userId]
      );
      roomId = String(roomRes.rows[0].id);
      await client.query(
        `INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'owner')`,
        [roomId, userId]
      );
    }

    // Link the journey to the room (unique constraint on room_id + journey_id)
    await client.query(
      `INSERT INTO room_journeys (room_id, journey_id, started_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (room_id, journey_id) DO NOTHING`,
      [roomId, journeyId, userId]
    );

    // Start journey progress for the caller — idempotent via the unique index
    // on (user_id, journey_id) added by startup migration.
    const now = new Date();
    await client.query(
      `INSERT INTO user_journey_progress
         (user_id, journey_id, current_day, completed_days, started_at, status, display_origin, created_at, updated_at)
       VALUES ($1, $2, 1, '[]'::jsonb, $3, 'active', $4, $3, $3)
       ON CONFLICT (user_id, journey_id) DO UPDATE
         SET display_origin = COALESCE(user_journey_progress.display_origin, EXCLUDED.display_origin)`,
      [userId, journeyId, now, params.displayOrigin ?? null]
    );

    await client.query("COMMIT");
    return { roomId };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Returns true only when the given journey is explicitly linked to the room
 * in room_journeys.  Used by the progress endpoint to prevent callers from
 * supplying arbitrary journeyIds and reading other members' progress.
 */
export async function isJourneyLinkedToRoom(
  roomId: string,
  journeyId: string
): Promise<boolean> {
  const res = await pool.query(
    `SELECT 1 FROM room_journeys WHERE room_id = $1 AND journey_id = $2 LIMIT 1`,
    [roomId, journeyId]
  );
  return (res.rowCount ?? 0) > 0;
}
export interface MemberJourneyProgress {
  userId: string;
  preferredName: string;
  currentDay: number | null;
  status: string | null; // 'active' | 'paused' | 'completed' | 'dropped' | null (not started)
}
export async function getLinkedJourneys(roomId: string): Promise<LinkedJourney[]> {
  const res = await pool.query(
    `SELECT journey_id, started_by, started_at
     FROM   room_journeys
     WHERE  room_id = $1
     ORDER  BY started_at ASC`,
    [roomId]
  );
  return res.rows.map(r => ({
    journeyId: String(r.journey_id),
    startedBy: String(r.started_by),
    startedAt: String(r.started_at),
  }));
}

function notifySubscribers(roomId: string, msg: RoomMessage): void {
  roomSubscribers.get(roomId)?.forEach(sub => {
    try { sub.onMessage(msg); } catch { /* ignore closed connections */ }
  });
}

/**
 * Returns progress rows for every member of the room on the given journey.
 * Members who have not started the journey are included with null progress fields.
 */
export async function getMemberJourneyProgress(
  roomId: string,
  journeyId: string
): Promise<MemberJourneyProgress[]> {
  const res = await pool.query(
    `SELECT rm.user_id,
            up.preferred_name,
            ujp.current_day,
            ujp.status
     FROM   room_members rm
     LEFT JOIN user_profiles up
       ON up.auth_subject = rm.user_id OR up.email = rm.user_id
     LEFT JOIN user_journey_progress ujp
               ON ujp.user_id = rm.user_id AND ujp.journey_id = $2
     WHERE  rm.room_id = $1
     ORDER  BY rm.joined_at ASC`,
    [roomId, journeyId]
  );
  return res.rows.map(row => ({
    userId: String(row.user_id),
    // Empty string when no profile name — never expose a raw userId fragment.
    preferredName:
      row.preferred_name && String(row.preferred_name).trim()
        ? String(row.preferred_name).trim()
        : "",
    currentDay: row.current_day != null ? Number(row.current_day) : null,
    status: row.status ?? null,
  }));
}

/**
 * Register an SSE subscriber for a room.
 *
 * @param roomId    Room the subscriber is watching.
 * @param userId    Identity of the connected member (used for revocation).
 * @param onMessage Called whenever a new message is persisted to the room.
 * @param terminate Called to forcibly close the SSE response (e.g. on leave/removal).
 * @returns Unsubscribe function — call it when the connection closes normally.
 */
export function subscribeToRoom(
  roomId: string,
  userId: string,
  onMessage: (msg: RoomMessage) => void,
  terminate: () => void
): () => void {
  const sub: Subscriber = { userId, onMessage, terminate };
  if (!roomSubscribers.has(roomId)) {
    roomSubscribers.set(roomId, new Set());
  }
  roomSubscribers.get(roomId)!.add(sub);
  return () => {
    const set = roomSubscribers.get(roomId);
    if (set) {
      set.delete(sub);
      if (set.size === 0) roomSubscribers.delete(roomId);
    }
  };
}

/**
 * Immediately terminate all open SSE streams for a specific user in a room.
 * Call after leaveRoom() or removeMember() so the evicted member stops
 * receiving new messages without waiting for the next heartbeat.
 */
export function terminateUserFromRoom(roomId: string, userId: string): void {
  const set = roomSubscribers.get(roomId);
  if (!set) return;
  for (const sub of [...set]) {
    if (sub.userId === userId) {
      try { sub.terminate(); } catch { /* ignore */ }
      set.delete(sub);
    }
  }
  if (set.size === 0) roomSubscribers.delete(roomId);
}
const roomSubscribers = new Map<string, Set<Subscriber>>();

/**
 * Immediately terminate all open SSE streams for a room.
 * Call after deleteRoom() so no subscriber receives stale post-deletion events.
 */
export function terminateAllFromRoom(roomId: string): void {
  const set = roomSubscribers.get(roomId);
  if (!set) return;
  for (const sub of set) {
    try { sub.terminate(); } catch { /* ignore */ }
  }
  roomSubscribers.delete(roomId);
}

const PRESENCE_STALE_MS = 90_000; // prune entries older than 90 s

// ─── Presence SSE connection count ───────────────────────────────────────────
//
// Tracks how many open presence SSE connections each user has per room.
// A user is considered online as soon as they open a stream; offline the moment
// their last connection closes.  Multi-tab: each tab increments; only when the
// count reaches 0 are they evicted from the online list.

const presenceConnectionCounts = new Map<string, Map<string, number>>();

/**
 * Called when a presence SSE stream is successfully opened.
 * Immediately marks the user as online (via a synthetic heartbeat) and pushes
 * an updated list to any other subscribers for this room.
 */
export function registerPresenceConnection(roomId: string, userId: string): void {
  if (!presenceConnectionCounts.has(roomId)) {
    presenceConnectionCounts.set(roomId, new Map());
  }
  const counts = presenceConnectionCounts.get(roomId)!;
  counts.set(userId, (counts.get(userId) ?? 0) + 1);
  // Record a heartbeat so the fallback cutoff doesn't immediately evict them.
  // (Does not push — caller will push after registering as a subscriber.)
  if (!presenceStore.has(roomId)) presenceStore.set(roomId, new Map());
  presenceStore.get(roomId)!.set(userId, Date.now());
}

/**
 * Called when a presence SSE stream closes (normally or on error).
 * If this was the user's last open connection, removes them from the online
 * list immediately and pushes the updated list to remaining subscribers.
 *
 * IMPORTANT: call unsubscribe() (to remove this stream from the subscriber set)
 * BEFORE calling this, so the departing user doesn't receive their own eviction.
 */
export function unregisterPresenceConnection(roomId: string, userId: string): void {
  const counts = presenceConnectionCounts.get(roomId);
  const current = counts?.get(userId) ?? 0;
  if (current <= 1) {
    // Last (or only) connection — evict immediately
    counts?.delete(userId);
    if (counts?.size === 0) presenceConnectionCounts.delete(roomId);
    presenceStore.get(roomId)?.delete(userId);
    pushPresenceToRoom(roomId);
  } else {
    counts!.set(userId, current - 1);
  }
}

/**
 * Clear all presence connection counts for a specific user in a room (e.g.
 * after leaveRoom / removeMember).  Does NOT push — caller is responsible.
 */
function clearUserPresenceConnections(roomId: string, userId: string): void {
  const counts = presenceConnectionCounts.get(roomId);
  if (!counts) return;
  counts.delete(userId);
  if (counts.size === 0) presenceConnectionCounts.delete(roomId);
}

/**
 * Clear all presence connection counts for a room (e.g. after deleteRoom).
 */
function clearRoomPresenceConnections(roomId: string): void {
  presenceConnectionCounts.delete(roomId);
}

// ─── Presence SSE subscribers ────────────────────────────────────────────────

interface PresenceSubscriber {
  userId: string;
  onPresence: (onlineUserIds: string[]) => void;
  terminate: () => void;
}

const presenceSubscribers = new Map<string, Set<PresenceSubscriber>>();

/** Last pushed payload per room (sorted JSON) — avoids redundant writes. */
const lastPresencePushed = new Map<string, string>();

/**
 * Compute current online list and push to all presence subscribers for a room.
 * Skips the write when the list hasn't changed since the last push.
 */
function pushPresenceToRoom(roomId: string): void {
  const subs = presenceSubscribers.get(roomId);
  if (!subs || subs.size === 0) return;
  const ids = getOnlineUserIds(roomId);
  const key = JSON.stringify(ids.slice().sort());
  if (lastPresencePushed.get(roomId) === key) return; // no change
  lastPresencePushed.set(roomId, key);
  for (const sub of subs) {
    try { sub.onPresence(ids); } catch { /* ignore closed connections */ }
  }
}

/**
 * Subscribe to presence updates for a room.
 * Returns an unsubscribe function — call it when the SSE connection closes.
 */
export function subscribeToPresence(
  roomId: string,
  userId: string,
  onPresence: (onlineUserIds: string[]) => void,
  terminate: () => void
): () => void {
  const sub: PresenceSubscriber = { userId, onPresence, terminate };
  if (!presenceSubscribers.has(roomId)) {
    presenceSubscribers.set(roomId, new Set());
  }
  presenceSubscribers.get(roomId)!.add(sub);
  return () => {
    const set = presenceSubscribers.get(roomId);
    if (set) {
      set.delete(sub);
      if (set.size === 0) {
        presenceSubscribers.delete(roomId);
        lastPresencePushed.delete(roomId);
      }
    }
  };
}

/**
 * Immediately terminate all presence SSE streams for a specific user in a room.
 * Call after leaveRoom() or removeMember().
 */
export function terminatePresenceUserFromRoom(roomId: string, userId: string): void {
  const set = presenceSubscribers.get(roomId);
  if (!set) return;
  for (const sub of [...set]) {
    if (sub.userId === userId) {
      try { sub.terminate(); } catch { /* ignore */ }
      set.delete(sub);
    }
  }
  if (set.size === 0) {
    presenceSubscribers.delete(roomId);
    lastPresencePushed.delete(roomId);
  }
}

/**
 * Immediately terminate all presence SSE streams for a room.
 * Call after deleteRoom().
 */
export function terminateAllPresenceFromRoom(roomId: string): void {
  const set = presenceSubscribers.get(roomId);
  if (!set) return;
  for (const sub of set) {
    try { sub.terminate(); } catch { /* ignore */ }
  }
  presenceSubscribers.delete(roomId);
  lastPresencePushed.delete(roomId);
}

// Sweep every 5 s — detect heartbeat timeouts and push updated presence to
// any subscriber that is watching a room with stale members.
setInterval(() => {
  for (const [roomId] of presenceSubscribers) {
    pushPresenceToRoom(roomId);
  }
}, 5_000).unref();
// ─── Room Session store ───────────────────────────────────────────────────────

export type SessionMode = "study" | "scripture" | "discussion" | "prayer" | "poll";

export interface ScriptureRef {
  book: string;
  chapter: number;
  verseStart?: number;
  verseEnd?: number;
  displayLabel?: string; // e.g. "John 15" or "John 15:1-17"
}

export interface RoomSession {
  id: string;
  roomId: string;
  startedBy: string;
  startedAt: string;
  endedAt: string | null;
  status: "active" | "completed" | "ended";
  currentMode: SessionMode;
  currentStep: string | null;
  currentScripture: ScriptureRef | null;
  sessionPlan: unknown[];
  poll: unknown | null;
  metadata: Record<string, unknown>;
  completedModes: string[];
  memberCount: number | null;
  prayerRequestCount: number | null;
  sharedNoteCount: number | null;
  groupPositionStep: string | null;
}

export interface ActiveEmmausState {
  requestId: string;
  question: string;
  text: string;
  status: "generating" | "completed" | "failed";
  answerId: string | null;
  error?: string;
}

export interface SessionCompleteSummary {
  sessionId: string;
  modesEntered: string[];
  memberCount: number;
  prayerRequestCount: number;
  sharedNoteCount: number;
}

export interface SessionEvent {
  type:
    | "session_started"
    | "session_ended"
    | "session_complete"
    | "attendance_changed"
    | "navigate"
    | "mode_change"
    | "focus_verse"
    | "poll_started"
    | "poll_vote_count"
    | "poll_revealed"
    | "poll_result"
    | "emmaus_started"
    | "emmaus_chunk"
    | "emmaus_done"
    | "session_state"
    | "highlight_added"
    | "highlight_focus_changed"
    | "note_added"
    | "note_pinned"
    | "media_presented"
    | "presentation_page"
     | "presentation_stopped"
    | "tool_closed"
     | "OPEN_GROUP_DISCUSSION";
  payload: Record<string, unknown>;
  sentBy: string;
  at: string; // ISO timestamp
}

function rowToSession(row: Record<string, unknown>): RoomSession {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    startedBy: String(row.started_by),
    startedAt: String(row.started_at),
    endedAt: row.ended_at ? String(row.ended_at) : null,
    status: (row.status as RoomSession["status"]) ?? "active",
    currentMode: (row.current_mode as SessionMode) ?? "study",
    currentStep: row.current_step ? String(row.current_step) : null,
    currentScripture: row.current_scripture
      ? (row.current_scripture as ScriptureRef)
      : null,
    sessionPlan: Array.isArray(row.session_plan) ? row.session_plan : [],
    poll: row.poll ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    completedModes: Array.isArray(row.completed_modes) ? (row.completed_modes as string[]) : [],
    memberCount: row.member_count != null ? Number(row.member_count) : null,
    prayerRequestCount: row.prayer_request_count != null ? Number(row.prayer_request_count) : null,
    sharedNoteCount: row.shared_note_count != null ? Number(row.shared_note_count) : null,
    groupPositionStep: row.group_position_step ? String(row.group_position_step) : null,
  };
}

/** Start a new guided session for a room. Returns the new session. */
export async function startSession(
  roomId: string,
  startedBy: string
): Promise<RoomSession> {
  // Enforce at-most-one active session per room via the partial unique index
  // room_sessions_one_active_per_room (room_id WHERE status='active').
  // The index catches concurrent starts at the DB level (no TOCTOU gap);
  // the application-level check below provides a friendly error message.
  // The leader must explicitly end or complete the current session before
  // starting a new one so that completion logic is never bypassed.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `INSERT INTO room_sessions (room_id, started_by)
       VALUES ($1, $2)
       RETURNING *`,
      [roomId, startedBy]
    );
    const session = rowToSession(rows[0] as Record<string, unknown>);
    // Starting a meeting is the leader's explicit entry action. Record the
    // leader against this exact session in the same transaction so every
    // device sees the leader as present without making page-open imply join.
    await client.query(
      `INSERT INTO room_session_attendance (session_id, room_id, user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, user_id) DO UPDATE SET left_at = NULL`,
      [session.id, roomId, startedBy]
    );
    await client.query("COMMIT");
    return session;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // PostgreSQL unique violation: error code 23505
    if (
      typeof err === "object" && err !== null &&
      (err as Record<string, unknown>).code === "23505"
    ) {
      throw new Error("SESSION_ALREADY_ACTIVE");
    }
    throw err;
  } finally {
    client.release();
  }
}

/** End the active session for a room. */
export async function endSession(
  roomId: string,
  status: "completed" | "ended" = "ended"
): Promise<void> {
  await pool.query(
    `UPDATE room_sessions
     SET status = $2, ended_at = NOW()
     WHERE room_id = $1 AND status = 'active'`,
    [roomId, status]
  );
}

/** Get the active session for a room, or null if none. */
export async function getActiveSession(
  roomId: string
): Promise<RoomSession | null> {
  const { rows } = await pool.query(
    `SELECT * FROM room_sessions
     WHERE room_id = $1 AND status = 'active'
     ORDER BY started_at DESC LIMIT 1`,
    [roomId]
  );
  if (!rows[0]) return null;
  return rowToSession(rows[0] as Record<string, unknown>);
}

/**
 * Validate that a session (by id) belongs to a specific room.
 * Returns the session row if found, or null when the sessionId is unknown or
 * belongs to a different room.  Routes use this to prevent cross-room data
 * access via fabricated sessionIds.
 */
export async function getSessionByIdForRoom(
  sessionId: string,
  roomId: string
): Promise<RoomSession | null> {
  const { rows } = await pool.query(
    `SELECT * FROM room_sessions WHERE id = $1 AND room_id = $2 LIMIT 1`,
    [sessionId, roomId]
  );
  if (!rows[0]) return null;
  return rowToSession(rows[0] as Record<string, unknown>);
}

/** Patch mutable fields on the active session. */
export async function updateSessionState(
  roomId: string,
  patch: Partial<Pick<RoomSession, "currentMode" | "currentStep" | "currentScripture" | "poll" | "metadata">>
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [roomId];
  let idx = 2;

  if (patch.currentMode !== undefined) {
    sets.push(`current_mode = $${idx++}`);
    vals.push(patch.currentMode);
  }
  if (patch.currentStep !== undefined) {
    sets.push(`current_step = $${idx++}`);
    vals.push(patch.currentStep);
  }
  if ("currentScripture" in patch) {
    sets.push(`current_scripture = $${idx++}`);
    vals.push(patch.currentScripture ? JSON.stringify(patch.currentScripture) : null);
  }
  if ("poll" in patch) {
    sets.push(`poll = $${idx++}`);
    vals.push(patch.poll ? JSON.stringify(patch.poll) : null);
  }
  if (patch.metadata !== undefined) {
    sets.push(`metadata = $${idx++}`);
    vals.push(JSON.stringify(patch.metadata));
  }

  if (sets.length === 0) return;

  await pool.query(
    `UPDATE room_sessions SET ${sets.join(", ")}
     WHERE room_id = $1 AND status = 'active'`,
    vals
  );
}

/** Clear one shared surface from the active session's durable tool state. */
export async function clearSharedTool(
  roomId: string,
  tool: "scripture" | "discussion" | "poll" | "ask-emmaus" | "presentation",
): Promise<void> {
  const session = await getActiveSession(roomId);
  if (!session) return;

  const metadata = { ...session.metadata };
  if (metadata.activeTool === tool) {
    delete metadata.activeTool;
  }
  if (tool === "ask-emmaus") {
    delete metadata.activeEmmaus;
  }

  await updateSessionState(roomId, {
    ...(tool === "scripture" ? { currentScripture: null } : {}),
    ...(tool === "poll" ? { poll: null } : {}),
    metadata,
  });
}

/** Replace the current shared tool and clear any durable presentation/poll it supersedes. */
export async function replaceSharedTool(
  roomId: string,
  tool: "scripture" | "discussion" | "poll" | "ask-emmaus" | "presentation" | "study",
): Promise<void> {
  const session = await getActiveSession(roomId);
  if (!session) return;
  const previousTool = session.metadata.activeTool;
  if (previousTool && previousTool !== tool) {
    if (previousTool === "poll") await clearActivePoll(roomId, session.id);
    if (previousTool === "presentation") await stopPresentation(roomId);
  }
  const metadata: Record<string, unknown> = { ...session.metadata, activeTool: tool };
  if (previousTool === "ask-emmaus" && tool !== "ask-emmaus") {
    delete metadata.activeEmmaus;
  }
  await updateSessionState(roomId, { metadata });
}

/**
 * Persist the current shared Ask Emmaus request only while it still owns the
 * active tool. This prevents a delayed provider completion from resurrecting a
 * panel that a leader has already closed or replaced.
 */
export async function updateSharedEmmausState(
  roomId: string,
  requestId: string,
  patch: Partial<ActiveEmmausState>,
): Promise<boolean> {
  const session = await getActiveSession(roomId);
  if (!session || session.metadata.activeTool !== "ask-emmaus") return false;
  const current = session.metadata.activeEmmaus as ActiveEmmausState | undefined;
  if (!current || current.requestId !== requestId) return false;

  await updateSessionState(roomId, {
    metadata: {
      ...session.metadata,
      activeEmmaus: { ...current, ...patch },
    },
  });
  return true;
}

/**
 * Recover shared Ask Emmaus requests that were interrupted by an API restart.
 * The provider stream is in-memory, so a request left as "generating" can never
 * finish after the process that owned it has gone away. Keep the tool visible
 * during hydration, but give every member a durable, retryable outcome.
 */
export async function recoverInterruptedSharedEmmausRequests(): Promise<number> {
  const interruptedMessage =
    "This group question was interrupted when Emmaus restarted. The leader can try it again.";
  const result = await pool.query(
    `UPDATE room_sessions
     SET metadata = jsonb_set(
       metadata,
       '{activeEmmaus}',
       (metadata->'activeEmmaus')
         || jsonb_build_object(
              'status', 'failed',
              'error', $1::text,
              'text', $1::text
            ),
       true
     )
     WHERE status = 'active'
       AND metadata->>'activeTool' = 'ask-emmaus'
       AND metadata->'activeEmmaus'->>'status' = 'generating'`,
    [interruptedMessage],
  );
  return result.rowCount ?? 0;
}

/**
 * Atomically claim the shared Ask Emmaus tool for a new generation.
 *
 * Locking the session row makes the generation state authoritative across
 * concurrent leaders, tabs, and retries. A retry may replace a failed request,
 * but it may never replace a request that is still generating.
 */
export async function claimSharedEmmausRequest(
  roomId: string,
  sessionId: string,
  requestId: string,
  state: Pick<ActiveEmmausState, "question">,
): Promise<RoomSession> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `SELECT *
       FROM room_sessions
       WHERE id = $1 AND room_id = $2 AND status = 'active'
       FOR UPDATE`,
      [sessionId, roomId],
    );
    if (!rows[0]) {
      throw new Error("SESSION_NOT_ACTIVE");
    }

    const row = rows[0] as Record<string, unknown>;
    const metadata = (row.metadata as Record<string, unknown>) ?? {};
    const currentEmmaus = metadata.activeEmmaus as ActiveEmmausState | undefined;
    if (metadata.activeTool === "ask-emmaus" && currentEmmaus?.status === "generating") {
      throw new Error("EMMAUS_REQUEST_ACTIVE");
    }

    // Match replaceSharedTool's cleanup semantics while keeping the claim
    // itself atomic. These rows otherwise reappear on reconnect hydration.
    if (metadata.activeTool === "poll") {
      await client.query(
        `DELETE FROM room_poll_votes
         WHERE poll_id IN (
           SELECT id FROM room_polls
           WHERE room_id = $1 AND session_id = $2
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        [roomId, sessionId],
      );
      await client.query(
        `DELETE FROM room_polls
         WHERE id = (
           SELECT id FROM room_polls
           WHERE room_id = $1 AND session_id = $2
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        [roomId, sessionId],
      );
    } else if (metadata.activeTool === "presentation") {
      await client.query(
        `DELETE FROM room_media_presentations WHERE room_id = $1`,
        [roomId],
      );
    }

    const nextMetadata = {
      ...metadata,
      activeTool: "ask-emmaus",
      activeEmmaus: {
        requestId,
        question: state.question,
        text: "",
        status: "generating",
        answerId: null,
      } satisfies ActiveEmmausState,
    };
    await client.query(
      `UPDATE room_sessions SET metadata = $1::jsonb WHERE id = $2`,
      [JSON.stringify(nextMetadata), sessionId],
    );
    await client.query("COMMIT");
    return rowToSession({ ...row, metadata: nextMetadata });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Record a member joining the active session for attendance.
 *  Validates the session is still active before inserting — rejects post-completion
 *  joins so they cannot inflate the attendance count or re-open left_at.
 *  Preserves the original joined_at on reconnect; only clears left_at. */
export async function recordSessionJoin(
  sessionId: string,
  roomId: string,
  userId: string
): Promise<{
  id: string;
  userId: string;
  joinedAt: string;
  leftAt: string | null;
} | null> {
  // INSERT ... SELECT ensures no row is inserted (and no conflict fires)
  // when the session is completed or ended — the status guard lives in SQL,
  // not in application code, so no TOCTOU window exists.
  // FOR KEY SHARE conflicts with the FOR UPDATE lock held by completeSession(),
  // forcing this INSERT to wait and re-evaluate the status predicate after the
  // completion transaction commits — at which point status='completed' and
  // no rows are returned, so no attendance row is inserted.
  const result = await pool.query(
    `INSERT INTO room_session_attendance (session_id, room_id, user_id)
     SELECT $1::uuid, $2, $3
     FROM room_sessions
     WHERE id = $1::uuid AND room_id = $2 AND status = 'active'
     FOR KEY SHARE
      ON CONFLICT (session_id, user_id) DO UPDATE SET left_at = NULL
      RETURNING *`,
    [sessionId, roomId, userId]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0] as Record<string, unknown>;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    joinedAt: String(row.joined_at),
    leftAt: row.left_at ? String(row.left_at) : null,
  };
}

/** Record a member leaving the active session.
 *  No-op if the session is already completed/ended — completeSession() has
 *  already set authoritative left_at timestamps and they must not be overwritten. */
export async function recordSessionLeave(
  sessionId: string,
  roomId: string,
  userId: string
): Promise<void> {
  // JOIN against room_sessions WHERE status = 'active' ensures this is a
  // no-op once the session is completed, preventing React cleanup effects
  // from clobbering the completion timestamps set inside the transaction.
  await pool.query(
    `UPDATE room_session_attendance rsa
     SET left_at = NOW()
     FROM room_sessions rs
     WHERE rsa.session_id = rs.id
       AND rsa.session_id = $1::uuid
       AND rsa.user_id    = $3
       AND rsa.left_at    IS NULL
       AND rs.room_id     = $2
       AND rs.status      = 'active'`,
    [sessionId, roomId, userId]
  );
}

/**
 * Track that a mode was entered during the session.
 * Appends to metadata.modesEntered (idempotent — no duplicate modes stored).
 */
export async function trackModeEntered(roomId: string, mode: string): Promise<void> {
  await pool.query(
    `UPDATE room_sessions
     SET metadata = jsonb_set(
       COALESCE(metadata, '{}'),
       '{modesEntered}',
       CASE
         WHEN metadata->'modesEntered' IS NULL
           THEN jsonb_build_array($2::text)
         WHEN metadata->'modesEntered' @> jsonb_build_array($2::text)
           THEN metadata->'modesEntered'
         ELSE metadata->'modesEntered' || jsonb_build_array($2::text)
       END
     )
     WHERE room_id = $1 AND status = 'active'`,
    [roomId, mode]
  );
}

/**
 * Formally complete a session inside a single serializable transaction:
 *  1. Atomically transitions status 'active' → 'completed' (prevents double-complete).
 *  2. Reads modesEntered from the locked row's metadata.
 *  3. Tallies session-scoped counts (prayer requests bounded by started_at, not room-wide).
 *  4. Writes all summary columns in one UPDATE.
 *  5. Marks all still-active attendees as left.
 * Returns the summary broadcast to all members.
 */
export async function completeSession(roomId: string): Promise<SessionCompleteSummary> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Step 1a — acquire an exclusive row-level lock on the active session BEFORE
    // changing its status.  Any concurrent INSERT…SELECT FROM room_sessions WHERE
    // status='active' (e.g. addSharedNote, addPrayerRequest) will block here until
    // we COMMIT, at which point status='completed' and those inserts see 0 rows and
    // abort.  This gives us a true serialization barrier without requiring SERIALIZABLE
    // isolation across the entire database.
    const lockRes = await client.query<{
      id: string;
      started_at: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, started_at, metadata
       FROM room_sessions
       WHERE room_id = $1 AND status = 'active'
       FOR UPDATE`,
      [roomId]
    );

    if (lockRes.rows.length === 0) {
      await client.query("ROLLBACK");
      throw new Error("No active session to complete, or session was already completed.");
    }

    // Step 1b — transition status now that the row is locked.
    // Concurrent writers are blocked by the FOR UPDATE lock until COMMIT.
    await client.query(
      `UPDATE room_sessions SET status = 'completed', ended_at = NOW() WHERE id = $1`,
      [lockRes.rows[0].id]
    );

    const { id: sessionId, started_at: startedAt, metadata } = lockRes.rows[0];

    // Step 2 — modes entered (study is always included; session always starts there)
    const rawModes = (metadata?.modesEntered as string[] | undefined) ?? [];
    const modesEntered = rawModes.includes("study") ? rawModes : ["study", ...rawModes];

    // Step 3 — session-scoped counts.
    //
    // Prayer requests: bounded to [started_at, ended_at].  ended_at was set in
    // Step 1 inside this same transaction; any prayer inserted after that
    // timestamp has created_at > ended_at and is therefore excluded, closing
    // the window that would otherwise allow a post-completion prayer request
    // to be counted (or not) depending on timing.
    //
    // Shared notes: session_id FK already scopes them to this session.
    //
    // Attendance: same session_id FK scoping.
    //
    // We use the `ended_at` returned by Step 1 as the stable cutoff.
    const [attendanceRes, prayerRes, notesRes] = await Promise.all([
      client.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM room_session_attendance WHERE session_id = $1`,
        [sessionId]
      ),
      client.query<{ cnt: number }>(
        // Count prayer requests scoped to this session via the session_id FK.
        // Requests with session_id = sessionId were atomically gated on
        // status='active' at insert time, so none can land after completion.
        // Requests without a session_id (room-level, no-session submissions)
        // are correctly excluded — they are not session contributions.
        `SELECT COUNT(*)::int AS cnt FROM room_prayer_requests
         WHERE session_id = $1`,
        [sessionId]
      ),
      client.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM room_shared_notes WHERE session_id = $1`,
        [sessionId]
      ),
    ]);

    const memberCount = Number(attendanceRes.rows[0].cnt);
    const prayerRequestCount = Number(prayerRes.rows[0].cnt);
    const sharedNoteCount = Number(notesRes.rows[0].cnt);

    // Step 4 — write summary columns (session already locked/completed above)
    await client.query(
      `UPDATE room_sessions
       SET completed_modes      = $2::jsonb,
           member_count         = $3,
           prayer_request_count = $4,
           shared_note_count    = $5,
           group_position_step  = current_step
       WHERE id = $1`,
      [sessionId, JSON.stringify(modesEntered), memberCount, prayerRequestCount, sharedNoteCount]
    );

    // Step 5 — close out all active attendees
    await client.query(
      `UPDATE room_session_attendance SET left_at = NOW()
       WHERE session_id = $1 AND left_at IS NULL`,
      [sessionId]
    );

    await client.query("COMMIT");
    return { sessionId, modesEntered, memberCount, prayerRequestCount, sharedNoteCount };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Return the summary of the most recently completed session for a room,
 * if it was completed within the last `withinMinutes` minutes.
 * Used by the SSE handler to replay a completion card for members who
 * reconnect or join after the ephemeral broadcast.
 *
 * If `userId` is provided the function checks `room_session_acknowledgements`
 * and returns null when the user has already acknowledged — so the modal is
 * never re-shown on a second device or after a reconnect.
 */
export async function getRecentlyCompletedSession(
  roomId: string,
  withinMinutes = 10,
  userId?: string
): Promise<SessionCompleteSummary | null> {
  const cutoff = new Date(Date.now() - withinMinutes * 60 * 1000).toISOString();
  const { rows } = await pool.query<{
    id: string;
    completed_modes: unknown;
    member_count: string | number | null;
    prayer_request_count: string | number | null;
    shared_note_count: string | number | null;
  }>(
    `SELECT id, completed_modes, member_count, prayer_request_count, shared_note_count
     FROM room_sessions
     WHERE room_id = $1
       AND status = 'completed'
       AND ended_at >= $2
     ORDER BY ended_at DESC
     LIMIT 1`,
    [roomId, cutoff]
  );
  if (rows.length === 0) return null;
  const row = rows[0];

  // If we have a userId, skip replay when the user has already acknowledged.
  if (userId) {
    const ackRes = await pool.query(
      `SELECT 1 FROM room_session_acknowledgements
       WHERE session_id = $1 AND user_id = $2 LIMIT 1`,
      [row.id, userId]
    );
    if ((ackRes.rowCount ?? 0) > 0) return null;
  }

  const rawModes = Array.isArray(row.completed_modes) ? row.completed_modes as string[] : [];
  return {
    sessionId: row.id,
    modesEntered: rawModes,
    memberCount: Number(row.member_count ?? 0),
    prayerRequestCount: Number(row.prayer_request_count ?? 0),
    sharedNoteCount: Number(row.shared_note_count ?? 0),
  };
}

/**
 * Record that a user has acknowledged the Session Complete modal for a
 * specific session.  Idempotent — safe to call multiple times.
 */
export async function acknowledgeSessionCompletion(
  sessionId: string,
  userId: string
): Promise<void> {
  await pool.query(
    `INSERT INTO room_session_acknowledgements (session_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (session_id, user_id) DO NOTHING`,
    [sessionId, userId]
  );
}
/** Get attendance for a session.
 *  @param sessionId  The session to query.
 *  @param roomId     The room the caller believes the session belongs to.
 *                    The JOIN against room_sessions enforces this ownership —
 *                    a session UUID from another room returns 0 rows,
 *                    preventing cross-room attendance disclosure.
 */
export async function getSessionAttendance(
  sessionId: string,
  roomId: string
): Promise<Array<{ id: string; userId: string; preferredName: string; joinedAt: string; leftAt: string | null }>> {
  const { rows } = await pool.query(
    `SELECT a.id, a.user_id, a.joined_at, a.left_at, up.preferred_name
     FROM room_session_attendance a
     -- Ownership validation: session must belong to this room;
     -- cross-room session UUIDs produce 0 rows.
     JOIN room_sessions rs ON rs.id = a.session_id AND rs.room_id = $2
     LEFT JOIN user_profiles up
       ON up.auth_subject = a.user_id OR up.email = a.user_id
     WHERE a.session_id = $1
     ORDER BY a.joined_at ASC`,
    [sessionId, roomId]
  );
  return rows.map(r => ({
    id: String(r.id),
    userId: String(r.user_id),
    preferredName: r.preferred_name && String(r.preferred_name).trim()
      ? String(r.preferred_name).trim()
      : "",
    joinedAt: String(r.joined_at),
    leftAt: r.left_at ? String(r.left_at) : null,
  }));
}

/** Return whether a user is currently attending the active session for a room. */
export async function hasActiveSessionAttendance(
  sessionId: string,
  roomId: string,
  userId: string,
): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1
     FROM room_session_attendance a
     JOIN room_sessions rs
       ON rs.id = a.session_id
      AND rs.room_id = a.room_id
     WHERE a.session_id = $1
       AND a.room_id = $2
       AND a.user_id = $3
       AND a.left_at IS NULL
       AND rs.status = 'active'
     LIMIT 1`,
    [sessionId, roomId, userId],
  );
  return rows.length > 0;
}

// ─── Session event bus (in-memory SSE) ───────────────────────────────────────
//
// Same subscriber-map pattern as chat + presence SSE streams.

interface SessionSubscriber {
  userId: string;
  onEvent: (event: SessionEvent) => void;
  terminate: () => void;
}

const sessionSubscribers = new Map<string, Set<SessionSubscriber>>();

/**
 * Broadcast a real-time session event to all connected members of a room.
 * Events are ephemeral — they are not persisted here (callers may persist
 * important state via updateSessionState before broadcasting).
 */
export function broadcastRoomEvent(roomId: string, event: SessionEvent): void {
  const subs = sessionSubscribers.get(roomId);
  if (!subs || subs.size === 0) return;
  const payload = JSON.stringify(event);
  for (const sub of subs) {
    try { sub.onEvent(JSON.parse(payload) as SessionEvent); } catch { /* ignore closed connections */ }
  }
}

/** Subscribe to session events for a room. Returns an unsubscribe function. */
export function subscribeToSessionEvents(
  roomId: string,
  userId: string,
  onEvent: (event: SessionEvent) => void,
  terminate: () => void
): () => void {
  const sub: SessionSubscriber = { userId, onEvent, terminate };
  if (!sessionSubscribers.has(roomId)) {
    sessionSubscribers.set(roomId, new Set());
  }
  sessionSubscribers.get(roomId)!.add(sub);
  return () => {
    const set = sessionSubscribers.get(roomId);
    if (set) {
      set.delete(sub);
      if (set.size === 0) sessionSubscribers.delete(roomId);
    }
  };
}

/** Terminate all session event SSE streams for a specific user. */
export function terminateSessionUserFromRoom(roomId: string, userId: string): void {
  const set = sessionSubscribers.get(roomId);
  if (!set) return;
  for (const sub of [...set]) {
    if (sub.userId === userId) {
      try { sub.terminate(); } catch { /* ignore */ }
      set.delete(sub);
    }
  }
  if (set.size === 0) sessionSubscribers.delete(roomId);
}

/** Terminate all session event SSE streams for a room. */
export function terminateAllSessionFromRoom(roomId: string): void {
  const set = sessionSubscribers.get(roomId);
  if (!set) return;
  for (const sub of set) {
    try { sub.terminate(); } catch { /* ignore */ }
  }
  sessionSubscribers.delete(roomId);
}

// ─── Room Highlights (Task #436) ──────────────────────────────────────────────

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

function rowToHighlight(r: Record<string, unknown>): RoomHighlight {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    roomId: String(r.room_id),
    userId: String(r.user_id),
    authorName: r.author_name && String(r.author_name).trim()
      ? String(r.author_name).trim()
      : "Member",
    book: String(r.book),
    chapter: Number(r.chapter),
    verse: Number(r.verse),
    verseText: String(r.verse_text ?? ""),
    note: r.note ? String(r.note) : null,
    isFocusVerse: Boolean(r.is_focus_verse),
    createdAt: String(r.created_at),
  };
}

/** Add a verse highlight for the current session. */
export async function addHighlight(
  sessionId: string,
  roomId: string,
  userId: string,
  authorName: string,
  book: string,
  chapter: number,
  verse: number,
  verseText: string,
  note?: string
): Promise<RoomHighlight> {
  const { rows } = await pool.query(
    `INSERT INTO room_highlights
       (session_id, room_id, user_id, author_name, book, chapter, verse, verse_text, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [sessionId, roomId, userId, authorName.trim() || "Member",
     book, chapter, verse, verseText, note ?? null]
  );
  return rowToHighlight(rows[0] as Record<string, unknown>);
}

/** Get all highlights for a session. */
export async function getHighlights(
  roomId: string,
  sessionId: string
): Promise<RoomHighlight[]> {
  const { rows } = await pool.query(
    `SELECT * FROM room_highlights
     WHERE room_id = $1 AND session_id = $2
     ORDER BY created_at ASC`,
    [roomId, sessionId]
  );
  return rows.map(r => rowToHighlight(r as Record<string, unknown>));
}

/**
 * Set (or clear) a focus verse.
 * Clears any existing focus verse first, then marks the target verse.
 * Pass highlightId = null to just clear.
 */
export async function setFocusVerse(
  roomId: string,
  sessionId: string,
  highlightId: string | null
): Promise<void> {
  // Clear any existing focus verse in this session
  await pool.query(
    `UPDATE room_highlights SET is_focus_verse = false
     WHERE room_id = $1 AND session_id = $2 AND is_focus_verse = true`,
    [roomId, sessionId]
  );
  if (highlightId) {
    await pool.query(
      `UPDATE room_highlights SET is_focus_verse = true
       WHERE id = $1 AND room_id = $2 AND session_id = $3`,
      [highlightId, roomId, sessionId]
    );
  }
}

// ─── Shared Notes (Task #436) ─────────────────────────────────────────────────

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

function rowToNote(r: Record<string, unknown>): SharedNote {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    roomId: String(r.room_id),
    userId: String(r.user_id),
    authorName: r.author_name && String(r.author_name).trim()
      ? String(r.author_name).trim()
      : "Member",
    text: String(r.text),
    isPinned: Boolean(r.is_pinned),
    createdAt: String(r.created_at),
  };
}

/** Get all shared notes for a session, pinned first. */
export async function getSharedNotes(
  roomId: string,
  sessionId: string
): Promise<SharedNote[]> {
  const { rows } = await pool.query(
    `SELECT * FROM room_shared_notes
     WHERE room_id = $1 AND session_id = $2
     ORDER BY is_pinned DESC, created_at ASC`,
    [roomId, sessionId]
  );
  return rows.map(r => rowToNote(r as Record<string, unknown>));
}

/** Add a shared note to the session. */
/**
 * Add a shared note to an active session.
 * The INSERT is conditional on room_sessions.status = 'active' so the
 * active-status predicate and the insert are atomic — no TOCTOU gap exists
 * between a pre-check and the write.
 * Returns null when the session is no longer active (caller sends 409).
 */
export async function addSharedNote(
  sessionId: string,
  roomId: string,
  userId: string,
  authorName: string,
  text: string
): Promise<SharedNote | null> {
  // FOR KEY SHARE conflicts with the FOR UPDATE lock held by completeSession(),
  // forcing this INSERT to wait and re-evaluate the status predicate after the
  // completion transaction commits — at which point status='completed' and
  // no rows are returned, so no note is inserted post-completion.
  const { rows } = await pool.query(
    `INSERT INTO room_shared_notes (session_id, room_id, user_id, author_name, text)
     SELECT $1::uuid, $2, $3, $4, $5
     FROM room_sessions
     WHERE id = $1::uuid AND room_id = $2 AND status = 'active'
     FOR KEY SHARE
     RETURNING *`,
    [sessionId, roomId, userId, authorName.trim() || "Member", text.trim()]
  );
  if (rows.length === 0) return null; // session completed between route check and insert
  return rowToNote(rows[0] as Record<string, unknown>);
}

/** Pin (or unpin) a note. Unpins all others first so only one note is pinned. */
export async function pinNote(
  noteId: string,
  roomId: string,
  pin: boolean
): Promise<void> {
  if (pin) {
    // Unpin all existing pinned notes first
    await pool.query(
      `UPDATE room_shared_notes SET is_pinned = false WHERE room_id = $1 AND is_pinned = true`,
      [roomId]
    );
  }
  await pool.query(
    `UPDATE room_shared_notes SET is_pinned = $1 WHERE id = $2 AND room_id = $3`,
    [pin, noteId, roomId]
  );
}

export interface PrayerRequest {
  id: string;
  roomId: string;
  userId: string;
  authorName: string;
  request: string;
  isAnswered: boolean;
  createdAt: string;
}

export async function getPrayerRequests(roomId: string): Promise<PrayerRequest[]> {
  const { rows } = await pool.query(
    `SELECT id, room_id, user_id, author_name, request, is_answered, created_at
     FROM room_prayer_requests
     WHERE room_id = $1
     ORDER BY created_at DESC`,
    [roomId]
  );
  return rows.map(r => ({
    id: String(r.id),
    roomId: String(r.room_id),
    userId: String(r.user_id),
    authorName: String(r.author_name),
    request: String(r.request),
    isAnswered: Boolean(r.is_answered),
    createdAt: String(r.created_at),
  }));
}

/**
 * Add a prayer request.
 *
 * When `sessionId` is provided (session-mode contribution):
 *   The INSERT is conditional on room_sessions.status = 'active' via a
 *   correlated SELECT — the active-status predicate and the INSERT are part
 *   of the same SQL statement, eliminating the TOCTOU window that exists when
 *   a separate EXISTS check precedes the insert.  Returns null when the session
 *   is no longer active (caller sends 409).
 *
 * When `sessionId` is omitted (general room use outside a session):
 *   The insert is unconditional — prayer requests are a room-level feature
 *   that exists independently of sessions.
 */
export async function addPrayerRequest(
  roomId: string,
  userId: string,
  authorName: string,
  request: string,
  sessionId?: string
): Promise<PrayerRequest | null> {
  const name = authorName.trim() || "Member";
  const text = request.trim();

  let rows: Array<Record<string, unknown>>;

  if (sessionId) {
    // Session-scoped: gate on active session via INSERT…SELECT.
    // FOR KEY SHARE conflicts with the FOR UPDATE lock held by completeSession(),
    // forcing this INSERT to wait and re-evaluate the status predicate after
    // the completion transaction commits — at which point status='completed'
    // and no rows are returned, so no prayer is inserted post-completion.
    const result = await pool.query(
      `INSERT INTO room_prayer_requests (room_id, session_id, user_id, author_name, request)
       SELECT $1, $2::uuid, $3, $4, $5
       FROM room_sessions
       WHERE id = $2::uuid AND room_id = $1 AND status = 'active'
       FOR KEY SHARE
       RETURNING id, room_id, user_id, author_name, request, is_answered, created_at`,
      [roomId, sessionId, userId, name, text]
    );
    rows = result.rows as Array<Record<string, unknown>>;
    if (rows.length === 0) return null; // session completed — reject post-session submission
  } else {
    // Room-level (no session): always allow.
    const result = await pool.query(
      `INSERT INTO room_prayer_requests (room_id, user_id, author_name, request)
       VALUES ($1, $2, $3, $4)
       RETURNING id, room_id, user_id, author_name, request, is_answered, created_at`,
      [roomId, userId, name, text]
    );
    rows = result.rows as Array<Record<string, unknown>>;
  }

  const r = rows[0];
  return {
    id: String(r.id),
    roomId: String(r.room_id),
    userId: String(r.user_id),
    authorName: String(r.author_name),
    request: String(r.request),
    isAnswered: Boolean(r.is_answered),
    createdAt: String(r.created_at),
  };
}

export async function markPrayerAnswered(
  prayerId: string,
  roomId: string
): Promise<void> {
  await pool.query(
    `UPDATE room_prayer_requests SET is_answered = true
     WHERE id = $1 AND room_id = $2`,
    [prayerId, roomId]
  );
}

// ─── Video session store ──────────────────────────────────────────────────────

export interface VideoSessionStatus {
  videoActive: boolean;
  startedAt: string | null;
  startedBy: string | null;
  livekitRoomName: string | null;
  meetingMode: "audio" | "video";
}

/** Read the current video session state for a room. */
export async function getVideoStatus(roomId: string): Promise<VideoSessionStatus> {
  const { rows } = await pool.query(
    `SELECT video_active, video_started_at, video_started_by, livekit_room_name, meeting_mode
     FROM rooms WHERE id = $1`,
    [roomId]
  );
  if (!rows[0]) throw new Error("Room not found");
  const r = rows[0];
  return {
    videoActive: Boolean(r.video_active),
    startedAt: r.video_started_at ? String(r.video_started_at) : null,
    startedBy: r.video_started_by ? String(r.video_started_by) : null,
    livekitRoomName: r.livekit_room_name ? String(r.livekit_room_name) : null,
    meetingMode: r.meeting_mode === "audio" ? "audio" : "video",
  };
}

/** Mark the room's video session as active. */
export async function startVideoSession(
  roomId: string,
  startedBy: string,
  livekitRoomName: string,
  meetingMode: "audio" | "video" = "video",
): Promise<void> {
  await pool.query(
    `UPDATE rooms
     SET video_active = true,
         video_started_at = NOW(),
         video_started_by = $2,
          livekit_room_name = $3,
          meeting_mode = $4
     WHERE id = $1`,
    [roomId, startedBy, livekitRoomName, meetingMode]
  );
}

export interface RoomDiscussion {
  id: string;
  roomId: string;
  sessionId: string;
  createdAt: string;
}

function rowToDiscussion(row: Record<string, unknown>): RoomDiscussion {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    sessionId: String(row.session_id),
    createdAt: String(row.created_at),
  };
}

/** Get or create the one discussion channel belonging to a session. */
export async function getOrCreateSessionDiscussion(
  roomId: string,
  sessionId: string,
): Promise<RoomDiscussion> {
  const res = await pool.query(
    `INSERT INTO room_discussions (room_id, session_id)
     SELECT $1, rs.id
     FROM room_sessions rs
     WHERE rs.id = $2 AND rs.room_id = $1
     ON CONFLICT (session_id) DO UPDATE SET room_id = EXCLUDED.room_id
     RETURNING *`,
    [roomId, sessionId],
  );
  if (!res.rows[0]) throw new Error("SESSION_NOT_FOUND");
  return rowToDiscussion(res.rows[0] as Record<string, unknown>);
}

export async function getSessionDiscussion(
  roomId: string,
  sessionId: string,
): Promise<RoomDiscussion | null> {
  const res = await pool.query(
    `SELECT * FROM room_discussions WHERE room_id = $1 AND session_id = $2`,
    [roomId, sessionId],
  );
  return res.rows[0] ? rowToDiscussion(res.rows[0] as Record<string, unknown>) : null;
}

export async function getDiscussionById(
  roomId: string,
  discussionId: string,
): Promise<RoomDiscussion | null> {
  const res = await pool.query(
    `SELECT * FROM room_discussions WHERE room_id = $1 AND id = $2`,
    [roomId, discussionId],
  );
  return res.rows[0] ? rowToDiscussion(res.rows[0] as Record<string, unknown>) : null;
}

/** Mark the room's video session as ended. */
export async function endVideoSession(roomId: string): Promise<void> {
  await pool.query(
    `UPDATE rooms
     SET video_active = false,
         video_started_at = NULL,
         video_started_by = NULL,
          livekit_room_name = NULL,
          meeting_mode = 'video'
     WHERE id = $1`,
    [roomId]
  );
}

/**
 * Count how many rooms in the DB currently have video_active = true.
 * Used to enforce the maxConcurrentRooms church setting.
 */
export async function getActiveVideoRoomCount(): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM rooms WHERE video_active = true`
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Count current room members (used for participant limit enforcement).
 */
export async function getRoomMemberCount(roomId: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM room_members WHERE room_id = $1`,
    [roomId]
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Check whether a user is an Authorized Room Leader.
 *
 * Three paths to authorization (any one is sufficient):
 *   1. explicit:       authorized_room_leader = TRUE in user_profiles
 *   2. pastoral_role:  pastoral_role = 'pastor' in user_profiles
 *   3. admin_role:     appRole is 'admin' or 'superAdmin'
 *
 * This does NOT check room membership — use canHostVideo() for that.
 * Never trust a client-supplied appRole; call getUserRole() before passing it.
 */
export async function isAuthorizedLeader(
  userId: string,
  appRole: string
): Promise<boolean> {
  if (appRole === "admin" || appRole === "superAdmin") return true;
  const { rows } = await pool.query(
    `SELECT authorized_room_leader, pastoral_role
       FROM user_profiles
       WHERE auth_subject = $1 OR email = $1`,
    [userId]
  );
  if (!rows[0]) return false;
  if (rows[0].authorized_room_leader === true) return true;
  if (rows[0].pastoral_role === "pastor") return true;
  return false;
}

/**
 * Get the current leader-access state for a user, including the authorization
 * source so the admin UI can render read-only notices for role-based grants.
 */
export async function getLeaderAccess(
  userId: string,
  appRole: string
): Promise<{ authorized: boolean; source: "admin_role" | "pastoral_role" | "explicit" | "none" }> {
  if (appRole === "admin" || appRole === "superAdmin") {
    return { authorized: true, source: "admin_role" };
  }
  const { rows } = await pool.query(
    `SELECT authorized_room_leader, pastoral_role
       FROM user_profiles
       WHERE auth_subject = $1 OR email = $1`,
    [userId]
  );
  if (!rows[0]) return { authorized: false, source: "none" };
  if (rows[0].pastoral_role === "pastor") {
    return { authorized: true, source: "pastoral_role" };
  }
  if (rows[0].authorized_room_leader === true) {
    return { authorized: true, source: "explicit" };
  }
  return { authorized: false, source: "none" };
}

/**
 * Set or clear the explicit authorized_room_leader flag for a user.
 * Role-based grants (admin, pastor) are unaffected — they remain authoritative
 * even if this flag is false.
 */
export async function setLeaderAccess(
  userId: string,
  authorized: boolean
): Promise<void> {
  const result = await pool.query(
    `UPDATE user_profiles
     SET authorized_room_leader = $2, updated_at = NOW()
     WHERE auth_subject = $1 OR email = $1`,
    [userId, authorized]
  );
  if (result.rowCount === 0) {
    throw new Error("Cannot update Room leader access for an unknown account");
  }
}

/**
 * Check whether a user is authorised to HOST (start/end) video for a room.
 *
 * Conditions (ALL must be true):
 *  1. User must be an appointed room Owner or Leader.
 *  2. Global application roles do not grant room host privileges.
 *
 * Never trust a client-supplied appRole — call getUserRole() before passing it.
 */
export async function canHostVideo(
  userId: string,
  roomId: string,
  _appRole?: string
): Promise<boolean> {
  // Room hosting is appointed at the room level. The application role is
  // intentionally ignored so a global admin who is only a Member cannot host.
  const { rows: memberRows } = await pool.query(
    `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  return canHostWithRoomRole(memberRows[0]?.role);
}

// ─── Church video settings ────────────────────────────────────────────────────

export interface VideoSettings {
  videoEnabled: boolean;
  maxConcurrentRooms: number;
  maxParticipantsPerRoom: number;
  maxDurationMinutes: number;
  allowedRoles: string[];
}

export async function getVideoSettings(): Promise<VideoSettings> {
  const { rows } = await pool.query(
    `SELECT video_enabled, max_concurrent_rooms, max_participants_per_room,
            max_duration_minutes, allowed_roles
     FROM church_video_settings WHERE id = 1`
  );
  const row = rows[0] ?? {};
  return {
    videoEnabled: Boolean(row.video_enabled),
    maxConcurrentRooms: Number(row.max_concurrent_rooms ?? 5),
    maxParticipantsPerRoom: Number(row.max_participants_per_room ?? 20),
    maxDurationMinutes: Number(row.max_duration_minutes ?? 120),
    allowedRoles: Array.isArray(row.allowed_roles)
      ? (row.allowed_roles as string[])
      : ["group_leader", "pastor", "admin", "superAdmin"],
  };
}

export async function updateVideoSettings(
  patch: Partial<VideoSettings>
): Promise<VideoSettings> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let idx = 1;
  if (patch.videoEnabled !== undefined) {
    sets.push(`video_enabled = $${idx++}`);
    vals.push(patch.videoEnabled);
  }
  if (patch.maxConcurrentRooms !== undefined) {
    sets.push(`max_concurrent_rooms = $${idx++}`);
    vals.push(patch.maxConcurrentRooms);
  }
  if (patch.maxParticipantsPerRoom !== undefined) {
    sets.push(`max_participants_per_room = $${idx++}`);
    vals.push(patch.maxParticipantsPerRoom);
  }
  if (patch.maxDurationMinutes !== undefined) {
    sets.push(`max_duration_minutes = $${idx++}`);
    vals.push(patch.maxDurationMinutes);
  }
  if (patch.allowedRoles !== undefined) {
    sets.push(`allowed_roles = $${idx++}`);
    vals.push(patch.allowedRoles);
  }
  if (sets.length > 0) {
    sets.push(`updated_at = NOW()`);
    await pool.query(
      `UPDATE church_video_settings SET ${sets.join(", ")} WHERE id = 1`,
      vals
    );
  }
  return getVideoSettings();
}

/**
 * Returns the set of userIds currently considered online in a room.
 *
 * A user is online if EITHER:
 *   (a) They have at least one active presence SSE connection, OR
 *   (b) Their last heartbeat was within the past 60 s (fallback for network
 *       partitions where the SSE close event never fires).
 */
export function getOnlineUserIds(roomId: string): string[] {
  const onlineSet = new Set<string>();

  // (a) Active SSE connections — immediate signal
  const counts = presenceConnectionCounts.get(roomId);
  if (counts) {
    for (const [uid, count] of counts) {
      if (count > 0) onlineSet.add(uid);
    }
  }

  // (b) Recent heartbeat — fallback for clients without an open SSE stream
  const cutoff = Date.now() - 60_000;
  const roomMap = presenceStore.get(roomId);
  if (roomMap) {
    for (const [uid, ts] of roomMap) {
      if (ts >= cutoff) onlineSet.add(uid);
    }
  }

  return [...onlineSet];
}

/**
 * Remove all presence entries for a room (e.g. after deleteRoom).
 */
export function clearRoomPresence(roomId: string): void {
  presenceStore.delete(roomId);
  // Push empty list to any open presence SSE streams before they are terminated
  pushPresenceToRoom(roomId);
}

/**
 * Record a heartbeat for a user in a room.
 * Prunes stale entries for this room on each call to keep the map tidy.
 * Pushes an updated presence list to any SSE subscribers for this room.
 */
export function recordPresenceHeartbeat(roomId: string, userId: string): void {
  if (!presenceStore.has(roomId)) {
    presenceStore.set(roomId, new Map());
  }
  const roomMap = presenceStore.get(roomId)!;
  roomMap.set(userId, Date.now());

  // Prune entries that have been silent for > PRESENCE_STALE_MS
  const cutoff = Date.now() - PRESENCE_STALE_MS;
  for (const [uid, ts] of roomMap) {
    if (ts < cutoff) roomMap.delete(uid);
  }

  // Push updated list to any open presence SSE streams for this room
  pushPresenceToRoom(roomId);
}

const presenceStore = new Map<string, Map<string, number>>();

// ─── Room Polls (Task #437) ────────────────────────────────────────────────────

export interface RoomPoll {
  id: string;
  sessionId: string;
  roomId: string;
  createdBy: string;
  question: string;
  pollType: "yes_no" | "multiple_choice";
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

// ─── Room Emmaus Answers (Task #437) ──────────────────────────────────────────

export interface RoomEmmausAnswer {
  id: string;
  sessionId: string;
  roomId: string;
  askedBy: string;
  question: string;
  answer: string;
  createdAt: string;
}

function rowToPoll(r: Record<string, unknown>): RoomPoll {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    roomId: String(r.room_id),
    createdBy: String(r.created_by),
    question: String(r.question),
    pollType: (r.poll_type as "yes_no" | "multiple_choice") ?? "yes_no",
    options: Array.isArray(r.options) ? (r.options as string[]) : [],
    resultsRevealed: Boolean(r.results_revealed),
    createdAt: String(r.created_at),
  };
}

function rowToEmmausAnswer(r: Record<string, unknown>): RoomEmmausAnswer {
  return {
    id: String(r.id),
    sessionId: String(r.session_id),
    roomId: String(r.room_id),
    askedBy: String(r.asked_by),
    question: String(r.question),
    answer: String(r.answer ?? ""),
    createdAt: String(r.created_at),
  };
}

/** Create a new poll for the active session. Leader only (enforced by route). */
export async function createPoll(
  sessionId: string,
  roomId: string,
  createdBy: string,
  question: string,
  pollType: "yes_no" | "multiple_choice",
  options: string[]
): Promise<RoomPoll> {
  const { rows } = await pool.query(
    `INSERT INTO room_polls (session_id, room_id, created_by, question, poll_type, options)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)
     RETURNING *`,
    [sessionId, roomId, createdBy, question, pollType, JSON.stringify(options)]
  );
  return rowToPoll(rows[0] as Record<string, unknown>);
}

/** Get the most recent poll for a session (active or revealed). */
export async function getActivePoll(
  roomId: string,
  sessionId: string
): Promise<RoomPoll | null> {
  const { rows } = await pool.query(
    `SELECT * FROM room_polls
     WHERE room_id = $1 AND session_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [roomId, sessionId]
  );
  if (!rows[0]) return null;
  return rowToPoll(rows[0] as Record<string, unknown>);
}

/** Remove the current poll so it cannot return during reconnect hydration. */
export async function clearActivePoll(
  roomId: string,
  sessionId: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM room_poll_votes
        WHERE poll_id IN (
          SELECT id FROM room_polls
           WHERE room_id = $1 AND session_id = $2
           ORDER BY created_at DESC
           LIMIT 1
        )`,
      [roomId, sessionId],
    );
    await client.query(
      `DELETE FROM room_polls
       WHERE id = (
         SELECT id FROM room_polls
          WHERE room_id = $1 AND session_id = $2
          ORDER BY created_at DESC
          LIMIT 1
       )`,
      [roomId, sessionId],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get a poll with aggregate vote counts.
 * Individual votes are never exposed — only per-option totals.
 */
export async function getPollWithResults(
  pollId: string,
  roomId: string,
  userId: string
): Promise<RoomPollResults | null> {
  const { rows: pollRows } = await pool.query(
    `SELECT * FROM room_polls WHERE id = $1 AND room_id = $2 LIMIT 1`,
    [pollId, roomId]
  );
  if (!pollRows[0]) return null;
  const poll = rowToPoll(pollRows[0] as Record<string, unknown>);

  const { rows: voteRows } = await pool.query(
    `SELECT option_index, COUNT(*)::int AS count
     FROM room_poll_votes WHERE poll_id = $1
     GROUP BY option_index`,
    [pollId]
  );
  const voteCounts = poll.options.map((_, i) => {
    const found = voteRows.find((r) => Number(r.option_index) === i);
    return found ? Number(found.count) : 0;
  });
  const totalVotes = voteCounts.reduce((a, b) => a + b, 0);

  const { rows: myRows } = await pool.query(
    `SELECT option_index FROM room_poll_votes
     WHERE poll_id = $1 AND user_id = $2 LIMIT 1`,
    [pollId, userId]
  );
  const userVotedIndex = myRows[0] ? Number(myRows[0].option_index) : null;

  return { poll, voteCounts, totalVotes, userVotedIndex };
}

/**
 * Cast a vote. UNIQUE constraint on (poll_id, user_id) silently
 * discards duplicate votes so the route never needs to handle them specially.
 */
export async function castVote(
  pollId: string,
  userId: string,
  optionIndex: number
): Promise<void> {
  await pool.query(
    `INSERT INTO room_poll_votes (poll_id, user_id, option_index)
     VALUES ($1, $2, $3)
     ON CONFLICT (poll_id, user_id) DO NOTHING`,
    [pollId, userId, optionIndex]
  );
}

/** Reveal the poll results to all members. Leader only (enforced by route). */
export async function revealPollResults(
  pollId: string,
  roomId: string
): Promise<void> {
  await pool.query(
    `UPDATE room_polls SET results_revealed = true
     WHERE id = $1 AND room_id = $2`,
    [pollId, roomId]
  );
}

/** Store a completed shared Ask Emmaus answer for the session. */
export async function addEmmausAnswer(
  sessionId: string,
  roomId: string,
  askedBy: string,
  question: string,
  answer: string
): Promise<RoomEmmausAnswer> {
  const { rows } = await pool.query(
    `INSERT INTO room_emmaus_answers (session_id, room_id, asked_by, question, answer)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [sessionId, roomId, askedBy, question, answer]
  );
  return rowToEmmausAnswer(rows[0] as Record<string, unknown>);
}

/** List all shared Emmaus answers for a session, oldest-first. */
export async function getSessionEmmausAnswers(
  roomId: string,
  sessionId: string
): Promise<RoomEmmausAnswer[]> {
  const { rows } = await pool.query(
    `SELECT * FROM room_emmaus_answers
     WHERE room_id = $1 AND session_id = $2
     ORDER BY created_at ASC`,
    [roomId, sessionId]
  );
  return rows.map((r) => rowToEmmausAnswer(r as Record<string, unknown>));
}
