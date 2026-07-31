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

export interface RoomMember {
  userId: string;
  preferredName: string;
  role: "admin" | "member";
  joinedAt: string;
}

export interface RoomSummary {
  id: string;
  name: string;
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
    preferredName: resolveDisplayName(row, "user_id", "preferred_name"),
    role: (row.role as "admin" | "member") ?? "member",
    joinedAt: String(row.joined_at ?? ""),
  };
}

function rowToSummary(row: Record<string, unknown>): RoomSummary {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    inviteCode: String(row.invite_code ?? ""),
    inviteToken: String(row.invite_token ?? ""),
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? ""),
    memberCount: Number(row.member_count ?? 0),
    adminName: resolveDisplayName(row, "created_by", "admin_preferred_name"),
  };
}

function rowToMessage(row: Record<string, unknown>): RoomMessage {
  return {
    id: String(row.id),
    roomId: String(row.room_id),
    userId: String(row.user_id),
    senderName: resolveDisplayName(row, "user_id", "preferred_name"),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

export async function createRoom(
  name: string,
  createdBy: string
): Promise<{ roomId: string; inviteCode: string; inviteToken: string }> {
  const inviteCode = await generateInviteCode();
  const inviteToken = randomUUID();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const res = await client.query(
      `INSERT INTO rooms (name, invite_code, invite_token, created_by)
       VALUES ($1, $2, $3, $4)
       RETURNING id, invite_code, invite_token`,
      [name, inviteCode, inviteToken, createdBy]
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
}

export async function deleteRoom(roomId: string): Promise<void> {
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
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

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
  return rowToMessage({ ...row, preferred_name });
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
