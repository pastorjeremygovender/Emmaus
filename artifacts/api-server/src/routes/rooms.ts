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
} from "../lib/room-store.js";

const router = Router();

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
    res.json({ rooms });
  } catch (err) {
    res.status(500).json({ error: "Failed to load rooms." });
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

    res.json({ room, currentUserRole: role });
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
