/**
 * routes/rooms.ts — Emmaus Rooms API
 *
 * All routes require an authenticated caller (requireAuth).
 * Admin-only operations verify role = 'admin' in room_members before acting.
 *
 * Mounted at /rooms in routes/index.ts.
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../emmaus/auth.js";
import { isStartSharedReady } from "../lib/feature-flags.js";
import {
  createRoom,
  getRoomsForUser,
  getRoomById,
  getMemberRole,
  joinByCode,
  joinByToken,
  leaveRoom,
  deleteRoom,
  updateRoomName,
  transferAdmin,
  removeMember,
  getMessages,
  addMessage,
  linkJourney,
  startShared,
  getAllRoomsAdmin,
  getMemberJourneyProgress,
  isJourneyLinkedToRoom,
  subscribeToRoom,
  canCreateRoomType,
  getVideoSettings,
  updateVideoSettings,
  getVideoStatus,
  startVideoSession,
  endVideoSession,
  getActiveVideoRoomCount,
  getRoomMemberCount,
  canHostVideo,
  isAuthorizedLeader,
  getLeaderAccess,
  setLeaderAccess,
  getPrayerRequests,
  addPrayerRequest,
  markPrayerAnswered,
  recordPresenceHeartbeat,
  getOnlineUserIds,
  subscribeToPresence,
  terminatePresenceUserFromRoom,
  registerPresenceConnection,
  unregisterPresenceConnection,
  startSession,
  endSession,
  getActiveSession,
  updateSessionState,
  broadcastRoomEvent,
  subscribeToSessionEvents,
  recordSessionJoin,
  recordSessionLeave,
  getSessionAttendance,
  terminateAllSessionFromRoom,
  type RoomType,
  type ContentType,
  type VideoSettings,
  type SessionMode,
  type ScriptureRef,
  type SessionEvent,
} from "../lib/room-store.js";
import { isAdmin, getUserRole } from "../lib/user-role-store.js";
import {
  isLiveKitConfigured,
  getLiveKitUrl,
  createLiveKitToken,
  ensureLiveKitRoom,
  deleteLiveKitRoom,
} from "../lib/livekit.js";

const router = Router();

// ─── Application-admin guard ─────────────────────────────────────────────────

async function guardAdmin(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1]
): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  if (!(await isAdmin(userId))) {
    res.status(403).json({ error: "Application admin access required." });
    return null;
  }
  return userId;
}

// ─── Admin: list ALL rooms ────────────────────────────────────────────────────

router.get("/admin/all", async (req, res) => {
  if (!(await guardAdmin(req, res))) return;
  try {
    const rooms = await getAllRoomsAdmin();
    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ error: "Failed to load rooms." });
  }
});

// ─── Admin: full room detail (invite credentials always included) ──────────────

router.get("/admin/:roomId", async (req, res) => {
  if (!(await guardAdmin(req, res))) return;
  const { roomId } = req.params;
  try {
    const room = await getRoomById(String(roomId));
    if (!room) {
      res.status(404).json({ error: "Room not found." });
      return;
    }
    // Full detail — invite credentials are NOT redacted for application admins
    res.json({ room });
  } catch (err) {
    res.status(500).json({ error: "Failed to load room." });
  }
});

// ─── Video: status ────────────────────────────────────────────────────────────
//
//  GET  /rooms/:roomId/video/status   — any room member
//  POST /rooms/:roomId/video/start    — authorised host (room admin + pastoral role)
//  POST /rooms/:roomId/video/token    — any room member (when video is active)
//  POST /rooms/:roomId/video/end      — authorised host

router.get("/:roomId/video/status", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;

  // Verify membership
  const memberRole = await getMemberRole(String(roomId), userId);
  if (!memberRole) {
    res.status(403).json({ error: "You are not a member of this Room." });
    return;
  }

  try {
    if (!isLiveKitConfigured()) {
      res.json({
        configured: false,
        message:
          "Live video is not yet configured. " +
          "Add LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET to Replit Secrets, then restart the server.",
        videoActive: false,
        startedAt: null,
        startedBy: null,
        livekitRoomName: null,
        livekitUrl: null,
      });
      return;
    }

    const [status, settings, appRole] = await Promise.all([
      getVideoStatus(String(roomId)),
      getVideoSettings(),
      getUserRole(userId),
    ]);
    const canHost = await canHostVideo(userId, String(roomId), appRole);

    res.json({
      configured: true,
      videoEnabled: settings.videoEnabled,
      canHost,
      livekitUrl: getLiveKitUrl(),
      ...status,
    });
  } catch {
    res.status(500).json({ error: "Failed to load video status." });
  }
});

router.post("/:roomId/video/start", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;

  if (!isLiveKitConfigured()) {
    res.status(503).json({ error: "Live video is not configured on this server." });
    return;
  }

  try {
    const settings = await getVideoSettings();
    if (!settings.videoEnabled) {
      res.status(403).json({ error: "Video Rooms are not enabled for this church." });
      return;
    }

    const appRole = await getUserRole(userId);
    const allowed = await canHostVideo(userId, String(roomId), appRole);
    if (!allowed) {
      res.status(403).json({ error: "You are not authorised to start video for this Room." });
      return;
    }

    // Concurrent room limit
    const activeCount = await getActiveVideoRoomCount();
    if (activeCount >= settings.maxConcurrentRooms) {
      res.status(429).json({
        error: `This church has reached its current live Room limit (${settings.maxConcurrentRooms}).`,
      });
      return;
    }

    const status = await getVideoStatus(String(roomId));
    if (status.videoActive) {
      // Already active — return current state
      res.json({ ok: true, alreadyActive: true, livekitRoomName: status.livekitRoomName });
      return;
    }

    const livekitRoomName = `emmaus-${String(roomId)}`;
    await ensureLiveKitRoom(livekitRoomName, settings.maxDurationMinutes * 60);
    await startVideoSession(String(roomId), userId, livekitRoomName);

    res.json({ ok: true, alreadyActive: false, livekitRoomName });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start video.";
    res.status(500).json({ error: msg });
  }
});

router.post("/:roomId/video/token", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;

  if (!isLiveKitConfigured()) {
    res.status(503).json({ error: "Live video is not configured on this server." });
    return;
  }

  // Verify membership
  const memberRole = await getMemberRole(String(roomId), userId);
  if (!memberRole) {
    res.status(403).json({ error: "You are not a member of this Room." });
    return;
  }

  try {
    const settings = await getVideoSettings();
    if (!settings.videoEnabled) {
      res.status(403).json({ error: "Video Rooms are not enabled for this church." });
      return;
    }

    const status = await getVideoStatus(String(roomId));
    if (!status.videoActive || !status.livekitRoomName) {
      res.status(409).json({ error: "No active video session for this Room." });
      return;
    }

    // Participant limit
    const memberCount = await getRoomMemberCount(String(roomId));
    if (memberCount > settings.maxParticipantsPerRoom) {
      res.status(429).json({
        error: `This Room has reached its participant limit (${settings.maxParticipantsPerRoom}).`,
      });
      return;
    }

    const appRole = await getUserRole(userId);
    const isHost = await canHostVideo(userId, String(roomId), appRole);

    // Resolve display name from user_profiles (never expose raw userId).
    // user_profiles uses email as the key — userId in session context is the email/identifier.
    const { rows } = await import("@workspace/db").then(m =>
      m.pool.query(
        "SELECT preferred_name FROM user_profiles WHERE email = $1",
        [userId]
      )
    );
    const displayName: string =
      rows[0]?.preferred_name?.trim() || "Member";

    const token = await createLiveKitToken({
      roomName: status.livekitRoomName,
      identity: userId,
      displayName,
      canPublish: true,
      canSubscribe: true,
      roomAdmin: isHost,
    });

    res.json({ token, livekitUrl: getLiveKitUrl() });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to issue video token.";
    res.status(500).json({ error: msg });
  }
});

router.post("/:roomId/video/end", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;

  if (!isLiveKitConfigured()) {
    res.status(503).json({ error: "Live video is not configured on this server." });
    return;
  }

  try {
    const appRole = await getUserRole(userId);
    const allowed = await canHostVideo(userId, String(roomId), appRole);
    if (!allowed) {
      res.status(403).json({ error: "Only the room host can end the meeting." });
      return;
    }

    const status = await getVideoStatus(String(roomId));
    if (status.livekitRoomName) {
      await deleteLiveKitRoom(status.livekitRoomName);
    }
    await endVideoSession(String(roomId));

    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to end video session.";
    res.status(500).json({ error: msg });
  }
});

// ─── Admin: leader authorization ─────────────────────────────────────────────

/**
 * GET /admin/persons/:userId/leader-access
 * Returns the current leader-access state for an Emmaus user.
 * source: "admin_role" | "pastoral_role" | "explicit" | "none"
 */
