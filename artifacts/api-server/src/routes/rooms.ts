/**
 * routes/rooms.ts — Emmaus Rooms API
 *
 * All routes require an authenticated caller (requireAuth).
 * Room management operations verify room-scoped Owner/Leader roles before acting.
 *
 * Mounted at /rooms in routes/index.ts.
 */

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { requireAuth } from "../emmaus/auth.js";
import { isStartSharedReady } from "../lib/feature-flags.js";
import { createLLMProvider, type LLMMessage } from "../emmaus/llm-provider.js";
import { buildSystemPrompt } from "../emmaus/system-instructions.js";
import { checkSafetyKeywordsOnly, checkPastoralHandoff } from "../emmaus/safety-layer.js";
import {
  createRoom,
  getRoomsForUser,
  getRoomById,
  getMemberRole,
  joinByCode,
  joinByToken,
  getRoomInvitePreviewByCode,
  getRoomInvitePreviewByToken,
  leaveRoom,
  deleteRoom,
  updateRoomName,
  updateLeaderNote,
  updateRoomSchedule,
  transferAdmin,
  removeMember,
  getMessages,
  addMessage,
  deleteRoomMessage,
  linkJourney,
  unlinkPrimaryJourney,
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
  clearSharedTool,
  replaceSharedTool,
  updateSharedEmmausState,
  claimSharedEmmausRequest,
  broadcastRoomEvent,
  subscribeToSessionEvents,
  recordSessionJoin,
  recordSessionLeave,
  getSessionAttendance,
  hasActiveSessionAttendance,
  terminateAllSessionFromRoom,
  addHighlight,
  getHighlights,
  setFocusVerse,
  getSharedNotes,
  addSharedNote,
  pinNote,
  getSessionByIdForRoom,
  getOrCreateSessionDiscussion,
  getSessionDiscussion,
  getDiscussionById,
  createPoll,
  getActivePoll,
  clearActivePoll,
  getPollWithResults,
  castVote,
  revealPollResults,
  addEmmausAnswer,
  getSessionEmmausAnswers,
  trackModeEntered,
  completeSession,
  getRecentlyCompletedSession,
  acknowledgeSessionCompletion,
  getRoomMedia,
  setRoomMediaVisibility,
  setAllRoomMediaVisibility,
  removeRoomMedia,
  RoomMediaStorageCleanupError,
  startPresentation,
  getActivePresentation,
  updatePresentationPage,
  stopPresentation,
  setAllowMemberPresent,
  getAllowMemberPresent,
  updateMemberRole,
  isRoomLeaderRole,
  isRoomOwnerRole,
  type RoomType,
  type ContentType,
  type VideoSettings,
  type SessionMode,
  type ScriptureRef,
  type SessionEvent,
  type MediaAttachment,
} from "../lib/room-store.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger.js";

const objectStorage = new ObjectStorageService();

