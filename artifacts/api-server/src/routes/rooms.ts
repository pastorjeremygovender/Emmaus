/**
 * routes/rooms.ts — Emmaus Rooms API
 *
 * All routes require an authenticated caller (requireAuth).
 * Admin-only operations verify role = 'admin' in room_members before acting.
 *
 * Mounted at /rooms in routes/index.ts.
 */

import { Router } from "express";
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
  transferAdmin,
  removeMember,
  getMessages,
  addMessage,
  linkJourney,
  startShared,
  getAllRoomsAdmin,
  getMemberJourneyProgress,
  isJourneyLinkedToRoom,
} from "../lib/room-store.js";
import { isAdmin } from "../lib/user-role-store.js";

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

// ─── Create room ──────────────────────────────────────────────────────────────

router.post("/", async (req, res) => {
  const userId = requireAuth(req, res);
  if (!userId) return;

  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: "Room name is required." });
    return;
  }

  try {
    const result = await createRoom(name.trim(), userId);
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

export default router;