router.get("/admin/persons/:userId/leader-access", async (req, res) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;
  try {
    const targetId = String(req.params.userId);
    const appRole = await getUserRole(targetId);
    const result = await getLeaderAccess(targetId, appRole);
    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to load leader access." });
  }
});

/**
 * PATCH /admin/persons/:userId/leader-access
 * Body: { authorized: boolean }
 * Sets the explicit authorized_room_leader flag. Does not affect role-based grants.
 */
router.patch("/admin/persons/:userId/leader-access", async (req, res) => {
  const adminId = await guardAdmin(req, res);
  if (!adminId) return;
  const { authorized } = req.body as { authorized?: boolean };
  if (typeof authorized !== "boolean") {
    res.status(400).json({ error: "authorized must be a boolean." });
    return;
  }
  try {
    const targetId = String(req.params.userId);
    await setLeaderAccess(targetId, authorized);
    const appRole = await getUserRole(targetId);
    const result = await getLeaderAccess(targetId, appRole);
    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to update leader access." });
  }
});

// ─── Admin: video settings ────────────────────────────────────────────────────

router.get("/admin/video-settings", async (req, res) => {
  if (!(await guardAdmin(req, res))) return;
  try {
    const settings = await getVideoSettings();
    res.json({ settings });
  } catch {
    res.status(500).json({ error: "Failed to load video settings." });
  }
});

