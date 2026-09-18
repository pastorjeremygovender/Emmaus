/**
 * YouTube Data API v3 Client
 *
 * Official YouTube Data API only — no unofficial scraping, no timedtext endpoint.
 * API key is used for public data (channel, videos, playlists).
 * OAuth access token is required for caption operations on owned videos.
 *
 * Env:
 *   YOUTUBE_API_KEY     — required for channel/video discovery
 *   YOUTUBE_CHANNEL_ID  — the church channel to sync
 */

import { logger } from "./logger.js";
import { getCanonicalPublicOrigin } from "./public-origin.js";

const API_BASE = "https://www.googleapis.com/youtube/v3";

// ─── Config ───────────────────────────────────────────────────────────────────

export function getYoutubeConfig() {
  const apiKey = process.env.YOUTUBE_API_KEY;
  const channelId = process.env.YOUTUBE_CHANNEL_ID;
  return {
    apiKey: apiKey ?? null,
    channelId: channelId ?? null,
    configured: !!(apiKey && channelId),
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function ytFetch<T>(
  path: string,
  params: Record<string, string>,
  accessToken?: string,
): Promise<T> {
  const { apiKey } = getYoutubeConfig();
  const url = new URL(`${API_BASE}${path}`);

  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  // Add API key for non-OAuth requests
  if (!accessToken && apiKey) {
    url.searchParams.set("key", apiKey);
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(url.toString(), { headers });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${res.status} for ${path}: ${body.slice(0, 300)}`);
  }

  return res.json() as Promise<T>;
}

// ─── Duration parsing ─────────────────────────────────────────────────────────

/**
 * Parse ISO 8601 duration (PT1H2M3S) to total seconds.
 */
export function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? "0") * 3600) +
    (parseInt(m[2] ?? "0") * 60) +
    parseInt(m[3] ?? "0");
}

// ─── Channel ──────────────────────────────────────────────────────────────────

interface ChannelResponse {
  items?: Array<{
    id: string;
    contentDetails: { relatedPlaylists: { uploads: string } };
    snippet: { title: string; description: string; thumbnails: Record<string, { url: string }> };
    statistics: { videoCount: string };
  }>;
}

export interface ChannelInfo {
  channelId: string;
  title: string;
  uploadsPlaylistId: string;
  videoCount: number;
  thumbnailUrl: string;
}

export async function getChannelInfo(channelId: string): Promise<ChannelInfo> {
  const data = await ytFetch<ChannelResponse>("/channels", {
    part: "snippet,contentDetails,statistics",
    id: channelId,
    maxResults: "1",
  });

  const item = data.items?.[0];
  if (!item) {
    throw new Error(`Channel not found: ${channelId}`);
  }

  return {
    channelId: item.id,
    title: item.snippet.title,
    uploadsPlaylistId: item.contentDetails.relatedPlaylists.uploads,
    videoCount: parseInt(item.statistics.videoCount ?? "0"),
    thumbnailUrl: item.snippet.thumbnails?.default?.url ?? "",
  };
}

// ─── Playlist enumeration ─────────────────────────────────────────────────────

interface PlaylistItemsResponse {
  nextPageToken?: string;
  pageInfo: { totalResults: number; resultsPerPage: number };
  items?: Array<{
    snippet: {
      resourceId: { videoId: string };
      publishedAt: string;
      title: string;
    };
  }>;
}

export interface PlaylistVideoRef {
  videoId: string;
  publishedAt: string;
}

/**
 * Enumerate all video IDs from a playlist, paginating until complete.
 * Returns newest-first (YouTube default).
 */
export async function getPlaylistVideoIds(
  playlistId: string,
  maxVideos = 500,
): Promise<PlaylistVideoRef[]> {
  const results: PlaylistVideoRef[] = [];
  let pageToken: string | undefined;

  do {
    const params: Record<string, string> = {
      part: "snippet",
      playlistId,
      maxResults: "50",
    };
    if (pageToken) params.pageToken = pageToken;

    const data = await ytFetch<PlaylistItemsResponse>("/playlistItems", params);

    for (const item of data.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;
      if (videoId) {
        results.push({ videoId, publishedAt: item.snippet.publishedAt });
      }
      if (results.length >= maxVideos) break;
    }

    pageToken = data.nextPageToken;
    logger.info({ fetched: results.length, nextPage: !!pageToken }, "YouTube playlist page fetched");

  } while (pageToken && results.length < maxVideos);

  return results;
}

// ─── Video metadata ───────────────────────────────────────────────────────────

interface VideoListResponse {
  items?: Array<{
    id: string;
    snippet: {
      title: string;
      description: string;
      publishedAt: string;
      channelId: string;
      thumbnails: Record<string, { url: string; width: number; height: number }>;
    };
    contentDetails: { duration: string };
    status: { privacyStatus: string };
  }>;
}

export interface YoutubeVideoMetadata {
  videoId: string;
  youtubeUrl: string;
  title: string;
  description: string;
  publishedAt: string;
  channelId: string;
  durationSeconds: number;
  thumbnailUrl: string;
  privacyStatus: string;
}

/**
 * Fetch full metadata for up to 50 video IDs at once.
 */
export async function getVideoMetadata(
  videoIds: string[],
): Promise<YoutubeVideoMetadata[]> {
  if (videoIds.length === 0) return [];
  // YouTube Videos.list max 50 per request
  const batch = videoIds.slice(0, 50);

  const data = await ytFetch<VideoListResponse>("/videos", {
    part: "snippet,contentDetails,status",
    id: batch.join(","),
    maxResults: "50",
  });

  return (data.items ?? []).map((item) => {
    const thumbs = item.snippet.thumbnails;
    const thumbnailUrl =
      thumbs?.maxres?.url ??
      thumbs?.high?.url ??
      thumbs?.medium?.url ??
      thumbs?.default?.url ??
      "";

    return {
      videoId: item.id,
      youtubeUrl: `https://www.youtube.com/watch?v=${item.id}`,
      title: item.snippet.title,
      description: item.snippet.description,
      publishedAt: item.snippet.publishedAt,
      channelId: item.snippet.channelId,
      durationSeconds: parseDuration(item.contentDetails.duration),
      thumbnailUrl,
      privacyStatus: item.status?.privacyStatus ?? "unknown",
    };
  });
}

