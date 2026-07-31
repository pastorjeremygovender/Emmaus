/**
 * RoomsContext — API-backed Rooms state.
 *
 * Replaces the localStorage prototype. All data comes from the live API.
 * Rooms are loaded automatically when the user authenticates.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  apiGetRooms,
  apiGetRoomById,
  apiCreateRoom,
  apiJoinByCode,
  apiJoinByToken,
  apiStartShared,
  apiLeaveRoom,
  apiDeleteRoom,
  apiTransferAdmin,
  apiRemoveMember,
} from '../lib/rooms-api';
import type { RoomSummary, RoomDetail, RoomMember, RoomRole } from '../lib/rooms-types';

// ─── Context type ──────────────────────────────────────────────────────────

interface RoomsContextType {
  // State
  rooms: RoomSummary[];
  loading: boolean;
  error: string | null;

  // Reload
  loadRooms: () => Promise<void>;

  // Room detail (loads & caches per-room on demand)
  loadRoomDetail: (roomId: string) => Promise<RoomDetail | null>;
  getRoomDetail: (roomId: string) => RoomDetail | null;

  // Accessors (derived from loaded state)
  getRoom: (id: string) => RoomSummary | undefined;
  /** Returns the user's rooms — argument is accepted for backward compat but ignored */
  getMyRooms: (userId?: string) => RoomSummary[];
  getRoomMembers: (roomId: string) => RoomMember[];
  canManage: (roomId: string, userId: string) => boolean;
  canInvite: (roomId: string, userId: string) => boolean;
  getMyMembership: (roomId: string, userId: string) => { role: RoomRole } | undefined;

  // Mutations
  createRoom: (userId: string, name: string, description?: string) => Promise<{ roomId: string; inviteCode: string; inviteToken: string }>;
  joinRoomByCode: (userId: string, code: string) => Promise<{ success: boolean; error?: string; roomId?: string }>;
  joinRoomByToken: (userId: string, token: string) => Promise<{ success: boolean; error?: string; roomId?: string }>;
  leaveRoom: (roomId: string, userId: string) => Promise<void>;
  deleteRoom: (roomId: string, userId: string) => Promise<void>;
  transferAdmin: (roomId: string, toUserId: string, userId: string) => Promise<void>;
  removeMember: (roomId: string, targetUserId: string, userId: string) => Promise<void>;

  // Stubs — journey/notification/post features planned for later tasks
  getUnreadCount: (userId?: string) => number;
  getMyNotifications: (userId?: string) => never[];
  markAllNotificationsRead: (userId?: string) => void;
  getJourneyInvitations: (roomId: string) => never[];
  getParticipants: (invitationId: string) => never[];
  getMyParticipation: (invitationId: string, userId: string) => undefined;
  getPendingJourneyInvitations: (roomId: string, userId: string) => never[];
  getPosts: (roomId: string, journeyId: string, stepId: string) => never[];
  getSharedReflections: (roomId: string, journeyId: string, stepId: string) => never[];
  getMySharedReflection: (userId: string, reflectionKey: string, roomId: string) => undefined;
  startSharedJourney: (roomId: string, journeyId: string, userId: string) => Promise<void>;
  joinJourneyInvitation: (invitationId: string, userId: string) => void;
  declineJourneyInvitation: (invitationId: string, userId: string) => void;
  addPost: (roomId: string, journeyId: string, stepId: string, userId: string, body: string) => void;
  removePost: (postId: string, actorUserId: string, roomId: string) => void;
  shareReflection: (userId: string, reflectionKey: string, roomId: string, journeyId: string, stepId: string) => void;
  revokeSharedReflection: (reflectionId: string, userId: string) => void;
  getAllRoomsForAdmin: () => RoomSummary[];
  adminArchiveRoom: (roomId: string) => void;
  adminRevokeInvite: (inviteId: string) => void;
  adminRemovePost: (postId: string) => void;
  journeyInvitations: never[];
  journeyParticipants: never[];
  invites: never[];
  posts: never[];
  sharedReflections: never[];
  notifications: never[];
}