router.patch("/admin/video-settings", async (req, res) => {
  if (!(await guardAdmin(req, res))) return;
  try {
    const settings = await updateVideoSettings(req.body as Partial<VideoSettings>);
    res.json({ settings });
  } catch {
    res.status(500).json({ error: "Failed to update video settings." });
  }
});

// ─── Create room ──────────────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { name, description, roomType, linkedContentId, linkedContentType, contentType } = req.body as {
    name?: string;
    description?: string;
    roomType?: string;
    linkedContentId?: string;
    linkedContentType?: string;
    contentType?: string;
  };
  if (!name || !name.trim()) {
    res.status(400).json({ error: "Room name is required." });
    return;
  }

  // Normalise and validate room type
  const validTypes: RoomType[] = ["personal", "ministry", "leadership", "church_service"];
  const type: RoomType = validTypes.includes(roomType as RoomType)
    ? (roomType as RoomType)
    : "personal";

  // Permission check — personal rooms are open to all; others require church role
  const appRole = await getUserRole(userId);
  if (!(await canCreateRoomType(userId, type, appRole))) {
    res.status(403).json({ error: "You are not authorised to create this type of Room." });
    return;
  }

  const validContentTypes: ContentType[] = [
    "walk", "journey", "devotional", "bible-study", "sermon-companion",
  ];
  const resolvedContentType = validContentTypes.includes(contentType as ContentType)
    ? (contentType as ContentType)
    : undefined;

  try {
    const result = await createRoom(
      name.trim(), userId, description ?? "", type,
      linkedContentId, linkedContentType, resolvedContentType
    );
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to create room." });
  }
});

// ─── List rooms for the current user ─────────────────────────────────────────

router.get("/", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  try {
    const rooms = await getRoomsForUser(userId);
    // Redact invitation credentials for rooms where the caller is not admin
    const sanitised = rooms.map(({ currentUserRole, ...room }) => {
      if (currentUserRole !== "admin") {
        return { ...room, inviteCode: "", inviteToken: "" };
      }
      return room;
    });
    res.json({ rooms: sanitised });
  } catch (err) {
    res.status(500).json({ error: "Failed to load rooms." });
  }
});

// ─── Atomic shared-start — create/reuse room + link journey + start progress ─

router.post("/start-shared", async (req, res) => {
  if (!isStartSharedReady()) {
    res.status(503).json({ error: "Shared-start is temporarily unavailable. Please try again shortly." });
    return;
  }

  const userId = requireAuth(req, res);
  if (!userId) return;

  const { journeyId, roomId, roomName } = req.body as {
    journeyId?: string;
    roomId?: string;
    roomName?: string;
  };

  if (!journeyId) {
    res.status(400).json({ error: "journeyId is required." });
    return;
  }
  if (!roomId && !roomName?.trim()) {
    res.status(400).json({ error: "Either roomId or roomName is required." });
    return;
  }
  if (roomId && roomName?.trim()) {
    res.status(400).json({ error: "Provide roomId or roomName, not both." });
    return;
  }

  try {
    const result = await startShared({
      userId,
      journeyId,
      roomId,
      roomName: roomName?.trim(),
    });
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message === "NOT_A_MEMBER") {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }
    res.status(500).json({ error: "Failed to start shared journey." });
  }
});

// ─── Join by invite code ──────────────────────────────────────────────────────