// Allowed MIME types and size limits for room media uploads.
const ALLOWED_MEDIA: Record<string, { maxBytes: number; attachmentType: string }> = {
  "image/jpeg":   { maxBytes: 20 * 1024 * 1024, attachmentType: "image" },
  "image/png":    { maxBytes: 20 * 1024 * 1024, attachmentType: "image" },
  "image/gif":    { maxBytes: 20 * 1024 * 1024, attachmentType: "image" },
  "image/webp":   { maxBytes: 20 * 1024 * 1024, attachmentType: "image" },
  "application/pdf":      { maxBytes: 50 * 1024 * 1024, attachmentType: "pdf" },
  "video/mp4":            { maxBytes: 200 * 1024 * 1024, attachmentType: "video" },
  "video/quicktime":      { maxBytes: 200 * 1024 * 1024, attachmentType: "video" },
  "video/webm":           { maxBytes: 200 * 1024 * 1024, attachmentType: "video" },
  "video/x-msvideo":      { maxBytes: 200 * 1024 * 1024, attachmentType: "video" },
  "audio/mpeg":    { maxBytes: 25 * 1024 * 1024, attachmentType: "voice" },
  "audio/mp4":     { maxBytes: 25 * 1024 * 1024, attachmentType: "voice" },
  "audio/webm":    { maxBytes: 25 * 1024 * 1024, attachmentType: "voice" },
  "audio/ogg":     { maxBytes: 25 * 1024 * 1024, attachmentType: "voice" },
  "audio/wav":     { maxBytes: 25 * 1024 * 1024, attachmentType: "voice" },
  "audio/aac":     { maxBytes: 25 * 1024 * 1024, attachmentType: "voice" },
  "audio/x-m4a":   { maxBytes: 25 * 1024 * 1024, attachmentType: "voice" },
  "application/msword": { maxBytes: 50 * 1024 * 1024, attachmentType: "document" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { maxBytes: 50 * 1024 * 1024, attachmentType: "document" },
  "application/vnd.ms-powerpoint": { maxBytes: 50 * 1024 * 1024, attachmentType: "document" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { maxBytes: 50 * 1024 * 1024, attachmentType: "document" },
  "text/plain":    { maxBytes: 10 * 1024 * 1024, attachmentType: "document" },
};
import { isAdmin, getUserRole } from "../lib/user-role-store.js";
import { logAuditEvent } from "../lib/audit-log.js";
import {
  isLiveKitConfigured,
  getLiveKitConfigurationStatus,
  getLiveKitUrl,
  createLiveKitToken,
  ensureLiveKitRoom,
  deleteLiveKitRoom,
} from "../lib/livekit.js";

const router = Router();

// Room state is authenticated, user-specific, and changes across devices.
// Prevent Express/browser validators from converting a JSON response into a
// body-less 304 that clients cannot rehydrate.
router.use((_req, res, next) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  next();
});

async function closeLiveMeeting(roomId: string): Promise<void> {
  try {
    const status = await getVideoStatus(roomId);
    if (status.livekitRoomName) await deleteLiveKitRoom(status.livekitRoomName);
    if (status.videoActive) await endVideoSession(roomId);
  } catch (err) {
    logger.warn({ err, roomId }, "best-effort live meeting cleanup failed");
  }
}

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

// Keep the fixed video-settings path before the generic /admin/:roomId route.
// Otherwise Express treats "video-settings" as a room ID and returns a 500.
router.get("/admin/video-settings", async (req, res) => {
  if (!(await guardAdmin(req, res))) return;
  try {
    const settings = await getVideoSettings();
    res.json({ settings, livekit: getLiveKitConfigurationStatus() });
  } catch {
    res.status(500).json({ error: "Failed to load video settings." });
  }
});

router.patch("/admin/video-settings", async (req, res) => {
  if (!(await guardAdmin(req, res))) return;
  try {
    const settings = await updateVideoSettings(req.body as Partial<VideoSettings>);
    res.json({ settings, livekit: getLiveKitConfigurationStatus() });
  } catch {
    res.status(500).json({ error: "Failed to update video settings." });
  }
});

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
        meetingMode: "video",
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
  const requestedMode = (req.body as { mode?: unknown })?.mode;
  if (requestedMode !== undefined && requestedMode !== "audio" && requestedMode !== "video") {
    res.status(400).json({ error: "mode must be audio or video." });
    return;
  }
  const meetingMode: "audio" | "video" = requestedMode === "audio" ? "audio" : "video";

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

    // The standalone live control may be used while a text meeting is already
    // active. It must obey the same explicit-attendance boundary as token
    // issuance; Room membership or host permission alone is not attendance.
    const activeSession = await getActiveSession(String(roomId));
    if (!activeSession) {
      res.status(409).json({ error: "Start or join the meeting before starting live audio or video." });
      return;
    }
    const attending = await hasActiveSessionAttendance(activeSession.id, String(roomId), userId);
    if (!attending) {
      res.status(403).json({ error: "Join the meeting before starting live audio or video." });
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
      res.json({
        ok: true,
        alreadyActive: true,
        livekitRoomName: status.livekitRoomName,
        meetingMode: status.meetingMode,
      });
      return;
    }

    const livekitRoomName = `emmaus-${String(roomId)}`;
    await ensureLiveKitRoom(livekitRoomName, settings.maxDurationMinutes * 60);
    await startVideoSession(String(roomId), userId, livekitRoomName, meetingMode);

    res.json({ ok: true, alreadyActive: false, livekitRoomName, meetingMode });
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

    const activeSession = await getActiveSession(String(roomId));
    if (!activeSession) {
      res.status(409).json({ error: "No active meeting for this Room." });
      return;
    }
    const attending = await hasActiveSessionAttendance(activeSession.id, String(roomId), userId);
    if (!attending) {
      res.status(403).json({ error: "Join the meeting before joining live audio or video." });
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
    // Resolve by immutable subject, with email fallback for historical rows.
    const { rows } = await import("@workspace/db").then(m =>
      m.pool.query(
        "SELECT preferred_name FROM user_profiles WHERE auth_subject = $1 OR email = $1",
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
    // Capture old state for the audit trail.
    const appRoleBefore = await getUserRole(targetId);
    const before = await getLeaderAccess(targetId, appRoleBefore);
    await setLeaderAccess(targetId, authorized);
    const appRole = await getUserRole(targetId);
    const result = await getLeaderAccess(targetId, appRole);
    // Write audit record — non-fatal.
    void logAuditEvent({
      contentType: "user_permission",
      contentId: targetId,
      action: authorized ? "edit" : "edit",
      performedBy: adminId,
      previousState: { authorized: before.authorized, source: before.source },
      newState: { authorized: result.authorized, source: result.source },
    });
    res.json(result);
  } catch {
    res.status(500).json({ error: "Failed to update leader access." });
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
  const validTypes: RoomType[] = [
    "personal", "family", "friends", "marriage",
    "discipleship", "leadership", "church",
  ];
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
    // Keep the authoritative room role in the list response. Redact invite
    // credentials for non-leaders without dropping that role information.
    const sanitised = rooms.map(({ currentUserRole, ...room }) => {
      if (!isRoomLeaderRole(currentUserRole)) {
        return { ...room, currentUserRole, inviteCode: "", inviteToken: "" };
      }
      return { ...room, currentUserRole };
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

  const { journeyId, roomId, roomName, displayOrigin } = req.body as {
    journeyId?: string;
    roomId?: string;
    roomName?: string;
    displayOrigin?: unknown;
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
  if (displayOrigin !== undefined && displayOrigin !== "walk" && displayOrigin !== "journey") {
    res.status(400).json({ error: "displayOrigin must be walk or journey." });
    return;
  }

  try {
    const result = await startShared({
      userId,
      journeyId,
      roomId,
      roomName: roomName?.trim(),
      displayOrigin: displayOrigin as "walk" | "journey" | undefined,
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

router.get("/invite/code/:inviteCode", async (req, res) => {
  const preview = await getRoomInvitePreviewByCode(
    String(req.params.inviteCode),
    req.isAuthenticated() ? req.user.id : undefined,
  );
  if (!preview) {
    res.status(404).json({
      code: "INVITE_NOT_FOUND",
      error: "This invitation is invalid, expired, or has been revoked.",
    });
    return;
  }
  res.json({ preview });
});

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
       res.status(404).json({
         code: "INVITE_NOT_FOUND",
         error: "This invitation is invalid, expired, or has been revoked.",
       });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to join room." });
  }
});

// ─── Join by invite link token ────────────────────────────────────────────────

router.get("/invite/:inviteToken", async (req, res) => {
  const preview = await getRoomInvitePreviewByToken(
    String(req.params.inviteToken),
    req.isAuthenticated() ? req.user.id : undefined,
  );
  if (!preview) {
    res.status(404).json({
      code: "INVITE_NOT_FOUND",
      error: "This invitation is invalid, expired, or has been revoked.",
    });
    return;
  }
  res.json({ preview });
});

router.post("/invite/:inviteToken/accept", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { inviteToken } = req.params;
  try {
    const result = await joinByToken(String(inviteToken), userId);
    if (!result) {
      res.status(404).json({
        code: "INVITE_NOT_FOUND",
        error: "This invitation is invalid, expired, or has been revoked.",
      });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to join room via link." });
  }
});

router.get("/join/:inviteToken", async (req, res) => {
  const { inviteToken } = req.params;
  const preview = await getRoomInvitePreviewByToken(
    String(inviteToken),
    req.isAuthenticated() ? req.user.id : undefined,
  );
  if (!preview) {
    res.status(404).json({
      code: "INVITE_NOT_FOUND",
      error: "This invitation is invalid, expired, or has been revoked.",
    });
    return;
  }
  // Legacy GET links are deliberately preview-only. Membership is created
  // only by an explicit POST acceptance.
  res.json({ preview });
});

/** Backward-compatible API path for older clients, but still an explicit mutation. */
router.post("/join/:inviteToken", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const result = await joinByToken(String(req.params.inviteToken), userId);
  if (!result) {
    res.status(404).json({
      code: "INVITE_NOT_FOUND",
      error: "This invitation is invalid, expired, or has been revoked.",
    });
    return;
  }
  res.json(result);
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

    // Redact invitation credentials for non-leaders
    const sanitisedRoom = isRoomLeaderRole(role)
      ? room
      : { ...room, inviteCode: "", inviteToken: "" };

    const activeSession = await getActiveSession(String(roomId));
    const isLeader = isRoomLeaderRole(role);

    res.json({ room: sanitisedRoom, currentUserRole: role, isLeader, activeSession: activeSession ?? null });
  } catch (err) {
    res.status(500).json({ error: "Failed to load room." });
  }
});

// ─── Rename room (room Owner/Leader only) ───────────────────────────────────

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
    if (!isRoomLeaderRole(role)) {
      res.status(403).json({ error: "Only a room Owner or Leader can rename this room." });
      return;
    }

    await updateRoomName(String(roomId), name.trim());
    res.json({ ok: true, name: name.trim() });
  } catch (err) {
    res.status(500).json({ error: "Failed to rename room." });
  }
});

// ─── Groups V2: Update leader note (room Owner/Leader only) ─────────────────

router.patch("/:roomId/leader-note", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;

  const { note } = req.body as { note?: string | null };
  try {
    const trimmed = typeof note === "string" ? note.trim().slice(0, 1000) : null;
    await updateLeaderNote(String(roomId), trimmed || null);
    res.json({ ok: true, note: trimmed || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to update leader note." });
  }
});

// ─── Groups V2: Update meeting schedule (room Owner/Leader only) ────────────

router.patch("/:roomId/schedule", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;

  // Explicitly check which keys were sent so we can distinguish
  //   omitted (undefined = no change) from explicit null (= clear).
  const body = req.body as Record<string, unknown>;
  const nextMeetingProvided = "nextMeeting" in body;
  const rawNextMeeting = body.nextMeeting as string | null | undefined;
  const revealOnMeeting = body.revealOnMeeting as boolean | undefined;

  try {
    // Resolve nextMeeting: undefined (omitted) → no change; null → clear; string → validate + set.
    let resolvedNextMeeting: string | null | undefined;
    if (!nextMeetingProvided) {
      resolvedNextMeeting = undefined; // preserve existing value in DB
    } else if (rawNextMeeting == null) {
      resolvedNextMeeting = null; // explicit clear
    } else {
      const parsed = new Date(rawNextMeeting);
      if (isNaN(parsed.getTime())) {
        res.status(400).json({ error: "Invalid nextMeeting datetime." });
        return;
      }
      resolvedNextMeeting = parsed.toISOString();
    }

    await updateRoomSchedule(String(roomId), resolvedNextMeeting, revealOnMeeting);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update meeting schedule." });
  }
});

// ─── Delete room (Owner only) ────────────────────────────────────────────────

router.delete("/:roomId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!isRoomOwnerRole(role)) {
      res.status(403).json({ error: "Only the room Owner can delete this room." });
      return;
    }

    await deleteRoom(String(roomId));
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete room." });
  }
});

// ─── Transfer ownership (Owner only) ────────────────────────────────────────

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
    if (!isRoomOwnerRole(role)) {
      res.status(403).json({ error: "Only the room Owner can transfer ownership." });
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
    const code = err instanceof Error ? err.message : "";
    if (code === "NOT_OWNER") {
      res.status(403).json({ error: "Only the room Owner can transfer ownership." });
      return;
    }
    if (code === "TARGET_NOT_MEMBER" || code === "INVALID_OWNER_TRANSFER") {
      res.status(400).json({ error: "Choose a different non-owner member of this room." });
      return;
    }
    res.status(500).json({ error: "Failed to transfer ownership." });
  }
});

// ─── Promote/demote members (Owner only) ────────────────────────────────────

router.post("/:roomId/members/:targetUserId/promote", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId, targetUserId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!isRoomOwnerRole(role)) {
      res.status(403).json({ error: "Only the room Owner can appoint Leaders." });
      return;
    }
    await updateMemberRole(String(roomId), String(targetUserId), "leader");
    res.json({ ok: true, role: "leader" });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    res.status(code === "MEMBER_NOT_FOUND_OR_OWNER" ? 400 : 500).json({
      error: code === "MEMBER_NOT_FOUND_OR_OWNER"
        ? "Target must be an existing non-owner member."
        : "Failed to appoint Leader.",
    });
  }
});

router.post("/:roomId/members/:targetUserId/demote", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId, targetUserId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!isRoomOwnerRole(role)) {
      res.status(403).json({ error: "Only the room Owner can remove Leader status." });
      return;
    }
    await updateMemberRole(String(roomId), String(targetUserId), "member");
    res.json({ ok: true, role: "member" });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    res.status(code === "MEMBER_NOT_FOUND_OR_OWNER" ? 400 : 500).json({
      error: code === "MEMBER_NOT_FOUND_OR_OWNER"
        ? "Target must be an existing non-owner member."
        : "Failed to remove Leader status.",
    });
  }
});