// ─── Captions ─────────────────────────────────────────────────────────────────

interface CaptionsListResponse {
  items?: Array<{
    id: string;
    snippet: {
      videoId: string;
      lastUpdated: string;
      trackKind: string;      // "standard" | "asr" | "forced"
      language: string;
      name: string;
      audioTrackType: string;
      isCC: boolean;
      isLarge: boolean;
      isEasyReader: boolean;
      isDraft: boolean;
      isAutoSynced: boolean;
      status: string;
    };
  }>;
}

export interface CaptionTrack {
  id: string;
  language: string;
  name: string;
  trackKind: string;  // "standard" | "asr"
  isDraft: boolean;
}

/**
 * List caption tracks for a video — requires OAuth access token.
 * The channel owner must have authorized the app.
 */
export async function listCaptionTracks(
  videoId: string,
  accessToken: string,
): Promise<CaptionTrack[]> {
  const data = await ytFetch<CaptionsListResponse>(
    "/captions",
    { part: "snippet", videoId },
    accessToken,
  );

  return (data.items ?? []).map((item) => ({
    id: item.id,
    language: item.snippet.language,
    name: item.snippet.name,
    trackKind: item.snippet.trackKind,
    isDraft: item.snippet.isDraft,
  }));
}

/**
 * Download a caption track as VTT text — requires OAuth access token.
 * Returns the raw VTT string. tfmt=vtt gives WebVTT format with timestamps.
 */
export async function downloadCaptionTrack(
  captionId: string,
  accessToken: string,
): Promise<string> {
  const url = new URL(`${API_BASE}/captions/${captionId}`);
  url.searchParams.set("tfmt", "vtt");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Caption download failed (${res.status}): ${body.slice(0, 200)}`);
  }

  return res.text();
}

// ─── OAuth helpers ────────────────────────────────────────────────────────────

const OAUTH_BASE = "https://oauth2.googleapis.com";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/youtube.readonly",
].join(" ");

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getOAuthConfig(): OAuthConfig | null {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  const configuredRedirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim();
  const redirectUri = process.env.NODE_ENV === "production"
    ? `${getCanonicalPublicOrigin()}/api/youtube-archive/oauth/callback`
    : configuredRedirectUri;
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function buildOAuthUrl(config: OAuthConfig, state: string): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export async function exchangeCodeForTokens(
  code: string,
  config: OAuthConfig,
): Promise<TokenResponse> {
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${body.slice(0, 200)}`);
  }

  return res.json() as Promise<TokenResponse>;
}

export async function refreshAccessToken(
  refreshToken: string,
  config: OAuthConfig,
): Promise<{ accessToken: string; expiresAt: number }> {
  const res = await fetch(`${OAUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in: number };
  return {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000 - 30_000,
  };
}