router.post("/join/code", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { code } = req.body as { code?: string };
  if (!code || code.trim().length !== 7) {
    res.status(400).json({ error: "A 7-character invite code is required." });
    return;
  }

  try {
    const result = await joinByCode(code.trim(), userId);
    if (!result) {
      res.status(404).json({ error: "Invite code not found." });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to join room." });
  }
});

// ─── Join by invite link token ────────────────────────────────────────────────

router.get("/join/:inviteToken", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { inviteToken } = req.params;
  try {
    const result = await joinByToken(String(inviteToken), userId);
    if (!result) {
      res.status(404).json({ error: "Invite link not found or expired." });
      return;
    }
    // Return JSON — frontend can redirect to /rooms/:roomId
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to join room via link." });
  }
});

// ─── Get room detail ──────────────────────────────────────────────────────────

router.get("/:roomId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  try {
    const room = await getRoomById(String(roomId));
    if (!room) {
      res.status(404).json({ error: "Room not found." });
      return;
    }

    // Only members of the room can view its detail
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }

    // Redact invitation credentials for non-admin members
    const sanitisedRoom = role === "admin"
      ? room
      : { ...room, inviteCode: "", inviteToken: "" };
    res.json({ room: sanitisedRoom, currentUserRole: role });
  } catch (err) {
    res.status(500).json({ error: "Failed to load room." });
  }
});

// ─── Rename room (room admin only) ───────────────────────────────────────────

router.patch("/:roomId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  const { name } = req.body as { name?: string };

  if (!name || !name.trim()) {
    res.status(400).json({ error: "Room name is required." });
    return;
  }
  if (name.trim().length > 80) {
    res.status(400).json({ error: "Room name must be 80 characters or fewer." });
    return;
  }

  try {
    const role = await getMemberRole(String(roomId), userId);
    if (role !== "admin") {
      res.status(403).json({ error: "Only the room admin can rename this room." });
      return;
    }

    await updateRoomName(String(roomId), name.trim());
    res.json({ ok: true, name: name.trim() });
  } catch (err) {
    res.status(500).json({ error: "Failed to rename room." });
  }
});

// ─── Delete room (admin only) ─────────────────────────────────────────────────

router.delete("/:roomId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (role !== "admin") {
      res.status(403).json({ error: "Only the room admin can delete this room." });
      return;
    }

    await deleteRoom(String(roomId));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete room." });
  }
});

// ─── Transfer admin (admin only) ──────────────────────────────────────────────

router.post("/:roomId/transfer", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  const { toUserId } = req.body as { toUserId?: string };
  if (!toUserId) {
    res.status(400).json({ error: "toUserId is required." });
    return;
  }

  try {
    const role = await getMemberRole(String(roomId), userId);
    if (role !== "admin") {
      res.status(403).json({ error: "Only the room admin can transfer admin rights." });
      return;
    }

    const targetRole = await getMemberRole(String(roomId), toUserId);
    if (!targetRole) {
      res.status(400).json({ error: "Target user is not a member of this room." });
      return;
    }

    await transferAdmin(String(roomId), userId, toUserId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to transfer admin." });
  }
});

// ─── Remove a member (admin only) ────────────────────────────────────────────

router.delete("/:roomId/members/:targetUserId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId, targetUserId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (role !== "admin") {
      res.status(403).json({ error: "Only the room admin can remove members." });
      return;
    }

    if (String(targetUserId) === userId) {
      res.status(400).json({ error: "The admin cannot remove themselves. Transfer admin first." });
      return;
    }

    await removeMember(String(roomId), String(targetUserId));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove member." });
  }
});

// ─── Leave room ───────────────────────────────────────────────────────────────

router.post("/:roomId/leave", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(400).json({ error: "You are not a member of this room." });
      return;
    }
    if (role === "admin") {
      res.status(400).json({ error: "Transfer admin to another member before leaving." });
      return;
    }

    await leaveRoom(String(roomId), userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to leave room." });
  }
});

// ─── Link a journey to the room ───────────────────────────────────────────────

router.post("/:roomId/journeys", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  const { journeyId } = req.body as { journeyId?: string };
  if (!journeyId) {
    res.status(400).json({ error: "journeyId is required." });
    return;
  }

  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }

    await linkJourney(String(roomId), journeyId, userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to link journey." });
  }
});

// ─── Journey progress for all room members ───────────────────────────────────

