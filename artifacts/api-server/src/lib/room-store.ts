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
  // Church service rooms are admin-only (whole-church broadcast context)
  if (roomType === "church_service") {
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
}

export interface SessionEvent {
  type:
    | "session_started"
    | "session_ended"
    | "navigate"
    | "mode_change"
    | "focus_verse"
    | "poll_started"
    | "poll_result"
    | "session_state";
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
  };
}

/** Start a new guided session for a room. Returns the new session. */
export async function startSession(
  roomId: string,
  startedBy: string
): Promise<RoomSession> {
  // End any existing active session first (idempotent — there should be at most one)
  await pool.query(
    `UPDATE room_sessions SET status = 'ended', ended_at = NOW()
     WHERE room_id = $1 AND status = 'active'`,
    [roomId]
  );
  const { rows } = await pool.query(
    `INSERT INTO room_sessions (room_id, started_by)
     VALUES ($1, $2)
     RETURNING *`,
    [roomId, startedBy]
  );
  return rowToSession(rows[0] as Record<string, unknown>);
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

/** Record a member joining the active session for attendance. */
export async function recordSessionJoin(
  sessionId: string,
  roomId: string,
  userId: string
): Promise<void> {
  await pool.query(
    `INSERT INTO room_session_attendance (session_id, room_id, user_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (session_id, user_id) DO UPDATE SET joined_at = NOW(), left_at = NULL`,
    [sessionId, roomId, userId]
  );
}

/** Record a member leaving the active session. */
export async function recordSessionLeave(
  sessionId: string,
  userId: string
): Promise<void> {
  await pool.query(
    `UPDATE room_session_attendance
     SET left_at = NOW()
     WHERE session_id = $1 AND user_id = $2 AND left_at IS NULL`,
    [sessionId, userId]
  );
}

/** Get attendance for a session. */
export async function getSessionAttendance(
  sessionId: string
): Promise<Array<{ userId: string; preferredName: string; joinedAt: string; leftAt: string | null }>> {
  const { rows } = await pool.query(
    `SELECT a.user_id, a.joined_at, a.left_at, up.preferred_name
     FROM room_session_attendance a
     LEFT JOIN user_profiles up ON up.email = a.user_id
     WHERE a.session_id = $1
     ORDER BY a.joined_at ASC`,
    [sessionId]
  );
  return rows.map(r => ({
    userId: String(r.user_id),
    preferredName: r.preferred_name && String(r.preferred_name).trim()
      ? String(r.preferred_name).trim()
      : "",
    joinedAt: String(r.joined_at),
    leftAt: r.left_at ? String(r.left_at) : null,
  }));
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
       FROM user_profiles WHERE email = $1`,
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
       FROM user_profiles WHERE email = $1`,
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
  await pool.query(
    `INSERT INTO user_profiles (email, authorized_room_leader)
     VALUES ($1, $2)
     ON CONFLICT (email) DO UPDATE SET authorized_room_leader = EXCLUDED.authorized_room_leader`,
    [userId, authorized]
  );
}

/**
 * Check whether a user is authorised to HOST (start/end) video for a room.
 *
 * Conditions (ALL must be true):
 *  1. User must be the room admin (room_members.role = 'admin').
 *  2. User must be an Authorized Room Leader (isAuthorizedLeader).
 *
 * Never trust a client-supplied appRole — call getUserRole() before passing it.
 */
export async function canHostVideo(
  userId: string,
  roomId: string,
  appRole: string
): Promise<boolean> {
  // 1. Must be the room admin
  const { rows: memberRows } = await pool.query(
    `SELECT role FROM room_members WHERE room_id = $1 AND user_id = $2`,
    [roomId, userId]
  );
  if (memberRows[0]?.role !== "admin") return false;

  // 2. Must be an Authorized Room Leader
  return isAuthorizedLeader(userId, appRole);
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