const RoomsContext = createContext<RoomsContextType | null>(null);

export function RoomsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();

  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-room detail cache: roomId → RoomDetail
  const [detailCache, setDetailCache] = useState<Record<string, RoomDetail>>({});

  // ── Auto-load rooms when user signs in ──────────────────────────────────
  const loadRooms = useCallback(async () => {
    if (!user) { setRooms([]); return; }
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetRooms(user.id);
      setRooms(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadRooms();
  }, [loadRooms]);

  // ── Room detail ──────────────────────────────────────────────────────────
  const loadRoomDetail = useCallback(async (roomId: string): Promise<RoomDetail | null> => {
    if (!user) return null;
    try {
      const res = await apiGetRoomById(user.id, roomId);
      if (!res) return null;
      const detail: RoomDetail = { ...res.room, currentUserRole: res.currentUserRole };
      setDetailCache(prev => ({ ...prev, [roomId]: detail }));
      return detail;
    } catch {
      return null;
    }
  }, [user]);

  const getRoomDetail = useCallback((roomId: string): RoomDetail | null => {
    return detailCache[roomId] ?? null;
  }, [detailCache]);

  // ── Accessors ────────────────────────────────────────────────────────────
  const getRoom = useCallback((id: string) => rooms.find(r => r.id === id), [rooms]);
  const getMyRooms = useCallback((_userId?: string) => rooms, [rooms]);

  const getRoomMembers = useCallback((roomId: string): RoomMember[] => {
    return detailCache[roomId]?.members ?? [];
  }, [detailCache]);

  const canManage = useCallback((roomId: string, userId: string): boolean => {
    const detail = detailCache[roomId];
    if (!detail) return false;
    const member = detail.members.find(m => m.userId === userId);
    return member?.role === 'admin';
  }, [detailCache]);

  const canInvite = useCallback((roomId: string, userId: string): boolean => {
    return canManage(roomId, userId);
  }, [canManage]);

  const getMyMembership = useCallback(
    (roomId: string, userId: string): { role: RoomRole } | undefined => {
      const detail = detailCache[roomId];
      if (detail) {
        const member = detail.members.find(m => m.userId === userId);
        if (member) return { role: member.role };
      }
      // Fall back to currentUserRole if this is the current user
      if (user && userId === user.id && detailCache[roomId]) {
        return { role: detailCache[roomId].currentUserRole };
      }
      return undefined;
    },
    [detailCache, user]
  );

  // ── Mutations ────────────────────────────────────────────────────────────
  const createRoom = useCallback(async (userId: string, name: string, description = "") => {
    const result = await apiCreateRoom(userId, name, description);
    await loadRooms();
    return result;
  }, [loadRooms]);

  const joinRoomByCode = useCallback(async (userId: string, code: string) => {
    try {
      const result = await apiJoinByCode(userId, code);
      await loadRooms();
      return { success: true, roomId: result.roomId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Failed to join room' };
    }
  }, [loadRooms]);

  const joinRoomByToken = useCallback(async (userId: string, token: string) => {
    try {
      const result = await apiJoinByToken(userId, token);
      await loadRooms();
      return { success: true, roomId: result.roomId };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Invalid invite link' };
    }
  }, [loadRooms]);

  const leaveRoom = useCallback(async (roomId: string, userId: string) => {
    await apiLeaveRoom(userId, roomId);
    setRooms(prev => prev.filter(r => r.id !== roomId));
    setDetailCache(prev => { const next = { ...prev }; delete next[roomId]; return next; });
  }, []);

  const deleteRoom = useCallback(async (roomId: string, userId: string) => {
    await apiDeleteRoom(userId, roomId);
    setRooms(prev => prev.filter(r => r.id !== roomId));
    setDetailCache(prev => { const next = { ...prev }; delete next[roomId]; return next; });
  }, []);

  const transferAdmin = useCallback(async (roomId: string, toUserId: string, userId: string) => {
    await apiTransferAdmin(userId, roomId, toUserId);
    // Invalidate cached detail so next load reflects updated roles
    setDetailCache(prev => { const next = { ...prev }; delete next[roomId]; return next; });
  }, []);

  const removeMember = useCallback(async (roomId: string, targetUserId: string, userId: string) => {
    await apiRemoveMember(userId, roomId, targetUserId);
    // Update cached detail optimistically
    setDetailCache(prev => {
      const detail = prev[roomId];
      if (!detail) return prev;
      return {
        ...prev,
        [roomId]: {
          ...detail,
          members: detail.members.filter(m => m.userId !== targetUserId),
          memberCount: detail.memberCount - 1,
        },
      };
    });
  }, []);

  // ── Stubs ─────────────────────────────────────────────────────────────────
  const getUnreadCount = useCallback(() => 0, []);
  const getMyNotifications = useCallback(() => [] as never[], []);
  const markAllNotificationsRead = useCallback(() => {}, []);
  const getJourneyInvitations = useCallback(() => [] as never[], []);
  const getParticipants = useCallback(() => [] as never[], []);
  const getMyParticipation = useCallback(() => undefined, []);
  const getPendingJourneyInvitations = useCallback(() => [] as never[], []);
  const getPosts = useCallback(() => [] as never[], []);
  const getSharedReflections = useCallback(() => [] as never[], []);
  const getMySharedReflection = useCallback(() => undefined, []);
  const startSharedJourney = useCallback(async (roomId: string, journeyId: string, userId: string) => {
    // RM-2: use the atomic start-shared endpoint so progress is initialised
    // server-side in a single transaction, not a bare link call that can diverge.
    await apiStartShared(userId, { journeyId, roomId });
    // Invalidate cached detail so next load re-fetches with the linked journey
    setDetailCache(prev => {
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
  }, []);
  const joinJourneyInvitation = useCallback(() => {}, []);
  const declineJourneyInvitation = useCallback(() => {}, []);
  const addPost = useCallback(() => {}, []);
  const removePost = useCallback(() => {}, []);
  const shareReflection = useCallback(() => {}, []);
  const revokeSharedReflection = useCallback(() => {}, []);
  const getAllRoomsForAdmin = useCallback(() => rooms, [rooms]);
  const adminArchiveRoom = useCallback(() => {}, []);
  const adminRevokeInvite = useCallback(() => {}, []);
  const adminRemovePost = useCallback(() => {}, []);

  return (
    <RoomsContext.Provider value={{
      rooms,
      loading,
      error,
      loadRooms,
      loadRoomDetail,
      getRoomDetail,
      getRoom,
      getMyRooms,
      getRoomMembers,
      canManage,
      canInvite,
      getMyMembership,
      createRoom,
      joinRoomByCode,
      joinRoomByToken,
      leaveRoom,
      deleteRoom,
      transferAdmin,
      removeMember,
      getUnreadCount,
      getMyNotifications,
      markAllNotificationsRead,
      getJourneyInvitations,
      getParticipants,
      getMyParticipation,
      getPendingJourneyInvitations,
      getPosts,
      getSharedReflections,
      getMySharedReflection,
      startSharedJourney,
      joinJourneyInvitation,
      declineJourneyInvitation,
      addPost,
      removePost,
      shareReflection,
      revokeSharedReflection,
      getAllRoomsForAdmin,
      adminArchiveRoom,
      adminRevokeInvite,
      adminRemovePost,
      journeyInvitations: [],
      journeyParticipants: [],
      invites: [],
      posts: [],
      sharedReflections: [],
      notifications: [],
    }}>
      {children}
    </RoomsContext.Provider>
  );
}

export function useRooms(): RoomsContextType {
  const ctx = useContext(RoomsContext);
  if (!ctx) throw new Error('useRooms must be used inside RoomsProvider');
  return ctx;
}