router.get("/:roomId/journeys/:journeyId/progress", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId, journeyId } = req.params;
  try {
    // Caller must be a member of this room
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }

    // The journey must be linked to this room — prevents leaking progress for
    // arbitrary journeys a caller supplies in the URL
    const linked = await isJourneyLinkedToRoom(String(roomId), String(journeyId));
    if (!linked) {
      res.status(404).json({ error: "Journey not found in this room." });
      return;
    }

    const progress = await getMemberJourneyProgress(String(roomId), String(journeyId));
    res.json({ progress });
  } catch (err) {
    res.status(500).json({ error: "Failed to load journey progress." });
  }
});

// ─── Presence — heartbeat + online list ──────────────────────────────────────
//
//  POST /:roomId/presence   — caller sends a heartbeat (every 30 s)
//  GET  /:roomId/presence   — returns the list of online userIds

router.post("/:roomId/presence", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;

  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }

  recordPresenceHeartbeat(String(roomId), userId);
  res.json({ ok: true });
});

router.get("/:roomId/presence", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;

  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }

  const onlineUserIds = getOnlineUserIds(String(roomId));
  res.json({ onlineUserIds });
});

// ─── Presence — SSE stream (pushed when online list changes) ─────────────────
//
// Uses the same two-step token handshake as the chat SSE stream because
// EventSource cannot send custom request headers.
//
//   1. POST /:roomId/presence/stream/token  — authenticated; returns one-time token
//   2. GET  /:roomId/presence/stream?token= — consumes token; opens SSE stream

router.post("/:roomId/presence/stream/token", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }
  } catch {
    res.status(500).json({ error: "Failed to verify room membership." });
    return;
  }

  pruneExpiredTokens();
  const token = randomUUID();
  streamTokens.set(token, {
    userId,
    roomId: String(roomId),
    expiresAt: Date.now() + 30_000,
    kind: "presence",
  });
  res.json({ token });
});

router.get("/:roomId/presence/stream", async (req, res) => {
  const tokenStr = req.query.token as string | undefined;
  if (!tokenStr) {
    res.status(401).json({ error: "A stream token is required." });
    return;
  }

  const tokenData = streamTokens.get(tokenStr);
  // Consume immediately — one-time use
  streamTokens.delete(tokenStr);

  if (
    !tokenData ||
    tokenData.expiresAt < Date.now() ||
    tokenData.roomId !== String(req.params.roomId) ||
    tokenData.kind !== "presence"
  ) {
    res.status(401).json({ error: "Invalid or expired stream token." });
    return;
  }

  const { userId, roomId } = tokenData;

  try {
    const role = await getMemberRole(roomId, userId);
    if (!role) {
      res.status(403).json({ error: "You are no longer a member of this room." });
      return;
    }
  } catch {
    res.status(500).json({ error: "Failed to verify room membership." });
    return;
  }

  // Register the SSE connection as a presence signal BEFORE writing headers so
  // the user is online by the time any existing subscriber receives the push.
  registerPresenceConnection(roomId, userId);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Push the current presence list (which now includes this user) immediately.
  const initialIds = getOnlineUserIds(roomId);
  try { res.write(`data: ${JSON.stringify({ onlineUserIds: initialIds })}\n\n`); } catch { /* ignore */ }

  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let terminated = false;

  function terminate() {
    if (terminated) return;
    terminated = true;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    // Unsubscribe FIRST so this stream is removed from the subscriber set before
    // unregisterPresenceConnection calls pushPresenceToRoom — otherwise the
    // departing user would receive their own eviction event.
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    unregisterPresenceConnection(roomId, userId);
    try { res.end(); } catch { /* ignore */ }
  }

  unsubscribe = subscribeToPresence(
    roomId,
    userId,
    (ids) => {
      try { res.write(`data: ${JSON.stringify({ onlineUserIds: ids })}\n\n`); } catch { /* ignore */ }
    },
    terminate
  );

  // Keep-alive comment every 25 s; also revalidate membership as a safety net
  heartbeatTimer = setInterval(async () => {
    try { res.write(": heartbeat\n\n"); } catch { /* ignore */ }
    try {
      const role = await getMemberRole(roomId, userId);
      if (!role) terminate();
    } catch { /* ignore — best-effort check */ }
  }, 25_000);

  req.on("close", terminate);
});

// ─── Chat — SSE stream (new messages pushed in real-time) ────────────────────
//
// EventSource cannot send custom request headers (e.g. X-User-Id), so we use
// a two-step handshake:
//
//   1. POST /:roomId/messages/stream/token  — authenticated via requireAuth
//      (session cookie or X-User-Id header); verifies membership; returns a
//      one-time, short-lived UUID token.
//
//   2. GET  /:roomId/messages/stream?token=<uuid>  — consumes the token (one
//      use only); identity comes from the token store, never from the URL.
//
// This keeps the SSE URL shareable (no persistent secret in it) while still
// preventing unauthenticated or spoofed subscriptions.

