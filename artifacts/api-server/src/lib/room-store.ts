/**
 * room-store.ts — PostgreSQL CRUD for the Rooms feature.
 *
 * Rooms are invite-only groups. Members join via a 7-char code or a UUID link
 * token. Each room has one admin (the creator, or a transferred admin), a shared
 * chat, and optionally linked journeys.
 */

import { pool } from "@workspace/db";
import { randomUUID } from "node:crypto";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RoomType = "personal" | "ministry" | "leadership" | "church_service";

/** Content dimension: what kind of content the Room is built around. */
export type ContentType = "walk" | "journey" | "devotional" | "bible-study" | "sermon-companion";

export interface RoomMember {
  userId: string;
  preferredName: string;
  role: "admin" | "member";
  joinedAt: string;
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
}

export interface RoomDetail extends RoomSummary {
  members: RoomMember[];
  linkedJourneys: LinkedJourney[];
}

export interface LinkedJourney {
  journeyId: string;
  startedBy: string;
  startedAt: string;
}

export interface RoomMessage {
  id: string;
  roomId: string;
  userId: string;
  senderName: string;
  body: string;
  createdAt: string;
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
    role: (row.role as "admin" | "member") ?? "member",
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

    // Creator becomes the admin member automatically
    await client.query(
      `INSERT INTO room_members (room_id, user_id, role)
       VALUES ($1, $2, 'admin')`,
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
 * personal  — any authenticated user
 * ministry  — group_leader, pastor, admin, superAdmin
 * leadership — pastor, admin, superAdmin
 * church_service — admin, superAdmin only (no pastoral_role override)
 *
 * appRole should come from getUserRole() (user-role-store) to avoid
 * header spoofing.
 */
export async function canCreateRoomType(
  userId: string,
  roomType: RoomType,
  appRole: string
): Promise<boolean> {
  if (roomType === "personal") return true;
  if (appRole === "admin" || appRole === "superAdmin") return true;
  if (roomType === "church_service") return false; // admin/superAdmin only (caught above)

  // Check pastoral_role for ministry / leadership
  const { rows } = await pool.query(
    "SELECT pastoral_role FROM user_profiles WHERE user_id = $1",
    [userId]
  );
  const pastoralRole: string = rows[0]?.pastoral_role ?? "";

  if (roomType === "ministry") {
    return ["group_leader", "pastor"].includes(pastoralRole);
  }
  if (roomType === "leadership") {
    return pastoralRole === "pastor";
  }
  return false;
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
     LEFT JOIN room_members rm_admin ON rm_admin.room_id = r.id AND rm_admin.role = 'admin'
     LEFT JOIN user_profiles up      ON up.email = rm_admin.user_id
     GROUP BY r.id, up.preferred_name, rm_admin.user_id
     ORDER BY r.created_at DESC`
  );
  return res.rows.map(rowToSummary);
}
export async function getRoomsForUser(
  userId: string
): Promise<Array<RoomSummary & { currentUserRole: "admin" | "member" }>> {
  const res = await pool.query(
    `SELECT r.*,
            rm.role            AS current_user_role,
            COUNT(rm2.user_id) AS member_count,
            up.preferred_name  AS admin_preferred_name,
            rm_admin.user_id   AS admin_user_id
     FROM   rooms r
     JOIN   room_members rm ON rm.room_id = r.id AND rm.user_id = $1
     JOIN   room_members rm2 ON rm2.room_id = r.id
     LEFT JOIN room_members rm_admin ON rm_admin.room_id = r.id AND rm_admin.role = 'admin'
     LEFT JOIN user_profiles up ON up.email = rm_admin.user_id
     GROUP  BY r.id, up.preferred_name, rm_admin.user_id, rm.role
     ORDER  BY r.created_at DESC`,
    [userId]
  );
  return res.rows.map(row => ({
    ...rowToSummary(row),
    currentUserRole: (row.current_user_role as "admin" | "member") ?? "member",
  }));
}

export async function getRoomById(roomId: string): Promise<RoomDetail | null> {
  const roomRes = await pool.query(
    `SELECT r.*,
            COUNT(rm.user_id) AS member_count,
            up.preferred_name AS admin_preferred_name
     FROM   rooms r
     LEFT JOIN room_members rm ON rm.room_id = r.id
     LEFT JOIN room_members rm_admin ON rm_admin.room_id = r.id AND rm_admin.role = 'admin'
     LEFT JOIN user_profiles up ON up.email = rm_admin.user_id
     WHERE  r.id = $1
     GROUP  BY r.id, up.preferred_name`,
    [roomId]
  );
  if (!roomRes.rows[0]) return null;

  const membersRes = await pool.query(
    `SELECT rm.user_id, rm.role, rm.joined_at, up.preferred_name
     FROM   room_members rm
     LEFT JOIN user_profiles up ON up.email = rm.user_id
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

export async function getMemberRole(
  roomId: string,
  userId: string
): Promise<"admin" | "member" | null> {
  const res = await pool.query(
    `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  return res.rows[0]?.role ?? null;
}

export async function joinByCode(
  inviteCode: string,
  userId: string
): Promise<{ roomId: string } | null> {
  const roomRes = await pool.query(
    `SELECT id FROM rooms WHERE invite_code = $1`,
    [inviteCode.toUpperCase()]
  );
  if (!roomRes.rows[0]) return null;
  const { id: roomId } = roomRes.rows[0];

  // Upsert — silently succeeds if already a member
  await pool.query(
    `INSERT INTO room_members (room_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [roomId, userId]
  );
  return { roomId };
}

export async function joinByToken(
  inviteToken: string,
  userId: string
): Promise<{ roomId: string } | null> {
  const roomRes = await pool.query(
    `SELECT id FROM rooms WHERE invite_token = $1`,
    [inviteToken]
  );
  if (!roomRes.rows[0]) return null;
  const { id: roomId } = roomRes.rows[0];

  await pool.query(
    `INSERT INTO room_members (room_id, user_id, role)
     VALUES ($1, $2, 'member')
     ON CONFLICT (room_id, user_id) DO NOTHING`,
    [roomId, userId]
  );
  return { roomId };
}

export async function leaveRoom(roomId: string, userId: string): Promise<void> {
  await pool.query(
    `DELETE FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  // Close any open SSE stream for the departed member immediately
  terminateUserFromRoom(roomId, userId);
}

export async function deleteRoom(roomId: string): Promise<void> {
  // Close all open SSE streams before deleting so no subscriber receives
  // post-deletion events.
  terminateAllFromRoom(roomId);
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
    await client.query(
      `UPDATE room_members SET role = 'member' WHERE room_id = $1 AND user_id = $2`,
      [roomId, fromUserId]
    );
    await client.query(
      `UPDATE room_members SET role = 'admin'  WHERE room_id = $1 AND user_id = $2`,
      [roomId, toUserId]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
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
  // Close any open SSE stream for the removed member immediately
  terminateUserFromRoom(roomId, targetUserId);
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
  before?: string
): Promise<RoomMessage[]> {
  const params: unknown[] = [roomId, limit];
  let beforeClause = "";
  if (before) {
    params.push(before);
    beforeClause = `AND rm.created_at < $${params.length}`;
  }

  const res = await pool.query(
    `SELECT rm.*, up.preferred_name
     FROM   room_messages rm
     LEFT JOIN user_profiles up ON up.email = rm.user_id
     WHERE  rm.room_id = $1
     ${beforeClause}
     ORDER  BY rm.created_at DESC
     LIMIT  $2`,
    params
  );
  return res.rows.map(rowToMessage);
}

export async function addMessage(
  roomId: string,
  userId: string,
  body: string
): Promise<RoomMessage> {
  const res = await pool.query(
    `INSERT INTO room_messages (room_id, user_id, body)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [roomId, userId, body]
  );
  const row = res.rows[0] as Record<string, unknown>;
  // Fetch sender name separately to include in response
  const nameRes = await pool.query(
    `SELECT preferred_name FROM user_profiles WHERE email = $1`,
    [userId]
  );
  const preferred_name = nameRes.rows[0]?.preferred_name ?? null;
  const msg = rowToMessage({ ...row, preferred_name });

  // Notify all SSE subscribers for this room
  notifySubscribers(roomId, msg);

  return msg;
}

// ─── Linked journeys ──────────────────────────────────────────────────────────

export async function linkJourney(
  roomId: string,
  journeyId: string,
  startedBy: string
): Promise<void> {
  await pool.query(
    `INSERT INTO room_journeys (room_id, journey_id, started_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (room_id, journey_id) DO NOTHING`,
    [roomId, journeyId, startedBy]
  );
}

// ─── Atomic shared-start ─────────────────────────────────────────────────────

export interface StartSharedParams {
  userId: string;
  journeyId: string;
  /** Provide roomId to use an existing room, or roomName to create a new one. */
  roomId?: string;
  roomName?: string;
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
      // Create the room and make the caller its admin
      const roomRes = await client.query(
        `INSERT INTO rooms (name, invite_code, invite_token, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [params.roomName!.trim(), inviteCode, inviteToken, userId]
      );
      roomId = String(roomRes.rows[0].id);
      await client.query(
        `INSERT INTO room_members (room_id, user_id, role) VALUES ($1, $2, 'admin')`,
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
         (user_id, journey_id, current_day, completed_days, started_at, status, created_at, updated_at)
       VALUES ($1, $2, 1, '[]'::jsonb, $3, 'active', $3, $3)
       ON CONFLICT (user_id, journey_id) DO NOTHING`,
      [userId, journeyId, now]
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
     LEFT JOIN user_profiles up    ON up.email = rm.user_id
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

// ─── Prayer requests ──────────────────────────────────────────────────────────

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

export async function addPrayerRequest(
  roomId: string,
  userId: string,
  authorName: string,
  request: string
): Promise<PrayerRequest> {
  const { rows } = await pool.query(
    `INSERT INTO room_prayer_requests (room_id, user_id, author_name, request)
     VALUES ($1, $2, $3, $4)
     RETURNING id, room_id, user_id, author_name, request, is_answered, created_at`,
    [roomId, userId, authorName.trim() || "Member", request.trim()]
  );
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
}

/** Read the current video session state for a room. */
export async function getVideoStatus(roomId: string): Promise<VideoSessionStatus> {
  const { rows } = await pool.query(
    `SELECT video_active, video_started_at, video_started_by, livekit_room_name
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
  };
}

/** Mark the room's video session as active. */
export async function startVideoSession(
  roomId: string,
  startedBy: string,
  livekitRoomName: string
): Promise<void> {
  await pool.query(
    `UPDATE rooms
     SET video_active = true,
         video_started_at = NOW(),
         video_started_by = $2,
         livekit_room_name = $3
     WHERE id = $1`,
    [roomId, startedBy, livekitRoomName]
  );
}

/** Mark the room's video session as ended. */
export async function endVideoSession(roomId: string): Promise<void> {
  await pool.query(
    `UPDATE rooms
     SET video_active = false,
         video_started_at = NULL,
         video_started_by = NULL,
         livekit_room_name = NULL
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
 * Check whether a user is authorised to host (start/end) video for this room.
 *
 * Conditions (ALL must be true):
 *  1. User must be the room admin (room_members.role = 'admin').
 *  2. User's role (app role OR pastoral role) must be in church allowedRoles.
 *
 * Never trust a client-supplied role — call getUserRole() before passing appRole.
 */
export async function canHostVideo(
  userId: string,
  roomId: string,
  appRole: string,
  allowedRoles: string[]
): Promise<boolean> {
  // 1. Must be the room admin
  const { rows: memberRows } = await pool.query(
    `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  if (memberRows[0]?.role !== "admin") return false;

  // 2. App admin always allowed if in allowedRoles
  if (
    (appRole === "admin" || appRole === "superAdmin") &&
    allowedRoles.some(r => r === appRole)
  ) {
    return true;
  }

  // 3. Check pastoral_role
  const { rows: profileRows } = await pool.query(
    "SELECT pastoral_role FROM user_profiles WHERE user_id = $1",
    [userId]
  );
  const pastoralRole: string = profileRows[0]?.pastoral_role ?? "";
  return pastoralRole !== "" && allowedRoles.includes(pastoralRole);
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
