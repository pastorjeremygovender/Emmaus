/**
 * livekit.ts — LiveKit Cloud adapter for Emmaus Rooms.
 *
 * Secrets required (Replit Secrets):
 *   LIVEKIT_URL        e.g. wss://your-project.livekit.cloud
 *   LIVEKIT_API_KEY    from LiveKit Cloud → Settings → Keys
 *   LIVEKIT_API_SECRET from LiveKit Cloud → Settings → Keys (never sent to browser)
 *
 * All functions return early with a descriptive error when secrets are absent
 * so the app runs cleanly without credentials configured yet.
 */

import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

// ─── Config ───────────────────────────────────────────────────────────────────

export function getLiveKitConfig(): {
  url: string;
  apiKey: string;
  apiSecret: string;
} | null {
  const url = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!url || !apiKey || !apiSecret) return null;
  return { url, apiKey, apiSecret };
}

export function isLiveKitConfigured(): boolean {
  return getLiveKitConfig() !== null;
}

/** Safe admin-facing configuration summary; never returns credential values. */
export function getLiveKitConfigurationStatus(): {
  configured: boolean;
  missingSecrets: string[];
} {
  const requiredSecrets = ["LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"];
  const missingSecrets = requiredSecrets.filter((name) => !process.env[name]);
  return {
    configured: missingSecrets.length === 0,
    missingSecrets,
  };
}

/** The WebSocket URL that is safe to expose to the browser (no secrets). */
export function getLiveKitUrl(): string | null {
  return process.env.LIVEKIT_URL ?? null;
}

// ─── Token issuing ─────────────────────────────────────────────────────────

export interface TokenGrant {
  /** LiveKit room name (not Emmaus room id). */
  roomName: string;
  /** Stable identity for the participant (Emmaus userId). */
  identity: string;
  /** Display name shown in the video UI. */
  displayName: string;
  /** Whether this participant can publish tracks. All authorised members can publish. */
  canPublish?: boolean;
  /** Whether this participant can subscribe to others' tracks. */
  canSubscribe?: boolean;
  /** Whether this participant can update their own LiveKit name/metadata/attributes. */
  canUpdateOwnMetadata?: boolean;
  /** Whether this participant has room-admin privileges inside LiveKit. */
  roomAdmin?: boolean;
}

/**
 * Issue a signed LiveKit access token.
 * Token TTL: 4 hours (long enough for any service, auto-expired by LiveKit).
 */
export async function createLiveKitToken(grant: TokenGrant): Promise<string> {
  const cfg = getLiveKitConfig();
  if (!cfg) throw new Error("LiveKit is not configured on this server.");

  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: grant.identity,
    name: grant.displayName,
    ttl: "4h",
  });

  token.addGrant({
    roomJoin: true,
    room: grant.roomName,
    canPublish: grant.canPublish ?? true,
    canSubscribe: grant.canSubscribe ?? true,
    canUpdateOwnMetadata: grant.canUpdateOwnMetadata ?? false,
    canPublishData: grant.roomAdmin ?? false,
    roomAdmin: grant.roomAdmin ?? false,
  });

  return token.toJwt();
}

// ─── Room management ───────────────────────────────────────────────────────

function getRoomServiceClient(): RoomServiceClient {
  const cfg = getLiveKitConfig();
  if (!cfg) throw new Error("LiveKit is not configured on this server.");
  // RoomServiceClient expects https:// not wss://
  const httpUrl = cfg.url.replace(/^wss?:\/\//, "https://");
  return new RoomServiceClient(httpUrl, cfg.apiKey, cfg.apiSecret);
}

/**
 * Ensure a LiveKit room exists (creates if absent, no-op if already present).
 * @param roomName  The LiveKit room name (e.g. `emmaus-${roomId}`).
 * @param emptyTimeout  Seconds before LiveKit auto-closes an empty room (default 5 min).
 */
export async function ensureLiveKitRoom(
  roomName: string,
  emptyTimeout = 300
): Promise<void> {
  const client = getRoomServiceClient();
  await client.createRoom({ name: roomName, emptyTimeout });
}

/**
 * End a LiveKit room — all participants are disconnected immediately.
 * Safe to call even if the room no longer exists (LiveKit returns 404, we ignore it).
 */
export async function deleteLiveKitRoom(roomName: string): Promise<void> {
  const client = getRoomServiceClient();
  try {
    await client.deleteRoom(roomName);
  } catch {
    /* Room may already be gone — not fatal */
  }
}

/**
 * Count participants currently in a LiveKit room.
 * Returns 0 if LiveKit is not configured or the room doesn't exist.
 */
export async function getLiveKitParticipantCount(
  roomName: string
): Promise<number> {
  try {
    const client = getRoomServiceClient();
    const participants = await client.listParticipants(roomName);
    return participants.length;
  } catch {
    return 0;
  }
}