// ─── Remove a member (Owner/Leader) ─────────────────────────────────────────

router.delete("/:roomId/members/:targetUserId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId, targetUserId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!isRoomLeaderRole(role)) {
      res.status(403).json({ error: "Only a room Owner or Leader can remove members." });
      return;
    }

    if (String(targetUserId) === userId) {
      res.status(400).json({ error: "You cannot remove yourself from this room." });
      return;
    }
    const targetRole = await getMemberRole(String(roomId), String(targetUserId));
    if (!targetRole) {
      res.status(404).json({ error: "Target user is not a member of this room." });
      return;
    }
    if (isRoomOwnerRole(targetRole)) {
      res.status(400).json({ error: "The room Owner cannot be removed." });
      return;
    }
    if (!isRoomOwnerRole(role) && isRoomLeaderRole(targetRole)) {
      res.status(403).json({ error: "Only the room Owner can remove a Leader." });
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
    if (isRoomOwnerRole(role)) {
      res.status(400).json({ error: "Transfer ownership to another member before leaving." });
      return;
    }

    await leaveRoom(String(roomId), userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to leave room." });
  }
});

// ─── Link a journey to the room ───────────────────────────────────────────────

// POST /:roomId/journeys — link a journey to the room (Owner/Leader only)
// Linking a walk determines the shared study plan for the whole group, so it
// must be gated the same way as other leader-owned mutations (session start,
// leader note, schedule). guardLeader enforces the appointed room role.
// The creator of a group is the room Owner and can immediately link a study.
router.post("/:roomId/journeys", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;

  const { journeyId } = req.body as { journeyId?: string };
  if (!journeyId) {
    res.status(400).json({ error: "journeyId is required." });
    return;
  }

  try {
    await linkJourney(String(roomId), journeyId, userId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to link journey." });
  }
});

// DELETE /:roomId/journeys/primary — clear the study shown in Today's Study.
// The historical room_journeys row is retained for progress history.
router.delete("/:roomId/journeys/primary", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const journeyId = typeof req.query.journeyId === "string" ? req.query.journeyId : undefined;
  try {
    await unlinkPrimaryJourney(String(roomId), journeyId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to remove the study." });
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

// ─── Group Discussion access ─────────────────────────────────────────────────
//
// While a meeting is active, discussion is available only to members who have
// explicitly joined this exact session. Outside a meeting, members can still
// read the historical discussion archive.
async function canAccessRoomDiscussion(roomId: string, userId: string): Promise<boolean> {
  const role = await getMemberRole(roomId, userId);
  if (!role) return false;

  const activeSession = await getActiveSession(roomId);
  if (!activeSession) return true;

  const attendance = await pool.query(
    `SELECT 1
       FROM room_session_attendance
      WHERE session_id = $1
        AND room_id = $2
        AND user_id = $3
        AND left_at IS NULL
      LIMIT 1`,
    [activeSession.id, roomId, userId],
  );
  return (attendance.rowCount ?? 0) > 0;
}

async function requireRoomDiscussionAccess(
  req: Request,
  res: Response,
  roomId: string,
): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;
  try {
    if (!(await canAccessRoomDiscussion(roomId, userId))) {
      res.status(403).json({
        error: "Join the active meeting before opening Group Discussion.",
      });
      return null;
    }
    return userId;
  } catch {
    res.status(500).json({ error: "Failed to verify Group Discussion access." });
    return null;
  }
}

// ─── Chat — SSE stream (new messages pushed in real-time) ────────────────────
//
// EventSource cannot send custom request headers, so we use
// a two-step handshake:
//
//   1. POST /:roomId/messages/stream/token  — authenticated via requireAuth
//      (secure session cookie); verifies membership; returns a
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
  discussionId?: string;
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
  const userId = await requireRoomDiscussionAccess(req, res, String(req.params.roomId));
  if (!userId) return;

  const { roomId } = req.params;
  const discussionId = typeof req.body?.discussionId === "string"
    ? req.body.discussionId
    : undefined;
  if (discussionId && !(await getDiscussionById(String(roomId), discussionId))) {
    res.status(404).json({ error: "Discussion not found in this room." });
    return;
  }

  pruneExpiredTokens();
  const token = randomUUID();
  streamTokens.set(token, {
    userId,
    roomId: String(roomId),
    expiresAt: Date.now() + 30_000, // valid for 30 s
    kind: "chat",
    discussionId,
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

  const { userId, roomId, discussionId } = tokenData;

  // Revalidate discussion access here — the token may have been issued before
  // the member left or before the active session changed. The token is already
  // consumed so it cannot be replayed even if we reject here.
  try {
    if (!(await canAccessRoomDiscussion(roomId, userId))) {
      res.status(403).json({ error: "Join the active meeting before opening Group Discussion." });
      return;
    }
  } catch {
    res.status(500).json({ error: "Failed to verify Group Discussion access." });
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
       if (discussionId && msg.discussionId !== discussionId) return;
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
      if (!(await canAccessRoomDiscussion(roomId, userId))) terminate();
    } catch { /* ignore — best-effort safety check */ }
  }, 25_000);

  req.on("close", terminate);
});


// ─── Chat — get messages ──────────────────────────────────────────────────────

router.get("/:roomId/messages", async (req, res) => {
  const userId = await requireRoomDiscussionAccess(req, res, String(req.params.roomId));
  if (!userId) return;

  const { roomId } = req.params;
  const { before, discussionId } = req.query as { before?: string; discussionId?: string };

  try {
    if (discussionId && !(await getDiscussionById(String(roomId), discussionId))) {
      res.status(404).json({ error: "Discussion not found in this room." });
      return;
    }
    const messages = await getMessages(String(roomId), 50, before, discussionId);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: "Failed to load messages." });
  }
});

// ─── Chat — post a message ────────────────────────────────────────────────────

router.post("/:roomId/messages", async (req, res) => {
  const userId = await requireRoomDiscussionAccess(req, res, String(req.params.roomId));
  if (!userId) return;

  const { roomId } = req.params;
  const { body, attachment, discussionId } = req.body as {
    body?: string;
    attachment?: MediaAttachment;
    discussionId?: string;
  };
  const trimmedBody = (body ?? "").trim();
  if (!trimmedBody && !attachment) {
    res.status(400).json({ error: "Message body or attachment is required." });
    return;
  }

  try {
    if (discussionId && !(await getDiscussionById(String(roomId), discussionId))) {
      res.status(404).json({ error: "Discussion not found in this room." });
      return;
    }
    const message = await addMessage(
      String(roomId), userId, trimmedBody, attachment ?? undefined, discussionId,
    );
    res.status(201).json({ message });
  } catch (err) {
    res.status(500).json({ error: "Failed to post message." });
  }
});

// ─── Chat — delete a post (author or room leader) ────────────────────────────

router.delete("/:roomId/messages/:messageId", async (req, res) => {
  const { roomId, messageId } = req.params;
  const userId = await requireRoomDiscussionAccess(req, res, String(roomId));
  if (!userId) return;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }
    const result = await deleteRoomMessage(
      String(roomId),
      String(messageId),
      userId,
      isRoomLeaderRole(role),
      objectPath => objectStorage.deleteObjectEntity(objectPath),
    );
    if (result.status === "not_found") {
      res.status(404).json({ error: "Message not found in this room." });
      return;
    }
    if (result.status === "forbidden") {
      res.status(403).json({ error: "You can only delete your own messages." });
      return;
    }
    if (result.presentationStopped) {
      broadcastRoomEvent(String(roomId), {
        type: "presentation_stopped",
        payload: { messageId: String(messageId), reason: "message_deleted" },
        sentBy: userId,
        at: new Date().toISOString(),
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete message." });
  }
});

// ─── Chat — request presigned upload URL (any member) ─────────────────────────

router.post("/:roomId/messages/upload-url", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { roomId } = req.params;
  const { filename, contentType, size } = req.body as {
    filename?: string; contentType?: string; size?: number;
  };

  if (!filename || !contentType || size === undefined) {
    res.status(400).json({ error: "filename, contentType and size are required." });
    return;
  }

  const allowed = ALLOWED_MEDIA[contentType];
  if (!allowed) {
    res.status(400).json({ error: `File type "${contentType}" is not supported.` });
    return;
  }
  if (size > allowed.maxBytes) {
    const mb = Math.round(allowed.maxBytes / 1024 / 1024);
    res.status(400).json({ error: `File too large. Maximum ${mb} MB allowed for this type.` });
    return;
  }

  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }
    const uploadUrl = await objectStorage.getObjectEntityUploadURL();
    const objectPath = objectStorage.normalizeObjectEntityPath(uploadUrl);
    res.json({ uploadUrl, objectPath, attachmentType: allowed.attachmentType });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate upload URL." });
  }
});