interface StreamToken {
  userId: string;
  roomId: string;
  expiresAt: number; // Date.now() + TTL
  kind: "chat" | "presence" | "session";
}

// In-memory token store — tokens are consumed on first use and expire after
// 30 s even if unused.  No persistence needed: tokens are only valid for the
// initial handshake and are immediately replaced by the open TCP connection.
const streamTokens = new Map<string, StreamToken>();

/** Purge expired tokens (called lazily on each issuance). */
function pruneExpiredTokens(): void {
  const now = Date.now();
  for (const [key, value] of streamTokens) {
    if (value.expiresAt < now) streamTokens.delete(key);
  }
}

router.post("/:roomId/messages/stream/token", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }
  } catch {
    res.status(500).json({ error: "Failed to verify room membership." });
    return;
  }

  pruneExpiredTokens();
  const token = randomUUID();
  streamTokens.set(token, {
    userId,
    roomId: String(roomId),
    expiresAt: Date.now() + 30_000, // valid for 30 s
    kind: "chat",
  });

  res.json({ token });
});

router.get("/:roomId/messages/stream", async (req, res) => {
  const tokenStr = req.query.token as string | undefined;
  if (!tokenStr) {
    res.status(401).json({ error: "A stream token is required." });
    return;
  }

  const tokenData = streamTokens.get(tokenStr);
  // Consume immediately — one-time use regardless of outcome so it cannot be replayed
  streamTokens.delete(tokenStr);

  if (
    !tokenData ||
    tokenData.expiresAt < Date.now() ||
    tokenData.roomId !== String(req.params.roomId) ||
    tokenData.kind !== "chat"
  ) {
    res.status(401).json({ error: "Invalid or expired stream token." });
    return;
  }

  const { userId, roomId } = tokenData;

  // Revalidate membership here — the token may have been issued before the
  // member left or was removed.  The token is already consumed so it cannot
  // be replayed even if we reject here.
  try {
    const role = await getMemberRole(roomId, userId);
    if (!role) {
      res.status(403).json({ error: "You are no longer a member of this room." });
      return;
    }
  } catch {
    res.status(500).json({ error: "Failed to verify room membership." });
    return;
  }

  // ── Open the SSE stream ──────────────────────────────────────────────────
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  /** Close the stream and clean up all resources. */
  function terminate() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    try { res.end(); } catch { /* ignore */ }
  }

  unsubscribe = subscribeToRoom(
    roomId,
    userId,
    (msg) => {
      try { res.write(`data: ${JSON.stringify(msg)}\n\n`); } catch { /* ignore */ }
    },
    terminate
  );

  // Heartbeat every 25 s keeps the connection alive through proxies / load
  // balancers that close idle TCP connections.  We also revalidate membership
  // here as a safety net for cases (e.g. room deletion) where terminateXxx
  // may not have been called.
  heartbeatTimer = setInterval(async () => {
    try { res.write(": heartbeat\n\n"); } catch { /* ignore */ }
    try {
      const role = await getMemberRole(roomId, userId);
      if (!role) terminate(); // membership was revoked
    } catch { /* ignore — best-effort safety check */ }
  }, 25_000);

  req.on("close", terminate);
});


// ─── Chat — get messages ──────────────────────────────────────────────────────

router.get("/:roomId/messages", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  const { before } = req.query as { before?: string };

  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }

    const messages = await getMessages(String(roomId), 50, before);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages." });
  }
});

// ─── Chat — post a message ────────────────────────────────────────────────────

router.post("/:roomId/messages", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  const { body } = req.body as { body?: string };
  if (!body || !body.trim()) {
    res.status(400).json({ error: "Message body is required." });
    return;
  }

  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }

    const message = await addMessage(String(roomId), userId, body.trim());
    res.status(201).json({ message });
  } catch (err) {
    res.status(500).json({ error: "Failed to post message." });
  }
});

// ─── Prayer requests ──────────────────────────────────────────────────────────
//
//  GET   /:roomId/prayer                        — any member; list all requests
//  POST  /:roomId/prayer                        — any member; add a request
//  PATCH /:roomId/prayer/:prayerId/answered     — admin only; mark as answered

router.get("/:roomId/prayer", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this Room." });
    return;
  }
  try {
    const requests = await getPrayerRequests(String(roomId));
    res.json({ requests });
  } catch {
    res.status(500).json({ error: "Failed to load prayer requests." });
  }
});

