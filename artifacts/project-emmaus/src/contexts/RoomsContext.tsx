import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  DEMO_ROOMS,
  DEMO_ROOM_MEMBERS,
  DEMO_ROOM_INVITES,
  DEMO_ROOM_JOURNEY_INVITATIONS,
  DEMO_ROOM_JOURNEY_PARTICIPANTS,
  DEMO_ROOM_POSTS,
  DEMO_SHARED_REFLECTIONS,
  DEMO_ROOM_NOTIFICATIONS,
} from '../lib/rooms-demo-data';
import type {
  Room,
  RoomMember,
  RoomInvite,
  RoomJourneyInvitation,
  RoomJourneyParticipant,
  RoomPost,
  SharedReflection,
  RoomNotification,
  RoomType,
  InviteExpiry,
  RoomRole,
} from '../lib/rooms-types';

// ─── localStorage helpers ──────────────────────────────────────────────────
const LS_KEYS = {
  rooms: 'emmaus_rooms',
  members: 'emmaus_room_members',
  invites: 'emmaus_room_invites',
  journeyInvitations: 'emmaus_room_journey_invitations',
  journeyParticipants: 'emmaus_room_journey_participants',
  posts: 'emmaus_room_posts',
  sharedReflections: 'emmaus_shared_reflections',
  notifications: 'emmaus_room_notifications',
};

function load<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