// ─── Chat — list media shared in Group Discussion ─────────────────────────────

router.get("/:roomId/media", async (req, res) => {
  const { roomId } = req.params;
  const userId = requireAuth(req, res);
  if (!userId) return;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }
    const media = await getRoomMedia(String(roomId), 100, !isRoomLeaderRole(role));
    res.json({ media });
  } catch {
    res.status(500).json({ error: "Failed to load media." });
  }
});

router.post("/:roomId/media", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const attachment = (req.body as { attachment?: MediaAttachment })?.attachment;
  if (!attachment || !attachment.filename || !attachment.type) {
    res.status(400).json({ error: "A valid media attachment is required." });
    return;
  }
  try {
    await addMessage(String(roomId), userId, "", {
      ...attachment,
      sharedBeforeMeeting: false,
    });
    res.status(201).json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to add prepared media." });
  }
});

router.patch("/:roomId/media/visibility", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const shared = (req.body as { shared?: unknown })?.shared;
  if (typeof shared !== "boolean") {
    res.status(400).json({ error: "shared must be a boolean." });
    return;
  }
  try {
    const updated = await setAllRoomMediaVisibility(String(roomId), shared);
    res.json({ ok: true, updated });
  } catch {
    res.status(500).json({ error: "Failed to update prepared media visibility." });
  }
});