router.post("/:roomId/prayer", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this Room." });
    return;
  }
  const { request, authorName } = req.body as { request?: string; authorName?: string };
  if (!request?.trim()) {
    res.status(400).json({ error: "Prayer request text is required." });
    return;
  }
  try {
    const prayerRequest = await addPrayerRequest(
      String(roomId), userId, authorName?.trim() || "Member", request.trim()
    );
    res.status(201).json({ request: prayerRequest });
  } catch {
    res.status(500).json({ error: "Failed to add prayer request." });
  }
});

router.patch("/:roomId/prayer/:prayerId/answered", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId, prayerId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (role !== "admin") {
    res.status(403).json({ error: "Only room admins can mark requests as answered." });
    return;
  }
  try {
    await markPrayerAnswered(String(prayerId), String(roomId));
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to mark prayer request as answered." });
  }
});

// ─── Session — leader-guided real-time session ────────────────────────────────
//
// Only Authorized Room Leaders (isAuthorizedLeader) can start/end sessions and
// broadcast leader events. All room members can read session state + subscribe
// to the SSE event stream.
//
//  POST /:roomId/session/start               — leader: start a new session
//  POST /:roomId/session/end                 — leader: end/complete the session
//  GET  /:roomId/session                     — any member: get current session state
//  POST /:roomId/session/navigate            — leader: navigate the group
//  POST /:roomId/session/mode                — leader: change session mode
//  POST /:roomId/session/broadcast           — leader: broadcast custom event
//  POST /:roomId/session/attendance/join     — any member: record join
//  POST /:roomId/session/attendance/leave    — any member: record leave
//  GET  /:roomId/session/attendance          — any member: get attendance list
//  POST /:roomId/session/events/token        — any member: get SSE stream token
//  GET  /:roomId/session/events              — any member: SSE event stream

/** Ensure the caller is an authorized leader for this room. */
async function guardLeader(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  roomId: string
): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  const appRole = await getUserRole(userId);
  const authorized = await isAuthorizedLeader(userId, appRole);
  if (!authorized) {
    res.status(403).json({ error: "Authorized Room Leader access required." });
    return null;
  }
  const role = await getMemberRole(roomId, userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return null;
  }
  return userId;
}

// POST /:roomId/session/start
router.post("/:roomId/session/start", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  try {
    const session = await startSession(String(roomId), userId);
    const event: SessionEvent = {
      type: "session_started",
      payload: { sessionId: session.id },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    res.status(201).json({ session });
  } catch (err) {
    res.status(500).json({ error: "Failed to start session." });
  }
});

// POST /:roomId/session/end
router.post("/:roomId/session/end", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const { status = "ended" } = req.body as { status?: "completed" | "ended" };
  try {
    await endSession(String(roomId), status === "completed" ? "completed" : "ended");
    const event: SessionEvent = {
      type: "session_ended",
      payload: { status },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to end session." });
  }
});

// GET /:roomId/session
router.get("/:roomId/session", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }
  try {
    const session = await getActiveSession(String(roomId));
    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: "Failed to load session." });
  }
});

// POST /:roomId/session/navigate
// body: { stepId?, scripture?: ScriptureRef, leaderName? }
router.post("/:roomId/session/navigate", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const { stepId, scripture, leaderName } = req.body as {
    stepId?: string;
    scripture?: ScriptureRef;
    leaderName?: string;
  };
  try {
    await updateSessionState(String(roomId), {
      ...(stepId !== undefined ? { currentStep: stepId } : {}),
      ...(scripture !== undefined ? { currentScripture: scripture } : {}),
      ...(stepId !== undefined && scripture === undefined ? { currentMode: "study" as SessionMode } : {}),
      ...(scripture !== undefined && stepId === undefined ? { currentMode: "scripture" as SessionMode } : {}),
    });
    const event: SessionEvent = {
      type: "navigate",
      payload: {
        ...(stepId !== undefined ? { stepId } : {}),
        ...(scripture !== undefined ? { scripture } : {}),
        leaderName: leaderName ?? "",
      },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to navigate." });
  }
});

// POST /:roomId/session/mode
// body: { mode: SessionMode }
router.post("/:roomId/session/mode", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const { mode, leaderName } = req.body as { mode?: SessionMode; leaderName?: string };
  const validModes: SessionMode[] = ["study", "scripture", "discussion", "prayer", "poll"];
  if (!mode || !validModes.includes(mode)) {
    res.status(400).json({ error: "Valid mode is required." });
    return;
  }
  try {
    await updateSessionState(String(roomId), { currentMode: mode });
    const event: SessionEvent = {
      type: "mode_change",
      payload: { mode, leaderName: leaderName ?? "" },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to change mode." });
  }
});