// ─── Token / code generation ───────────────────────────────────────────────
function genId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function genToken() {
  return Array.from({ length: 3 }, () =>
    Math.random().toString(36).slice(2, 8)
  ).join('-');
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function expiryDate(pref: InviteExpiry): string | null {
  if (pref === 'never') return null;
  const ms = pref === '24h' ? 86_400_000 : 7 * 86_400_000;
  return new Date(Date.now() + ms).toISOString();
}

// ─── Context type ──────────────────────────────────────────────────────────
interface RoomsContextType {
  // State
  rooms: Room[];
  members: RoomMember[];
  invites: RoomInvite[];
  journeyInvitations: RoomJourneyInvitation[];
  journeyParticipants: RoomJourneyParticipant[];
  posts: RoomPost[];
  sharedReflections: SharedReflection[];
  notifications: RoomNotification[];

  // Room queries
  getRoom: (id: string) => Room | undefined;
  getMyRooms: (userId: string) => Room[];
  getRoomMembers: (roomId: string) => RoomMember[];
  getRoomInvite: (roomId: string) => RoomInvite | undefined;
  canInvite: (roomId: string, userId: string) => boolean;
  canManage: (roomId: string, userId: string) => boolean;
  getMyMembership: (roomId: string, userId: string) => RoomMember | undefined;

  // Journey queries
  getJourneyInvitations: (roomId: string) => RoomJourneyInvitation[];
  getParticipants: (invitationId: string) => RoomJourneyParticipant[];
  getMyParticipation: (invitationId: string, userId: string) => RoomJourneyParticipant | undefined;
  getPendingJourneyInvitations: (roomId: string, userId: string) => RoomJourneyInvitation[];

  // Post queries
  getPosts: (roomId: string, journeyId: string, stepId: string) => RoomPost[];

  // Reflection queries
  getSharedReflections: (roomId: string, journeyId: string, stepId: string) => SharedReflection[];
  getMySharedReflection: (userId: string, reflectionKey: string, roomId: string) => SharedReflection | undefined;

  // Notification queries
  getMyNotifications: (userId: string) => RoomNotification[];
  getUnreadCount: (userId: string) => number;

  // Invite lookup (for join flows)
  findInviteByToken: (token: string) => RoomInvite | undefined;
  findInviteByCode: (code: string) => RoomInvite | undefined;

  // Mutations
  createRoom: (userId: string, name: string, type: RoomType, expiry: InviteExpiry) => Room;
  joinRoomByCode: (userId: string, code: string) => { success: boolean; error?: string; room?: Room };
  joinRoomByToken: (userId: string, token: string) => { success: boolean; error?: string; room?: Room };
  leaveRoom: (roomId: string, userId: string) => void;
  removeMember: (roomId: string, targetUserId: string, actorUserId: string) => void;
  assignRole: (roomId: string, targetUserId: string, role: RoomRole, actorUserId: string) => void;
  archiveRoom: (roomId: string, actorUserId: string) => void;
  deleteRoom: (roomId: string, actorUserId: string) => void;
  renameRoom: (roomId: string, name: string, actorUserId: string) => void;
  revokeInvite: (inviteId: string, actorUserId: string) => void;
  regenerateInvite: (roomId: string, actorUserId: string, expiry: InviteExpiry) => RoomInvite;

  startSharedJourney: (roomId: string, journeyId: string, userId: string) => RoomJourneyInvitation;
  joinJourneyInvitation: (invitationId: string, userId: string) => void;
  declineJourneyInvitation: (invitationId: string, userId: string) => void;

  addPost: (roomId: string, journeyId: string, stepId: string, userId: string, body: string) => void;
  removePost: (postId: string, actorUserId: string, roomId: string) => void;

  shareReflection: (userId: string, reflectionKey: string, roomId: string, journeyId: string, stepId: string) => void;
  revokeSharedReflection: (reflectionId: string, userId: string) => void;

  markNotificationRead: (notifId: string) => void;
  markAllNotificationsRead: (userId: string) => void;

  // Admin
  getAllRoomsForAdmin: () => Room[];
  adminArchiveRoom: (roomId: string) => void;
  adminRevokeInvite: (inviteId: string) => void;
  adminRemovePost: (postId: string) => void;
}

const RoomsContext = createContext<RoomsContextType | null>(null);

export function RoomsProvider({ children }: { children: React.ReactNode }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [journeyInvitations, setJourneyInvitations] = useState<RoomJourneyInvitation[]>([]);
  const [journeyParticipants, setJourneyParticipants] = useState<RoomJourneyParticipant[]>([]);
  const [posts, setPosts] = useState<RoomPost[]>([]);
  const [sharedReflections, setSharedReflections] = useState<SharedReflection[]>([]);
  const [notifications, setNotifications] = useState<RoomNotification[]>([]);

  useEffect(() => {
    setRooms(load(LS_KEYS.rooms, DEMO_ROOMS));
    setMembers(load(LS_KEYS.members, DEMO_ROOM_MEMBERS));
    setInvites(load(LS_KEYS.invites, DEMO_ROOM_INVITES));
    setJourneyInvitations(load(LS_KEYS.journeyInvitations, DEMO_ROOM_JOURNEY_INVITATIONS));
    setJourneyParticipants(load(LS_KEYS.journeyParticipants, DEMO_ROOM_JOURNEY_PARTICIPANTS));
    setPosts(load(LS_KEYS.posts, DEMO_ROOM_POSTS));
    setSharedReflections(load(LS_KEYS.sharedReflections, DEMO_SHARED_REFLECTIONS));
    setNotifications(load(LS_KEYS.notifications, DEMO_ROOM_NOTIFICATIONS));
  }, []);

  // ── Save helpers ───────────────────────────────────────────────────────
  const saveRooms = (next: Room[]) => { setRooms(next); save(LS_KEYS.rooms, next); };
  const saveMembers = (next: RoomMember[]) => { setMembers(next); save(LS_KEYS.members, next); };
  const saveInvites = (next: RoomInvite[]) => { setInvites(next); save(LS_KEYS.invites, next); };
  const saveJI = (next: RoomJourneyInvitation[]) => { setJourneyInvitations(next); save(LS_KEYS.journeyInvitations, next); };
  const saveJP = (next: RoomJourneyParticipant[]) => { setJourneyParticipants(next); save(LS_KEYS.journeyParticipants, next); };
  const savePosts = (next: RoomPost[]) => { setPosts(next); save(LS_KEYS.posts, next); };
  const saveSR = (next: SharedReflection[]) => { setSharedReflections(next); save(LS_KEYS.sharedReflections, next); };
  const saveNotifs = (next: RoomNotification[]) => { setNotifications(next); save(LS_KEYS.notifications, next); };

  // ── Query helpers ──────────────────────────────────────────────────────
  const getRoom = useCallback((id: string) => rooms.find(r => r.id === id), [rooms]);

  const getMyRooms = useCallback((userId: string) => {
    const myRoomIds = new Set(
      members.filter(m => m.userId === userId && m.status === 'active').map(m => m.roomId)
    );
    return rooms.filter(r => myRoomIds.has(r.id) && r.status === 'active');
  }, [rooms, members]);

  const getRoomMembers = useCallback((roomId: string) =>
    members.filter(m => m.roomId === roomId && m.status === 'active'),
    [members]
  );

  const getRoomInvite = useCallback((roomId: string) =>
    invites.find(i => i.roomId === roomId && !i.revokedAt),
    [invites]
  );

  const getMyMembership = useCallback((roomId: string, userId: string) =>
    members.find(m => m.roomId === roomId && m.userId === userId && m.status === 'active'),
    [members]
  );

  const canInvite = useCallback((roomId: string, userId: string) => {
    const m = members.find(mb => mb.roomId === roomId && mb.userId === userId && mb.status === 'active');
    return m?.role === 'Owner' || m?.role === 'Leader';
  }, [members]);

  const canManage = useCallback((roomId: string, userId: string) => {
    const m = members.find(mb => mb.roomId === roomId && mb.userId === userId && mb.status === 'active');
    return m?.role === 'Owner';
  }, [members]);

  const getJourneyInvitations = useCallback((roomId: string) =>
    journeyInvitations.filter(ji => ji.roomId === roomId),
    [journeyInvitations]
  );

  const getParticipants = useCallback((invitationId: string) =>
    journeyParticipants.filter(p => p.roomJourneyInvitationId === invitationId),
    [journeyParticipants]
  );

  const getMyParticipation = useCallback((invitationId: string, userId: string) =>
    journeyParticipants.find(p => p.roomJourneyInvitationId === invitationId && p.userId === userId),
    [journeyParticipants]
  );

  const getPendingJourneyInvitations = useCallback((roomId: string, userId: string) => {
    return journeyInvitations.filter(ji => {
      if (ji.roomId !== roomId || ji.status !== 'open') return false;
      const myParticipation = journeyParticipants.find(
        p => p.roomJourneyInvitationId === ji.id && p.userId === userId
      );
      return !myParticipation || myParticipation.participationStatus === 'pending';
    });
  }, [journeyInvitations, journeyParticipants]);

  const getPosts = useCallback((roomId: string, journeyId: string, stepId: string) =>
    posts
      .filter(p => p.roomId === roomId && p.journeyId === journeyId && p.journeyStepId === stepId && p.status === 'active')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [posts]
  );

  const getSharedReflections = useCallback((roomId: string, journeyId: string, stepId: string) =>
    sharedReflections.filter(sr =>
      sr.roomId === roomId && sr.journeyId === journeyId && sr.journeyStepId === stepId && !sr.revokedAt
    ),
    [sharedReflections]
  );

  const getMySharedReflection = useCallback((userId: string, reflectionKey: string, roomId: string) =>
    sharedReflections.find(sr => sr.userId === userId && sr.userReflectionKey === reflectionKey && sr.roomId === roomId && !sr.revokedAt),
    [sharedReflections]
  );

  const getMyNotifications = useCallback((userId: string) =>
    notifications
      .filter(n => n.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [notifications]
  );

  const getUnreadCount = useCallback((userId: string) =>
    notifications.filter(n => n.userId === userId && !n.read).length,
    [notifications]
  );

  const findInviteByToken = useCallback((token: string) =>
    invites.find(i => i.token === token && !i.revokedAt),
    [invites]
  );

  const findInviteByCode = useCallback((code: string) => {
    const upper = code.trim().toUpperCase();
    return invites.find(i => i.accessCode.toUpperCase() === upper && !i.revokedAt);
  }, [invites]);

  // ── Validate invite ────────────────────────────────────────────────────
  function validateInvite(invite: RoomInvite | undefined, userId: string, currentMembers: RoomMember[], currentRooms: Room[]): string | null {
    if (!invite) return 'This invitation is not valid.';
    if (invite.revokedAt) return 'This invitation has been revoked.';
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) return 'This invitation has expired.';
    const room = currentRooms.find(r => r.id === invite.roomId);
    if (!room || room.status !== 'active') return 'This Room no longer exists.';
    const alreadyMember = currentMembers.find(
      m => m.roomId === invite.roomId && m.userId === userId && m.status === 'active'
    );
    if (alreadyMember) return 'You are already a member of this Room.';
    return null;
  }

  // ── Mutations ──────────────────────────────────────────────────────────
  const createRoom = useCallback((userId: string, name: string, type: RoomType, expiry: InviteExpiry): Room => {
    const now = new Date().toISOString();
    const roomId = genId('room');
    const room: Room = { id: roomId, name, type, ownerId: userId, status: 'active', inviteExpiryDefault: expiry, createdAt: now, updatedAt: now };
    const member: RoomMember = { id: genId('rm'), roomId, userId, role: 'Owner', joinedAt: now, invitedBy: userId, status: 'active' };
    const invite: RoomInvite = {
      id: genId('inv'), roomId, token: genToken(), accessCode: genCode(),
      createdBy: userId, expiresAt: expiryDate(expiry), revokedAt: null,
      maxUses: null, useCount: 0, createdAt: now,
    };
    // Use functional updates to avoid stale closure
    setRooms(prev => { const next = [...prev, room]; save(LS_KEYS.rooms, next); return next; });
    setMembers(prev => { const next = [...prev, member]; save(LS_KEYS.members, next); return next; });
    setInvites(prev => { const next = [...prev, invite]; save(LS_KEYS.invites, next); return next; });
    return room;
  }, []);

  const _doJoin = useCallback((invite: RoomInvite, userId: string, currentRooms: Room[], currentMembers: RoomMember[]): { success: boolean; error?: string; room?: Room } => {
    const error = validateInvite(invite, userId, currentMembers, currentRooms);
    if (error) return { success: false, error };
    const room = currentRooms.find(r => r.id === invite.roomId)!;
    const now = new Date().toISOString();
    const member: RoomMember = { id: genId('rm'), roomId: invite.roomId, userId, role: 'Member', joinedAt: now, invitedBy: invite.createdBy, status: 'active' };
    setMembers(prev => { const next = [...prev, member]; save(LS_KEYS.members, next); return next; });
    setInvites(prev => { const next = prev.map(i => i.id === invite.id ? { ...i, useCount: i.useCount + 1 } : i); save(LS_KEYS.invites, next); return next; });
    // Notify room owner
    const notif: RoomNotification = {
      id: genId('notif'), userId: room.ownerId, type: 'room_accepted',
      roomId: room.id, fromUserId: userId,
      message: `Someone joined your Room: ${room.name}`,
      read: false, createdAt: now,
    };
    setNotifications(prev => { const next = [...prev, notif]; save(LS_KEYS.notifications, next); return next; });
    return { success: true, room };
  }, []);

  const joinRoomByCode = useCallback((userId: string, code: string) => {
    const upper = code.trim().toUpperCase();
    const invite = invites.find(i => i.accessCode.toUpperCase() === upper && !i.revokedAt);
    return _doJoin(invite as RoomInvite, userId, rooms, members);
  }, [invites, rooms, members, _doJoin]);

  const joinRoomByToken = useCallback((userId: string, token: string) => {
    const invite = invites.find(i => i.token === token && !i.revokedAt);
    return _doJoin(invite as RoomInvite, userId, rooms, members);
  }, [invites, rooms, members, _doJoin]);

  const leaveRoom = useCallback((roomId: string, userId: string) => {
    setMembers(prev => {
      const next = prev.map(m => m.roomId === roomId && m.userId === userId ? { ...m, status: 'left' as const } : m);
      save(LS_KEYS.members, next);
      return next;
    });
  }, []);

  const removeMember = useCallback((roomId: string, targetUserId: string, actorUserId: string) => {
    const actor = members.find(m => m.roomId === roomId && m.userId === actorUserId && m.status === 'active');
    if (!actor || (actor.role !== 'Owner' && actor.role !== 'Leader')) return;
    setMembers(prev => {
      const next = prev.map(m => m.roomId === roomId && m.userId === targetUserId ? { ...m, status: 'removed' as const } : m);
      save(LS_KEYS.members, next);
      return next;
    });
  }, [members]);

  const assignRole = useCallback((roomId: string, targetUserId: string, role: RoomRole, actorUserId: string) => {
    const actor = members.find(m => m.roomId === roomId && m.userId === actorUserId && m.status === 'active');
    if (!actor || actor.role !== 'Owner') return;
    setMembers(prev => {
      const next = prev.map(m => m.roomId === roomId && m.userId === targetUserId && m.status === 'active' ? { ...m, role } : m);
      save(LS_KEYS.members, next);
      return next;
    });
  }, [members]);

  const archiveRoom = useCallback((roomId: string, actorUserId: string) => {
    if (!canManage(roomId, actorUserId)) return;
    const now = new Date().toISOString();
    setRooms(prev => {
      const next = prev.map(r => r.id === roomId ? { ...r, status: 'archived' as const, archivedAt: now, updatedAt: now } : r);
      save(LS_KEYS.rooms, next);
      return next;
    });
  }, [canManage]);

  const deleteRoom = useCallback((roomId: string, actorUserId: string) => {
    if (!canManage(roomId, actorUserId)) return;
    const now = new Date().toISOString();
    setRooms(prev => {
      const next = prev.map(r => r.id === roomId ? { ...r, status: 'deleted' as const, archivedAt: now, updatedAt: now } : r);
      save(LS_KEYS.rooms, next);
      return next;
    });
    // Revoke all invites
    setInvites(prev => {
      const next = prev.map(i => i.roomId === roomId ? { ...i, revokedAt: now } : i);
      save(LS_KEYS.invites, next);
      return next;
    });
    // Mark all members as removed (preserves personal data)
    setMembers(prev => {
      const next = prev.map(m => m.roomId === roomId && m.status === 'active' ? { ...m, status: 'removed' as const } : m);
      save(LS_KEYS.members, next);
      return next;
    });
  }, [canManage]);

  const renameRoom = useCallback((roomId: string, name: string, actorUserId: string) => {
    if (!canManage(roomId, actorUserId)) return;
    setRooms(prev => {
      const next = prev.map(r => r.id === roomId ? { ...r, name, updatedAt: new Date().toISOString() } : r);
      save(LS_KEYS.rooms, next);
      return next;
    });
  }, [canManage]);

  const revokeInvite = useCallback((inviteId: string, actorUserId: string) => {
    setInvites(prev => {
      const invite = prev.find(i => i.id === inviteId);
      if (!invite) return prev;
      if (!canInvite(invite.roomId, actorUserId)) return prev;
      const next = prev.map(i => i.id === inviteId ? { ...i, revokedAt: new Date().toISOString() } : i);
      save(LS_KEYS.invites, next);
      return next;
    });
  }, [canInvite]);

  const regenerateInvite = useCallback((roomId: string, actorUserId: string, expiry: InviteExpiry): RoomInvite => {
    const now = new Date().toISOString();
    const newInvite: RoomInvite = {
      id: genId('inv'), roomId, token: genToken(), accessCode: genCode(),
      createdBy: actorUserId, expiresAt: expiryDate(expiry), revokedAt: null,
      maxUses: null, useCount: 0, createdAt: now,
    };
    setInvites(prev => {
      const next = [...prev.map(i => i.roomId === roomId ? { ...i, revokedAt: now } : i), newInvite];
      save(LS_KEYS.invites, next);
      return next;
    });
    return newInvite;
  }, []);

  const startSharedJourney = useCallback((roomId: string, journeyId: string, userId: string): RoomJourneyInvitation => {
    const now = new Date().toISOString();
    const invitation: RoomJourneyInvitation = {
      id: genId('rji'), roomId, journeyId, createdBy: userId,
      status: 'open', createdAt: now, closedAt: null,
    };
    // Creator auto-joins as a participant
    const participant: RoomJourneyParticipant = {
      id: genId('rjp'), roomJourneyInvitationId: invitation.id,
      roomId, journeyId, userId,
      userJourneyProgressId: journeyId, // personal progress key
      participationStatus: 'joined', joinedAt: now,
    };
    setJourneyInvitations(prev => { const next = [...prev, invitation]; save(LS_KEYS.journeyInvitations, next); return next; });
    setJourneyParticipants(prev => { const next = [...prev, participant]; save(LS_KEYS.journeyParticipants, next); return next; });

    // Notify all other active room members
    const roomMembers = members.filter(m => m.roomId === roomId && m.status === 'active' && m.userId !== userId);
    const newNotifs: RoomNotification[] = roomMembers.map(m => ({
      id: genId('notif'), userId: m.userId, type: 'journey_invite' as const,
      roomId, journeyId, fromUserId: userId,
      message: `Someone has invited the room to begin a shared journey`,
      read: false, createdAt: now,
    }));
    if (newNotifs.length > 0) {
      setNotifications(prev => { const next = [...prev, ...newNotifs]; save(LS_KEYS.notifications, next); return next; });
    }
    return invitation;
  }, [members]);

  const joinJourneyInvitation = useCallback((invitationId: string, userId: string) => {
    const invitation = journeyInvitations.find(ji => ji.id === invitationId);
    if (!invitation) return;
    const existing = journeyParticipants.find(p => p.roomJourneyInvitationId === invitationId && p.userId === userId);
    if (existing && existing.participationStatus === 'joined') return;
    const now = new Date().toISOString();
    if (existing) {
      setJourneyParticipants(prev => {
        const next = prev.map(p => p.id === existing.id ? { ...p, participationStatus: 'joined' as const, joinedAt: now } : p);
        save(LS_KEYS.journeyParticipants, next);
        return next;
      });
    } else {
      const participant: RoomJourneyParticipant = {
        id: genId('rjp'), roomJourneyInvitationId: invitationId,
        roomId: invitation.roomId, journeyId: invitation.journeyId, userId,
        userJourneyProgressId: invitation.journeyId,
        participationStatus: 'joined', joinedAt: now,
      };
      setJourneyParticipants(prev => { const next = [...prev, participant]; save(LS_KEYS.journeyParticipants, next); return next; });
    }
  }, [journeyInvitations, journeyParticipants]);

  const declineJourneyInvitation = useCallback((invitationId: string, userId: string) => {
    const existing = journeyParticipants.find(p => p.roomJourneyInvitationId === invitationId && p.userId === userId);
    if (existing) {
      setJourneyParticipants(prev => {
        const next = prev.map(p => p.id === existing.id ? { ...p, participationStatus: 'declined' as const } : p);
        save(LS_KEYS.journeyParticipants, next);
        return next;
      });
    } else {
      const invitation = journeyInvitations.find(ji => ji.id === invitationId);
      if (!invitation) return;
      const participant: RoomJourneyParticipant = {
        id: genId('rjp'), roomJourneyInvitationId: invitationId,
        roomId: invitation.roomId, journeyId: invitation.journeyId, userId,
        userJourneyProgressId: invitation.journeyId,
        participationStatus: 'declined', joinedAt: null,
      };
      setJourneyParticipants(prev => { const next = [...prev, participant]; save(LS_KEYS.journeyParticipants, next); return next; });
    }
  }, [journeyParticipants, journeyInvitations]);

  const addPost = useCallback((roomId: string, journeyId: string, stepId: string, userId: string, body: string) => {
    const now = new Date().toISOString();
    const post: RoomPost = { id: genId('post'), roomId, journeyId, journeyStepId: stepId, userId, body: body.trim(), status: 'active', createdAt: now, updatedAt: now };
    setPosts(prev => { const next = [...prev, post]; save(LS_KEYS.posts, next); return next; });
  }, []);

  const removePost = useCallback((postId: string, actorUserId: string, roomId: string) => {
    const actor = members.find(m => m.roomId === roomId && m.userId === actorUserId && m.status === 'active');
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    // Own post, or Owner/Leader can remove
    const canRemove = post.userId === actorUserId || (actor && (actor.role === 'Owner' || actor.role === 'Leader'));
    if (!canRemove) return;
    setPosts(prev => {
      const next = prev.map(p => p.id === postId ? { ...p, status: 'removed' as const } : p);
      save(LS_KEYS.posts, next);
      return next;
    });
  }, [members, posts]);

  const shareReflection = useCallback((userId: string, reflectionKey: string, roomId: string, journeyId: string, stepId: string) => {
    const already = sharedReflections.find(sr => sr.userId === userId && sr.userReflectionKey === reflectionKey && sr.roomId === roomId && !sr.revokedAt);
    if (already) return;
    const now = new Date().toISOString();
    const sr: SharedReflection = { id: genId('sr'), userReflectionKey: reflectionKey, roomId, journeyId, journeyStepId: stepId, userId, sharedAt: now, revokedAt: null };
    setSharedReflections(prev => { const next = [...prev, sr]; save(LS_KEYS.sharedReflections, next); return next; });
    // Notify room members
    const roomMembers = members.filter(m => m.roomId === roomId && m.status === 'active' && m.userId !== userId);
    const newNotifs: RoomNotification[] = roomMembers.map(m => ({
      id: genId('notif'), userId: m.userId, type: 'reflection_shared' as const,
      roomId, journeyId, fromUserId: userId,
      message: `Someone shared a reflection in your Room`,
      read: false, createdAt: now,
    }));
    if (newNotifs.length > 0) {
      setNotifications(prev => { const next = [...prev, ...newNotifs]; save(LS_KEYS.notifications, next); return next; });
    }
  }, [sharedReflections, members]);

  const revokeSharedReflection = useCallback((reflectionId: string, userId: string) => {
    setSharedReflections(prev => {
      const next = prev.map(sr => sr.id === reflectionId && sr.userId === userId ? { ...sr, revokedAt: new Date().toISOString() } : sr);
      save(LS_KEYS.sharedReflections, next);
      return next;
    });
  }, []);

  const markNotificationRead = useCallback((notifId: string) => {
    setNotifications(prev => {
      const next = prev.map(n => n.id === notifId ? { ...n, read: true } : n);
      save(LS_KEYS.notifications, next);
      return next;
    });
  }, []);

  const markAllNotificationsRead = useCallback((userId: string) => {
    setNotifications(prev => {
      const next = prev.map(n => n.userId === userId ? { ...n, read: true } : n);
      save(LS_KEYS.notifications, next);
      return next;
    });
  }, []);

  // ── Admin operations ───────────────────────────────────────────────────
  const getAllRoomsForAdmin = useCallback(() => rooms, [rooms]);

  const adminArchiveRoom = useCallback((roomId: string) => {
    const now = new Date().toISOString();
    setRooms(prev => {
      const next = prev.map(r => r.id === roomId ? { ...r, status: 'archived' as const, archivedAt: now, updatedAt: now } : r);
      save(LS_KEYS.rooms, next);
      return next;
    });
  }, []);

  const adminRevokeInvite = useCallback((inviteId: string) => {
    setInvites(prev => {
      const next = prev.map(i => i.id === inviteId ? { ...i, revokedAt: new Date().toISOString() } : i);
      save(LS_KEYS.invites, next);
      return next;
    });
  }, []);

  const adminRemovePost = useCallback((postId: string) => {
    setPosts(prev => {
      const next = prev.map(p => p.id === postId ? { ...p, status: 'removed' as const } : p);
      save(LS_KEYS.posts, next);
      return next;
    });
  }, []);

  const value: RoomsContextType = {
    rooms, members, invites, journeyInvitations, journeyParticipants,
    posts, sharedReflections, notifications,
    getRoom, getMyRooms, getRoomMembers, getRoomInvite,
    canInvite, canManage, getMyMembership,
    getJourneyInvitations, getParticipants, getMyParticipation, getPendingJourneyInvitations,
    getPosts, getSharedReflections, getMySharedReflection,
    getMyNotifications, getUnreadCount,
    findInviteByToken, findInviteByCode,
    createRoom, joinRoomByCode, joinRoomByToken,
    leaveRoom, removeMember, assignRole,
    archiveRoom, deleteRoom, renameRoom, revokeInvite, regenerateInvite,
    startSharedJourney, joinJourneyInvitation, declineJourneyInvitation,
    addPost, removePost,
    shareReflection, revokeSharedReflection,
    markNotificationRead, markAllNotificationsRead,
    getAllRoomsForAdmin, adminArchiveRoom, adminRevokeInvite, adminRemovePost,
  };

  return <RoomsContext.Provider value={value}>{children}</RoomsContext.Provider>;
}

export function useRooms() {
  const ctx = useContext(RoomsContext);
  if (!ctx) throw new Error('useRooms must be used within RoomsProvider');
  return ctx;
}