router.patch("/:roomId/media/:messageId/visibility", async (req, res) => {
  const { roomId, messageId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const shared = (req.body as { shared?: unknown })?.shared;
  if (typeof shared !== "boolean") {
    res.status(400).json({ error: "shared must be a boolean." });
    return;
  }
  try {
    const updated = await setRoomMediaVisibility(String(roomId), String(messageId), shared);
    if (!updated) {
      res.status(404).json({ error: "Prepared media not found in this room." });
      return;
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update prepared media visibility." });
  }
});

// ─── Chat — remove shared media from the catalogue (leader only) ───────────────

router.delete("/:roomId/media/:messageId", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId, messageId } = req.params;

  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!isRoomLeaderRole(role)) {
      res.status(403).json({ error: "Only room Owners or Leaders may remove shared media." });
      return;
    }

    const result = await removeRoomMedia(
      String(roomId),
      String(messageId),
      objectPath => objectStorage.deleteObjectEntity(objectPath),
    );

    if (result.status === "not_found") {
      res.status(404).json({ error: "Shared media not found in this room." });
      return;
    }

    if (result.presentationStopped) {
      broadcastRoomEvent(String(roomId), {
        type: "presentation_stopped",
        payload: { messageId: String(messageId), reason: "media_removed" },
        sentBy: userId,
        at: new Date().toISOString(),
      });
    }

    res.json({
      ok: true,
      messageId: String(messageId),
      alreadyRemoved: result.status === "already_removed",
      presentationStopped: result.presentationStopped,
    });
  } catch (err) {
    if (err instanceof RoomMediaStorageCleanupError) {
      res.status(502).json({
        error: "The media could not be removed from storage. Nothing was changed; please try again.",
        recoverable: true,
      });
      return;
    }
    res.status(500).json({ error: "Failed to remove shared media." });
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
  const { request, authorName, sessionId } = req.body as {
    request?: string;
    authorName?: string;
    sessionId?: string; // optional: scopes the prayer to a session for atomic completion counting
  };
  if (!request?.trim()) {
    res.status(400).json({ error: "Prayer request text is required." });
    return;
  }
  try {
    const prayerRequest = await addPrayerRequest(
      String(roomId), userId, authorName?.trim() || "Member", request.trim(),
      sessionId || undefined
    );
    // Null means the session was completed between the client's status check and this insert.
    if (!prayerRequest) {
      res.status(409).json({ error: "Session has ended. Prayer requests can no longer be added." });
      return;
    }
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
  if (!isRoomLeaderRole(role)) {
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
// Only appointed room Owners and Leaders can start/end sessions and
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
// guardLeader authorizes group-management actions using only the room's
// appointed Owner/Leader role. Global application roles do not bypass this.
async function guardLeader(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  roomId: string
): Promise<string | null> {
  const userId = requireAuth(req, res);
  if (!userId) return null;

  const role = await getMemberRole(roomId, userId);
  if (!isRoomLeaderRole(role)) {
    res.status(403).json({ error: "Only a room Owner or Leader can perform this action." });
    return null;
  }

  return userId;
}

// POST /:roomId/session/start
router.post("/:roomId/session/start", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const requestedMeetingMode = (req.body as { meetingMode?: unknown })?.meetingMode;
  if (
    requestedMeetingMode !== undefined &&
    requestedMeetingMode !== "text" &&
    requestedMeetingMode !== "audio" &&
    requestedMeetingMode !== "video"
  ) {
    res.status(400).json({ error: "meetingMode must be text, audio, or video." });
    return;
  }
  const meetingMode: "text" | "audio" | "video" =
    requestedMeetingMode === "audio" || requestedMeetingMode === "video"
      ? requestedMeetingMode
      : "text";
  try {
    if (meetingMode !== "text") {
      if (!isLiveKitConfigured()) {
        res.status(503).json({ error: "Live meetings are not configured on this server." });
        return;
      }
      const settings = await getVideoSettings();
      if (!settings.videoEnabled) {
        res.status(403).json({ error: "Live meetings are not enabled for this church." });
        return;
      }
    }
    const session = await startSession(String(roomId), userId);
    if (meetingMode !== "text") {
      try {
        const livekitRoomName = `emmaus-${String(roomId)}`;
        await ensureLiveKitRoom(livekitRoomName, (await getVideoSettings()).maxDurationMinutes * 60);
        await startVideoSession(String(roomId), userId, livekitRoomName, meetingMode);
      } catch (videoError) {
        await endSession(String(roomId), "ended");
        throw videoError;
      }
    }
    // Starting the meeting is the leader's explicit entry action. startSession
    // records the leader against this exact session in the same transaction.
    const event: SessionEvent = {
      type: "session_started",
      payload: { sessionId: session.id },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    broadcastRoomEvent(String(roomId), {
      type: "attendance_changed",
      payload: { sessionId: session.id, roomId: String(roomId), changedUserId: userId },
      sentBy: userId,
      at: new Date().toISOString(),
    });
    res.status(201).json({ session, meetingMode });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg === "SESSION_ALREADY_ACTIVE") {
      // Leader must explicitly end or complete the current session first.
      res.status(409).json({ error: "A session is already active. End or complete it before starting a new one." });
      return;
    }
    res.status(500).json({ error: "Failed to start session." });
  }
});

// POST /:roomId/session/end
router.post("/:roomId/session/end", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const { status = "ended" } = req.body as { status?: "completed" | "ended" };

  // If the caller requested completion (status="completed"), route through the
  // full completion path so session summary, attendance closure, and the
  // session_complete SSE broadcast are all applied correctly.
  // Bypassing this with a raw endSession("completed") would skip all of that work.
  if (status === "completed") {
    try {
      await closeLiveMeeting(String(roomId));
      const summary = await completeSession(String(roomId));
      // Clear any active presentation so the DB table is empty after session end.
      await stopPresentation(String(roomId));
      const event: SessionEvent = {
        type: "session_complete",
        payload: summary as unknown as Record<string, unknown>,
        sentBy: userId,
        at: new Date().toISOString(),
      };
      broadcastRoomEvent(String(roomId), event);
      res.json({ ok: true, summary });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to complete session.";
      const code = msg.toLowerCase().includes("already completed") ? 409 : 500;
      res.status(code).json({ error: msg });
    }
    return;
  }

  try {
    await closeLiveMeeting(String(roomId));
    await endSession(String(roomId), "ended");
    // Clear any active presentation so the DB table is empty after session end.
    await stopPresentation(String(roomId));
    const event: SessionEvent = {
      type: "session_ended",
      payload: { status: "ended" },
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
    await replaceSharedTool(String(roomId), scripture !== undefined ? "scripture" : "study");
    await updateSessionState(String(roomId), {
      ...(stepId !== undefined ? { currentStep: stepId } : {}),
      ...(scripture !== undefined ? { currentScripture: scripture } : {}),
      metadata: {
        ...(await getActiveSession(String(roomId)))?.metadata,
        activeTool: scripture !== undefined ? "scripture" : "study",
      },
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
    const activeTool = mode === "scripture" ? "scripture"
      : mode === "discussion" ? "discussion"
      : mode === "poll" ? "poll"
      : "study";
    await replaceSharedTool(String(roomId), activeTool);
    await updateSessionState(String(roomId), {
      currentMode: mode,
      metadata: {
        ...(await getActiveSession(String(roomId)))?.metadata,
        activeTool,
      },
    });
    // Durably record which modes were entered — awaited so completeSession()
    // can rely on metadata.modesEntered being current before the leader
    // taps Complete Session.
    if (mode === "discussion" || mode === "prayer") {
      await trackModeEntered(String(roomId), mode);
    }
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

// POST /:roomId/session/tool-close
// Any member may dismiss the shared tool; the close is authoritative for all
// devices and is persisted so reconnect hydration cannot resurrect it.
router.post("/:roomId/session/tool-close", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }
  const tool = (req.body as { tool?: string })?.tool;
  const validTools = ["scripture", "discussion", "poll", "ask-emmaus", "presentation"];
  if (!tool || !validTools.includes(tool)) {
    res.status(400).json({ error: `tool must be one of: ${validTools.join(", ")}` });
    return;
  }
  try {
    const session = await getActiveSession(String(roomId));
    if (!session) {
      res.status(409).json({ error: "There is no active meeting." });
      return;
    }
    // Always broadcast the close for the requested surface. A member may still
    // have an older Discussion route open after another shared tool replaced
    // it; silently ignoring that close strands those clients in the old route.
    // clearSharedTool itself only clears durable state when this tool still
    // owns activeTool, so closing an older surface cannot erase the replacement.
    await clearSharedTool(String(roomId), tool as Parameters<typeof clearSharedTool>[1]);
    if (tool === "poll") await clearActivePoll(String(roomId), session.id);
    if (tool === "presentation") await stopPresentation(String(roomId));
    broadcastRoomEvent(String(roomId), {
      type: "tool_closed",
      payload: { tool, sessionId: session.id },
      sentBy: userId,
      at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to close the shared tool." });
  }
});

// POST /:roomId/session/complete — leader formally completes the session
// Tallies summary data, marks all active attendees as left, broadcasts session_complete.
router.post("/:roomId/session/complete", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  try {
    await closeLiveMeeting(String(roomId));
    const summary = await completeSession(String(roomId));
    // Clear any active presentation so the DB table is empty after session end.
    // Non-fatal — run best-effort after session completion has already been committed.
    await stopPresentation(String(roomId)).catch(() => {});
    broadcastRoomEvent(String(roomId), {
      type: "session_complete",
      payload: { ...summary },
      sentBy: userId,
      at: new Date().toISOString(),
    });
    res.json({ ok: true, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to complete session.";
    // 409 for "already completed" (harmless double-tap); 500 for unexpected errors
    const status = msg.toLowerCase().includes("already completed") ? 409 : 500;
    res.status(status).json({ error: msg });
  }
});

// POST /:roomId/session/:sessionId/acknowledge
// Any room member can acknowledge the Session Complete modal to prevent it
// from re-appearing on reconnect or on a different device.
router.post("/:roomId/session/:sessionId/acknowledge", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId, sessionId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }
  try {
    await acknowledgeSessionCompletion(String(sessionId), userId);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to record acknowledgement." });
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

// POST /:roomId/session/discussion/open — leader opens the one discussion
// channel for the active session. The event is delivered over the authoritative
// session SSE stream so every joined device receives the same channel id.
router.post("/:roomId/session/discussion/open", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  try {
    const session = await getActiveSession(String(roomId));
    if (!session) {
      res.status(409).json({ error: "Start a meeting before opening Group Discussion." });
      return;
    }
    const discussion = await getOrCreateSessionDiscussion(String(roomId), session.id);
    const nameResult = await pool.query(
      "SELECT preferred_name FROM user_profiles WHERE auth_subject = $1 OR email = $1",
      [userId],
    );
    const senderName = nameResult.rows[0]?.preferred_name?.trim() || "Leader";
    const event: SessionEvent = {
      type: "OPEN_GROUP_DISCUSSION",
      payload: {
        roomId: String(roomId),
        sessionId: session.id,
        discussionId: discussion.id,
        sender: { userId, name: senderName },
        serverTimestamp: new Date().toISOString(),
      },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    res.json({ ok: true, discussion });
  } catch (err) {
    if (err instanceof Error && err.message === "SESSION_NOT_FOUND") {
      res.status(409).json({ error: "The active meeting is no longer available." });
      return;
    }
    res.status(500).json({ error: "Failed to open Group Discussion." });
  }
});

// GET /:roomId/session/discussion — late joiners retrieve the current channel.
router.get("/:roomId/session/discussion", async (req, res) => {
  const userId = await requireRoomDiscussionAccess(req, res, String(req.params.roomId));
  if (!userId) return;
  try {
    const session = await getActiveSession(String(req.params.roomId));
    const discussion = session
      ? await getSessionDiscussion(String(req.params.roomId), session.id)
      : null;
    res.json({ discussion });
  } catch {
    res.status(500).json({ error: "Failed to load Group Discussion." });
  }
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
    const attendance = await recordSessionJoin(sessionId, String(roomId), userId);
    if (!attendance) {
      res.status(409).json({ error: "This meeting has ended. Join the current active meeting instead." });
      return;
    }
    logger.info({
      userId,
      roomId: String(roomId),
      sessionId,
      attendanceId: attendance.id,
      discussionChannelId: String(roomId),
      attendanceQueryKey: `room:${String(roomId)}:session:${sessionId}:attendance`,
    }, "room meeting attendance joined");
    broadcastRoomEvent(String(roomId), {
      type: "attendance_changed",
      payload: {
        roomId: String(roomId),
        sessionId,
        changedUserId: userId,
        attendanceId: attendance.id,
      },
      sentBy: userId,
      at: new Date().toISOString(),
    });
    res.json({ ok: true, attendance });
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
    const role = await getMemberRole(String(roomId), userId);
    if (!role) {
      res.status(403).json({ error: "You are not a member of this room." });
      return;
    }
    // roomId passed so the store can gate on active-session status —
    // post-completion leaves are no-ops (preserves authoritative timestamps).
    await recordSessionLeave(sessionId, String(roomId), userId);
    broadcastRoomEvent(String(roomId), {
      type: "attendance_changed",
      payload: { roomId: String(roomId), sessionId, changedUserId: userId },
      sentBy: userId,
      at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to record attendance leave." });
  }
});

// GET /:roomId/session/attendance
// Any active room member can read the attendance for the requested session so
// every device renders the same server-side participant list. The store JOIN
// validates that sessionId belongs to roomId, preventing cross-room disclosure.
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
    // roomId is passed so the store validates session ownership (cross-room protection)
    const attendance = await getSessionAttendance(sessionId, String(roomId));
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

  // 1. Send current session state so the client can sync immediately on connect/reconnect.
  //    Includes existing highlights, shared notes, and active poll so a rejoining
  //    member gets the full discussion state in a single event — not just the phase.
  let activeSessionOnConnect: Awaited<ReturnType<typeof getActiveSession>> | null = null;
  try {
    activeSessionOnConnect = await getActiveSession(roomId);
    // Fetch discussion artefacts in parallel — only when a session is active.
    let sessionHighlights: Awaited<ReturnType<typeof getHighlights>> = [];
    let sessionNotes: Awaited<ReturnType<typeof getSharedNotes>> = [];
    let sessionActivePoll: Awaited<ReturnType<typeof getActivePoll>> = null;
    let sessionActivePresentation: Awaited<ReturnType<typeof getActivePresentation>> = null;
    if (activeSessionOnConnect) {
      [sessionHighlights, sessionNotes, sessionActivePoll, sessionActivePresentation] = await Promise.all([
        getHighlights(roomId, activeSessionOnConnect.id),
        getSharedNotes(roomId, activeSessionOnConnect.id),
        getActivePoll(roomId, activeSessionOnConnect.id),
        getActivePresentation(roomId),
      ]);
    }
    const initEvent: SessionEvent = {
      type: "session_state",
      payload: {
        session: activeSessionOnConnect,
        highlights: sessionHighlights,
        notes: sessionNotes,
        activePoll: sessionActivePoll,
        activePresentation: sessionActivePresentation,
      },
      sentBy: "system",
      at: new Date().toISOString(),
    };
    res.write(`data: ${JSON.stringify(initEvent)}\n\n`);
  } catch { /* ignore — best-effort initial sync */ }

  // 2. If no active session, replay a recent completion event (within 10 min) so
  //    members who reconnect or join after the broadcast window still see the
  //    completion card.  Late joiners and reconnectors are the primary failure mode
  //    for ephemeral SSE-only delivery.
  //    Pass userId so the store skips replay when the user has already acknowledged
  //    the modal — preventing it from re-appearing on a second device.
  if (!activeSessionOnConnect) {
    try {
      const recentSummary = await getRecentlyCompletedSession(roomId, 10, userId);
      if (recentSummary) {
        const completeEvent: SessionEvent = {
          type: "session_complete",
          payload: recentSummary as unknown as Record<string, unknown>,
          sentBy: "system",
          at: new Date().toISOString(),
        };
        res.write(`data: ${JSON.stringify(completeEvent)}\n\n`);
      }
    } catch { /* ignore — best-effort replay */ }
  }

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

// ─── Highlights — shared verse annotations ────────────────────────────────────
//
//  POST /:roomId/session/highlights                   — any member: add highlight
//  GET  /:roomId/session/highlights?sessionId=        — any member: list highlights
//  POST /:roomId/session/highlights/:id/focus         — leader only: set focus verse
//  DELETE /:roomId/session/highlights/focus           — leader only: clear focus verse

router.post("/:roomId/session/highlights", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }
  const { sessionId, book, chapter, verse, verseText, note, authorName } = req.body as {
    sessionId?: string;
    book?: string;
    chapter?: number;
    verse?: number;
    verseText?: string;
    note?: string;
    authorName?: string;
  };
  if (!sessionId || !book || !chapter || !verse) {
    res.status(400).json({ error: "sessionId, book, chapter, verse are required." });
    return;
  }
  // Validate that the session belongs to this room (prevents cross-room data injection)
  const session = await getSessionByIdForRoom(sessionId, String(roomId));
  if (!session) {
    res.status(404).json({ error: "Session not found for this room." });
    return;
  }
  try {
    const highlight = await addHighlight(
      session.id, String(roomId), userId,
      authorName ?? "", book, Number(chapter), Number(verse),
      verseText ?? "", note
    );
    const event: SessionEvent = {
      type: "highlight_added" as SessionEvent["type"],
      payload: { highlight },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    res.status(201).json({ highlight });
  } catch {
    res.status(500).json({ error: "Failed to add highlight." });
  }
});

router.get("/:roomId/session/highlights", async (req, res) => {
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
  // Validate that the session belongs to this room
  const session = await getSessionByIdForRoom(sessionId, String(roomId));
  if (!session) {
    res.status(404).json({ error: "Session not found for this room." });
    return;
  }
  try {
    const highlights = await getHighlights(String(roomId), session.id);
    res.json({ highlights });
  } catch {
    res.status(500).json({ error: "Failed to load highlights." });
  }
});

router.post("/:roomId/session/highlights/:highlightId/focus", async (req, res) => {
  const { roomId, highlightId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required." });
    return;
  }
  // Validate that the session belongs to this room
  const session = await getSessionByIdForRoom(sessionId, String(roomId));
  if (!session) {
    res.status(404).json({ error: "Session not found for this room." });
    return;
  }
  try {
    await setFocusVerse(String(roomId), session.id, String(highlightId));
    const event: SessionEvent = {
      type: "highlight_focus_changed" as SessionEvent["type"],
      payload: { highlightId: String(highlightId), sessionId: session.id },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to set focus verse." });
  }
});

router.delete("/:roomId/session/highlights/focus", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId) {
    res.status(400).json({ error: "sessionId is required." });
    return;
  }
  // Validate that the session belongs to this room
  const session = await getSessionByIdForRoom(sessionId, String(roomId));
  if (!session) {
    res.status(404).json({ error: "Session not found for this room." });
    return;
  }
  try {
    await setFocusVerse(String(roomId), session.id, null);
    const event: SessionEvent = {
      type: "highlight_focus_changed" as SessionEvent["type"],
      payload: { highlightId: null, sessionId: session.id },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to clear focus verse." });
  }
});

// ─── Shared Notes ─────────────────────────────────────────────────────────────
//
//  GET   /:roomId/session/notes?sessionId=   — any member: list notes
//  POST  /:roomId/session/notes              — any member: add note
//  PATCH /:roomId/session/notes/:id/pin      — leader only: pin/unpin note

router.get("/:roomId/session/notes", async (req, res) => {
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
  // Validate that the session belongs to this room
  const session = await getSessionByIdForRoom(sessionId, String(roomId));
  if (!session) {
    res.status(404).json({ error: "Session not found for this room." });
    return;
  }
  try {
    const notes = await getSharedNotes(String(roomId), session.id);
    res.json({ notes });
  } catch {
    res.status(500).json({ error: "Failed to load shared notes." });
  }
});

router.post("/:roomId/session/notes", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }
  const { sessionId, text, authorName } = req.body as {
    sessionId?: string;
    text?: string;
    authorName?: string;
  };
  if (!sessionId || !text?.trim()) {
    res.status(400).json({ error: "sessionId and text are required." });
    return;
  }
  // Validate that the session belongs to this room AND is still active;
  // post-completion inserts are rejected so the stored sharedNoteCount remains
  // an accurate reflection of what was contributed during the session.
  const session = await getSessionByIdForRoom(sessionId, String(roomId));
  if (!session) {
    res.status(404).json({ error: "Session not found for this room." });
    return;
  }
  if (session.status !== "active") {
    res.status(409).json({ error: "Session has ended. Notes can no longer be added." });
    return;
  }
  try {
    const note = await addSharedNote(
      session.id, String(roomId), userId, authorName ?? "", text.trim()
    );
    // Null means the session status changed between the pre-check and the
    // atomic INSERT — the session was completed in the narrow window.
    if (!note) {
      res.status(409).json({ error: "Session has ended. Notes can no longer be added." });
      return;
    }
    const event: SessionEvent = {
      type: "note_added" as SessionEvent["type"],
      payload: { note },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    res.status(201).json({ note });
  } catch {
    res.status(500).json({ error: "Failed to add shared note." });
  }
});

router.patch("/:roomId/session/notes/:noteId/pin", async (req, res) => {
  const { roomId, noteId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  const { pin = true, sessionId } = req.body as { pin?: boolean; sessionId?: string };
  // Validate the session belongs to this room (when provided; pin is room-scoped so sessionId optional)
  if (sessionId) {
    const session = await getSessionByIdForRoom(sessionId, String(roomId));
    if (!session) {
      res.status(404).json({ error: "Session not found for this room." });
      return;
    }
  }
  try {
    await pinNote(String(noteId), String(roomId), Boolean(pin));
    const event: SessionEvent = {
      type: "note_pinned" as SessionEvent["type"],
      payload: { noteId: String(noteId), pin: Boolean(pin) },
      sentBy: userId,
      at: new Date().toISOString(),
    };
    broadcastRoomEvent(String(roomId), event);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to pin note." });
  }
});

// ─── Shared Ask Emmaus (Task #437) ───────────────────────────────────────────

// Group answers are short, shared discussion aids. Keep this path independent
// from the slower/deeper private Ask Emmaus model and avoid paying for a large
// reasoning/output budget when several members are waiting together.
const SHARED_EMMAUS_MODEL = process.env.EMMAUS_GROUP_MODEL ?? "gpt-4o-mini";
const SHARED_EMMAUS_MAX_TOKENS = 1400;
const SHARED_EMMAUS_STATE_WRITE_INTERVAL_MS = 750;
const SHARED_EMMAUS_STATE_WRITE_CHARS = 600;

// POST /:roomId/session/ask-emmaus — leader only; HTTP returns immediately,
// streaming is broadcast to ALL session subscribers via SSE bus.
router.post("/:roomId/session/ask-emmaus", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;

  const { sessionId, question, askerName } = req.body as {
    sessionId?: string;
    question?: string;
    askerName?: string;
  };
  if (!sessionId || !question?.trim()) {
    res.status(400).json({ error: "sessionId and question are required." });
    return;
  }
  const session = await getSessionByIdForRoom(sessionId, String(roomId));
  if (!session) {
    res.status(404).json({ error: "Session not found for this room." });
    return;
  }

  const trimmedQ = question.trim();

  // ── Safety gate (runs BEFORE anything is broadcast to the room) ──────────
  // Uses keyword-only detection (no store) — identical signals to private Ask Emmaus.
  const safetyResult = checkSafetyKeywordsOnly(trimmedQ);
  if (!safetyResult.isSafe) {
    // Return an error to the leader. Nothing is broadcast to the room.
    res.status(422).json({
      error:
        "This question contains content that cannot be shared with the group. " +
        "Please speak with this person privately, or call Samaritans on 116 123 (free, 24/7).",
      safetyHandover: true,
      category: safetyResult.triggeredCategory,
    });
    return;
  }

  // Check for pastoral signals — inject a soft note in the context if needed
  const needsPastoralNote = checkPastoralHandoff(trimmedQ);

  if (session.status !== "active") {
    res.status(404).json({ error: "Session is no longer active." });
    return;
  }
  const activeSession = await getActiveSession(String(roomId));
  if (!activeSession || activeSession.id !== session.id) {
    res.status(409).json({ error: "There is no active meeting for this session." });
    return;
  }

  const requestId = randomUUID();
  let claimedSession: Awaited<ReturnType<typeof claimSharedEmmausRequest>>;
  try {
    claimedSession = await claimSharedEmmausRequest(
      String(roomId),
      session.id,
      requestId,
      { question: trimmedQ },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "EMMAUS_REQUEST_ACTIVE") {
      res.status(409).json({
        error: "Emmaus is already generating a response for this group.",
      });
      return;
    }
    if (err instanceof Error && err.message === "SESSION_NOT_ACTIVE") {
      res.status(409).json({ error: "There is no active meeting for this session." });
      return;
    }
    res.status(500).json({ error: "Could not start the shared Ask Emmaus request." });
    return;
  }

  // Signal to all members that streaming is about to begin
  broadcastRoomEvent(String(roomId), {
    type: "emmaus_started",
    payload: {
      requestId,
      question: trimmedQ,
      askedBy: userId,
      askerName: askerName ?? "",
    },
    sentBy: userId,
    at: new Date().toISOString(),
  });

  // Return immediately — streaming runs in background via SSE bus
  res.json({ ok: true, question: trimmedQ });

  void (async () => {
    try {
      const room = await getRoomById(String(roomId));
       const scriptureCtx = claimedSession.currentScripture
        ? `The group is currently studying: ${
             claimedSession.currentScripture.displayLabel ??
             `${claimedSession.currentScripture.book} ${claimedSession.currentScripture.chapter}`
          }`
        : "";
       const stepCtx = claimedSession.currentStep
         ? `Current session step: ${claimedSession.currentStep}`
        : "";

      const contextBlock = [
        `This is a SHARED "Ask Emmaus Together" session for a discipleship Room called "${room?.name ?? "this Room"}".`,
        `Your response will be shown simultaneously to all members of the group.`,
        `Respond warmly to the group as a whole — pastoral, encouraging, and accessible to everyone present.`,
        `Do NOT address a single person by name in your response.`,
        scriptureCtx,
        stepCtx,
        needsPastoralNote
          ? "Note: This question touches on a topic that may benefit from private pastoral follow-up. You may gently encourage the group that their leader is available to speak with anyone personally after the session."
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const systemPrompt = buildSystemPrompt(contextBlock, askerName ?? undefined);
      const messages: LLMMessage[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: trimmedQ },
      ];

      const provider = createLLMProvider();
      let fullText = "";
      let lastPersistedAt = 0;
      let lastPersistedLength = 0;
      const iterator = provider.streamCompletion(messages, {
        maxTokens: SHARED_EMMAUS_MAX_TOKENS,
        model: SHARED_EMMAUS_MODEL,
      })[Symbol.asyncIterator]();
      const STREAM_IDLE_TIMEOUT_MS = 45_000;

      // gpt-5 reasoning models reject small output budgets. Keep this above
      // their minimum while allowing the normal provider to stop naturally.
      while (true) {
        const next = await Promise.race([
          iterator.next(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Emmaus response timed out.")), STREAM_IDLE_TIMEOUT_MS),
          ),
        ]);
        if (next.done) break;
        const chunk = next.value;
        if (!chunk.content) continue;
        fullText += chunk.content;
        const shouldPersist =
          lastPersistedAt === 0 ||
          Date.now() - lastPersistedAt >= SHARED_EMMAUS_STATE_WRITE_INTERVAL_MS ||
          fullText.length - lastPersistedLength >= SHARED_EMMAUS_STATE_WRITE_CHARS;
        if (shouldPersist) {
          const stillCurrent = await updateSharedEmmausState(String(roomId), requestId, { text: fullText });
          if (!stillCurrent) {
            await iterator.return?.(undefined as never);
            return;
          }
          lastPersistedAt = Date.now();
          lastPersistedLength = fullText.length;
        }
        broadcastRoomEvent(String(roomId), {
          type: "emmaus_chunk",
          payload: { requestId, text: chunk.content },
          sentBy: userId,
          at: new Date().toISOString(),
        });
      }
      await iterator.return?.(undefined as never);

      // Strip <EMMAUS_META> block before storing
      const metaIdx = fullText.indexOf("<EMMAUS_META>");
      const cleanText =
        metaIdx !== -1 ? fullText.slice(0, metaIdx).trim() : fullText.trim();
      if (!cleanText) {
        throw new Error("Emmaus returned an empty response.");
      }

      const answer = await addEmmausAnswer(
        claimedSession.id, String(roomId), userId, trimmedQ, cleanText
      );
      const stillCurrent = await updateSharedEmmausState(String(roomId), requestId, {
        text: cleanText,
        status: "completed",
        answerId: answer.id,
        error: undefined,
      });
      if (!stillCurrent) return;

      broadcastRoomEvent(String(roomId), {
        type: "emmaus_done",
        payload: {
          requestId,
          question: trimmedQ,
          fullText: cleanText,
          answerId: answer.id,
        },
        sentBy: userId,
        at: new Date().toISOString(),
      });
      console.info("[Rooms] Shared Ask Emmaus completed", {
        roomId: String(roomId),
        sessionId: claimedSession.id,
        requestId,
        answerId: answer.id,
      });
    } catch (err) {
      const errorMessage = err instanceof Error && err.message.includes("timed out")
        ? "Emmaus took too long to respond. Please try again."
        : "Something went wrong generating the response. Please try again.";
      try {
        const stillCurrent = await updateSharedEmmausState(String(roomId), requestId, {
          status: "failed",
          error: errorMessage,
          text: errorMessage,
        });
        if (!stillCurrent) return;
      } catch {
        // The live event below still gives connected clients a retryable result
        // when the persistence update itself is the failing step.
      }
      broadcastRoomEvent(String(roomId), {
        type: "emmaus_done",
        payload: {
          requestId,
          question: trimmedQ,
          fullText: errorMessage,
          answerId: null,
          error: true,
        },
        sentBy: userId,
        at: new Date().toISOString(),
      });
      console.error("[Rooms] Shared Ask Emmaus failed", {
        roomId: String(roomId),
        sessionId: claimedSession.id,
        requestId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  })();
});

// GET /:roomId/session/emmaus-answers?sessionId= — any room member
router.get("/:roomId/session/emmaus-answers", async (req, res) => {
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
  const session = await getSessionByIdForRoom(sessionId, String(roomId));
  if (!session) {
    res.status(404).json({ error: "Session not found for this room." });
    return;
  }
  try {
    const answers = await getSessionEmmausAnswers(String(roomId), session.id);
    res.json({ answers });
  } catch {
    res.status(500).json({ error: "Failed to load Emmaus answers." });
  }
});

// ─── Polls (Task #437) ────────────────────────────────────────────────────────

// POST /:roomId/session/poll — leader creates a new poll
router.post("/:roomId/session/poll", async (req, res) => {
  const { roomId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;

  const {
    sessionId,
    question,
    pollType = "yes_no",
    options,
  } = req.body as {
    sessionId?: string;
    question?: string;
    pollType?: string;
    options?: string[];
  };

  if (!sessionId || !question?.trim()) {
    res.status(400).json({ error: "sessionId and question are required." });
    return;
  }
  const session = await getSessionByIdForRoom(sessionId, String(roomId));
  if (!session) {
    res.status(404).json({ error: "Session not found for this room." });
    return;
  }

  const resolvedType: "yes_no" | "multiple_choice" =
    pollType === "multiple_choice" ? "multiple_choice" : "yes_no";
  // Normalize options BEFORE checking length — prevents blank entries slipping through
  const normalizedOptions: string[] = Array.isArray(options)
    ? options.slice(0, 5).map((o) => String(o).trim()).filter((s) => s.length > 0)
    : [];
  const resolvedOptions: string[] =
    resolvedType === "yes_no"
      ? ["Yes", "No"]
      : normalizedOptions.length >= 2
      ? normalizedOptions
      : ["Option A", "Option B"];
  // Guard question length
  if (question.trim().length > 500) {
    res.status(400).json({ error: "Question must be 500 characters or fewer." });
    return;
  }

  try {
    const poll = await createPoll(
      session.id, String(roomId), userId,
      question.trim(), resolvedType, resolvedOptions
    );
    await replaceSharedTool(String(roomId), "poll");
    await updateSessionState(String(roomId), {
      poll,
      metadata: { ...(await getActiveSession(String(roomId)))?.metadata, activeTool: "poll" },
    });
    broadcastRoomEvent(String(roomId), {
      type: "poll_started",
      payload: { poll },
      sentBy: userId,
      at: new Date().toISOString(),
    });
    res.status(201).json({ poll });
  } catch {
    res.status(500).json({ error: "Failed to create poll." });
  }
});

// GET /:roomId/session/poll?sessionId= — any member: get active poll + results
router.get("/:roomId/session/poll", async (req, res) => {
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
  const session = await getSessionByIdForRoom(sessionId, String(roomId));
  if (!session) {
    res.status(404).json({ error: "Session not found for this room." });
    return;
  }
  try {
    const activePoll = await getActivePoll(String(roomId), session.id);
    if (!activePoll) {
      res.json({ poll: null });
      return;
    }
    const results = await getPollWithResults(activePoll.id, String(roomId), userId);
    res.json({ poll: results });
  } catch {
    res.status(500).json({ error: "Failed to load poll." });
  }
});

// POST /:roomId/session/poll/:pollId/vote — any member casts a vote
router.post("/:roomId/session/poll/:pollId/vote", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId, pollId } = req.params;
  const role = await getMemberRole(String(roomId), userId);
  if (!role) {
    res.status(403).json({ error: "You are not a member of this room." });
    return;
  }

  // Validate optionIndex is a non-negative integer before touching the DB
  const { optionIndex: rawIdx } = req.body as { optionIndex?: unknown };
  const idx = Number(rawIdx);
  if (!Number.isInteger(idx) || idx < 0) {
    res.status(400).json({ error: "optionIndex must be a non-negative integer." });
    return;
  }

  // Scope poll lookup to this room — prevents cross-room vote injection
  const pollResults = await getPollWithResults(String(pollId), String(roomId), userId);
  if (!pollResults) {
    res.status(404).json({ error: "Poll not found for this room." });
    return;
  }
  // Reject votes after the leader has revealed results
  if (pollResults.poll.resultsRevealed) {
    res.status(409).json({ error: "This poll has already been revealed. Votes are closed." });
    return;
  }
  // Reject out-of-range option indices
  if (idx >= pollResults.poll.options.length) {
    res.status(400).json({
      error: `optionIndex ${idx} is out of range (valid: 0–${pollResults.poll.options.length - 1}).`,
    });
    return;
  }

  try {
    await castVote(String(pollId), userId, idx);
    const results = await getPollWithResults(String(pollId), String(roomId), userId);
    if (results) {
      broadcastRoomEvent(String(roomId), {
        type: "poll_vote_count",
        payload: {
          pollId: String(pollId),
          voteCounts: results.voteCounts,
          totalVotes: results.totalVotes,
        },
        sentBy: userId,
        at: new Date().toISOString(),
      });
    }
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to cast vote." });
  }
});

// POST /:roomId/session/poll/:pollId/reveal — leader reveals results
router.post("/:roomId/session/poll/:pollId/reveal", async (req, res) => {
  const { roomId, pollId } = req.params;
  const userId = await guardLeader(req, res, String(roomId));
  if (!userId) return;
  try {
    await revealPollResults(String(pollId), String(roomId));
    const results = await getPollWithResults(String(pollId), String(roomId), userId);
    broadcastRoomEvent(String(roomId), {
      type: "poll_revealed",
      payload: {
        pollId: String(pollId),
        voteCounts: results?.voteCounts ?? [],
        totalVotes: results?.totalVotes ?? 0,
        options: results?.poll.options ?? [],
        question: results?.poll.question ?? "",
      },
      sentBy: userId,
      at: new Date().toISOString(),
    });
    res.json({ ok: true, results });
  } catch {
    res.status(500).json({ error: "Failed to reveal poll results." });
  }
});

// ─── Presentation — get / start / page / stop ─────────────────────────────────

router.get("/:roomId/session/presentation", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) { res.status(403).json({ error: "Not a member." }); return; }
    const presentation = await getActivePresentation(String(roomId));
    res.json({ presentation });
  } catch {
    res.status(500).json({ error: "Failed to load presentation." });
  }
});

router.post("/:roomId/session/presentation", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const { messageId, filename, mediaType, objectPath, sessionId, pageCount } = req.body as {
    messageId?: string | null;
    filename?: string;
    mediaType?: string;
    objectPath?: string;
    sessionId?: string | null;
    pageCount?: number | null;
  };

  if (!filename || !mediaType) {
    res.status(400).json({ error: "filename and mediaType are required." });
    return;
  }

  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!role) { res.status(403).json({ error: "Not a member." }); return; }
    const activeSession = await getActiveSession(String(roomId));
    if (!activeSession) {
      res.status(409).json({ error: "Start a meeting before presenting shared media." });
      return;
    }
    if (sessionId && sessionId !== activeSession.id) {
      res.status(409).json({ error: "This presentation belongs to a different meeting." });
      return;
    }

    // Determine whether this user may present:
    // - Room Owners and Leaders always may
    // - If allow_member_present is true, member may present their own message
    const canPresent = isRoomLeaderRole(role);

    if (!canPresent) {
      // Check member-present setting and whether this is their own message
      const allowMemberPresent = await getAllowMemberPresent(String(roomId));
      if (!allowMemberPresent) {
         res.status(403).json({ error: "Only room Owners or Leaders may present." });
        return;
      }
      // Verify the message belongs to this user
      if (messageId) {
        const { rows: msgRows } = await pool.query(
          `SELECT user_id FROM room_messages WHERE id = $1 AND room_id = $2`,
          [messageId, String(roomId)]
        );
        if (!msgRows.length || msgRows[0].user_id !== userId) {
          res.status(403).json({ error: "You may only present your own shared content." });
          return;
        }
      } else {
        res.status(403).json({ error: "Only room Owners or Leaders may present." });
        return;
      }
    }

    // Resolve presenter name
    if (messageId) {
      const mediaResult = await pool.query(
        `SELECT attachment
         FROM room_messages
         WHERE id = $1 AND room_id = $2`,
        [messageId, String(roomId)],
      );
      if (mediaResult.rows.length === 0 || !mediaResult.rows[0].attachment) {
        res.status(404).json({ error: "Shared media not found in this room." });
        return;
      }
      const savedAttachment = (
        typeof mediaResult.rows[0].attachment === "string"
          ? JSON.parse(mediaResult.rows[0].attachment)
          : mediaResult.rows[0].attachment
      ) as MediaAttachment & { removed?: boolean };
      if (savedAttachment.removed) {
        res.status(410).json({ error: "This shared media has been removed from the catalogue." });
        return;
      }
      if (
        filename !== savedAttachment.filename
        || mediaType !== savedAttachment.type
        || (objectPath ?? "") !== (savedAttachment.objectPath ?? "")
      ) {
        res.status(400).json({ error: "Shared media details no longer match the saved message." });
        return;
      }
    }

    const { rows: nameRows } = await pool.query(
      `SELECT preferred_name FROM user_profiles WHERE auth_subject = $1 OR email = $1`, [userId]
    );
    const presenterName = String(nameRows[0]?.preferred_name ?? "").trim() || "Member";

    await replaceSharedTool(String(roomId), "presentation");
    const presentation = await startPresentation(
      String(roomId),
      activeSession.id,
      messageId ?? null,
      filename,
      mediaType,
      objectPath ?? "",
      userId,
      presenterName,
      typeof pageCount === "number" ? pageCount : null,
    );
    await updateSessionState(String(roomId), {
      metadata: { ...(await getActiveSession(String(roomId)))?.metadata, activeTool: "presentation" },
    });

    broadcastRoomEvent(String(roomId), {
      type: "media_presented",
      payload: {
        messageId: presentation.messageId,
        filename: presentation.filename,
        mediaType: presentation.mediaType,
        objectPath: presentation.objectPath,
        presentedBy: presentation.presentedBy,
        presentedByName: presentation.presentedByName,
        currentPage: presentation.currentPage,
        pageCount: presentation.pageCount,
        sessionId: presentation.sessionId,
      },
      sentBy: userId,
      at: new Date().toISOString(),
    });

    res.json({ presentation });
  } catch (err) {
    res.status(500).json({ error: "Failed to start presentation." });
  }
});

router.patch("/:roomId/session/presentation/page", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const { page } = req.body as { page?: number };
  if (typeof page !== "number" || page < 1) {
    res.status(400).json({ error: "page must be a positive integer." });
    return;
  }
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!isRoomLeaderRole(role)) {
      res.status(403).json({ error: "Only room Owners or Leaders may change presentation pages." });
      return;
    }
    await updatePresentationPage(String(roomId), page);
    broadcastRoomEvent(String(roomId), {
      type: "presentation_page",
      payload: { currentPage: page },
      sentBy: userId,
      at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update page." });
  }
});

router.delete("/:roomId/session/presentation", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!isRoomLeaderRole(role)) {
      res.status(403).json({ error: "Only room Owners or Leaders may stop the presentation." });
      return;
    }
    await stopPresentation(String(roomId));
    await clearSharedTool(String(roomId), "presentation");
    broadcastRoomEvent(String(roomId), {
      type: "presentation_stopped",
      payload: {},
      sentBy: userId,
      at: new Date().toISOString(),
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to stop presentation." });
  }
});

// ─── Room settings — allow member present ─────────────────────────────────────

router.patch("/:roomId/allow-member-present", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;
  const { roomId } = req.params;
  const { allow } = req.body as { allow?: boolean };
  if (typeof allow !== "boolean") {
    res.status(400).json({ error: "allow must be a boolean." });
    return;
  }
  try {
    const role = await getMemberRole(String(roomId), userId);
    if (!isRoomLeaderRole(role)) {
      res.status(403).json({ error: "Only a room Owner or Leader may change this setting." });
      return;
    }
    await setAllowMemberPresent(String(roomId), allow);
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update setting." });
  }
});

export default router;