// POST /:roomId/session/broadcast
// body: { type: SessionEvent["type"], payload: {} }
router.post("/:roomId/session/broadcast", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const { type, payload } = req.body as { type?: string; payload?: Record<string, unknown> };
  const allowedTypes = ["focus_verse", "poll_started", "poll_result", "session_state"];
  if (!type || !allowedTypes.includes(type)) {
    res.status(400).json({ error: `type must be one of: ${allowedTypes.join(", ")}` });
    return;
  }
  // If broadcasting a poll, persist it to session state
  if (type === "poll_started" && payload?.poll) {
    await updateSessionState(String(roomId), { poll: payload.poll as unknown });
  }
  if (type === "poll_result") {
    await updateSessionState(String(roomId), { poll: null });
  }
  const event: SessionEvent = {
    type: type as SessionEvent["type"],
    payload: payload ?? {},
    sentBy: userId,
    at: new Date().toISOString(),
  };
  broadcastRoomEvent(String(roomId), event);
  res.json({ ok: true });
});

// POST /:roomId/session/attendance/join
router.post("/:roomId/session/attendance/join", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }
  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required." });
    return;
  }
  try {
    await recordSessionJoin(sessionId, String(roomId), userId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to record attendance." });
  }
});

// POST /:roomId/session/attendance/leave
router.post("/:roomId/session/attendance/leave", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required." });
    return;
  }
  try {
    await recordSessionLeave(sessionId, userId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to record attendance leave." });
  }
});

// GET /:roomId/session/attendance
router.get("/:roomId/session/attendance", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }
  const { sessionId } = req.query as { sessionId?: string };
  if (!sessionId) {
    res.status(400).json({ error: "sessionId query param is required." });
    return;
  }
  try {
    const attendance = await getSessionAttendance(sessionId);
    res.json({ attendance });
  } catch {
    res.status(500).json({ error: "Failed to load attendance." });
  }
});

// POST /:roomId/session/events/token
router.post("/:roomId/session/events/token", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }
  } catch {
    res.status(500).json({ error: "Failed to verify room membership." });
    return;
  }
  pruneExpiredTokens();
  const token = randomUUID();
  streamTokens.set(token, {
    userId,
    roomId: String(roomId),
    expiresAt: Date.now() + 30_000,
    kind: "session",
  });
  res.json({ token });
});

// GET /:roomId/session/events?token=
router.get("/:roomId/session/events", async (req, res) => {
  const tokenStr = req.query.token as string | undefined;
  if (!tokenStr) {
    res.status(401).json({ error: "A stream token is required." });
    return;
  }
  const tokenData = streamTokens.get(tokenStr);
  streamTokens.delete(tokenStr);
  if (
    !tokenData ||
    tokenData.expiresAt < Date.now() ||
    tokenData.roomId !== String(req.params.roomId) ||
    tokenData.kind !== "session"
  ) {
    res.status(401).json({ error: "Invalid or expired stream token." });
    return;
  }
  const { userId, roomId } = tokenData;
  try {
    const role = await getMemberRole(roomId, userId);
    if (!role) {
      res.status(403).json({ error: "You are no longer a member of this room." });
      return;
    }
  } catch {
    res.status(500).json({ error: "Failed to verify room membership." });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send the current session state as the first event so the client can sync immediately
  try {
    const session = await getActiveSession(roomId);
    const initEvent: SessionEvent = {
      type: "session_state",
      payload: { session },
      sentBy: "system",
      at: new Date().toISOString(),
    };
    res.write(`data: ${JSON.stringify(initEvent)}\n\n`);
  } catch { /* ignore — best-effort initial sync */ }

  let unsubscribe: (() => void) | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let terminated = false;

  function terminate() {
    if (terminated) return;
    terminated = true;
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    try { res.end(); } catch { /* ignore */ }
  }

  unsubscribe = subscribeToSessionEvents(
    roomId,
    userId,
    (event) => {
      try { res.write(`data: ${JSON.stringify(event)}\n\n`); } catch { /* ignore */ }
    },
    terminate
  );

  heartbeatTimer = setInterval(async () => {
    try { res.write(": heartbeat\n\n"); } catch { /* ignore */ }
    try {
      const role = await getMemberRole(roomId, userId);
      if (!role) terminate();
    } catch { /* ignore */ }
  }, 25_000);

  req.on("close", terminate);
});

export default router;
